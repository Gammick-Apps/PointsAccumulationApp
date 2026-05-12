const fs = require('fs');
const path = require('path');
const os = require('os');
const initSqlJs = require('sql.js/dist/sql-asm.js');

const DB_FILE_NAME = 'points-accumulation.sqlite';

function getCandidatePaths() {
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  const productName = 'צבירת נקודות';

  const candidates = [
    path.join(appData, productName, 'points-accumulation.dev.sqlite'),
    path.join(appData, productName, DB_FILE_NAME),
    path.join(appData, 'accumulatingpoints', DB_FILE_NAME)
  ];

  if (fs.existsSync(appData)) {
    const dirs = fs.readdirSync(appData, { withFileTypes: true });
    dirs.forEach((entry) => {
      if (!entry.isDirectory()) {
        return;
      }
      const candidate = path.join(appData, entry.name, DB_FILE_NAME);
      if (fs.existsSync(candidate)) {
        candidates.push(candidate);
      }
    });
  }

  return [...new Set(candidates)];
}

function parseStoredValue(raw) {
  if (typeof raw !== 'string') {
    return raw;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    return raw;
  }
}

function getSingleValueResult(db, sql) {
  const result = db.exec(sql);
  if (!result || result.length === 0 || !result[0].values || result[0].values.length === 0) {
    return null;
  }

  return result[0].values[0][0];
}

function getTableRowCount(db, tableName) {
  const safeTableName = tableName.replace(/'/g, "''");
  const sql = `SELECT COUNT(*) FROM "${safeTableName}";`;
  const result = db.exec(sql);
  if (!result || result.length === 0 || !result[0].values || result[0].values.length === 0) {
    return 0;
  }

  return Number(result[0].values[0][0] || 0);
}

async function main() {
  const dbPathArg = process.argv[2];
  let dbPath = dbPathArg;

  if (!dbPath) {
    const foundPath = getCandidatePaths().find((candidate) => fs.existsSync(candidate));
    dbPath = foundPath;
  }

  if (!dbPath || !fs.existsSync(dbPath)) {
    console.error('SQLite DB file not found.');
    console.error('Pass explicit path: node show-sqlite-data.js "C:/.../points-accumulation.sqlite"');
    process.exit(1);
  }

  const SQL = await initSqlJs();
  const fileBuffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(new Uint8Array(fileBuffer));

  const systemConfigExists = getSingleValueResult(
    db,
    "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'systemConfig';"
  );
  const systemConfigSnakeExists = getSingleValueResult(
    db,
    "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'system_config';"
  );

  console.log('DB path:', dbPath);

  if (systemConfigExists && systemConfigSnakeExists) {
    console.log('Warning: both systemConfig and system_config tables exist.');
  }

  if (!systemConfigExists) {
    console.log('Table systemConfig does not exist.');
  } else {
    const configColumns = db.exec("PRAGMA table_info(systemConfig);");
    const columnNames = configColumns.length > 0
      ? configColumns[0].values.map((row) => String(row[1]))
      : [];
    const hasKeyValueSchema = columnNames.includes('config_key') && columnNames.includes('config_value');

    if (hasKeyValueSchema) {
      const rows = db.exec('SELECT config_key, config_value FROM systemConfig ORDER BY config_key;');
      if (!rows || rows.length === 0 || rows[0].values.length === 0) {
        console.log('systemConfig is empty.');
      } else {
        const config = {};
        rows[0].values.forEach((row) => {
          config[row[0]] = parseStoredValue(row[1]);
        });

        console.log('systemConfig rows:', rows[0].values.length);
        console.log(JSON.stringify(config, null, 2));
      }
    } else {
      const legacyRows = db.exec('SELECT * FROM systemConfig LIMIT 1;');
      if (!legacyRows || legacyRows.length === 0 || legacyRows[0].values.length === 0) {
        console.log('systemConfig (legacy schema) is empty.');
      } else {
        const legacyConfig = {};
        const fields = legacyRows[0].columns;
        const values = legacyRows[0].values[0];
        fields.forEach((field, index) => {
          if (field === 'id') {
            return;
          }
          legacyConfig[field] = parseStoredValue(values[index]);
        });

        console.log('systemConfig (legacy schema) row loaded.');
        console.log(JSON.stringify(legacyConfig, null, 2));
      }
    }
  }

  const tablesResult = db.exec(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name;
  `);

  const tableNames = tablesResult.length > 0
    ? tablesResult[0].values.map((row) => String(row[0]))
    : [];

  console.log('tables and row counts:');
  if (tableNames.length === 0) {
    console.log('  (no tables)');
  } else {
    tableNames.forEach((tableName) => {
      console.log(`  ${tableName}: ${getTableRowCount(db, tableName)}`);
    });
  }

  console.log('\nforeign keys:');
  let hasFk = false;
  tableNames.forEach((tableName) => {
    const fkResult = db.exec(`PRAGMA foreign_key_list("${tableName.replace(/"/g, '""')}");`);
    if (fkResult.length > 0 && fkResult[0].values.length > 0) {
      fkResult[0].values.forEach((row) => {
        // columns: id, seq, table, from, to, on_update, on_delete, match
        console.log(`  ${tableName}.${row[3]} → ${row[2]}.${row[4]} (on delete: ${row[6]})`);
        hasFk = true;
      });
    }
  });
  if (!hasFk) {
    console.log('  (no foreign keys found)');
  }
}

main().catch((error) => {
  console.error('Failed to read SQLite data:', error);
  process.exit(1);
});
