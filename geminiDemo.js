// Demo script to show Gemini AI with Era of Experience features
import pkg from '@google/genai';
const { GoogleGenerativeAI } = pkg;
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

// Setup environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const API_BASE_URL = 'http://localhost:3000/api';

if (!GEMINI_API_KEY) {
  console.error('GEMINI_API_KEY is required. Make sure it\'s set in .env.local');
  process.exit(1);
}

// Initialize the Google Gemini AI client
const ai = new GoogleGenerativeAI({ apiKey: GEMINI_API_KEY });

// Demo showcasing the Era of Experience features
async function eraOfExperienceDemo() {
  console.log('='.repeat(70));
  console.log('ERA OF EXPERIENCE DEMO');
  console.log(`Using model: ${MODEL}`);
  console.log('='.repeat(70));
  
  try {
    // Create a new chat session with the memory capabilities
    console.log('Creating a new chat session...');
    
    const sessionResponse = await fetch(`${API_BASE_URL}/chat/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        systemInstructions: `
You are Gemini, an AI assistant with memory capabilities that follow the Era of Experience paradigm.
You continually learn from interactions, store important experiences, and recall them when relevant.
You should proactively use your memory tools when:
1. You learn something important about me or my preferences
2. I ask you to remember something specific
3. You need to check if we've discussed a topic before
4. You want to relate current information to previous experiences

The Era of Experience approach allows you to become more personalized and contextually aware over time.
`
      })
    });
    
    const sessionData = await sessionResponse.json();
    if (!sessionData.success) {
      throw new Error('Failed to create chat session: ' + sessionData.error);
    }
    
    const streamId = sessionData.streamId;
    console.log(`Chat session created with stream ID: ${streamId}`);
    
    // First message: Introduction
    console.log('\n--- FIRST INTERACTION ---');
    console.log('User: Hello! My name is Alex and I\'m working on a sustainable agriculture project.');
    
    const response1 = await fetch(`${API_BASE_URL}/chat/session/${streamId}/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: 'Hello! My name is Alex and I\'m working on a sustainable agriculture project.'
      })
    });
    
    const data1 = await response1.json();
    if (!data1.success) {
      throw new Error('Failed to send message: ' + data1.error);
    }
    
    console.log('Gemini:', data1.response.text);
    
    // Give positive feedback
    console.log('\nSending positive feedback...');
    await fetch(`${API_BASE_URL}/rewards`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        streamId,
        value: 0.8,
        feedback: 'helpful_response'
      })
    });
    
    // Second message: More details
    console.log('\n--- SECOND INTERACTION ---');
    console.log('User: I\'m specifically interested in vertical farming using aquaponics. I want to set up a system in my urban apartment.');
    
    const response2 = await fetch(`${API_BASE_URL}/chat/session/${streamId}/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: 'I\'m specifically interested in vertical farming using aquaponics. I want to set up a system in my urban apartment.'
      })
    });
    
    const data2 = await response2.json();
    console.log('Gemini:', data2.response.text);
    
    // Third message: Test memory
    console.log('\n--- THIRD INTERACTION: TESTING MEMORY ---');
    console.log('User: What was my name again, and what project am I working on?');
    
    const response3 = await fetch(`${API_BASE_URL}/chat/session/${streamId}/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: 'What was my name again, and what project am I working on?'
      })
    });
    
    const data3 = await response3.json();
    console.log('Gemini:', data3.response.text);
    
    // Trigger manual replay to generate summaries
    console.log('\n--- TRIGGERING MANUAL REPLAY ---');
    console.log('Running manual replay to generate summaries...');
    
    const replayResponse = await fetch(`${API_BASE_URL}/replay/manual`, {
      method: 'POST'
    });
    
    const replayData = await replayResponse.json();
    console.log('Replay result:', replayData.success ? 'Success' : 'Failed', replayData.message || '');
    
    // Get all experiences to see what was created
    console.log('\n--- CHECKING STORED EXPERIENCES ---');
    console.log('Retrieving all experiences from memory...');
    
    const experiencesResponse = await fetch(`${API_BASE_URL}/experiences`);
    const experiencesData = await experiencesResponse.json();
    
    if (experiencesData.success && experiencesData.experiences) {
      console.log(`Found ${experiencesData.experiences.length} experiences:`);
      
      experiencesData.experiences.forEach((exp, index) => {
        console.log(`\n${index + 1}. ${exp.title}`);
        console.log(`   ID: ${exp.experience_id}`);
        console.log(`   Type: ${exp.type || 'raw'}`);
        console.log(`   Description: ${exp.description}`);
        console.log(`   Tags: ${exp.tags ? exp.tags.join(', ') : 'none'}`);
      });
    } else {
      console.log('No experiences found or error retrieving experiences');
    }
    
    console.log('\nEra of Experience demo completed!');
    
  } catch (error) {
    console.error('Error in Era of Experience demo:', error);
  }
}

// Run the demo
eraOfExperienceDemo().catch(console.error); 