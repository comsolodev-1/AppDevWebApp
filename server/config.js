'use strict';
// Replaces the <connectionStrings> / <sessionState> / <authentication> settings of web.config.
// Every value can be overridden with an environment variable.
const path = require('path');

module.exports = {
  port: parseInt(process.env.PORT || '3000', 10),
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'bantay_barangay'
  },
  // 20 minute sliding session, same as web.config
  sessionMinutes: 20,
  sessionSecret: process.env.SESSION_SECRET || 'change-this-secret-before-going-live',
  // Set REQUIRE_SSL=true once the site runs on HTTPS (same as requireSSL="true" in web.config)
  requireSsl: String(process.env.REQUIRE_SSL || '').toLowerCase() === 'true',
  uploadRoot: path.join(__dirname, '..', 'App_Data', 'uploads'),
  maxUploadBytes: 10 * 1024 * 1024
};
