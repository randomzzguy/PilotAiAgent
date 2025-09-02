const pool = require('../database/connection');
const logger = require('../utils/logger');

class ContentTemplatesService {
    /**
     * Get all content topics with optional filtering
     * @param {Object} filters - Filter options
     * @returns {Promise<Array>} Array of topics
     */
    async getTopics(filters = {}) {
        try {
            let query = `
                SELECT 
                    ct.*,
                    COUNT(tt.template_id) as template_count,
                    AVG(ttr.engagement_rate) as avg_engagement
                FROM content_topics ct
                LEFT JOIN template_topics tt ON ct.id = tt.topic_id
                LEFT JOIN topic_trends ttr ON ct.id = ttr.topic_id 
                    AND ttr.trend_date >= CURRENT_DATE - INTERVAL '30 days'
                WHERE ct.is_active = true
            `;
            
            const params = [];
            let paramCount = 0;
            
            if (filters.category) {
                paramCount++;
                query += ` AND ct.category = $${paramCount}`;
                params.push(filters.category);
            }
            
            if (filters.industry) {
                paramCount++;
                query += ` AND ct.industry = $${paramCount}`;
                params.push(filters.industry);
            }
            
            if (filters.minRelevance) {
                paramCount++;
                query += ` AND ct.abu_dhabi_relevance >= $${paramCount}`;
                params.push(filters.minRelevance);
            }
            
            if (filters.keywords && filters.keywords.length > 0) {
                paramCount++;
                query += ` AND ct.keywords && $${paramCount}`;
                params.push(filters.keywords);
            }
            
            query += `
                GROUP BY ct.id
                ORDER BY ct.trending_score DESC, ct.abu_dhabi_relevance DESC
            `;
            
            if (filters.limit) {
                paramCount++;
                query += ` LIMIT $${paramCount}`;
                params.push(filters.limit);
            }
            
            const result = await pool.query(query, params);
            return result.rows;
        } catch (error) {
            logger.error('Error fetching topics:', error);
            throw error;
        }
    }
    
    /**
     * Get trending topics based on recent performance
     * @param {number} limit - Number of topics to return
     * @returns {Promise<Array>} Array of trending topics
     */
    async getTrendingTopics(limit = 10) {
        try {
            const query = `
                SELECT 
                    ct.*,
                    AVG(ttr.engagement_rate) as avg_engagement,
                    AVG(ttr.sentiment_score) as avg_sentiment,
                    SUM(ttr.social_mentions) as total_mentions
                FROM content_topics ct
                JOIN topic_trends ttr ON ct.id = ttr.topic_id
                WHERE ct.is_active = true 
                    AND ttr.trend_date >= CURRENT_DATE - INTERVAL '7 days'
                GROUP BY ct.id
                HAVING AVG(ttr.engagement_rate) > 0.3
                ORDER BY 
                    AVG(ttr.engagement_rate) DESC,
                    ct.trending_score DESC,
                    SUM(ttr.social_mentions) DESC
                LIMIT $1
            `;
            
            const result = await pool.query(query, [limit]);
            return result.rows;
        } catch (error) {
            logger.error('Error fetching trending topics:', error);
            throw error;
        }
    }
    
    /**
     * Get content templates with optional filtering
     * @param {Object} filters - Filter options
     * @returns {Promise<Array>} Array of templates
     */
    async getTemplates(filters = {}) {
        try {
            let query = `
                SELECT 
                    ct.*,
                    COUNT(utp.user_id) as user_count,
                    AVG(utp.preference_score) as avg_preference
                FROM content_templates ct
                LEFT JOIN user_template_preferences utp ON ct.id = utp.template_id
                WHERE ct.is_active = true
            `;
            
            const params = [];
            let paramCount = 0;
            
            if (filters.templateType) {
                paramCount++;
                query += ` AND ct.template_type = $${paramCount}`;
                params.push(filters.templateType);
            }
            
            if (filters.contentCategory) {
                paramCount++;
                query += ` AND ct.content_category = $${paramCount}`;
                params.push(filters.contentCategory);
            }
            
            if (filters.targetAudience) {
                paramCount++;
                query += ` AND ct.target_audience = $${paramCount}`;
                params.push(filters.targetAudience);
            }
            
            if (filters.industry) {
                paramCount++;
                query += ` AND ct.industry = $${paramCount}`;
                params.push(filters.industry);
            }
            
            if (filters.minEngagement) {
                paramCount++;
                query += ` AND ct.estimated_engagement >= $${paramCount}`;
                params.push(filters.minEngagement);
            }
            
            if (filters.difficultyLevel) {
                paramCount++;
                query += ` AND ct.difficulty_level = $${paramCount}`;
                params.push(filters.difficultyLevel);
            }
            
            if (filters.isPremium !== undefined) {
                paramCount++;
                query += ` AND ct.is_premium = $${paramCount}`;
                params.push(filters.isPremium);
            }
            
            query += `
                GROUP BY ct.id
                ORDER BY 
                    ct.estimated_engagement DESC,
                    ct.success_rate DESC,
                    ct.usage_count DESC
            `;
            
            if (filters.limit) {
                paramCount++;
                query += ` LIMIT $${paramCount}`;
                params.push(filters.limit);
            }
            
            const result = await pool.query(query, params);
            return result.rows;
        } catch (error) {
            logger.error('Error fetching templates:', error);
            throw error;
        }
    }
    
    /**
     * Get personalized template recommendations for a user
     * @param {number} userId - User ID
     * @param {Object} preferences - User preferences
     * @returns {Promise<Array>} Array of recommended templates
     */
    async getPersonalizedTemplates(userId, preferences = {}) {
        try {
            const query = `
                WITH user_stats AS (
                    SELECT 
                        template_id,
                        preference_score,
                        usage_count,
                        last_used
                    FROM user_template_preferences 
                    WHERE user_id = $1
                ),
                template_performance AS (
                    SELECT 
                        ct.id,
                        ct.*,
                        COALESCE(us.preference_score, 0.5) as user_preference,
                        COALESCE(us.usage_count, 0) as user_usage,
                        us.last_used,
                        (
                            ct.estimated_engagement * 0.4 +
                            ct.success_rate * 0.3 +
                            COALESCE(us.preference_score, 0.5) * 0.2 +
                            (CASE WHEN us.usage_count > 0 THEN 0.1 ELSE 0 END)
                        ) as recommendation_score
                    FROM content_templates ct
                    LEFT JOIN user_stats us ON ct.id = us.template_id
                    WHERE ct.is_active = true
                )
                SELECT *
                FROM template_performance
                WHERE (
                    $2::text IS NULL OR target_audience = $2 OR target_audience = 'general'
                ) AND (
                    $3::text IS NULL OR industry = $3 OR industry = 'general'
                ) AND (
                    $4::text IS NULL OR content_category = $4
                ) AND (
                    $5::boolean IS NULL OR is_premium = $5
                )
                ORDER BY recommendation_score DESC
                LIMIT $6
            `;
            
            const result = await pool.query(query, [
                userId,
                preferences.targetAudience || null,
                preferences.industry || null,
                preferences.contentCategory || null,
                preferences.isPremium || null,
                preferences.limit || 10
            ]);
            
            return result.rows;
        } catch (error) {
            logger.error('Error fetching personalized templates:', error);
            throw error;
        }
    }
    
    /**
     * Get template by ID with related topics
     * @param {number} templateId - Template ID
     * @returns {Promise<Object>} Template with topics
     */
    async getTemplateById(templateId) {
        try {
            const templateQuery = `
                SELECT * FROM content_templates 
                WHERE id = $1 AND is_active = true
            `;
            
            const topicsQuery = `
                SELECT 
                    ct.*,
                    tt.relevance_score
                FROM content_topics ct
                JOIN template_topics tt ON ct.id = tt.topic_id
                WHERE tt.template_id = $1 AND ct.is_active = true
                ORDER BY tt.relevance_score DESC
            `;
            
            const [templateResult, topicsResult] = await Promise.all([
                pool.query(templateQuery, [templateId]),
                pool.query(topicsQuery, [templateId])
            ]);
            
            if (templateResult.rows.length === 0) {
                return null;
            }
            
            const template = templateResult.rows[0];
            template.topics = topicsResult.rows;
            
            return template;
        } catch (error) {
            logger.error('Error fetching template by ID:', error);
            throw error;
        }
    }
    
    /**
     * Create a new content template
     * @param {Object} templateData - Template data
     * @param {number} userId - Creator user ID
     * @returns {Promise<Object>} Created template
     */
    async createTemplate(templateData, userId) {
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            
            const insertQuery = `
                INSERT INTO content_templates (
                    name, description, template_type, content_structure,
                    variables, style_guidelines, target_audience, industry,
                    content_category, estimated_engagement, difficulty_level,
                    time_to_create, is_premium, created_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                RETURNING *
            `;
            
            const result = await client.query(insertQuery, [
                templateData.name,
                templateData.description,
                templateData.templateType || 'text',
                JSON.stringify(templateData.contentStructure),
                JSON.stringify(templateData.variables || {}),
                JSON.stringify(templateData.styleGuidelines || {}),
                templateData.targetAudience,
                templateData.industry,
                templateData.contentCategory,
                templateData.estimatedEngagement || 0.5,
                templateData.difficultyLevel || 'medium',
                templateData.timeToCreate || 15,
                templateData.isPremium || false,
                userId
            ]);
            
            const template = result.rows[0];
            
            // Link template to topics if provided
            if (templateData.topicIds && templateData.topicIds.length > 0) {
                for (const topicId of templateData.topicIds) {
                    await client.query(
                        'INSERT INTO template_topics (template_id, topic_id, relevance_score) VALUES ($1, $2, $3)',
                        [template.id, topicId, templateData.topicRelevance || 0.5]
                    );
                }
            }
            
            await client.query('COMMIT');
            return template;
        } catch (error) {
            await client.query('ROLLBACK');
            logger.error('Error creating template:', error);
            throw error;
        } finally {
            client.release();
        }
    }
    
    /**
     * Update template usage statistics
     * @param {number} templateId - Template ID
     * @param {number} userId - User ID
     * @param {boolean} success - Whether generation was successful
     * @returns {Promise<void>}
     */
    async updateTemplateUsage(templateId, userId, success = true) {
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            
            // Update template usage count and success rate
            await client.query(`
                UPDATE content_templates 
                SET 
                    usage_count = usage_count + 1,
                    success_rate = (
                        (success_rate * usage_count + $2::int) / (usage_count + 1)
                    )
                WHERE id = $1
            `, [templateId, success ? 1 : 0]);
            
            // Update or insert user preference
            await client.query(`
                INSERT INTO user_template_preferences (
                    user_id, template_id, usage_count, last_used, preference_score
                ) VALUES ($1, $2, 1, CURRENT_TIMESTAMP, 0.6)
                ON CONFLICT (user_id, template_id) DO UPDATE SET
                    usage_count = user_template_preferences.usage_count + 1,
                    last_used = CURRENT_TIMESTAMP,
                    preference_score = CASE 
                        WHEN $3 THEN LEAST(user_template_preferences.preference_score + 0.1, 1.0)
                        ELSE GREATEST(user_template_preferences.preference_score - 0.1, 0.0)
                    END
            `, [userId, templateId, success]);
            
            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            logger.error('Error updating template usage:', error);
            throw error;
        } finally {
            client.release();
        }
    }
    
    /**
     * Generate content using a template
     * @param {number} templateId - Template ID
     * @param {Object} variables - Variables to fill in template
     * @param {Object} options - Generation options
     * @returns {Promise<Object>} Generated content
     */
    async generateContentFromTemplate(templateId, variables, options = {}) {
        try {
            const template = await this.getTemplateById(templateId);
            if (!template) {
                throw new Error('Template not found');
            }
            
            const structure = template.content_structure;
            let content = structure.structure;
            
            // Replace placeholders with provided variables
            for (const [key, value] of Object.entries(variables)) {
                const placeholder = `{${key}}`;
                content = content.replace(new RegExp(placeholder, 'g'), value);
            }
            
            // Apply style guidelines
            const styleGuidelines = template.style_guidelines;
            
            // Generate hashtags if not provided
            if (!variables.hashtags && template.topics.length > 0) {
                const hashtags = this.generateHashtags(template.topics, styleGuidelines.hashtag_count);
                content = content.replace('{hashtags}', hashtags.join(' '));
            }
            
            return {
                content,
                template_id: templateId,
                template_name: template.name,
                estimated_engagement: template.estimated_engagement,
                content_category: template.content_category,
                style_guidelines: styleGuidelines
            };
        } catch (error) {
            logger.error('Error generating content from template:', error);
            throw error;
        }
    }
    
    /**
     * Generate relevant hashtags based on topics
     * @param {Array} topics - Array of topics
     * @param {string} count - Hashtag count range (e.g., "3-5")
     * @returns {Array} Array of hashtags
     */
    generateHashtags(topics, count = "3-5") {
        const hashtags = new Set();
        
        // Extract hashtags from topic keywords
        topics.forEach(topic => {
            if (topic.keywords) {
                topic.keywords.forEach(keyword => {
                    const hashtag = '#' + keyword.replace(/\s+/g, '').toLowerCase();
                    hashtags.add(hashtag);
                });
            }
        });
        
        // Add common Abu Dhabi hashtags
        const abuDhabiHashtags = ['#abudhabi', '#uae', '#business', '#innovation', '#leadership'];
        abuDhabiHashtags.forEach(tag => hashtags.add(tag));
        
        // Convert to array and limit count
        const hashtagArray = Array.from(hashtags);
        const [min, max] = count.split('-').map(n => parseInt(n));
        const targetCount = Math.floor(Math.random() * (max - min + 1)) + min;
        
        return hashtagArray.slice(0, targetCount);
    }
    
    /**
     * Get template analytics and performance metrics
     * @param {number} templateId - Template ID
     * @param {number} days - Number of days to analyze
     * @returns {Promise<Object>} Analytics data
     */
    async getTemplateAnalytics(templateId, days = 30) {
        try {
            const query = `
                SELECT 
                    ct.name,
                    ct.usage_count,
                    ct.success_rate,
                    ct.estimated_engagement,
                    COUNT(cgh.id) as recent_usage,
                    AVG(CASE WHEN cgh.success THEN 1.0 ELSE 0.0 END) as recent_success_rate,
                    COUNT(DISTINCT cgh.user_id) as unique_users
                FROM content_templates ct
                LEFT JOIN content_generation_history cgh ON ct.id = cgh.template_id
                    AND cgh.created_at >= CURRENT_DATE - INTERVAL '${days} days'
                WHERE ct.id = $1
                GROUP BY ct.id, ct.name, ct.usage_count, ct.success_rate, ct.estimated_engagement
            `;
            
            const result = await pool.query(query, [templateId]);
            return result.rows[0] || null;
        } catch (error) {
            logger.error('Error fetching template analytics:', error);
            throw error;
        }
    }
    
    /**
     * Search templates and topics
     * @param {string} searchTerm - Search term
     * @param {Object} filters - Additional filters
     * @returns {Promise<Object>} Search results
     */
    async search(searchTerm, filters = {}) {
        try {
            const templateQuery = `
                SELECT *, 'template' as result_type
                FROM content_templates
                WHERE is_active = true
                    AND (
                        name ILIKE $1 OR
                        description ILIKE $1 OR
                        content_category ILIKE $1 OR
                        target_audience ILIKE $1
                    )
                ORDER BY 
                    CASE WHEN name ILIKE $1 THEN 1 ELSE 2 END,
                    estimated_engagement DESC
                LIMIT 10
            `;
            
            const topicQuery = `
                SELECT *, 'topic' as result_type
                FROM content_topics
                WHERE is_active = true
                    AND (
                        name ILIKE $1 OR
                        description ILIKE $1 OR
                        category ILIKE $1 OR
                        $2 = ANY(keywords)
                    )
                ORDER BY 
                    CASE WHEN name ILIKE $1 THEN 1 ELSE 2 END,
                    trending_score DESC
                LIMIT 10
            `;
            
            const searchPattern = `%${searchTerm}%`;
            
            const [templateResults, topicResults] = await Promise.all([
                pool.query(templateQuery, [searchPattern]),
                pool.query(topicQuery, [searchPattern, searchTerm])
            ]);
            
            return {
                templates: templateResults.rows,
                topics: topicResults.rows,
                total: templateResults.rows.length + topicResults.rows.length
            };
        } catch (error) {
            logger.error('Error searching templates and topics:', error);
            throw error;
        }
    }
}

module.exports = new ContentTemplatesService();