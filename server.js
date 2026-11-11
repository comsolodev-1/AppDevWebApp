'use strict';
// Bantay Barangay - web server (JavaScript / Node.js).
// Replaces IIS + ASP.NET Web Forms: it serves the static HTML/CSS/JS pages in /public,
// exposes the JSON API under /api, and talks to MySQL.
const path = require('path');
const express = require('express');
const session = require('express-session');
const config = require('./server/config');
const db = require('./server/db');
const auth = require('./server/auth');
const { UserError } = require('./server/util');

const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : process.env.TRUST_PROXY);

// Security headers (same as the customHeaders in web.config)
app.use((req, res, next) => {
  res.set('X-Frame-Options', 'SAMEORIGIN');
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'same-origin');
  next();
});

// Session: HttpOnly cookie, 20 minute sliding timeout (same as web.config sessionState)
app.use(session({
  name: 'bantay.sid',
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.requireSsl,
    maxAge: config.sessionMinutes * 60 * 1000
  }
}));

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
function guardPages(folder, requiredRole) {
  return async (req, res, next) => {
    if (!/\.html$/i.test(req.path)) return next();
    if (!auth.isLoggedIn(req) || auth.role(req) !== requiredRole) {
      await auth.signOut(req);
      return res.redirect('/login.html?expired=1');
    }
    res.set('Cache-Control', 'no-store, no-cache');
    next();
  };
}
app.use('/Super', guardPages('Super', auth.SuperAdminRole));
app.use('/Barangay', guardPages('Barangay', auth.BarangayAdminRole));

// API
app.use('/api/account', require('./server/routes/account'));
app.use('/api/barangay', require('./server/routes/barangay'));
app.use('/api/super', require('./server/routes/super'));
app.use('/api', require('./server/routes/public'));
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

// Permission-checked downloads (the only way to get an uploaded file)
app.use(require('./server/routes/download'));

// Static pages
app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html', dotfiles: 'ignore' }));

// Friendly errors (was customErrors / Error.aspx)
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (err instanceof UserError) return res.status(400).json({ error: err.message });
  if (err && err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'File is too large. Maximum size is 10 MB.' });
  if (err && err.name === 'MulterError') return res.status(400).json({ error: 'The file could not be uploaded.' });
  if (err && (err.type === 'entity.parse.failed' || err.type === 'entity.too.large')) return res.status(400).json({ error: 'The request could not be read.' });
  console.error(err);
  if (req.path.startsWith('/api')) return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  res.redirect('/error.html');
});

app.listen(config.port, () => {
  console.log('Bantay Barangay is running at http://localhost:' + config.port);
});
