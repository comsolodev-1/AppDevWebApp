'use strict';
// Port of App_Code/Db.vb for PostgreSQL. Every query is parameterized.
// Parameters keep the original calling style: query(sql, '@name', value, '@other', value ...)
const { Pool, types } = require('pg');
const config = require('./config');

// Return values the way the MySQL version did: counts as numbers, dates as plain strings (no time-zone shifting)
types.setTypeParser(20, (v) => parseInt(v, 10));            // bigint (COUNT, SUM)
types.setTypeParser(1082, (v) => v);                         // date
types.setTypeParser(1114, (v) => v.replace(/\.\d+$/, ''));   // timestamp
types.setTypeParser(1184, (v) => v);                         // timestamptz

const local = /@(localhost|127\.0\.0\.1)[:/]/.test(config.databaseUrl);
const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: local ? false : { rejectUnauthorized: true },
  max: config.isVercel ? 3 : 10,
  idleTimeoutMillis: 10000
});
pool.on('error', (err) => console.error('Database pool error:', err.message));

// All times are Philippine local time
const MANILA_NOW = "(NOW() AT TIME ZONE 'Asia/Manila')";

function bind(sql, args) {
  const values = {};
  for (let i = 0; i + 1 < args.length; i += 2) {
    const v = args[i + 1];
    values[args[i]] = v === undefined ? null : v;
  }
  const params = [];
  // every occurrence gets its own placeholder: PostgreSQL cannot reuse one parameter in two type contexts
  let text = sql.replace(/@[A-Za-z_][A-Za-z0-9_]*/g, (name) => {
    if (!Object.prototype.hasOwnProperty.call(values, name)) throw new Error('Missing SQL parameter ' + name);
    params.push(values[name]);
    return '$' + params.length;
  });
  text = text.replace(/\bNOW\(\)/g, MANILA_NOW).replace(/\bCURDATE\(\)/g, '(' + MANILA_NOW + ')::date');
  return [text, params];
}

async function run(runner, sql, args) {
  const [text, params] = bind(sql, args);
  return runner.query(text, params);
}

async function query(sql, ...args) {
  return (await run(pool, sql, args)).rows;
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

// number of matched rows
async function execute(sql, ...args) {
  return (await run(pool, sql, args)).rowCount;
}

// INSERT ... RETURNING <key> AS id  -> the new id
async function insert(sql, ...args) {
  const result = await run(pool, sql, args);
  return result.rows.length > 0 ? result.rows[0].id : 0;
}

async function inTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tx = {
      // INSERT ... RETURNING <key> AS id  -> the new id
      execute: async (sql, ...args) => {
        const result = await run(client, sql, args);
        return result.rows.length > 0 ? result.rows[0].id : 0;
      }
    };
    await work(tx);
    await client.query('COMMIT');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e) { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
}

async function housekeeping() {
  await execute("UPDATE reporting_period SET period_status = 'Closed', date_closed = NOW() WHERE period_status = 'Open' AND submission_deadline < NOW()");
  await execute("UPDATE activities a SET activity_status = 'Closed' WHERE a.activity_status = 'Active' AND NOT EXISTS (SELECT 1 FROM reporting_period p WHERE p.activity_id = a.activity_id AND p.period_status = 'Open')");
  await execute("UPDATE announcements SET status = 'Archived' WHERE status = 'Published' AND expiration_date IS NOT NULL AND expiration_date < NOW()");
  await execute("UPDATE important_dates SET status = 'Past' WHERE status = 'Upcoming' AND event_date < CURDATE()");
  await execute('DELETE FROM login_attempts WHERE expires_at < CURRENT_TIMESTAMP');
}

module.exports = { pool, query, queryRow, scalar, scalarInt, execute, insert, inTransaction, housekeeping };
