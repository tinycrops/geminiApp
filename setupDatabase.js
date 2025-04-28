import db from './dbConfig.js';

// Function to create the database tables
async function setupDatabase() {
  try {
    console.log('Setting up database...');
    
    // Check if Users table exists
    const userTableExists = await db.schema.hasTable('Users');
    
    if (!userTableExists) {
      console.log('Creating Users table...');
      await db.schema.createTable('Users', table => {
        table.increments('id').primary();
        table.string('username', 100).notNullable();
        table.string('email', 100).notNullable().unique();
        table.string('password', 100).notNullable();
        table.timestamp('created_at').defaultTo(db.fn.now());
      });
    }
    
    // Check if Conversations table exists
    const conversationsTableExists = await db.schema.hasTable('Conversations');
    
    if (!conversationsTableExists) {
      console.log('Creating Conversations table...');
      await db.schema.createTable('Conversations', table => {
        table.increments('id').primary();
        table.integer('user_id').notNullable();
        table.string('title', 200).notNullable();
        table.timestamp('created_at').defaultTo(db.fn.now());
        table.timestamp('updated_at').defaultTo(db.fn.now());
        table.foreign('user_id').references('id').inTable('Users');
      });
    }
    
    // Check if Messages table exists
    const messagesTableExists = await db.schema.hasTable('Messages');
    
    if (!messagesTableExists) {
      console.log('Creating Messages table...');
      await db.schema.createTable('Messages', table => {
        table.increments('id').primary();
        table.integer('conversation_id').notNullable();
        table.text('content').notNullable();
        table.string('role', 50).notNullable();
        table.timestamp('created_at').defaultTo(db.fn.now());
        table.foreign('conversation_id').references('id').inTable('Conversations');
      });
    }
    
    // Check if test user exists
    const testUser = await db('Users').where('email', 'test@example.com').first();
    
    if (!testUser) {
      console.log('Creating test user...');
      await db('Users').insert({
        username: 'Test User',
        email: 'test@example.com',
        password: 'password123'
      });
    }
    
    console.log('Database setup completed successfully!');
  } catch (err) {
    console.error('Error setting up database:', err);
  }
}

// Run the setup
setupDatabase(); 