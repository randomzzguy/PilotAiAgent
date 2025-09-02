import React, { useState, useEffect, useCallback } from 'react';
import './ContentGenerator.css';

interface Topic {
  id: string;
  name: string;
  description: string;
  category: string;
}

interface GeneratedContent {
  id: string;
  content: string;
  hashtags: string[];
  topic: string;
  timestamp: string;
}

const ContentGenerator: React.FC = () => {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<string>('');
  const [generatedContent, setGeneratedContent] = useState<GeneratedContent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  // Fallback marine topics data
  const fallbackTopics: Topic[] = [
    {
      id: '1',
      name: 'Marine Safety & Compliance',
      description: 'IMCA standards, safety protocols, and regulatory compliance',
      category: 'Safety'
    },
    {
      id: '2',
      name: 'Commercial Diving System Inspections',
      description: 'IMCA ADSI certification and equipment standards',
      category: 'Inspection'
    },
    {
      id: '3',
      name: 'Marine Vessel Inspections',
      description: 'Pre-hire, condition surveys, and eCMID inspections',
      category: 'Inspection'
    },
    {
      id: '4',
      name: 'Abu Dhabi Marine Industry',
      description: 'Local market, ADNOC projects, and regional opportunities',
      category: 'Industry'
    },
    {
      id: '5',
      name: 'ISO Certifications',
      description: 'ISO 9001, 14001, 45001 and quality management systems',
      category: 'Certification'
    },
    {
      id: '6',
      name: 'Offshore Operations',
      description: 'Oil & gas industry, marine construction, and subsea activities',
      category: 'Operations'
    },
    {
      id: '7',
      name: 'Marine Technology & Innovation',
      description: 'New inspection methods and industry advancements',
      category: 'Technology'
    },
    {
      id: '8',
      name: 'Environmental Marine Protection',
      description: 'Sustainable marine practices and environmental compliance',
      category: 'Environment'
    },
    {
      id: '9',
      name: 'Professional Development',
      description: 'Marine industry certifications and career growth',
      category: 'Career'
    },
    {
      id: '10',
      name: 'Client Success Stories',
      description: 'Case studies from marine inspection projects',
      category: 'Success'
    }
  ];

  const loadTopics = useCallback(async () => {
    try {
      // Try to fetch from API first
      const response = await fetch('/api/content/topics');
      if (response.ok) {
        const data = await response.json();
        setTopics(data.topics || []);
      } else {
        throw new Error('API not available');
      }
    } catch (error) {
      console.log('Using fallback marine topics data');
      setTopics(fallbackTopics);
    }
  }, []);

  useEffect(() => {
    loadTopics();
  }, [loadTopics]);

  const generateFallbackContent = (topicName: string): GeneratedContent[] => {
    const contentTemplates = {
      'Marine Safety & Compliance': [
        {
          content: "🛡️ Marine safety isn't just compliance—it's about protecting lives and assets. Our comprehensive IMCA-standard inspections ensure your operations meet the highest safety protocols. Every detail matters when lives are at stake.",
          hashtags: ['#MarineSafety', '#IMCAStandards', '#SafetyFirst', '#MarineCompliance', '#OffshoreSafety']
        },
        {
          content: "📋 Regulatory compliance in marine operations requires expertise and attention to detail. Our certified inspectors ensure your vessels and equipment meet all international standards, keeping your operations running smoothly.",
          hashtags: ['#MarineCompliance', '#RegulatoryStandards', '#MarineInspection', '#SafetyProtocols', '#MarineRegulations']
        }
      ],
      'Commercial Diving System Inspections': [
        {
          content: "🤿 Commercial diving systems require rigorous inspection protocols. Our IMCA ADSI certified inspectors ensure your diving equipment meets the highest safety standards, protecting your dive teams and operations.",
          hashtags: ['#CommercialDiving', '#IMCAInspection', '#DivingSafety', '#ADSICertified', '#UnderwaterOperations']
        }
      ],
      'Marine Vessel Inspections': [
        {
          content: "⚓ Pre-hire vessel inspections are crucial for operational success. Our comprehensive surveys identify potential issues before they become costly problems, ensuring your marine assets are ready for service.",
          hashtags: ['#VesselInspection', '#MarineSurvey', '#PreHireInspection', '#eCMID', '#MarineAssets']
        }
      ],
      'Abu Dhabi Marine Industry': [
        {
          content: "🏗️ Abu Dhabi's marine industry continues to grow with major ADNOC projects driving innovation. Our local expertise ensures compliance with regional standards while supporting the emirate's maritime ambitions.",
          hashtags: ['#AbuDhabiMarine', '#ADNOC', '#UAEMaritime', '#MiddleEastMarine', '#RegionalExpertise']
        }
      ],
      'ISO Certifications': [
        {
          content: "📜 ISO certifications demonstrate commitment to quality and safety. Our expertise in ISO 9001, 14001, and 45001 helps marine companies achieve and maintain world-class standards.",
          hashtags: ['#ISOCertification', '#QualityManagement', '#ISO9001', '#ISO14001', '#ISO45001']
        }
      ],
      'Offshore Operations': [
        {
          content: "🌊 Offshore operations demand precision and expertise. From oil & gas platforms to subsea construction, our inspection services ensure your offshore assets operate safely and efficiently.",
          hashtags: ['#OffshoreOperations', '#OilAndGas', '#SubseaOperations', '#MarineConstruction', '#OffshoreInspection']
        }
      ],
      'Marine Technology & Innovation': [
        {
          content: "🔬 Innovation drives the marine industry forward. New inspection technologies and methodologies are revolutionizing how we ensure safety and compliance in marine operations.",
          hashtags: ['#MarineTechnology', '#Innovation', '#InspectionTech', '#MarineInnovation', '#TechAdvancement']
        }
      ],
      'Environmental Marine Protection': [
        {
          content: "🌱 Environmental protection is integral to sustainable marine operations. Our inspections help ensure compliance with environmental regulations while promoting responsible maritime practices.",
          hashtags: ['#MarineEnvironment', '#SustainableMarine', '#EnvironmentalCompliance', '#GreenMarine', '#OceanProtection']
        }
      ],
      'Professional Development': [
        {
          content: "📚 Continuous learning drives excellence in marine inspection. Professional development and certification ensure our team stays current with industry best practices and emerging technologies.",
          hashtags: ['#ProfessionalDevelopment', '#MarineCareers', '#ContinuousLearning', '#MarineTraining', '#SkillDevelopment']
        }
      ],
      'Client Success Stories': [
        {
          content: "🎯 Success stories showcase the value of professional marine inspection. Our recent project helped a client identify critical issues early, saving significant costs and ensuring operational continuity.",
          hashtags: ['#ClientSuccess', '#CaseStudy', '#MarineInspection', '#ProblemSolved', '#OperationalExcellence']
        }
      ]
    };

    const templates = contentTemplates[topicName as keyof typeof contentTemplates] || [
      {
        content: `Professional insights on ${topicName}. Our expertise ensures quality and compliance in all marine operations.`,
        hashtags: ['#MarineInspection', '#ProfessionalServices', '#QualityAssurance']
      }
    ];

    return templates.map((template, index) => ({
      id: `${Date.now()}-${index}`,
      content: template.content,
      hashtags: template.hashtags,
      topic: topicName,
      timestamp: new Date().toISOString()
    }));
  };

  const handleGenerateContent = async () => {
    if (!selectedTopic) {
      setError('Please select a topic first');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Try to generate content via API
      const response = await fetch('/api/content/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          topicId: selectedTopic,
          count: 2
        })
      });

      if (response.ok) {
        const data = await response.json();
        setGeneratedContent(prev => [...data.content, ...prev]);
      } else {
        throw new Error('API generation failed');
      }
    } catch (error) {
      console.log('Using fallback content generation');
      // Use fallback content generation
      const selectedTopicData = topics.find(t => t.id === selectedTopic);
      if (selectedTopicData) {
        const fallbackContent = generateFallbackContent(selectedTopicData.name);
        setGeneratedContent(prev => [...fallbackContent, ...prev]);
        console.log('Fallback content generated successfully');
      }
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (content: string) => {
    navigator.clipboard.writeText(content);
    // You could add a toast notification here
  };

  return (
    <div className="content-generator">
      <div className="header">
        <h1>🚢 LinkedIn Content Generator</h1>
        <p>Generate professional marine industry content for your LinkedIn posts</p>
      </div>

      <div className="generator-section">
        <div className="topic-selection">
          <label htmlFor="topic-select">Select Topic:</label>
          <select
            id="topic-select"
            value={selectedTopic}
            onChange={(e) => setSelectedTopic(e.target.value)}
            className="topic-select"
          >
            <option value="">Choose a topic...</option>
            {topics.map(topic => (
              <option key={topic.id} value={topic.id}>
                {topic.name} - {topic.category}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={handleGenerateContent}
          disabled={loading || !selectedTopic}
          className="generate-btn"
        >
          {loading ? '🔄 Generating...' : '✨ Generate Content'}
        </button>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}
      </div>

      <div className="content-results">
        {generatedContent.length > 0 && (
          <h2>Generated Content ({generatedContent.length})</h2>
        )}
        
        {generatedContent.map(content => (
          <div key={content.id} className="content-card">
            <div className="content-header">
              <span className="topic-badge">{content.topic}</span>
              <span className="timestamp">
                {new Date(content.timestamp).toLocaleString()}
              </span>
            </div>
            
            <div className="content-text">
              {content.content}
            </div>
            
            <div className="hashtags">
              {content.hashtags.map(tag => (
                <span key={tag} className="hashtag">{tag}</span>
              ))}
            </div>
            
            <div className="content-actions">
              <button
                onClick={() => copyToClipboard(`${content.content}\n\n${content.hashtags.join(' ')}`)}
                className="copy-btn"
              >
                📋 Copy
              </button>
            </div>
          </div>
        ))}
        
        {generatedContent.length === 0 && (
          <div className="empty-state">
            <p>🎯 Select a topic and generate content to get started!</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ContentGenerator;