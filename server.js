import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: './.env.local' });

// Import modules
import * as memoryOps from './memoryOperations.js';
import * as dbOps from './dbOperations.js';
import * as geminiMem from './geminiMemory.js';

// Destructure imports for easier access
const memoryOperations = memoryOps.default || memoryOps;
const dbOperations = dbOps.default || dbOps;
const geminiMemory = geminiMem.default || geminiMem;

const app = express();
const PORT = process.env.PORT || 3000;

// StreamManager class to replace the chatSessions map
class StreamManager {
  constructor() {
    this.streams = new Map();
    this.db = dbOperations.db;
  }

  // Generate a new stream ID
  generateStreamId() {
    return uuidv4();
  }

  // Create a new stream and persist metadata
  async createStream(chat, userId = 'default_user') {
    const streamId = this.generateStreamId();
    const timestamp = new Date();
    
    // Store in memory
    this.streams.set(streamId, {
      chat,
      startTimestamp: timestamp,
      lastActiveTimestamp: timestamp,
      status: 'active',
      userId
    });
    
    // Persist in database
    await this.db('Streams').insert({
      stream_id: streamId,
      user_id: userId,
      start_ts: timestamp,
      last_active_ts: timestamp,
      status: 'active'
    });
    
    return streamId;
  }

  // Get a stream by ID
  getStream(streamId) {
    return this.streams.get(streamId);
  }

  // Update a stream's last active timestamp
  async updateStreamActivity(streamId) {
    const stream = this.streams.get(streamId);
    if (stream) {
      const timestamp = new Date();
      stream.lastActiveTimestamp = timestamp;
      
      // Update in database
      await this.db('Streams')
        .where('stream_id', streamId)
        .update({ last_active_ts: timestamp });
    }
  }

  // Resume a stream from the database
  async resumeStream(streamId) {
    // Check if already in memory
    if (this.streams.has(streamId)) {
      return this.streams.get(streamId);
    }
    
    // Get from database
    const streamData = await this.db('Streams')
      .where('stream_id', streamId)
      .first();
      
    if (streamData) {
      // Recreate chat from history
      const chat = await geminiMemory.getMemoryChat();
      
      // Store in memory
      this.streams.set(streamId, {
        chat,
        startTimestamp: streamData.start_ts,
        lastActiveTimestamp: new Date(),
        status: streamData.status,
        userId: streamData.user_id
      });
      
      // Update last active timestamp
      await this.db('Streams')
        .where('stream_id', streamId)
        .update({ 
          last_active_ts: new Date(),
          status: 'active'
        });
        
      return this.streams.get(streamId);
    }
    
    return null;
  }
}

// Initialize StreamManager
const streamManager = new StreamManager();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Load the sandbox service if available
let sandbox;
try {
  sandbox = await import('./sandbox.js');
  console.log('Sandbox service loaded');
} catch (error) {
  console.error('Failed to load sandbox service:', error);
}

// Load and initialize ReplayScheduler
let replayScheduler;
try {
  replayScheduler = await import('./replayScheduler.js');
  // Start scheduler with default schedule (every 15 minutes)
  // Only start in production or if ENABLE_REPLAY environment variable is set
  if (process.env.NODE_ENV === 'production' || process.env.ENABLE_REPLAY === 'true') {
    replayScheduler.start();
    console.log('ReplayScheduler started');
  } else {
    console.log('ReplayScheduler loaded but not started (not in production)');
  }
} catch (error) {
  console.error('Failed to load ReplayScheduler:', error);
}

// API routes

// Get all experiences
app.get('/api/experiences', async (req, res) => {
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
    console.error('Error getting experiences:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get experience by ID
app.get('/api/experiences/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const experience = await memoryOperations.getExperienceByExperienceId(id);
    
    if (!experience) {
      return res.status(404).json({ success: false, error: 'Experience not found' });
    }
    
    res.json({ success: true, experience });
  } catch (error) {
    console.error('Error getting experience:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create new experience
app.post('/api/experiences', async (req, res) => {
  try {
    const experienceData = req.body;
    const experience = await memoryOperations.createExperience(experienceData);
    res.status(201).json({ success: true, experience });
  } catch (error) {
    console.error('Error creating experience:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update experience
app.put('/api/experiences/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    // Get the experience first
    const experience = await memoryOperations.getExperienceByExperienceId(id);
    
    if (!experience) {
      return res.status(404).json({ success: false, error: 'Experience not found' });
    }
    
    // Update with the internal ID
    const updatedExperience = await memoryOperations.updateExperience(experience.id, updateData);
    res.json({ success: true, experience: updatedExperience });
  } catch (error) {
    console.error('Error updating experience:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete experience
app.delete('/api/experiences/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get the experience first
    const experience = await memoryOperations.getExperienceByExperienceId(id);
    
    if (!experience) {
      return res.status(404).json({ success: false, error: 'Experience not found' });
    }
    
    // Delete with the internal ID
    const success = await memoryOperations.deleteExperience(experience.id);
    
    if (success) {
      res.json({ success: true, message: 'Experience deleted successfully' });
    } else {
      res.status(404).json({ success: false, error: 'Experience not found' });
    }
  } catch (error) {
    console.error('Error deleting experience:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get related experiences
app.get('/api/experiences/:id/related', async (req, res) => {
  try {
    const { id } = req.params;
    const { relationType } = req.query;
    
    // Get the experience first
    const experience = await memoryOperations.getExperienceByExperienceId(id);
    
    if (!experience) {
      return res.status(404).json({ success: false, error: 'Experience not found' });
    }
    
    // Get related experiences
    const relatedExperiences = await memoryOperations.getRelatedExperiences(experience.id, relationType);
    res.json({ success: true, relatedExperiences });
  } catch (error) {
    console.error('Error getting related experiences:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create a relation between experiences
app.post('/api/relations', async (req, res) => {
  try {
    const { sourceId, targetId, relationType, strength } = req.body;
    
    // Get experiences
    const sourceExperience = await memoryOperations.getExperienceByExperienceId(sourceId);
    const targetExperience = await memoryOperations.getExperienceByExperienceId(targetId);
    
    if (!sourceExperience) {
      return res.status(404).json({ success: false, error: 'Source experience not found' });
    }
    
    if (!targetExperience) {
      return res.status(404).json({ success: false, error: 'Target experience not found' });
    }
    
    // Create relation
    const relationId = await memoryOperations.createRelation(
      sourceExperience.id,
      targetExperience.id,
      relationType,
      strength || 1.0
    );
    
    res.status(201).json({
      success: true,
      relationId,
      message: `Relation created between ${sourceId} and ${targetId}`
    });
  } catch (error) {
    console.error('Error creating relation:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Gemini chat routes

// Create a new chat session/stream
app.post('/api/chat/session', async (req, res) => {
  try {
    const { systemInstructions, userId } = req.body;
    
    // Create a new chat session
    const chat = await geminiMemory.getMemoryChat(systemInstructions);
    
    // Create stream and get ID
    const streamId = await streamManager.createStream(chat, userId || 'default_user');
    
    res.json({
      success: true,
      streamId,
      message: 'Chat session created'
    });
  } catch (error) {
    console.error('Error creating chat session:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Send a message to an existing chat session
app.post('/api/chat/session/:streamId/message', async (req, res) => {
  try {
    const { streamId } = req.params;
    const { message } = req.body;
    
    // Check if session exists
    const stream = streamManager.getStream(streamId);
    
    if (!stream) {
      return res.status(404).json({
        success: false,
        error: 'Chat session not found'
      });
    }
    
    // Update last active timestamp
    await streamManager.updateStreamActivity(streamId);
    
    // Send message and get response
    const response = await geminiMemory.sendMessageWithMemory(stream.chat, message, streamId);
    
    res.json({
      success: true,
      response
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Resume a previous stream
app.get('/api/streams/resume/:streamId', async (req, res) => {
  try {
    const { streamId } = req.params;
    
    // Attempt to resume the stream
    const stream = await streamManager.resumeStream(streamId);
    
    if (!stream) {
      return res.status(404).json({
        success: false,
        error: 'Stream not found'
      });
    }
    
    res.json({
      success: true,
      streamId,
      message: 'Stream resumed successfully'
    });
  } catch (error) {
    console.error('Error resuming stream:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Test run the memory chat
app.post('/api/chat/test', async (req, res) => {
  try {
    // This is a simplified test that will run in the console
    geminiMemory.testMemoryChat();
    
    res.json({
      success: true,
      message: 'Test started, check server console for output'
    });
  } catch (error) {
    console.error('Error running test:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Sandbox routes
app.post('/sandbox/execute', async (req, res) => {
  try {
    const { language, code, timeout } = req.body;
    
    if (!sandbox) {
      return res.status(503).json({
        success: false,
        error: 'Sandbox service is not available'
      });
    }
    
    if (!language || !code) {
      return res.status(400).json({
        success: false,
        error: 'Language and code are required'
      });
    }
    
    const result = await sandbox.executeCode(language, code, timeout);
    
    res.json({
      success: !result.error,
      output: result.output,
      error: result.error
    });
  } catch (error) {
    console.error('Error executing code:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Add endpoint to manually trigger ReplayScheduler
app.post('/api/replay/manual', async (req, res) => {
  try {
    if (!replayScheduler) {
      return res.status(503).json({
        success: false,
        error: 'ReplayScheduler is not available'
      });
    }
    
    // Run replay iteration manually
    await replayScheduler.manualRun();
    
    res.json({
      success: true,
      message: 'Manual replay completed successfully'
    });
  } catch (error) {
    console.error('Error running manual replay:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Add endpoint for human feedback
app.post('/api/rewards', async (req, res) => {
  try {
    const { streamId, value, feedback } = req.body;
    
    if (!streamId) {
      return res.status(400).json({
        success: false,
        error: 'Stream ID is required'
      });
    }
    
    // Validate value is a number between -1 and 1
    if (typeof value !== 'number' || value < -1 || value > 1) {
      return res.status(400).json({
        success: false,
        error: 'Value must be a number between -1 and 1'
      });
    }
    
    // Store reward in database
    await dbOperations.db('Rewards').insert({
      stream_id: streamId,
      source: 'human',
      signal: feedback || 'thumbs',
      value,
      ts: new Date()
    });
    
    res.json({
      success: true,
      message: 'Feedback recorded successfully'
    });
  } catch (error) {
    console.error('Error recording feedback:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Serve the main application
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
}); 