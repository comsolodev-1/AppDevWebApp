'use strict';
// Bantay Barangay - web app (JavaScript / Node.js + Express).
// Serves the HTML/CSS/JS pages, exposes the JSON API under /api, and talks to PostgreSQL.
// Runs locally (server.js) and on Vercel as a serverless function (api/index.js).
const path = require('path');
const express = require('express');
const session = require('./session');
const config = require('./config');
const db = require('./db');
const auth = require('./auth');
const { UserError } = require('./util');

const app = express();
app.disable('x-powered-by');
if (config.isVercel) app.set('trust proxy', true);
else if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : process.env.TRUST_PROXY);

// Security headers (same as the customHeaders in web.config)
app.use((req, res, next) => {
  res.set('X-Frame-Options', 'SAMEORIGIN');
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'same-origin');
  next();
});

// Session: signed HttpOnly cookie, 20 minute sliding timeout (stateless, see server/session.js)
app.use(session);

app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: false, limit: '200kb' }));

// Housekeeping at most once a minute (was done in Site.master / Public.master)
let housekeepingAt = 0;
app.use('/api', async (req, res, next) => {
  if (Date.now() - housekeepingAt > 60 * 1000) {
    housekeepingAt = Date.now();
    try { await db.housekeeping(); } catch (err) { console.error('Housekeeping failed:', err.message); }
  }
  next();
});

// CSRF protection: every state-changing request must carry the token tied to the session
app.use('/api', (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  const token = req.get('x-csrf-token');
  if (!req.session || !req.session.csrf || !token || token !== req.session.csrf) {
    return res.status(403).json({ error: 'Your session has expired. Please reload the page and try again.' });
  }
  next();
});

// Page-level role guard (was <authorization> in web.config + SuperPage / BarangayPage)
function guardPages(requiredRole) {
  return async (req, res, next) => {
    if (!auth.isLoggedIn(req) || auth.role(req) !== requiredRole) {
      await auth.signOut(req);
      return res.redirect('/login.html?expired=1');
    }
    res.set('Cache-Control', 'no-store, no-cache');
    next();
  };
}
// The protected pages live in /pages (not in /public) so the guard always runs, also on Vercel
app.use('/Super', guardPages(auth.SuperAdminRole), express.static(path.join(__dirname, '..', 'pages', 'Super'), { index: false, dotfiles: 'ignore' }));
app.use('/Barangay', guardPages(auth.BarangayAdminRole), express.static(path.join(__dirname, '..', 'pages', 'Barangay'), { index: false, dotfiles: 'ignore' }));

// API
app.use('/api/account', require('./routes/account'));
app.use('/api/barangay', require('./routes/barangay'));
app.use('/api/super', require('./routes/super'));
app.use('/api', require('./routes/public'));
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

// Permission-checked downloads (the only way to get an uploaded file)
app.use(require('./routes/download'));

// Static pages
app.use(express.static(path.join(__dirname, '..', 'public'), { index: 'index.html', dotfiles: 'ignore' }));

// Friendly errors (was customErrors / Error.aspx)
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (err instanceof UserError) return res.status(400).json({ error: err.message });
  if (err && err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'File is too large. Maximum size is ' + require('./uploads').MaxMb + ' MB.' });
  if (err && err.name === 'MulterError') return res.status(400).json({ error: 'The file could not be uploaded.' });
  if (err && (err.type === 'entity.parse.failed' || err.type === 'entity.too.large')) return res.status(400).json({ error: 'The request could not be read.' });
  console.error(err);
  if (req.path.startsWith('/api')) return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  res.redirect('/error.html');
});

module.exports = app;
