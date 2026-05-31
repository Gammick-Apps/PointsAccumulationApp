const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

let appInstance;
let db;
let dbPath;
let initPromise;

function quoteIdentifier(identifier) {
  return `"${String(identifier).replace(/"/g, '""')}"`;
}


async function initDatabase(electronApp) {

  // פונקציה ליצירת מסד הנתונים
  initPromise = (async () => {
    const openDatabase = (filePath) => new Promise((resolve, reject) => {
      const connection = new sqlite3.Database(filePath, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(connection);
      });
    });

    //שומר את המסד נתונים בתיקיה 
    const userDataPath = electronApp.getPath('userData');    
    dbPath= path.join(userDataPath, 'points-accumulation.sqlite')
    fs.mkdirSync(userDataPath, { recursive: true });

    //פותח בפועל את מסד הנתונים
   // ואז יוצר את הטבלאות על פי הסכמה
    db = await openDatabase(dbPath);
    await createSchema();
    console.log('SQLite backend active: sqlite3');
    return true;

  })().catch((error) => {
    initPromise = undefined;
    throw error;
  });

  await initPromise;
  return true;
}

//בודק שנוצר מסד נתונים
//לפני שניגש אליו מהקוד
async function waitDB() {
  if (db) return true;
  if (initPromise) await initPromise;
  if (!db) throw new Error('Database not available');
  return true;
}

// מתקשר עם המסד נתונים
//לבצע שם שינויים
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) {
        reject(error);
        return;
      }
      resolve(this);
    });
  });
}

//מתקשר עם המסד נתונים
//עבור קבלת נתונים 
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(row);
    });
  });
}

//בונה מהנתונים שאילתה לבנות שדות במסד נתונים
function buildColumnSql (column) {
    const parts = [quoteIdentifier(column.name), String(column.type || 'TEXT')];
    if (column.primaryKey) {
      parts.push('PRIMARY KEY');
    }
    if (column.nullable === false) {
      parts.push('NOT NULL');
    }
    if (Object.prototype.hasOwnProperty.call(column, 'default')) {
      parts.push(`DEFAULT ${column.default}`);
    }
    return parts.join(' ');
  };

  //בונה מהנתונים שאילתה לבנות מפתחות זרים במסד נתונים
   function buildFKSql (foreignKey) {
    const localColumns = foreignKey.columns.map(quoteIdentifier).join(', ');
    const referenceColumns = foreignKey.referencesColumns.map(quoteIdentifier).join(', ');
    const referenceTable = quoteIdentifier(foreignKey.referencesTable);
    return `FOREIGN KEY (${localColumns}) REFERENCES ${referenceTable} (${referenceColumns})`;
  };

async function createSchema() {
  const schemaPath = path.join(__dirname, 'schema.json');
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  const tables = schema.tables;

  await run('PRAGMA foreign_keys = ON;');
  await run('BEGIN TRANSACTION;');

  try {
    for (const table of tables) {
      const columns = table.columns;
      const foreignKeys = table.foreignKeys || [];

      const columnSql = columns.map(buildColumnSql);
      const foreignKeySql = foreignKeys.map(buildFKSql);
      const definitions = [...columnSql, ...foreignKeySql].join(',\n      ');

      const createTableSql = `
        CREATE TABLE IF NOT EXISTS ${quoteIdentifier(table.name)} (
          ${definitions}
        );
      `;
      await run(createTableSql);
    }

    await run('INSERT OR IGNORE INTO "systemConfig" ("id") VALUES (1);');
    
    await run('COMMIT;');
  } catch (error) {
    await run('ROLLBACK;');
    throw error;
  }
}



async function writeSystem(payload) {
  await waitDB();
  const config = JSON.parse(payload) || {};
  await run('BEGIN TRANSACTION;');
  try {
    await run(`INSERT OR REPLACE INTO systemConfig (id, device, color, textColor, date, numPosition, type, hasPrint, hasBuy, hasParents, hasTests, buy, timer) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [1, config.device, config.color, config.textColor, config.date, config.numPosition, config.type, config.hasPrint, config.hasBuy, config.hasParents, config.hasTests, config.buy, config.timer]);
    await run('COMMIT;');
  } catch (error) {
    await run('ROLLBACK;');
    throw error;
  }
  return 1;
}

async function readData(dataName) {
  await waitDB();
  const row = await get('SELECT * FROM systemConfig WHERE id = 1 LIMIT 1;');
  return JSON.stringify((({ id, ...response }) => response)(row || {}));
}

function closeDatabase() {
  if (!db) {
    return;
  }
  db.close();
  db = undefined;
  dbPath = undefined;
  initPromise = undefined;
}

module.exports = {
  initDatabase,
  waitDB,
  writeSystem,
  readData,
  closeDatabase
};
