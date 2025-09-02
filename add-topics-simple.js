// Simple script to add topics using a JSON file approach
// This will create a topics.json file that can be imported later

const fs = require('fs');
const path = require('path');

// Marine industry topics for Pilot Consultation
const marineTopics = [
  {
    id: 1,
    name: 'Marine Safety & Compliance',
    description: 'Comprehensive coverage of marine safety protocols, IMCA standards, regulatory compliance, and best practices for safe marine operations in the UAE and international waters.',
    category: 'safety',
    keywords: ['IMCA', 'marine safety', 'compliance', 'safety protocols', 'regulations', 'inspection standards', 'UAE maritime law', 'diving safety'],
    target_audience: 'marine professionals',
    industry: 'marine',
    trending_score: 0.9,
    engagement_potential: 0.85,
    seasonal_relevance: 0.8,
    abu_dhabi_relevance: 0.95,
    is_active: true,
    created_at: new Date().toISOString()
  },
  {
    id: 2,
    name: 'Commercial Diving System Inspections',
    description: 'Expert insights on IMCA ADSI certified diving system inspections, equipment standards, safety protocols, and compliance requirements for commercial diving operations.',
    category: 'inspection',
    keywords: ['IMCA ADSI', 'diving system inspection', 'commercial diving', 'equipment certification', 'safety standards', 'diving equipment', 'underwater operations'],
    target_audience: 'diving professionals',
    industry: 'marine',
    trending_score: 0.85,
    engagement_potential: 0.8,
    seasonal_relevance: 0.75,
    abu_dhabi_relevance: 0.9,
    is_active: true,
    created_at: new Date().toISOString()
  },
  {
    id: 3,
    name: 'Marine Vessel Inspections',
    description: 'Professional marine vessel inspection services including pre-hire surveys, condition assessments, eCMID inspections, and comprehensive vessel evaluations.',
    category: 'inspection',
    keywords: ['vessel inspection', 'marine survey', 'pre-hire inspection', 'eCMID', 'condition survey', 'ship inspection', 'maritime assessment'],
    target_audience: 'ship owners',
    industry: 'marine',
    trending_score: 0.8,
    engagement_potential: 0.85,
    seasonal_relevance: 0.8,
    abu_dhabi_relevance: 0.9,
    is_active: true,
    created_at: new Date().toISOString()
  },
  {
    id: 4,
    name: 'Abu Dhabi Marine Industry',
    description: 'Insights into Abu Dhabi\'s thriving marine sector, ADNOC projects, local maritime opportunities, and the growing importance of marine services in the UAE capital.',
    category: 'industry',
    keywords: ['Abu Dhabi marine', 'ADNOC', 'UAE maritime', 'marine industry', 'offshore projects', 'marine services', 'Abu Dhabi ports'],
    target_audience: 'business professionals',
    industry: 'marine',
    trending_score: 0.95,
    engagement_potential: 0.9,
    seasonal_relevance: 0.85,
    abu_dhabi_relevance: 1.0,
    is_active: true,
    created_at: new Date().toISOString()
  },
  {
    id: 5,
    name: 'ISO Certifications & Quality Management',
    description: 'Understanding ISO 9001, 14001, and 45001 certifications in marine operations, quality management systems, and maintaining international standards.',
    category: 'certification',
    keywords: ['ISO 9001', 'ISO 14001', 'ISO 45001', 'quality management', 'certification', 'international standards', 'marine quality'],
    target_audience: 'quality managers',
    industry: 'marine',
    trending_score: 0.7,
    engagement_potential: 0.75,
    seasonal_relevance: 0.7,
    abu_dhabi_relevance: 0.8,
    is_active: true,
    created_at: new Date().toISOString()
  },
  {
    id: 6,
    name: 'Offshore Operations & Oil Gas',
    description: 'Specialized marine services for offshore oil and gas operations, subsea activities, marine construction, and support for energy sector projects.',
    category: 'operations',
    keywords: ['offshore operations', 'oil and gas', 'subsea', 'marine construction', 'energy sector', 'offshore support', 'marine logistics'],
    target_audience: 'energy professionals',
    industry: 'energy',
    trending_score: 0.85,
    engagement_potential: 0.8,
    seasonal_relevance: 0.8,
    abu_dhabi_relevance: 0.95,
    is_active: true,
    created_at: new Date().toISOString()
  },
  {
    id: 7,
    name: 'Marine Technology & Innovation',
    description: 'Latest advancements in marine technology, innovative inspection methods, digital transformation in maritime industry, and emerging marine solutions.',
    category: 'technology',
    keywords: ['marine technology', 'innovation', 'digital transformation', 'smart marine', 'marine automation', 'inspection technology'],
    target_audience: 'tech professionals',
    industry: 'technology',
    trending_score: 0.75,
    engagement_potential: 0.8,
    seasonal_relevance: 0.75,
    abu_dhabi_relevance: 0.8,
    is_active: true,
    created_at: new Date().toISOString()
  },
  {
    id: 8,
    name: 'Environmental Marine Protection',
    description: 'Sustainable marine practices, environmental protection in maritime operations, eco-friendly marine solutions, and conservation efforts.',
    category: 'environment',
    keywords: ['marine environment', 'sustainability', 'environmental protection', 'eco-friendly', 'marine conservation', 'green marine'],
    target_audience: 'environmental professionals',
    industry: 'environment',
    trending_score: 0.8,
    engagement_potential: 0.85,
    seasonal_relevance: 0.9,
    abu_dhabi_relevance: 0.85,
    is_active: true,
    created_at: new Date().toISOString()
  },
  {
    id: 9,
    name: 'Professional Development Marine Industry',
    description: 'Career growth opportunities in marine industry, professional certifications, skill development, and training programs for marine professionals.',
    category: 'career',
    keywords: ['professional development', 'marine careers', 'training', 'certification programs', 'skill development', 'marine education'],
    target_audience: 'professionals',
    industry: 'education',
    trending_score: 0.65,
    engagement_potential: 0.7,
    seasonal_relevance: 0.7,
    abu_dhabi_relevance: 0.75,
    is_active: true,
    created_at: new Date().toISOString()
  },
  {
    id: 10,
    name: 'Client Success Stories & Case Studies',
    description: 'Real-world examples of successful marine inspection projects, client testimonials, case studies, and project highlights from Pilot Consultation.',
    category: 'success',
    keywords: ['success stories', 'case studies', 'client testimonials', 'project highlights', 'marine projects', 'inspection success'],
    target_audience: 'potential clients',
    industry: 'marine',
    trending_score: 0.7,
    engagement_potential: 0.9,
    seasonal_relevance: 0.75,
    abu_dhabi_relevance: 0.85,
    is_active: true,
    created_at: new Date().toISOString()
  }
];

function createTopicsFile() {
  try {
    console.log('🚀 Creating marine industry topics file...');
    
    // Create data directory if it doesn't exist
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
      console.log('📁 Created data directory');
    }
    
    // Write topics to JSON file
    const topicsFile = path.join(dataDir, 'marine-topics.json');
    fs.writeFileSync(topicsFile, JSON.stringify(marineTopics, null, 2));
    
    console.log(`✅ Successfully created topics file: ${topicsFile}`);
    console.log(`📊 Added ${marineTopics.length} marine industry topics`);
    
    // Display summary
    console.log('\n📋 Topics Summary:');
    marineTopics.forEach((topic, index) => {
      console.log(`${index + 1}. ${topic.name} (${topic.category})`);
    });
    
    console.log('\n🎯 Topics by Category:');
    const categories = {};
    marineTopics.forEach(topic => {
      categories[topic.category] = (categories[topic.category] || 0) + 1;
    });
    
    Object.entries(categories).forEach(([category, count]) => {
      console.log(`   ${category}: ${count} topics`);
    });
    
    console.log('\n✨ Topics file created successfully!');
    console.log('💡 You can now import these topics into your database when it\'s available.');
    
    return topicsFile;
    
  } catch (error) {
    console.error('❌ Error creating topics file:', error.message);
    throw error;
  }
}

// Run the script
if (require.main === module) {
  createTopicsFile()
    .then((filePath) => {
      console.log(`\n🎉 Topics file created at: ${filePath}`);
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Failed to create topics file:', error);
      process.exit(1);
    });
}

module.exports = { marineTopics, createTopicsFile };