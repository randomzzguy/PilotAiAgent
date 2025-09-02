const db = require('../database/connection');
const { calculateEngagementRate, calculateReachRate, calculateClickThroughRate } = require('../utils/metrics');

class AnalyticsService {
    /**
     * Track post performance metrics
     */
    async trackPostPerformance(postId, metrics) {
        const query = `
            INSERT INTO post_analytics (
                post_id, likes, comments, shares, views, clicks,
                impressions, reach, engagement_rate, click_through_rate,
                recorded_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
            ON CONFLICT (post_id, recorded_at::date)
            DO UPDATE SET
                likes = EXCLUDED.likes,
                comments = EXCLUDED.comments,
                shares = EXCLUDED.shares,
                views = EXCLUDED.views,
                clicks = EXCLUDED.clicks,
                impressions = EXCLUDED.impressions,
                reach = EXCLUDED.reach,
                engagement_rate = EXCLUDED.engagement_rate,
                click_through_rate = EXCLUDED.click_through_rate,
                updated_at = NOW()
        `;

        const engagementRate = calculateEngagementRate(metrics.likes, metrics.comments, metrics.shares, metrics.impressions);
        const clickThroughRate = calculateClickThroughRate(metrics.clicks, metrics.impressions);

        await db.query(query, [
            postId,
            metrics.likes || 0,
            metrics.comments || 0,
            metrics.shares || 0,
            metrics.views || 0,
            metrics.clicks || 0,
            metrics.impressions || 0,
            metrics.reach || 0,
            engagementRate,
            clickThroughRate
        ]);

        // Update post summary metrics
        await this.updatePostSummaryMetrics(postId);
    }

    /**
     * Update post summary metrics
     */
    async updatePostSummaryMetrics(postId) {
        const query = `
            UPDATE scheduled_posts 
            SET 
                total_likes = COALESCE((SELECT SUM(likes) FROM post_analytics WHERE post_id = $1), 0),
                total_comments = COALESCE((SELECT SUM(comments) FROM post_analytics WHERE post_id = $1), 0),
                total_shares = COALESCE((SELECT SUM(shares) FROM post_analytics WHERE post_id = $1), 0),
                total_views = COALESCE((SELECT SUM(views) FROM post_analytics WHERE post_id = $1), 0),
                total_clicks = COALESCE((SELECT SUM(clicks) FROM post_analytics WHERE post_id = $1), 0),
                avg_engagement_rate = COALESCE((SELECT AVG(engagement_rate) FROM post_analytics WHERE post_id = $1), 0),
                updated_at = NOW()
            WHERE id = $1
        `;

        await db.query(query, [postId]);
    }

    /**
     * Get user analytics dashboard data
     */
    async getUserAnalytics(userId, period = '30d') {
        const dateFilter = this.getDateFilter(period);
        
        const [overviewData, topPosts, engagementTrends, contentPerformance, audienceInsights] = await Promise.all([
            this.getOverviewMetrics(userId, dateFilter),
            this.getTopPerformingPosts(userId, dateFilter),
            this.getEngagementTrends(userId, dateFilter),
            this.getContentPerformance(userId, dateFilter),
            this.getAudienceInsights(userId, dateFilter)
        ]);

        return {
            overview: overviewData,
            topPosts,
            engagementTrends,
            contentPerformance,
            audienceInsights,
            period
        };
    }

    /**
     * Get overview metrics
     */
    async getOverviewMetrics(userId, dateFilter) {
        const query = `
            SELECT 
                COUNT(DISTINCT sp.id) as total_posts,
                COALESCE(SUM(sp.total_likes), 0) as total_likes,
                COALESCE(SUM(sp.total_comments), 0) as total_comments,
                COALESCE(SUM(sp.total_shares), 0) as total_shares,
                COALESCE(SUM(sp.total_views), 0) as total_views,
                COALESCE(SUM(sp.total_clicks), 0) as total_clicks,
                COALESCE(AVG(sp.avg_engagement_rate), 0) as avg_engagement_rate,
                COALESCE(SUM(pa.impressions), 0) as total_impressions,
                COALESCE(SUM(pa.reach), 0) as total_reach
            FROM scheduled_posts sp
            LEFT JOIN post_analytics pa ON sp.id = pa.post_id
            WHERE sp.user_id = $1 
                AND sp.status = 'posted'
                AND sp.posted_at >= $2
        `;

        const result = await db.query(query, [userId, dateFilter]);
        const metrics = result.rows[0];

        // Calculate derived metrics
        const totalEngagements = parseInt(metrics.total_likes) + parseInt(metrics.total_comments) + parseInt(metrics.total_shares);
        const reachRate = calculateReachRate(metrics.total_reach, metrics.total_impressions);
        const avgClickThroughRate = calculateClickThroughRate(metrics.total_clicks, metrics.total_impressions);

        return {
            ...metrics,
            total_engagements: totalEngagements,
            reach_rate: reachRate,
            avg_click_through_rate: avgClickThroughRate,
            posts_per_day: metrics.total_posts / this.getDaysDifference(dateFilter)
        };
    }

    /**
     * Get top performing posts
     */
    async getTopPerformingPosts(userId, dateFilter, limit = 10) {
        const query = `
            SELECT 
                sp.id,
                sp.content,
                sp.content_type,
                sp.posted_at,
                sp.total_likes,
                sp.total_comments,
                sp.total_shares,
                sp.total_views,
                sp.total_clicks,
                sp.avg_engagement_rate,
                (sp.total_likes + sp.total_comments + sp.total_shares) as total_engagements,
                ct.name as template_name
            FROM scheduled_posts sp
            LEFT JOIN content_templates ct ON sp.template_id = ct.id
            WHERE sp.user_id = $1 
                AND sp.status = 'posted'
                AND sp.posted_at >= $2
            ORDER BY sp.avg_engagement_rate DESC, total_engagements DESC
            LIMIT $3
        `;

        const result = await db.query(query, [userId, dateFilter, limit]);
        return result.rows;
    }

    /**
     * Get engagement trends over time
     */
    async getEngagementTrends(userId, dateFilter) {
        const query = `
            SELECT 
                DATE(sp.posted_at) as date,
                COUNT(sp.id) as posts_count,
                COALESCE(SUM(sp.total_likes), 0) as likes,
                COALESCE(SUM(sp.total_comments), 0) as comments,
                COALESCE(SUM(sp.total_shares), 0) as shares,
                COALESCE(AVG(sp.avg_engagement_rate), 0) as avg_engagement_rate,
                COALESCE(SUM(pa.impressions), 0) as impressions,
                COALESCE(SUM(pa.reach), 0) as reach
            FROM scheduled_posts sp
            LEFT JOIN post_analytics pa ON sp.id = pa.post_id
            WHERE sp.user_id = $1 
                AND sp.status = 'posted'
                AND sp.posted_at >= $2
            GROUP BY DATE(sp.posted_at)
            ORDER BY date ASC
        `;

        const result = await db.query(query, [userId, dateFilter]);
        return result.rows;
    }

    /**
     * Get content performance by type and category
     */
    async getContentPerformance(userId, dateFilter) {
        const query = `
            SELECT 
                sp.content_type,
                ct.content_category,
                COUNT(sp.id) as posts_count,
                COALESCE(AVG(sp.avg_engagement_rate), 0) as avg_engagement_rate,
                COALESCE(SUM(sp.total_likes), 0) as total_likes,
                COALESCE(SUM(sp.total_comments), 0) as total_comments,
                COALESCE(SUM(sp.total_shares), 0) as total_shares,
                COALESCE(AVG(sp.total_views), 0) as avg_views
            FROM scheduled_posts sp
            LEFT JOIN content_templates ct ON sp.template_id = ct.id
            WHERE sp.user_id = $1 
                AND sp.status = 'posted'
                AND sp.posted_at >= $2
            GROUP BY sp.content_type, ct.content_category
            ORDER BY avg_engagement_rate DESC
        `;

        const result = await db.query(query, [userId, dateFilter]);
        return result.rows;
    }

    /**
     * Get audience insights
     */
    async getAudienceInsights(userId, dateFilter) {
        // Get posting time performance
        const timeQuery = `
            SELECT 
                EXTRACT(hour FROM sp.posted_at) as hour,
                EXTRACT(dow FROM sp.posted_at) as day_of_week,
                COUNT(sp.id) as posts_count,
                COALESCE(AVG(sp.avg_engagement_rate), 0) as avg_engagement_rate,
                COALESCE(SUM(sp.total_likes + sp.total_comments + sp.total_shares), 0) as total_engagements
            FROM scheduled_posts sp
            WHERE sp.user_id = $1 
                AND sp.status = 'posted'
                AND sp.posted_at >= $2
            GROUP BY EXTRACT(hour FROM sp.posted_at), EXTRACT(dow FROM sp.posted_at)
            ORDER BY avg_engagement_rate DESC
        `;

        // Get hashtag performance
        const hashtagQuery = `
            SELECT 
                hashtag,
                COUNT(*) as usage_count,
                COALESCE(AVG(sp.avg_engagement_rate), 0) as avg_engagement_rate
            FROM (
                SELECT 
                    sp.id,
                    sp.avg_engagement_rate,
                    unnest(string_to_array(regexp_replace(sp.content, '[^#\\w\\s]', '', 'g'), ' ')) as hashtag
                FROM scheduled_posts sp
                WHERE sp.user_id = $1 
                    AND sp.status = 'posted'
                    AND sp.posted_at >= $2
                    AND sp.content ~ '#\\w+'
            ) hashtag_data
            WHERE hashtag LIKE '#%'
            GROUP BY hashtag
            HAVING COUNT(*) >= 2
            ORDER BY avg_engagement_rate DESC
            LIMIT 20
        `;

        const [timeResults, hashtagResults] = await Promise.all([
            db.query(timeQuery, [userId, dateFilter]),
            db.query(hashtagQuery, [userId, dateFilter])
        ]);

        return {
            timePerformance: timeResults.rows,
            hashtagPerformance: hashtagResults.rows,
            bestPostingTimes: this.analyzeBestPostingTimes(timeResults.rows),
            topHashtags: hashtagResults.rows.slice(0, 10)
        };
    }

    /**
     * Analyze best posting times
     */
    analyzeBestPostingTimes(timeData) {
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        
        // Group by day of week
        const byDay = timeData.reduce((acc, row) => {
            const day = dayNames[row.day_of_week];
            if (!acc[day]) acc[day] = [];
            acc[day].push(row);
            return acc;
        }, {});

        // Find best times for each day
        const bestTimes = {};
        Object.entries(byDay).forEach(([day, hours]) => {
            const sorted = hours.sort((a, b) => b.avg_engagement_rate - a.avg_engagement_rate);
            bestTimes[day] = sorted.slice(0, 3).map(h => ({
                hour: h.hour,
                engagement_rate: h.avg_engagement_rate,
                posts_count: h.posts_count
            }));
        });

        return bestTimes;
    }

    /**
     * Get competitive analysis
     */
    async getCompetitiveAnalysis(userId, industry, period = '30d') {
        const dateFilter = this.getDateFilter(period);
        
        // Get industry benchmarks
        const benchmarkQuery = `
            SELECT 
                AVG(sp.avg_engagement_rate) as industry_avg_engagement,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY sp.avg_engagement_rate) as industry_median_engagement,
                AVG(sp.total_likes + sp.total_comments + sp.total_shares) as industry_avg_engagements,
                COUNT(DISTINCT sp.user_id) as active_users
            FROM scheduled_posts sp
            JOIN users u ON sp.user_id = u.id
            WHERE u.industry = $1
                AND sp.status = 'posted'
                AND sp.posted_at >= $2
        `;

        // Get user's performance
        const userQuery = `
            SELECT 
                AVG(sp.avg_engagement_rate) as user_avg_engagement,
                AVG(sp.total_likes + sp.total_comments + sp.total_shares) as user_avg_engagements,
                COUNT(sp.id) as user_posts_count
            FROM scheduled_posts sp
            WHERE sp.user_id = $3
                AND sp.status = 'posted'
                AND sp.posted_at >= $2
        `;

        const [benchmarkResult, userResult] = await Promise.all([
            db.query(benchmarkQuery, [industry, dateFilter]),
            db.query(userQuery, [dateFilter, userId])
        ]);

        const benchmark = benchmarkResult.rows[0];
        const userStats = userResult.rows[0];

        return {
            industry_benchmark: benchmark,
            user_performance: userStats,
            performance_vs_industry: {
                engagement_rate_ratio: userStats.user_avg_engagement / benchmark.industry_avg_engagement,
                engagements_ratio: userStats.user_avg_engagements / benchmark.industry_avg_engagements,
                percentile_rank: await this.calculatePercentileRank(userId, industry, dateFilter)
            }
        };
    }

    /**
     * Calculate user's percentile rank in industry
     */
    async calculatePercentileRank(userId, industry, dateFilter) {
        const query = `
            WITH user_avg AS (
                SELECT AVG(avg_engagement_rate) as user_rate
                FROM scheduled_posts
                WHERE user_id = $1 AND status = 'posted' AND posted_at >= $2
            ),
            industry_rates AS (
                SELECT 
                    sp.user_id,
                    AVG(sp.avg_engagement_rate) as avg_rate
                FROM scheduled_posts sp
                JOIN users u ON sp.user_id = u.id
                WHERE u.industry = $3 AND sp.status = 'posted' AND sp.posted_at >= $2
                GROUP BY sp.user_id
            )
            SELECT 
                (COUNT(CASE WHEN ir.avg_rate <= ua.user_rate THEN 1 END) * 100.0 / COUNT(*)) as percentile_rank
            FROM industry_rates ir, user_avg ua
        `;

        const result = await db.query(query, [userId, dateFilter, industry]);
        return result.rows[0]?.percentile_rank || 0;
    }

    /**
     * Get ROI analysis
     */
    async getROIAnalysis(userId, period = '30d') {
        const dateFilter = this.getDateFilter(period);
        
        const query = `
            SELECT 
                COUNT(sp.id) as total_posts,
                COALESCE(SUM(sp.total_clicks), 0) as total_clicks,
                COALESCE(SUM(sp.total_views), 0) as total_views,
                COALESCE(SUM(pa.reach), 0) as total_reach,
                COALESCE(AVG(sp.avg_engagement_rate), 0) as avg_engagement_rate,
                -- Estimated time saved (assuming 30 minutes per manual post)
                COUNT(sp.id) * 0.5 as estimated_hours_saved,
                -- Estimated cost per post (industry average $50 per post)
                COUNT(sp.id) * 50 as estimated_cost_savings
            FROM scheduled_posts sp
            LEFT JOIN post_analytics pa ON sp.id = pa.post_id
            WHERE sp.user_id = $1 
                AND sp.status = 'posted'
                AND sp.posted_at >= $2
        `;

        const result = await db.query(query, [userId, dateFilter]);
        const metrics = result.rows[0];

        // Calculate additional ROI metrics
        const clickValue = 2.5; // Estimated value per click
        const viewValue = 0.1; // Estimated value per view
        
        return {
            ...metrics,
            estimated_click_value: metrics.total_clicks * clickValue,
            estimated_view_value: metrics.total_views * viewValue,
            total_estimated_value: (metrics.total_clicks * clickValue) + (metrics.total_views * viewValue),
            roi_ratio: ((metrics.total_clicks * clickValue) + (metrics.total_views * viewValue)) / Math.max(metrics.estimated_cost_savings, 1),
            efficiency_score: metrics.avg_engagement_rate * (metrics.total_reach / Math.max(metrics.total_posts, 1))
        };
    }

    /**
     * Generate analytics report
     */
    async generateAnalyticsReport(userId, period = '30d', format = 'summary') {
        const [analytics, competitive, roi] = await Promise.all([
            this.getUserAnalytics(userId, period),
            this.getCompetitiveAnalysis(userId, 'technology', period), // Default industry
            this.getROIAnalysis(userId, period)
        ]);

        const report = {
            generated_at: new Date().toISOString(),
            period,
            user_id: userId,
            analytics,
            competitive_analysis: competitive,
            roi_analysis: roi,
            insights: this.generateInsights(analytics, competitive, roi),
            recommendations: this.generateRecommendations(analytics, competitive)
        };

        if (format === 'detailed') {
            report.raw_data = {
                engagement_trends: analytics.engagementTrends,
                content_performance: analytics.contentPerformance,
                audience_insights: analytics.audienceInsights
            };
        }

        return report;
    }

    /**
     * Generate insights from analytics data
     */
    generateInsights(analytics, competitive, roi) {
        const insights = [];

        // Engagement insights
        if (analytics.overview.avg_engagement_rate > 0.05) {
            insights.push({
                type: 'positive',
                category: 'engagement',
                message: 'Your engagement rate is above industry average',
                value: (analytics.overview.avg_engagement_rate * 100).toFixed(2) + '%'
            });
        }

        // Posting frequency insights
        if (analytics.overview.posts_per_day < 1) {
            insights.push({
                type: 'suggestion',
                category: 'frequency',
                message: 'Consider increasing posting frequency for better reach',
                value: analytics.overview.posts_per_day.toFixed(1) + ' posts/day'
            });
        }

        // ROI insights
        if (roi.roi_ratio > 2) {
            insights.push({
                type: 'positive',
                category: 'roi',
                message: 'Excellent ROI on your social media automation',
                value: roi.roi_ratio.toFixed(1) + 'x return'
            });
        }

        // Best performing content
        if (analytics.topPosts.length > 0) {
            const bestPost = analytics.topPosts[0];
            insights.push({
                type: 'insight',
                category: 'content',
                message: `Your best performing content type is ${bestPost.content_type}`,
                value: (bestPost.avg_engagement_rate * 100).toFixed(2) + '% engagement'
            });
        }

        return insights;
    }

    /**
     * Generate recommendations
     */
    generateRecommendations(analytics, competitive) {
        const recommendations = [];

        // Timing recommendations
        if (analytics.audienceInsights.bestPostingTimes) {
            const bestDay = Object.entries(analytics.audienceInsights.bestPostingTimes)
                .sort(([,a], [,b]) => (b[0]?.engagement_rate || 0) - (a[0]?.engagement_rate || 0))[0];
            
            if (bestDay) {
                recommendations.push({
                    type: 'timing',
                    priority: 'high',
                    message: `Post more content on ${bestDay[0]} for better engagement`,
                    action: 'Schedule more posts on this day'
                });
            }
        }

        // Content type recommendations
        if (analytics.contentPerformance.length > 0) {
            const bestContent = analytics.contentPerformance[0];
            recommendations.push({
                type: 'content',
                priority: 'medium',
                message: `Focus on ${bestContent.content_type} content`,
                action: 'Create more templates of this type'
            });
        }

        // Competitive recommendations
        if (competitive.performance_vs_industry.engagement_rate_ratio < 0.8) {
            recommendations.push({
                type: 'competitive',
                priority: 'high',
                message: 'Your engagement rate is below industry average',
                action: 'Review and optimize your content strategy'
            });
        }

        return recommendations;
    }

    /**
     * Helper methods
     */
    getDateFilter(period) {
        const now = new Date();
        const days = {
            '7d': 7,
            '30d': 30,
            '90d': 90,
            '1y': 365
        };
        
        const daysBack = days[period] || 30;
        return new Date(now.getTime() - (daysBack * 24 * 60 * 60 * 1000));
    }

    getDaysDifference(dateFilter) {
        const now = new Date();
        return Math.ceil((now - dateFilter) / (1000 * 60 * 60 * 24));
    }
}

module.exports = new AnalyticsService();