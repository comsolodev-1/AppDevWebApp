'use strict';
// Small helpers shared by the route files.
const multer = require('multer');
const config = require('./config');

// Async route wrapper: unexpected errors go to the Express error handler (-> friendly error)
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Message the user should see (HTTP 400)
class UserError extends Error {}
const fail = (message) => { throw new UserError(message); };

// Files are validated by uploads.js (type, size, signature), so keep them in memory until then.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxUploadBytes + 1024 * 1024, files: 1 } });

// null for empty text (original: Clean / NullIfEmpty)
function clean(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text.length === 0 ? null : text;
}

function toInt(value) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : NaN;
}

module.exports = { wrap, UserError, fail, upload, clean, toInt };
