const express = require('express');
const cors = require('cors');
const db = require('./db');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors()); // Allow frontend to talk to backend
app.use(express.json()); // Allow backend to understand JSON data

// API Routes

// 1. GET /api/history
// Retrieve all game sessions from the database
app.get('/api/history', (req, res) => {
  const sql = 'SELECT * FROM sessions ORDER BY id DESC';
  db.all(sql, [], (err, rows) => {
    if (err) {
      res.status(400).json({ error: err.message });
      return;
    }
    
    // Parse the JSON strings back into objects before sending to frontend
    const history = rows.map(row => ({
      ...row,
      errors: JSON.parse(row.errors),
      missedWords: JSON.parse(row.missedWords)
    }));
    
    res.json({
      message: 'success',
      data: history
    });
  });
});

// 2. POST /api/history
// Save a new game session to the database
app.post('/api/history', (req, res) => {
  const { wpm, accuracy, date, errors, missedWords } = req.body;
  
  const sql = 'INSERT INTO sessions (wpm, accuracy, date, errors, missedWords) VALUES (?,?,?,?,?)';
  const params = [wpm, accuracy, date, JSON.stringify(errors), JSON.stringify(missedWords)];
  
  db.run(sql, params, function(err) {
    if (err) {
      res.status(400).json({ error: err.message });
      return;
    }
    
    res.json({
      message: 'success',
      data: { id: this.lastID }
    });
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
