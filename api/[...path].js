'use strict';
// Vercel serverless entry point: every /api/... request is handled by the Express app.
// (The file name [...path] is Vercel's catch-all route, so /api/session, /api/login, /api/download ... all arrive here
// with their original URL.)
module.exports = require('../server/app');
