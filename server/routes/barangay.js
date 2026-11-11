'use strict';
// Barangay Admin pages: Dashboard, My Activities, My Reports, Officials & Roster
const express = require('express');
const db = require('../db');
const auth = require('../auth');
const scoring = require('../scoring');
const assignments = require('../assignments');
const uploads = require('../uploads');
const reportBuilder = require('../reportBuilder');
const pdfExport = require('../pdfExport');
const ui = require('../ui');
const { wrap, fail, upload, clean, toInt } = require('../util');

const router = express.Router();
router.use(auth.requireRole(auth.BarangayAdminRole));

router.get('/dashboard', wrap(async (req, res) => {
  const code = auth.barangayCode(req);
  const data = await assignments.forBarangay(code);
  let notSubmitted = 0; let pending = 0; let confirmed = 0; let denied = 0;
  const todo = [];
  for (const row of data) {
    switch (row.display_status) {
      case 'Not Submitted': notSubmitted++; todo.push(row); break;
      case 'Pending': pending++; break;
      case 'Confirmed': confirmed++; break;
      case 'Denied': denied++; todo.push(row); break;
    }
  }
  const year = new Date().getFullYear();
  let rankText = '-';
  let scoreText = '0';
  for (const row of await scoring.ranking(year, 0)) {
    if (row.barangay_code === code) {
      rankText = '#' + row.Rank;
      scoreText = ui.scoreText(row.Score);
    }
  }
  todo.sort((a, b) => (a.submission_deadline < b.submission_deadline ? -1 : a.submission_deadline > b.submission_deadline ? 1 : 0));
  res.json({ year, notSubmitted, pending, confirmed, denied, rankText, scoreText, todo: todo.slice(0, 8) });
}));

router.get('/activities', wrap(async (req, res) => {
  res.json({ rows: await assignments.forBarangay(auth.barangayCode(req)) });
}));

// Submit / resubmit a report
router.post('/submissions', upload.single('file'), wrap(async (req, res) => {
  const code = auth.barangayCode(req);
  const periodId = toInt(req.body.period_id);
  const row = Number.isNaN(periodId) ? null : await assignments.periodForBarangay(periodId, code);
  if (!row) fail('This activity is not assigned to your barangay.');
  const status = row.display_status;
  if (status !== 'Not Submitted' && status !== 'Denied') fail('This activity cannot be submitted right now.');

  const saved = uploads.save(req.file, 'submissions');
  if (!saved.ok) fail(saved.error);

  const isLate = row.is_overdue ? 1 : 0;
  try {
    if (row.submission_id === null) {
      await db.insert("INSERT INTO submissions (period_id, barangay_code, submitted_by, file_name, file_path, date_submitted, submission_status, submission_type, is_late) VALUES (@period, @barangay, @user, @fileName, @filePath, NOW(), 'Pending', 'Regular', @late)",
        '@period', periodId, '@barangay', code, '@user', auth.userId(req), '@fileName', saved.originalName, '@filePath', saved.storedPath, '@late', isLate);
    } else {
      const old = await db.queryRow("SELECT file_path, denial_attachment FROM submissions WHERE date_id = @id AND barangay_code = @b AND submission_status = 'Denied'", '@id', Number(row.submission_id), '@b', code);
      if (!old) {
        uploads.remove(saved.storedPath);
        fail('This submission can no longer be replaced.');
      }
      await db.execute("UPDATE submissions SET file_name = @fileName, file_path = @filePath, submitted_by = @user, date_submitted = NOW(), submission_status = 'Pending', submission_type = 'Resubmission', is_late = @late, score = NULL, confirmed_by = NULL, confirmation_date = NULL, remarks = NULL, denial_reason = NULL, denial_attachment = NULL, resubmission_count = resubmission_count + 1, date_modified = NOW() WHERE date_id = @id AND barangay_code = @b",
        '@fileName', saved.originalName, '@filePath', saved.storedPath, '@user', auth.userId(req), '@late', isLate, '@id', Number(row.submission_id), '@b', code);
      uploads.remove(old.file_path);
      if (old.denial_attachment !== null) uploads.remove(old.denial_attachment);
    }
  } catch (err) {
    if (err.name === 'UserError') throw err;
    console.error(err);
    uploads.remove(saved.storedPath);
    fail('The report could not be saved. Please try again.');
  }
  res.json({ ok: true, message: 'Report submitted. It is now waiting for review.' });
}));

// Remove a Pending submission
router.delete('/submissions/:periodId', wrap(async (req, res) => {
  const code = auth.barangayCode(req);
  const periodId = toInt(req.params.periodId);
  const row = Number.isNaN(periodId) ? null : await assignments.periodForBarangay(periodId, code);
  if (!row) return res.json({ ok: true });
  if (row.display_status === 'Pending') {
    const file = await db.queryRow("SELECT file_path FROM submissions WHERE date_id = @id AND barangay_code = @b AND submission_status = 'Pending'", '@id', Number(row.submission_id), '@b', code);
    if (file) {
      await db.execute("DELETE FROM submissions WHERE date_id = @id AND barangay_code = @b AND submission_status = 'Pending'", '@id', Number(row.submission_id), '@b', code);
      uploads.remove(file.file_path);
      return res.json({ ok: true, message: 'Submission removed. You can submit the correct file now.' });
    }
  }
  res.json({ ok: true });
}));

router.get('/history', wrap(async (req, res) => {
  let year = toInt(req.query.year);
  if (Number.isNaN(year)) year = new Date().getFullYear();
  const rows = await db.query('SELECT s.date_id, a.activity_name, p.period_name, s.date_submitted, s.file_name, s.submission_status, s.is_late, s.score, s.remarks, s.denial_reason FROM submissions s JOIN reporting_period p ON p.period_id = s.period_id JOIN activities a ON a.activity_id = p.activity_id WHERE s.barangay_code = @b AND YEAR(p.submission_deadline) = @y ORDER BY s.date_submitted DESC', '@b', auth.barangayCode(req), '@y', year);
  res.json({ rows });
}));

router.get('/report-card.pdf', wrap(async (req, res) => {
  let year = toInt(req.query.year);
  if (Number.isNaN(year)) year = new Date().getFullYear();
  const report = await reportBuilder.reportCard(auth.barangayCode(req), year);
  pdfExport.send(res, report, 'report-card-' + year + '.pdf');
}));

// ---- Officials and Roster ----
const rosterList = "SELECT roster_id, CONCAT(first_name, ' ', COALESCE(CONCAT(LEFT(middle_name, 1), '. '), ''), last_name, COALESCE(CONCAT(' ', suffix), '')) AS full_name, position, committee, contact_number, status FROM barangay_roster WHERE barangay_code = @b ORDER BY last_name, first_name";

router.get('/roster', wrap(async (req, res) => {
  res.json({ rows: await db.query(rosterList, '@b', auth.barangayCode(req)) });
}));

router.get('/roster/:id', wrap(async (req, res) => {
  const row = await db.queryRow('SELECT * FROM barangay_roster WHERE roster_id = @id AND barangay_code = @b', '@id', toInt(req.params.id), '@b', auth.barangayCode(req));
  if (!row) return res.status(404).json({ error: 'Not found.' });
  res.json({ row });
}));

function rosterValues(body) {
  const first = String(body.first_name || '').trim();
  const last = String(body.last_name || '').trim();
  const position = String(body.position || '').trim();
  if (first.length === 0 || last.length === 0 || position.length === 0) fail('First name, last name and position are required.');
  const status = body.status === 'Inactive' ? 'Inactive' : 'Active';
  return {
    first, last, position, status,
    middle: clean(body.middle_name), suffix: clean(body.suffix), committee: clean(body.committee),
    contact: clean(body.contact_number), email: clean(body.email), address: clean(body.address)
  };
}

router.post('/roster', wrap(async (req, res) => {
  const v = rosterValues(req.body || {});
  await db.execute("INSERT INTO barangay_roster (barangay_code, first_name, middle_name, last_name, suffix, position, committee, contact_number, email, address, status, date_activated) VALUES (@b, @first, @middle, @last, @suffix, @position, @committee, @contact, @email, @address, @status, IF(@status = 'Active', NOW(), NULL))",
    '@b', auth.barangayCode(req), '@first', v.first, '@middle', v.middle, '@last', v.last, '@suffix', v.suffix, '@position', v.position, '@committee', v.committee, '@contact', v.contact, '@email', v.email, '@address', v.address, '@status', v.status);
  res.json({ ok: true, message: 'Official added.' });
}));

router.put('/roster/:id', wrap(async (req, res) => {
  const v = rosterValues(req.body || {});
  await db.execute('UPDATE barangay_roster SET first_name = @first, middle_name = @middle, last_name = @last, suffix = @suffix, position = @position, committee = @committee, contact_number = @contact, email = @email, address = @address, status = @status, date_modified = NOW() WHERE roster_id = @id AND barangay_code = @b',
    '@first', v.first, '@middle', v.middle, '@last', v.last, '@suffix', v.suffix, '@position', v.position, '@committee', v.committee, '@contact', v.contact, '@email', v.email, '@address', v.address, '@status', v.status, '@id', toInt(req.params.id), '@b', auth.barangayCode(req));
  res.json({ ok: true, message: 'Official updated.' });
}));

router.delete('/roster/:id', wrap(async (req, res) => {
  await db.execute('DELETE FROM barangay_roster WHERE roster_id = @id AND barangay_code = @b', '@id', toInt(req.params.id), '@b', auth.barangayCode(req));
  res.json({ ok: true, message: 'Official deleted.' });
}));

module.exports = router;
