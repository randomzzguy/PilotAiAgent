const moment = require('moment-timezone');
const logger = require('../utils/logger');
const { pool } = require('../database/init');

/**
 * Advanced Optimal Timing Service
 * Uses analytics data to determine the best posting times for each user
 */
class OptimalTimingService {
  constructor() {
    this.timezone = process.env.TIMEZONE || 'Asia/Dubai';
    this.defaultOptimalTimes = {
      weekdays: {
        morning: { hour: 8, minute: 0, score: 0.7 },
        midday: { hour: 13, minute: 30, score: 0.6 },
        evening: { hour: 19, minute: 0, score: 0.8 }
      },
      weekends: {
        morning: { hour: 10, minute: 0, score: 0.6 },
        afternoon: { hour: 15, minute: 0, score: 0.7 },
        evening: { hour: 20, minute: 0, score: 0.8 }
      },
      ramadan: {
        iftar: { hour: 19, minute: 30, score: 0.9 },
        evening: { hour: 22, minute: 0, score: 0.8 },
        suhoor: { hour: 3, minute: 30, score: 0.7 }
      }
    };
  }

  /**
   * Get personalized optimal posting times for a user
   */
  async getPersonalizedOptimalTimes(userId, daysBack = 90) {
    const client = await pool.connect();
    try {
      // Get user's historical posting performance
      const performanceData = await client.query(`
        SELECT 
          EXTRACT(HOUR FROM sp.posted_at) as hour,
          EXTRACT(DOW FROM sp.posted_at) as day_of_week,
          EXTRACT(MINUTE FROM sp.posted_at) as minute,
          pa.engagement_rate,
          pa.impressions,
          pa.likes + pa.comments + pa.shares as total_engagement,
          gc.content_type
        FROM scheduled_posts sp
        JOIN post_analytics pa ON pa.scheduled_post_id = sp.id
        LEFT JOIN generated_content gc ON gc.id = sp.content_id
        WHERE sp.user_id = $1 
        AND sp.status = 'posted'
        AND sp.posted_at >= CURRENT_TIMESTAMP - INTERVAL '${daysBack} days'
        AND pa.engagement_rate IS NOT NULL
        ORDER BY sp.posted_at DESC
      `, [userId]);

      if (performanceData.rows.length < 10) {
        // Not enough data, return default times with regional optimization
        return this.getRegionalOptimalTimes();
      }

      // Analyze performance by hour and day
      const hourlyPerformance = this.analyzeHourlyPerformance(performanceData.rows);
      const dailyPerformance = this.analyzeDailyPerformance(performanceData.rows);
      const contentTypePerformance = this.analyzeContentTypePerformance(performanceData.rows);

      // Generate personalized optimal times
      const personalizedTimes = this.generatePersonalizedTimes(
        hourlyPerformance,
        dailyPerformance,
        contentTypePerformance
      );

      logger.info('Generated personalized optimal times', {
        userId,
        dataPoints: performanceData.rows.length,
        daysAnalyzed: daysBack
      });

      return personalizedTimes;
    } finally {
      client.release();
    }
  }

  /**
   * Analyze hourly performance patterns
   */
  analyzeHourlyPerformance(data) {
    const hourlyStats = {};

    data.forEach(row => {
      const hour = parseInt(row.hour);
      if (!hourlyStats[hour]) {
        hourlyStats[hour] = {
          totalEngagementRate: 0,
          totalImpressions: 0,
          totalEngagement: 0,
          postCount: 0
        };
      }

      hourlyStats[hour].totalEngagementRate += parseFloat(row.engagement_rate) || 0;
      hourlyStats[hour].totalImpressions += parseInt(row.impressions) || 0;
      hourlyStats[hour].totalEngagement += parseInt(row.total_engagement) || 0;
      hourlyStats[hour].postCount += 1;
    });

    // Calculate averages and scores
    const hourlyPerformance = {};
    Object.entries(hourlyStats).forEach(([hour, stats]) => {
      const avgEngagementRate = stats.totalEngagementRate / stats.postCount;
      const avgImpressions = stats.totalImpressions / stats.postCount;
      const avgEngagement = stats.totalEngagement / stats.postCount;
      
      // Calculate composite score (weighted average)
      const score = (
        (avgEngagementRate * 0.5) +
        (Math.min(avgImpressions / 1000, 10) * 0.3) +
        (Math.min(avgEngagement / 100, 10) * 0.2)
      ) / 10;

      hourlyPerformance[hour] = {
        avgEngagementRate,
        avgImpressions,
        avgEngagement,
        postCount: stats.postCount,
        score: Math.min(score, 1)
      };
    });

    return hourlyPerformance;
  }

  /**
   * Analyze daily performance patterns
   */
  analyzeDailyPerformance(data) {
    const dailyStats = {};

    data.forEach(row => {
      const dayOfWeek = parseInt(row.day_of_week);
      if (!dailyStats[dayOfWeek]) {
        dailyStats[dayOfWeek] = {
          totalEngagementRate: 0,
          totalImpressions: 0,
          postCount: 0
        };
      }

      dailyStats[dayOfWeek].totalEngagementRate += parseFloat(row.engagement_rate) || 0;
      dailyStats[dayOfWeek].totalImpressions += parseInt(row.impressions) || 0;
      dailyStats[dayOfWeek].postCount += 1;
    });

    // Calculate averages
    const dailyPerformance = {};
    Object.entries(dailyStats).forEach(([day, stats]) => {
      dailyPerformance[day] = {
        avgEngagementRate: stats.totalEngagementRate / stats.postCount,
        avgImpressions: stats.totalImpressions / stats.postCount,
        postCount: stats.postCount
      };
    });

    return dailyPerformance;
  }

  /**
   * Analyze content type performance
   */
  analyzeContentTypePerformance(data) {
    const contentStats = {};

    data.forEach(row => {
      const contentType = row.content_type || 'text';
      if (!contentStats[contentType]) {
        contentStats[contentType] = {
          totalEngagementRate: 0,
          postCount: 0,
          bestHours: {}
        };
      }

      contentStats[contentType].totalEngagementRate += parseFloat(row.engagement_rate) || 0;
      contentStats[contentType].postCount += 1;

      // Track best hours for each content type
      const hour = parseInt(row.hour);
      if (!contentStats[contentType].bestHours[hour]) {
        contentStats[contentType].bestHours[hour] = {
          engagementRate: 0,
          count: 0
        };
      }
      contentStats[contentType].bestHours[hour].engagementRate += parseFloat(row.engagement_rate) || 0;
      contentStats[contentType].bestHours[hour].count += 1;
    });

    // Calculate averages
    const contentPerformance = {};
    Object.entries(contentStats).forEach(([type, stats]) => {
      const bestHours = {};
      Object.entries(stats.bestHours).forEach(([hour, hourStats]) => {
        bestHours[hour] = hourStats.engagementRate / hourStats.count;
      });

      contentPerformance[type] = {
        avgEngagementRate: stats.totalEngagementRate / stats.postCount,
        postCount: stats.postCount,
        bestHours
      };
    });

    return contentPerformance;
  }

  /**
   * Generate personalized optimal times based on analysis
   */
  generatePersonalizedTimes(hourlyPerformance, dailyPerformance, contentTypePerformance) {
    const personalizedTimes = {
      weekdays: {},
      weekends: {},
      contentSpecific: {},
      confidence: 'high'
    };

    // Determine confidence level
    const totalPosts = Object.values(hourlyPerformance).reduce((sum, hour) => sum + hour.postCount, 0);
    if (totalPosts < 20) {
      personalizedTimes.confidence = 'low';
    } else if (totalPosts < 50) {
      personalizedTimes.confidence = 'medium';
    }

    // Find best performing hours
    const sortedHours = Object.entries(hourlyPerformance)
      .sort(([,a], [,b]) => b.score - a.score)
      .slice(0, 6); // Top 6 hours

    // Categorize hours into time slots
    const timeSlots = {
      morning: [], // 6-11
      midday: [],  // 12-16
      evening: [], // 17-22
      night: []    // 23-5
    };

    sortedHours.forEach(([hour, performance]) => {
      const h = parseInt(hour);
      if (h >= 6 && h <= 11) {
        timeSlots.morning.push({ hour: h, ...performance });
      } else if (h >= 12 && h <= 16) {
        timeSlots.midday.push({ hour: h, ...performance });
      } else if (h >= 17 && h <= 22) {
        timeSlots.evening.push({ hour: h, ...performance });
      } else {
        timeSlots.night.push({ hour: h, ...performance });
      }
    });

    // Generate weekday optimal times
    personalizedTimes.weekdays = {
      morning: this.getBestTimeInSlot(timeSlots.morning, { hour: 8, minute: 0 }),
      midday: this.getBestTimeInSlot(timeSlots.midday, { hour: 13, minute: 30 }),
      evening: this.getBestTimeInSlot(timeSlots.evening, { hour: 19, minute: 0 })
    };

    // Generate weekend optimal times (slightly different patterns)
    personalizedTimes.weekends = {
      morning: this.getBestTimeInSlot(timeSlots.morning, { hour: 10, minute: 0 }),
      afternoon: this.getBestTimeInSlot(timeSlots.midday, { hour: 15, minute: 0 }),
      evening: this.getBestTimeInSlot(timeSlots.evening, { hour: 20, minute: 0 })
    };

    // Generate content-specific optimal times
    Object.entries(contentTypePerformance).forEach(([contentType, performance]) => {
      if (performance.postCount >= 5) {
        const bestHour = Object.entries(performance.bestHours)
          .sort(([,a], [,b]) => b - a)[0];
        
        if (bestHour) {
          personalizedTimes.contentSpecific[contentType] = {
            hour: parseInt(bestHour[0]),
            minute: 0,
            score: bestHour[1] / 10, // Normalize to 0-1
            confidence: performance.postCount >= 10 ? 'high' : 'medium'
          };
        }
      }
    });

    return personalizedTimes;
  }

  /**
   * Get best time in a specific time slot
   */
  getBestTimeInSlot(slotTimes, defaultTime) {
    if (slotTimes.length === 0) {
      return {
        hour: defaultTime.hour,
        minute: defaultTime.minute,
        score: 0.5,
        confidence: 'default'
      };
    }

    const bestTime = slotTimes[0];
    return {
      hour: bestTime.hour,
      minute: 0, // Keep minutes simple
      score: bestTime.score,
      confidence: bestTime.postCount >= 5 ? 'high' : 'medium'
    };
  }

  /**
   * Get regional optimal times (Abu Dhabi specific)
   */
  getRegionalOptimalTimes() {
    const now = moment().tz(this.timezone);
    const isRamadan = this.isRamadanPeriod(now);

    if (isRamadan) {
      return {
        weekdays: this.defaultOptimalTimes.ramadan,
        weekends: this.defaultOptimalTimes.ramadan,
        contentSpecific: {},
        confidence: 'regional',
        specialPeriod: 'ramadan'
      };
    }

    return {
      weekdays: this.defaultOptimalTimes.weekdays,
      weekends: this.defaultOptimalTimes.weekends,
      contentSpecific: {},
      confidence: 'regional'
    };
  }

  /**
   * Check if current period is Ramadan
   */
  isRamadanPeriod(date) {
    // Simplified Ramadan detection - in production, use proper Islamic calendar
    const year = date.year();
    const ramadanDates = {
      2024: { start: moment.tz('2024-03-10', this.timezone), end: moment.tz('2024-04-09', this.timezone) },
      2025: { start: moment.tz('2025-02-28', this.timezone), end: moment.tz('2025-03-30', this.timezone) }
    };

    const ramadan = ramadanDates[year];
    return ramadan && date.isBetween(ramadan.start, ramadan.end, 'day', '[]');
  }

  /**
   * Get next optimal posting time for a user
   */
  async getNextOptimalTime(userId, contentType = null, timeSlot = null) {
    const optimalTimes = await this.getPersonalizedOptimalTimes(userId);
    const now = moment().tz(this.timezone);
    const isWeekend = now.day() === 5 || now.day() === 6; // Friday or Saturday in UAE

    let targetTimes;
    if (contentType && optimalTimes.contentSpecific[contentType]) {
      // Use content-specific timing if available
      const contentTime = optimalTimes.contentSpecific[contentType];
      targetTimes = [contentTime];
    } else {
      // Use general optimal times
      targetTimes = Object.values(isWeekend ? optimalTimes.weekends : optimalTimes.weekdays);
    }

    // Filter by time slot if specified
    if (timeSlot) {
      const slotTimes = isWeekend ? optimalTimes.weekends : optimalTimes.weekdays;
      if (slotTimes[timeSlot]) {
        targetTimes = [slotTimes[timeSlot]];
      }
    }

    // Find next available optimal time
    const nextTimes = [];
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const targetDate = now.clone().add(dayOffset, 'days');
      const targetIsWeekend = targetDate.day() === 5 || targetDate.day() === 6;
      
      // Skip weekends for business content unless specifically weekend times
      if (!isWeekend && targetIsWeekend && !timeSlot) {
        continue;
      }

      targetTimes.forEach(timeConfig => {
        const scheduledTime = targetDate.clone()
          .hour(timeConfig.hour)
          .minute(timeConfig.minute || 0)
          .second(0)
          .millisecond(0);

        if (scheduledTime.isAfter(now)) {
          nextTimes.push({
            datetime: scheduledTime.toDate(),
            score: timeConfig.score || 0.5,
            confidence: timeConfig.confidence || 'medium',
            timeSlot: this.getTimeSlotName(timeConfig.hour),
            dayType: targetIsWeekend ? 'weekend' : 'weekday'
          });
        }
      });
    }

    // Sort by score and return best option
    nextTimes.sort((a, b) => b.score - a.score);
    return nextTimes[0] || null;
  }

  /**
   * Get time slot name based on hour
   */
  getTimeSlotName(hour) {
    if (hour >= 6 && hour <= 11) return 'morning';
    if (hour >= 12 && hour <= 16) return 'midday';
    if (hour >= 17 && hour <= 22) return 'evening';
    return 'night';
  }

  /**
   * Get optimal times for multiple days ahead
   */
  async getOptimalTimesForPeriod(userId, daysAhead = 7, postsPerDay = 1) {
    const optimalTimes = await this.getPersonalizedOptimalTimes(userId);
    const now = moment().tz(this.timezone);
    const schedule = [];

    for (let dayOffset = 0; dayOffset < daysAhead; dayOffset++) {
      const targetDate = now.clone().add(dayOffset, 'days');
      const isWeekend = targetDate.day() === 5 || targetDate.day() === 6;
      
      const dayTimes = isWeekend ? optimalTimes.weekends : optimalTimes.weekdays;
      const availableTimes = Object.entries(dayTimes)
        .map(([slot, timeConfig]) => ({
          slot,
          hour: timeConfig.hour,
          minute: timeConfig.minute || 0,
          score: timeConfig.score || 0.5
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, postsPerDay);

      availableTimes.forEach(timeConfig => {
        const scheduledTime = targetDate.clone()
          .hour(timeConfig.hour)
          .minute(timeConfig.minute)
          .second(0)
          .millisecond(0);

        if (scheduledTime.isAfter(now)) {
          schedule.push({
            date: targetDate.format('YYYY-MM-DD'),
            datetime: scheduledTime.toDate(),
            timeSlot: timeConfig.slot,
            score: timeConfig.score,
            dayType: isWeekend ? 'weekend' : 'weekday'
          });
        }
      });
    }

    return schedule;
  }

  /**
   * Update optimal times cache for a user
   */
  async updateOptimalTimesCache(userId) {
    const client = await pool.connect();
    try {
      const optimalTimes = await this.getPersonalizedOptimalTimes(userId);
      
      await client.query(`
        INSERT INTO user_optimal_times (user_id, optimal_times_data, updated_at)
        VALUES ($1, $2, CURRENT_TIMESTAMP)
        ON CONFLICT (user_id) 
        DO UPDATE SET 
          optimal_times_data = $2,
          updated_at = CURRENT_TIMESTAMP
      `, [userId, JSON.stringify(optimalTimes)]);

      logger.info('Updated optimal times cache', { userId });
    } finally {
      client.release();
    }
  }

  /**
   * Get cached optimal times for a user
   */
  async getCachedOptimalTimes(userId) {
    const client = await pool.connect();
    try {
      const result = await client.query(`
        SELECT optimal_times_data, updated_at
        FROM user_optimal_times
        WHERE user_id = $1
        AND updated_at > CURRENT_TIMESTAMP - INTERVAL '7 days'
      `, [userId]);

      if (result.rows.length > 0) {
        return JSON.parse(result.rows[0].optimal_times_data);
      }

      return null;
    } finally {
      client.release();
    }
  }
}

module.exports = new OptimalTimingService();