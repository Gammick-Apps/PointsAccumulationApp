#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

function printTable(rows, columns) {
  if (!rows || rows.length === 0) {
    console.log('(empty)');
    return;
  }

  const widths = columns.map((column) => column.length);
  rows.forEach((row) => {
    columns.forEach((column, index) => {
      const value = row[index] == null ? '' : String(row[index]);
      widths[index] = Math.max(widths[index], value.length);
    });
  });

  const header = columns
    .map((column, index) => column.padEnd(widths[index], ' '))
    .join(' | ');
  const separator = widths.map((width) => '-'.repeat(width)).join('-+-');

  console.log(header);
  console.log(separator);

  rows.forEach((row) => {
    const line = row
      .map((value, index) => {
        const printable = value == null ? '' : String(value);
        return printable.padEnd(widths[index], ' ');
      })
      .join(' | ');
    console.log(line);
  });
}

async function main() {
  const providedPath = process.argv[2];
  if (!providedPath) {
    console.error('Usage: node show-sqlite-data.js <path-to-sqlite-file>');
    process.exit(1);
  }

  const dbPath = path.resolve(providedPath);
  if (!fs.existsSync(dbPath)) {
    console.error(`File not found: ${dbPath}`);
    process.exit(1);
  }

  const openDatabase = () =>
    new Promise((resolve, reject) => {
      const connection = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(connection);
      });
    });

  const all = (connection, sql, params = []) =>
    new Promise((resolve, reject) => {
      connection.all(sql, params, (error, rows) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(rows || []);
      });
    });

  const db = await openDatabase();
  try {
    const tableRows = await all(
      db,
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;"
    );

    if (tableRows.length === 0) {
      console.log(`No user tables in ${dbPath}`);
      return;
    }

    const tableNames = tableRows.map((row) => row.name);
    console.log(`Database: ${dbPath}`);
    console.log(`Tables: ${tableNames.join(', ')}`);

    for (const tableName of tableNames) {
      console.log(`\n=== ${tableName} ===`);
      const escaped = String(tableName).replace(/"/g, '""');
      const rows = await all(db, `SELECT * FROM "${escaped}";`);

      if (rows.length === 0) {
        console.log('(empty)');
        continue;
      }

      const columns = Object.keys(rows[0]);
      const values = rows.map((row) => columns.map((column) => row[column]));
      printTable(values, columns);
    }
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
