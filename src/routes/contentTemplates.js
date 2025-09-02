const express = require('express');
const router = express.Router();
const contentTemplatesService = require('../services/contentTemplates');
const { authenticateToken } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validation');
const { body, query, param } = require('express-validator');
const logger = require('../utils/logger');

// Apply authentication to all routes
router.use(authenticateToken);

/**
 * GET /api/content-templates/topics
 * Get content topics with optional filtering
 */
router.get('/topics', [
    query('category').optional().isString().trim(),
    query('industry').optional().isString().trim(),
    query('minRelevance').optional().isFloat({ min: 0, max: 1 }),
    query('keywords').optional().isString(),
    query('limit').optional().isInt({ min: 1, max: 100 })
], validateRequest, async (req, res) => {
    try {
        const filters = {
            category: req.query.category,
            industry: req.query.industry,
            minRelevance: req.query.minRelevance ? parseFloat(req.query.minRelevance) : undefined,
            keywords: req.query.keywords ? req.query.keywords.split(',').map(k => k.trim()) : undefined,
            limit: req.query.limit ? parseInt(req.query.limit) : undefined
        };
        
        // Remove undefined values
        Object.keys(filters).forEach(key => {
            if (filters[key] === undefined) {
                delete filters[key];
            }
        });
        
        const topics = await contentTemplatesService.getTopics(filters);
        
        res.json({
            success: true,
            data: topics,
            count: topics.length
        });
    } catch (error) {
        logger.error('Error fetching topics:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch topics',
            error: error.message
        });
    }
});

/**
 * GET /api/content-templates/topics/trending
 * Get trending topics based on recent performance
 */
router.get('/topics/trending', [
    query('limit').optional().isInt({ min: 1, max: 50 })
], validateRequest, async (req, res) => {
    try {
        const limit = req.query.limit ? parseInt(req.query.limit) : 10;
        const trendingTopics = await contentTemplatesService.getTrendingTopics(limit);
        
        res.json({
            success: true,
            data: trendingTopics,
            count: trendingTopics.length
        });
    } catch (error) {
        logger.error('Error fetching trending topics:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch trending topics',
            error: error.message
        });
    }
});

/**
 * GET /api/content-templates/templates
 * Get content templates with optional filtering
 */
router.get('/templates', [
    query('templateType').optional().isString().trim(),
    query('contentCategory').optional().isString().trim(),
    query('targetAudience').optional().isString().trim(),
    query('industry').optional().isString().trim(),
    query('minEngagement').optional().isFloat({ min: 0, max: 1 }),
    query('difficultyLevel').optional().isIn(['easy', 'medium', 'hard']),
    query('isPremium').optional().isBoolean(),
    query('limit').optional().isInt({ min: 1, max: 100 })
], validateRequest, async (req, res) => {
    try {
        const filters = {
            templateType: req.query.templateType,
            contentCategory: req.query.contentCategory,
            targetAudience: req.query.targetAudience,
            industry: req.query.industry,
            minEngagement: req.query.minEngagement ? parseFloat(req.query.minEngagement) : undefined,
            difficultyLevel: req.query.difficultyLevel,
            isPremium: req.query.isPremium !== undefined ? req.query.isPremium === 'true' : undefined,
            limit: req.query.limit ? parseInt(req.query.limit) : undefined
        };
        
        // Remove undefined values
        Object.keys(filters).forEach(key => {
            if (filters[key] === undefined) {
                delete filters[key];
            }
        });
        
        const templates = await contentTemplatesService.getTemplates(filters);
        
        res.json({
            success: true,
            data: templates,
            count: templates.length
        });
    } catch (error) {
        logger.error('Error fetching templates:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch templates',
            error: error.message
        });
    }
});

/**
 * GET /api/content-templates/templates/personalized
 * Get personalized template recommendations for the authenticated user
 */
router.get('/templates/personalized', [
    query('targetAudience').optional().isString().trim(),
    query('industry').optional().isString().trim(),
    query('contentCategory').optional().isString().trim(),
    query('isPremium').optional().isBoolean(),
    query('limit').optional().isInt({ min: 1, max: 50 })
], validateRequest, async (req, res) => {
    try {
        const preferences = {
            targetAudience: req.query.targetAudience,
            industry: req.query.industry,
            contentCategory: req.query.contentCategory,
            isPremium: req.query.isPremium !== undefined ? req.query.isPremium === 'true' : undefined,
            limit: req.query.limit ? parseInt(req.query.limit) : 10
        };
        
        const templates = await contentTemplatesService.getPersonalizedTemplates(req.user.id, preferences);
        
        res.json({
            success: true,
            data: templates,
            count: templates.length,
            message: 'Personalized templates based on your usage patterns and preferences'
        });
    } catch (error) {
        logger.error('Error fetching personalized templates:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch personalized templates',
            error: error.message
        });
    }
});

/**
 * GET /api/content-templates/templates/:id
 * Get a specific template by ID with related topics
 */
router.get('/templates/:id', [
    param('id').isInt({ min: 1 })
], validateRequest, async (req, res) => {
    try {
        const templateId = parseInt(req.params.id);
        const template = await contentTemplatesService.getTemplateById(templateId);
        
        if (!template) {
            return res.status(404).json({
                success: false,
                message: 'Template not found'
            });
        }
        
        res.json({
            success: true,
            data: template
        });
    } catch (error) {
        logger.error('Error fetching template by ID:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch template',
            error: error.message
        });
    }
});

/**
 * POST /api/content-templates/templates
 * Create a new content template
 */
router.post('/templates', [
    body('name').isString().trim().isLength({ min: 1, max: 200 }),
    body('description').optional().isString().trim(),
    body('templateType').optional().isIn(['text', 'image', 'video', 'carousel', 'poll']),
    body('contentStructure').isObject(),
    body('variables').optional().isObject(),
    body('styleGuidelines').optional().isObject(),
    body('targetAudience').optional().isString().trim(),
    body('industry').optional().isString().trim(),
    body('contentCategory').optional().isString().trim(),
    body('estimatedEngagement').optional().isFloat({ min: 0, max: 1 }),
    body('difficultyLevel').optional().isIn(['easy', 'medium', 'hard']),
    body('timeToCreate').optional().isInt({ min: 1 }),
    body('isPremium').optional().isBoolean(),
    body('topicIds').optional().isArray(),
    body('topicIds.*').optional().isInt({ min: 1 }),
    body('topicRelevance').optional().isFloat({ min: 0, max: 1 })
], validateRequest, async (req, res) => {
    try {
        const templateData = {
            name: req.body.name,
            description: req.body.description,
            templateType: req.body.templateType,
            contentStructure: req.body.contentStructure,
            variables: req.body.variables,
            styleGuidelines: req.body.styleGuidelines,
            targetAudience: req.body.targetAudience,
            industry: req.body.industry,
            contentCategory: req.body.contentCategory,
            estimatedEngagement: req.body.estimatedEngagement,
            difficultyLevel: req.body.difficultyLevel,
            timeToCreate: req.body.timeToCreate,
            isPremium: req.body.isPremium,
            topicIds: req.body.topicIds,
            topicRelevance: req.body.topicRelevance
        };
        
        const template = await contentTemplatesService.createTemplate(templateData, req.user.id);
        
        res.status(201).json({
            success: true,
            data: template,
            message: 'Template created successfully'
        });
    } catch (error) {
        logger.error('Error creating template:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create template',
            error: error.message
        });
    }
});

/**
 * POST /api/content-templates/templates/:id/generate
 * Generate content using a specific template
 */
router.post('/templates/:id/generate', [
    param('id').isInt({ min: 1 }),
    body('variables').isObject(),
    body('options').optional().isObject()
], validateRequest, async (req, res) => {
    try {
        const templateId = parseInt(req.params.id);
        const { variables, options = {} } = req.body;
        
        const generatedContent = await contentTemplatesService.generateContentFromTemplate(
            templateId,
            variables,
            options
        );
        
        // Update template usage statistics
        await contentTemplatesService.updateTemplateUsage(templateId, req.user.id, true);
        
        res.json({
            success: true,
            data: generatedContent,
            message: 'Content generated successfully'
        });
    } catch (error) {
        logger.error('Error generating content from template:', error);
        
        // Update template usage with failure
        if (req.params.id) {
            try {
                await contentTemplatesService.updateTemplateUsage(
                    parseInt(req.params.id),
                    req.user.id,
                    false
                );
            } catch (updateError) {
                logger.error('Error updating template usage after failure:', updateError);
            }
        }
        
        res.status(500).json({
            success: false,
            message: 'Failed to generate content',
            error: error.message
        });
    }
});

/**
 * GET /api/content-templates/templates/:id/analytics
 * Get analytics for a specific template
 */
router.get('/templates/:id/analytics', [
    param('id').isInt({ min: 1 }),
    query('days').optional().isInt({ min: 1, max: 365 })
], validateRequest, async (req, res) => {
    try {
        const templateId = parseInt(req.params.id);
        const days = req.query.days ? parseInt(req.query.days) : 30;
        
        const analytics = await contentTemplatesService.getTemplateAnalytics(templateId, days);
        
        if (!analytics) {
            return res.status(404).json({
                success: false,
                message: 'Template not found'
            });
        }
        
        res.json({
            success: true,
            data: analytics,
            period: `${days} days`
        });
    } catch (error) {
        logger.error('Error fetching template analytics:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch template analytics',
            error: error.message
        });
    }
});

/**
 * GET /api/content-templates/search
 * Search templates and topics
 */
router.get('/search', [
    query('q').isString().trim().isLength({ min: 1, max: 100 }),
    query('type').optional().isIn(['templates', 'topics', 'all'])
], validateRequest, async (req, res) => {
    try {
        const searchTerm = req.query.q;
        const searchType = req.query.type || 'all';
        
        const results = await contentTemplatesService.search(searchTerm, { type: searchType });
        
        res.json({
            success: true,
            data: results,
            query: searchTerm,
            type: searchType
        });
    } catch (error) {
        logger.error('Error searching templates and topics:', error);
        res.status(500).json({
            success: false,
            message: 'Search failed',
            error: error.message
        });
    }
});

/**
 * GET /api/content-templates/categories
 * Get available template categories and types
 */
router.get('/categories', async (req, res) => {
    try {
        const categories = {
            templateTypes: ['text', 'image', 'video', 'carousel', 'poll'],
            contentCategories: [
                'educational', 'promotional', 'inspirational', 'news', 
                'engagement', 'entertainment', 'industry_insights', 'company_updates'
            ],
            targetAudiences: [
                'general', 'professionals', 'entrepreneurs', 'executives', 
                'students', 'investors', 'developers', 'marketers'
            ],
            industries: [
                'general', 'technology', 'finance', 'healthcare', 'education',
                'retail', 'manufacturing', 'energy', 'real_estate', 'consulting'
            ],
            difficultyLevels: ['easy', 'medium', 'hard'],
            topicCategories: [
                'business', 'technology', 'leadership', 'innovation', 
                'sustainability', 'culture', 'economics', 'workplace'
            ]
        };
        
        res.json({
            success: true,
            data: categories
        });
    } catch (error) {
        logger.error('Error fetching categories:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch categories',
            error: error.message
        });
    }
});

/**
 * GET /api/content-templates/stats
 * Get overall statistics about templates and topics
 */
router.get('/stats', async (req, res) => {
    try {
        // This would typically be implemented with a dedicated service method
        // For now, we'll return a basic structure
        const stats = {
            totalTemplates: 0,
            totalTopics: 0,
            totalGenerations: 0,
            averageEngagement: 0,
            topCategories: [],
            recentActivity: []
        };
        
        res.json({
            success: true,
            data: stats,
            message: 'Statistics retrieved successfully'
        });
    } catch (error) {
        logger.error('Error fetching stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch statistics',
            error: error.message
        });
    }
});

module.exports = router;