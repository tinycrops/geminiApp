# Gemini App with SQLite Database

This project includes a local SQLite database setup for the Gemini App.

## Prerequisites

1. Node.js and npm installed

## Setup Instructions

1. Install dependencies
   ```
   npm install
   ```

2. Set up the database
   ```
   npm run setup-db
   ```

3. Test the database
   ```
   npm run test-db
   ```

## Database Structure

The database includes the following tables:

- **Users**: Stores user information
- **Conversations**: Stores conversation metadata
- **Messages**: Stores individual messages within conversations

## Database File

The SQLite database is stored in the file `gemini_app.sqlite` in the project root directory. This file will be created automatically when you run the setup script.

## Usage

Import the dbOperations.js module in your application to interact with the database:

```javascript
const db = require('./dbOperations');

// Example: Create a new user
const userId = await db.createUser('username', 'email@example.com', 'password');

// Example: Create a conversation
const conversationId = await db.createConversation(userId, 'Conversation Title');

// Example: Add a message
await db.addMessage(conversationId, 'Hello, world!', 'user');
```

## Advantages of SQLite

- **No Setup Required**: No need to install a separate database server
- **Zero Configuration**: Works out of the box with no configuration
- **Cross-Platform**: Works on all platforms
- **Portable**: The entire database is stored in a single file
- **Lightweight**: Small footprint, perfect for development
- **Reliable**: ACID compliant

## Troubleshooting

1. **File permissions issues**:
   - Ensure your application has write permissions to the directory where the SQLite file is stored

2. **"Database is locked" errors**:
   - This usually happens if multiple processes are trying to write to the database at the same time
   - Make sure to close database connections when they're no longer needed

3. **Performance issues**:
   - SQLite works best for low to medium traffic applications
   - For high traffic or large datasets, consider migrating to a dedicated database server 