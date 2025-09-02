// Simple test server to check basic functionality
require('dotenv').config();

console.log('Starting test server...');
console.log('Environment variables loaded:');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('PORT:', process.env.PORT);
console.log('LINKEDIN_CLIENT_ID:', process.env.LINKEDIN_CLIENT_ID ? 'Set' : 'Not set');

try {
  const express = require('express');
  console.log('Express loaded successfully');
  
  const app = express();
  const PORT = 3005; // Use different port to avoid conflicts
  
  app.get('/health', (req, res) => {
    res.json({ 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development'
    });
  });
  
  app.get('/test-linkedin', (req, res) => {
    res.json({
      linkedin_client_id: process.env.LINKEDIN_CLIENT_ID ? 'Configured' : 'Not configured',
      linkedin_client_secret: process.env.LINKEDIN_CLIENT_SECRET ? 'Configured' : 'Not configured',
      redirect_uri: process.env.LINKEDIN_REDIRECT_URI || 'Not set'
    });
  });
  
  app.listen(PORT, () => {
    console.log(`✅ Test server running on port ${PORT}`);
    console.log(`🔗 Health check: http://localhost:${PORT}/health`);
    console.log(`🔗 LinkedIn test: http://localhost:${PORT}/test-linkedin`);
  });
  
} catch (error) {
  console.error('❌ Error starting test server:', error.message);
  console.error('Stack trace:', error.stack);
  process.exit(1);
}