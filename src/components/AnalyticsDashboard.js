import React, { useState, useEffect } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import './AnalyticsDashboard.css';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

const AnalyticsDashboard = () => {
  const [dashboardData, setDashboardData] = useState(null);
  const [competitiveData, setCompetitiveData] = useState(null);
  const [roiData, setRoiData] = useState(null);
  const [realtimeData, setRealtimeData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState('month');
  const [activeTab, setActiveTab] = useState('overview');
  const [refreshInterval, setRefreshInterval] = useState(null);

  // Fetch dashboard data
  const fetchDashboardData = async (period = 'month') => {
    try {
      setLoading(true);
      const response = await fetch(`/api/analytics/dashboard?period=${period}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch dashboard data');
      }

      const data = await response.json();
      setDashboardData(data.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Fetch competitive analysis
  const fetchCompetitiveData = async (period = 'month') => {
    try {
      const response = await fetch(`/api/analytics/competitive?period=${period}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setCompetitiveData(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch competitive data:', err);
    }
  };

  // Fetch ROI analysis
  const fetchRoiData = async (period = 'month') => {
    try {
      const response = await fetch(`/api/analytics/roi?period=${period}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setRoiData(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch ROI data:', err);
    }
  };

  // Fetch real-time data
  const fetchRealtimeData = async () => {
    try {
      const response = await fetch('/api/analytics/realtime', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setRealtimeData(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch real-time data:', err);
    }
  };

  // Handle period change
  const handlePeriodChange = (period) => {
    setSelectedPeriod(period);
    fetchDashboardData(period);
    fetchCompetitiveData(period);
    fetchRoiData(period);
  };

  // Export data
  const handleExport = async (format) => {
    try {
      const response = await fetch(`/api/analytics/export?format=${format}&period=${selectedPeriod}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `analytics-${selectedPeriod}-${new Date().toISOString().split('T')[0]}.${format}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (err) {
      console.error('Failed to export data:', err);
    }
  };

  // Setup real-time updates
  useEffect(() => {
    if (activeTab === 'realtime') {
      fetchRealtimeData();
      const interval = setInterval(fetchRealtimeData, 30000); // Update every 30 seconds
      setRefreshInterval(interval);
      return () => clearInterval(interval);
    } else if (refreshInterval) {
      clearInterval(refreshInterval);
      setRefreshInterval(null);
    }
  }, [activeTab]);

  // Initial data fetch
  useEffect(() => {
    fetchDashboardData(selectedPeriod);
    fetchCompetitiveData(selectedPeriod);
    fetchRoiData(selectedPeriod);
  }, []);

  // Chart configurations
  const getEngagementTrendChart = () => {
    if (!dashboardData?.engagementTrends?.daily) return null;

    return {
      labels: dashboardData.engagementTrends.daily.map(item => 
        new Date(item.date).toLocaleDateString()
      ),
      datasets: [
        {
          label: 'Engagement Rate (%)',
          data: dashboardData.engagementTrends.daily.map(item => item.engagementRate),
          borderColor: 'rgb(59, 130, 246)',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          tension: 0.4
        }
      ]
    };
  };

  const getContentTypeChart = () => {
    if (!dashboardData?.contentPerformance?.byType) return null;

    return {
      labels: dashboardData.contentPerformance.byType.map(item => item.type),
      datasets: [
        {
          label: 'Avg Engagement Rate',
          data: dashboardData.contentPerformance.byType.map(item => item.avgEngagementRate),
          backgroundColor: [
            'rgba(59, 130, 246, 0.8)',
            'rgba(16, 185, 129, 0.8)',
            'rgba(245, 158, 11, 0.8)',
            'rgba(239, 68, 68, 0.8)',
            'rgba(139, 92, 246, 0.8)'
          ]
        }
      ]
    };
  };

  const getPostingTimesChart = () => {
    if (!dashboardData?.audienceInsights?.bestPostingTimes) return null;

    return {
      labels: dashboardData.audienceInsights.bestPostingTimes.map(item => 
        `${item.hour}:00`
      ),
      datasets: [
        {
          label: 'Avg Engagement Rate',
          data: dashboardData.audienceInsights.bestPostingTimes.map(item => item.avgEngagementRate),
          backgroundColor: 'rgba(16, 185, 129, 0.8)'
        }
      ]
    };
  };

  if (loading) {
    return (
      <div className="analytics-dashboard loading">
        <div className="loading-spinner"></div>
        <p>Loading analytics data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="analytics-dashboard error">
        <div className="error-message">
          <h3>Error Loading Analytics</h3>
          <p>{error}</p>
          <button onClick={() => fetchDashboardData(selectedPeriod)} className="retry-btn">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="analytics-dashboard">
      <div className="dashboard-header">
        <h1>Analytics Dashboard</h1>
        <div className="dashboard-controls">
          <div className="period-selector">
            <label>Period:</label>
            <select 
              value={selectedPeriod} 
              onChange={(e) => handlePeriodChange(e.target.value)}
            >
              <option value="week">Last Week</option>
              <option value="month">Last Month</option>
              <option value="quarter">Last Quarter</option>
              <option value="year">Last Year</option>
            </select>
          </div>
          <div className="export-controls">
            <button onClick={() => handleExport('json')} className="export-btn">
              Export JSON
            </button>
            <button onClick={() => handleExport('csv')} className="export-btn">
              Export CSV
            </button>
          </div>
        </div>
      </div>

      <div className="dashboard-tabs">
        <button 
          className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button 
          className={`tab ${activeTab === 'competitive' ? 'active' : ''}`}
          onClick={() => setActiveTab('competitive')}
        >
          Competitive Analysis
        </button>
        <button 
          className={`tab ${activeTab === 'roi' ? 'active' : ''}`}
          onClick={() => setActiveTab('roi')}
        >
          ROI Analysis
        </button>
        <button 
          className={`tab ${activeTab === 'realtime' ? 'active' : ''}`}
          onClick={() => setActiveTab('realtime')}
        >
          Real-time
        </button>
      </div>

      <div className="dashboard-content">
        {activeTab === 'overview' && dashboardData && (
          <div className="overview-tab">
            {/* Key Metrics */}
            <div className="metrics-grid">
              <div className="metric-card">
                <h3>Total Posts</h3>
                <div className="metric-value">{dashboardData.overview.totalPosts}</div>
              </div>
              <div className="metric-card">
                <h3>Avg Engagement Rate</h3>
                <div className="metric-value">{dashboardData.overview.avgEngagementRate.toFixed(2)}%</div>
              </div>
              <div className="metric-card">
                <h3>Total Likes</h3>
                <div className="metric-value">{dashboardData.overview.totalLikes.toLocaleString()}</div>
              </div>
              <div className="metric-card">
                <h3>Total Comments</h3>
                <div className="metric-value">{dashboardData.overview.totalComments.toLocaleString()}</div>
              </div>
              <div className="metric-card">
                <h3>Total Shares</h3>
                <div className="metric-value">{dashboardData.overview.totalShares.toLocaleString()}</div>
              </div>
              <div className="metric-card">
                <h3>Total Impressions</h3>
                <div className="metric-value">{dashboardData.overview.totalImpressions.toLocaleString()}</div>
              </div>
            </div>

            {/* Charts */}
            <div className="charts-grid">
              <div className="chart-container">
                <h3>Engagement Trends</h3>
                {getEngagementTrendChart() && (
                  <Line 
                    data={getEngagementTrendChart()} 
                    options={{
                      responsive: true,
                      plugins: {
                        legend: {
                          position: 'top'
                        }
                      },
                      scales: {
                        y: {
                          beginAtZero: true,
                          title: {
                            display: true,
                            text: 'Engagement Rate (%)'
                          }
                        }
                      }
                    }}
                  />
                )}
              </div>

              <div className="chart-container">
                <h3>Content Type Performance</h3>
                {getContentTypeChart() && (
                  <Doughnut 
                    data={getContentTypeChart()} 
                    options={{
                      responsive: true,
                      plugins: {
                        legend: {
                          position: 'bottom'
                        }
                      }
                    }}
                  />
                )}
              </div>

              <div className="chart-container">
                <h3>Best Posting Times</h3>
                {getPostingTimesChart() && (
                  <Bar 
                    data={getPostingTimesChart()} 
                    options={{
                      responsive: true,
                      plugins: {
                        legend: {
                          display: false
                        }
                      },
                      scales: {
                        y: {
                          beginAtZero: true,
                          title: {
                            display: true,
                            text: 'Engagement Rate (%)'
                          }
                        },
                        x: {
                          title: {
                            display: true,
                            text: 'Hour of Day'
                          }
                        }
                      }
                    }}
                  />
                )}
              </div>
            </div>

            {/* Top Posts */}
            <div className="top-posts-section">
              <h3>Top Performing Posts</h3>
              <div className="posts-table">
                <table>
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Type</th>
                      <th>Engagement Rate</th>
                      <th>Likes</th>
                      <th>Comments</th>
                      <th>Shares</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboardData.topPosts.map((post, index) => (
                      <tr key={index}>
                        <td>{post.title || 'Untitled'}</td>
                        <td>{post.contentType}</td>
                        <td>{post.engagementRate.toFixed(2)}%</td>
                        <td>{post.likes}</td>
                        <td>{post.comments}</td>
                        <td>{post.shares}</td>
                        <td>{new Date(post.createdAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'competitive' && competitiveData && (
          <div className="competitive-tab">
            <div className="competitive-metrics">
              <h3>Industry Comparison</h3>
              <div className="comparison-grid">
                <div className="comparison-card">
                  <h4>Your Performance</h4>
                  <div className="performance-value">
                    {competitiveData.userMetrics?.avgEngagementRate?.toFixed(2)}%
                  </div>
                  <p>Average Engagement Rate</p>
                </div>
                <div className="comparison-card">
                  <h4>Industry Average</h4>
                  <div className="performance-value">
                    {competitiveData.industryBenchmarks?.avgEngagementRate?.toFixed(2)}%
                  </div>
                  <p>Industry Benchmark</p>
                </div>
                <div className="comparison-card">
                  <h4>Percentile Rank</h4>
                  <div className="performance-value">
                    {competitiveData.percentileRank?.toFixed(0)}th
                  </div>
                  <p>Industry Percentile</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'roi' && roiData && (
          <div className="roi-tab">
            <div className="roi-metrics">
              <h3>Return on Investment Analysis</h3>
              <div className="roi-grid">
                <div className="roi-card">
                  <h4>Time Saved</h4>
                  <div className="roi-value">
                    {roiData.timeSavings?.hoursPerWeek?.toFixed(1)} hrs/week
                  </div>
                  <p>Automation Benefits</p>
                </div>
                <div className="roi-card">
                  <h4>Cost Savings</h4>
                  <div className="roi-value">
                    ${roiData.costSavings?.monthlyValue?.toFixed(0)}/month
                  </div>
                  <p>Estimated Value</p>
                </div>
                <div className="roi-card">
                  <h4>Efficiency Gain</h4>
                  <div className="roi-value">
                    {roiData.efficiencyMetrics?.improvementPercentage?.toFixed(1)}%
                  </div>
                  <p>Performance Improvement</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'realtime' && (
          <div className="realtime-tab">
            <div className="realtime-header">
              <h3>Real-time Analytics</h3>
              <div className="last-updated">
                Last updated: {realtimeData?.lastUpdated ? 
                  new Date(realtimeData.lastUpdated).toLocaleTimeString() : 'Never'
                }
              </div>
            </div>

            {realtimeData && (
              <>
                <div className="recent-posts">
                  <h4>Recent Posts (Last 24 Hours)</h4>
                  <div className="posts-grid">
                    {realtimeData.recentPosts.map((post, index) => (
                      <div key={index} className="post-card">
                        <h5>{post.title || 'Untitled'}</h5>
                        <div className="post-metrics">
                          <span>👍 {post.likes || 0}</span>
                          <span>💬 {post.comments || 0}</span>
                          <span>🔄 {post.shares || 0}</span>
                          <span>📊 {post.engagement_rate?.toFixed(2) || 0}%</span>
                        </div>
                        <div className="post-time">
                          {new Date(post.posted_at).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="hourly-trends">
                  <h4>Hourly Engagement Trends</h4>
                  <div className="trends-list">
                    {realtimeData.hourlyTrends.map((trend, index) => (
                      <div key={index} className="trend-item">
                        <div className="trend-time">
                          {new Date(trend.hour).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}
                        </div>
                        <div className="trend-metrics">
                          <span>Engagement: {trend.avg_engagement_rate?.toFixed(2) || 0}%</span>
                          <span>Likes: {trend.total_likes || 0}</span>
                          <span>Comments: {trend.total_comments || 0}</span>
                          <span>Shares: {trend.total_shares || 0}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AnalyticsDashboard;