import React, { useState, useEffect } from 'react';
import {
    Box,
    Card,
    CardContent,
    Typography,
    Button,
    TextField,
    Grid,
    Chip,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Tabs,
    Tab,
    IconButton,
    Tooltip,
    Alert,
    CircularProgress,
    Accordion,
    AccordionSummary,
    AccordionDetails,
    Rating,
    Divider,
    List,
    ListItem,
    ListItemText,
    ListItemIcon,
    Fab
} from '@mui/material';
import {
    Add as AddIcon,
    Edit as EditIcon,
    Delete as DeleteIcon,
    Search as SearchIcon,
    FilterList as FilterIcon,
    TrendingUp as TrendingIcon,
    Psychology as AIIcon,
    Template as TemplateIcon,
    Topic as TopicIcon,
    ExpandMore as ExpandMoreIcon,
    Star as StarIcon,
    Schedule as ScheduleIcon,
    Analytics as AnalyticsIcon,
    ContentCopy as CopyIcon
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';

const ContentTemplatesManager = () => {
    const [activeTab, setActiveTab] = useState(0);
    const [templates, setTemplates] = useState([]);
    const [topics, setTopics] = useState([]);
    const [trendingTopics, setTrendingTopics] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [filters, setFilters] = useState({
        templateType: '',
        contentCategory: '',
        targetAudience: '',
        industry: '',
        difficultyLevel: ''
    });
    const [selectedTemplate, setSelectedTemplate] = useState(null);
    const [showTemplateDialog, setShowTemplateDialog] = useState(false);
    const [showGenerateDialog, setShowGenerateDialog] = useState(false);
    const [generationVariables, setGenerationVariables] = useState({});
    const [generatedContent, setGeneratedContent] = useState(null);
    const [categories, setCategories] = useState({});
    const { enqueueSnackbar } = useSnackbar();

    useEffect(() => {
        loadInitialData();
    }, []);

    useEffect(() => {
        if (activeTab === 0) {
            loadTemplates();
        } else if (activeTab === 1) {
            loadTopics();
            loadTrendingTopics();
        }
    }, [activeTab, filters, searchTerm]);

    const loadInitialData = async () => {
        try {
            const response = await fetch('/api/content-templates/categories', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            const data = await response.json();
            if (data.success) {
                setCategories(data.data);
            }
        } catch (error) {
            console.error('Error loading categories:', error);
        }
    };

    const loadTemplates = async () => {
        setLoading(true);
        try {
            const queryParams = new URLSearchParams();
            Object.entries(filters).forEach(([key, value]) => {
                if (value) queryParams.append(key, value);
            });
            if (searchTerm) queryParams.append('search', searchTerm);

            const response = await fetch(`/api/content-templates/templates?${queryParams}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            const data = await response.json();
            if (data.success) {
                setTemplates(data.data);
            }
        } catch (error) {
            enqueueSnackbar('Error loading templates', { variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const loadTopics = async () => {
        setLoading(true);
        try {
            const queryParams = new URLSearchParams();
            if (filters.industry) queryParams.append('industry', filters.industry);
            if (searchTerm) queryParams.append('search', searchTerm);

            const response = await fetch(`/api/content-templates/topics?${queryParams}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            const data = await response.json();
            if (data.success) {
                setTopics(data.data);
            }
        } catch (error) {
            console.error('Error loading topics:', error);
            // Fallback to local marine topics data
            try {
                const fallbackResponse = await fetch('/marine-topics.json');
                const fallbackData = await fallbackResponse.json();
                setTopics(fallbackData || []);
                console.log('Loaded fallback marine topics data');
            } catch (fallbackErr) {
                console.error('Error loading fallback topics:', fallbackErr);
                enqueueSnackbar('Error loading topics', { variant: 'error' });
            }
        } finally {
            setLoading(false);
        }
    };

    const loadTrendingTopics = async () => {
        try {
            const response = await fetch('/api/content-templates/topics/trending?limit=5', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            const data = await response.json();
            if (data.success) {
                setTrendingTopics(data.data);
            }
        } catch (error) {
            console.error('Error loading trending topics:', error);
        }
    };

    const handleGenerateContent = async (template) => {
        setSelectedTemplate(template);
        setGenerationVariables({});
        setShowGenerateDialog(true);
    };

    const executeContentGeneration = async () => {
        try {
            setLoading(true);
            const response = await fetch(`/api/content-templates/templates/${selectedTemplate.id}/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({
                    variables: generationVariables,
                    options: {}
                })
            });
            
            const data = await response.json();
            if (data.success) {
                setGeneratedContent(data.data);
                enqueueSnackbar('Content generated successfully!', { variant: 'success' });
            } else {
                enqueueSnackbar(data.message || 'Generation failed', { variant: 'error' });
            }
        } catch (error) {
            enqueueSnackbar('Error generating content', { variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
        enqueueSnackbar('Content copied to clipboard!', { variant: 'success' });
    };

    const renderTemplateCard = (template) => (
        <Card key={template.id} sx={{ mb: 2, position: 'relative' }}>
            <CardContent>
                <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2}>
                    <Box>
                        <Typography variant="h6" gutterBottom>
                            {template.name}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" gutterBottom>
                            {template.description}
                        </Typography>
                    </Box>
                    <Box display="flex" gap={1}>
                        <Tooltip title="Generate Content">
                            <IconButton 
                                color="primary" 
                                onClick={() => handleGenerateContent(template)}
                            >
                                <AIIcon />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Edit Template">
                            <IconButton color="secondary">
                                <EditIcon />
                            </IconButton>
                        </Tooltip>
                    </Box>
                </Box>
                
                <Box display="flex" gap={1} mb={2} flexWrap="wrap">
                    <Chip 
                        label={template.template_type} 
                        size="small" 
                        color="primary" 
                        variant="outlined"
                    />
                    <Chip 
                        label={template.content_category} 
                        size="small" 
                        color="secondary" 
                        variant="outlined"
                    />
                    <Chip 
                        label={template.difficulty_level} 
                        size="small" 
                        variant="outlined"
                    />
                    {template.is_premium && (
                        <Chip 
                            label="Premium" 
                            size="small" 
                            color="warning" 
                            icon={<StarIcon />}
                        />
                    )}
                </Box>
                
                <Grid container spacing={2}>
                    <Grid item xs={6} sm={3}>
                        <Typography variant="caption" color="text.secondary">
                            Engagement
                        </Typography>
                        <Rating 
                            value={template.estimated_engagement * 5} 
                            readOnly 
                            size="small"
                            precision={0.1}
                        />
                    </Grid>
                    <Grid item xs={6} sm={3}>
                        <Typography variant="caption" color="text.secondary">
                            Usage Count
                        </Typography>
                        <Typography variant="body2">
                            {template.usage_count || 0}
                        </Typography>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                        <Typography variant="caption" color="text.secondary">
                            Success Rate
                        </Typography>
                        <Typography variant="body2">
                            {((template.success_rate || 0) * 100).toFixed(1)}%
                        </Typography>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                        <Typography variant="caption" color="text.secondary">
                            Time to Create
                        </Typography>
                        <Typography variant="body2">
                            {template.time_to_create || 15} min
                        </Typography>
                    </Grid>
                </Grid>
            </CardContent>
        </Card>
    );

    const renderTopicCard = (topic) => (
        <Card key={topic.id} sx={{ mb: 2 }}>
            <CardContent>
                <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2}>
                    <Box>
                        <Typography variant="h6" gutterBottom>
                            {topic.name}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" gutterBottom>
                            {topic.description}
                        </Typography>
                    </Box>
                    <Box display="flex" gap={1}>
                        <Tooltip title="View Analytics">
                            <IconButton color="primary">
                                <AnalyticsIcon />
                            </IconButton>
                        </Tooltip>
                    </Box>
                </Box>
                
                <Box display="flex" gap={1} mb={2} flexWrap="wrap">
                    <Chip 
                        label={topic.category} 
                        size="small" 
                        color="primary" 
                        variant="outlined"
                    />
                    <Chip 
                        label={topic.industry} 
                        size="small" 
                        color="secondary" 
                        variant="outlined"
                    />
                    {topic.keywords && topic.keywords.slice(0, 3).map((keyword, index) => (
                        <Chip 
                            key={index}
                            label={keyword} 
                            size="small" 
                            variant="outlined"
                        />
                    ))}
                </Box>
                
                <Grid container spacing={2}>
                    <Grid item xs={6} sm={3}>
                        <Typography variant="caption" color="text.secondary">
                            Abu Dhabi Relevance
                        </Typography>
                        <Rating 
                            value={topic.abu_dhabi_relevance * 5} 
                            readOnly 
                            size="small"
                            precision={0.1}
                        />
                    </Grid>
                    <Grid item xs={6} sm={3}>
                        <Typography variant="caption" color="text.secondary">
                            Trending Score
                        </Typography>
                        <Rating 
                            value={topic.trending_score * 5} 
                            readOnly 
                            size="small"
                            precision={0.1}
                        />
                    </Grid>
                    <Grid item xs={6} sm={3}>
                        <Typography variant="caption" color="text.secondary">
                            Engagement Potential
                        </Typography>
                        <Rating 
                            value={topic.engagement_potential * 5} 
                            readOnly 
                            size="small"
                            precision={0.1}
                        />
                    </Grid>
                    <Grid item xs={6} sm={3}>
                        <Typography variant="caption" color="text.secondary">
                            Template Count
                        </Typography>
                        <Typography variant="body2">
                            {topic.template_count || 0}
                        </Typography>
                    </Grid>
                </Grid>
            </CardContent>
        </Card>
    );

    const renderGenerateDialog = () => (
        <Dialog 
            open={showGenerateDialog} 
            onClose={() => setShowGenerateDialog(false)}
            maxWidth="md"
            fullWidth
        >
            <DialogTitle>
                Generate Content: {selectedTemplate?.name}
            </DialogTitle>
            <DialogContent>
                {selectedTemplate && (
                    <Box>
                        <Typography variant="body2" color="text.secondary" gutterBottom>
                            {selectedTemplate.description}
                        </Typography>
                        
                        <Divider sx={{ my: 2 }} />
                        
                        {selectedTemplate.variables && Object.entries(selectedTemplate.variables).map(([key, config]) => (
                            <TextField
                                key={key}
                                fullWidth
                                label={key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                                value={generationVariables[key] || ''}
                                onChange={(e) => setGenerationVariables(prev => ({
                                    ...prev,
                                    [key]: e.target.value
                                }))}
                                multiline={config.type === 'text'}
                                rows={config.type === 'text' ? 3 : 1}
                                helperText={`Max length: ${config.max_length || 'No limit'}`}
                                sx={{ mb: 2 }}
                            />
                        ))}
                        
                        {generatedContent && (
                            <Box mt={3}>
                                <Typography variant="h6" gutterBottom>
                                    Generated Content:
                                </Typography>
                                <Card variant="outlined">
                                    <CardContent>
                                        <Typography variant="body1" style={{ whiteSpace: 'pre-wrap' }}>
                                            {generatedContent.content}
                                        </Typography>
                                        <Box mt={2} display="flex" justifyContent="space-between" alignItems="center">
                                            <Box>
                                                <Typography variant="caption" color="text.secondary">
                                                    Estimated Engagement: {(generatedContent.estimated_engagement * 100).toFixed(1)}%
                                                </Typography>
                                            </Box>
                                            <Button
                                                startIcon={<CopyIcon />}
                                                onClick={() => copyToClipboard(generatedContent.content)}
                                            >
                                                Copy
                                            </Button>
                                        </Box>
                                    </CardContent>
                                </Card>
                            </Box>
                        )}
                    </Box>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={() => setShowGenerateDialog(false)}>
                    Close
                </Button>
                <Button 
                    onClick={executeContentGeneration}
                    variant="contained"
                    disabled={loading}
                    startIcon={loading ? <CircularProgress size={20} /> : <AIIcon />}
                >
                    Generate
                </Button>
            </DialogActions>
        </Dialog>
    );

    return (
        <Box sx={{ p: 3 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                <Typography variant="h4" gutterBottom>
                    Content Templates & Topics
                </Typography>
                <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={() => setShowTemplateDialog(true)}
                >
                    Create Template
                </Button>
            </Box>

            {/* Trending Topics Alert */}
            {trendingTopics.length > 0 && (
                <Alert 
                    severity="info" 
                    icon={<TrendingIcon />}
                    sx={{ mb: 3 }}
                >
                    <Typography variant="subtitle2" gutterBottom>
                        Trending Topics This Week:
                    </Typography>
                    <Box display="flex" gap={1} flexWrap="wrap">
                        {trendingTopics.map((topic) => (
                            <Chip 
                                key={topic.id}
                                label={topic.name}
                                size="small"
                                color="primary"
                                variant="outlined"
                            />
                        ))}
                    </Box>
                </Alert>
            )}

            {/* Search and Filters */}
            <Card sx={{ mb: 3 }}>
                <CardContent>
                    <Grid container spacing={2} alignItems="center">
                        <Grid item xs={12} md={4}>
                            <TextField
                                fullWidth
                                placeholder="Search templates and topics..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                InputProps={{
                                    startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />
                                }}
                            />
                        </Grid>
                        <Grid item xs={12} md={8}>
                            <Grid container spacing={2}>
                                <Grid item xs={6} sm={3}>
                                    <FormControl fullWidth size="small">
                                        <InputLabel>Type</InputLabel>
                                        <Select
                                            value={filters.templateType}
                                            onChange={(e) => setFilters(prev => ({ ...prev, templateType: e.target.value }))}
                                        >
                                            <MenuItem value="">All Types</MenuItem>
                                            {categories.templateTypes?.map((type) => (
                                                <MenuItem key={type} value={type}>{type}</MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                </Grid>
                                <Grid item xs={6} sm={3}>
                                    <FormControl fullWidth size="small">
                                        <InputLabel>Category</InputLabel>
                                        <Select
                                            value={filters.contentCategory}
                                            onChange={(e) => setFilters(prev => ({ ...prev, contentCategory: e.target.value }))}
                                        >
                                            <MenuItem value="">All Categories</MenuItem>
                                            {categories.contentCategories?.map((category) => (
                                                <MenuItem key={category} value={category}>{category}</MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                </Grid>
                                <Grid item xs={6} sm={3}>
                                    <FormControl fullWidth size="small">
                                        <InputLabel>Audience</InputLabel>
                                        <Select
                                            value={filters.targetAudience}
                                            onChange={(e) => setFilters(prev => ({ ...prev, targetAudience: e.target.value }))}
                                        >
                                            <MenuItem value="">All Audiences</MenuItem>
                                            {categories.targetAudiences?.map((audience) => (
                                                <MenuItem key={audience} value={audience}>{audience}</MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                </Grid>
                                <Grid item xs={6} sm={3}>
                                    <FormControl fullWidth size="small">
                                        <InputLabel>Industry</InputLabel>
                                        <Select
                                            value={filters.industry}
                                            onChange={(e) => setFilters(prev => ({ ...prev, industry: e.target.value }))}
                                        >
                                            <MenuItem value="">All Industries</MenuItem>
                                            {categories.industries?.map((industry) => (
                                                <MenuItem key={industry} value={industry}>{industry}</MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                </Grid>
                            </Grid>
                        </Grid>
                    </Grid>
                </CardContent>
            </Card>

            {/* Tabs */}
            <Tabs value={activeTab} onChange={(e, newValue) => setActiveTab(newValue)} sx={{ mb: 3 }}>
                <Tab icon={<TemplateIcon />} label="Templates" />
                <Tab icon={<TopicIcon />} label="Topics" />
            </Tabs>

            {/* Content */}
            {loading ? (
                <Box display="flex" justifyContent="center" py={4}>
                    <CircularProgress />
                </Box>
            ) : (
                <Box>
                    {activeTab === 0 && (
                        <Box>
                            {templates.length === 0 ? (
                                <Alert severity="info">
                                    No templates found. Try adjusting your filters or create a new template.
                                </Alert>
                            ) : (
                                templates.map(renderTemplateCard)
                            )}
                        </Box>
                    )}
                    
                    {activeTab === 1 && (
                        <Box>
                            {topics.length === 0 ? (
                                <Alert severity="info">
                                    No topics found. Try adjusting your filters.
                                </Alert>
                            ) : (
                                topics.map(renderTopicCard)
                            )}
                        </Box>
                    )}
                </Box>
            )}

            {/* Generate Content Dialog */}
            {renderGenerateDialog()}

            {/* Floating Action Button for Quick Actions */}
            <Fab
                color="primary"
                sx={{ position: 'fixed', bottom: 16, right: 16 }}
                onClick={() => setShowTemplateDialog(true)}
            >
                <AddIcon />
            </Fab>
        </Box>
    );
};

export default ContentTemplatesManager;