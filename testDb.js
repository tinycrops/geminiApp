const dbOperations = require('./dbOperations');
const db = require('./dbConfig');

// Test database operations
async function testDatabase() {
  try {
    console.log('Testing database operations...');
    
    // Get all users
    const users = await dbOperations.getUsers();
    console.log('Users:', users);
    
    // Get the first user
    if (users.length > 0) {
      const firstUser = users[0];
      console.log('First user ID:', firstUser.id);
      
      // Create a test conversation
      const conversationId = await dbOperations.createConversation(
        firstUser.id, 
        'Test Conversation ' + new Date().toISOString()
      );
      console.log('Created conversation with ID:', conversationId);
      
      // Add messages to the conversation
      const message1Id = await dbOperations.addMessage(conversationId, 'Hello, how can I help you?', 'assistant');
      console.log('Added message 1 with ID:', message1Id);
      
      const message2Id = await dbOperations.addMessage(conversationId, 'I need help with setting up a database', 'user');
      console.log('Added message 2 with ID:', message2Id);
      
      const message3Id = await dbOperations.addMessage(conversationId, 'I can help with that! Let\'s start by discussing your requirements.', 'assistant');
      console.log('Added message 3 with ID:', message3Id);
      
      // Get the conversation with messages
      const conversation = await dbOperations.getConversationWithMessages(conversationId);
      console.log('Conversation with messages:', JSON.stringify(conversation, null, 2));
    } else {
      // Create a new user if no users exist
      const userId = await dbOperations.createUser('New Test User', 'newtest@example.com', 'password123');
      console.log('Created new user with ID:', userId);
    }
    
    console.log('Database tests completed successfully!');
  } catch (error) {
    console.error('Error testing database:', error);
  } finally {
    // Close the database connection
    db.destroy();
  }
}

// Run the test
testDatabase(); 