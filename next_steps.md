Okay, let's implement a system for managing data artifacts within an agent's operational cycle, drawing inspiration from the jxnl RFC and integrating it into your existing codebase.

We'll create:

1.  **A new database table (`Artifacts`)** to store session-scoped artifacts.
2.  **New database operations (`artifactOperations.js`)** for this table.
3.  **An `ArtifactManager` class** to handle registration and resolution within a specific session.
4.  **A `ResourceReference` class** to represent references.
5.  **Integration points** in your `server.js` and `geminiMemory.js`.

**Step 1: Setup Script for the New Table**

Create a new file `setupArtifactsDatabase.js`:

```javascript
// setupArtifactsDatabase.js
const db = require('./dbConfig');

async function setupArtifactsDatabase() {
  try {
    console.log('Setting up artifacts database table...');

    const artifactsTableExists = await db.schema.hasTable('Artifacts');

    if (!artifactsTableExists) {
      console.log('Creating Artifacts table...');
      await db.schema.createTable('Artifacts', table => {
        table.increments('id').primary();
        table.string('session_id', 100).notNullable().index(); // To scope artifacts to a session
        table.string('artifact_tag', 100).notNullable(); // e.g., 'summary', 'email', 'plan'
        table.string('artifact_id', 100).notNullable(); // e.g., '001', 'v1', 'client-followup'
        table.string('uri', 300).notNullable().unique(); // e.g., context://summary#001
        table.string('mime_type', 100).defaultTo('text/plain');
        table.text('content').notNullable(); // The actual artifact content
        table.text('metadata').nullable(); // JSON string for additional metadata
        table.timestamp('created_at').defaultTo(db.fn.now());
        // Optional: Add an expiry timestamp for automatic cleanup
        // table.timestamp('expires_at').nullable();
      });
      console.log('Artifacts table created.');
    } else {
      console.log('Artifacts table already exists.');
    }

    console.log('Artifacts database setup completed successfully!');

  } catch (err) {
    console.error('Error setting up artifacts database:', err);
  } finally {
    // Optionally close the connection if this script is run standalone
     await db.destroy();
  }
}

// Run the setup if the script is executed directly
if (require.main === module) {
  setupArtifactsDatabase();
}

module.exports = setupArtifactsDatabase; // Export for potential programmatic use
```

**Add a script to `package.json`:**

```json
  "scripts": {
    "setup-db": "node setupDatabase.js",
    "setup-memory": "node setupMemoryDatabase.js",
    "setup-artifacts": "node setupArtifactsDatabase.js", // <-- Add this line
    "test-db": "node testDb.js",
    "test-memory": "node -e \"require('./geminiMemory.js').testMemoryChat()\"", // <-- Modified test command
    "start": "node server.js"
  },
```

**Run the setup:** `npm run setup-artifacts`

**Step 2: Artifact Database Operations**

Create `artifactOperations.js`:

```javascript
// artifactOperations.js
const db = require('./dbConfig');

class ArtifactOperations {
  async createArtifact(artifactData) {
    try {
      // Ensure required fields are present
      if (!artifactData.session_id || !artifactData.artifact_tag || !artifactData.artifact_id || !artifactData.uri || !artifactData.content) {
        throw new Error('Missing required fields for artifact creation');
      }

      // Format metadata if it's an object
      if (artifactData.metadata && typeof artifactData.metadata === 'object') {
        artifactData.metadata = JSON.stringify(artifactData.metadata);
      }

      const [id] = await db('Artifacts').insert(artifactData);
      return { id, ...artifactData };
    } catch (error) {
      console.error('Error creating artifact:', error);
      // Handle potential unique constraint violation for URI
      if (error.message.includes('UNIQUE constraint failed: Artifacts.uri')) {
          throw new Error(`Artifact with URI ${artifactData.uri} already exists.`);
      }
      throw error;
    }
  }

  async getArtifactByUri(uri, sessionId) {
    try {
      const artifact = await db('Artifacts')
        .where({ uri: uri, session_id: sessionId })
        .first();

      if (artifact && artifact.metadata) {
        try {
          artifact.metadata = JSON.parse(artifact.metadata);
        } catch (e) {
          console.warn(`Failed to parse metadata for artifact URI: ${uri}`);
          // Keep metadata as string if parsing fails
        }
      }
      return artifact; // Returns null if not found
    } catch (error) {
      console.error(`Error getting artifact with URI ${uri}:`, error);
      throw error;
    }
  }

  // Get all artifacts for a specific session
  async getSessionArtifacts(sessionId) {
    try {
        const artifacts = await db('Artifacts')
            .where({ session_id: sessionId })
            .orderBy('created_at', 'desc');

        // Parse metadata for all artifacts
        artifacts.forEach(artifact => {
            if (artifact.metadata) {
                try {
                    artifact.metadata = JSON.parse(artifact.metadata);
                } catch (e) {
                    console.warn(`Failed to parse metadata for artifact URI: ${artifact.uri}`);
                }
            }
        });
        return artifacts;
    } catch (error) {
        console.error(`Error getting artifacts for session ${sessionId}:`, error);
        throw error;
    }
  }

  // Delete a specific artifact by URI and session ID
  async deleteArtifact(uri, sessionId) {
    try {
      const numDeleted = await db('Artifacts')
        .where({ uri: uri, session_id: sessionId })
        .delete();
      return numDeleted > 0;
    } catch (error) {
      console.error(`Error deleting artifact with URI ${uri}:`, error);
      throw error;
    }
  }

  // Delete all artifacts associated with a specific session
  async deleteSessionArtifacts(sessionId) {
    try {
      const numDeleted = await db('Artifacts')
        .where({ session_id: sessionId })
        .delete();
      console.log(`Deleted ${numDeleted} artifacts for session ${sessionId}`);
      return numDeleted;
    } catch (error) {
      console.error(`Error deleting artifacts for session ${sessionId}:`, error);
      throw error;
    }
  }
}

module.exports = new ArtifactOperations();
```

**Step 3: ResourceReference Class**

Create `ResourceReference.js` (or define it within `ArtifactManager.js`):

```javascript
// ResourceReference.js
class ResourceReference {
  /**
   * @param {string} uri - The unique resource identifier (e.g., context://tag#id)
   * @param {string} mimeType - The MIME type of the resource content.
   */
  constructor(uri, mimeType = 'text/plain') {
    if (!uri || typeof uri !== 'string' || !uri.startsWith('context://')) {
      throw new Error('Invalid URI format for ResourceReference. Must start with context://');
    }
    this.uri = uri;
    this.mime = mimeType; // Keep RFC naming convention 'mime'
  }

  // Check if an object looks like a ResourceReference
  static isReference(obj) {
      return typeof obj === 'object' && obj !== null && typeof obj.uri === 'string' && obj.uri.startsWith('context://') && typeof obj.mime === 'string';
  }

  // Check if a string looks like a resource URI
  static isUriString(str) {
      return typeof str === 'string' && str.startsWith('context://');
  }
}

module.exports = ResourceReference;
```

**Step 4: ArtifactManager Class**

Create `ArtifactManager.js`:

```javascript
// ArtifactManager.js
const artifactOperations = require('./artifactOperations');
const ResourceReference = require('./ResourceReference'); // Assuming it's in a separate file

class ArtifactManager {
  constructor(sessionId) {
    if (!sessionId) {
      throw new Error('ArtifactManager requires a sessionId');
    }
    this.sessionId = sessionId;
  }

  /**
   * Registers a new artifact for the current session.
   * @param {string} tag - The type/category of the artifact (e.g., 'summary', 'plan').
   * @param {string} id - The unique ID for this artifact within its tag and session (e.g., '001', 'v2').
   * @param {string} mimeType - The MIME type of the content.
   * @param {string} content - The actual artifact content.
   * @param {object} [metadata] - Optional metadata object.
   * @returns {Promise<ResourceReference>} A reference to the created artifact.
   */
  async registerArtifact(tag, id, mimeType, content, metadata = null) {
    const uri = `context://${tag}#${id}`;
    try {
      await artifactOperations.createArtifact({
        session_id: this.sessionId,
        artifact_tag: tag,
        artifact_id: id,
        uri: uri,
        mime_type: mimeType || 'text/plain',
        content: content,
        metadata: metadata,
      });
      console.log(`Artifact registered: ${uri} for session ${this.sessionId}`);
      return new ResourceReference(uri, mimeType);
    } catch (error) {
      console.error(`Failed to register artifact ${uri}:`, error);
      // If it already exists, maybe we just return the reference? Or throw?
      // For now, re-throw to indicate failure.
      throw error;
    }
  }

  /**
   * Resolves a ResourceReference or URI string to its content.
   * @param {ResourceReference | string} reference - The reference object or URI string.
   * @returns {Promise<string | null>} The artifact content, or null if not found.
   */
  async resolveReferenceContent(reference) {
    const uri = ResourceReference.isReference(reference) ? reference.uri :
                ResourceReference.isUriString(reference) ? reference : null;

    if (!uri) {
      console.warn('Invalid reference provided to resolveReferenceContent:', reference);
      return null; // Or throw error?
    }

    try {
      const artifact = await artifactOperations.getArtifactByUri(uri, this.sessionId);
      return artifact ? artifact.content : null;
    } catch (error) {
      console.error(`Failed to resolve artifact content for ${uri}:`, error);
      return null; // Or re-throw
    }
  }

   /**
   * Resolves a ResourceReference or URI string to the full artifact object.
   * @param {ResourceReference | string} reference - The reference object or URI string.
   * @returns {Promise<object | null>} The full artifact object, or null if not found.
   */
  async resolveReference(reference) {
    const uri = ResourceReference.isReference(reference) ? reference.uri :
                ResourceReference.isUriString(reference) ? reference : null;

    if (!uri) {
      console.warn('Invalid reference provided to resolveReference:', reference);
      return null; // Or throw error?
    }

    try {
      const artifact = await artifactOperations.getArtifactByUri(uri, this.sessionId);
      return artifact; // artifact object includes content, metadata, etc.
    } catch (error) {
      console.error(`Failed to resolve artifact ${uri}:`, error);
      return null; // Or re-throw
    }
  }

  /**
   * Retrieves all artifacts registered for the current session.
   * @returns {Promise<Array<object>>} A list of artifact objects.
   */
  async listSessionArtifacts() {
    try {
        return await artifactOperations.getSessionArtifacts(this.sessionId);
    } catch (error) {
        console.error(`Failed to list artifacts for session ${this.sessionId}:`, error);
        return []; // Return empty array on error
    }
  }


  /**
   * Cleans up all artifacts associated with this manager's session.
   * @returns {Promise<number>} The number of artifacts deleted.
   */
  async cleanupSessionArtifacts() {
    console.log(`Cleaning up artifacts for session ${this.sessionId}...`);
    try {
      return await artifactOperations.deleteSessionArtifacts(this.sessionId);
    } catch (error) {
      console.error(`Failed to cleanup artifacts for session ${this.sessionId}:`, error);
      return 0;
    }
  }
}

module.exports = ArtifactManager;
```

**Step 5: Integrate into `server.js`**

Modify `server.js` to manage `ArtifactManager` instances per session.

```javascript
// server.js
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const memoryOperations = require('./memoryOperations');
const dbOperations = require('./dbOperations');
const geminiMemory = require('./geminiMemory');
const ArtifactManager = require('./ArtifactManager'); // <-- Import
const artifactOperations = require('./artifactOperations'); // <-- Optional: for direct API endpoints
require('dotenv').config({ path: './.env.local' });

const app = express();
const PORT = process.env.PORT || 3000;

// Store active chat sessions and their artifact managers
// Format: Map<sessionId, { chat: GeminiChatSession, artifactManager: ArtifactManager }>
const chatSessions = new Map();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Existing API routes for experiences, relations etc. remain the same ---
// ... (Keep your existing /api/experiences, /api/relations routes) ...


// --- Artifact API Routes (Optional but useful) ---

// List artifacts for a session
app.get('/api/artifacts/session/:sessionId', async (req, res) => {
    const { sessionId } = req.params;
    const sessionData = chatSessions.get(sessionId);
    if (!sessionData) {
        return res.status(404).json({ success: false, error: 'Chat session not found' });
    }
    try {
        const artifacts = await sessionData.artifactManager.listSessionArtifacts();
        res.json({ success: true, artifacts });
    } catch (error) {
        console.error(`Error listing artifacts for session ${sessionId}:`, error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get a specific artifact by URI
app.get('/api/artifacts/resolve/:uri', async (req, res) => {
    const uri = decodeURIComponent(req.params.uri); // Decode URI potentially passed in path
    const { sessionId } = req.query; // Require sessionId to scope the lookup

    if (!sessionId) {
        return res.status(400).json({ success: false, error: 'sessionId query parameter is required' });
    }
    const sessionData = chatSessions.get(sessionId);
     if (!sessionData) {
        return res.status(404).json({ success: false, error: 'Chat session not found' });
    }

    try {
        const artifact = await sessionData.artifactManager.resolveReference(uri);
        if (artifact) {
            res.json({ success: true, artifact });
        } else {
            res.status(404).json({ success: false, error: `Artifact not found or not accessible in session ${sessionId}` });
        }
    } catch (error) {
        console.error(`Error resolving artifact ${uri}:`, error);
        res.status(500).json({ success: false, error: error.message });
    }
});


// --- Gemini Chat Routes ---

// Create a new chat session
app.post('/api/chat/session', async (req, res) => {
  try {
    const { systemInstructions } = req.body;
    const sessionId = Date.now().toString(); // Or a more robust session ID generation

    // Create a new chat session
    const chat = await geminiMemory.getMemoryChat(systemInstructions);

    // Create an ArtifactManager for this session
    const artifactManager = new ArtifactManager(sessionId); // <-- Create manager

    // Store the chat session and artifact manager
    chatSessions.set(sessionId, { chat, artifactManager }); // <-- Store both

    console.log(`Chat session ${sessionId} created.`);

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
    const sessionData = chatSessions.get(sessionId);

    if (!sessionData) {
      return res.status(404).json({
        success: false,
        error: 'Chat session not found'
      });
    }

    // Pass both chat and artifactManager to the handling function
    const response = await geminiMemory.sendMessageWithMemory(
        sessionData.chat,
        message,
        sessionData.artifactManager // <-- Pass manager
    );

    res.json({
      success: true,
      response
    });
  } catch (error) {
    console.error(`Error sending message for session ${sessionId}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Add a route to explicitly end a session and clean up artifacts
app.delete('/api/chat/session/:sessionId', async (req, res) => {
    const { sessionId } = req.params;
    const sessionData = chatSessions.get(sessionId);

    if (!sessionData) {
        return res.status(404).json({ success: false, error: 'Chat session not found' });
    }

    try {
        // Clean up artifacts
        const deletedCount = await sessionData.artifactManager.cleanupSessionArtifacts();
        // Remove session from map
        chatSessions.delete(sessionId);
        console.log(`Chat session ${sessionId} ended and ${deletedCount} artifacts cleaned up.`);
        res.json({ success: true, message: `Session ${sessionId} ended, ${deletedCount} artifacts cleaned up.` });
    } catch (error) {
        console.error(`Error ending session ${sessionId}:`, error);
        res.status(500).json({ success: false, error: `Failed to end session: ${error.message}` });
    }
});


// Test run the memory chat - needs modification to handle artifact manager
app.post('/api/chat/test', async (req, res) => {
  try {
    // This test needs to be adapted as it runs standalone
    // For a proper test, it should create a session via the API first
    // and then send messages via the API.
    // The original geminiMemory.testMemoryChat() won't have the server's session context.
    // geminiMemory.testMemoryChat(); // This will likely fail or not use artifacts correctly now
    res.status(501).json({
      success: false,
      message: 'Direct test endpoint needs rework to integrate with session management.'
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

// Basic periodic cleanup for orphaned sessions (optional)
// setInterval(() => {
//     // Logic to identify and cleanup old/inactive sessions and their artifacts
//     console.log("Periodic cleanup check...");
// }, 3600 * 1000); // e.g., every hour
```

**Step 6: Integrate into `geminiMemory.js` (Tooling)**

Modify `geminiMemory.js` to:

1.  Accept the `artifactManager` in `sendMessageWithMemory`.
2.  Add new tools for registering artifacts.
3.  Modify existing tools (or add new ones) to potentially accept and resolve `ResourceReference`s.

```javascript
// geminiMemory.js
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
const memoryOperations = require('./memoryOperations');
const dbOperations = require('./dbOperations');
const ResourceReference = require('./ResourceReference'); // <-- Import
// ArtifactManager is passed in, not required globally here.
require('dotenv').config({ path: './.env.local' });

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// --- Existing Function Declarations ---
const existingFunctionDeclarations = [
  // ... (keep searchExperiences, getExperienceById, etc.) ...
   { name: 'searchExperiences', /* ... */ },
   { name: 'getExperienceById', /* ... */ },
   { name: 'createExperience', /* ... */ },
   { name: 'updateExperience', /* ... */ },
   { name: 'findRelatedExperiences', /* ... */ },
   { name: 'createRelation', /* ... */ },
   { name: 'linkToConversation', /* ... */ },
   { name: 'getConversationExperiences', /* ... */ }
];


// --- NEW Function Declarations for Artifacts ---
const artifactFunctionDeclarations = [
    {
        name: 'registerArtifact',
        description: 'Registers a piece of text content as a reusable artifact within the current session.',
        parameters: {
            type: 'OBJECT',
            properties: {
                tag: {
                    type: 'STRING',
                    description: 'A category tag for the artifact (e.g., summary, draft, plan, analysis).'
                },
                id: {
                    type: 'STRING',
                    description: 'A unique identifier for this artifact within its tag (e.g., v1, initial_plan, section_a).'
                },
                content: {
                    type: 'STRING',
                    description: 'The text content of the artifact to be registered.'
                },
                mimeType: {
                    type: 'STRING',
                    description: 'Optional MIME type (default: text/plain).'
                },
                 metadata: {
                    type: 'OBJECT',
                    description: 'Optional JSON metadata associated with the artifact.'
                }
            },
            required: ['tag', 'id', 'content']
        }
    },
    {
        name: 'listSessionArtifacts',
        description: 'Lists all artifacts currently registered in this session.',
        parameters: { type: 'OBJECT', properties: {} } // No parameters needed
    },
    // Example of a tool that CONSUMES an artifact
    {
        name: 'summarizeArtifact',
        description: 'Summarizes the content of a registered artifact.',
        parameters: {
            type: 'OBJECT',
            properties: {
                artifactUri: {
                    type: 'STRING',
                    description: 'The URI of the artifact to summarize (e.g., context://summary#001).'
                }
            },
            required: ['artifactUri']
        }
    }
];

// Combine all function declarations
const allFunctionDeclarations = [
    ...existingFunctionDeclarations,
    ...artifactFunctionDeclarations
];


// --- Function Handlers ---
// We need access to the artifactManager for the session here.
// The handlers will now be closures or methods that have access to it.

const createFunctionHandlers = (artifactManager) => ({
    // --- Existing Handlers (potentially modified) ---
    searchExperiences: async ({ query, tags, limit }) => {
        // ... (no changes needed here likely) ...
         const options = { tags: tags || [], limit: limit || 10, offset: 0, sortBy: 'importance', sortOrder: 'desc' };
         const experiences = await memoryOperations.searchExperiences(query, options);
         return { experiences };
    },
    getExperienceById: async ({ id }) => {
         // ... (no changes needed here likely) ...
         const experience = await memoryOperations.getExperienceByExperienceId(id);
         if (!experience) return { error: `Experience with ID ${id} not found` };
         return { experience };
    },
    createExperience: async (params) => {
        // MODIFICATION EXAMPLE: Check if description or context are references
        let description = params.description;
        let context = params.context;

        if (ResourceReference.isReference(params.description) || ResourceReference.isUriString(params.description)) {
            console.log("Resolving description reference:", params.description);
            description = await artifactManager.resolveReferenceContent(params.description);
            if (description === null) return { error: `Could not resolve description artifact: ${params.description}` };
        }
        if (ResourceReference.isReference(params.context) || ResourceReference.isUriString(params.context)) {
            console.log("Resolving context reference:", params.context);
            context = await artifactManager.resolveReferenceContent(params.context);
             if (context === null) return { error: `Could not resolve context artifact: ${params.context}` };
        }

        const experienceData = { ...params, description, context };
        const experience = await memoryOperations.createExperience(experienceData);
        return { experience };
    },
    updateExperience: async ({ id, ...updateData }) => {
        // SIMILAR MODIFICATION needed if description/context can be updated via reference
         const experience = await memoryOperations.getExperienceByExperienceId(id);
         if (!experience) return { error: `Experience with ID ${id} not found` };

         // Resolve references if present in updateData
         if (updateData.description && (ResourceReference.isReference(updateData.description) || ResourceReference.isUriString(updateData.description))) {
             updateData.description = await artifactManager.resolveReferenceContent(updateData.description);
             if (updateData.description === null) return { error: `Could not resolve description artifact: ${updateData.description}` };
         }
         if (updateData.context && (ResourceReference.isReference(updateData.context) || ResourceReference.isUriString(updateData.context))) {
             updateData.context = await artifactManager.resolveReferenceContent(updateData.context);
             if (updateData.context === null) return { error: `Could not resolve context artifact: ${updateData.context}` };
         }

         const updatedExperience = await memoryOperations.updateExperience(experience.id, updateData);
         return { experience: updatedExperience };
    },
     // ... (other existing handlers like findRelatedExperiences, createRelation might not need changes unless they accept artifact URIs) ...
    findRelatedExperiences: async ({ id, relationType }) => {
        const experience = await memoryOperations.getExperienceByExperienceId(id);
        if (!experience) return { error: `Experience with ID ${id} not found` };
        const relatedExperiences = await memoryOperations.getRelatedExperiences(experience.id, relationType);
        return { relatedExperiences };
    },
    createRelation: async ({ sourceId, targetId, relationType, strength }) => {
        const sourceExperience = await memoryOperations.getExperienceByExperienceId(sourceId);
        const targetExperience = await memoryOperations.getExperienceByExperienceId(targetId);
        if (!sourceExperience) return { error: `Source experience with ID ${sourceId} not found` };
        if (!targetExperience) return { error: `Target experience with ID ${targetId} not found` };
        const relationId = await memoryOperations.createRelation(sourceExperience.id, targetExperience.id, relationType, strength || 1.0);
        return { relationId, message: `Relation created between ${sourceId} and ${targetId}` };
    },
    linkToConversation: async ({ experienceId, conversationId }) => {
        const experience = await memoryOperations.getExperienceByExperienceId(experienceId);
        if (!experience) return { error: `Experience with ID ${experienceId} not found` };
        const conversation = await dbOperations.getConversationWithMessages(conversationId);
        if (!conversation) return { error: `Conversation with ID ${conversationId} not found` };
        await memoryOperations.linkExperienceToConversation(experience.id, conversationId);
        return { message: `Experience ${experienceId} linked to conversation ${conversationId}` };
    },
    getConversationExperiences: async ({ conversationId }) => {
        const conversation = await dbOperations.getConversationWithMessages(conversationId);
        if (!conversation) return { error: `Conversation with ID ${conversationId} not found` };
        const experiences = await memoryOperations.getExperiencesForConversation(conversationId);
        return { experiences };
    },


    // --- NEW Handlers for Artifacts ---
    registerArtifact: async ({ tag, id, content, mimeType, metadata }) => {
        if (!artifactManager) return { error: "Artifact manager not available." };
        try {
            const reference = await artifactManager.registerArtifact(tag, id, mimeType, content, metadata);
            return { success: true, uri: reference.uri, message: `Artifact ${reference.uri} registered.` };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    listSessionArtifacts: async () => {
        if (!artifactManager) return { error: "Artifact manager not available." };
        try {
            const artifacts = await artifactManager.listSessionArtifacts();
            // Maybe return only URIs and metadata, not full content, to save tokens?
            const summary = artifacts.map(a => ({ uri: a.uri, tag: a.artifact_tag, id: a.artifact_id, created: a.created_at, metadata: a.metadata }));
            return { artifacts: summary };
        } catch (error) {
             return { success: false, error: error.message };
        }
    },

    summarizeArtifact: async ({ artifactUri }) => {
        if (!artifactManager) return { error: "Artifact manager not available." };
        try {
            const content = await artifactManager.resolveReferenceContent(artifactUri);
            if (content === null) {
                return { error: `Artifact ${artifactUri} not found in this session.` };
            }

            // Here, you would typically make *another* call to the LLM
            // to summarize the 'content'. For simplicity, we'll just return a snippet.
            const summary = content.substring(0, 100) + (content.length > 100 ? '...' : '');
            return { summary: summary, sourceUri: artifactUri };

            // Proper implementation:
            // const summaryResponse = await callLLMToSummarize(content);
            // return { summary: summaryResponse, sourceUri: artifactUri };

        } catch (error) {
             return { success: false, error: error.message };
        }
    }
});

// --- getMemoryChat function ---
// Stays mostly the same, but uses the combined function declarations
async function getMemoryChat(systemInstructions = '') {
    const modelName = process.env.GEMINI_MODEL || 'gemini-1.5-flash-latest'; // Use a model supporting tools well
    const safetySettings = [/* ... (same as before) ... */];
    const defaultInstructions = `
You are Gemini, an AI assistant with memory and artifact management capabilities.
Use your tools to manage long-term experiences and short-term session artifacts.
- Use 'createExperience', 'searchExperiences', etc. for persistent memory.
- Use 'registerArtifact' to save temporary results (summaries, drafts) within this session using tags and IDs (e.g., <summary id="001">...</summary>).
- Use 'listSessionArtifacts' to see temporary artifacts.
- Reference artifacts using their URI (context://tag#id) when calling other tools (like createExperience or summarizeArtifact) that might accept them as input.
`;
    const finalInstructions = systemInstructions ? `${defaultInstructions}\n\n${systemInstructions}` : defaultInstructions;
    const generationConfig = { /* ... (same as before) ... */ };

    const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig,
        safetySettings,
        tools: [{ functionDeclarations: allFunctionDeclarations }], // <-- Use combined declarations
    });

    const chat = model.startChat({
        systemInstruction: finalInstructions,
        history: [/* ... (same initial history) ... */],
    });
    return chat;
}


// --- sendMessageWithMemory function ---
// Now accepts artifactManager and uses handlers created with it
async function sendMessageWithMemory(chat, message, artifactManager) { // <-- Added artifactManager
  if (!artifactManager) {
      console.error("sendMessageWithMemory called without artifactManager!");
      // Handle this case - maybe throw an error or return an error message
      return { error: "Internal server error: Artifact manager not available." };
  }

  // Create handlers specific to this call, closing over the artifactManager
  const functionHandlers = createFunctionHandlers(artifactManager);

  try {
    const result = await chat.sendMessage(message);
    let response = result.response; // Use let as it might be reassigned after function call

    // Check for function calls - loop until no more function calls are returned
    while (response.functionCalls && response.functionCalls.length > 0) {
        const callsToExecute = response.functionCalls;
        console.log(`Executing ${callsToExecute.length} function calls...`);

        const functionResponses = [];

        for (const functionCall of callsToExecute) {
            const functionName = functionCall.name;
            // Use JSON.parse carefully
             let functionArgs = {};
             try {
                // The API returns 'args' directly as an object in recent versions.
                // Check if it's already an object. If it's a string, parse it.
                functionArgs = typeof functionCall.args === 'string'
                    ? JSON.parse(functionCall.args)
                    : functionCall.args;
            } catch (e) {
                console.error(`Failed to parse arguments for ${functionName}:`, functionCall.args, e);
                functionResponses.push({
                     functionResponse: {
                        name: functionName,
                        response: { error: `Failed to parse arguments: ${e.message}` }
                     }
                 });
                continue; // Skip to next function call
            }


            console.log(`Tool call: ${functionName}`, functionArgs);

            if (functionHandlers[functionName]) {
                try {
                    const functionResult = await functionHandlers[functionName](functionArgs);
                    functionResponses.push({
                        functionResponse: {
                            name: functionName,
                            response: functionResult,
                        }
                    });
                } catch (error) {
                    console.error(`Error executing function ${functionName}:`, error);
                    functionResponses.push({
                        functionResponse: {
                            name: functionName,
                            response: { error: `Error executing function: ${error.message}` }
                        }
                    });
                }
            } else {
                console.error(`Unknown function: ${functionName}`);
                 functionResponses.push({
                    functionResponse: {
                        name: functionName,
                        response: { error: `Unknown function called: ${functionName}` }
                    }
                });
            }
        }

        // Send all function responses back to the model
        const subsequentResult = await chat.sendMessage(functionResponses);
        response = subsequentResult.response; // Update response for the next loop iteration or final return
    }

    // Once loops are done, return the final text response
    return { text: response.text() }; // Return only the final text after all function calls resolved

  } catch (error) {
    // Handle potential errors during sendMessage or processing
     if (error.message.includes('SAFETY')) {
            console.error('Safety settings triggered response block:', error);
            return { error: 'Response blocked due to safety settings.', details: error.message };
        } else if (error.message.includes('RESOURCE_EXHAUSTED') || error.message.includes('quota')) {
             console.error('API quota error:', error);
            return { error: 'API quota exceeded. Please try again later.' };
        }
        console.error('Error sending message or processing response:', error);
        // Attempt to get history for debugging, if possible
        // const history = await chat.getHistory();
        // console.error("Chat History:", JSON.stringify(history, null, 2));
        return { error: `An error occurred: ${error.message}` }; // Provide a more generic error to the client
  }
}

// --- Other exports ---
module.exports = {
  getMemoryChat,
  sendMessageWithMemory,
  // Keep existing memory experience routes if needed, separate from artifacts
  createMemoryExperience: memoryOperations.createExperience,
  searchMemoryExperiences: memoryOperations.searchExperiences,
  // testMemoryChat // This needs rework as noted before
};
```

**Explanation and How it Addresses the RFC Concepts:**

1.  **Artifact Registration:** The `registerArtifact` tool allows the agent (instructed by the LLM) to explicitly save content. It creates a record in the `Artifacts` table, scoped by `session_id`, and generates the `context://` URI.
2.  **Resource Referencing:** The `ResourceReference` class provides a standard way to represent these URIs. Tools can check if input strings match the URI pattern or if an object is an instance of `ResourceReference`.
3.  **Resource Resolution:** `ArtifactManager.resolveReferenceContent` (or `resolveReference` for the full object) fetches the artifact from the database, scoped to the correct session.
4.  **Resource-Aware Tools:** The `createExperience` handler is modified to demonstrate how it can check if its `description` or `context` parameters are references. If so, it resolves them using the session's `artifactManager` before proceeding. The new `summarizeArtifact` tool explicitly *requires* an `artifactUri`.
5.  **Session Scoping:** The `ArtifactManager` is tied to a `sessionId`, and all database operations for artifacts are filtered by this ID, keeping artifacts private to the session.
6.  **Cleanup:** The `ArtifactManager.cleanupSessionArtifacts` method and the corresponding `/api/chat/session/:sessionId` DELETE endpoint allow for explicit cleanup when a session ends.

Now, when interacting with the Gemini chat via the API:

*   You can instruct the model: "Summarize the previous response and register it as an artifact with tag 'summary' and id 'v1'."
*   The model should call `registerArtifact(tag='summary', id='v1', content='...')`.
*   Later, you can say: "Create a new experience using the summary artifact 'context://summary#v1' as the description."
*   The model should call `createExperience(..., description='context://summary#v1', ...)`.
*   The `createExperience` handler will resolve `context://summary#v1` using the `ArtifactManager` for that session and use the retrieved content.