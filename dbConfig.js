const knex = require('knex');
const path = require('path');
require('dotenv').config({ path: './.env.local' });

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

module.exports = db; 