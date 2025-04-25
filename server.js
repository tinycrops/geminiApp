const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const memoryOperations = require('./memoryOperations');
const dbOperations = require('./dbOperations');
const geminiMemory = require('./geminiMemory');
require('dotenv').config({ path: './.env.local' });

const app = express();
const PORT = process.env.PORT || 3000;

// Store active chat sessions
const chatSessions = new Map();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

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

// Create a new chat session
app.post('/api/chat/session', async (req, res) => {
  try {
    const { systemInstructions } = req.body;
    const sessionId = Date.now().toString();
    
    // Create a new chat session
    const chat = await geminiMemory.getMemoryChat(systemInstructions);
    
    // Store the chat session
    chatSessions.set(sessionId, chat);
    
    res.json({
      success: true,
      sessionId,
      message: 'Chat session created'
    });
  } catch (error) {
    console.error('Error creating chat session:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Send a message to an existing chat session
app.post('/api/chat/session/:sessionId/message', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { message } = req.body;
    
    // Check if session exists
    const chat = chatSessions.get(sessionId);
    
    if (!chat) {
      return res.status(404).json({
        success: false,
        error: 'Chat session not found'
      });
    }
    
    // Send message and get response
    const response = await geminiMemory.sendMessageWithMemory(chat, message);
    
    res.json({
      success: true,
      response
    });
  } catch (error) {
    console.error('Error sending message:', error);
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

// Serve the main application
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 