const axios = require('axios');
const logger = require('../utils/logger');
const { pool } = require('../database/init');

class LinkedInAPI {
  constructor() {
    this.baseURL = 'https://api.linkedin.com/v2';
    this.clientId = process.env.LINKEDIN_CLIENT_ID;
    this.clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
    this.redirectUri = process.env.LINKEDIN_REDIRECT_URI;
    this.scope = 'r_liteprofile,r_emailaddress,w_member_social';
  }

  /**
   * Generate LinkedIn OAuth authorization URL
   */
  getAuthorizationUrl(state = null) {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: this.scope
    });

    if (state) {
      params.append('state', state);
    }

    return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  async getAccessToken(authorizationCode) {
    try {
      const response = await axios.post('https://www.linkedin.com/oauth/v2/accessToken', {
        grant_type: 'authorization_code',
        code: authorizationCode,
        redirect_uri: this.redirectUri,
        client_id: this.clientId,
        client_secret: this.clientSecret
      }, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      logger.linkedin('Access token obtained successfully');
      return response.data;
    } catch (error) {
      logger.error('Failed to get LinkedIn access token:', error.response?.data || error.message);
      throw new Error('Failed to obtain LinkedIn access token');
    }
  }

  /**
   * Get user profile information
   */
  async getUserProfile(accessToken) {
    try {
      const [profileResponse, emailResponse] = await Promise.all([
        axios.get(`${this.baseURL}/people/~`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'cache-control': 'no-cache',
            'X-Restli-Protocol-Version': '2.0.0'
          }
        }),
        axios.get(`${this.baseURL}/emailAddress?q=members&projection=(elements*(handle~))`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'cache-control': 'no-cache',
            'X-Restli-Protocol-Version': '2.0.0'
          }
        })
      ]);

      const profile = profileResponse.data;
      const email = emailResponse.data.elements[0]['handle~'].emailAddress;

      return {
        id: profile.id,
        firstName: profile.localizedFirstName,
        lastName: profile.localizedLastName,
        email: email,
        profilePicture: profile.profilePicture?.['displayImage~']?.elements?.[0]?.identifiers?.[0]?.identifier
      };
    } catch (error) {
      logger.error('Failed to get LinkedIn user profile:', error.response?.data || error.message);
      throw new Error('Failed to get user profile');
    }
  }

  /**
   * Create a text post on LinkedIn
   */
  async createTextPost(accessToken, userId, content) {
    try {
      const postData = {
        author: `urn:li:person:${userId}`,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: {
              text: content.text
            },
            shareMediaCategory: 'NONE'
          }
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
        }
      };

      const response = await axios.post(`${this.baseURL}/ugcPosts`, postData, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0'
        }
      });

      logger.linkedin('Text post created successfully', {
        postId: response.data.id,
        userId
      });

      return {
        id: response.data.id,
        url: `https://www.linkedin.com/feed/update/${response.data.id}/`
      };
    } catch (error) {
      logger.error('Failed to create LinkedIn text post:', error.response?.data || error.message);
      throw new Error('Failed to create LinkedIn post');
    }
  }

  /**
   * Create a post with images
   */
  async createImagePost(accessToken, userId, content) {
    try {
      // First, upload images
      const uploadedImages = [];
      for (const imageUrl of content.images) {
        const uploadedImage = await this.uploadImage(accessToken, userId, imageUrl);
        uploadedImages.push(uploadedImage);
      }

      const postData = {
        author: `urn:li:person:${userId}`,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: {
              text: content.text
            },
            shareMediaCategory: 'IMAGE',
            media: uploadedImages.map(image => ({
              status: 'READY',
              description: {
                text: content.imageDescription || ''
              },
              media: image.asset,
              title: {
                text: content.imageTitle || ''
              }
            }))
          }
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
        }
      };

      const response = await axios.post(`${this.baseURL}/ugcPosts`, postData, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0'
        }
      });

      logger.linkedin('Image post created successfully', {
        postId: response.data.id,
        imageCount: uploadedImages.length,
        userId
      });

      return {
        id: response.data.id,
        url: `https://www.linkedin.com/feed/update/${response.data.id}/`
      };
    } catch (error) {
      logger.error('Failed to create LinkedIn image post:', error.response?.data || error.message);
      throw new Error('Failed to create LinkedIn image post');
    }
  }

  /**
   * Upload image to LinkedIn
   */
  async uploadImage(accessToken, userId, imageUrl) {
    try {
      // Register upload
      const registerResponse = await axios.post(`${this.baseURL}/assets?action=registerUpload`, {
        registerUploadRequest: {
          recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
          owner: `urn:li:person:${userId}`,
          serviceRelationships: [{
            relationshipType: 'OWNER',
            identifier: 'urn:li:userGeneratedContent'
          }]
        }
      }, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0'
        }
      });

      const uploadUrl = registerResponse.data.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;
      const asset = registerResponse.data.value.asset;

      // Download image
      const imageResponse = await axios.get(imageUrl, {
        responseType: 'arraybuffer'
      });

      // Upload image
      await axios.put(uploadUrl, imageResponse.data, {
        headers: {
          'Content-Type': 'application/octet-stream'
        }
      });

      logger.linkedin('Image uploaded successfully', { asset });
      return { asset };
    } catch (error) {
      logger.error('Failed to upload image to LinkedIn:', error.response?.data || error.message);
      throw new Error('Failed to upload image');
    }
  }

  /**
   * Create a poll post
   */
  async createPollPost(accessToken, userId, content) {
    try {
      const postData = {
        author: `urn:li:person:${userId}`,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: {
              text: content.text
            },
            shareMediaCategory: 'POLL',
            poll: {
              question: content.question,
              options: content.options.map(option => ({
                text: option
              })),
              settings: {
                duration: 'P7D' // 7 days
              }
            }
          }
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
        }
      };

      const response = await axios.post(`${this.baseURL}/ugcPosts`, postData, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0'
        }
      });

      logger.linkedin('Poll post created successfully', {
        postId: response.data.id,
        userId
      });

      return {
        id: response.data.id,
        url: `https://www.linkedin.com/feed/update/${response.data.id}/`
      };
    } catch (error) {
      logger.error('Failed to create LinkedIn poll post:', error.response?.data || error.message);
      throw new Error('Failed to create LinkedIn poll post');
    }
  }

  /**
   * Get post analytics
   */
  async getPostAnalytics(accessToken, postId) {
    try {
      const response = await axios.get(`${this.baseURL}/socialActions/${postId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0'
        }
      });

      return {
        likes: response.data.likesSummary?.totalLikes || 0,
        comments: response.data.commentsSummary?.totalComments || 0,
        shares: response.data.sharesSummary?.totalShares || 0,
        impressions: response.data.impressionCount || 0,
        clicks: response.data.clickCount || 0
      };
    } catch (error) {
      logger.error('Failed to get post analytics:', error.response?.data || error.message);
      return {
        likes: 0,
        comments: 0,
        shares: 0,
        impressions: 0,
        clicks: 0
      };
    }
  }

  /**
   * Validate access token
   */
  async validateAccessToken(accessToken) {
    try {
      await axios.get(`${this.baseURL}/people/~`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0'
        }
      });
      return true;
    } catch (error) {
      logger.error('Access token validation failed:', error.response?.data || error.message);
      return false;
    }
  }

  /**
   * Store user LinkedIn credentials
   */
  async storeUserCredentials(userId, accessToken, refreshToken = null, expiresIn = 5184000) {
    const client = await pool.connect();
    try {
      const expiresAt = new Date(Date.now() + (expiresIn * 1000));
      
      await client.query(`
        INSERT INTO user_linkedin_tokens (user_id, access_token, refresh_token, expires_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id) 
        DO UPDATE SET 
          access_token = EXCLUDED.access_token,
          refresh_token = EXCLUDED.refresh_token,
          expires_at = EXCLUDED.expires_at,
          updated_at = CURRENT_TIMESTAMP
      `, [userId, accessToken, refreshToken, expiresAt]);

      logger.linkedin('User credentials stored successfully', { userId });
    } finally {
      client.release();
    }
  }

  /**
   * Get user LinkedIn credentials
   */
  async getUserCredentials(userId) {
    const client = await pool.connect();
    try {
      const result = await client.query(`
        SELECT access_token, refresh_token, expires_at
        FROM user_linkedin_tokens
        WHERE user_id = $1 AND expires_at > CURRENT_TIMESTAMP
      `, [userId]);

      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }

  /**
   * Check if user has valid LinkedIn connection
   */
  async hasValidConnection(userId) {
    const credentials = await this.getUserCredentials(userId);
    if (!credentials) return false;

    return await this.validateAccessToken(credentials.access_token);
  }

  /**
   * Post content based on type
   */
  async postContent(userId, content) {
    try {
      const credentials = await this.getUserCredentials(userId);
      if (!credentials) {
        throw new Error('No valid LinkedIn credentials found');
      }

      const { access_token } = credentials;
      const linkedinUserId = await this.getLinkedInUserId(access_token);

      let result;
      switch (content.type) {
        case 'text':
          result = await this.createTextPost(access_token, linkedinUserId, content);
          break;
        case 'image':
        case 'multi_image':
          result = await this.createImagePost(access_token, linkedinUserId, content);
          break;
        case 'poll':
          result = await this.createPollPost(access_token, linkedinUserId, content);
          break;
        default:
          throw new Error(`Unsupported content type: ${content.type}`);
      }

      // Log successful post
      await this.logPostActivity(userId, result.id, content.type, 'success');
      
      return result;
    } catch (error) {
      // Log failed post
      await this.logPostActivity(userId, null, content.type, 'failed', error.message);
      throw error;
    }
  }

  /**
   * Get LinkedIn user ID from access token
   */
  async getLinkedInUserId(accessToken) {
    try {
      const response = await axios.get(`${this.baseURL}/people/~`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0'
        }
      });
      return response.data.id;
    } catch (error) {
      logger.error('Failed to get LinkedIn user ID:', error.response?.data || error.message);
      throw new Error('Failed to get LinkedIn user ID');
    }
  }

  /**
   * Log post activity
   */
  async logPostActivity(userId, postId, contentType, status, errorMessage = null) {
    const client = await pool.connect();
    try {
      await client.query(`
        INSERT INTO api_usage_logs (user_id, endpoint, method, status_code, response_time, metadata)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        userId,
        'linkedin_post',
        'POST',
        status === 'success' ? 200 : 400,
        0,
        JSON.stringify({
          postId,
          contentType,
          status,
          errorMessage
        })
      ]);
    } finally {
      client.release();
    }
  }
}

module.exports = new LinkedInAPI();