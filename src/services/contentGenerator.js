const OpenAI = require('openai');
const logger = require('../utils/logger');
const { pool } = require('../database/init');
const imageGenerator = require('./imageGenerator');

class ContentGenerator {
  constructor() {
    // Support both OpenAI and OpenRouter
    const useOpenRouter = process.env.USE_OPENROUTER === 'true';
    
    if (useOpenRouter) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENROUTER_API_KEY,
        baseURL: 'https://openrouter.ai/api/v1'
      });
      this.model = process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.1-8b-instruct:free';
    } else {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
      this.model = process.env.OPENAI_MODEL || 'gpt-4';
    }
    
    this.maxTokens = parseInt(process.env.OPENAI_MAX_TOKENS) || 1000;
    this.useOpenRouter = useOpenRouter;
  }

  /**
   * Generate LinkedIn content based on topic and preferences
   */
  async generateContent(userId, topicId, contentType = 'text', customPrompt = null, includeImage = false) {
    try {
      const startTime = Date.now();
      
      // Get user preferences and topic details
      const [userPrefs, topicDetails] = await Promise.all([
        this.getUserPreferences(userId),
        this.getTopicDetails(topicId)
      ]);

      // Build the AI prompt
      const prompt = customPrompt || await this.buildPrompt(contentType, topicDetails, userPrefs);
      
      logger.content('Generating content', {
        userId,
        topicId,
        contentType,
        promptLength: prompt.length
      });

      // Generate content using OpenAI
      const completion = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: this.getSystemPrompt(contentType, userPrefs)
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: this.maxTokens,
        temperature: 0.7,
        presence_penalty: 0.1,
        frequency_penalty: 0.1
      });

      const generatedText = completion.choices[0].message.content;
      
      // Parse the generated content
      const parsedContent = this.parseGeneratedContent(generatedText, contentType);
      
      // Generate image if requested
      let imageData = null;
      if (includeImage) {
        try {
          imageData = await this.generateContentImage(parsedContent, contentType, topicDetails);
        } catch (error) {
          logger.error('Image generation failed, continuing without image:', error);
        }
      }
      
      // Save to database
      const contentId = await this.saveGeneratedContent({
        userId,
        topicId,
        contentType,
        ...parsedContent,
        imageData,
        aiPrompt: prompt,
        aiModel: this.model
      });

      const duration = Date.now() - startTime;
      logger.performance('Content generation', duration, {
        userId,
        contentType,
        contentLength: generatedText.length
      });

      return {
        id: contentId,
        ...parsedContent,
        imageData,
        metadata: {
          model: this.model,
          tokensUsed: completion.usage.total_tokens,
          generationTime: duration
        }
      };
    } catch (error) {
      logger.error('Content generation failed:', error);
      throw new Error(`Content generation failed: ${error.message}`);
    }
  }

  /**
   * Get system prompt based on content type and user preferences
   */
  getSystemPrompt(contentType, userPrefs) {
    const basePrompt = `You are an expert LinkedIn content creator specializing in the Abu Dhabi/UAE market. You understand:
- Local business culture and professional norms
- Optimal posting times (8:30 AM, 1:00 PM, 8:30 PM UAE time)
- High-engagement content formats
- Professional Arabic and English communication styles

Key guidelines:
- Write in a ${userPrefs.tone || 'professional'} tone
- Focus on value-driven content that educates or inspires
- Use relevant industry insights and local market knowledge
- Include call-to-actions that encourage meaningful engagement
- Respect cultural sensitivities and business etiquette
- Optimize for LinkedIn's algorithm preferences`;

    const typeSpecificPrompts = {
      text: `${basePrompt}

For text posts:
- Keep content between 150-300 words for optimal engagement
- Use line breaks and emojis strategically
- Include 3-5 relevant hashtags
- End with an engaging question or call-to-action`,
      
      multi_image: `${basePrompt}

For multi-image carousel posts:
- Create content for 3-5 slides
- Each slide should have a clear, concise message (max 50 words)
- Use storytelling structure: hook → value → conclusion
- Include slide titles and descriptions
- Suggest visual elements for each slide`,
      
      video: `${basePrompt}

For video posts:
- Create a script for 60-90 seconds
- Strong hook in first 3 seconds
- Include captions/subtitles suggestions
- Clear value proposition
- End with strong call-to-action`,
      
      poll: `${basePrompt}

For poll posts:
- Create engaging, opinion-sparking questions
- Provide 2-4 clear poll options
- Include context that encourages discussion
- Ask follow-up questions in comments`,
      
      document: `${basePrompt}

For document/PDF posts:
- Create structured, educational content
- Use clear headings and bullet points
- Include actionable insights or frameworks
- Design for easy reading and sharing`
    };

    return typeSpecificPrompts[contentType] || typeSpecificPrompts.text;
  }

  /**
   * Build content generation prompt
   */
  async buildPrompt(contentType, topicDetails, userPrefs) {
    const { title, description, keywords, target_audience, industry } = topicDetails;
    const { brand_voice, excluded_topics } = userPrefs;

    let prompt = `Create a LinkedIn ${contentType} post about: ${title}

`;
    
    if (description) {
      prompt += `Topic Description: ${description}

`;
    }
    
    if (keywords && keywords.length > 0) {
      prompt += `Key Keywords to include: ${keywords.join(', ')}

`;
    }
    
    if (target_audience) {
      prompt += `Target Audience: ${target_audience}

`;
    }
    
    if (industry) {
      prompt += `Industry Context: ${industry}

`;
    }
    
    if (brand_voice) {
      prompt += `Brand Voice Guidelines: ${brand_voice}

`;
    }
    
    if (excluded_topics && excluded_topics.length > 0) {
      prompt += `Avoid these topics: ${excluded_topics.join(', ')}

`;
    }

    // Add Abu Dhabi/UAE specific context
    prompt += `Context: This content is for professionals in Abu Dhabi/UAE. Consider:
`;
    prompt += `- Local business environment and opportunities
`;
    prompt += `- Cultural diversity and international business presence
`;
    prompt += `- Innovation and technology adoption in the region
`;
    prompt += `- Professional development and networking culture

`;

    // Add content type specific instructions
    const typeInstructions = {
      text: 'Format as a complete LinkedIn text post with hashtags.',
      multi_image: 'Format as: SLIDE 1: [Title] [Content] | SLIDE 2: [Title] [Content] | etc.',
      video: 'Format as: VIDEO SCRIPT: [Hook] [Main Content] [Call-to-Action] | CAPTIONS: [Key points]',
      poll: 'Format as: POLL QUESTION: [Question] | OPTIONS: [Option 1, Option 2, etc.] | CONTEXT: [Supporting text]',
      document: 'Format as: TITLE: [Title] | CONTENT: [Structured content with headings and bullet points]'
    };

    prompt += typeInstructions[contentType] || typeInstructions.text;

    return prompt;
  }

  /**
   * Parse generated content based on type
   */
  parseGeneratedContent(generatedText, contentType) {
    const result = {
      title: '',
      content_text: generatedText,
      hashtags: [],
      media_urls: []
    };

    try {
      switch (contentType) {
        case 'multi_image':
          result.slides = this.parseCarouselContent(generatedText);
          break;
        case 'video':
          result.script = this.parseVideoContent(generatedText);
          break;
        case 'poll':
          result.poll = this.parsePollContent(generatedText);
          break;
        case 'document':
          result.document = this.parseDocumentContent(generatedText);
          break;
        default:
          // Extract hashtags from text content
          const hashtagMatch = generatedText.match(/#\w+/g);
          if (hashtagMatch) {
            result.hashtags = hashtagMatch;
          }
      }
    } catch (error) {
      logger.error('Error parsing generated content:', error);
    }

    return result;
  }

  /**
   * Parse carousel content into slides
   */
  parseCarouselContent(text) {
    const slides = [];
    const slideMatches = text.match(/SLIDE \d+:([^|]+)/g);
    
    if (slideMatches) {
      slideMatches.forEach((match, index) => {
        const content = match.replace(/SLIDE \d+:\s*/, '').trim();
        const [title, ...bodyParts] = content.split('\n');
        slides.push({
          slideNumber: index + 1,
          title: title.trim(),
          content: bodyParts.join('\n').trim()
        });
      });
    }
    
    return slides;
  }

  /**
   * Parse video content
   */
  parseVideoContent(text) {
    const scriptMatch = text.match(/VIDEO SCRIPT:([^|]+)/s);
    const captionsMatch = text.match(/CAPTIONS:([^|]+)/s);
    
    return {
      script: scriptMatch ? scriptMatch[1].trim() : text,
      captions: captionsMatch ? captionsMatch[1].trim() : ''
    };
  }

  /**
   * Parse poll content
   */
  parsePollContent(text) {
    const questionMatch = text.match(/POLL QUESTION:([^|]+)/s);
    const optionsMatch = text.match(/OPTIONS:([^|]+)/s);
    const contextMatch = text.match(/CONTEXT:([^|]+)/s);
    
    let options = [];
    if (optionsMatch) {
      options = optionsMatch[1].split(',').map(opt => opt.trim());
    }
    
    return {
      question: questionMatch ? questionMatch[1].trim() : '',
      options,
      context: contextMatch ? contextMatch[1].trim() : ''
    };
  }

  /**
   * Parse document content
   */
  parseDocumentContent(text) {
    const titleMatch = text.match(/TITLE:([^|]+)/s);
    const contentMatch = text.match(/CONTENT:([^|]+)/s);
    
    return {
      title: titleMatch ? titleMatch[1].trim() : '',
      content: contentMatch ? contentMatch[1].trim() : text
    };
  }

  /**
   * Get user preferences from database
   */
  async getUserPreferences(userId) {
    const client = await pool.connect();
    try {
      const result = await client.query(`
        SELECT up.*, u.company_name, u.timezone
        FROM user_preferences up
        JOIN users u ON u.id = up.user_id
        WHERE up.user_id = $1
      `, [userId]);
      
      return result.rows[0] || {
        tone: 'professional',
        brand_voice: null,
        excluded_topics: [],
        auto_hashtags: true,
        max_hashtags: 10
      };
    } finally {
      client.release();
    }
  }

  /**
   * Get topic details from database
   */
  async getTopicDetails(topicId) {
    const client = await pool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM content_topics WHERE id = $1',
        [topicId]
      );
      
      if (result.rows.length === 0) {
        throw new Error('Topic not found');
      }
      
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  /**
   * Save generated content to database
   */
  async saveGeneratedContent(contentData) {
    const client = await pool.connect();
    try {
      const result = await client.query(`
        INSERT INTO generated_content (
          user_id, topic_id, content_type, title, content_text, 
          hashtags, image_data, ai_prompt, ai_model, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id
      `, [
        contentData.userId,
        contentData.topicId,
        contentData.contentType,
        contentData.title,
        JSON.stringify(contentData),
        contentData.hashtags,
        JSON.stringify(contentData.imageData || null),
        contentData.aiPrompt,
        contentData.aiModel,
        'draft'
      ]);
      
      return result.rows[0].id;
    } finally {
      client.release();
    }
  }

  /**
   * Generate image for content
   */
  async generateContentImage(parsedContent, contentType, topicDetails) {
    try {
      const imagePrompt = this.buildImagePrompt(parsedContent, contentType, topicDetails);
      
      if (contentType === 'carousel' && parsedContent.slides) {
        // Generate multiple images for carousel
        const imageUrls = await imageGenerator.generateCarouselImages(
          parsedContent.slides.map(slide => `${slide.title}: ${slide.content}`),
          { style: 'professional', format: 'linkedin' }
        );
        
        return {
          type: 'carousel',
          images: imageUrls,
          prompt: imagePrompt
        };
      } else {
        // Generate single image
        const imageUrl = await imageGenerator.generateImage(imagePrompt, {
          style: 'professional',
          format: 'linkedin',
          enhance: true
        });
        
        return {
          type: 'single',
          url: imageUrl,
          prompt: imagePrompt
        };
      }
    } catch (error) {
      logger.error('Image generation failed:', error);
      throw error;
    }
  }

  /**
   * Build image generation prompt
   */
  buildImagePrompt(parsedContent, contentType, topicDetails) {
    const baseContext = 'Professional LinkedIn post image, clean modern design, business appropriate';
    const location = 'Abu Dhabi, UAE context';
    
    let prompt = `${baseContext}, ${location}`;
    
    // Add content-specific context
    if (parsedContent.content) {
      const visualThemes = imageGenerator.extractVisualThemes(parsedContent.content);
      prompt += `, ${visualThemes.join(', ')}`;
    }
    
    // Add topic context
    if (topicDetails && topicDetails.title) {
      prompt += `, related to ${topicDetails.title}`;
    }
    
    // Add content type specific styling
    switch (contentType) {
      case 'carousel':
        prompt += ', infographic style, data visualization';
        break;
      case 'video':
        prompt += ', video thumbnail style, engaging visual';
        break;
      case 'poll':
        prompt += ', poll or survey themed, interactive design';
        break;
      default:
        prompt += ', general business content, professional aesthetic';
    }
    
    return prompt;
  }

  /**
   * Generate multiple content variations
   */
  async generateMultipleVariations(userId, topicId, contentType = 'text', count = 3, includeImage = false) {
    const variations = [];
    
    for (let i = 0; i < count; i++) {
      try {
        const content = await this.generateContent(userId, topicId, contentType, null, includeImage);
        variations.push(content);
        
        // Add delay between generations to avoid rate limiting
        if (i < count - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        logger.error(`Failed to generate variation ${i + 1}:`, error);
      }
    }
    
    return variations;
  }
}

module.exports = new ContentGenerator();