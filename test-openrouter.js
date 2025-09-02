#!/usr/bin/env node

/**
 * OpenRouter Integration Test Script
 * 
 * This script tests the OpenRouter integration without affecting the main application.
 * Run with: node test-openrouter.js
 */

require('dotenv').config();
const OpenAI = require('openai');

async function testOpenRouter() {
  console.log('🧪 Testing OpenRouter Integration...');
  console.log('=' .repeat(50));

  // Check environment variables
  const useOpenRouter = process.env.USE_OPENROUTER === 'true';
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const openAIKey = process.env.OPENAI_API_KEY;
  const model = useOpenRouter ? 
    (process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.1-8b-instruct:free') :
    (process.env.OPENAI_MODEL || 'gpt-4');

  console.log(`📊 Configuration:`);
  console.log(`   Use OpenRouter: ${useOpenRouter}`);
  console.log(`   Model: ${model}`);
  console.log(`   OpenRouter Key: ${openRouterKey ? '✅ Set' : '❌ Missing'}`);
  console.log(`   OpenAI Key: ${openAIKey ? '✅ Set' : '❌ Missing'}`);
  console.log('');

  // Validate configuration
  if (useOpenRouter && !openRouterKey) {
    console.error('❌ Error: USE_OPENROUTER=true but OPENROUTER_API_KEY is missing');
    console.log('💡 Solution: Add OPENROUTER_API_KEY to your .env file');
    process.exit(1);
  }

  if (!useOpenRouter && !openAIKey) {
    console.error('❌ Error: USE_OPENROUTER=false but OPENAI_API_KEY is missing');
    console.log('💡 Solution: Add OPENAI_API_KEY to your .env file or set USE_OPENROUTER=true');
    process.exit(1);
  }

  // Initialize client
  let client;
  try {
    if (useOpenRouter) {
      client = new OpenAI({
        apiKey: openRouterKey,
        baseURL: 'https://openrouter.ai/api/v1'
      });
      console.log('🔗 Connected to OpenRouter API');
    } else {
      client = new OpenAI({
        apiKey: openAIKey
      });
      console.log('🔗 Connected to OpenAI API');
    }
  } catch (error) {
    console.error('❌ Failed to initialize API client:', error.message);
    process.exit(1);
  }

  // Test content generation
  console.log('\n🎯 Testing Content Generation...');
  const testPrompt = `Create a professional LinkedIn post about the benefits of AI automation in business. 
Target audience: Business professionals in Abu Dhabi/UAE.
Tone: Professional but engaging.
Length: 2-3 paragraphs with relevant hashtags.`;

  try {
    const startTime = Date.now();
    
    const completion = await client.chat.completions.create({
      model: model,
      messages: [
        {
          role: 'system',
          content: 'You are an expert LinkedIn content creator specializing in the Abu Dhabi/UAE market. Create engaging, professional content that resonates with local business culture.'
        },
        {
          role: 'user',
          content: testPrompt
        }
      ],
      max_tokens: 500,
      temperature: 0.7
    });

    const duration = Date.now() - startTime;
    const generatedContent = completion.choices[0].message.content;

    console.log('✅ Content Generation Successful!');
    console.log(`⏱️  Response Time: ${duration}ms`);
    console.log(`📊 Tokens Used: ${completion.usage?.total_tokens || 'N/A'}`);
    console.log(`📝 Content Length: ${generatedContent.length} characters`);
    console.log('');
    console.log('📄 Generated Content:');
    console.log('-'.repeat(50));
    console.log(generatedContent);
    console.log('-'.repeat(50));

    // Cost estimation (approximate)
    if (useOpenRouter && completion.usage?.total_tokens) {
      const tokens = completion.usage.total_tokens;
      let estimatedCost = 0;
      
      if (model.includes(':free')) {
        estimatedCost = 0;
      } else if (model.includes('llama-3.1-70b')) {
        estimatedCost = (tokens / 1000000) * 0.50; // ~$0.50 per 1M tokens
      } else if (model.includes('claude-3-haiku')) {
        estimatedCost = (tokens / 1000000) * 0.25; // ~$0.25 per 1M tokens
      } else {
        estimatedCost = (tokens / 1000000) * 1.00; // Default estimate
      }
      
      console.log(`💰 Estimated Cost: $${estimatedCost.toFixed(6)}`);
    }

  } catch (error) {
    console.error('❌ Content Generation Failed:', error.message);
    
    if (error.message.includes('401')) {
      console.log('💡 Solution: Check your API key is correct and has sufficient credits');
    } else if (error.message.includes('404')) {
      console.log('💡 Solution: Check the model name is correct and available');
    } else if (error.message.includes('rate_limit')) {
      console.log('💡 Solution: You\'ve hit rate limits. Wait a moment or upgrade your plan');
    }
    
    process.exit(1);
  }

  console.log('\n🎉 OpenRouter Integration Test Complete!');
  console.log('✅ Your system is ready to generate AI content');
  
  if (useOpenRouter) {
    console.log('\n💡 Next Steps:');
    console.log('   1. Start your server: node simple-server.js');
    console.log('   2. Open the web interface: http://localhost:3004');
    console.log('   3. Create content topics and generate posts');
    console.log('   4. Monitor usage at: https://openrouter.ai/activity');
  }
}

// Handle errors gracefully
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled Error:', error.message);
  process.exit(1);
});

// Run the test
testOpenRouter().catch(console.error);