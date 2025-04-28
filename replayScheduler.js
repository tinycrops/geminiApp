// ReplayScheduler service for continual learning
import pkg from '@google/genai';
const { GoogleGenerativeAI } = pkg;
import cron from 'node-cron';
import dbOps from './dbOperations.js';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: './.env.local' });

// Initialize Gemini API client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
});

class ReplayScheduler {
  constructor(db) {
    this.db = db || dbOps.db;
    this.isRunning = false;
    this.schedule = null;
  }
  
  // Start the scheduler with a cron expression (default: every 15 minutes)
  start(cronExpression = '*/15 * * * *') {
    if (this.isRunning) {
      console.log('ReplayScheduler is already running');
      return;
    }
    
    console.log(`Starting ReplayScheduler with schedule: ${cronExpression}`);
    
    this.schedule = cron.schedule(cronExpression, async () => {
      try {
        await this.runReplayIteration();
      } catch (error) {
        console.error('Error in replay iteration:', error);
      }
    });
    
    this.isRunning = true;
  }
  
  // Stop the scheduler
  stop() {
    if (!this.isRunning) {
      console.log('ReplayScheduler is not running');
      return;
    }
    
    this.schedule.stop();
    this.isRunning = false;
    console.log('ReplayScheduler stopped');
  }
  
  // Run a single replay iteration
  async runReplayIteration() {
    console.log('Running replay iteration...');
    
    // 1. Select top-k episodes by salience + recency
    const episodes = await this.selectHighValueEpisodes();
    
    if (episodes.length === 0) {
      console.log('No episodes selected for replay');
      return;
    }
    
    console.log(`Selected ${episodes.length} episodes for replay`);
    
    // 2. For each episode, generate a summary
    for (const episode of episodes) {
      try {
        // Get all messages for this episode
        const messages = await this.db('EpisodesBuffer')
          .where('episode_id', episode.episode_id)
          .orderBy('ts', 'asc')
          .select();
        
        if (messages.length === 0) {
          console.log(`No messages found for episode ${episode.episode_id}`);
          continue;
        }
        
        // Generate summary
        const summary = await this.summarizeEpisode(episode, messages);
        
        // Store the summary as a memory
        await this.storeSummaryMemory(episode, summary);
        
        console.log(`Processed episode ${episode.episode_id}`);
      } catch (error) {
        console.error(`Error processing episode ${episode.episode_id}:`, error);
      }
    }
    
    console.log('Replay iteration completed');
  }
  
  // Select high-value episodes for replay
  async selectHighValueEpisodes(limit = 5) {
    // Query for completed episodes with high salience scores
    const episodes = await this.db('Episodes')
      .whereNotNull('end_ts')
      .where('salience_score', '>', 0.3)  // Threshold for "interesting" episodes
      .orderBy([
        { column: 'salience_score', order: 'desc' },
        { column: 'end_ts', order: 'desc' }
      ])
      .limit(limit)
      .select();
      
    return episodes;
  }
  
  // Summarize an episode using Gemini
  async summarizeEpisode(episode, messages) {
    // Convert messages to a conversation transcript
    const transcript = messages.map(msg => {
      return `${msg.role.toUpperCase()}: ${msg.content}`;
    }).join('\n\n');
    
    // Create the prompt for the summary
    const prompt = `
You are an AI assistant tasked with summarizing and extracting learnings from conversation transcripts.
Please analyze the following conversation between a user and an AI assistant.

CONVERSATION TRANSCRIPT:
${transcript}

Please provide:
1. A concise summary of what the conversation was about (2-3 sentences)
2. Key knowledge or information shared during the conversation
3. Important user preferences, characteristics, or request patterns
4. Any notable insights or learnings from this interaction

FORMAT YOUR RESPONSE AS:
Summary: [concise summary]
Key Knowledge: [bullet points of important information]
User Characteristics: [observed user traits, if any]
Insights: [what the AI can learn from this interaction]
`;

    // Generate the summary
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 1024,
      },
    });
    
    return result.response.text();
  }
  
  // Store the summary as a memory experience
  async storeSummaryMemory(episode, summaryText) {
    // Parse the summary to extract structured information
    const summaryParts = {};
    const summaryLines = summaryText.split('\n');
    
    let currentSection = '';
    for (const line of summaryLines) {
      if (line.startsWith('Summary:')) {
        currentSection = 'summary';
        summaryParts.summary = line.substring('Summary:'.length).trim();
      } else if (line.startsWith('Key Knowledge:')) {
        currentSection = 'keyKnowledge';
        summaryParts.keyKnowledge = [];
      } else if (line.startsWith('User Characteristics:')) {
        currentSection = 'userCharacteristics';
        summaryParts.userCharacteristics = [];
      } else if (line.startsWith('Insights:')) {
        currentSection = 'insights';
        summaryParts.insights = [];
      } else if (line.trim() && currentSection) {
        // Add to current section
        if (currentSection === 'summary') {
          summaryParts.summary += ' ' + line.trim();
        } else if (Array.isArray(summaryParts[currentSection])) {
          if (line.trim().startsWith('- ')) {
            summaryParts[currentSection].push(line.trim().substring(2));
          } else {
            summaryParts[currentSection].push(line.trim());
          }
        }
      }
    }
    
    // Create a summary experience
    const experienceId = `sum_${uuidv4().substring(0, 8)}`;
    const title = `Summary of conversation from ${new Date(episode.start_ts).toLocaleString()}`;
    
    const experienceData = {
      experience_id: experienceId,
      title: title,
      description: summaryParts.summary || 'Episode summary',
      context: `Summary generated from episode ${episode.episode_id}`,
      importance: 7,  // High importance for summaries
      type: 'summary',  // Mark as a summary
      episode_id: episode.episode_id,
      salience_score: episode.salience_score,
      tags: ['summary', 'ai-generated'],
      metadata: {
        keyKnowledge: summaryParts.keyKnowledge || [],
        userCharacteristics: summaryParts.userCharacteristics || [],
        insights: summaryParts.insights || [],
        original_episode_id: episode.episode_id,
        stream_id: episode.stream_id
      }
    };
    
    // Insert into database
    try {
      await this.db('Experiences').insert({
        experience_id: experienceData.experience_id,
        title: experienceData.title,
        description: experienceData.description,
        context: experienceData.context,
        importance: experienceData.importance,
        type: experienceData.type,
        episode_id: experienceData.episode_id,
        salience_score: experienceData.salience_score,
        metadata: JSON.stringify(experienceData.metadata)
      });
      
      // Add tags
      if (experienceData.tags && experienceData.tags.length > 0) {
        const [experienceId] = await this.db('Experiences')
          .where('experience_id', experienceData.experience_id)
          .pluck('id');
          
        const tagInserts = experienceData.tags.map(tag => ({
          experience_id: experienceId,
          tag
        }));
        
        await this.db('ExperienceTags').insert(tagInserts);
      }
      
      // Record intrinsic reward for learning
      await this.db('Rewards').insert({
        stream_id: episode.stream_id,
        source: 'intrinsic',
        signal: 'learning',
        value: 1.0,
        ts: new Date()
      });
      
      console.log(`Created summary experience: ${experienceData.experience_id}`);
      return experienceData;
    } catch (error) {
      console.error('Error storing summary:', error);
      throw error;
    }
  }
  
  // Run the replay scheduler on demand
  async manualRun() {
    await this.runReplayIteration();
  }
}

// Create instance
const scheduler = new ReplayScheduler();

// Export for use elsewhere
export default scheduler;

// If run directly, run a manual iteration
if (import.meta.main) {
  scheduler.manualRun()
    .then(() => {
      console.log('Manual replay completed');
      process.exit(0);
    })
    .catch(error => {
      console.error('Error running manual replay:', error);
      process.exit(1);
    });
} 