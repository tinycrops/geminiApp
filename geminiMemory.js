// Import required libraries
import pkg from '@google/genai';
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = pkg;
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import memoryOps from './memoryOperations.js';
import dbOps from './dbOperations.js';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: './.env.local' });

// Destructure imports
const memoryOperations = memoryOps;
const dbOperations = dbOps;

// Initialize the Google Generative AI with API key from .env.local
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Default episode buffer size (number of messages)
const DEFAULT_EPISODE_BUFFER_SIZE = 5;

// Feature flags for new tools
const FEATURE_FLAGS = {
  EXECUTE_CODE: false,  // Set to true when sandbox is ready
  WEB_SEARCH: false,    // Set to true when web search is ready
  SQL_RUNNER: false     // Set to true when SQL runner is ready
};

// Load function declarations from the JSON file
let functionDeclarations = [];
try {
  const toolsJsonPath = path.join(__dirname, 'tools', 'v1.json');
  const toolsJson = fs.readFileSync(toolsJsonPath, 'utf8');
  functionDeclarations = JSON.parse(toolsJson);
  
  // Filter out tools based on feature flags
  functionDeclarations = functionDeclarations.filter(func => {
    if (func.name === 'EXECUTE_CODE' && !FEATURE_FLAGS.EXECUTE_CODE) return false;
    if (func.name === 'WEB_SEARCH' && !FEATURE_FLAGS.WEB_SEARCH) return false;
    if (func.name === 'SQL_RUNNER' && !FEATURE_FLAGS.SQL_RUNNER) return false;
    return true;
  });
  
  console.log(`Loaded ${functionDeclarations.length} function declarations from tools/v1.json`);
} catch (error) {
  console.error('Error loading function declarations:', error);
  // Fallback to hardcoded function declarations
  functionDeclarations = [
    {
      name: 'searchExperiences',
      description: 'Search for experiences in Gemini\'s memory based on text or tags',
      parameters: {
        type: 'OBJECT',
        properties: {
          query: {
            type: 'STRING',
            description: 'Text to search for in experience title, description, or context'
          },
          tags: {
            type: 'ARRAY',
            items: {
              type: 'STRING'
            },
            description: 'Tags to filter experiences by'
          },
          limit: {
            type: 'NUMBER',
            description: 'Maximum number of experiences to return (default: 10)'
          }
        }
      }
    },
    {
      name: 'getExperienceById',
      description: 'Get an experience from memory by its ID',
      parameters: {
        type: 'OBJECT',
        properties: {
          id: {
            type: 'STRING',
            description: 'The experience_id of the experience to retrieve'
          }
        },
        required: ['id']
      }
    },
    {
      name: 'createExperience',
      description: 'Create a new experience in memory',
      parameters: {
        type: 'OBJECT',
        properties: {
          title: {
            type: 'STRING',
            description: 'Title of the experience'
          },
          description: {
            type: 'STRING',
            description: 'Detailed description of the experience'
          },
          context: {
            type: 'STRING',
            description: 'Additional context about the experience'
          },
          tags: {
            type: 'ARRAY',
            items: {
              type: 'STRING'
            },
            description: 'Tags to categorize the experience'
          },
          importance: {
            type: 'NUMBER',
            description: 'Importance rating of the experience (1-10)'
          },
          metadata: {
            type: 'OBJECT',
            description: 'Additional metadata about the experience'
          }
        },
        required: ['title', 'description']
      }
    }
  ];
}

// Episode Manager for tracking episodes
class EpisodeManager {
  constructor(db) {
    this.db = db || dbOperations.db;
    this.activeEpisodes = new Map();
  }
  
  // Start a new episode for a stream
  async startEpisode(streamId) {
    const episodeId = `ep_${uuidv4().substring(0, 8)}`;
    const timestamp = new Date();
    
    // Save to database
    await this.db('Episodes').insert({
      episode_id: episodeId,
      stream_id: streamId,
      start_ts: timestamp,
      end_ts: null,
      salience_score: 0,
      metadata: JSON.stringify({})
    });
    
    // Save to memory
    this.activeEpisodes.set(streamId, {
      episodeId,
      startTimestamp: timestamp,
      messages: []
    });
    
    return episodeId;
  }
  
  // Get the current episode for a stream
  async getCurrentEpisode(streamId) {
    // Check if already in memory
    if (this.activeEpisodes.has(streamId)) {
      return this.activeEpisodes.get(streamId);
    }
    
    // Get from database
    const episode = await this.db('Episodes')
      .where('stream_id', streamId)
      .whereNull('end_ts')
      .orderBy('start_ts', 'desc')
      .first();
      
    if (episode) {
      // Get any existing messages
      const messages = await this.db('EpisodesBuffer')
        .where('episode_id', episode.episode_id)
        .orderBy('ts', 'asc')
        .select();
        
      // Store in memory
      this.activeEpisodes.set(streamId, {
        episodeId: episode.episode_id,
        startTimestamp: episode.start_ts,
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
          timestamp: m.ts
        }))
      });
      
      return this.activeEpisodes.get(streamId);
    }
    
    // No active episode, create one
    return this.startEpisode(streamId);
  }
  
  // Add a message to the episode buffer
  async addMessage(streamId, role, content) {
    const episode = await this.getCurrentEpisode(streamId);
    const timestamp = new Date();
    
    // Add to memory
    episode.messages.push({
      role,
      content,
      timestamp
    });
    
    // Add to database
    await this.db('EpisodesBuffer').insert({
      stream_id: streamId,
      episode_id: episode.episodeId,
      role,
      content,
      ts: timestamp,
      processed: false
    });
    
    // Check if we should close this episode based on buffer size
    if (episode.messages.length >= DEFAULT_EPISODE_BUFFER_SIZE) {
      await this.endEpisode(streamId);
      // Start a new episode
      await this.startEpisode(streamId);
    }
    
    return episode;
  }
  
  // End the current episode
  async endEpisode(streamId) {
    if (!this.activeEpisodes.has(streamId)) {
      return false;
    }
    
    const episode = this.activeEpisodes.get(streamId);
    const timestamp = new Date();
    
    // Update database
    await this.db('Episodes')
      .where('episode_id', episode.episodeId)
      .update({
        end_ts: timestamp
      });
    
    // TODO: Calculate salience score and update
    // For now, set a random score
    const salienceScore = Math.random();
    await this.db('Episodes')
      .where('episode_id', episode.episodeId)
      .update({
        salience_score: salienceScore
      });
    
    // Remove from memory
    this.activeEpisodes.delete(streamId);
    
    return true;
  }
  
  // Record a tool observation
  async recordToolObservation(streamId, episodeId, tool, args, result, error = null) {
    const timestamp = new Date();
    
    // Save to database
    await this.db('ToolObservations').insert({
      stream_id: streamId,
      episode_id: episodeId,
      tool,
      args: JSON.stringify(args),
      result: result ? JSON.stringify(result) : null,
      error,
      ts: timestamp
    });
    
    // If tool call was successful, record intrinsic reward
    if (!error) {
      await this.recordReward(streamId, 'intrinsic', 'success', 1.0);
    } else {
      await this.recordReward(streamId, 'intrinsic', 'failure', -0.5);
    }
  }
  
  // Record a reward
  async recordReward(streamId, source, signal, value) {
    const timestamp = new Date();
    
    // Save to database
    await this.db('Rewards').insert({
      stream_id: streamId,
      source,
      signal,
      value,
      ts: timestamp
    });
  }
}

// Initialize episode manager
const episodeManager = new EpisodeManager();

// Function handlers for tool calls
const functionHandlers = {
  // Memory experience handlers
  searchExperiences: async ({ query, tags, limit }) => {
    const options = {
      tags: tags || [],
      limit: limit || 10
    };
    return await memoryOperations.searchExperiences(query, options);
  },
  
  getExperienceById: async ({ id }) => {
    return await memoryOperations.getExperienceByExperienceId(id);
  },
  
  createExperience: async (experienceData) => {
    return await memoryOperations.createExperience(experienceData);
  },
  
  updateExperience: async ({ id, ...updateData }) => {
    const experience = await memoryOperations.getExperienceByExperienceId(id);
    if (!experience) {
      throw new Error(`Experience with ID ${id} not found`);
    }
    return await memoryOperations.updateExperience(experience.id, updateData);
  },
  
  findRelatedExperiences: async ({ id, relationType }) => {
    const experience = await memoryOperations.getExperienceByExperienceId(id);
    if (!experience) {
      throw new Error(`Experience with ID ${id} not found`);
    }
    return await memoryOperations.getRelatedExperiences(experience.id, relationType);
  },
  
  createRelation: async ({ sourceId, targetId, relationType, strength }) => {
    const sourceExperience = await memoryOperations.getExperienceByExperienceId(sourceId);
    if (!sourceExperience) {
      throw new Error(`Source experience with ID ${sourceId} not found`);
    }
    
    const targetExperience = await memoryOperations.getExperienceByExperienceId(targetId);
    if (!targetExperience) {
      throw new Error(`Target experience with ID ${targetId} not found`);
    }
    
    return await memoryOperations.createRelation(
      sourceExperience.id,
      targetExperience.id,
      relationType,
      strength || 1.0
    );
  },
  
  // New tool handlers
  EXECUTE_CODE: async ({ language, code }) => {
    if (!FEATURE_FLAGS.EXECUTE_CODE) {
      throw new Error('Code execution is not enabled');
    }
    
    const sandbox = await import('./sandbox.js');
    return await sandbox.executeCode(language, code);
  },
  
  WEB_SEARCH: async ({ query, numResults }) => {
    if (!FEATURE_FLAGS.WEB_SEARCH) {
      throw new Error('Web search is not enabled');
    }
    
    // This is a placeholder for an actual web search implementation
    // In a real implementation, you would use a search API service
    return {
      query,
      results: [
        { title: 'Example result 1', snippet: 'This is a placeholder result', url: 'https://example.com/1' },
        { title: 'Example result 2', snippet: 'This is another placeholder result', url: 'https://example.com/2' }
      ]
    };
  },
  
  SQL_RUNNER: async ({ query, database }) => {
    if (!FEATURE_FLAGS.SQL_RUNNER) {
      throw new Error('SQL runner is not enabled');
    }
    
    // Use the database directly but with security precautions
    const db = dbOperations.db;
    const dbName = database || 'memory';
    
    // Check for dangerous SQL commands
    const dangerousSqlCommands = ['DROP', 'DELETE', 'UPDATE', 'INSERT', 'CREATE', 'ALTER', 'TRUNCATE'];
    for (const cmd of dangerousSqlCommands) {
      if (query.toUpperCase().includes(cmd)) {
        throw new Error(`Dangerous SQL command detected: ${cmd}`);
      }
    }
    
    // Only allow SELECT statements
    if (!query.trim().toUpperCase().startsWith('SELECT')) {
      throw new Error('Only SELECT statements are allowed');
    }
    
    try {
      const results = await db.raw(query);
      return { results };
    } catch (error) {
      throw new Error(`SQL error: ${error.message}`);
    }
  },
};

// Get a conversation with Gemini that has memory capabilities
async function getMemoryChat(systemInstructions = '') {
  // Configure the model
  const modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  
  // Set safety settings - adjust as needed
  const safetySettings = [
    {
      category: HarmCategory.HARM_CATEGORY_HARASSMENT,
      threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
    },
    {
      category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
      threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
    },
    {
      category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
      threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
    },
    {
      category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
      threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
    },
  ];
  
  // Default system instructions to help Gemini use the memory system effectively
  const defaultInstructions = `
You are Gemini, an AI assistant with memory capabilities. You can store and recall experiences using the provided memory tools.

When relevant to the conversation, you should:
1. Search for relevant experiences to help inform your responses
2. Create new experiences based on important interactions
3. Update existing experiences with new information
4. Create relations between related experiences
5. Link experiences to conversations

Your memory helps you provide more personalized and consistent responses over time. Try to use your memory tools when:
- A user mentions something you should remember for later
- You need to check if you've discussed a topic before
- You want to build on previous conversations
- You learn something new about the user or a topic

When creating experiences, include:
- Clear, concise titles
- Detailed descriptions
- Relevant context
- Appropriate tags for searchability
- Importance rating (1-10)
- Any additional metadata that might be useful
`;

  // Combine default and custom instructions
  const finalInstructions = systemInstructions 
    ? `${defaultInstructions}\n\n${systemInstructions}` 
    : defaultInstructions;
  
  // Define generation config
  const generationConfig = {
    temperature: 0.7,
    topP: 0.8,
    topK: 40,
    maxOutputTokens: 2048,
  };
  
  // Initialize the model
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig,
    safetySettings,
    tools: [{ functionDeclarations }],
  });
  
  // Create a chat session
  const chat = model.startChat({
    systemInstruction: finalInstructions,
    history: [
      {
        role: 'user',
        parts: 'Hello, I\'d like to test your memory capabilities.'
      },
      {
        role: 'model',
        parts: 'Hello! I\'m Gemini, and I have the ability to create and maintain memories through my experience management system. I can store important information, recall it later, and even relate different pieces of information together. What would you like to know or remember today?'
      }
    ],
  });
  
  return chat;
}

// Function to send a message and handle tool calls
async function sendMessageWithMemory(chat, message, streamId) {
  try {
    // Record user message in episode buffer
    if (streamId) {
      await episodeManager.addMessage(streamId, 'user', message);
    }
    
    // Send message to Gemini
    const result = await chat.sendMessage(message);
    const response = result.response;
    const text = response.text();
    
    // Record model response in episode buffer
    if (streamId) {
      await episodeManager.addMessage(streamId, 'model', text);
    }
    
    // Check if there are tool calls
    if (response.functionCalls && response.functionCalls.length > 0) {
      // Process each tool call
      for (const functionCall of response.functionCalls) {
        const functionName = functionCall.name;
        const functionArgs = JSON.parse(functionCall.args);
        
        console.log(`Tool call: ${functionName}`, functionArgs);
        
        // Check if we have a handler for this function
        if (functionHandlers[functionName]) {
          try {
            // Execute the function
            const functionResult = await functionHandlers[functionName](functionArgs);
            
            // Record tool observation
            if (streamId) {
              const episode = await episodeManager.getCurrentEpisode(streamId);
              await episodeManager.recordToolObservation(
                streamId,
                episode.episodeId,
                functionName,
                functionArgs,
                functionResult
              );
            }
            
            // Send the function response back to Gemini
            const functionResponse = await chat.sendMessage({
              functionResponse: {
                name: functionName,
                response: functionResult,
              },
            });
            
            // Record function response in episode buffer
            if (streamId) {
              await episodeManager.addMessage(
                streamId, 
                'model', 
                functionResponse.response.text()
              );
            }
            
            // Return combined response
            return {
              text: text,
              toolCalls: [{ name: functionName, args: functionArgs, result: functionResult }],
              followUpResponse: functionResponse.response.text()
            };
          } catch (error) {
            console.error(`Error executing function ${functionName}:`, error);
            
            // Record failed tool observation
            if (streamId) {
              const episode = await episodeManager.getCurrentEpisode(streamId);
              await episodeManager.recordToolObservation(
                streamId,
                episode.episodeId,
                functionName,
                functionArgs,
                null,
                error.message
              );
            }
            
            return {
              text: text,
              toolCalls: [{ name: functionName, args: functionArgs, error: error.message }],
              error: `Error executing function ${functionName}: ${error.message}`
            };
          }
        } else {
          console.error(`Unknown function: ${functionName}`);
          
          // Record unknown function observation
          if (streamId) {
            const episode = await episodeManager.getCurrentEpisode(streamId);
            await episodeManager.recordToolObservation(
              streamId,
              episode.episodeId,
              functionName,
              functionArgs,
              null,
              'Unknown function'
            );
          }
          
          return {
            text: text,
            toolCalls: [{ name: functionName, args: functionArgs }],
            error: `Unknown function: ${functionName}`
          };
        }
      }
    }
    
    // Calculate novelty-based reward
    if (streamId) {
      // TODO: Implement proper embedding-based novelty computation
      // For now, use a simple random value
      const noveltyValue = Math.random() * 0.5 + 0.5; // Between 0.5 and 1.0
      await episodeManager.recordReward(streamId, 'intrinsic', 'novelty', noveltyValue);
    }
    
    // If no tool calls, just return the text
    return { text };
  } catch (error) {
    console.error('Error sending message:', error);
    throw error;
  }
}

// Create Express route handlers for memory operations
async function createMemoryExperience(req, res) {
  try {
    const experienceData = req.body;
    const experience = await memoryOperations.createExperience(experienceData);
    res.json({ success: true, experience });
  } catch (error) {
    console.error('Error creating experience:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function searchMemoryExperiences(req, res) {
  try {
    const { query, tags, limit, offset, sortBy, sortOrder } = req.query;
    const options = {
      tags: tags ? JSON.parse(tags) : [],
      limit: parseInt(limit) || 10,
      offset: parseInt(offset) || 0,
      sortBy: sortBy || 'created_at',
      sortOrder: sortOrder || 'desc'
    };
    
    const experiences = await memoryOperations.searchExperiences(query, options);
    res.json({ success: true, experiences });
  } catch (error) {
    console.error('Error searching experiences:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

// Simple test function to demonstrate the memory chat
async function testMemoryChat() {
  try {
    // Create a chat with memory capabilities
    const chat = await getMemoryChat();
    
    // Send a message and get response
    const response1 = await sendMessageWithMemory(chat, 'My name is John and I love to play basketball.');
    console.log('Response 1:', response1);
    
    // Send another message
    const response2 = await sendMessageWithMemory(chat, 'What sports do I like?');
    console.log('Response 2:', response2);
    
    // Ask to create an experience
    const response3 = await sendMessageWithMemory(chat, 'Please create a memory of our conversation so far.');
    console.log('Response 3:', response3);
  } catch (error) {
    console.error('Error in test memory chat:', error);
  }
}

// Export the EpisodeManager for use elsewhere
const geminiMemory = {
  getMemoryChat,
  sendMessageWithMemory,
  createMemoryExperience,
  searchMemoryExperiences,
  testMemoryChat,
  EpisodeManager: episodeManager
};

export default geminiMemory; 