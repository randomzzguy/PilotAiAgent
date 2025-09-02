# LinkedIn Automation System

An intelligent, AI-powered system for automated LinkedIn content creation and posting, optimized for the Abu Dhabi market with advanced scheduling, analytics, and engagement tracking.

## 🚀 Features

### Core Functionality
- **AI Content Generation**: Create engaging LinkedIn posts using OpenAI GPT models
- **Automated Scheduling**: Smart posting at optimal times for Abu Dhabi audience
- **LinkedIn Integration**: Full OAuth authentication and posting capabilities
- **Analytics & Insights**: Comprehensive engagement tracking and performance analysis
- **Content Management**: Topic-based content organization and template system

### Content Types Supported
- Text posts with hashtags
- Multi-image posts (carousel)
- Poll posts with custom options
- Document attachments (planned)
- Video posts (planned)

### Advanced Features
- **Optimal Timing**: Research-based posting times for Abu Dhabi market
- **Engagement Analytics**: Real-time metrics and historical trends
- **Content Templates**: Reusable templates for consistent branding
- **Bulk Operations**: Schedule multiple posts efficiently
- **Rate Limiting**: Respect LinkedIn API limits and user plan restrictions

## 📋 Prerequisites

- Node.js 18+ and npm
- PostgreSQL 13+
- LinkedIn Developer Account
- OpenAI API Account
- Redis (optional, for caching)

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd linkedin-automation-system
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` with your configuration:
   ```env
   # Server Configuration
   PORT=3000
   NODE_ENV=development
   
   # Database
   DATABASE_URL=postgresql://username:password@localhost:5432/linkedin_automation
   
   # LinkedIn API
   LINKEDIN_CLIENT_ID=your_linkedin_client_id
   LINKEDIN_CLIENT_SECRET=your_linkedin_client_secret
   LINKEDIN_REDIRECT_URI=http://localhost:3000/api/linkedin/auth/callback
   
   # OpenAI
   OPENAI_API_KEY=your_openai_api_key
   OPENAI_MODEL=gpt-4
   
   # Security
   JWT_SECRET=your_jwt_secret_key
   ENCRYPTION_KEY=your_32_character_encryption_key
   ```

4. **Set up the database**
   ```bash
   npm run db:setup
   ```

5. **Start the development server**
   ```bash
   npm run dev
   ```

## 🔧 Configuration

### LinkedIn App Setup

1. Go to [LinkedIn Developer Portal](https://developer.linkedin.com/)
2. Create a new app with these permissions:
   - `r_liteprofile` (Read profile)
   - `w_member_social` (Post on behalf of user)
   - `r_member_social` (Read posts and analytics)
3. Set redirect URI to: `http://localhost:3000/api/linkedin/auth/callback`
4. Copy Client ID and Secret to your `.env` file

### AI Content Generation Setup

**Option 1: OpenAI (Paid)**
1. Get API key from [OpenAI Platform](https://platform.openai.com/)
2. Add to `.env` file: `OPENAI_API_KEY=your_key_here`
3. Set `USE_OPENROUTER=false`

**Option 2: OpenRouter (Free/Paid)**
1. Get API key from [OpenRouter](https://openrouter.ai/keys)
2. Add to `.env` file: `OPENROUTER_API_KEY=your_key_here`
3. Set `USE_OPENROUTER=true`
4. Choose from free models like `meta-llama/llama-3.1-8b-instruct:free`

📖 **See [OPENROUTER_SETUP.md](./OPENROUTER_SETUP.md) for detailed OpenRouter configuration**

### Database Schema

The system automatically creates these tables:
- `users` - User accounts and preferences
- `content_topics` - Content categories and themes
- `content_templates` - Reusable post templates
- `generated_content` - AI-generated posts
- `scheduled_posts` - Posting schedule
- `analytics` - Engagement metrics
- `linkedin_tokens` - OAuth tokens
- `api_usage` - Usage tracking

## 📚 API Documentation

### Authentication

#### Register User
```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword",
  "firstName": "John",
  "lastName": "Doe"
}
```

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword"
}
```

### LinkedIn Integration

#### Get Authorization URL
```http
GET /api/linkedin/auth/url
Authorization: Bearer <jwt_token>
```

#### Connect LinkedIn Account
```http
POST /api/linkedin/auth/callback
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "code": "authorization_code_from_linkedin",
  "state": "optional_state_parameter"
}
```

### Content Management

#### Create Content Topic
```http
POST /api/content/topics
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "title": "Technology Trends",
  "description": "Latest developments in AI and tech",
  "industry": "Technology",
  "targetAudience": "Tech professionals",
  "keywords": ["AI", "technology", "innovation"]
}
```

#### Generate Content
```http
POST /api/content/generate
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "topicId": "uuid-of-topic",
  "contentType": "text",
  "variations": 3,
  "customPrompt": "Focus on recent AI developments"
}
```

#### Schedule Post
```http
POST /api/content/schedule
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "contentId": "uuid-of-generated-content",
  "scheduledFor": "2024-01-15T08:00:00Z",
  "priority": "high"
}
```

### Analytics

#### Get Analytics Overview
```http
GET /api/analytics/overview?period=month
Authorization: Bearer <jwt_token>
```

#### Get Post Analytics
```http
GET /api/analytics/posts/{post_id}
Authorization: Bearer <jwt_token>
```

## 🕐 Optimal Posting Times (Abu Dhabi)

Based on research, the system uses these optimal posting times:

### Weekdays
- **Morning**: 8:00-10:00 AM GST
- **Evening**: 6:00-8:00 PM GST

### Weekends
- **Saturday**: 10:00 AM-12:00 PM GST
- **Sunday**: 7:00-9:00 PM GST

### Special Considerations
- **Ramadan**: Adjusted times (7:00-9:00 PM)
- **UAE National Day**: Patriotic content performs better
- **Business Hours**: B2B content works best 9:00 AM-5:00 PM

## 📊 Content Strategy

### High-Performing Content Types
1. **Multi-image posts** (6.60% engagement rate)
2. **Document attachments** (6.10% engagement rate)
3. **Native videos** (5.60% engagement rate)
4. **Poll posts** (highest impressions)
5. **Text posts with questions** (good engagement)

### Content Guidelines
- Use 3-5 relevant hashtags
- Include call-to-action questions
- Share personal insights and stories
- Post industry-relevant content
- Maintain consistent posting schedule

## 🔒 Security Features

- JWT-based authentication
- Encrypted token storage
- Rate limiting on all endpoints
- Input validation and sanitization
- CORS protection
- Helmet.js security headers
- Plan-based usage limits

## 📈 Monitoring & Logging

### Log Files
- `logs/error.log` - Error messages
- `logs/combined.log` - All log levels
- `logs/exceptions.log` - Uncaught exceptions
- `logs/rejections.log` - Unhandled promise rejections

### Metrics Tracked
- API response times
- Content generation success rates
- LinkedIn posting success rates
- User engagement patterns
- System resource usage

## 🚀 Deployment

### Production Setup

1. **Environment Configuration**
   ```bash
   NODE_ENV=production
   DATABASE_URL=postgresql://prod_user:password@prod_host:5432/linkedin_automation
   REDIS_URL=redis://prod_redis:6379
   ```

2. **Build and Start**
   ```bash
   npm run build
   npm start
   ```

3. **Process Management**
   ```bash
   # Using PM2
   npm install -g pm2
   pm2 start ecosystem.config.js
   ```

### Docker Deployment

```dockerfile
# Dockerfile example
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run integration tests
npm run test:integration

# Run linting
npm run lint
```

## 📝 Scripts

- `npm start` - Start production server
- `npm run dev` - Start development server with nodemon
- `npm run build` - Build for production
- `npm test` - Run test suite
- `npm run db:setup` - Initialize database
- `npm run db:migrate` - Run database migrations
- `npm run db:seed` - Seed database with sample data
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix linting issues

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

### Common Issues

**LinkedIn Authentication Fails**
- Verify redirect URI matches exactly
- Check LinkedIn app permissions
- Ensure client ID/secret are correct

**Content Generation Errors**
- Verify OpenAI API key and credits
- Check content topic configuration
- Review rate limiting settings

**Database Connection Issues**
- Verify PostgreSQL is running
- Check database URL format
- Ensure database exists and user has permissions

### Getting Help

- Check the [Issues](https://github.com/your-repo/issues) page
- Review the [Wiki](https://github.com/your-repo/wiki) for detailed guides
- Contact support at support@yourcompany.com

## 🔮 Roadmap

### Phase 1 (Current)
- ✅ Basic content generation
- ✅ LinkedIn posting
- ✅ Analytics tracking
- ✅ Scheduling system

### Phase 2 (Next)
- 🔄 Video content support
- 🔄 Advanced analytics dashboard
- 🔄 Multi-account management
- 🔄 Content approval workflow

### Phase 3 (Future)
- 📋 Instagram integration
- 📋 Twitter/X integration
- 📋 AI-powered content optimization
- 📋 Team collaboration features

---

**Built with ❤️ for the Abu Dhabi business community**