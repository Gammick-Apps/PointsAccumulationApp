const fs = require('fs');
const path = require('path');
const os = require('os');
const initSqlJs = require('sql.js/dist/sql-asm.js');

const DB_FILE_NAME = 'points-accumulation.sqlite';

function getCandidatePaths() {
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  const productName = 'צבירת נקודות';

  const candidates = [
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

  const tableExists = getSingleValueResult(
    db,
    "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'system_config';"
  );

  console.log('DB path:', dbPath);

  if (!tableExists) {
    console.log('Table system_config does not exist.');
  } else {
    const rows = db.exec('SELECT config_key, config_value FROM system_config ORDER BY config_key;');
    if (!rows || rows.length === 0 || rows[0].values.length === 0) {
      console.log('system_config is empty.');
    } else {
      const config = {};
      rows[0].values.forEach((row) => {
        config[row[0]] = parseStoredValue(row[1]);
      });

      console.log('system_config rows:', rows[0].values.length);
      console.log(JSON.stringify(config, null, 2));
    }
  }

  const studentsTableExists = getSingleValueResult(
    db,
    "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'students';"
  );

  if (!studentsTableExists) {
    console.log('Table students does not exist.');
  } else {
    const studentRows = db.exec(`
      SELECT tz, code, barcode, name, grade, points, position, tasks, tasks_number
      FROM students
      ORDER BY grade, name, tz;
    `);

    if (!studentRows || studentRows.length === 0 || studentRows[0].values.length === 0) {
      console.log('students is empty.');
    } else {
      const studentsData = studentRows[0].values.map((row) => ({
        tz: row[0],
        code: row[1],
        barcode: row[2],
        name: row[3],
        grade: row[4],
        points: row[5],
        position: row[6],
        tasks: row[7],
        tasks_number: row[8]
      }));

      console.log('students rows:', studentRows[0].values.length);
      console.log(JSON.stringify(studentsData, null, 2));
    }
  }

  const uniqTasksTableExists = getSingleValueResult(
    db,
    "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'uniqTasks';"
  );

  if (!uniqTasksTableExists) {
    console.log('Table uniqTasks does not exist.');
  } else {
    const uniqTasksColumns = new Set(db.exec('PRAGMA table_info(uniqTasks);')[0]?.values?.map((row) => String(row[1])) || []);
    const expectedUniqTasksCols = ['id', 'code', 'name', 'points', 'multiple', 'type', 'class', 'show', 'position'];
    const hasStrictUniqTasksSchema = expectedUniqTasksCols.every((col) => uniqTasksColumns.has(col));
    const showColumn = uniqTasksColumns.has('show') ? 'show' : '1';

    if (!hasStrictUniqTasksSchema) {
      console.warn('uniqTasks schema is not fully migrated yet (missing show column). Run the app once to apply migration.');
    }

    const uniqTasksRows = db.exec(`
      SELECT code, name, points, multiple, type, class, ${showColumn} AS show, position
      FROM uniqTasks
      ORDER BY CAST(code AS INTEGER), code;
    `);

    if (!uniqTasksRows || uniqTasksRows.length === 0 || uniqTasksRows[0].values.length === 0) {
      console.log('uniqTasks is empty.');
    } else {
      const uniqTasksData = uniqTasksRows[0].values.map((row) => ({
        code: row[0],
        name: row[1],
        points: row[2],
        multiple: Boolean(row[3]),
        type: row[4],
        class: Boolean(row[5]),
        show: Boolean(row[6]),
        position: row[7]
      }));

      console.log('uniqTasks rows:', uniqTasksRows[0].values.length);
      console.log(JSON.stringify(uniqTasksData, null, 2));
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
