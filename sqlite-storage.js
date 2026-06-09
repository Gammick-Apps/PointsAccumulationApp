const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

let appInstance;
let db;
let dbPath;
let initPromise;
const DB_FLAG_INCONSISTENT_ERROR_CODE = 'SQLITE_DB_FLAG_INCONSISTENT';

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
    dbPath = path.join(userDataPath, 'points-accumulation.sqlite');
    fs.mkdirSync(userDataPath, { recursive: true });

    //פותח בפועל את מסד הנתונים
    // ואז יוצר את הטבלאות על פי הסכמה רק בהפעלה הראשונה
    const flagPath = path.join(userDataPath, 'db_created.json');

    if (fs.existsSync(dbPath)) {
      db = await openDatabase(dbPath);
      return true;
    }

    if (fs.existsSync(flagPath)) {
      const inconsistentDbError = new Error('Database flag exists but the SQLite file is missing or inaccessible.');
      inconsistentDbError.code = DB_FLAG_INCONSISTENT_ERROR_CODE;
      throw inconsistentDbError;
    }

    fs.writeFileSync(flagPath, JSON.stringify({ dbCreated: true }),
      { encoding: 'utf8', flag: 'wx' });
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

//מתקשר עם המסד נתונים
//עבור קבלת נתונים כמערך
function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(rows);
    });
  });
}

//בונה מהנתונים שאילתה לבנות שדות במסד נתונים
function buildColumnSql(column) {
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
function buildFKSql(foreignKey) {
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


async function insertExcelToDB(tableName, payload) {
  await waitDB();
  const parsedPayload = JSON.parse(payload);
  const rows = Array.isArray(parsedPayload) ? parsedPayload : [];

  await run('BEGIN TRANSACTION;');
  try {
    await run(`DELETE FROM ${quoteIdentifier(tableName)};`);
    for (const row of rows) {
      switch (tableName) {
        case 'students':
          await run(
            'INSERT OR REPLACE INTO students (tz, code, grade, name, points, position) VALUES (?, ?, ?, ?, ?, ?);',
            [row.tz, row.code, row.grade, row.name, row.points, row.position]
          );
          break;
        case 'uniqTasks':
          await run(
            'INSERT OR REPLACE INTO uniqtasks (code, name, points, multiple, type, class, position) VALUES ( ?, ?, ?, ?, ?, ?, ?);',
            [row.code, row.name, row.points, row.multiple, row.type, row.class, row.position]
          );
          break;
        case 'products':
          await run(
            'INSERT OR REPLACE INTO products (code, name, points, multiple) VALUES (?, ?, ?, ?);',
            [row.code, row.name, row.points, row.multiple]
          );
          break;
        case 'parents':
          await run(
            'INSERT OR REPLACE INTO parents (tz, idStudent, text) VALUES (?, ?, ?);',
            [row.tz, row.idStudent, row.text]
          );
          break;
        default:
          throw new Error(`Unsupported table name for Excel import: ${tableName}`);
      }
    }
    await run('COMMIT;');
  } catch (error) {
    await run('ROLLBACK;');
    throw error;
  }
  return 1;
}

async function generateUniqueStudentTz() {
  while (true) {
    const tz = Math.floor(Math.random() * (399999999 - 200000000 + 1) + 200000000);
    const existingStudent = await get('SELECT 1 FROM students WHERE tz = ? LIMIT 1;', [tz]);
    if (!existingStudent) {
      return tz;
    }
  }
}

async function addStudents(student) {
  await waitDB();

  const tz = await generateUniqueStudentTz();
  const code = student && student.code !== undefined ? student.code : 0;
  const grade = student && student.grade !== undefined ? student.grade : '------';
  const name = student && student.name !== undefined ? student.name : '------';
  const points = student && student.points !== undefined ? student.points : 0;
  const position = student && student.position !== undefined ? student.position : '';

  await run('BEGIN TRANSACTION;');
  try {
    const result = await run(
      'INSERT INTO students (tz, code, grade, name, points, position) VALUES (?, ?, ?, ?, ?, ?);',
      [tz, code, grade, name, points, position]
    );
    await run('COMMIT;');
    return JSON.stringify({ ok: true, lastID: result.lastID, tz });
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
  const rows = await all(`SELECT * FROM ${quoteIdentifier(dataName)};`);
  return JSON.stringify(rows);
}

async function readSystem(dataName) {
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
  readSystem,
  readData,
  closeDatabase,
  insertExcelToDB,
  addStudents,
  DB_FLAG_INCONSISTENT_ERROR_CODE
};
