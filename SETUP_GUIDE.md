# LinkedIn Automation System - Setup Guide

## 🚀 Quick Start with LinkedIn API Keys

Now that you have your LinkedIn API keys, follow these steps to configure and test your system:

## Step 1: Configure Environment Variables

1. **Open the `.env` file** in the root directory
2. **Replace the placeholder values** with your actual LinkedIn API credentials:

```bash
# Replace these with your actual LinkedIn API credentials
LINKEDIN_CLIENT_ID=your_actual_client_id_here
LINKEDIN_CLIENT_SECRET=your_actual_client_secret_here
```

## Step 2: LinkedIn App Configuration

Make sure your LinkedIn app is configured with these settings:

### Redirect URIs
Add this redirect URI in your LinkedIn app settings:
```
http://localhost:3000/api/linkedin/callback
```

### Required Permissions
Ensure your app has these permissions:
- `r_liteprofile` - Read basic profile info
- `r_emailaddress` - Read email address
- `w_member_social` - Post on behalf of user

## Step 3: Test the System

### 3.1 Start the Backend Server
```bash
# In the root directory
npm install
npm start
```

### 3.2 Start the Frontend
```bash
# In a new terminal, navigate to client directory
cd client
npm install
npm start
```

### 3.3 Test LinkedIn Authentication
1. Open your browser to `http://localhost:3001`
2. Click on "Connect LinkedIn" or similar button
3. You should be redirected to LinkedIn for authorization
4. After authorization, you should be redirected back to your app

## Step 4: Verify Integration

### Test API Endpoints
You can test these endpoints using a tool like Postman or curl:

```bash
# Health check
curl http://localhost:3000/health

# LinkedIn auth URL
curl http://localhost:3000/api/linkedin/auth

# User profile (after authentication)
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" http://localhost:3000/api/linkedin/profile
```

## Step 5: Optional Configuration

### OpenAI API (for content generation)
If you want to use AI content generation:
1. Get an API key from [OpenAI](https://platform.openai.com/api-keys)
2. Add it to your `.env` file:
```bash
OPENAI_API_KEY=your_openai_api_key_here
```

### Database Setup (Optional)
For production use, set up PostgreSQL:
1. Install PostgreSQL
2. Create a database named `linkedin_automation`
3. Update database credentials in `.env`

## 🔧 Troubleshooting

### Common Issues

1. **"Invalid redirect URI" error**
   - Ensure the redirect URI in your LinkedIn app matches exactly: `http://localhost:3000/api/linkedin/callback`

2. **"Invalid client credentials" error**
   - Double-check your `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET` in the `.env` file

3. **CORS errors**
   - Make sure `FRONTEND_URL=http://localhost:3001` is set correctly in `.env`

4. **Server won't start**
   - Run `npm install` to ensure all dependencies are installed
   - Check that port 3000 is not already in use

### Debug Mode
Enable debug mode for more detailed logging:
```bash
DEBUG_MODE=true
VERBOSE_LOGGING=true
```

## 📝 Next Steps

Once your LinkedIn integration is working:

1. **Test Content Creation**: Try creating and scheduling a test post
2. **Configure Optimal Timing**: Set up your posting schedule
3. **Customize Templates**: Create content templates for your brand
4. **Monitor Analytics**: Check the analytics dashboard for insights

## 🔐 Security Notes

- Never commit your `.env` file to version control
- Use strong, unique passwords for all services
- Consider using environment-specific configurations for production
- Regularly rotate your API keys

## 📞 Support

If you encounter any issues:
1. Check the console logs for error messages
2. Verify your LinkedIn app configuration
3. Ensure all environment variables are set correctly
4. Test with a simple LinkedIn API call first

---

**Ready to test?** Start with Step 1 and work through each step systematically. The system should be fully functional once your LinkedIn API keys are properly configured!