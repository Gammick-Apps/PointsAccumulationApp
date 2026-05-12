const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js/dist/sql-asm.js');

async function main() {
  const SQL = await initSqlJs();
  const dbPath = path.join(process.cwd(), 'smoke-test.sqlite');

  let db;
  if (fs.existsSync(dbPath)) {
    const data = fs.readFileSync(dbPath);
    db = new SQL.Database(new Uint8Array(data));
  } else {
    db = new SQL.Database();
  }

  db.run('CREATE TABLE IF NOT EXISTS demo_people (id INTEGER PRIMARY KEY, full_name TEXT NOT NULL);');
  db.run('DELETE FROM demo_people;');
  db.run("INSERT INTO demo_people (id, full_name) VALUES (1, 'Noa Levi'), (2, 'Dan Cohen');");

  const tableCheck = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='demo_people';");
  const rowCheck = db.exec('SELECT id, full_name FROM demo_people ORDER BY id;');

  fs.writeFileSync(dbPath, Buffer.from(db.export()));

  console.log('SQLite smoke test DB file:', dbPath);
  console.log('Table exists:', tableCheck.length > 0);
  console.log('Rows:', JSON.stringify(rowCheck[0]?.values || [], null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
