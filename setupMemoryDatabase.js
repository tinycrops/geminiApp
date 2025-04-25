const db = require('./dbConfig');

// Function to create the memory tables
async function setupMemoryDatabase() {
  try {
    console.log('Setting up memory database tables...');
    
    // Check if Experiences table exists
    const experiencesTableExists = await db.schema.hasTable('Experiences');
    
    if (!experiencesTableExists) {
      console.log('Creating Experiences table...');
      await db.schema.createTable('Experiences', table => {
        table.increments('id').primary();
        table.string('experience_id', 100).notNullable().unique(); // Unique ID for the experience
        table.string('title', 255).notNullable();
        table.text('description').notNullable();
        table.text('context').nullable(); // Additional context about the experience
        table.integer('importance').defaultTo(1); // 1-10 scale of importance
        table.text('metadata').nullable(); // JSON string for additional metadata
        table.timestamp('created_at').defaultTo(db.fn.now());
        table.timestamp('updated_at').defaultTo(db.fn.now());
      });
    }
    
    // Check if ExperienceTags table exists
    const experienceTagsTableExists = await db.schema.hasTable('ExperienceTags');
    
    if (!experienceTagsTableExists) {
      console.log('Creating ExperienceTags table...');
      await db.schema.createTable('ExperienceTags', table => {
        table.increments('id').primary();
        table.integer('experience_id').notNullable();
        table.string('tag', 100).notNullable();
        table.foreign('experience_id').references('id').inTable('Experiences').onDelete('CASCADE');
        table.unique(['experience_id', 'tag']); // Prevent duplicate tags for the same experience
      });
    }
    
    // Check if ExperienceRelations table exists for connecting related experiences
    const experienceRelationsTableExists = await db.schema.hasTable('ExperienceRelations');
    
    if (!experienceRelationsTableExists) {
      console.log('Creating ExperienceRelations table...');
      await db.schema.createTable('ExperienceRelations', table => {
        table.increments('id').primary();
        table.integer('source_id').notNullable();
        table.integer('target_id').notNullable();
        table.string('relation_type', 100).notNullable(); // e.g., "similar", "contradicts", "builds_upon"
        table.float('strength').defaultTo(1.0); // 0-1 scale of relation strength
        table.foreign('source_id').references('id').inTable('Experiences').onDelete('CASCADE');
        table.foreign('target_id').references('id').inTable('Experiences').onDelete('CASCADE');
        table.unique(['source_id', 'target_id', 'relation_type']); // Prevent duplicate relations
      });
    }
    
    // Check if Conversations link table exists
    const memoryConversationsTableExists = await db.schema.hasTable('MemoryConversations');
    
    if (!memoryConversationsTableExists) {
      console.log('Creating MemoryConversations link table...');
      await db.schema.createTable('MemoryConversations', table => {
        table.increments('id').primary();
        table.integer('experience_id').notNullable();
        table.integer('conversation_id').notNullable();
        table.foreign('experience_id').references('id').inTable('Experiences').onDelete('CASCADE');
        table.foreign('conversation_id').references('id').inTable('Conversations').onDelete('CASCADE');
        table.unique(['experience_id', 'conversation_id']); // Prevent duplicates
      });
    }
    
    // Insert some sample experiences
    const experienceCount = await db('Experiences').count('id as count').first();
    
    if (experienceCount.count === 0) {
      console.log('Adding sample experiences...');
      
      // Add first experience
      const [experience1Id] = await db('Experiences').insert({
        experience_id: 'exp_001',
        title: 'First conversation with user',
        description: 'The user asked about setting up a database, and I helped them set up a SQLite database.',
        context: 'The user wanted a simple database setup for their application.',
        importance: 7,
        metadata: JSON.stringify({
          user_satisfaction: 'high',
          complexity: 'medium',
          duration_minutes: 10
        })
      });
      
      // Add tags for first experience
      await db('ExperienceTags').insert([
        { experience_id: experience1Id, tag: 'database' },
        { experience_id: experience1Id, tag: 'sqlite' },
        { experience_id: experience1Id, tag: 'setup' }
      ]);
      
      // Add second experience
      const [experience2Id] = await db('Experiences').insert({
        experience_id: 'exp_002',
        title: 'Helped with Node.js error',
        description: 'The user was having trouble with Node.js module imports, and I helped debug the issue.',
        context: 'User was getting "Cannot find module" errors in their Node.js application.',
        importance: 5,
        metadata: JSON.stringify({
          user_satisfaction: 'high',
          complexity: 'low',
          duration_minutes: 5
        })
      });
      
      // Add tags for second experience
      await db('ExperienceTags').insert([
        { experience_id: experience2Id, tag: 'nodejs' },
        { experience_id: experience2Id, tag: 'debugging' },
        { experience_id: experience2Id, tag: 'imports' }
      ]);
      
      // Create relation between experiences
      await db('ExperienceRelations').insert({
        source_id: experience1Id,
        target_id: experience2Id,
        relation_type: 'related',
        strength: 0.6
      });
    }
    
    console.log('Memory database setup completed successfully!');
  } catch (err) {
    console.error('Error setting up memory database:', err);
  }
}

// Run the setup
setupMemoryDatabase(); 