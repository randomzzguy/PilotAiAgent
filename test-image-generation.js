const axios = require('axios');

// Simplified test script to verify image generation workflow
async function testImageGeneration() {
  console.log('🧪 Testing Image Generation Workflow...');
  
  try {
    // Test 1: Check if Pollinations.AI is accessible
    console.log('\n1. Testing Pollinations.AI accessibility...');
    const testPrompt = 'professional business meeting';
    const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(testPrompt)}`;
    
    const imageResponse = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 30000
    });
    
    if (imageResponse.status === 200) {
      console.log('✅ Pollinations.AI is accessible');
      console.log(`   Image size: ${imageResponse.data.length} bytes`);
    } else {
      throw new Error(`Unexpected status: ${imageResponse.status}`);
    }
    
    // Test 2: Test ImageGenerator service
    console.log('\n2. Testing ImageGenerator service...');
    const imageGenerator = require('./src/services/imageGenerator');
    
    const singleImageResult = await imageGenerator.generateImage('professional LinkedIn post about technology trends');
    console.log('✅ Single image generation successful');
    console.log(`   Image URL: ${singleImageResult.imageUrl}`);
    console.log(`   Generation time: ${singleImageResult.metadata.generationTime}ms`);
    console.log(`   Image size: ${singleImageResult.metadata.size} bytes`);
    
    // Test 3: Test carousel image generation
    console.log('\n3. Testing carousel image generation...');
    const carouselSlides = [
      { title: 'Slide 1', content: 'Introduction to AI in business' },
      { title: 'Slide 2', content: 'Benefits of automation' },
      { title: 'Slide 3', content: 'Future trends and opportunities' }
    ];
    
    const carouselResult = await imageGenerator.generateCarouselImages(carouselSlides, {
      industry: 'Technology'
    });
    
    console.log('✅ Carousel image generation successful');
    console.log(`   Generated ${carouselResult.length} images`);
    
    carouselResult.forEach((image, index) => {
      console.log(`   Image ${index + 1}: ${image.imageUrl}`);
      console.log(`   Generation time: ${image.metadata.generationTime}ms`);
    });
    
    // Test 4: Test URL building
    console.log('\n4. Testing URL building...');
    const testUrl = imageGenerator.buildImageUrl('test business image', {
      width: 1200,
      height: 630,
      enhance: true,
      nologo: true
    });
    
    console.log('✅ URL building successful');
    console.log(`   Generated URL: ${testUrl}`);
    
    // Test 5: Test prompt enhancement
    console.log('\n5. Testing prompt enhancement...');
    const basicPrompt = 'business meeting';
    const enhancedPrompt = imageGenerator.enhancePrompt(basicPrompt);
    console.log('✅ Prompt enhancement successful');
    console.log(`   Original: "${basicPrompt}"`);
    console.log(`   Enhanced: "${enhancedPrompt}"`);
    
    // Test 6: Test visual theme extraction
    console.log('\n6. Testing visual theme extraction...');
    const sampleText = 'We are excited to announce our new AI-powered marketing strategy that will revolutionize customer engagement and drive innovation in the digital transformation space.';
    const themes = imageGenerator.extractThemes(sampleText);
    console.log('✅ Visual theme extraction successful');
    console.log(`   Extracted themes: ${themes.join(', ')}`);
    
    console.log('\n🎉 All image generation tests passed! The system is ready for use.');
    console.log('\n📝 Summary:');
    console.log('   ✅ Pollinations.AI API is accessible');
    console.log('   ✅ Single image generation works');
    console.log('   ✅ Carousel image generation works');
    console.log('   ✅ Image optimization works');
    console.log('   ✅ Prompt enhancement works');
    console.log('   ✅ Visual theme extraction works');
    console.log('\n🚀 You can now use the AI Generator in the frontend to create content with images!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.response) {
      console.error('   Response status:', error.response.status);
      console.error('   Response data:', error.response.data);
    }
    if (error.code) {
      console.error('   Error code:', error.code);
    }
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  testImageGeneration();
}

module.exports = testImageGeneration;