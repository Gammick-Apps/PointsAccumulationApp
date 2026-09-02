const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

let db;
let dbPath;
let initPromise;
const DB_FLAG_INCONSISTENT_ERROR_CODE = 'SQLITE_DB_FLAG_INCONSISTENT';
const TOP_STUDENTS_LIMIT = 6;

// -------------- basic functions ---------------- //

function quoteIdentifier(identifier) {
  return `"${String(identifier).replace(/"/g, '""')}"`;
}

function normalizeCodeValue(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
}

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


// -------------- create database ---------------- //

async function initDatabase(electronApp) {

  // function to create the DB
  initPromise = (async () => {
    const openDatabase = (filePath) => new Promise((resolve, reject) => {
      const connection = new sqlite3.Database(filePath, (error) => {
        if (error) {
          reject(error);
          return;
        }
        connection.configure('busyTimeout', 5000);
        connection.serialize();
        resolve(connection);
      });
    });

    // save the DB in folder   
    const userDataPath = electronApp.getPath('userData');
    dbPath = path.join(userDataPath, 'GammickDB.sqlite');
    fs.mkdirSync(userDataPath, { recursive: true });

    //open the DB 
    // then create the tables according to the schema
    const flagPath = path.join(userDataPath, 'db_created.json');

    if (fs.existsSync(dbPath)) {
      db = await openDatabase(dbPath);
      await createSchema();
      return true;
    }

    if (fs.existsSync(flagPath)) {
      const inconsistentDbError = new Error('Database flag exists but the SQLite file is missing or inaccessible.');
      inconsistentDbError.code = DB_FLAG_INCONSISTENT_ERROR_CODE;
      throw inconsistentDbError;
    }

    try {
      db = await openDatabase(dbPath);
      await createSchema();
      fs.writeFileSync(flagPath, JSON.stringify({ dbCreated: true }),
        { encoding: 'utf8', flag: 'wx' });
    } catch (error) {
      closeDatabase();
      if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
      }
      throw error;
    }
    console.log('SQLite backend active: sqlite3');
    return true;

  })().catch((error) => {
    initPromise = undefined;
    throw error;
  });

  await initPromise;
  return true;
}

// check if DB exists
async function waitDB() {
  if (db) return true;
  if (initPromise) await initPromise;
  if (!db) throw new Error('Database not available');
  return true;
}

//build SQL query for build the columns 
function buildColumnSql(column) {
  const parts = [quoteIdentifier(column.name), String(column.type || 'TEXT')];
  if (column.primaryKey) {
    parts.push('PRIMARY KEY');
  }
  if (column.unique) {
    parts.push('UNIQUE');
  }
  if (column.nullable === false) {
    parts.push('NOT NULL');
  }
  if (Object.prototype.hasOwnProperty.call(column, 'default')) {
    parts.push(`DEFAULT ${column.default}`);
  }
  return parts.join(' ');
};

//build SQL query for build the foreign keys
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

function closeDatabase() {
  if (!db) {
    return;
  }
  db.close();
  db = undefined;
  dbPath = undefined;
  initPromise = undefined;
}

// -------------- system ---------------- //

async function updateSystem(payload) {
  await waitDB();
  const config = payload || {};
  try {
    await run(`INSERT OR REPLACE INTO systemConfig (id, device, color, textColor, date, numPosition, type, hasPrint, hasBuy, hasParents, hasTests, buy, timer) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [1, config.device, config.color, config.textColor, config.date, config.numPosition, config.type, config.hasPrint, config.hasBuy, config.hasParents, config.hasTests, config.buy, config.timer]);
  } catch (error) {
    throw error;
  }
  return true;
}

async function readSystem() {
  await waitDB();
  const row = await get('SELECT * FROM systemConfig WHERE id = 1 LIMIT 1;') || {};
  const { id, ...data } = row;
  return data;
}

// -------------- general ---------------- //

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
            'INSERT OR REPLACE INTO students (tz, code, grade, name, points, tzParent, text) VALUES (?, ?, ?, ?, ?, ?, ?);',
            [row.tz, row.code, row.grade, row.name, row.points, row.tzParent, row.text]
          );
          break;
        case 'tasks':
          await run(
            'INSERT OR REPLACE INTO tasks (code, name, description, points, multiple, type, class, show) VALUES ( ?, ?, ?, ?, ?, ?, ?, ?);',
            [row.code, row.name, row.description, row.points, row.multiple, row.type, row.class, row.show]
          );
          break;
        case 'products':
          await run(
            'INSERT OR REPLACE INTO products (code, name, points, multiple, show) VALUES (?, ?, ?, ?, ?);',
            [row.code, row.name, row.points, row.multiple, row.show]
          );
          break;
        case 'questions':
          await run(
            'INSERT OR REPLACE INTO questions (question, answers, videos) VALUES (?, ?, ?);',
            [row.question, row.answers, row.videos]
          );
          break;
        case 'tests':
          await run(
            'INSERT OR REPLACE INTO tests (code, question, answer1, answer2, answer3, correct) VALUES (?, ?, ?, ?, ?, ?);',
            [row.code, row.question, row.answer1, row.answer2, row.answer3, row.correct]
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
  return true;
}

async function readData(tableName) {
  await waitDB();
  const rows = await all(`SELECT * FROM ${quoteIdentifier(tableName)};`);
  return rows;
}

// -------------- students ---------------- //

async function getStudentById(id) {
  await waitDB();
  const student = await get('SELECT * FROM students WHERE tz = ? OR code = ? LIMIT 1;', [id, id]);
  return student || null;
}

async function getStudentParentByCode(code) {
  await waitDB();
  const student = await get(`
    SELECT *,
      CASE WHEN tzParent = ? THEN 'parent' ELSE 'student' END AS scanType
    FROM students
    WHERE tzParent = ? OR tz = ? OR code = ?
    LIMIT 1;`, [code, code, code, code]);
  return student || null;
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

async function addStudent() {
  await waitDB();
  const tz = await generateUniqueStudentTz();
  try {
    await run(
      'INSERT INTO students (tz) VALUES (?);',
      [tz]
    );
    return true;
  } catch (error) {
    throw error;
  }
}

async function updateStudent(id, field, value) {
  await waitDB();
  let correctValue;

  if (field === 'points') {
    correctValue = Number(value);
  } else if (field === 'code') {
    correctValue = normalizeCodeValue(value);
  } else {
    correctValue = value;
  }

  try {
    await run(
      `UPDATE students SET ${quoteIdentifier(field)} = ? WHERE id = ?;`,
      [correctValue, id]
    );
    return true;
  } catch (error) {
    throw error;
  }
}

async function updateStudentText(studentId, text) {
  await waitDB();
  try {
    await run(
      'UPDATE students SET text = ? WHERE id = ?;',
      [text, studentId]
    );
    return true;
  } catch (error) {
    throw error;
  }
}

async function hasStudentDoneSelected(studentId, taskId, duration = '') {
  await waitDB();

  const condition = await get('SELECT buy from systemConfig')
  let result = ''
  if (condition.buy === 1) {
    result = await get(`
    SELECT 1 FROM studentsProducts WHERE studentId = ? AND productId = ? LIMIT 1`, [studentId, taskId]);
  } else {
    result = await get(`
    SELECT 1 FROM studentsTasks WHERE studentId = ? AND taskId = ? AND duration = ? LIMIT 1`, [studentId, taskId, duration]);
  }
  return !!result;
}


// -------------- tasks ---------------- //

async function addTask() {
  await waitDB();
  const lastTask = await get('SELECT MAX(code) AS code FROM tasks;');
  const code = Number(lastTask?.code || 0) + 1;
  try {
    await run(
      'INSERT INTO tasks (code) VALUES (?);',
      [code]
    );
    return true;
  } catch (error) {
    throw error;
  }
}

async function updateTask(code, field, value) {
  await waitDB();
  const textFields = ['name', 'description'];
  const correctValue = textFields.includes(field) ? value : Number(value);
  try {
    await run(
      `UPDATE tasks SET ${quoteIdentifier(field)} = ? WHERE code = ?;`,
      [correctValue, code]
    );
    return true;
  } catch (error) {
    throw error;
  }
}

async function getTaskByCode(code) {
  await waitDB();
  return get(`
    SELECT id, code, name, multiple, points FROM tasks WHERE code = ?`, [code]);
}

// -------------- products ---------------- //

async function addProduct() {
  await waitDB();
  const lastProduct = await get('SELECT MAX(code) AS code FROM products;');
  const code = Number(lastProduct?.code || 0) + 1;
  try {
    await run(
      'INSERT INTO products (code) VALUES (?);',
      [code]
    );
    return true;
  } catch (error) {
    throw error;
  }
}

async function updateProduct(code, field, value) {
  await waitDB();
  const correctValue = field === 'name' ? value : Number(value);
  try {
    await run(
      `UPDATE products SET ${quoteIdentifier(field)} = ? WHERE code = ?;`,
      [correctValue, code]
    );
    return true;
  } catch (error) {
    throw error;
  }
}

async function getProductByCode(code) {
  await waitDB();
  return get(`
    SELECT id, code, name, multiple, points, used FROM products WHERE code = ?`, [code]);
}

// -------------- tests ---------------- //

async function getTestByCode(code) {
  await waitDB();
  const rows = await all(`
    SELECT code, question, answer1, answer2, answer3, correct FROM tests WHERE code = ? ORDER BY id`, [code]);
  if (!rows.length) {
    return null;
  }
  return {
    id: Number(code),
    questions: rows.map((row) => ({
      question: row.question,
      answers: [row.answer1, row.answer2, row.answer3],
      correctIndex: Number(row.correct) - 1
    }))
  };
}

//------------------ studentTask ----------------------//

async function isTaskUsed(taskId) {
  await waitDB();
  const result = await get(`
    SELECT 1 FROM studentsTasks WHERE taskId = ? LIMIT 1`, [taskId]);
  return !!result;
}

async function isProductUsed(productId) {
  await waitDB();
  const result = await get(`
    SELECT 1 FROM studentsProducts WHERE productId = ? LIMIT 1`, [productId]);
  return !!result;
}

async function markProductAsUsed(productId) {
  await waitDB();
  try {
    await run(
      `UPDATE products SET "used" = 1 WHERE id = ?;`,
      [productId]
    );
    return true;
  } catch (error) {
    throw error;
  }
}


async function saveStudentTask(studentId, taskId, points, duration = '') {
  await waitDB();

  let resolvedPoints = points;
  if (resolvedPoints === undefined || resolvedPoints === null) {
    const getPoints = await get('SELECT points FROM tasks WHERE id = ? LIMIT 1;', [taskId]);
    if (!getPoints) {
      throw new Error(`Task with id ${taskId} not found`);
    }
    resolvedPoints = getPoints.points;
  }

  await run('BEGIN TRANSACTION;');
  try {
    await run(
      'INSERT INTO studentsTasks (studentId, taskId, duration, createDateTime) VALUES (?, ?, ?, DATETIME(\'now\', \'localtime\'));',
      [studentId, taskId, duration]
    );
    await run(
      'UPDATE students SET points = points + ? WHERE id = ?;', [resolvedPoints, studentId]
    );
    await run('COMMIT;');
    const studentRow = await get('SELECT points FROM students WHERE id = ? LIMIT 1;', [studentId]);
    return studentRow ? studentRow.points : false;

  } catch (error) {
    await run('ROLLBACK;');
    throw error;
  }
}

//------------------ studentProduct ----------------------//

async function saveStudentProduct(studentId, productId) {
  await waitDB();

  const getPoints = await get(`SELECT points FROM products WHERE id = ? LIMIT 1;`, [productId]);
  const studentRow = await get('SELECT points FROM students WHERE id = ? LIMIT 1;', [studentId]);
  const productPoints = getPoints.points
  const studentPoints = studentRow.points

  if (studentPoints < productPoints) {
    return false;
  }

  await run('BEGIN TRANSACTION;');
  try {
    await run(
      'INSERT INTO studentsProducts (studentId, productId, createDateTime) VALUES (?, ?, DATETIME(\'now\', \'localtime\'));',
      [studentId, productId]
    );
    await run(
      'UPDATE students SET points = points - ? WHERE id = ?;', [productPoints, studentId]
    );

    const newPoints = await get('SELECT points FROM students WHERE id = ? LIMIT 1;', [studentId]);
    await run('COMMIT;');
    return newPoints ? newPoints.points : false;

  } catch (error) {
    await run('ROLLBACK;');
    throw error;
  }
}

//------------------ statistics ----------------------//

async function getStatistics() {
  await waitDB();

  const totals = await get(
    'SELECT COALESCE(SUM(points), 0) AS totalPoints FROM students;'
  );

  const active = await get(
    'SELECT COUNT(DISTINCT studentId) AS activeStudents FROM studentsTasks;'
  );

  const popularTask = await get(
    `SELECT tasks.name AS name, COUNT(*) AS times
       FROM studentsTasks
       JOIN tasks ON tasks.id = studentsTasks.taskId
      GROUP BY studentsTasks.taskId
      ORDER BY times DESC
      LIMIT 1;`
  );

  const topStudents = await all(
    `SELECT name, grade, points
       FROM students
      WHERE points > 0
      ORDER BY points DESC
      LIMIT ?;`, [TOP_STUDENTS_LIMIT]
  );

  const topClasses = await all(
    `SELECT grade, SUM(points) AS points
       FROM students
      GROUP BY grade
     HAVING SUM(points) > 0
      ORDER BY SUM(points) DESC;`
  );

  return {
    totalPoints: totals ? totals.totalPoints : 0,
    activeStudents: active ? active.activeStudents : 0,
    popularTask: popularTask || null,
    topStudents: topStudents || [],
    topClasses: topClasses || [],
    leadingClass: topClasses && topClasses.length > 0 ? topClasses[0].grade : ''
  };
}

async function resetDatabase() {
  await waitDB();
  await run('BEGIN TRANSACTION;');
  try {
    await run('DELETE FROM studentsTasks;');
    await run('DELETE FROM studentsProducts;');
    await run('DELETE FROM tests;');
    await run('DELETE FROM questions;');
    await run('DELETE FROM students;');
    await run('DELETE FROM products;');
    await run('DELETE FROM tasks;');
    await run('COMMIT;');
    return true;
  } catch (error) {
    await run('ROLLBACK;');
    throw error;
  }
}

//----------------------------------------------------//

module.exports = {
  initDatabase,
  waitDB,
  updateSystem,
  readSystem,
  readData,
  closeDatabase,
  insertExcelToDB,
  addStudent,
  updateStudent,
  addTask,
  updateTask,
  addProduct,
  updateProduct,
  getStudentById,
  getStudentParentByCode,
  updateStudentText,
  getTaskByCode,
  getProductByCode,
  getTestByCode,
  isTaskUsed,
  isProductUsed,
  markProductAsUsed,
  hasStudentDoneSelected,
  saveStudentTask,
  saveStudentProduct,
  getStatistics,
  resetDatabase,
  DB_FLAG_INCONSISTENT_ERROR_CODE
};
