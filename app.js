require('dotenv').config({ path: '.env.local' });
const { GoogleGenerativeAI } = require('@google/genai');

// Check if the API key is set
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('Error: GEMINI_API_KEY environment variable is not set. Please add it to your .env.local file.');
  process.exit(1);
}

async function main() {
  try {
    // Initialize the Gemini API with your API key
    const genAI = new GoogleGenerativeAI(apiKey);

    // For text-only input, use the gemini-2.0-flash model
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const prompt = 'Write a short poem about artificial intelligence.';
    
    console.log('Sending request to Gemini API...');
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    console.log('\nResponse from Gemini:');
    console.log(text);
  } catch (error) {
    console.error('Error using the Gemini API:', error);
    console.error(error.stack);
  }
}

main(); 