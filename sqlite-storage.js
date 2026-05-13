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
    await seedDefaultSystemConfigIfEmpty();

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
  await run(`
    CREATE TABLE IF NOT EXISTS systemConfig (
      config_key TEXT PRIMARY KEY,
      config_value TEXT NOT NULL
    );
  `);
}

async function seedDefaultSystemConfigIfEmpty() {
  const row = await get('SELECT COUNT(1) AS count FROM systemConfig;');
  if (row && Number(row.count) > 0) {
    return;
  }
  await writeSystemConfig(getDefaultSystemConfig());
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
  closeDatabase,
  getDatabasePath: () => dbPath
};
