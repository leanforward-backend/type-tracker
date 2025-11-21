const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// 1. Determine where to save the database file.
// We'll save it in the same folder as this script, named 'type-racer.db'.
const dbPath = path.resolve(__dirname, 'type-racer.db');

// 2. Open the database connection.
// If the file doesn't exist, SQLite will create it automatically.
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Could not connect to database', err);
  } else {
    console.log('Connected to SQLite database');
  }
});

// 3. Initialize the database structure.
// We run a SQL command to create the 'sessions' table if it's not already there.
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wpm INTEGER,
      accuracy INTEGER,
      date TEXT,
      errors TEXT,
      missedWords TEXT
    )
  `, (err) => {
    if (err) {
      console.error('Error creating table:', err);
    } else {
      console.log('Sessions table ready');
    }
  });
});

// 4. Export the database connection so our server can use it.
module.exports = db;
