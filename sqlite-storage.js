const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

let appInstance;
let db;
let dbPath;
let initPromise;


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

async function createSchema() {
  const schemaFilePath = path.join(__dirname, 'schema.json');
  const parsedSchema = JSON.parse(fs.readFileSync(schemaFilePath, 'utf8'));
  const tables = Array.isArray(parsedSchema.tables) ? parsedSchema.tables : [];

  if (tables.length === 0) {
    throw new Error('schema.json must include a non-empty tables array');
  }

  const quoteIdentifier = (identifier) => `"${String(identifier).replace(/"/g, '""')}"`;

  const buildColumnSql = (column) => {
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

  const buildForeignKeySql = (foreignKey) => {
    const localColumns = (foreignKey.columns || []).map(quoteIdentifier).join(', ');
    const referenceColumns = (foreignKey.referencesColumns || []).map(quoteIdentifier).join(', ');
    const referenceTable = quoteIdentifier(foreignKey.referencesTable);
    return `FOREIGN KEY (${localColumns}) REFERENCES ${referenceTable} (${referenceColumns})`;
  };

  const ensureSystemConfigRow = async () => {
    const systemConfigTable = tables.find((table) => table && table.name === 'systemConfig');
    if (!systemConfigTable || !Array.isArray(systemConfigTable.columns) || systemConfigTable.columns.length === 0) {
      return;
    }

    const countRow = await get('SELECT COUNT(1) AS count FROM "systemConfig";');
    if (Number(countRow?.count || 0) > 0) {
      return;
    }

    await run('INSERT INTO "systemConfig" ("id") VALUES (1);');
  };

  await run('PRAGMA foreign_keys = ON;');
  await run('BEGIN TRANSACTION;');

  try {
    for (const table of tables) {
      const columns = Array.isArray(table.columns) ? table.columns : [];
      if (!table.name || columns.length === 0) {
        continue;
      }

      const columnSql = columns.map(buildColumnSql);
      const foreignKeys = Array.isArray(table.foreignKeys) ? table.foreignKeys : [];
      const foreignKeySql = foreignKeys.map(buildForeignKeySql);
      const definitions = [...columnSql, ...foreignKeySql].join(',\n      ');

      const sql = `
        CREATE TABLE IF NOT EXISTS ${quoteIdentifier(table.name)} (
          ${definitions}
        );
      `;

      await run(sql);
    }

    await ensureSystemConfigRow();
    await run('COMMIT;');
  } catch (error) {
    await run('ROLLBACK;');
    throw error;
  }
}



async function writeData(datasetName, payload) {
  await waitDB();
  if (datasetName !== 'systemConfig') return 0;
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

async function readData(datasetName) {
  await waitDB();
  if (datasetName !== 'systemConfig') {
    return '[]';
  }
  const row = await get('SELECT * FROM systemConfig WHERE id = 1 LIMIT 1;');
  return JSON.stringify(row || {});
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
  writeData,
  readData,
  closeDatabase
};
