'use strict';
// Port of App_Code/Auth.vb - sign in, lockout, session values, role guards.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('./db');

const SuperAdminRole = 'Super Admin';
const BarangayAdminRole = 'Barangay Admin';
const MaxAttempts = 5;
const LockMinutes = 15;

// username + IP -> { count, expires }   (replaces HttpRuntime.Cache)
const attempts = new Map();

function clientIp(req) {
  return req.ip || (req.connection && req.connection.remoteAddress) || '';
}

function lockKey(req, username) {
  return 'lock:' + username.toLowerCase() + ':' + clientIp(req);
}

function currentAttempts(key) {
  const entry = attempts.get(key);
  if (!entry) return 0;
  if (entry.expires < Date.now()) {
    attempts.delete(key);
    return 0;
  }
  return entry.count;
}

function hashPassword(password) {
  return bcrypt.hash(password, 11);
}

function passwordIsStrong(password) {
  if (typeof password !== 'string' || password.length < 8) return false;
  return /\p{L}/u.test(password) && /\p{Nd}/u.test(password);
}

const isLoggedIn = (req) => !!(req.session && req.session.userId);
const userId = (req) => (req.session && req.session.userId) || 0;
const role = (req) => (req.session && req.session.role) || '';
const roleId = (req) => (req.session && req.session.roleId) || 0;
const barangayCode = (req) => (req.session && req.session.barangayCode) || '';
const fullName = (req) => (req.session && req.session.fullName) || '';
const barangayName = (req) => (req.session && req.session.barangayName) || '';
const isSuperAdmin = (req) => role(req) === SuperAdminRole;

function newCsrfToken() {
  return crypto.randomBytes(24).toString('hex');
}

// Returns { ok, message }
async function signIn(req, username, password) {
  username = (username || '').trim();
  const key = lockKey(req, username);
  const count = currentAttempts(key);
  if (count >= MaxAttempts) {
    return { ok: false, message: 'Too many failed attempts. Please try again in ' + LockMinutes + ' minutes.' };
  }

  const row = await db.queryRow("SELECT u.user_id, u.password_hash, u.first_name, u.last_name, u.role_id, r.role_name, u.barangay_code, u.account_status, b.barangay_name, b.status AS barangay_status FROM users u JOIN roles r ON r.role_id = u.role_id LEFT JOIN barangays b ON b.barangay_code = u.barangay_code WHERE u.username = @username", '@username', username);

  let valid = false;
  if (row && typeof password === 'string' && password.length > 0) {
    try {
      valid = await bcrypt.compare(password, String(row.password_hash));
    } catch (e) {
      valid = false;
    }
  }

  if (!valid) {
    attempts.set(key, { count: count + 1, expires: Date.now() + LockMinutes * 60 * 1000 });
    return { ok: false, message: 'Invalid username or password.' };
  }

  if (row.account_status !== 'Active') {
    return { ok: false, message: 'This account is not active. Please contact the DILG Talisay office.' };
  }
  if (row.role_name === BarangayAdminRole && (row.barangay_status === null || row.barangay_status !== 'Active')) {
    return { ok: false, message: 'This barangay is not active. Please contact the DILG Talisay office.' };
  }

  attempts.delete(key);
  await new Promise((resolve, reject) => req.session.regenerate((err) => (err ? reject(err) : resolve())));
  req.session.csrf = newCsrfToken();
  req.session.userId = Number(row.user_id);
  req.session.roleId = Number(row.role_id);
  req.session.role = row.role_name;
  req.session.fullName = row.first_name + ' ' + row.last_name;
  req.session.barangayCode = row.barangay_code === null ? '' : row.barangay_code;
  req.session.barangayName = row.barangay_name === null ? '' : row.barangay_name;
  await db.execute('UPDATE users SET last_login = NOW() WHERE user_id = @id', '@id', Number(row.user_id));
  return { ok: true, message: '' };
}

function signOut(req) {
  return new Promise((resolve) => {
    if (!req.session) return resolve();
    req.session.destroy(() => resolve());
  });
}

function homeUrl(req) {
  if (role(req) === SuperAdminRole) return '/Super/Dashboard.html';
  if (role(req) === BarangayAdminRole) return '/Barangay/Dashboard.html';
  return '/index.html';
}

// Page / API guard equivalent of SecurePage, SuperPage and BarangayPage
function requireRole(requiredRole) {
  return async (req, res, next) => {
    if (!isLoggedIn(req) || (requiredRole && role(req) !== requiredRole)) {
      await signOut(req);
      return res.status(401).json({ error: 'Please sign in to continue.', expired: true });
    }
    res.set('Cache-Control', 'no-store, no-cache');
    next();
  };
}

module.exports = {
  SuperAdminRole, BarangayAdminRole,
  hashPassword, passwordIsStrong, newCsrfToken,
  isLoggedIn, userId, role, roleId, barangayCode, fullName, barangayName, isSuperAdmin,
  signIn, signOut, homeUrl, requireRole, bcrypt
};
