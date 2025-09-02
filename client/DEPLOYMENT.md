# LinkedIn Content Generator - Deployment Guide

## Vercel Deployment Instructions

### Prerequisites
1. GitHub account
2. Vercel account (free tier available)
3. Domain configured in Squarespace

### Step 1: Prepare Repository
1. Push your code to a GitHub repository
2. Ensure `.env.local` is in `.gitignore` (already configured)
3. Only commit `.env.example` file

### Step 2: Deploy to Vercel
1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. Click "New Project"
3. Import your GitHub repository
4. Vercel will automatically detect it's a React app
5. Click "Deploy"

### Step 3: Configure Environment Variables
In Vercel Dashboard > Project Settings > Environment Variables, add:

```
REACT_APP_ACCESS_PASSWORD=your_secure_password_here
REACT_APP_API_URL=https://your-api-domain.com (if using backend)
REACT_APP_APP_NAME=LinkedIn Content Generator
REACT_APP_COMPANY_NAME=Your Company Name
REACT_APP_ENABLE_PASSWORD_PROTECTION=true
REACT_APP_ENVIRONMENT=production
```

### Step 4: Configure Custom Domain (Subdomain)
1. In Vercel Dashboard > Project Settings > Domains
2. Add your subdomain: `linkedin.yourdomain.com`
3. Vercel will provide DNS records

### Step 5: Configure DNS in Squarespace
1. Go to Squarespace > Settings > Domains > DNS
2. Add a CNAME record:
   - **Name**: `linkedin`
   - **Value**: `cname.vercel-dns.com`

### Step 6: Security Configuration
- Password protection is already implemented
- Search engine indexing is disabled
- Security headers are configured in `vercel.json`

### Step 7: Test Deployment
1. Wait for DNS propagation (up to 24 hours)
2. Visit `https://linkedin.yourdomain.com`
3. Test password protection
4. Verify content generation functionality

## Local Development

### Setup
```bash
npm install
cp .env.example .env.local
# Edit .env.local with your settings
npm start
```

### Build and Test
```bash
npm run build
npm run preview
```

## Security Features
- Password protection on app level
- No search engine indexing
- Security headers configured
- Environment variables for sensitive data

## Troubleshooting

### Common Issues
1. **DNS not resolving**: Wait up to 24 hours for propagation
2. **Password not working**: Check environment variables in Vercel
3. **Build fails**: Check for TypeScript errors in logs

### Support
- Check Vercel deployment logs for errors
- Verify environment variables are set correctly
- Ensure DNS records are configured properly

## Cost
- Vercel: Free tier (sufficient for single user)
- Domain: Already owned
- Total additional cost: $0