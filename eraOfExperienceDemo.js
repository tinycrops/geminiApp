// Demo script for Era of Experience with CommonJS
const { GoogleGenerativeAI } = require('@google/genai');
const dotenv = require('dotenv');
const path = require('path');
const fetch = require('node-fetch');

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

if (!GEMINI_API_KEY) {
  console.error('GEMINI_API_KEY environment variable is not set. Please check your .env.local file.');
  process.exit(1);
}

console.log('========================================');
console.log('ERA OF EXPERIENCE DEMO');
console.log(`Using model: ${MODEL}`);
console.log('========================================');

// Initialize the Gemini client
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Define system instruction for memory capabilities
const systemInstruction = `
You are Gemini, an AI assistant with memory capabilities that follow the Era of Experience paradigm.
You continually learn from interactions, store important experiences, and recall them when relevant.
You should proactively use your memory tools when:
1. You learn something important about me or my preferences
2. I ask you to remember something specific
3. You need to check if we've discussed a topic before
4. You want to relate current information to previous experiences

The Era of Experience approach allows you to become more personalized and contextually aware over time.
`;

// Create a simple chat without memory for demo purposes
async function simpleEraOfExperienceDemo() {
  try {
    // Create a generative model instance
    const model = genAI.getGenerativeModel({
      model: MODEL,
    });
    
    // Create a chat session
    const chat = model.startChat({
      history: [],
      systemInstruction: systemInstruction,
    });
    
    // First interaction
    console.log('\n--- FIRST INTERACTION ---');
    console.log('User: Hello! My name is Alex and I\'m working on a sustainable agriculture project.');
    
    const response1 = await chat.sendMessage('Hello! My name is Alex and I\'m working on a sustainable agriculture project.');
    console.log('Gemini:', response1.response.text());
    
    // Second interaction
    console.log('\n--- SECOND INTERACTION ---');
    console.log('User: I\'m specifically interested in vertical farming using aquaponics. I want to set up a system in my urban apartment.');
    
    const response2 = await chat.sendMessage('I\'m specifically interested in vertical farming using aquaponics. I want to set up a system in my urban apartment.');
    console.log('Gemini:', response2.response.text());
    
    // Test memory
    console.log('\n--- THIRD INTERACTION: TESTING MEMORY ---');
    console.log('User: What was my name again, and what project am I working on?');
    
    const response3 = await chat.sendMessage('What was my name again, and what project am I working on?');
    console.log('Gemini:', response3.response.text());
    
    console.log('\nNote: This is a simplified demo. In a full implementation, the experiences would be stored in the database.');
    console.log('The Era of Experience framework would enable continual learning from past interactions.');
  } catch (error) {
    console.error('Error in demo:', error);
    console.error(error.stack);
  }
}

// Run the demo
simpleEraOfExperienceDemo(); 