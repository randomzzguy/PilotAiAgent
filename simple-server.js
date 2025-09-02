const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Basic middleware
app.use(cors({
  origin: 'http://localhost:3004',
  credentials: true
}));
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'LinkedIn Automation System',
    version: '1.0.0'
  });
});

// Mock analytics endpoints to fix the 404 errors
app.get('/api/analytics/dashboard', (req, res) => {
  res.json({
    success: true,
    data: {
      overview: {
        total_posts: 0,
        total_likes: 0,
        total_comments: 0,
        total_shares: 0,
        avg_engagement_rate: 0,
        posts_per_day: 0
      },
      topPosts: [],
      engagementTrends: [],
      audienceGrowth: [],
      insights: 'No dashboard data available in demo mode'
    }
  });
});

app.get('/api/analytics/competitive', (req, res) => {
  res.json({
    success: true,
    data: {
      competitors: [],
      insights: 'No competitive data available in demo mode'
    }
  });
});

app.get('/api/analytics/roi', (req, res) => {
  res.json({
    success: true,
    data: {
      roi: 0,
      roi_ratio: 0,
      metrics: 'No ROI data available in demo mode'
    }
  });
});

app.get('/api/analytics/realtime', (req, res) => {
  res.json({
    success: true,
    data: {
      active_users: 0,
      recent_posts: [],
      live_engagement: 0,
      insights: 'No real-time data available in demo mode'
    }
  });
});

// LinkedIn auth endpoints
app.get('/api/linkedin/auth', (req, res) => {
  const authUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${process.env.LINKEDIN_CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.LINKEDIN_REDIRECT_URI)}&scope=r_liteprofile%20r_emailaddress%20w_member_social`;
  res.json({ authUrl });
});

app.get('/api/linkedin/callback', (req, res) => {
  res.json({ success: true, message: 'LinkedIn authentication successful' });
});

// Catch all other API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    error: 'API endpoint not found',
    message: 'This endpoint is not available in demo mode'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Simple LinkedIn Automation Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

module.exports = app;