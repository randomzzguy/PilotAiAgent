const { Pool } = require('pg');
require('dotenv').config();

// Database connection
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'linkedin_automation',
  password: process.env.DB_PASSWORD || 'password',
  port: process.env.DB_PORT || 5432,
});

// Marine industry topics for Pilot Consultation
const marineTopics = [
  {
    name: 'Marine Safety & Compliance',
    description: 'Comprehensive coverage of marine safety protocols, IMCA standards, regulatory compliance, and best practices for safe marine operations in the UAE and international waters.',
    category: 'safety',
    keywords: ['IMCA', 'marine safety', 'compliance', 'safety protocols', 'regulations', 'inspection standards', 'UAE maritime law', 'diving safety'],
    target_audience: 'marine professionals',
    industry: 'marine',
    trending_score: 0.9,
    engagement_potential: 0.85,
    seasonal_relevance: 0.8,
    abu_dhabi_relevance: 0.95
  },
  {
    name: 'Commercial Diving System Inspections',
    description: 'Expert insights on IMCA ADSI certified diving system inspections, equipment standards, safety protocols, and compliance requirements for commercial diving operations.',
    category: 'inspection',
    keywords: ['IMCA ADSI', 'diving system inspection', 'commercial diving', 'equipment certification', 'safety standards', 'diving equipment', 'underwater operations'],
    target_audience: 'diving professionals',
    industry: 'marine',
    trending_score: 0.85,
    engagement_potential: 0.8,
    seasonal_relevance: 0.75,
    abu_dhabi_relevance: 0.9
  },
  {
    name: 'Marine Vessel Inspections',
    description: 'Professional marine vessel inspection services including pre-hire surveys, condition assessments, eCMID inspections, and comprehensive vessel evaluations.',
    category: 'inspection',
    keywords: ['vessel inspection', 'marine survey', 'pre-hire inspection', 'eCMID', 'condition survey', 'ship inspection', 'maritime assessment'],
    target_audience: 'ship owners',
    industry: 'marine',
    trending_score: 0.8,
    engagement_potential: 0.85,
    seasonal_relevance: 0.8,
    abu_dhabi_relevance: 0.9
  },
  {
    name: 'Abu Dhabi Marine Industry',
    description: 'Insights into Abu Dhabi\'s thriving marine sector, ADNOC projects, local maritime opportunities, and the growing importance of marine services in the UAE capital.',
    category: 'industry',
    keywords: ['Abu Dhabi marine', 'ADNOC', 'UAE maritime', 'marine industry', 'offshore projects', 'marine services', 'Abu Dhabi ports'],
    target_audience: 'business professionals',
    industry: 'marine',
    trending_score: 0.95,
    engagement_potential: 0.9,
    seasonal_relevance: 0.85,
    abu_dhabi_relevance: 1.0
  },
  {
    name: 'ISO Certifications & Quality Management',
    description: 'Understanding ISO 9001, 14001, and 45001 certifications in marine operations, quality management systems, and maintaining international standards.',
    category: 'certification',
    keywords: ['ISO 9001', 'ISO 14001', 'ISO 45001', 'quality management', 'certification', 'international standards', 'marine quality'],
    target_audience: 'quality managers',
    industry: 'marine',
    trending_score: 0.7,
    engagement_potential: 0.75,
    seasonal_relevance: 0.7,
    abu_dhabi_relevance: 0.8
  },
  {
    name: 'Offshore Operations & Oil Gas',
    description: 'Specialized marine services for offshore oil and gas operations, subsea activities, marine construction, and support for energy sector projects.',
    category: 'operations',
    keywords: ['offshore operations', 'oil and gas', 'subsea', 'marine construction', 'energy sector', 'offshore support', 'marine logistics'],
    target_audience: 'energy professionals',
    industry: 'energy',
    trending_score: 0.85,
    engagement_potential: 0.8,
    seasonal_relevance: 0.8,
    abu_dhabi_relevance: 0.95
  },
  {
    name: 'Marine Technology & Innovation',
    description: 'Latest advancements in marine technology, innovative inspection methods, digital transformation in maritime industry, and emerging marine solutions.',
    category: 'technology',
    keywords: ['marine technology', 'innovation', 'digital transformation', 'smart marine', 'marine automation', 'inspection technology'],
    target_audience: 'tech professionals',
    industry: 'technology',
    trending_score: 0.75,
    engagement_potential: 0.8,
    seasonal_relevance: 0.75,
    abu_dhabi_relevance: 0.8
  },
  {
    name: 'Environmental Marine Protection',
    description: 'Sustainable marine practices, environmental protection in maritime operations, eco-friendly marine solutions, and conservation efforts.',
    category: 'environment',
    keywords: ['marine environment', 'sustainability', 'environmental protection', 'eco-friendly', 'marine conservation', 'green marine'],
    target_audience: 'environmental professionals',
    industry: 'environment',
    trending_score: 0.8,
    engagement_potential: 0.85,
    seasonal_relevance: 0.9,
    abu_dhabi_relevance: 0.85
  },
  {
    name: 'Professional Development Marine Industry',
    description: 'Career growth opportunities in marine industry, professional certifications, skill development, and training programs for marine professionals.',
    category: 'career',
    keywords: ['professional development', 'marine careers', 'training', 'certification programs', 'skill development', 'marine education'],
    target_audience: 'professionals',
    industry: 'education',
    trending_score: 0.65,
    engagement_potential: 0.7,
    seasonal_relevance: 0.7,
    abu_dhabi_relevance: 0.75
  },
  {
    name: 'Client Success Stories & Case Studies',
    description: 'Real-world examples of successful marine inspection projects, client testimonials, case studies, and project highlights from Pilot Consultation.',
    category: 'success',
    keywords: ['success stories', 'case studies', 'client testimonials', 'project highlights', 'marine projects', 'inspection success'],
    target_audience: 'potential clients',
    industry: 'marine',
    trending_score: 0.7,
    engagement_potential: 0.9,
    seasonal_relevance: 0.75,
    abu_dhabi_relevance: 0.85
  }
];

async function addTopics() {
  const client = await pool.connect();
  
  try {
    console.log('🚀 Starting to add marine industry topics...');
    
    for (const topic of marineTopics) {
      // Check if topic already exists
      const existingTopic = await client.query(
        'SELECT id FROM content_topics WHERE name = $1',
        [topic.name]
      );
      
      if (existingTopic.rows.length > 0) {
        console.log(`⚠️  Topic "${topic.name}" already exists, skipping...`);
        continue;
      }
      
      // Insert new topic
      const result = await client.query(`
        INSERT INTO content_topics (
          name, description, category, keywords, target_audience, industry,
          trending_score, engagement_potential, seasonal_relevance, abu_dhabi_relevance,
          is_active, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id, name
      `, [
        topic.name,
        topic.description,
        topic.category,
        topic.keywords,
        topic.target_audience,
        topic.industry,
        topic.trending_score,
        topic.engagement_potential,
        topic.seasonal_relevance,
        topic.abu_dhabi_relevance
      ]);
      
      console.log(`✅ Added topic: "${result.rows[0].name}" (ID: ${result.rows[0].id})`);
    }
    
    console.log('🎉 Successfully added all marine industry topics!');
    
    // Display summary
    const totalTopics = await client.query('SELECT COUNT(*) FROM content_topics WHERE is_active = true');
    console.log(`📊 Total active topics in database: ${totalTopics.rows[0].count}`);
    
  } catch (error) {
    console.error('❌ Error adding topics:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the script
addTopics()
  .then(() => {
    console.log('✨ Topic addition completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Failed to add topics:', error);
    process.exit(1);
  });