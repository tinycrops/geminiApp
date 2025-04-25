const db = require('./dbConfig');

// Database operations class
class DbOperations {
  // Get all users
  async getUsers() {
    try {
      return await db('Users').select('*');
    } catch (error) {
      console.error('Error getting users:', error);
      throw error;
    }
  }

  // Get user by id
  async getUserById(id) {
    try {
      return await db('Users').where({ id }).first();
    } catch (error) {
      console.error(`Error getting user with id ${id}:`, error);
      throw error;
    }
  }

  // Create a new user
  async createUser(username, email, password) {
    try {
      const [id] = await db('Users').insert({
        username,
        email,
        password
      });
      return id;
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  }

  // Create a new conversation
  async createConversation(userId, title) {
    try {
      const [id] = await db('Conversations').insert({
        user_id: userId,
        title
      });
      return id;
    } catch (error) {
      console.error('Error creating conversation:', error);
      throw error;
    }
  }

  // Add message to conversation
  async addMessage(conversationId, content, role) {
    try {
      const [id] = await db('Messages').insert({
        conversation_id: conversationId,
        content,
        role
      });
      return id;
    } catch (error) {
      console.error('Error adding message:', error);
      throw error;
    }
  }

  // Get conversation with messages
  async getConversationWithMessages(conversationId) {
    try {
      // Get conversation details
      const conversation = await db('Conversations as c')
        .join('Users as u', 'c.user_id', 'u.id')
        .where('c.id', conversationId)
        .select(
          'c.id',
          'c.title',
          'c.created_at',
          'c.updated_at',
          'c.user_id',
          'u.username'
        )
        .first();
      
      if (!conversation) {
        return null;
      }
      
      // Get messages for this conversation
      const messages = await db('Messages')
        .where('conversation_id', conversationId)
        .orderBy('created_at', 'asc')
        .select('*');
      
      conversation.messages = messages;
      
      return conversation;
    } catch (error) {
      console.error(`Error getting conversation with id ${conversationId}:`, error);
      throw error;
    }
  }
}

module.exports = new DbOperations(); 