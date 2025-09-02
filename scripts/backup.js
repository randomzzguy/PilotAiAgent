#!/usr/bin/env node

/**
 * LinkedIn Automation System - Backup Script
 * 
 * This script provides comprehensive backup capabilities for the LinkedIn automation system.
 * It handles database backups, file backups, and configuration backups.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const archiver = require('archiver');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

class BackupManager {
  constructor() {
    this.projectRoot = path.resolve(__dirname, '..');
    this.backupDir = path.join(this.projectRoot, 'backups');
    this.timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0] + '_' + 
                    new Date().toISOString().replace(/[:.]/g, '-').split('T')[1].split('.')[0];
  }

  async backup() {
    console.log('💾 LinkedIn Automation System - Backup Manager\n');
    
    try {
      // Ensure backup directory exists
      this.ensureBackupDirectory();
      
      // Select backup type
      const backupType = await this.selectBackupType();
      
      // Execute backup
      await this.executeBackup(backupType);
      
      console.log('\n✅ Backup completed successfully!');
      console.log(`📁 Backup location: ${this.backupDir}`);
      
    } catch (error) {
      console.error('\n❌ Backup failed:', error.message);
      process.exit(1);
    } finally {
      rl.close();
    }
  }

  async restore() {
    console.log('🔄 LinkedIn Automation System - Restore Manager\n');
    
    try {
      // List available backups
      const backups = await this.listBackups();
      
      if (backups.length === 0) {
        throw new Error('No backups found');
      }
      
      // Select backup to restore
      const selectedBackup = await this.selectBackup(backups);
      
      // Confirm restore
      const confirm = await this.askQuestion('⚠️  This will overwrite current data. Continue? (y/N): ');
      if (confirm.toLowerCase() !== 'y') {
        console.log('Restore cancelled.');
        return;
      }
      
      // Execute restore
      await this.executeRestore(selectedBackup);
      
      console.log('\n✅ Restore completed successfully!');
      
    } catch (error) {
      console.error('\n❌ Restore failed:', error.message);
      process.exit(1);
    } finally {
      rl.close();
    }
  }

  ensureBackupDirectory() {
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
      console.log(`📁 Created backup directory: ${this.backupDir}`);
    }
  }

  async selectBackupType() {
    console.log('📦 Select backup type:');
    console.log('  1. Full backup (Database + Files + Configuration)');
    console.log('  2. Database only');
    console.log('  3. Files only (uploads, logs)');
    console.log('  4. Configuration only (.env, configs)');
    console.log('  5. Custom backup');

    const choice = await this.askQuestion('\nEnter your choice (1-5): ');
    
    const types = ['full', 'database', 'files', 'config', 'custom'];
    const typeIndex = parseInt(choice) - 1;
    
    if (typeIndex < 0 || typeIndex >= types.length) {
      throw new Error('Invalid backup type selection');
    }

    const backupType = types[typeIndex];
    console.log(`Selected backup type: ${backupType}\n`);
    return backupType;
  }

  async executeBackup(backupType) {
    console.log(`🚀 Starting ${backupType} backup...\n`);
    
    const backupInfo = {
      timestamp: this.timestamp,
      type: backupType,
      files: [],
      size: 0
    };
    
    switch (backupType) {
      case 'full':
        await this.backupDatabase(backupInfo);
        await this.backupFiles(backupInfo);
        await this.backupConfiguration(backupInfo);
        break;
      case 'database':
        await this.backupDatabase(backupInfo);
        break;
      case 'files':
        await this.backupFiles(backupInfo);
        break;
      case 'config':
        await this.backupConfiguration(backupInfo);
        break;
      case 'custom':
        await this.customBackup(backupInfo);
        break;
    }
    
    // Create backup manifest
    await this.createBackupManifest(backupInfo);
    
    // Clean old backups
    await this.cleanOldBackups();
  }

  async backupDatabase(backupInfo) {
    console.log('🗄️  Backing up database...');
    
    try {
      // Load environment variables
      require('dotenv').config({ path: path.join(this.projectRoot, '.env') });
      
      const dbConfig = {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        database: process.env.DB_NAME || 'linkedin_automation',
        username: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD
      };
      
      const backupFile = path.join(this.backupDir, `database_${this.timestamp}.sql`);
      
      // Create pg_dump command
      const dumpCommand = `pg_dump -h ${dbConfig.host} -p ${dbConfig.port} -U ${dbConfig.username} -d ${dbConfig.database} -f "${backupFile}" --verbose --no-password`;
      
      // Set PGPASSWORD environment variable
      const env = { ...process.env, PGPASSWORD: dbConfig.password };
      
      execSync(dumpCommand, { 
        env,
        stdio: 'inherit',
        cwd: this.projectRoot
      });
      
      const stats = fs.statSync(backupFile);
      backupInfo.files.push({
        name: path.basename(backupFile),
        path: backupFile,
        size: stats.size,
        type: 'database'
      });
      backupInfo.size += stats.size;
      
      console.log(`  ✅ Database backup completed: ${this.formatBytes(stats.size)}`);
      
    } catch (error) {
      console.log('  ⚠️  Database backup failed (trying Docker method)...');
      await this.backupDatabaseDocker(backupInfo);
    }
  }

  async backupDatabaseDocker(backupInfo) {
    try {
      const backupFile = path.join(this.backupDir, `database_${this.timestamp}.sql`);
      
      // Try Docker backup
      const dockerCommand = `docker-compose exec -T postgres pg_dump -U postgres linkedin_automation > "${backupFile}"`;
      
      execSync(dockerCommand, {
        cwd: this.projectRoot,
        stdio: 'inherit'
      });
      
      const stats = fs.statSync(backupFile);
      backupInfo.files.push({
        name: path.basename(backupFile),
        path: backupFile,
        size: stats.size,
        type: 'database'
      });
      backupInfo.size += stats.size;
      
      console.log(`  ✅ Database backup completed (Docker): ${this.formatBytes(stats.size)}`);
      
    } catch (error) {
      console.log('  ❌ Database backup failed:', error.message);
      throw error;
    }
  }

  async backupFiles(backupInfo) {
    console.log('📁 Backing up files...');
    
    const filesToBackup = [
      { name: 'uploads', path: 'uploads' },
      { name: 'logs', path: 'logs' },
      { name: 'data', path: 'data' }
    ];
    
    for (const fileGroup of filesToBackup) {
      const sourcePath = path.join(this.projectRoot, fileGroup.path);
      
      if (fs.existsSync(sourcePath)) {
        const backupFile = path.join(this.backupDir, `${fileGroup.name}_${this.timestamp}.zip`);
        
        await this.createZipArchive(sourcePath, backupFile);
        
        const stats = fs.statSync(backupFile);
        backupInfo.files.push({
          name: path.basename(backupFile),
          path: backupFile,
          size: stats.size,
          type: 'files',
          source: fileGroup.path
        });
        backupInfo.size += stats.size;
        
        console.log(`  ✅ ${fileGroup.name} backup completed: ${this.formatBytes(stats.size)}`);
      } else {
        console.log(`  ⚠️  ${fileGroup.name} directory not found, skipping...`);
      }
    }
  }

  async backupConfiguration(backupInfo) {
    console.log('⚙️  Backing up configuration...');
    
    const configFiles = [
      '.env',
      'ecosystem.config.js',
      'docker-compose.yml',
      'docker-compose.prod.yml',
      'package.json',
      'package-lock.json'
    ];
    
    const backupFile = path.join(this.backupDir, `config_${this.timestamp}.zip`);
    
    const output = fs.createWriteStream(backupFile);
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    return new Promise((resolve, reject) => {
      output.on('close', () => {
        const stats = fs.statSync(backupFile);
        backupInfo.files.push({
          name: path.basename(backupFile),
          path: backupFile,
          size: stats.size,
          type: 'configuration'
        });
        backupInfo.size += stats.size;
        
        console.log(`  ✅ Configuration backup completed: ${this.formatBytes(stats.size)}`);
        resolve();
      });
      
      archive.on('error', reject);
      archive.pipe(output);
      
      // Add configuration files
      for (const configFile of configFiles) {
        const filePath = path.join(this.projectRoot, configFile);
        if (fs.existsSync(filePath)) {
          archive.file(filePath, { name: configFile });
        }
      }
      
      archive.finalize();
    });
  }

  async customBackup(backupInfo) {
    console.log('🎯 Custom backup configuration...');
    
    const options = [
      { name: 'Database', key: 'database' },
      { name: 'Uploads', key: 'uploads' },
      { name: 'Logs', key: 'logs' },
      { name: 'Configuration', key: 'config' },
      { name: 'Source Code', key: 'source' }
    ];
    
    console.log('\nSelect items to backup (comma-separated numbers):');
    options.forEach((option, index) => {
      console.log(`  ${index + 1}. ${option.name}`);
    });
    
    const selection = await this.askQuestion('\nEnter your choices (e.g., 1,2,4): ');
    const selectedIndices = selection.split(',').map(s => parseInt(s.trim()) - 1);
    
    for (const index of selectedIndices) {
      if (index >= 0 && index < options.length) {
        const option = options[index];
        
        switch (option.key) {
          case 'database':
            await this.backupDatabase(backupInfo);
            break;
          case 'uploads':
          case 'logs':
            const sourcePath = path.join(this.projectRoot, option.key);
            if (fs.existsSync(sourcePath)) {
              const backupFile = path.join(this.backupDir, `${option.key}_${this.timestamp}.zip`);
              await this.createZipArchive(sourcePath, backupFile);
              
              const stats = fs.statSync(backupFile);
              backupInfo.files.push({
                name: path.basename(backupFile),
                path: backupFile,
                size: stats.size,
                type: 'files',
                source: option.key
              });
              backupInfo.size += stats.size;
              
              console.log(`  ✅ ${option.name} backup completed: ${this.formatBytes(stats.size)}`);
            }
            break;
          case 'config':
            await this.backupConfiguration(backupInfo);
            break;
          case 'source':
            await this.backupSourceCode(backupInfo);
            break;
        }
      }
    }
  }

  async backupSourceCode(backupInfo) {
    console.log('💻 Backing up source code...');
    
    const backupFile = path.join(this.backupDir, `source_${this.timestamp}.zip`);
    const output = fs.createWriteStream(backupFile);
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    return new Promise((resolve, reject) => {
      output.on('close', () => {
        const stats = fs.statSync(backupFile);
        backupInfo.files.push({
          name: path.basename(backupFile),
          path: backupFile,
          size: stats.size,
          type: 'source'
        });
        backupInfo.size += stats.size;
        
        console.log(`  ✅ Source code backup completed: ${this.formatBytes(stats.size)}`);
        resolve();
      });
      
      archive.on('error', reject);
      archive.pipe(output);
      
      // Add source files (excluding node_modules, logs, etc.)
      archive.glob('**/*', {
        cwd: this.projectRoot,
        ignore: [
          'node_modules/**',
          'logs/**',
          'uploads/**',
          'backups/**',
          'data/**',
          '.git/**',
          'temp/**',
          '.env'
        ]
      });
      
      archive.finalize();
    });
  }

  async createZipArchive(sourcePath, backupFile) {
    const output = fs.createWriteStream(backupFile);
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    return new Promise((resolve, reject) => {
      output.on('close', resolve);
      archive.on('error', reject);
      archive.pipe(output);
      
      if (fs.statSync(sourcePath).isDirectory()) {
        archive.directory(sourcePath, false);
      } else {
        archive.file(sourcePath, { name: path.basename(sourcePath) });
      }
      
      archive.finalize();
    });
  }

  async createBackupManifest(backupInfo) {
    const manifestFile = path.join(this.backupDir, `manifest_${this.timestamp}.json`);
    
    const manifest = {
      ...backupInfo,
      created: new Date().toISOString(),
      system: {
        platform: process.platform,
        nodeVersion: process.version,
        projectRoot: this.projectRoot
      }
    };
    
    fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));
    console.log(`\n📋 Backup manifest created: ${manifestFile}`);
  }

  async cleanOldBackups() {
    console.log('\n🧹 Cleaning old backups...');
    
    try {
      const maxBackups = 10; // Keep last 10 backups
      const files = fs.readdirSync(this.backupDir)
        .filter(file => file.startsWith('manifest_'))
        .map(file => {
          const filePath = path.join(this.backupDir, file);
          const stats = fs.statSync(filePath);
          return { file, path: filePath, mtime: stats.mtime };
        })
        .sort((a, b) => b.mtime - a.mtime);
      
      if (files.length > maxBackups) {
        const filesToDelete = files.slice(maxBackups);
        
        for (const fileInfo of filesToDelete) {
          try {
            const manifest = JSON.parse(fs.readFileSync(fileInfo.path, 'utf8'));
            
            // Delete associated backup files
            for (const backupFile of manifest.files) {
              if (fs.existsSync(backupFile.path)) {
                fs.unlinkSync(backupFile.path);
              }
            }
            
            // Delete manifest
            fs.unlinkSync(fileInfo.path);
            
            console.log(`  🗑️  Deleted old backup: ${fileInfo.file}`);
          } catch (error) {
            console.log(`  ⚠️  Failed to delete backup: ${fileInfo.file}`);
          }
        }
      }
      
      console.log(`  ✅ Cleanup completed (keeping ${Math.min(files.length, maxBackups)} backups)`);
      
    } catch (error) {
      console.log('  ⚠️  Cleanup failed:', error.message);
    }
  }

  async listBackups() {
    const manifestFiles = fs.readdirSync(this.backupDir)
      .filter(file => file.startsWith('manifest_'))
      .map(file => {
        const filePath = path.join(this.backupDir, file);
        try {
          const manifest = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          return { file, manifest, path: filePath };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.manifest.created) - new Date(a.manifest.created));
    
    return manifestFiles;
  }

  async selectBackup(backups) {
    console.log('📋 Available backups:');
    
    backups.forEach((backup, index) => {
      const date = new Date(backup.manifest.created).toLocaleString();
      const size = this.formatBytes(backup.manifest.size);
      console.log(`  ${index + 1}. ${backup.manifest.type} backup - ${date} (${size})`);
    });
    
    const choice = await this.askQuestion(`\nSelect backup to restore (1-${backups.length}): `);
    const backupIndex = parseInt(choice) - 1;
    
    if (backupIndex < 0 || backupIndex >= backups.length) {
      throw new Error('Invalid backup selection');
    }
    
    return backups[backupIndex];
  }

  async executeRestore(selectedBackup) {
    console.log(`🔄 Restoring ${selectedBackup.manifest.type} backup...\n`);
    
    for (const file of selectedBackup.manifest.files) {
      console.log(`  📦 Restoring ${file.name}...`);
      
      try {
        switch (file.type) {
          case 'database':
            await this.restoreDatabase(file);
            break;
          case 'files':
            await this.restoreFiles(file);
            break;
          case 'configuration':
            await this.restoreConfiguration(file);
            break;
          case 'source':
            await this.restoreSourceCode(file);
            break;
        }
        
        console.log(`    ✅ ${file.name} restored successfully`);
      } catch (error) {
        console.log(`    ❌ Failed to restore ${file.name}: ${error.message}`);
      }
    }
  }

  async restoreDatabase(file) {
    // Load environment variables
    require('dotenv').config({ path: path.join(this.projectRoot, '.env') });
    
    const dbConfig = {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'linkedin_automation',
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD
    };
    
    try {
      // Restore using psql
      const restoreCommand = `psql -h ${dbConfig.host} -p ${dbConfig.port} -U ${dbConfig.username} -d ${dbConfig.database} -f "${file.path}"`;
      
      const env = { ...process.env, PGPASSWORD: dbConfig.password };
      
      execSync(restoreCommand, {
        env,
        stdio: 'inherit',
        cwd: this.projectRoot
      });
      
    } catch (error) {
      // Try Docker restore
      const dockerCommand = `docker-compose exec -T postgres psql -U postgres -d linkedin_automation < "${file.path}"`;
      
      execSync(dockerCommand, {
        cwd: this.projectRoot,
        stdio: 'inherit'
      });
    }
  }

  async restoreFiles(file) {
    const extractPath = path.join(this.projectRoot, file.source || 'restored');
    
    // Create extract directory if it doesn't exist
    if (!fs.existsSync(extractPath)) {
      fs.mkdirSync(extractPath, { recursive: true });
    }
    
    // Extract zip file
    const extract = require('extract-zip');
    await extract(file.path, { dir: extractPath });
  }

  async restoreConfiguration(file) {
    // Extract configuration files to project root
    const extract = require('extract-zip');
    await extract(file.path, { dir: this.projectRoot });
  }

  async restoreSourceCode(file) {
    // Extract source code to project root
    const extract = require('extract-zip');
    await extract(file.path, { dir: this.projectRoot });
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  askQuestion(question) {
    return new Promise((resolve) => {
      rl.question(question, (answer) => {
        resolve(answer.trim());
      });
    });
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0] || 'backup';
  
  const backupManager = new BackupManager();
  
  switch (command) {
    case 'backup':
      backupManager.backup();
      break;
    case 'restore':
      backupManager.restore();
      break;
    case 'list':
      backupManager.listBackups().then(backups => {
        console.log('📋 Available backups:');
        if (backups.length === 0) {
          console.log('  No backups found.');
        } else {
          backups.forEach((backup, index) => {
            const date = new Date(backup.manifest.created).toLocaleString();
            const size = backupManager.formatBytes(backup.manifest.size);
            console.log(`  ${index + 1}. ${backup.manifest.type} backup - ${date} (${size})`);
          });
        }
      });
      break;
    default:
      console.log('Usage: node backup.js [backup|restore|list]');
      console.log('  backup: Create a new backup');
      console.log('  restore: Restore from an existing backup');
      console.log('  list: List available backups');
  }
}

module.exports = BackupManager;