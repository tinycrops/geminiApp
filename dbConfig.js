import knex from 'knex';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: './.env.local' });

// SQLite database configuration
const db = knex({
  client: 'sqlite3',
  connection: {
    filename: path.join(__dirname, 'gemini_app.sqlite')
  },
  useNullAsDefault: true,
  pool: {
    afterCreate: (conn, done) => {
      // Enable foreign keys
      conn.run('PRAGMA foreign_keys = ON', done);
    }
  }
});

export default db; 