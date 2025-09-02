#!/usr/bin/env node

/**
 * LinkedIn Automation System - Monitoring Script
 * 
 * This script provides comprehensive monitoring capabilities for the LinkedIn automation system.
 * It checks system health, performance metrics, and provides alerts for issues.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const http = require('http');
const https = require('https');

class SystemMonitor {
  constructor() {
    this.projectRoot = path.resolve(__dirname, '..');
    this.healthEndpoints = [
      { name: 'Main API', url: 'http://localhost:3000/health' },
      { name: 'Database', url: 'http://localhost:3000/api/health/database' },
      { name: 'Redis', url: 'http://localhost:3000/api/health/redis' },
      { name: 'LinkedIn API', url: 'http://localhost:3000/api/health/linkedin' }
    ];
    this.logFiles = [
      { name: 'Application', path: 'logs/app.log' },
      { name: 'Error', path: 'logs/error.log' },
      { name: 'Scheduler', path: 'logs/scheduler.log' },
      { name: 'Analytics', path: 'logs/analytics.log' }
    ];
  }

  async monitor() {
    console.log('📊 LinkedIn Automation System - Health Monitor\n');
    
    try {
      const results = {
        timestamp: new Date().toISOString(),
        system: await this.checkSystemHealth(),
        services: await this.checkServices(),
        endpoints: await this.checkEndpoints(),
        resources: await this.checkResources(),
        logs: await this.checkLogs(),
        database: await this.checkDatabase(),
        performance: await this.checkPerformance()
      };
      
      this.displayResults(results);
      this.generateReport(results);
      
      const overallHealth = this.calculateOverallHealth(results);
      console.log(`\n🎯 Overall System Health: ${this.getHealthEmoji(overallHealth)} ${overallHealth}%`);
      
      if (overallHealth < 80) {
        console.log('\n⚠️  System health is below optimal. Please review the issues above.');
        process.exit(1);
      }
      
    } catch (error) {
      console.error('\n❌ Monitoring failed:', error.message);
      process.exit(1);
    }
  }

  async checkSystemHealth() {
    console.log('🔍 Checking system health...');
    
    const health = {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: await this.getCPUUsage(),
      disk: await this.getDiskUsage(),
      network: await this.getNetworkStatus()
    };
    
    console.log('  ✅ System health check completed');
    return health;
  }

  async checkServices() {
    console.log('🔧 Checking services...');
    
    const services = {
      docker: await this.checkDockerServices(),
      pm2: await this.checkPM2Services(),
      processes: await this.checkProcesses()
    };
    
    console.log('  ✅ Service check completed');
    return services;
  }

  async checkEndpoints() {
    console.log('🌐 Checking API endpoints...');
    
    const results = [];
    
    for (const endpoint of this.healthEndpoints) {
      try {
        const startTime = Date.now();
        const response = await this.makeRequest(endpoint.url);
        const responseTime = Date.now() - startTime;
        
        results.push({
          name: endpoint.name,
          url: endpoint.url,
          status: 'healthy',
          responseTime,
          statusCode: response.statusCode,
          message: 'OK'
        });
        
      } catch (error) {
        results.push({
          name: endpoint.name,
          url: endpoint.url,
          status: 'unhealthy',
          responseTime: null,
          statusCode: error.statusCode || null,
          message: error.message
        });
      }
    }
    
    console.log('  ✅ Endpoint check completed');
    return results;
  }

  async checkResources() {
    console.log('💾 Checking resource usage...');
    
    const resources = {
      memory: {
        total: this.formatBytes(process.memoryUsage().rss),
        heap: this.formatBytes(process.memoryUsage().heapUsed),
        external: this.formatBytes(process.memoryUsage().external)
      },
      disk: await this.getDiskUsage(),
      cpu: await this.getCPUUsage()
    };
    
    console.log('  ✅ Resource check completed');
    return resources;
  }

  async checkLogs() {
    console.log('📋 Checking log files...');
    
    const logStatus = [];
    
    for (const logFile of this.logFiles) {
      const logPath = path.join(this.projectRoot, logFile.path);
      
      try {
        const stats = fs.statSync(logPath);
        const recentErrors = await this.getRecentErrors(logPath);
        
        logStatus.push({
          name: logFile.name,
          path: logFile.path,
          size: this.formatBytes(stats.size),
          lastModified: stats.mtime,
          recentErrors: recentErrors.length,
          status: recentErrors.length > 10 ? 'warning' : 'healthy'
        });
        
      } catch (error) {
        logStatus.push({
          name: logFile.name,
          path: logFile.path,
          size: 'N/A',
          lastModified: null,
          recentErrors: 0,
          status: 'missing'
        });
      }
    }
    
    console.log('  ✅ Log check completed');
    return logStatus;
  }

  async checkDatabase() {
    console.log('🗄️  Checking database...');
    
    try {
      const dbHealth = await this.makeRequest('http://localhost:3000/api/health/database');
      
      const database = {
        status: 'healthy',
        connections: dbHealth.data?.connections || 'unknown',
        responseTime: dbHealth.responseTime,
        lastBackup: await this.getLastBackupTime()
      };
      
      console.log('  ✅ Database check completed');
      return database;
      
    } catch (error) {
      console.log('  ❌ Database check failed');
      return {
        status: 'unhealthy',
        error: error.message,
        connections: 0,
        responseTime: null,
        lastBackup: null
      };
    }
  }

  async checkPerformance() {
    console.log('⚡ Checking performance metrics...');
    
    try {
      const metrics = await this.makeRequest('http://localhost:3000/api/metrics');
      
      const performance = {
        requestsPerMinute: metrics.data?.requestsPerMinute || 0,
        averageResponseTime: metrics.data?.averageResponseTime || 0,
        errorRate: metrics.data?.errorRate || 0,
        activeUsers: metrics.data?.activeUsers || 0,
        scheduledPosts: metrics.data?.scheduledPosts || 0
      };
      
      console.log('  ✅ Performance check completed');
      return performance;
      
    } catch (error) {
      console.log('  ⚠️  Performance metrics unavailable');
      return {
        requestsPerMinute: 'N/A',
        averageResponseTime: 'N/A',
        errorRate: 'N/A',
        activeUsers: 'N/A',
        scheduledPosts: 'N/A'
      };
    }
  }

  async checkDockerServices() {
    try {
      const output = execSync('docker-compose ps --format json', {
        cwd: this.projectRoot,
        encoding: 'utf8'
      });
      
      const services = JSON.parse(`[${output.trim().split('\n').join(',')}]`);
      return services.map(service => ({
        name: service.Service,
        status: service.State,
        health: service.Health || 'unknown'
      }));
      
    } catch (error) {
      return { error: 'Docker not available or services not running' };
    }
  }

  async checkPM2Services() {
    try {
      const output = execSync('pm2 jlist', { encoding: 'utf8' });
      const processes = JSON.parse(output);
      
      return processes.map(proc => ({
        name: proc.name,
        status: proc.pm2_env.status,
        cpu: proc.monit.cpu,
        memory: this.formatBytes(proc.monit.memory),
        uptime: proc.pm2_env.pm_uptime,
        restarts: proc.pm2_env.restart_time
      }));
      
    } catch (error) {
      return { error: 'PM2 not available or no processes running' };
    }
  }

  async checkProcesses() {
    try {
      // Check for Node.js processes related to our application
      const output = execSync('tasklist /FI "IMAGENAME eq node.exe" /FO CSV', {
        encoding: 'utf8'
      });
      
      const lines = output.split('\n').slice(1).filter(line => line.trim());
      const processes = lines.map(line => {
        const parts = line.split(',').map(part => part.replace(/"/g, ''));
        return {
          name: parts[0],
          pid: parts[1],
          memory: parts[4]
        };
      });
      
      return processes;
      
    } catch (error) {
      return { error: 'Unable to check processes' };
    }
  }

  async getCPUUsage() {
    try {
      const output = execSync('wmic cpu get loadpercentage /value', {
        encoding: 'utf8'
      });
      
      const match = output.match(/LoadPercentage=(\d+)/);
      return match ? parseInt(match[1]) : 0;
      
    } catch (error) {
      return 'N/A';
    }
  }

  async getDiskUsage() {
    try {
      const output = execSync('wmic logicaldisk get size,freespace,caption', {
        encoding: 'utf8'
      });
      
      const lines = output.split('\n').filter(line => line.trim() && !line.includes('Caption'));
      const disks = lines.map(line => {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 3) {
          const caption = parts[0];
          const freeSpace = parseInt(parts[1]);
          const size = parseInt(parts[2]);
          const used = size - freeSpace;
          const usagePercent = Math.round((used / size) * 100);
          
          return {
            drive: caption,
            total: this.formatBytes(size),
            used: this.formatBytes(used),
            free: this.formatBytes(freeSpace),
            usagePercent
          };
        }
        return null;
      }).filter(Boolean);
      
      return disks;
      
    } catch (error) {
      return [{ error: 'Unable to get disk usage' }];
    }
  }

  async getNetworkStatus() {
    try {
      // Simple network connectivity test
      await this.makeRequest('http://www.google.com', 5000);
      return 'connected';
    } catch (error) {
      return 'disconnected';
    }
  }

  async getRecentErrors(logPath) {
    try {
      const content = fs.readFileSync(logPath, 'utf8');
      const lines = content.split('\n');
      const recentLines = lines.slice(-1000); // Last 1000 lines
      
      return recentLines.filter(line => 
        line.toLowerCase().includes('error') || 
        line.toLowerCase().includes('exception') ||
        line.toLowerCase().includes('failed')
      );
      
    } catch (error) {
      return [];
    }
  }

  async getLastBackupTime() {
    try {
      const backupDir = path.join(this.projectRoot, 'backups');
      if (!fs.existsSync(backupDir)) {
        return null;
      }
      
      const files = fs.readdirSync(backupDir)
        .filter(file => file.endsWith('.sql'))
        .map(file => {
          const filePath = path.join(backupDir, file);
          const stats = fs.statSync(filePath);
          return { file, mtime: stats.mtime };
        })
        .sort((a, b) => b.mtime - a.mtime);
      
      return files.length > 0 ? files[0].mtime : null;
      
    } catch (error) {
      return null;
    }
  }

  makeRequest(url, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const client = url.startsWith('https') ? https : http;
      
      const req = client.get(url, { timeout }, (res) => {
        let data = '';
        
        res.on('data', chunk => {
          data += chunk;
        });
        
        res.on('end', () => {
          const responseTime = Date.now() - startTime;
          
          try {
            const parsedData = JSON.parse(data);
            resolve({
              statusCode: res.statusCode,
              data: parsedData,
              responseTime
            });
          } catch {
            resolve({
              statusCode: res.statusCode,
              data: data,
              responseTime
            });
          }
        });
      });
      
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
      
      req.on('error', (error) => {
        reject(error);
      });
    });
  }

  displayResults(results) {
    console.log('\n📊 MONITORING RESULTS');
    console.log('=' .repeat(50));
    
    // System Health
    console.log('\n🖥️  SYSTEM HEALTH:');
    console.log(`  Memory Usage: ${this.formatBytes(results.system.memory.rss)}`);
    console.log(`  CPU Usage: ${results.system.cpu}%`);
    console.log(`  Uptime: ${this.formatUptime(results.system.uptime)}`);
    console.log(`  Network: ${results.system.network}`);
    
    // Services
    console.log('\n🔧 SERVICES:');
    if (results.services.docker && !results.services.docker.error) {
      console.log('  Docker Services:');
      results.services.docker.forEach(service => {
        const status = service.status === 'running' ? '✅' : '❌';
        console.log(`    ${status} ${service.name}: ${service.status}`);
      });
    }
    
    if (results.services.pm2 && !results.services.pm2.error) {
      console.log('  PM2 Processes:');
      results.services.pm2.forEach(proc => {
        const status = proc.status === 'online' ? '✅' : '❌';
        console.log(`    ${status} ${proc.name}: ${proc.status} (CPU: ${proc.cpu}%, Memory: ${proc.memory})`);
      });
    }
    
    // API Endpoints
    console.log('\n🌐 API ENDPOINTS:');
    results.endpoints.forEach(endpoint => {
      const status = endpoint.status === 'healthy' ? '✅' : '❌';
      const responseTime = endpoint.responseTime ? `${endpoint.responseTime}ms` : 'N/A';
      console.log(`  ${status} ${endpoint.name}: ${endpoint.status} (${responseTime})`);
    });
    
    // Database
    console.log('\n🗄️  DATABASE:');
    const dbStatus = results.database.status === 'healthy' ? '✅' : '❌';
    console.log(`  ${dbStatus} Status: ${results.database.status}`);
    if (results.database.connections) {
      console.log(`  Connections: ${results.database.connections}`);
    }
    if (results.database.lastBackup) {
      console.log(`  Last Backup: ${new Date(results.database.lastBackup).toLocaleString()}`);
    }
    
    // Performance
    console.log('\n⚡ PERFORMANCE:');
    console.log(`  Requests/min: ${results.performance.requestsPerMinute}`);
    console.log(`  Avg Response Time: ${results.performance.averageResponseTime}ms`);
    console.log(`  Error Rate: ${results.performance.errorRate}%`);
    console.log(`  Active Users: ${results.performance.activeUsers}`);
    console.log(`  Scheduled Posts: ${results.performance.scheduledPosts}`);
    
    // Logs
    console.log('\n📋 LOG FILES:');
    results.logs.forEach(log => {
      const status = log.status === 'healthy' ? '✅' : 
                    log.status === 'warning' ? '⚠️' : '❌';
      console.log(`  ${status} ${log.name}: ${log.size} (${log.recentErrors} recent errors)`);
    });
  }

  generateReport(results) {
    const reportPath = path.join(this.projectRoot, 'logs', 'health-report.json');
    
    try {
      fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
      console.log(`\n📄 Health report saved to: ${reportPath}`);
    } catch (error) {
      console.log('\n⚠️  Failed to save health report:', error.message);
    }
  }

  calculateOverallHealth(results) {
    let score = 100;
    
    // Check endpoints
    const healthyEndpoints = results.endpoints.filter(e => e.status === 'healthy').length;
    const endpointScore = (healthyEndpoints / results.endpoints.length) * 30;
    
    // Check database
    const dbScore = results.database.status === 'healthy' ? 20 : 0;
    
    // Check logs for errors
    const totalErrors = results.logs.reduce((sum, log) => sum + log.recentErrors, 0);
    const logScore = Math.max(0, 20 - (totalErrors * 2));
    
    // Check system resources
    const cpuScore = results.system.cpu < 80 ? 15 : Math.max(0, 15 - (results.system.cpu - 80));
    const memoryScore = 15; // Simplified for now
    
    return Math.round(endpointScore + dbScore + logScore + cpuScore + memoryScore);
  }

  getHealthEmoji(score) {
    if (score >= 90) return '🟢';
    if (score >= 70) return '🟡';
    return '🔴';
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0] || 'monitor';
  
  const monitor = new SystemMonitor();
  
  switch (command) {
    case 'monitor':
    case 'health':
      monitor.monitor();
      break;
    case 'watch':
      console.log('🔄 Starting continuous monitoring (Ctrl+C to stop)...');
      setInterval(() => {
        console.clear();
        monitor.monitor();
      }, 30000); // Every 30 seconds
      break;
    default:
      console.log('Usage: node monitor.js [monitor|health|watch]');
      console.log('  monitor/health: Run single health check');
      console.log('  watch: Continuous monitoring every 30 seconds');
  }
}

module.exports = SystemMonitor;