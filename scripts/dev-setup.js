#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

/**
 * Development setup script for LinkedIn Automation System
 * Helps developers get started quickly with proper configuration
 */

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function colorize(text, color) {
  return `${colors[color]}${text}${colors.reset}`;
}

function log(message, color = 'reset') {
  console.log(colorize(message, color));
}

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(colorize(prompt, 'cyan'), resolve);
  });
}

async function checkPrerequisites() {
  log('\n🔍 Checking prerequisites...', 'blue');
  
  try {
    // Check Node.js version
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
    
    if (majorVersion < 16) {
      log(`❌ Node.js ${nodeVersion} detected. Please upgrade to Node.js 16 or higher.`, 'red');
      process.exit(1);
    }
    
    log(`✅ Node.js ${nodeVersion} - OK`, 'green');
    
    // Check npm
    const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
    log(`✅ npm ${npmVersion} - OK`, 'green');
    
    // Check if dependencies are installed
    if (!fs.existsSync('node_modules')) {
      log('📦 Installing dependencies...', 'yellow');
      execSync('npm install', { stdio: 'inherit' });
      log('✅ Dependencies installed', 'green');
    } else {
      log('✅ Dependencies already installed', 'green');
    }
    
  } catch (error) {
    log(`❌ Error checking prerequisites: ${error.message}`, 'red');
    process.exit(1);
  }
}

async function setupEnvironment() {
  log('\n⚙️  Setting up environment configuration...', 'blue');
  
  const envPath = '.env';
  const envExamplePath = '.env.example';
  
  if (fs.existsSync(envPath)) {
    const overwrite = await question('📄 .env file already exists. Overwrite? (y/N): ');
    if (overwrite.toLowerCase() !== 'y') {
      log('✅ Keeping existing .env file', 'green');
      return;
    }
  }
  
  if (!fs.existsSync(envExamplePath)) {
    log('❌ .env.example file not found', 'red');
    return;
  }
  
  log('\n📝 Please provide the following configuration values:', 'yellow');
  log('   (Press Enter to use default values)', 'yellow');
  
  const config = {};
  
  // Basic configuration
  config.NODE_ENV = 'development';
  config.PORT = await question('🌐 Server port (3000): ') || '3000';
  
  // Database
  log('\n📊 Database Configuration:', 'magenta');
  config.DATABASE_URL = await question('🗄️  Database URL (./data/linkedin_automation.db): ') || './data/linkedin_automation.db';
  
  // LinkedIn API
  log('\n🔗 LinkedIn API Configuration:', 'magenta');
  log('   Get these from: https://www.linkedin.com/developers/', 'yellow');
  config.LINKEDIN_CLIENT_ID = await question('🔑 LinkedIn Client ID: ');
  config.LINKEDIN_CLIENT_SECRET = await question('🔐 LinkedIn Client Secret: ');
  config.LINKEDIN_REDIRECT_URI = await question('🔄 LinkedIn Redirect URI (http://localhost:3000/api/linkedin/callback): ') || 'http://localhost:3000/api/linkedin/callback';
  
  // OpenAI API
  log('\n🤖 OpenAI API Configuration:', 'magenta');
  log('   Get your API key from: https://platform.openai.com/api-keys', 'yellow');
  config.OPENAI_API_KEY = await question('🔑 OpenAI API Key: ');
  config.OPENAI_MODEL = await question('🧠 OpenAI Model (gpt-4): ') || 'gpt-4';
  
  // Security
  log('\n🔒 Security Configuration:', 'magenta');
  config.JWT_SECRET = await question('🔐 JWT Secret (leave empty to generate): ') || generateRandomString(64);
  config.ENCRYPTION_KEY = await question('🔐 Encryption Key (leave empty to generate): ') || generateRandomString(32);
  
  // Optional configurations with defaults
  config.TIMEZONE = 'Asia/Dubai';
  config.CONTENT_MAX_LENGTH = '3000';
  config.CONTENT_VARIATIONS = '3';
  config.ABU_DHABI_OPTIMAL_TIMES = '09:00,13:00,17:00';
  config.RATE_LIMIT_WINDOW_MS = '900000';
  config.RATE_LIMIT_MAX_REQUESTS = '100';
  config.MAX_FILE_SIZE = '10485760';
  config.LOG_LEVEL = 'info';
  config.ANALYTICS_RETENTION_DAYS = '90';
  
  // Write .env file
  const envContent = Object.entries(config)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  
  fs.writeFileSync(envPath, envContent);
  log('✅ .env file created successfully', 'green');
  
  // Validate required fields
  const requiredFields = ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET', 'OPENAI_API_KEY'];
  const missingFields = requiredFields.filter(field => !config[field]);
  
  if (missingFields.length > 0) {
    log('\n⚠️  Warning: The following required fields are missing:', 'yellow');
    missingFields.forEach(field => log(`   - ${field}`, 'yellow'));
    log('   Please update your .env file before starting the application.', 'yellow');
  }
}

function generateRandomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function setupDirectories() {
  log('\n📁 Setting up directories...', 'blue');
  
  const directories = [
    'data',
    'logs',
    'uploads',
    'temp'
  ];
  
  directories.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      log(`✅ Created directory: ${dir}`, 'green');
    } else {
      log(`✅ Directory exists: ${dir}`, 'green');
    }
  });
}

async function runTests() {
  log('\n🧪 Running setup tests...', 'blue');
  
  try {
    execSync('npm test -- --testPathPattern=setup.test.js', { stdio: 'inherit' });
    log('✅ Setup tests passed', 'green');
  } catch (error) {
    log('❌ Setup tests failed', 'red');
    log('   Please check the error messages above and fix any issues.', 'yellow');
  }
}

async function showNextSteps() {
  log('\n🎉 Development setup complete!', 'green');
  log('\n📋 Next steps:', 'blue');
  log('   1. Review your .env file and update any missing values', 'cyan');
  log('   2. Set up your LinkedIn Developer App:', 'cyan');
  log('      - Go to https://www.linkedin.com/developers/', 'yellow');
  log('      - Create a new app and get your Client ID and Secret', 'yellow');
  log('      - Add your redirect URI to the app settings', 'yellow');
  log('   3. Get your OpenAI API key from https://platform.openai.com/api-keys', 'cyan');
  log('   4. Start the development server:', 'cyan');
  log('      npm run dev', 'green');
  log('   5. Visit http://localhost:3000/health to verify the setup', 'cyan');
  
  log('\n📚 Useful commands:', 'blue');
  log('   npm run dev          - Start development server with auto-reload', 'cyan');
  log('   npm test             - Run all tests', 'cyan');
  log('   npm run test:watch   - Run tests in watch mode', 'cyan');
  log('   npm run lint         - Check code style', 'cyan');
  log('   npm start            - Start production server', 'cyan');
  
  log('\n📖 Documentation:', 'blue');
  log('   - README.md for detailed setup instructions', 'cyan');
  log('   - API documentation will be available at /api-docs when running', 'cyan');
  
  log('\n🆘 Need help?', 'blue');
  log('   - Check the logs in the ./logs directory', 'cyan');
  log('   - Review the .env.example file for configuration options', 'cyan');
  log('   - Run npm test to verify your setup', 'cyan');
}

async function main() {
  log('🚀 LinkedIn Automation System - Development Setup', 'bright');
  log('================================================', 'bright');
  
  try {
    await checkPrerequisites();
    await setupDirectories();
    await setupEnvironment();
    
    const runTestsNow = await question('\n🧪 Run setup tests now? (Y/n): ');
    if (runTestsNow.toLowerCase() !== 'n') {
      await runTests();
    }
    
    await showNextSteps();
    
  } catch (error) {
    log(`\n❌ Setup failed: ${error.message}`, 'red');
    process.exit(1);
  } finally {
    rl.close();
  }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  log('\n\n👋 Setup cancelled by user', 'yellow');
  rl.close();
  process.exit(0);
});

// Run the setup
if (require.main === module) {
  main();
}

module.exports = {
  checkPrerequisites,
  setupEnvironment,
  setupDirectories,
  generateRandomString
};