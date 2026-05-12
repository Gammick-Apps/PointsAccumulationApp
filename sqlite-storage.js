const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js/dist/sql-asm.js');

let appInstance;
let db;
let dbPath;
let sqlite3;
let SQL;
let backend = 'sqlite3';
let initializationPromise;

function resolveDatabaseLocation() {
  const userDataPath = appInstance.getPath('userData');
  if (appInstance.isPackaged) {
    return {
      userDataPath,
      databaseFilePath: path.join(userDataPath, 'points-accumulation.sqlite')
    };
  }

  return {
    userDataPath,
    databaseFilePath: path.join(userDataPath, 'points-accumulation.dev.sqlite')
  };
}

async function initializeDatabase(electronApp) {
  if (db) {
    return dbPath;
  }

  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    appInstance = electronApp;

    const location = resolveDatabaseLocation();
    fs.mkdirSync(location.userDataPath, { recursive: true });

    dbPath = location.databaseFilePath;

    const installerResetFlagPath = path.join(location.userDataPath, 'reset-sqlite-on-next-launch.flag');
    const hasInstallerResetFlag = appInstance.isPackaged && fs.existsSync(installerResetFlagPath);
    if (hasInstallerResetFlag) {
      if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
      }
      fs.unlinkSync(installerResetFlagPath);
    }

    await initializePreferredBackend();
    await createSchema();
    await ensureSchemaEvolution();

    console.log(`SQLite backend active: ${backend}`);
    return dbPath;
  })().catch((error) => {
    initializationPromise = undefined;
    throw error;
  });

  return initializationPromise;
}

async function initializePreferredBackend() {
  try {
    if (!sqlite3) {
      sqlite3 = require('sqlite3').verbose();
    }
    db = await openSqlite3Database(dbPath);
    backend = 'sqlite3';
  } catch (error) {
    console.warn('sqlite3 unavailable, falling back to sql.js backend.');
    await initializeSqlJsDatabase(dbPath);
    backend = 'sqljs';
  }
}

function openSqlite3Database(filePath) {
  return new Promise((resolve, reject) => {
    const connection = new sqlite3.Database(filePath, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(connection);
    });
  });
}

async function initializeSqlJsDatabase(filePath) {
  if (!SQL) {
    SQL = await initSqlJs();
  }

  if (fs.existsSync(filePath)) {
    db = new SQL.Database(fs.readFileSync(filePath));
    return;
  }

  db = new SQL.Database();
  persistSqlJs();
}

function persistSqlJs() {
  if (backend !== 'sqljs' || !db || !dbPath) {
    return;
  }

  const bytes = db.export();
  fs.writeFileSync(dbPath, Buffer.from(bytes));
}

function sqlJsRun(sql, params = []) {
  const statement = db.prepare(sql);
  statement.run(params);
  statement.free();
  persistSqlJs();
}

function sqlJsAll(sql, params = []) {
  const statement = db.prepare(sql);
  statement.bind(params);
  const rows = [];
  while (statement.step()) {
    rows.push(statement.getAsObject());
  }
  statement.free();
  return rows;
}

function run(sql, params = []) {
  if (backend === 'sqljs') {
    return Promise.resolve(sqlJsRun(sql, params));
  }

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
  if (backend === 'sqljs') {
    const rows = sqlJsAll(sql, params);
    return Promise.resolve(rows[0]);
  }

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
  if (backend === 'sqljs') {
    return Promise.resolve(sqlJsAll(sql, params));
  }

  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(rows || []);
    });
  });
}

async function createSchema() {
  await run(`
    CREATE TABLE IF NOT EXISTS systemConfig (
      config_key TEXT PRIMARY KEY,
      config_value TEXT NOT NULL
    );
  `);
}

async function tableExists(tableName) {
  const row = await get(
    "SELECT 1 AS hit FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1;",
    [String(tableName)]
  );
  return Boolean(row && Number(row.hit) === 1);
}

async function getTableColumns(tableName) {
  const escaped = String(tableName).replace(/"/g, '""');
  const rows = await all(`PRAGMA table_info("${escaped}");`);
  return new Set(rows.map((row) => row.name));
}

async function ensureSchemaEvolution() {
  await ensureConfigTableSchema();
  await migrateLegacyConfigTable('system_config');
  await dropNonSystemConfigTables();
}

async function ensureConfigTableSchema() {
  if (!(await tableExists('systemConfig'))) {
    return;
  }

  const columns = await getTableColumns('systemConfig');
  const isKeyValue = columns.has('config_key') && columns.has('config_value');
  if (isKeyValue) {
    return;
  }

  await run('ALTER TABLE systemConfig RENAME TO systemConfig_legacy_backup;');
  await createSchema();
  await migrateLegacyConfigTable('systemConfig_legacy_backup');
  await run('DROP TABLE IF EXISTS systemConfig_legacy_backup;');
}

async function migrateLegacyConfigTable(tableName) {
  if (!(await tableExists(tableName))) {
    return;
  }

  const escaped = `"${String(tableName).replace(/"/g, '""')}"`;
  const columns = await getTableColumns(tableName);
  const isKeyValue = columns.has('config_key') && columns.has('config_value');

  if (isKeyValue) {
    await run(`
      INSERT OR REPLACE INTO systemConfig (config_key, config_value)
      SELECT config_key, config_value
      FROM ${escaped}
    `);
    if (tableName !== 'systemConfig') {
      await run(`DROP TABLE IF EXISTS ${escaped};`);
    }
    return;
  }

  const rows = await all(`SELECT * FROM ${escaped} LIMIT 1;`);
  if (rows.length > 0) {
    const legacy = rows[0];
    const keys = Object.keys(legacy);
    for (const key of keys) {
      if (key === 'id') {
        continue;
      }
      const value = legacy[key];
      await run(
        `INSERT OR REPLACE INTO systemConfig (config_key, config_value)
         VALUES (?, ?)`,
        [key, value == null ? '' : String(value)]
      );
    }
  }

  if (tableName !== 'systemConfig') {
    await run(`DROP TABLE IF EXISTS ${escaped};`);
  }
}

async function dropNonSystemConfigTables() {
  const tables = await all(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name;"
  );
  const keepTables = new Set(['systemConfig']);
  const dropNames = tables
    .map((row) => String(row.name || ''))
    .filter((name) => name && !keepTables.has(name));

  for (const tableName of dropNames) {
    const escaped = String(tableName).replace(/"/g, '""');
    await run(`DROP TABLE IF EXISTS "${escaped}";`);
  }
}

function ensureInitialized() {
  if (!db) {
    throw new Error('Database is not initialized. Call initializeDatabase(app) first.');
  }
}

async function getLastSavedConfig() {
  ensureInitialized();
  const config = {};
  const rows = await all('SELECT config_key, config_value FROM systemConfig ORDER BY config_key;');
  rows.forEach((row) => {
    if (row && row.config_key != null) {
      config[String(row.config_key)] = row.config_value == null ? '' : String(row.config_value);
    }
  });
  return config;
}

async function writeSystemConfig(parsed) {
  ensureInitialized();
  const entries = Object.entries(parsed || {});

  if (backend === 'sqlite3') {
    await run('BEGIN TRANSACTION;');
    try {
      for (const [key, value] of entries) {
        await run(
          `INSERT OR REPLACE INTO systemConfig (config_key, config_value)
           VALUES (?, ?)`,
          [String(key), value == null ? '' : String(value)]
        );
      }
      await run('COMMIT;');
    } catch (error) {
      await run('ROLLBACK;');
      throw error;
    }
    return entries.length;
  }

  for (const [key, value] of entries) {
    await run(
      `INSERT OR REPLACE INTO systemConfig (config_key, config_value)
       VALUES (?, ?)`,
      [String(key), value == null ? '' : String(value)]
    );
  }

  return entries.length;
}

async function writeData(datasetName, payload) {
  if (datasetName !== 'systemConfig') {
    return 0;
  }

  const parsed = JSON.parse(payload);
  return writeSystemConfig(parsed);
}

async function readData(datasetName) {
  if (datasetName !== 'systemConfig') {
    return '[]';
  }

  const config = await getLastSavedConfig();
  return JSON.stringify(config);
}

function closeDatabase() {
  if (!db) {
    return;
  }

  if (backend === 'sqlite3') {
    db.close();
  } else {
    persistSqlJs();
    db.close();
  }

  db = undefined;
  dbPath = undefined;
  initializationPromise = undefined;
}

module.exports = {
  initializeDatabase,
  writeData,
  readData,
  closeDatabase,
  getLastSavedConfig,
  getBackend: () => backend,
  getDatabasePath: () => dbPath
};
