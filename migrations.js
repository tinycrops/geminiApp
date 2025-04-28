import * as dbModule from './dbConfig.js';
const db = dbModule.default || dbModule;

async function createStreamTables() {
  try {
    console.log('Setting up Stream tables...');
    
    // Check if Streams table exists
    const streamsTableExists = await db.schema.hasTable('Streams');
    
    if (!streamsTableExists) {
      console.log('Creating Streams table...');
      await db.schema.createTable('Streams', table => {
        table.increments('id').primary();
        table.string('stream_id').notNullable().unique();
        table.string('user_id').notNullable().index();
        table.timestamp('start_ts').notNullable();
        table.timestamp('last_active_ts').notNullable();
        table.string('status').notNullable().defaultTo('active');
      });
    }
    
    // Check if Episodes table exists
    const episodesTableExists = await db.schema.hasTable('Episodes');
    
    if (!episodesTableExists) {
      console.log('Creating Episodes table...');
      await db.schema.createTable('Episodes', table => {
        table.increments('id').primary();
        table.string('episode_id').notNullable().unique();
        table.string('stream_id').notNullable();
        table.timestamp('start_ts').notNullable();
        table.timestamp('end_ts').nullable();
        table.float('salience_score').defaultTo(0);
        table.json('metadata').nullable();
        table.foreign('stream_id').references('stream_id').inTable('Streams').onDelete('CASCADE');
      });
    }
    
    // Check if EpisodesBuffer table exists
    const episodesBufferTableExists = await db.schema.hasTable('EpisodesBuffer');
    
    if (!episodesBufferTableExists) {
      console.log('Creating EpisodesBuffer table...');
      await db.schema.createTable('EpisodesBuffer', table => {
        table.increments('id').primary();
        table.string('stream_id').notNullable();
        table.string('episode_id').notNullable();
        table.string('role').notNullable();
        table.text('content').notNullable();
        table.timestamp('ts').notNullable();
        table.boolean('processed').defaultTo(false);
        table.foreign('stream_id').references('stream_id').inTable('Streams').onDelete('CASCADE');
        table.foreign('episode_id').references('episode_id').inTable('Episodes').onDelete('CASCADE');
      });
    }
    
    // Add additional columns to Experiences table for salience if table exists
    const experiencesTableExists = await db.schema.hasTable('Experiences');
    
    if (experiencesTableExists) {
      // Check if the column already exists
      const hasEpisodeIdColumn = await db.schema.hasColumn('Experiences', 'episode_id');
      const hasSalienceColumn = await db.schema.hasColumn('Experiences', 'salience_score');
      const hasTypeColumn = await db.schema.hasColumn('Experiences', 'type');
      
      // Add columns if they don't exist
      if (!hasEpisodeIdColumn) {
        console.log('Adding episode_id column to Experiences table...');
        await db.schema.table('Experiences', table => {
          table.string('episode_id').nullable();
        });
      }
      
      if (!hasSalienceColumn) {
        console.log('Adding salience_score column to Experiences table...');
        await db.schema.table('Experiences', table => {
          table.float('salience_score').defaultTo(0);
        });
      }
      
      if (!hasTypeColumn) {
        console.log('Adding type column to Experiences table...');
        await db.schema.table('Experiences', table => {
          table.string('type').defaultTo('raw');
        });
      }
    }
    
    // Check if ToolObservations table exists
    const toolObservationsTableExists = await db.schema.hasTable('ToolObservations');
    
    if (!toolObservationsTableExists) {
      console.log('Creating ToolObservations table...');
      await db.schema.createTable('ToolObservations', table => {
        table.increments('id').primary();
        table.string('stream_id').notNullable();
        table.string('episode_id').notNullable();
        table.string('tool').notNullable();
        table.json('args').notNullable();
        table.json('result').nullable();
        table.text('error').nullable();
        table.timestamp('ts').notNullable();
        table.foreign('stream_id').references('stream_id').inTable('Streams').onDelete('CASCADE');
        table.foreign('episode_id').references('episode_id').inTable('Episodes').onDelete('CASCADE');
      });
    }
    
    // Check if Rewards table exists
    const rewardsTableExists = await db.schema.hasTable('Rewards');
    
    if (!rewardsTableExists) {
      console.log('Creating Rewards table...');
      await db.schema.createTable('Rewards', table => {
        table.increments('id').primary();
        table.string('stream_id').notNullable();
        table.string('source').notNullable();  // 'intrinsic', 'extrinsic', 'human'
        table.string('signal').notNullable();  // 'novelty', 'success', 'thumbs_up', etc.
        table.float('value').notNullable();
        table.timestamp('ts').notNullable();
        table.foreign('stream_id').references('stream_id').inTable('Streams').onDelete('CASCADE');
      });
    }
    
    console.log('Stream tables setup completed successfully!');
    return true;
  } catch (err) {
    console.error('Error setting up Stream tables:', err);
    return false;
  }
}

async function rollbackStreamTables() {
  try {
    console.log('Rolling back Stream tables...');
    
    // Drop tables in reverse order to avoid foreign key constraints
    if (await db.schema.hasTable('Rewards')) {
      await db.schema.dropTable('Rewards');
    }
    
    if (await db.schema.hasTable('ToolObservations')) {
      await db.schema.dropTable('ToolObservations');
    }
    
    if (await db.schema.hasTable('EpisodesBuffer')) {
      await db.schema.dropTable('EpisodesBuffer');
    }
    
    if (await db.schema.hasTable('Episodes')) {
      await db.schema.dropTable('Episodes');
    }
    
    if (await db.schema.hasTable('Streams')) {
      await db.schema.dropTable('Streams');
    }
    
    // Remove added columns from Experiences table
    if (await db.schema.hasTable('Experiences')) {
      const hasEpisodeIdColumn = await db.schema.hasColumn('Experiences', 'episode_id');
      const hasSalienceColumn = await db.schema.hasColumn('Experiences', 'salience_score');
      const hasTypeColumn = await db.schema.hasColumn('Experiences', 'type');
      
      if (hasEpisodeIdColumn || hasSalienceColumn || hasTypeColumn) {
        await db.schema.table('Experiences', table => {
          if (hasEpisodeIdColumn) table.dropColumn('episode_id');
          if (hasSalienceColumn) table.dropColumn('salience_score');
          if (hasTypeColumn) table.dropColumn('type');
        });
      }
    }
    
    console.log('Stream tables rollback completed successfully!');
    return true;
  } catch (err) {
    console.error('Error rolling back Stream tables:', err);
    return false;
  }
}

// If run directly
if (import.meta.url === import.meta.main) {
  createStreamTables()
    .then(success => {
      if (success) {
        console.log('Migration completed successfully');
        process.exit(0);
      } else {
        console.error('Migration failed');
        process.exit(1);
      }
    })
    .catch(err => {
      console.error('Migration error:', err);
      process.exit(1);
    });
}

export { createStreamTables, rollbackStreamTables }; 