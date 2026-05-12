const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'test.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ SQLite3 Error:', err);
    process.exit(1);
  }
  console.log('✅ SQLite3 loaded successfully in Node.js');
  db.run('CREATE TABLE IF NOT EXISTS test (id INTEGER PRIMARY KEY, msg TEXT)', (err) => {
    if (err) {
      console.error('❌ Table creation failed:', err);
    } else {
      console.log('✅ Table created successfully');
    }
    db.close();
  });
});
