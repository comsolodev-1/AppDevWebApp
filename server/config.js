'use strict';
// Settings (replaces web.config). Every value can be overridden with an environment variable.
module.exports = {
  port: parseInt(process.env.PORT || '3000', 10),
  // Neon / any PostgreSQL connection string, e.g. postgres://user:pass@host/dbname?sslmode=require
  databaseUrl: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/bantay_barangay',
  sessionMinutes: 20,                       // sliding session, same as before
  sessionSecret: process.env.SESSION_SECRET || 'change-this-secret-before-going-live',
  isVercel: !!process.env.VERCEL,
  requireSsl: String(process.env.REQUIRE_SSL || '').toLowerCase() === 'true' || !!process.env.VERCEL,
  // Vercel limits a request body to about 4.5 MB, so uploads are limited to 4 MB
  maxUploadBytes: 4 * 1024 * 1024
};
