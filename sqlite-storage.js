const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js/dist/sql-asm.js');

const DATASET_NAMES = ['systemConfig', 'students', 'uniqTasks', 'products', 'parents', 'tests'];

let appInstance;
let db;
let dbPath;
let initializationPromise;

async function initializeDatabase(electronApp) {
  if (db) {
    return dbPath;
  }

  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    appInstance = electronApp;

    const SQL = await initSqlJs();

    const userDataPath = appInstance.getPath('userData');
    fs.mkdirSync(userDataPath, { recursive: true });

    dbPath = path.join(userDataPath, 'points-accumulation.sqlite');
    const databaseExistedBeforeInit = fs.existsSync(dbPath);

    // The installer creates this flag on every install run.
    // We consume it once to reset local data, then keep persistence for regular launches.
    const installerResetFlagPath = path.join(userDataPath, 'reset-sqlite-on-next-launch.flag');
    const hasInstallerResetFlag = appInstance.isPackaged && fs.existsSync(installerResetFlagPath);
    if (hasInstallerResetFlag) {
      if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
      }
      fs.unlinkSync(installerResetFlagPath);
    }

    if (fs.existsSync(dbPath)) {
      const fileBuffer = fs.readFileSync(dbPath);
      db = new SQL.Database(new Uint8Array(fileBuffer));
    } else {
      db = new SQL.Database();
    }

    execute('PRAGMA foreign_keys = ON;');
    createSchema();
    ensureSchemaEvolution();
    persistDatabase();

    if (hasInstallerResetFlag || !databaseExistedBeforeInit) {
      logSchemaSummary('SQLite schema created');
    }

    return dbPath;
  })();

  return initializationPromise;
}

async function readData(datasetName) {
  await ensureDatabase();

  switch (datasetName) {
    case 'systemConfig':
      return readSystemConfig();
    case 'students':
      return readStudents();
    case 'uniqTasks':
      return readActions('uniqTasks');
    case 'products':
    case 'parents':
    case 'tests':
      return 0;
    default:
      throw new Error(`Unsupported dataset: ${datasetName}`);
  }
}

async function writeData(datasetName, rawJson) {
  await ensureDatabase();

  const parsed = JSON.parse(rawJson);

  switch (datasetName) {
    case 'systemConfig':
      writeSystemConfig(parsed);
      break;
    case 'students':
      writeStudents(parsed);
      break;
    case 'uniqTasks':
      writeActions('uniqTasks', parsed);
      break;
    case 'products':
    case 'parents':
    case 'tests':
      return 0;
    default:
      throw new Error(`Unsupported dataset: ${datasetName}`);
  }

  return 1;
}

function getDatabasePath() {
  return dbPath;
}

function createSchema() {
  execute(`
    CREATE TABLE IF NOT EXISTS system_config (
      config_key TEXT PRIMARY KEY,
      config_value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tz TEXT UNIQUE,
      code TEXT,
      barcode TEXT DEFAULT '',
      grade TEXT,
      name TEXT,
      points REAL DEFAULT 0,
      position TEXT DEFAULT '',
      tasks TEXT DEFAULT ',',
      tasks_number TEXT DEFAULT ',',
      raw_json TEXT DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS uniqTasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE,
      name TEXT,
      points REAL DEFAULT 0,
      multiple INTEGER DEFAULT 0,
      type INTEGER DEFAULT 1,
      class INTEGER DEFAULT 0,
      show INTEGER DEFAULT 1,
      position TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT,
      name TEXT,
      points REAL DEFAULT 0,
      multiple INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS studentsTasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      studentId INTEGER NOT NULL,
      taskId INTEGER NOT NULL,
      amount REAL DEFAULT 0,
      FOREIGN KEY (studentId) REFERENCES students(id) ON DELETE CASCADE,
      FOREIGN KEY (taskId) REFERENCES uniqTasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS studentsProducts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      studentId INTEGER NOT NULL,
      productId INTEGER NOT NULL,
      amount REAL DEFAULT 0,
      FOREIGN KEY (studentId) REFERENCES students(id) ON DELETE CASCADE,
      FOREIGN KEY (productId) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS parents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tz TEXT,
      idStudent INTEGER,
      text TEXT,
      FOREIGN KEY (idStudent) REFERENCES students(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_studentsTasks_studentId ON studentsTasks(studentId);
    CREATE INDEX IF NOT EXISTS idx_studentsTasks_taskId ON studentsTasks(taskId);
    CREATE INDEX IF NOT EXISTS idx_studentsProducts_studentId ON studentsProducts(studentId);
    CREATE INDEX IF NOT EXISTS idx_studentsProducts_productId ON studentsProducts(productId);
    CREATE INDEX IF NOT EXISTS idx_parents_idStudent ON parents(idStudent);
  `);
}

function ensureSchemaEvolution() {
  execute('DROP TABLE IF EXISTS systemConfig;');

  // Add missing columns to students table (for DBs created before these columns were added)
  const studentsCols = new Set(
    selectAll("PRAGMA table_info(students)").map((r) => r.name)
  );
  if (!studentsCols.has('barcode')) {
    execute("ALTER TABLE students ADD COLUMN barcode TEXT DEFAULT '';");
  }
  if (!studentsCols.has('tasks')) {
    execute("ALTER TABLE students ADD COLUMN tasks TEXT DEFAULT ',';");
  }
  if (!studentsCols.has('tasks_number')) {
    execute("ALTER TABLE students ADD COLUMN tasks_number TEXT DEFAULT ',';");
  }
  if (!studentsCols.has('raw_json')) {
    execute("ALTER TABLE students ADD COLUMN raw_json TEXT DEFAULT '{}';");
  }

  // Enforce strict uniqTasks schema based on the new diagram
  const uniqTasksCols = new Set(
    selectAll("PRAGMA table_info(uniqTasks)").map((r) => r.name)
  );
  const expectedUniqTasksCols = ['id', 'code', 'name', 'points', 'multiple', 'type', 'class', 'show', 'position'];
  const hasAllExpectedUniqTasksCols = expectedUniqTasksCols.every((col) => uniqTasksCols.has(col));
  const hasUnexpectedUniqTasksCols = Array.from(uniqTasksCols).some((col) => !expectedUniqTasksCols.includes(col));

  if (!hasAllExpectedUniqTasksCols || hasUnexpectedUniqTasksCols) {
    const codeExpr = uniqTasksCols.has('code') ? 'code' : 'NULL';
    const nameExpr = uniqTasksCols.has('name') ? 'name' : "''";
    const pointsExpr = uniqTasksCols.has('points') ? 'points' : '0';
    const multipleExpr = uniqTasksCols.has('multiple') ? 'multiple' : '0';
    const typeExpr = uniqTasksCols.has('type') ? 'type' : '1';
    const classExpr = uniqTasksCols.has('class') ? '"class"' : (uniqTasksCols.has('class_flag') ? 'class_flag' : '0');
    const positionExpr = uniqTasksCols.has('position') ? 'position' : "''";

    execute(`
      CREATE TABLE uniqTasks_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE,
        name TEXT,
        points REAL DEFAULT 0,
        multiple INTEGER DEFAULT 0,
        type INTEGER DEFAULT 1,
        class INTEGER DEFAULT 0,
        show INTEGER DEFAULT 1,
        position TEXT DEFAULT ''
      );

      INSERT INTO uniqTasks_new (code, name, points, multiple, type, class, show, position)
      SELECT
        CAST(${codeExpr} AS TEXT) AS code,
        MAX(${nameExpr}) AS name,
        MAX(${pointsExpr}) AS points,
        MAX(${multipleExpr}) AS multiple,
        MAX(${typeExpr}) AS type,
        MAX(${classExpr}) AS class,
        1 AS show,
        MAX(${positionExpr}) AS position
      FROM uniqTasks
      WHERE ${codeExpr} IS NOT NULL AND TRIM(CAST(${codeExpr} AS TEXT)) <> ''
      GROUP BY CAST(${codeExpr} AS TEXT);

      DROP TABLE uniqTasks;
      ALTER TABLE uniqTasks_new RENAME TO uniqTasks;
    `);
  }

  execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_uniqTasks_code_unique ON uniqTasks(code);');
}

function logSchemaSummary(prefix) {
  const logLines = [];
  const tables = selectAll(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `);

  const headerLine = `[SQLite] ${prefix} at: ${dbPath}`;
  console.log(headerLine);
  logLines.push(`${new Date().toISOString()} ${headerLine}`);

  const schemaLogPath = path.join(path.dirname(dbPath), 'sqlite-schema.log');
  const fileLine = `[SQLite] schema log file: ${schemaLogPath}`;
  console.log(fileLine);
  logLines.push(fileLine);

  if (tables.length === 0) {
    console.log('[SQLite] tables: (none)');
    logLines.push('[SQLite] tables: (none)');
    fs.appendFileSync(schemaLogPath, `${logLines.join('\n')}\n\n`);
    return;
  }

  tables.forEach((tableRow) => {
    const tableName = String(tableRow.name || '');
    if (!tableName) {
      return;
    }

    const escapedTableName = tableName.replace(/"/g, '""');
    const count = selectAll(`SELECT COUNT(*) AS count FROM "${escapedTableName}"`)[0];
    const rows = count ? Number(count.count || 0) : 0;
    const line = `[SQLite] ${tableName}: ${rows}`;
    console.log(line);
    logLines.push(line);
  });

  fs.appendFileSync(schemaLogPath, `${logLines.join('\n')}\n\n`);
}

function readSystemConfig() {
  const rows = selectAll('SELECT config_key, config_value FROM system_config ORDER BY config_key');
  
  if (rows.length === 0) {
    return 0;
  }

  const config = {};
  rows.forEach((row) => {
    config[row.config_key] = deserializeSystemConfigValue(row.config_value);
  });

  return JSON.stringify(config);
}

function writeSystemConfig(config) {
  if (!config || Array.isArray(config) || typeof config !== 'object') {
    throw new Error('systemConfig must be a JSON object');
  }

  executeTransaction(() => {
    const existingRows = selectAll('SELECT config_key, config_value FROM system_config');
    const existingMap = new Map(existingRows.map((row) => [row.config_key, row.config_value]));
    const seenKeys = new Set();

    Object.keys(config).forEach((key) => {
      const value = serializeSystemConfigValue(key, config[key]);
      seenKeys.add(key);

      if (existingMap.get(key) !== value) {
        runStatement(
          `INSERT INTO system_config (config_key, config_value)
           VALUES (?, ?)
           ON CONFLICT(config_key) DO UPDATE SET config_value = excluded.config_value`,
          [key, value]
        );
      }
    });

    existingMap.forEach((_, key) => {
      if (!seenKeys.has(key)) {
        runStatement('DELETE FROM system_config WHERE config_key = ?', [key]);
      }
    });
  });
}

function readStudents() {
  const rows = selectAll(`
    SELECT tz, code, barcode, name, grade, points, position, tasks, tasks_number, raw_json
    FROM students
    ORDER BY grade, name, tz
  `);

  if (rows.length === 0) {
    return 0;
  }

  return JSON.stringify(rows.map(buildStudentResult));
}

function writeStudents(students) {
  const rows = ensureArray(students, 'students');

  executeTransaction(() => {
    const existingMap = new Map(
      selectAll('SELECT tz, raw_json FROM students').map((row) => [String(row.tz), row.raw_json])
    );
    const seenKeys = new Set();

    rows.forEach((row) => {
      const normalized = normalizeStudent(row);
      if (!normalized) {
        return;
      }

      seenKeys.add(normalized.tz);

      if (existingMap.get(normalized.tz) !== normalized.raw_json) {
        runStatement(
          `INSERT INTO students (tz, code, barcode, name, grade, points, position, tasks, tasks_number, raw_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(tz) DO UPDATE SET
             code = excluded.code,
             barcode = excluded.barcode,
             name = excluded.name,
             grade = excluded.grade,
             points = excluded.points,
             position = excluded.position,
             tasks = excluded.tasks,
             tasks_number = excluded.tasks_number,
             raw_json = excluded.raw_json`,
          [
            normalized.tz,
            normalized.code,
            normalized.barcode,
            normalized.name,
            normalized.grade,
            normalized.points,
            normalized.position,
            normalized.tasks,
            normalized.tasks_number,
            normalized.raw_json
          ]
        );
      }
    });

    existingMap.forEach((_, tz) => {
      if (!seenKeys.has(tz)) {
        runStatement('DELETE FROM students WHERE tz = ?', [tz]);
      }
    });
  });
}

function readActions(tableName) {
  const rows = selectAll(`
    SELECT code, name, points, multiple, type, class, show, position
    FROM ${tableName}
    ORDER BY CAST(code AS INTEGER), code
  `);

  if (rows.length === 0) {
    return 0;
  }

  return JSON.stringify(rows.map(buildActionResult));
}

function writeActions(tableName, actions) {
  const rows = ensureArray(actions, tableName);

  executeTransaction(() => {
    const existingCodes = new Set(
      selectAll(`SELECT code FROM ${tableName}`).map((row) => String(row.code))
    );
    const seenKeys = new Set();

    rows.forEach((row) => {
      const normalized = normalizeAction(row);
      if (!normalized) {
        return;
      }

      seenKeys.add(normalized.code);

      runStatement(
        `INSERT INTO ${tableName} (code, name, points, multiple, type, class, show, position)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(code) DO UPDATE SET
           name = excluded.name,
           points = excluded.points,
           multiple = excluded.multiple,
           type = excluded.type,
           class = excluded.class,
           show = excluded.show,
           position = excluded.position`,
        [
          normalized.code,
          normalized.name,
          normalized.points,
          normalized.multiple,
          normalized.type,
          normalized.class,
          normalized.show,
          normalized.position
        ]
      );
    });

    existingCodes.forEach((code) => {
      if (!seenKeys.has(code)) {
        runStatement(`DELETE FROM ${tableName} WHERE code = ?`, [code]);
      }
    });
  });
}

function readParents() {
  const rows = selectAll(`
    SELECT tz, tz_parent, name, grade, text_value, raw_json
    FROM parents
    ORDER BY grade, name, tz
  `);

  if (rows.length === 0) {
    return 0;
  }

  return JSON.stringify(rows.map(buildParentResult));
}

function writeParents(parents) {
  const rows = ensureArray(parents, 'parents');

  executeTransaction(() => {
    const existingMap = new Map(
      selectAll('SELECT tz, raw_json FROM parents').map((row) => [String(row.tz), row.raw_json])
    );
    const seenKeys = new Set();

    rows.forEach((row) => {
      const normalized = normalizeParent(row);
      if (!normalized) {
        return;
      }

      seenKeys.add(normalized.tz);

      if (existingMap.get(normalized.tz) !== normalized.raw_json) {
        runStatement(
          `INSERT INTO parents (tz, tz_parent, name, grade, text_value, raw_json)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(tz) DO UPDATE SET
             tz_parent = excluded.tz_parent,
             name = excluded.name,
             grade = excluded.grade,
             text_value = excluded.text_value,
             raw_json = excluded.raw_json`,
          [
            normalized.tz,
            normalized.tz_parent,
            normalized.name,
            normalized.grade,
            normalized.text_value,
            normalized.raw_json
          ]
        );
      }
    });

    existingMap.forEach((_, tz) => {
      if (!seenKeys.has(tz)) {
        runStatement('DELETE FROM parents WHERE tz = ?', [tz]);
      }
    });
  });
}

function readTests() {
  const tests = selectAll('SELECT id, raw_json FROM tests ORDER BY CAST(id AS INTEGER), id');
  if (tests.length === 0) {
    return 0;
  }

  const result = tests.map((test) => {
    const parsed = safeJsonParse(test.raw_json, {});
    const questions = selectAll(
      `SELECT question, answers_json, correct_index
       FROM test_questions
       WHERE test_id = ?
       ORDER BY question_index`,
      [test.id]
    ).map((question) => ({
      question: question.question,
      answers: safeJsonParse(question.answers_json, []),
      correctIndex: question.correct_index
    }));

    return {
      ...parsed,
      id: parsed.id || test.id,
      questions
    };
  });

  return JSON.stringify(result);
}

function writeTests(tests) {
  const rows = ensureArray(tests, 'tests');

  executeTransaction(() => {
    const existingMap = new Map(
      selectAll('SELECT id, raw_json FROM tests').map((row) => [String(row.id), row.raw_json])
    );
    const seenKeys = new Set();

    rows.forEach((row) => {
      const normalized = normalizeTest(row);
      if (!normalized) {
        return;
      }

      seenKeys.add(normalized.id);

      if (existingMap.get(normalized.id) !== normalized.raw_json) {
        runStatement(
          `INSERT INTO tests (id, raw_json)
           VALUES (?, ?)
           ON CONFLICT(id) DO UPDATE SET raw_json = excluded.raw_json`,
          [normalized.id, normalized.raw_json]
        );
        runStatement('DELETE FROM test_questions WHERE test_id = ?', [normalized.id]);

        normalized.questions.forEach((question, index) => {
          runStatement(
            `INSERT INTO test_questions (test_id, question_index, question, answers_json, correct_index)
             VALUES (?, ?, ?, ?, ?)`,
            [normalized.id, index, question.question, JSON.stringify(question.answers), question.correctIndex]
          );
        });
      }
    });

    existingMap.forEach((_, id) => {
      if (!seenKeys.has(id)) {
        runStatement('DELETE FROM tests WHERE id = ?', [id]);
      }
    });
  });
}

function buildStudentResult(row) {
  const parsed = safeJsonParse(row.raw_json, {});
  return {
    ...parsed,
    tz: coerceNumericOrKeep(row.tz),
    code: parsed.code || row.code || undefined,
    barcode: row.barcode || parsed.barcode || '',
    name: row.name,
    grade: row.grade,
    points: row.points,
    position: row.position,
    tasks: row.tasks,
    tasksNumber: row.tasks_number
  };
}

function buildActionResult(row) {
  return {
    code: coerceNumericOrKeep(row.code),
    name: row.name,
    points: row.points,
    multiple: Boolean(row.multiple),
    type: row.type,
    class: Boolean(row.class),
    show: Boolean(row.show),
    position: row.position || ''
  };
}

function buildParentResult(row) {
  const parsed = safeJsonParse(row.raw_json, {});
  return {
    ...parsed,
    tz: coerceNumericOrKeep(row.tz),
    tzParent: coerceNumericOrKeep(row.tz_parent),
    name: row.name,
    grade: row.grade,
    text: row.text_value
  };
}

function normalizeStudent(row) {
  if (!row || typeof row !== 'object') {
    throw new Error('Each student row must be a JSON object');
  }

  const tz = stringifyKey(row.tz || row.code || row.תז || row.תיז || '');
  if (!tz) {
    return null;
  }

  const normalized = {
    ...row,
    tz: coerceNumericOrKeep(tz),
    barcode: row.barcode || row.ברקוד || '',
    name: row.name || row.שם || '',
    grade: row.grade || row.כיתה || '',
    points: toInteger(row.points || row.ניקוד || 0),
    position: row.position || row.מיקום || '',
    tasks: row.tasks || row.משימות || ',',
    tasksNumber: row.tasksNumber || row.tasks_number || row.מספרמשימות || ','
  };

  return {
    tz,
    code: stringifyNullable(row.code || row.קוד),
    barcode: normalized.barcode,
    name: normalized.name,
    grade: normalized.grade,
    points: normalized.points,
    position: normalized.position,
    tasks: normalized.tasks,
    tasks_number: normalized.tasksNumber,
    raw_json: JSON.stringify(normalized)
  };
}

function normalizeAction(row) {
  if (!row || typeof row !== 'object') {
    throw new Error('Each action row must be a JSON object');
  }

  const code = stringifyKey(row.code || row.קוד || row.Code || '');
  if (!code) {
    return null;
  }

  const normalized = {
    ...row,
    code: coerceNumericOrKeep(code),
    name: row.name || row.שם || '',
    points: toInteger(row.points || row.ניקוד || 0),
    position: row.position || row.מיקום || '',
    multiple: toBoolean(row.multiple || row.מרובה || 0),
    type: toInteger(row.type || row.סוג || 1),
    class: toBoolean(row.class || row.כיתה || 0),
    show: row.show === undefined ? true : toBoolean(row.show || row.הצג || 0)
  };

  return {
    code,
    name: normalized.name,
    points: normalized.points,
    multiple: normalized.multiple ? 1 : 0,
    type: normalized.type,
    class: normalized.class ? 1 : 0,
    show: normalized.show ? 1 : 0,
    position: normalized.position
  };
}

function normalizeParent(row) {
  if (!row || typeof row !== 'object') {
    throw new Error('Each parent row must be a JSON object');
  }

  const tz = stringifyKey(row.tz || row.code || row.תז || row.תיז || '');
  if (!tz) {
    return null;
  }

  const normalized = {
    ...row,
    tz: coerceNumericOrKeep(tz),
    tzParent: coerceNumericOrKeep(stringifyNullable(row.tzParent || row.תזהורה || '')),
    name: row.name || row.שם || '',
    grade: row.grade || row.כיתה || '',
    text: row.text || row.טקסט || ''
  };

  return {
    tz,
    tz_parent: stringifyNullable(row.tzParent || row.תזהורה),
    name: normalized.name,
    grade: normalized.grade,
    text_value: normalized.text,
    raw_json: JSON.stringify(normalized)
  };
}

function normalizeTest(row) {
  if (!row || typeof row !== 'object') {
    throw new Error('Each test row must be a JSON object');
  }

  const id = stringifyKey(row.id || row.קוד || row.Code || '');
  if (!id) {
    return null;
  }

  const questions = ensureArray(row.questions || [], 'test.questions').map((question) => ({
    question: question.question || question.שאלה || '',
    answers: ensureArray(question.answers || [], 'question.answers'),
    correctIndex: toInteger(question.correctIndex || question.תשובהנכונה || 0)
  }));

  return {
    id,
    questions,
    raw_json: JSON.stringify({
      ...row,
      id: coerceNumericOrKeep(id),
      questions
    })
  };
}

function serializeSystemConfigValue(key, value) {
  if (key === 'buy') {
    return JSON.stringify(toBoolean(value));
  }

  if (typeof value === 'string') {
    return value;
  }

  return String(value);
}

function deserializeSystemConfigValue(value) {
  if (value === 'true' || value === 'false') {
    return value === 'true';
  }

  return value;
}

async function ensureDatabase() {
  if (db) {
    return;
  }

  if (initializationPromise) {
    await initializationPromise;
    return;
  }

  throw new Error('Database has not been initialized');
}

function execute(sql) {
  db.run(sql);
}

function runStatement(sql, params = []) {
  db.run(sql, params);
}

function selectAll(sql, params = []) {
  const statement = db.prepare(sql);
  try {
    if (params.length > 0) {
      statement.bind(params);
    }

    const rows = [];
    while (statement.step()) {
      rows.push(statement.getAsObject());
    }
    return rows;
  } finally {
    statement.free();
  }
}

function getCount(sql, params = []) {
  const row = selectAll(sql, params)[0];
  return row ? Number(row.count) : 0;
}

function executeTransaction(work) {
  runStatement('BEGIN');
  try {
    work();
    runStatement('COMMIT');
    persistDatabase();
  } catch (error) {
    try {
      runStatement('ROLLBACK');
    } catch (rollbackError) {
    }
    throw error;
  }
}

function persistDatabase() {
  const data = Buffer.from(db.export());
  const tempPath = `${dbPath}.tmp`;
  fs.writeFileSync(tempPath, data);
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }
  fs.renameSync(tempPath, dbPath);
}

function ensureArray(value, name) {
  if (!Array.isArray(value)) {
    throw new Error(`${name} must be a JSON array`);
  }

  return value;
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function toInteger(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : fallback;
}

function toBoolean(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function stringifyKey(value) {
  if (value === undefined || value === null || value === '') {
    return '';
  }

  return String(value);
}

function stringifyNullable(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  return String(value);
}

function coerceNumericOrKeep(value) {
  if (value === undefined || value === null || value === '') {
    return value;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : value;
}

module.exports = {
  getDatabasePath,
  initializeDatabase,
  readData,
  writeData
};
