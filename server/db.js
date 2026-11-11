'use strict';
// Port of App_Code/Db.vb - MySQL helper. Every query is parameterized (prepared statements).
// Parameters keep the original calling style: query(sql, '@name', value, '@other', value ...)
const mysql = require('mysql2/promise');
const config = require('./config');

const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  charset: 'utf8mb4',
  dateStrings: true,          // DATE / DATETIME come back as plain strings, no time-zone shifting
  waitForConnections: true,
  connectionLimit: 10
});

function bind(sql, args) {
  const values = {};
  for (let i = 0; i + 1 < args.length; i += 2) {
    const v = args[i + 1];
    values[args[i]] = v === undefined ? null : v;
  }
  const params = [];
  const text = sql.replace(/@[A-Za-z_][A-Za-z0-9_]*/g, (name) => {
    if (!Object.prototype.hasOwnProperty.call(values, name)) throw new Error('Missing SQL parameter ' + name);
    params.push(values[name]);
    return '?';
  });
  return [text, params];
}

async function query(sql, ...args) {
  const [text, params] = bind(sql, args);
  const [rows] = await pool.execute(text, params);
  return rows;
}

async function queryRow(sql, ...args) {
  const rows = await query(sql, ...args);
  return rows.length === 0 ? null : rows[0];
}

async function scalar(sql, ...args) {
  const row = await queryRow(sql, ...args);
  if (!row) return null;
  const value = Object.values(row)[0];
  return value === undefined ? null : value;
}

async function scalarInt(sql, ...args) {
  const value = await scalar(sql, ...args);
  return value === null ? 0 : parseInt(value, 10);
}

async function execute(sql, ...args) {
  const [text, params] = bind(sql, args);
  const [result] = await pool.execute(text, params);
  return result.affectedRows;
}

async function insert(sql, ...args) {
  const [text, params] = bind(sql, args);
  const [result] = await pool.execute(text, params);
  return result.insertId;
}

// Transaction helper: work receives tx with tx.execute(sql, ...args) -> insertId
async function inTransaction(work) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const tx = {
      execute: async (sql, ...args) => {
        const [text, params] = bind(sql, args);
        const [result] = await conn.execute(text, params);
        return result.insertId;
      }
    };
    await work(tx);
    await conn.commit();
  } catch (err) {
    try { await conn.rollback(); } catch (e) { /* ignore */ }
    throw err;
  } finally {
    conn.release();
  }
}

async function housekeeping() {
  await execute("UPDATE reporting_period SET period_status = 'Closed', date_closed = NOW() WHERE period_status = 'Open' AND submission_deadline < NOW()");
  await execute("UPDATE activities a SET a.activity_status = 'Closed' WHERE a.activity_status = 'Active' AND NOT EXISTS (SELECT 1 FROM reporting_period p WHERE p.activity_id = a.activity_id AND p.period_status = 'Open')");
  await execute("UPDATE announcements SET status = 'Archived' WHERE status = 'Published' AND expiration_date IS NOT NULL AND expiration_date < NOW()");
  await execute("UPDATE important_dates SET status = 'Past' WHERE status = 'Upcoming' AND event_date < CURDATE()");
}

module.exports = { pool, query, queryRow, scalar, scalarInt, execute, insert, inTransaction, housekeeping };
