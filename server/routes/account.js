'use strict';
// Controls/PasswordForm - change own password (Barangay Admin and Super Admin)
const express = require('express');
const db = require('../db');
const auth = require('../auth');
const { wrap, fail } = require('../util');

const router = express.Router();

router.post('/password', wrap(async (req, res) => {
  if (!auth.isLoggedIn(req)) return res.status(401).json({ error: 'Please sign in to continue.', expired: true });
  const body = req.body || {};
  const current = String(body.current || '');
  const next = String(body.newPassword || '');
  const confirm = String(body.confirm || '');
  const row = await db.queryRow('SELECT password_hash FROM users WHERE user_id = @id', '@id', auth.userId(req));
  let okCurrent = false;
  if (row) {
    try { okCurrent = await auth.bcrypt.compare(current, String(row.password_hash)); } catch (e) { okCurrent = false; }
  }
  if (!okCurrent) fail('Current password is incorrect.');
  if (next !== confirm) fail('New password and confirmation do not match.');
  if (!auth.passwordIsStrong(next)) fail('New password must be at least 8 characters and include letters and numbers.');
  await db.execute('UPDATE users SET password_hash = @hash, password_changed = NOW(), date_modified = NOW() WHERE user_id = @id', '@hash', await auth.hashPassword(next), '@id', auth.userId(req));
  res.json({ ok: true, message: 'Password updated.' });
}));

module.exports = router;
