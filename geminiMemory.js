// Import required libraries
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
const memoryOperations = require('./memoryOperations');
const dbOperations = require('./dbOperations');
require('dotenv').config({ path: './.env.local' });

// Initialize the Google Generative AI with API key from .env.local
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Define function declarations for tool calling
const functionDeclarations = [
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
  },
  {
    name: 'updateExperience',
    description: 'Update an existing experience in memory',
    parameters: {
      type: 'OBJECT',
      properties: {
        id: {
          type: 'STRING',
          description: 'The experience_id of the experience to update'
        },
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
      required: ['id']
    }
  },
  {
    name: 'findRelatedExperiences',
    description: 'Find experiences related to a given experience',
    parameters: {
      type: 'OBJECT',
      properties: {
        id: {
          type: 'STRING',
          description: 'The experience_id of the experience to find relations for'
        },
        relationType: {
          type: 'STRING',
          description: 'Type of relation to filter by (optional)'
        }
      },
      required: ['id']
    }
  },
  {
    name: 'createRelation',
    description: 'Create a relation between two experiences',
    parameters: {
      type: 'OBJECT',
      properties: {
        sourceId: {
          type: 'STRING',
          description: 'The experience_id of the source experience'
        },
        targetId: {
          type: 'STRING',
          description: 'The experience_id of the target experience'
        },
        relationType: {
          type: 'STRING',
          description: 'Type of relation (e.g., "similar", "contradicts", "builds_upon")'
        },
        strength: {
          type: 'NUMBER',
          description: 'Strength of the relation (0-1)'
        }
      },
      required: ['sourceId', 'targetId', 'relationType']
    }
  },
  {
    name: 'linkToConversation',
    description: 'Link an experience to a conversation',
    parameters: {
      type: 'OBJECT',
      properties: {
        experienceId: {
          type: 'STRING',
          description: 'The experience_id of the experience to link'
        },
        conversationId: {
          type: 'NUMBER',
          description: 'The ID of the conversation to link to'
        }
      },
      required: ['experienceId', 'conversationId']
    }
  },
  {
    name: 'getConversationExperiences',
    description: 'Get experiences linked to a conversation',
    parameters: {
      type: 'OBJECT',
      properties: {
        conversationId: {
          type: 'NUMBER',
          description: 'The ID of the conversation to get experiences for'
        }
      },
      required: ['conversationId']
    }
  }
];

// Implement function handlers for each tool
const functionHandlers = {
  searchExperiences: async ({ query, tags, limit }) => {
    const options = {
      tags: tags || [],
      limit: limit || 10,
      offset: 0,
      sortBy: 'importance',
      sortOrder: 'desc'
    };
    
    const experiences = await memoryOperations.searchExperiences(query, options);
    return { experiences };
  },
  
  getExperienceById: async ({ id }) => {
    const experience = await memoryOperations.getExperienceByExperienceId(id);
    if (!experience) {
      return { error: `Experience with ID ${id} not found` };
    }
    return { experience };
  },
  
  createExperience: async (params) => {
    const experience = await memoryOperations.createExperience(params);
    return { experience };
  },
  
  updateExperience: async ({ id, ...updateData }) => {
    // First get the experience by experience_id
    const experience = await memoryOperations.getExperienceByExperienceId(id);
    if (!experience) {
      return { error: `Experience with ID ${id} not found` };
    }
    
    // Update using the internal ID
    const updatedExperience = await memoryOperations.updateExperience(experience.id, updateData);
    return { experience: updatedExperience };
  },
  
  findRelatedExperiences: async ({ id, relationType }) => {
    // First get the experience by experience_id
    const experience = await memoryOperations.getExperienceByExperienceId(id);
    if (!experience) {
      return { error: `Experience with ID ${id} not found` };
    }
    
    // Get related experiences
    const relatedExperiences = await memoryOperations.getRelatedExperiences(experience.id, relationType);
    return { relatedExperiences };
  },
  
  createRelation: async ({ sourceId, targetId, relationType, strength }) => {
    // Get experiences by experience_id
    const sourceExperience = await memoryOperations.getExperienceByExperienceId(sourceId);
    const targetExperience = await memoryOperations.getExperienceByExperienceId(targetId);
    
    if (!sourceExperience) {
      return { error: `Source experience with ID ${sourceId} not found` };
    }
    
    if (!targetExperience) {
      return { error: `Target experience with ID ${targetId} not found` };
    }
    
    // Create relation using internal IDs
    const relationId = await memoryOperations.createRelation(
      sourceExperience.id,
      targetExperience.id,
      relationType,
      strength || 1.0
    );
    
    return { 
      relationId,
      message: `Relation created between ${sourceId} and ${targetId}`
    };
  },
  
  linkToConversation: async ({ experienceId, conversationId }) => {
    // Get experience by experience_id
    const experience = await memoryOperations.getExperienceByExperienceId(experienceId);
    if (!experience) {
      return { error: `Experience with ID ${experienceId} not found` };
    }
    
    // Check if conversation exists
    const conversation = await dbOperations.getConversationWithMessages(conversationId);
    if (!conversation) {
      return { error: `Conversation with ID ${conversationId} not found` };
    }
    
    // Link experience to conversation
    await memoryOperations.linkExperienceToConversation(experience.id, conversationId);
    
    return { 
      message: `Experience ${experienceId} linked to conversation ${conversationId}`
    };
  },
  
  getConversationExperiences: async ({ conversationId }) => {
    // Check if conversation exists
    const conversation = await dbOperations.getConversationWithMessages(conversationId);
    if (!conversation) {
      return { error: `Conversation with ID ${conversationId} not found` };
    }
    
    // Get experiences linked to this conversation
    const experiences = await memoryOperations.getExperiencesForConversation(conversationId);
    
    return { experiences };
  }
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
async function sendMessageWithMemory(chat, message) {
  try {
    // Send message to Gemini
    const result = await chat.sendMessage(message);
    const response = result.response;
    const text = response.text();
    
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
            
            // Send the function response back to Gemini
            const functionResponse = await chat.sendMessage({
              functionResponse: {
                name: functionName,
                response: functionResult,
              },
            });
            
            // Return combined response
            return {
              text: text,
              toolCalls: [{ name: functionName, args: functionArgs, result: functionResult }],
              followUpResponse: functionResponse.response.text()
            };
          } catch (error) {
            console.error(`Error executing function ${functionName}:`, error);
            return {
              text: text,
              toolCalls: [{ name: functionName, args: functionArgs, error: error.message }],
              error: `Error executing function ${functionName}: ${error.message}`
            };
          }
        } else {
          console.error(`Unknown function: ${functionName}`);
          return {
            text: text,
            toolCalls: [{ name: functionName, args: functionArgs }],
            error: `Unknown function: ${functionName}`
          };
        }
      }
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
    const response3 = await sendMessageWithMemory(chat, 'Please remember that I am allergic to peanuts.');
    console.log('Response 3:', response3);
    
    // Test recall
    const response4 = await sendMessageWithMemory(chat, 'What am I allergic to?');
    console.log('Response 4:', response4);
  } catch (error) {
    console.error('Error in test:', error);
  }
}

module.exports = {
  getMemoryChat,
  sendMessageWithMemory,
  createMemoryExperience,
  searchMemoryExperiences,
  testMemoryChat
}; 