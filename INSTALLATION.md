# LinkedIn Automation System - Installation Guide

This guide will help you install and set up the LinkedIn Automation System on your local machine or server.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Manual Installation](#manual-installation)
4. [Configuration](#configuration)
5. [Database Setup](#database-setup)
6. [Deployment Options](#deployment-options)
7. [Verification](#verification)
8. [Troubleshooting](#troubleshooting)

## Prerequisites

### System Requirements

- **Operating System**: Windows 10/11, macOS 10.15+, or Linux (Ubuntu 18.04+)
- **Node.js**: Version 18.0.0 or higher
- **npm**: Version 8.0.0 or higher
- **Memory**: Minimum 4GB RAM (8GB recommended)
- **Storage**: At least 2GB free space
- **Network**: Internet connection for API access

### Required Software

1. **Node.js and npm**
   ```bash
   # Check if installed
   node --version
   npm --version
   
   # If not installed, download from https://nodejs.org/
   ```

2. **Git** (for cloning the repository)
   ```bash
   git --version
   ```

3. **PostgreSQL** (for database)
   - Option 1: Install locally from https://www.postgresql.org/download/
   - Option 2: Use Docker (recommended)

4. **Redis** (for caching and sessions)
   - Option 1: Install locally
   - Option 2: Use Docker (recommended)

5. **Docker and Docker Compose** (recommended for easy setup)
   ```bash
   docker --version
   docker-compose --version
   ```

### API Keys Required

1. **LinkedIn Developer Account**
   - Create an app at https://www.linkedin.com/developers/
   - Get Client ID and Client Secret
   - Set up OAuth redirect URLs

2. **OpenAI API Key**
   - Sign up at https://platform.openai.com/
   - Generate API key from https://platform.openai.com/api-keys

## Quick Start

### Option 1: Automated Setup (Recommended)

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd linkedin-automation-system
   ```

2. **Run the setup script**
   ```bash
   npm install
   npm run setup
   ```

3. **Follow the interactive prompts** to configure your environment

4. **Start with Docker** (easiest)
   ```bash
   npm run docker:up
   ```

5. **Verify installation**
   ```bash
   npm run monitor
   ```

### Option 2: Docker Compose (Quick)

1. **Clone and configure**
   ```bash
   git clone <repository-url>
   cd linkedin-automation-system
   cp .env.example .env
   # Edit .env with your API keys
   ```

2. **Start all services**
   ```bash
   docker-compose up -d
   ```

3. **Initialize database**
   ```bash
   docker-compose exec app npm run db:init
   ```

## Manual Installation

### Step 1: Clone and Install Dependencies

```bash
# Clone the repository
git clone <repository-url>
cd linkedin-automation-system

# Install Node.js dependencies
npm install

# Install additional dependencies for backup functionality
npm install archiver extract-zip redis ioredis
```

### Step 2: Database Setup

#### PostgreSQL Setup

**Option A: Local Installation**
```bash
# Install PostgreSQL (Ubuntu/Debian)
sudo apt update
sudo apt install postgresql postgresql-contrib

# Install PostgreSQL (macOS with Homebrew)
brew install postgresql
brew services start postgresql

# Install PostgreSQL (Windows)
# Download installer from https://www.postgresql.org/download/windows/
```

**Option B: Docker**
```bash
# Start PostgreSQL container
docker run --name linkedin-postgres \
  -e POSTGRES_DB=linkedin_automation \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=your_password \
  -p 5432:5432 \
  -d postgres:15
```

#### Redis Setup

**Option A: Local Installation**
```bash
# Install Redis (Ubuntu/Debian)
sudo apt install redis-server
sudo systemctl start redis-server

# Install Redis (macOS with Homebrew)
brew install redis
brew services start redis

# Install Redis (Windows)
# Use WSL or download from https://github.com/microsoftarchive/redis/releases
```

**Option B: Docker**
```bash
# Start Redis container
docker run --name linkedin-redis \
  -p 6379:6379 \
  -d redis:7-alpine
```

### Step 3: Environment Configuration

1. **Copy environment template**
   ```bash
   cp .env.example .env
   ```

2. **Edit .env file** with your configuration:
   ```bash
   # Required settings
   LINKEDIN_CLIENT_ID=your_linkedin_client_id
   LINKEDIN_CLIENT_SECRET=your_linkedin_client_secret
   OPENAI_API_KEY=your_openai_api_key
   
   # Database settings
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=linkedin_automation
   DB_USER=postgres
   DB_PASSWORD=your_password
   
   # Redis settings
   REDIS_HOST=localhost
   REDIS_PORT=6379
   
   # Security settings
   JWT_SECRET=your_jwt_secret_key
   ENCRYPTION_KEY=your_32_character_encryption_key
   ```

### Step 4: Initialize Database

```bash
# Initialize database schema
npm run db:init
```

### Step 5: Create Required Directories

```bash
# Create necessary directories
mkdir -p logs uploads data backups temp
```

## Configuration

### LinkedIn API Configuration

1. **Create LinkedIn App**
   - Go to https://www.linkedin.com/developers/
   - Click "Create App"
   - Fill in app details
   - Add OAuth 2.0 redirect URLs:
     - `http://localhost:3000/auth/linkedin/callback` (development)
     - `https://yourdomain.com/auth/linkedin/callback` (production)

2. **Get API Credentials**
   - Copy Client ID and Client Secret
   - Add to your `.env` file

### OpenAI Configuration

1. **Get API Key**
   - Sign up at https://platform.openai.com/
   - Go to https://platform.openai.com/api-keys
   - Create new secret key
   - Add to your `.env` file

2. **Configure Usage Limits** (optional)
   ```env
   OPENAI_MAX_TOKENS=1000
   OPENAI_MODEL=gpt-3.5-turbo
   ```

### Security Configuration

1. **Generate JWT Secret**
   ```bash
   # Generate a secure random string
   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
   ```

2. **Generate Encryption Key**
   ```bash
   # Generate 32-character encryption key
   node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
   ```

## Deployment Options

### Option 1: Docker Compose (Recommended)

```bash
# Development
docker-compose up -d

# Production
docker-compose -f docker-compose.prod.yml up -d
```

### Option 2: PM2 (Node.js Process Manager)

```bash
# Install PM2 globally
npm install -g pm2

# Start all services
npm run pm2:start

# Check status
npm run pm2:status
```

### Option 3: Manual Process Management

```bash
# Terminal 1: Main application
npm start

# Terminal 2: Scheduler worker
npm run worker:scheduler

# Terminal 3: Analytics worker
npm run worker:analytics
```

### Option 4: Automated Deployment

```bash
# Use the deployment script
npm run deploy
```

## Verification

### Health Check

```bash
# Run system monitor
npm run monitor

# Continuous monitoring
npm run monitor:watch
```

### API Testing

```bash
# Run setup tests
npm run test:setup

# Test API endpoints
curl http://localhost:3000/health
curl http://localhost:3000/api/health/database
curl http://localhost:3000/api/health/redis
```

### Web Interface

Open your browser and navigate to:
- **Main Application**: http://localhost:3000
- **Health Dashboard**: http://localhost:3000/health
- **API Documentation**: http://localhost:3000/api/docs (if enabled)

## Troubleshooting

### Common Issues

#### 1. Database Connection Failed

**Problem**: Cannot connect to PostgreSQL

**Solutions**:
```bash
# Check if PostgreSQL is running
sudo systemctl status postgresql  # Linux
brew services list | grep postgres  # macOS

# Check connection
psql -h localhost -U postgres -d linkedin_automation

# Reset database
dropdb linkedin_automation
createdb linkedin_automation
npm run db:init
```

#### 2. Redis Connection Failed

**Problem**: Cannot connect to Redis

**Solutions**:
```bash
# Check if Redis is running
redis-cli ping  # Should return PONG

# Start Redis
sudo systemctl start redis-server  # Linux
brew services start redis  # macOS

# Check Redis logs
sudo journalctl -u redis-server  # Linux
```

#### 3. Port Already in Use

**Problem**: Port 3000 is already in use

**Solutions**:
```bash
# Find process using port 3000
lsof -i :3000  # macOS/Linux
netstat -ano | findstr :3000  # Windows

# Kill the process
kill -9 <PID>  # macOS/Linux
taskkill /PID <PID> /F  # Windows

# Or change port in .env
echo "PORT=3001" >> .env
```

#### 4. LinkedIn API Errors

**Problem**: LinkedIn authentication fails

**Solutions**:
1. Verify Client ID and Secret in `.env`
2. Check redirect URLs in LinkedIn app settings
3. Ensure app is approved for required scopes
4. Check API rate limits

#### 5. OpenAI API Errors

**Problem**: Content generation fails

**Solutions**:
1. Verify API key in `.env`
2. Check OpenAI account billing and usage limits
3. Verify model availability (gpt-3.5-turbo, gpt-4)
4. Check API rate limits

#### 6. Permission Errors

**Problem**: Cannot create files/directories

**Solutions**:
```bash
# Fix directory permissions
sudo chown -R $USER:$USER .
chmod -R 755 .

# Create directories manually
mkdir -p logs uploads data backups temp
chmod 755 logs uploads data backups temp
```

### Log Files

Check log files for detailed error information:
```bash
# Application logs
tail -f logs/app.log

# Error logs
tail -f logs/error.log

# Scheduler logs
tail -f logs/scheduler.log

# Analytics logs
tail -f logs/analytics.log
```

### Getting Help

1. **Check the logs** first for specific error messages
2. **Run the monitor** to get system health status
3. **Verify configuration** in `.env` file
4. **Test individual components** (database, Redis, APIs)
5. **Check firewall and network settings**
6. **Review system requirements** and dependencies

### Useful Commands

```bash
# System information
node --version
npm --version
docker --version
psql --version
redis-cli --version

# Service status
npm run pm2:status
docker-compose ps
sudo systemctl status postgresql redis-server

# Restart services
npm run pm2:restart
docker-compose restart
sudo systemctl restart postgresql redis-server

# Clean installation
npm run docker:down
docker system prune -a
rm -rf node_modules
npm install
```

## Next Steps

After successful installation:

1. **Configure LinkedIn Integration**: Set up your LinkedIn app and test authentication
2. **Configure Content Generation**: Test OpenAI integration and content templates
3. **Set Up Monitoring**: Configure alerts and monitoring dashboards
4. **Create Backups**: Set up automated backup schedules
5. **Security Hardening**: Review security settings for production
6. **Performance Tuning**: Optimize database and Redis configurations

For detailed usage instructions, see the main [README.md](README.md) file.