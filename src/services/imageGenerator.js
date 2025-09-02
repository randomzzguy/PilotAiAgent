const axios = require('axios');
const logger = require('../utils/logger');
const fs = require('fs').promises;
const path = require('path');

class ImageGenerator {
  constructor() {
    this.baseURL = 'https://image.pollinations.ai/prompt';
    this.defaultOptions = {
      width: 1024,
      height: 1024,
      seed: null,
      enhance: true,
      nologo: true
    };
  }

  /**
   * Generate image from text prompt using Pollinations.AI
   * @param {string} prompt - Text description for image generation
   * @param {Object} options - Image generation options
   * @returns {Promise<Object>} Generated image data
   */
  async generateImage(prompt, options = {}) {
    try {
      const startTime = Date.now();
      
      // Merge options with defaults
      const imageOptions = { ...this.defaultOptions, ...options };
      
      // Clean and enhance the prompt for better results
      const enhancedPrompt = this.enhancePrompt(prompt);
      
      logger.content('Generating image', {
        prompt: enhancedPrompt,
        options: imageOptions
      });

      // Build the image URL
      const imageUrl = this.buildImageUrl(enhancedPrompt, imageOptions);
      
      // Generate the image by making a request
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 30000, // 30 second timeout
        headers: {
          'User-Agent': 'LinkedIn-Automation-Bot/1.0'
        }
      });

      const duration = Date.now() - startTime;
      
      logger.performance('Image generation', duration, {
        promptLength: enhancedPrompt.length,
        imageSize: response.data.length
      });

      return {
        imageUrl,
        imageData: response.data,
        prompt: enhancedPrompt,
        options: imageOptions,
        metadata: {
          generationTime: duration,
          size: response.data.length,
          dimensions: `${imageOptions.width}x${imageOptions.height}`
        }
      };
    } catch (error) {
      logger.error('Image generation failed:', error);
      throw new Error(`Image generation failed: ${error.message}`);
    }
  }

  /**
   * Generate LinkedIn-optimized image for content
   * @param {string} contentText - The LinkedIn post text
   * @param {string} contentType - Type of content (text, carousel, etc.)
   * @param {Object} topicDetails - Topic information
   * @returns {Promise<Object>} Generated image data
   */
  async generateLinkedInImage(contentText, contentType, topicDetails = {}) {
    try {
      // Create a visual prompt based on the content
      const visualPrompt = this.createVisualPrompt(contentText, contentType, topicDetails);
      
      // LinkedIn-optimized dimensions
      const linkedInOptions = {
        width: 1200,
        height: 627, // LinkedIn recommended aspect ratio 1.91:1
        enhance: true,
        nologo: true
      };

      return await this.generateImage(visualPrompt, linkedInOptions);
    } catch (error) {
      logger.error('LinkedIn image generation failed:', error);
      throw error;
    }
  }

  /**
   * Generate multiple images for carousel posts
   * @param {Array} slides - Array of slide content
   * @param {Object} topicDetails - Topic information
   * @returns {Promise<Array>} Array of generated images
   */
  async generateCarouselImages(slides, topicDetails = {}) {
    const images = [];
    
    for (let i = 0; i < slides.length; i++) {
      try {
        const slide = slides[i];
        const slidePrompt = this.createSlidePrompt(slide, i + 1, topicDetails);
        
        const image = await this.generateImage(slidePrompt, {
          width: 1080,
          height: 1080, // Square format for carousel
          enhance: true,
          nologo: true,
          seed: i + 1 // Different seed for each slide
        });
        
        images.push({
          slideNumber: i + 1,
          ...image
        });
        
        // Add delay between requests to avoid rate limiting
        if (i < slides.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (error) {
        logger.error(`Failed to generate image for slide ${i + 1}:`, error);
        // Continue with other slides even if one fails
      }
    }
    
    return images;
  }

  /**
   * Save image to local storage
   * @param {Buffer} imageData - Image buffer data
   * @param {string} filename - Filename for the image
   * @returns {Promise<string>} File path of saved image
   */
  async saveImage(imageData, filename) {
    try {
      const uploadsDir = path.join(process.cwd(), 'uploads', 'images');
      
      // Ensure uploads directory exists
      await fs.mkdir(uploadsDir, { recursive: true });
      
      const filePath = path.join(uploadsDir, filename);
      await fs.writeFile(filePath, imageData);
      
      logger.content('Image saved', { filePath, size: imageData.length });
      
      return filePath;
    } catch (error) {
      logger.error('Failed to save image:', error);
      throw error;
    }
  }

  /**
   * Build image generation URL with parameters
   * @param {string} prompt - Image prompt
   * @param {Object} options - Generation options
   * @returns {string} Complete image URL
   */
  buildImageUrl(prompt, options) {
    const encodedPrompt = encodeURIComponent(prompt);
    let url = `${this.baseURL}/${encodedPrompt}`;
    
    const params = new URLSearchParams();
    
    if (options.width) params.append('width', options.width);
    if (options.height) params.append('height', options.height);
    if (options.seed) params.append('seed', options.seed);
    if (options.enhance) params.append('enhance', 'true');
    if (options.nologo) params.append('nologo', 'true');
    
    const paramString = params.toString();
    if (paramString) {
      url += `?${paramString}`;
    }
    
    return url;
  }

  /**
   * Enhance prompt for better image generation
   * @param {string} prompt - Original prompt
   * @returns {string} Enhanced prompt
   */
  enhancePrompt(prompt) {
    // Add professional and high-quality descriptors
    const enhancements = [
      'professional',
      'high quality',
      'clean design',
      'modern',
      'business appropriate'
    ];
    
    // Clean the prompt
    let enhanced = prompt.trim();
    
    // Add style descriptors if not already present
    if (!enhanced.toLowerCase().includes('professional')) {
      enhanced = `Professional ${enhanced}`;
    }
    
    // Add quality descriptors
    enhanced += ', high quality, clean design, modern aesthetic, business appropriate';
    
    return enhanced;
  }

  /**
   * Create visual prompt from LinkedIn content
   * @param {string} contentText - LinkedIn post text
   * @param {string} contentType - Type of content
   * @param {Object} topicDetails - Topic information
   * @returns {string} Visual prompt for image generation
   */
  createVisualPrompt(contentText, contentType, topicDetails) {
    const { title, industry, keywords } = topicDetails;
    
    // Extract key themes from content
    const themes = this.extractThemes(contentText);
    
    // Build visual prompt
    let prompt = '';
    
    if (title) {
      prompt += `Visual representation of: ${title}. `;
    }
    
    if (industry) {
      prompt += `${industry} industry context. `;
    }
    
    if (themes.length > 0) {
      prompt += `Incorporating themes: ${themes.join(', ')}. `;
    }
    
    // Add LinkedIn-specific styling
    prompt += 'Professional LinkedIn post image, clean corporate design, suitable for business social media, modern and engaging visual style';
    
    return prompt;
  }

  /**
   * Create prompt for carousel slide
   * @param {Object} slide - Slide content
   * @param {number} slideNumber - Slide number
   * @param {Object} topicDetails - Topic information
   * @returns {string} Slide-specific prompt
   */
  createSlidePrompt(slide, slideNumber, topicDetails) {
    const { title, content } = slide;
    const { industry } = topicDetails;
    
    let prompt = `Slide ${slideNumber}: ${title}. `;
    
    if (content) {
      const themes = this.extractThemes(content);
      if (themes.length > 0) {
        prompt += `Visual themes: ${themes.slice(0, 3).join(', ')}. `;
      }
    }
    
    if (industry) {
      prompt += `${industry} industry. `;
    }
    
    prompt += 'Professional carousel slide design, clean layout, suitable for LinkedIn business content, modern visual style';
    
    return prompt;
  }

  /**
   * Extract visual themes from text content
   * @param {string} text - Text content
   * @returns {Array} Array of visual themes
   */
  extractThemes(text) {
    const themes = [];
    const lowerText = text.toLowerCase();
    
    // Business themes
    const businessKeywords = {
      'growth': ['growth', 'expansion', 'scaling'],
      'innovation': ['innovation', 'technology', 'digital', 'ai', 'automation'],
      'leadership': ['leadership', 'management', 'team', 'culture'],
      'success': ['success', 'achievement', 'goal', 'target'],
      'networking': ['networking', 'connection', 'collaboration', 'partnership'],
      'strategy': ['strategy', 'planning', 'vision', 'roadmap'],
      'finance': ['finance', 'investment', 'revenue', 'profit', 'funding'],
      'marketing': ['marketing', 'brand', 'customer', 'audience'],
      'education': ['learning', 'education', 'training', 'development', 'skill']
    };
    
    for (const [theme, keywords] of Object.entries(businessKeywords)) {
      if (keywords.some(keyword => lowerText.includes(keyword))) {
        themes.push(theme);
      }
    }
    
    return themes.slice(0, 5); // Limit to 5 themes
  }
}

module.exports = new ImageGenerator();