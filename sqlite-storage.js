const fs = require('fs');
const path = require('path');

let appInstance;
let db;
let dbPath;
let sqlite3;
let initializationPromise;

function getYesterdayDateIso() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return date.toISOString().split('T')[0];
}

function getDefaultSystemConfig() {
  return {
    date: getYesterdayDateIso(),
    numPosition: '',
    hasPrint: '1',
    hasBuy: '0',
    device: '0',
    color: '0',
    type: '0',
    hasParents: '0',
    hasTests: '0',
    timer: '10',
    buy: 'false',
    textColor: '0'
  };
}

function resolveInstalledProgramPath() {
  const localAppDataPath = process.env.LOCALAPPDATA;
  if (!localAppDataPath) {
    return null;
  }

  return path.join(localAppDataPath, 'Programs', 'accumulatingpoints');
}

function resolveDatabaseLocation() {
  const userDataPath = appInstance.getPath('userData');
  if (appInstance.isPackaged) {
    const installedProgramPath = resolveInstalledProgramPath();
    const basePath = installedProgramPath || userDataPath;
    return {
      userDataPath: basePath,
      databaseFilePath: path.join(basePath, 'points-accumulation.sqlite')
    };
  }

  return {
    userDataPath,
    databaseFilePath: path.join(userDataPath, 'points-accumulation.dev.sqlite')
  };
}

function collectResetFlagPaths(primaryBasePath) {
  const flagFileName = 'reset-sqlite-on-next-launch.flag';
  const flagPaths = [path.join(primaryBasePath, flagFileName)];
  const appDataPath = appInstance.getPath('appData');

  try {
    const appDataEntries = fs.readdirSync(appDataPath, { withFileTypes: true });
    for (const entry of appDataEntries) {
      if (!entry.isDirectory()) {
        continue;
      }
      flagPaths.push(path.join(appDataPath, entry.name, flagFileName));
    }
  } catch (error) {
    // Ignore path scan issues and rely on the primary path.
  }

  return Array.from(new Set(flagPaths));
}

function consumeInstallerResetFlag(primaryBasePath) {
  if (!appInstance.isPackaged) {
    return false;
  }

  const flagPaths = collectResetFlagPaths(primaryBasePath);
  const existingFlagPaths = flagPaths.filter((flagPath) => fs.existsSync(flagPath));
  if (existingFlagPaths.length === 0) {
    return false;
  }

  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }

  existingFlagPaths.forEach((flagPath) => {
    try {
      fs.unlinkSync(flagPath);
    } catch (error) {
      // Best effort cleanup.
    }
  });

  return true;
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
    sqlite3 = sqlite3 || require('sqlite3').verbose();

    const location = resolveDatabaseLocation();
    fs.mkdirSync(location.userDataPath, { recursive: true });
    dbPath = location.databaseFilePath;

    consumeInstallerResetFlag(location.userDataPath);

    db = await openSqlite3Database(dbPath);
    await createSchema();

    console.log('SQLite backend active: sqlite3');
    return dbPath;
  })().catch((error) => {
    initializationPromise = undefined;
    throw error;
  });

  return initializationPromise;
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
      resolve(rows || []);
    });
  });
}

async function createSchema() {
  let schemaFilePath;
  
  if (appInstance.isPackaged) {
    // In packaged app: use database directory
    const location = resolveDatabaseLocation();
    schemaFilePath = path.join(location.userDataPath, 'schema.json');
    
    // If schema doesn't exist in database dir, copy it from app resources
    if (!fs.existsSync(schemaFilePath)) {
      const appSchemaPath = path.join(__dirname, 'schema.json');
      if (!fs.existsSync(appSchemaPath)) {
        throw new Error('schema.json not found in application resources');
      }
      fs.copyFileSync(appSchemaPath, schemaFilePath);
    }
  } else {
    // In development: read from app directory
    schemaFilePath = path.join(__dirname, 'schema.json');
  }
  
  const schemaRaw = fs.readFileSync(schemaFilePath, 'utf8');
  const parsedSchema = JSON.parse(schemaRaw);
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

  await run('PRAGMA foreign_keys = OFF;');

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

    for (const table of tables) {
      const columns = Array.isArray(table.columns) ? table.columns : [];
      if (!table.name || columns.length === 0) {
        continue;
      }

      const tableNameSql = quoteIdentifier(table.name);
      const countRow = await get(`SELECT COUNT(1) AS count FROM ${tableNameSql};`);
      if (countRow && Number(countRow.count) > 0) {
        continue;
      }

      if (table.name === 'systemConfig') {
        await run(
          `INSERT INTO ${tableNameSql} (config_key, config_value) VALUES (?, ?);`,
          ['date', getDefaultSystemConfig().date]
        );
        continue;
      }

      await run(`INSERT INTO ${tableNameSql} DEFAULT VALUES;`);
    }
  } finally {
    await run('PRAGMA foreign_keys = ON;');
  }
}

async function getLastSavedConfig() {
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
  const entries = Object.entries(parsed || {});
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

async function writeData(datasetName, payload) {
  if (datasetName !== 'systemConfig') {
    return 0;
  }

  const parsed = JSON.parse(payload);
  const mergedConfig = { ...getDefaultSystemConfig(), ...(parsed || {}) };
  return writeSystemConfig(mergedConfig);
}

async function readData(datasetName) {
  if (datasetName !== 'systemConfig') {
    return '[]';
  }

  const config = await getLastSavedConfig();
  const mergedConfig = { ...getDefaultSystemConfig(), ...(config || {}) };
  return JSON.stringify(mergedConfig);
}

function closeDatabase() {
  if (!db) {
    return;
  }

  db.close();
  db = undefined;
  dbPath = undefined;
  initializationPromise = undefined;
}

module.exports = {
  initializeDatabase,
  writeData,
  readData,
  closeDatabase
};
