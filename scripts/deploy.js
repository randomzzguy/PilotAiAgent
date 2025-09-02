#!/usr/bin/env node

/**
 * LinkedIn Automation System - Deployment Script
 * 
 * This script helps deploy the LinkedIn automation system to various environments.
 * It handles environment setup, database initialization, and service deployment.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

class DeploymentManager {
  constructor() {
    this.projectRoot = path.resolve(__dirname, '..');
    this.environments = ['development', 'staging', 'production'];
    this.services = ['app', 'scheduler', 'analytics', 'postgres', 'redis'];
  }

  async deploy() {
    console.log('🚀 LinkedIn Automation System - Deployment Manager\n');
    
    try {
      // Check prerequisites
      await this.checkPrerequisites();
      
      // Select deployment environment
      const environment = await this.selectEnvironment();
      
      // Select deployment type
      const deploymentType = await this.selectDeploymentType();
      
      // Validate configuration
      await this.validateConfiguration(environment);
      
      // Execute deployment
      await this.executeDeployment(environment, deploymentType);
      
      console.log('\n✅ Deployment completed successfully!');
      console.log('\n📋 Next steps:');
      this.printNextSteps(environment, deploymentType);
      
    } catch (error) {
      console.error('\n❌ Deployment failed:', error.message);
      process.exit(1);
    } finally {
      rl.close();
    }
  }

  async checkPrerequisites() {
    console.log('🔍 Checking prerequisites...');
    
    const requirements = [
      { name: 'Node.js', command: 'node --version', minVersion: '16.0.0' },
      { name: 'npm', command: 'npm --version', minVersion: '8.0.0' },
      { name: 'Docker', command: 'docker --version', minVersion: '20.0.0' },
      { name: 'Docker Compose', command: 'docker-compose --version', minVersion: '2.0.0' }
    ];

    for (const req of requirements) {
      try {
        const output = execSync(req.command, { encoding: 'utf8' }).trim();
        console.log(`  ✅ ${req.name}: ${output}`);
      } catch (error) {
        throw new Error(`${req.name} is not installed or not accessible`);
      }
    }

    // Check if .env file exists
    const envPath = path.join(this.projectRoot, '.env');
    if (!fs.existsSync(envPath)) {
      console.log('\n⚠️  .env file not found. Creating from template...');
      const examplePath = path.join(this.projectRoot, '.env.example');
      fs.copyFileSync(examplePath, envPath);
      console.log('\n📝 Please edit .env file with your actual configuration before continuing.');
      
      const proceed = await this.askQuestion('Continue with deployment? (y/N): ');
      if (proceed.toLowerCase() !== 'y') {
        throw new Error('Deployment cancelled. Please configure .env file first.');
      }
    }

    console.log('✅ Prerequisites check completed\n');
  }

  async selectEnvironment() {
    console.log('🌍 Select deployment environment:');
    this.environments.forEach((env, index) => {
      console.log(`  ${index + 1}. ${env}`);
    });

    const choice = await this.askQuestion('\nEnter your choice (1-3): ');
    const envIndex = parseInt(choice) - 1;
    
    if (envIndex < 0 || envIndex >= this.environments.length) {
      throw new Error('Invalid environment selection');
    }

    const environment = this.environments[envIndex];
    console.log(`Selected environment: ${environment}\n`);
    return environment;
  }

  async selectDeploymentType() {
    console.log('📦 Select deployment type:');
    console.log('  1. Docker Compose (Recommended)');
    console.log('  2. PM2 (Node.js process manager)');
    console.log('  3. Manual (Individual services)');

    const choice = await this.askQuestion('\nEnter your choice (1-3): ');
    
    const types = ['docker', 'pm2', 'manual'];
    const typeIndex = parseInt(choice) - 1;
    
    if (typeIndex < 0 || typeIndex >= types.length) {
      throw new Error('Invalid deployment type selection');
    }

    const deploymentType = types[typeIndex];
    console.log(`Selected deployment type: ${deploymentType}\n`);
    return deploymentType;
  }

  async validateConfiguration(environment) {
    console.log('🔧 Validating configuration...');
    
    const envPath = path.join(this.projectRoot, '.env');
    const envContent = fs.readFileSync(envPath, 'utf8');
    
    const requiredVars = [
      'LINKEDIN_CLIENT_ID',
      'LINKEDIN_CLIENT_SECRET',
      'OPENAI_API_KEY',
      'JWT_SECRET',
      'ENCRYPTION_KEY'
    ];

    const missingVars = [];
    
    for (const varName of requiredVars) {
      const regex = new RegExp(`^${varName}=(.+)$`, 'm');
      const match = envContent.match(regex);
      
      if (!match || match[1].includes('your_') || match[1].includes('_here')) {
        missingVars.push(varName);
      }
    }

    if (missingVars.length > 0) {
      console.log('\n⚠️  Missing or incomplete configuration:');
      missingVars.forEach(varName => {
        console.log(`  - ${varName}`);
      });
      
      const proceed = await this.askQuestion('\nContinue anyway? (y/N): ');
      if (proceed.toLowerCase() !== 'y') {
        throw new Error('Deployment cancelled. Please complete configuration first.');
      }
    }

    console.log('✅ Configuration validation completed\n');
  }

  async executeDeployment(environment, deploymentType) {
    console.log(`🚀 Starting ${deploymentType} deployment for ${environment}...\n`);
    
    switch (deploymentType) {
      case 'docker':
        await this.deployWithDocker(environment);
        break;
      case 'pm2':
        await this.deployWithPM2(environment);
        break;
      case 'manual':
        await this.deployManually(environment);
        break;
    }
  }

  async deployWithDocker(environment) {
    console.log('🐳 Deploying with Docker Compose...');
    
    // Create necessary directories
    const dirs = ['logs', 'uploads', 'data', 'backups'];
    dirs.forEach(dir => {
      const dirPath = path.join(this.projectRoot, dir);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`  📁 Created directory: ${dir}`);
      }
    });

    // Select appropriate docker-compose file
    const composeFile = environment === 'production' 
      ? 'docker-compose.prod.yml' 
      : 'docker-compose.yml';
    
    console.log(`  📋 Using compose file: ${composeFile}`);
    
    // Build and start services
    const commands = [
      `docker-compose -f ${composeFile} down --remove-orphans`,
      `docker-compose -f ${composeFile} build`,
      `docker-compose -f ${composeFile} up -d`
    ];

    for (const command of commands) {
      console.log(`  🔄 Executing: ${command}`);
      execSync(command, { 
        cwd: this.projectRoot, 
        stdio: 'inherit' 
      });
    }

    // Wait for services to be ready
    console.log('  ⏳ Waiting for services to be ready...');
    await this.waitForServices();
    
    // Initialize database
    await this.initializeDatabase('docker');
    
    console.log('✅ Docker deployment completed');
  }

  async deployWithPM2(environment) {
    console.log('⚡ Deploying with PM2...');
    
    // Install dependencies
    console.log('  📦 Installing dependencies...');
    execSync('npm ci --production', { 
      cwd: this.projectRoot, 
      stdio: 'inherit' 
    });
    
    // Install PM2 globally if not present
    try {
      execSync('pm2 --version', { stdio: 'ignore' });
    } catch {
      console.log('  📦 Installing PM2...');
      execSync('npm install -g pm2', { stdio: 'inherit' });
    }
    
    // Create necessary directories
    const dirs = ['logs', 'uploads', 'data'];
    dirs.forEach(dir => {
      const dirPath = path.join(this.projectRoot, dir);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`  📁 Created directory: ${dir}`);
      }
    });
    
    // Start services with PM2
    console.log('  🚀 Starting services with PM2...');
    execSync(`pm2 start ecosystem.config.js --env ${environment}`, {
      cwd: this.projectRoot,
      stdio: 'inherit'
    });
    
    // Save PM2 configuration
    execSync('pm2 save', { stdio: 'inherit' });
    
    console.log('✅ PM2 deployment completed');
  }

  async deployManually(environment) {
    console.log('🔧 Manual deployment...');
    
    // Install dependencies
    console.log('  📦 Installing dependencies...');
    execSync('npm ci', { 
      cwd: this.projectRoot, 
      stdio: 'inherit' 
    });
    
    // Create necessary directories
    const dirs = ['logs', 'uploads', 'data'];
    dirs.forEach(dir => {
      const dirPath = path.join(this.projectRoot, dir);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`  📁 Created directory: ${dir}`);
      }
    });
    
    console.log('\n📋 Manual deployment steps:');
    console.log('  1. Set up PostgreSQL database');
    console.log('  2. Set up Redis server');
    console.log('  3. Run database initialization: npm run db:init');
    console.log('  4. Start the application: npm start');
    console.log('  5. Start workers: npm run worker:scheduler & npm run worker:analytics');
    
    console.log('✅ Manual deployment preparation completed');
  }

  async waitForServices() {
    const maxAttempts = 30;
    const delay = 2000;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // Check if main app is responding
        const { execSync } = require('child_process');
        execSync('curl -f http://localhost:3000/health', { 
          stdio: 'ignore',
          timeout: 5000
        });
        console.log('  ✅ Services are ready!');
        return;
      } catch {
        if (attempt === maxAttempts) {
          throw new Error('Services failed to start within expected time');
        }
        console.log(`  ⏳ Attempt ${attempt}/${maxAttempts} - waiting for services...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  async initializeDatabase(deploymentType) {
    console.log('  🗄️  Initializing database...');
    
    try {
      if (deploymentType === 'docker') {
        execSync('docker-compose exec app npm run db:init', {
          cwd: this.projectRoot,
          stdio: 'inherit'
        });
      } else {
        execSync('npm run db:init', {
          cwd: this.projectRoot,
          stdio: 'inherit'
        });
      }
      console.log('  ✅ Database initialized successfully');
    } catch (error) {
      console.log('  ⚠️  Database initialization failed (may already be initialized)');
    }
  }

  printNextSteps(environment, deploymentType) {
    console.log('\n1. 🌐 Access the application:');
    console.log('   - Main API: http://localhost:3000');
    console.log('   - Health Check: http://localhost:3000/health');
    
    if (deploymentType === 'docker') {
      console.log('   - Grafana (monitoring): http://localhost:3001');
      console.log('   - Prometheus (metrics): http://localhost:9090');
    }
    
    console.log('\n2. 🔧 Configure LinkedIn and OpenAI:');
    console.log('   - Update .env file with your API keys');
    console.log('   - LinkedIn Developer Portal: https://www.linkedin.com/developers/');
    console.log('   - OpenAI API Keys: https://platform.openai.com/api-keys');
    
    console.log('\n3. 📊 Monitor the system:');
    console.log('   - Check logs: tail -f logs/app.log');
    
    if (deploymentType === 'docker') {
      console.log('   - View containers: docker-compose ps');
      console.log('   - View logs: docker-compose logs -f');
    } else if (deploymentType === 'pm2') {
      console.log('   - View PM2 status: pm2 status');
      console.log('   - View PM2 logs: pm2 logs');
    }
    
    console.log('\n4. 🧪 Test the system:');
    console.log('   - Run tests: npm test');
    console.log('   - Test API endpoints with Postman or curl');
    
    console.log('\n5. 🔒 Security checklist:');
    console.log('   - Change default passwords in .env');
    console.log('   - Set up SSL certificates for production');
    console.log('   - Configure firewall rules');
    console.log('   - Enable monitoring and alerting');
  }

  askQuestion(question) {
    return new Promise((resolve) => {
      rl.question(question, (answer) => {
        resolve(answer.trim());
      });
    });
  }
}

// Main execution
if (require.main === module) {
  const deploymentManager = new DeploymentManager();
  deploymentManager.deploy().catch(error => {
    console.error('Deployment failed:', error.message);
    process.exit(1);
  });
}

module.exports = DeploymentManager;