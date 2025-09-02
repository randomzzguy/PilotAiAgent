import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Button,
  Chip,
  Avatar,
  LinearProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  Tooltip,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider,
  Paper,
  CircularProgress
} from '@mui/material';
import {
  Schedule as ScheduleIcon,
  TrendingUp as TrendingUpIcon,
  AccessTime as AccessTimeIcon,
  AutoAwesome as AutoAwesomeIcon,
  Analytics as AnalyticsIcon,
  Refresh as RefreshIcon,
  Settings as SettingsIcon,
  CalendarToday as CalendarIcon,
  Timeline as TimelineIcon,
  Speed as SpeedIcon,
  Star as StarIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Info as InfoIcon
} from '@mui/icons-material';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { format, addDays, isToday, isTomorrow } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import api from '../services/api';

const SchedulingDashboard = () => {
  const { user } = useAuth();
  const { showNotification } = useNotification();
  
  // State management
  const [loading, setLoading] = useState(true);
  const [optimalTimes, setOptimalTimes] = useState(null);
  const [scheduledPosts, setScheduledPosts] = useState([]);
  const [nextOptimalTime, setNextOptimalTime] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [selectedPost, setSelectedPost] = useState(null);
  const [autoScheduleEnabled, setAutoScheduleEnabled] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  
  // Form state
  const [scheduleForm, setScheduleForm] = useState({
    contentType: 'text',
    urgency: 'normal',
    targetAudience: 'general',
    customTime: new Date(),
    useOptimalTime: true
  });

  // Load dashboard data
  const loadDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      
      const [optimalTimesRes, scheduledPostsRes, nextOptimalRes, recommendationsRes, analyticsRes] = await Promise.allSettled([
        api.get('/api/optimal-timing/personalized'),
        api.get('/api/scheduling/posts'),
        api.get('/api/optimal-timing/next'),
        api.get('/api/optimal-timing/recommendations'),
        api.get('/api/optimal-timing/analytics?period=30')
      ]);

      if (optimalTimesRes.status === 'fulfilled') {
        setOptimalTimes(optimalTimesRes.value.data);
      }
      
      if (scheduledPostsRes.status === 'fulfilled') {
        setScheduledPosts(scheduledPostsRes.value.data);
      }
      
      if (nextOptimalRes.status === 'fulfilled') {
        setNextOptimalTime(nextOptimalRes.value.data);
      }
      
      if (recommendationsRes.status === 'fulfilled') {
        setRecommendations(recommendationsRes.value.data);
      }
      
      if (analyticsRes.status === 'fulfilled') {
        setAnalytics(analyticsRes.value.data);
      }
      
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      showNotification('Failed to load scheduling data', 'error');
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  // Refresh optimal times cache
  const refreshOptimalTimes = async () => {
    try {
      setRefreshing(true);
      await api.post('/api/optimal-timing/refresh-cache');
      await loadDashboardData();
      showNotification('Optimal times updated successfully', 'success');
    } catch (error) {
      console.error('Error refreshing optimal times:', error);
      showNotification('Failed to refresh optimal times', 'error');
    } finally {
      setRefreshing(false);
    }
  };

  // Schedule post at optimal time
  const scheduleAtOptimalTime = async (postData) => {
    try {
      const response = await api.post('/api/scheduling/schedule-optimal', {
        ...postData,
        contentType: scheduleForm.contentType,
        urgency: scheduleForm.urgency,
        targetAudience: scheduleForm.targetAudience
      });
      
      showNotification('Post scheduled at optimal time', 'success');
      setScheduleDialogOpen(false);
      await loadDashboardData();
      
    } catch (error) {
      console.error('Error scheduling post:', error);
      showNotification('Failed to schedule post', 'error');
    }
  };

  // Get confidence color
  const getConfidenceColor = (confidence) => {
    switch (confidence) {
      case 'high': return 'success';
      case 'medium': return 'warning';
      case 'low': return 'error';
      default: return 'default';
    }
  };

  // Get confidence icon
  const getConfidenceIcon = (confidence) => {
    switch (confidence) {
      case 'high': return <CheckCircleIcon />;
      case 'medium': return <WarningIcon />;
      case 'low': return <InfoIcon />;
      default: return <InfoIcon />;
    }
  };

  // Format time for display
  const formatTimeForDisplay = (dateTime) => {
    const date = new Date(dateTime);
    if (isToday(date)) {
      return `Today at ${format(date, 'h:mm a')}`;
    } else if (isTomorrow(date)) {
      return `Tomorrow at ${format(date, 'h:mm a')}`;
    } else {
      return format(date, 'MMM d, h:mm a');
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress size={60} />
      </Box>
    );
  }

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Box sx={{ p: 3 }}>
        {/* Header */}
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
          <Typography variant="h4" component="h1" fontWeight="bold">
            Content Scheduling Dashboard
          </Typography>
          <Box>
            <Tooltip title="Refresh optimal times">
              <IconButton onClick={refreshOptimalTimes} disabled={refreshing}>
                {refreshing ? <CircularProgress size={24} /> : <RefreshIcon />}
              </IconButton>
            </Tooltip>
            <Button
              variant="contained"
              startIcon={<ScheduleIcon />}
              onClick={() => setScheduleDialogOpen(true)}
              sx={{ ml: 1 }}
            >
              Schedule Post
            </Button>
          </Box>
        </Box>

        <Grid container spacing={3}>
          {/* Next Optimal Time Card */}
          <Grid item xs={12} md={6} lg={4}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Box display="flex" alignItems="center" mb={2}>
                  <Avatar sx={{ bgcolor: 'primary.main', mr: 2 }}>
                    <AccessTimeIcon />
                  </Avatar>
                  <Typography variant="h6">Next Optimal Time</Typography>
                </Box>
                
                {nextOptimalTime ? (
                  <>
                    <Typography variant="h5" color="primary" gutterBottom>
                      {formatTimeForDisplay(nextOptimalTime.dateTime)}
                    </Typography>
                    <Box display="flex" alignItems="center" mb={1}>
                      <Chip
                        icon={getConfidenceIcon(nextOptimalTime.confidence)}
                        label={`${nextOptimalTime.confidence} confidence`}
                        color={getConfidenceColor(nextOptimalTime.confidence)}
                        size="small"
                      />
                    </Box>
                    <Typography variant="body2" color="text.secondary">
                      Expected engagement: {nextOptimalTime.expectedEngagement}%
                    </Typography>
                  </>
                ) : (
                  <Alert severity="info">
                    No optimal time data available. Post more content to get personalized recommendations.
                  </Alert>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Performance Analytics Card */}
          <Grid item xs={12} md={6} lg={4}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Box display="flex" alignItems="center" mb={2}>
                  <Avatar sx={{ bgcolor: 'success.main', mr: 2 }}>
                    <AnalyticsIcon />
                  </Avatar>
                  <Typography variant="h6">Performance Analytics</Typography>
                </Box>
                
                {analytics ? (
                  <>
                    <Typography variant="h5" color="success.main" gutterBottom>
                      {analytics.avgEngagementRate}%
                    </Typography>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      Average engagement rate
                    </Typography>
                    
                    <Box mt={2}>
                      <Typography variant="body2" gutterBottom>
                        Best performing time: {analytics.bestHour}:00
                      </Typography>
                      <Typography variant="body2" gutterBottom>
                        Best day: {analytics.bestDay}
                      </Typography>
                      <Typography variant="body2">
                        Posts analyzed: {analytics.totalPosts}
                      </Typography>
                    </Box>
                  </>
                ) : (
                  <Alert severity="info">
                    Analytics will be available after posting content.
                  </Alert>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Auto-Schedule Settings Card */}
          <Grid item xs={12} md={6} lg={4}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Box display="flex" alignItems="center" mb={2}>
                  <Avatar sx={{ bgcolor: 'warning.main', mr: 2 }}>
                    <AutoAwesomeIcon />
                  </Avatar>
                  <Typography variant="h6">Auto-Schedule</Typography>
                </Box>
                
                <FormControlLabel
                  control={
                    <Switch
                      checked={autoScheduleEnabled}
                      onChange={(e) => setAutoScheduleEnabled(e.target.checked)}
                    />
                  }
                  label="Enable auto-scheduling"
                />
                
                <Typography variant="body2" color="text.secondary" mt={1}>
                  Automatically schedule content at optimal times based on your audience engagement patterns.
                </Typography>
                
                {autoScheduleEnabled && (
                  <Alert severity="success" sx={{ mt: 2 }}>
                    Auto-scheduling is active. New content will be scheduled at optimal times.
                  </Alert>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Optimal Times Overview */}
          <Grid item xs={12} lg={8}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Your Optimal Posting Times
                </Typography>
                
                {optimalTimes && optimalTimes.optimalTimes ? (
                  <Grid container spacing={2}>
                    {Object.entries(optimalTimes.optimalTimes).map(([day, times]) => (
                      <Grid item xs={12} sm={6} md={4} key={day}>
                        <Paper sx={{ p: 2, textAlign: 'center' }}>
                          <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                            {day}
                          </Typography>
                          {times.map((time, index) => (
                            <Chip
                              key={index}
                              label={`${time.hour}:00`}
                              size="small"
                              sx={{ m: 0.5 }}
                              color={time.score > 0.8 ? 'success' : time.score > 0.6 ? 'warning' : 'default'}
                            />
                          ))}
                        </Paper>
                      </Grid>
                    ))}
                  </Grid>
                ) : (
                  <Alert severity="info">
                    Optimal times will be calculated based on your posting history and engagement data.
                  </Alert>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Smart Recommendations */}
          <Grid item xs={12} lg={4}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Smart Recommendations
                </Typography>
                
                <List>
                  {recommendations.map((rec, index) => (
                    <React.Fragment key={index}>
                      <ListItem>
                        <ListItemIcon>
                          <StarIcon color="primary" />
                        </ListItemIcon>
                        <ListItemText
                          primary={rec.title}
                          secondary={rec.description}
                        />
                      </ListItem>
                      {index < recommendations.length - 1 && <Divider />}
                    </React.Fragment>
                  ))}
                </List>
                
                {recommendations.length === 0 && (
                  <Alert severity="info">
                    Recommendations will appear as you post more content.
                  </Alert>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Scheduled Posts */}
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Upcoming Scheduled Posts
                </Typography>
                
                {scheduledPosts.length > 0 ? (
                  <List>
                    {scheduledPosts.slice(0, 5).map((post, index) => (
                      <React.Fragment key={post.id}>
                        <ListItem>
                          <ListItemIcon>
                            <ScheduleIcon />
                          </ListItemIcon>
                          <ListItemText
                            primary={post.content?.substring(0, 100) + '...'}
                            secondary={`Scheduled for ${formatTimeForDisplay(post.scheduledTime)} • ${post.contentType}`}
                          />
                          <Chip
                            label={post.optimizationApplied ? 'Optimized' : 'Manual'}
                            color={post.optimizationApplied ? 'success' : 'default'}
                            size="small"
                          />
                        </ListItem>
                        {index < Math.min(scheduledPosts.length, 5) - 1 && <Divider />}
                      </React.Fragment>
                    ))}
                  </List>
                ) : (
                  <Alert severity="info">
                    No scheduled posts. Create and schedule your first post!
                  </Alert>
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Schedule Post Dialog */}
        <Dialog open={scheduleDialogOpen} onClose={() => setScheduleDialogOpen(false)} maxWidth="md" fullWidth>
          <DialogTitle>Schedule New Post</DialogTitle>
          <DialogContent>
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>Content Type</InputLabel>
                  <Select
                    value={scheduleForm.contentType}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, contentType: e.target.value })}
                  >
                    <MenuItem value="text">Text Post</MenuItem>
                    <MenuItem value="image">Image Post</MenuItem>
                    <MenuItem value="video">Video Post</MenuItem>
                    <MenuItem value="article">Article</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>Urgency</InputLabel>
                  <Select
                    value={scheduleForm.urgency}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, urgency: e.target.value })}
                  >
                    <MenuItem value="low">Low</MenuItem>
                    <MenuItem value="normal">Normal</MenuItem>
                    <MenuItem value="high">High</MenuItem>
                    <MenuItem value="urgent">Urgent</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              
              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel>Target Audience</InputLabel>
                  <Select
                    value={scheduleForm.targetAudience}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, targetAudience: e.target.value })}
                  >
                    <MenuItem value="general">General Audience</MenuItem>
                    <MenuItem value="professionals">Professionals</MenuItem>
                    <MenuItem value="entrepreneurs">Entrepreneurs</MenuItem>
                    <MenuItem value="students">Students</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              
              <Grid item xs={12}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={scheduleForm.useOptimalTime}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, useOptimalTime: e.target.checked })}
                    />
                  }
                  label="Use optimal timing (recommended)"
                />
              </Grid>
              
              {!scheduleForm.useOptimalTime && (
                <Grid item xs={12}>
                  <DateTimePicker
                    label="Custom Schedule Time"
                    value={scheduleForm.customTime}
                    onChange={(newValue) => setScheduleForm({ ...scheduleForm, customTime: newValue })}
                    renderInput={(params) => <TextField {...params} fullWidth />}
                    minDateTime={new Date()}
                  />
                </Grid>
              )}
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setScheduleDialogOpen(false)}>Cancel</Button>
            <Button
              variant="contained"
              onClick={() => scheduleAtOptimalTime(scheduleForm)}
              disabled={!scheduleForm.contentType}
            >
              Schedule Post
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </LocalizationProvider>
  );
};

export default SchedulingDashboard;