# OpenRouter Integration Guide

This guide explains how to integrate OpenRouter as a cost-effective alternative to OpenAI for AI content generation.

## What is OpenRouter?

OpenRouter is an API gateway that provides access to multiple AI models, including:
- **Free models**: Llama 3.1 8B, Phi-3 Mini, and others
- **Paid models**: GPT-4, Claude, Gemini, and many open-source models at competitive prices
- **Unified API**: OpenAI-compatible interface for easy integration

## Benefits of Using OpenRouter

### Cost Savings
- **Free tier**: Several models available at no cost
- **Lower prices**: Paid models often cost 50-90% less than direct API access
- **No monthly minimums**: Pay only for what you use

### Model Variety
- Access to 100+ models from different providers
- Compare performance across different models
- Switch models without code changes

### Reliability
- Automatic failover between providers
- Load balancing across multiple endpoints
- Better uptime than single-provider solutions

## Setup Instructions

### 1. Create OpenRouter Account

1. Visit [OpenRouter.ai](https://openrouter.ai)
2. Sign up for a free account
3. Go to [API Keys](https://openrouter.ai/keys)
4. Generate a new API key
5. Copy the key for configuration

### 2. Configure Environment Variables

Update your `.env` file:

```bash
# Enable OpenRouter
USE_OPENROUTER=true

# OpenRouter Configuration
OPENROUTER_API_KEY=sk-or-v1-your-api-key-here
OPENROUTER_MODEL=meta-llama/llama-3.1-8b-instruct:free

# Keep OpenAI config as fallback (optional)
USE_OPENROUTER=false
OPENAI_API_KEY=your_openai_key_here
OPENAI_MODEL=gpt-4
```

### 3. Restart the Server

```bash
# Stop the current server (Ctrl+C)
# Then restart
node simple-server.js
```

## Available Models

### Free Models (No Cost)

| Model | Provider | Best For |
|-------|----------|----------|
| `meta-llama/llama-3.1-8b-instruct:free` | Meta | General content, good quality |
| `microsoft/phi-3-mini-128k-instruct:free` | Microsoft | Fast responses, shorter content |
| `google/gemma-2-9b-it:free` | Google | Balanced performance |

### Popular Paid Models (Low Cost)

| Model | Provider | Cost/1M tokens | Best For |
|-------|----------|----------------|----------|
| `meta-llama/llama-3.1-70b-instruct` | Meta | ~$0.50 | High-quality content |
| `anthropic/claude-3-haiku` | Anthropic | ~$0.25 | Fast, efficient responses |
| `openai/gpt-4o-mini` | OpenAI | ~$0.15 | OpenAI quality, lower cost |

## Model Selection Guide

### For LinkedIn Content Generation

**Recommended Free Model:**
```bash
OPENROUTER_MODEL=meta-llama/llama-3.1-8b-instruct:free
```
- Excellent for professional content
- Good understanding of business context
- Free with reasonable rate limits

**Recommended Paid Model (Budget):**
```bash
OPENROUTER_MODEL=meta-llama/llama-3.1-70b-instruct
```
- Superior content quality
- Better context understanding
- ~90% cheaper than GPT-4

**Recommended Paid Model (Premium):**
```bash
OPENROUTER_MODEL=anthropic/claude-3-sonnet
```
- Excellent writing quality
- Great for professional content
- Still 60-80% cheaper than direct API

## Testing the Integration

### 1. Check Server Logs

After restarting, you should see:
```
[INFO] Content Generator initialized with OpenRouter
[INFO] Using model: meta-llama/llama-3.1-8b-instruct:free
```

### 2. Test Content Generation

1. Open the web interface: http://localhost:3004
2. Navigate to Content Templates
3. Create a new topic
4. Generate content
5. Check the generated content quality

### 3. Monitor Usage

- Visit [OpenRouter Usage](https://openrouter.ai/activity)
- Monitor API calls and costs
- Track model performance

## Switching Between Providers

### Quick Switch to OpenRouter
```bash
# In your .env file
USE_OPENROUTER=true
```

### Quick Switch to OpenAI
```bash
# In your .env file
USE_OPENROUTER=false
```

### Runtime Model Changes
You can change models without restarting by updating the environment variable and reloading the content generator.

## Cost Comparison

### Monthly Usage Example (1M tokens)

| Provider | Model | Cost |
|----------|-------|------|
| OpenAI Direct | GPT-4 | $30.00 |
| OpenRouter | GPT-4 | $25.00 |
| OpenRouter | Claude-3-Sonnet | $15.00 |
| OpenRouter | Llama-3.1-70B | $0.50 |
| OpenRouter | Llama-3.1-8B | **FREE** |

### Estimated Monthly Savings
- **Free tier**: Save $30/month (100% savings)
- **Llama 70B**: Save $29.50/month (98% savings)
- **Claude Sonnet**: Save $15/month (50% savings)

## Troubleshooting

### Common Issues

**Error: Invalid API Key**
- Verify your OpenRouter API key is correct
- Check that the key has sufficient credits
- Ensure no extra spaces in the .env file

**Error: Model Not Found**
- Check the model name spelling
- Verify the model is available on OpenRouter
- Some models require approval for access

**Poor Content Quality**
- Try a larger model (e.g., 70B instead of 8B)
- Adjust the temperature setting
- Modify the system prompts for better results

**Rate Limiting**
- Free models have usage limits
- Consider upgrading to paid models
- Implement request queuing for high volume

### Getting Help

1. **OpenRouter Documentation**: [docs.openrouter.ai](https://docs.openrouter.ai)
2. **OpenRouter Discord**: Community support and updates
3. **Model Comparisons**: [openrouter.ai/models](https://openrouter.ai/models)

## Advanced Configuration

### Custom Headers
For better tracking and analytics:

```javascript
// In contentGenerator.js, you can add:
this.openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
  defaultHeaders: {
    'HTTP-Referer': 'https://your-app-domain.com',
    'X-Title': 'LinkedIn Automation Tool'
  }
});
```

### Model Fallbacks
Implement automatic fallback to different models if one fails:

```javascript
const models = [
  'meta-llama/llama-3.1-8b-instruct:free',
  'microsoft/phi-3-mini-128k-instruct:free',
  'google/gemma-2-9b-it:free'
];
```

## Conclusion

OpenRouter provides an excellent alternative to OpenAI with:
- **Significant cost savings** (up to 100% with free models)
- **Multiple model options** for different use cases
- **Easy integration** with existing OpenAI-compatible code
- **Better reliability** through provider diversity

Start with the free Llama 3.1 8B model and upgrade based on your content quality needs and budget.