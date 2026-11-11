'use strict';
// Super Admin pages: Dashboard, Activities, Submissions, Reports, Announcements, Important Dates, Accounts
const express = require('express');
const db = require('../db');
const auth = require('../auth');
const scoring = require('../scoring');
const uploads = require('../uploads');
const periodHelper = require('../periodHelper');
const reportBuilder = require('../reportBuilder');
const pdfExport = require('../pdfExport');
const ui = require('../ui');
const { wrap, fail, upload, clean, toInt, UserError } = require('../util');

const router = express.Router();
router.use(auth.requireRole(auth.SuperAdminRole));

const ADMIN_ROLE_SQL = "(SELECT role_id FROM roles WHERE role_name = 'Barangay Admin')";

router.get('/meta', wrap(async (req, res) => {
  res.json({
    frequencies: periodHelper.Frequencies,
    reports: reportBuilder.Keys.map(([key, label]) => ({ key, label })),
    barangays: await db.query("SELECT barangay_code, barangay_name FROM barangays WHERE status = 'Active' ORDER BY barangay_name"),
    allBarangays: await db.query('SELECT barangay_code, barangay_name FROM barangays ORDER BY barangay_name'),
    roles: await db.query("SELECT role_id, role_name FROM roles WHERE role_name <> 'Viewer' ORDER BY role_id")
  });
}));

// ---------------- Dashboard ----------------
router.get('/dashboard', wrap(async (req, res) => {
  const year = ui.currentYear();
  const pending = await db.scalarInt("SELECT COUNT(*) FROM submissions WHERE submission_status = 'Pending'");
  const activeActivities = await db.scalarInt("SELECT COUNT(*) FROM activities WHERE activity_status = 'Active'");
  const confirmed = await db.scalarInt("SELECT COUNT(*) FROM submissions s JOIN reporting_period p ON p.period_id = s.period_id WHERE s.submission_status = 'Confirmed' AND EXTRACT(YEAR FROM p.submission_deadline) = @y", '@y', year);
  const late = await db.scalarInt('SELECT COUNT(*) FROM submissions s JOIN reporting_period p ON p.period_id = s.period_id WHERE s.is_late = 1 AND EXTRACT(YEAR FROM p.submission_deadline) = @y', '@y', year);
  const missing = await db.scalarInt("SELECT COUNT(*) FROM reporting_period p JOIN activity_barangays ab ON ab.activity_id = p.activity_id JOIN activities a ON a.activity_id = p.activity_id WHERE a.activity_status <> 'Archived' AND p.submission_deadline < NOW() AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.period_id = p.period_id AND s.barangay_code = ab.barangay_code)");
  const pendingRows = await db.query("SELECT b.barangay_name, a.activity_name, p.period_name, s.date_submitted, s.is_late FROM submissions s JOIN barangays b ON b.barangay_code = s.barangay_code JOIN reporting_period p ON p.period_id = s.period_id JOIN activities a ON a.activity_id = p.activity_id WHERE s.submission_status = 'Pending' ORDER BY s.date_submitted LIMIT 8");
  res.json({ year, pending, activeActivities, confirmed, late, missing, pendingRows, ranking: await scoring.ranking(year, 0) });
}));

// ---------------- Activities ----------------
router.get('/activities', wrap(async (req, res) => {
  const search = '%' + String(req.query.search || '').trim() + '%';
  const status = String(req.query.status || '');
  const sql = 'SELECT a.activity_id, a.activity_name, a.description, a.frequency, a.activity_status, a.is_public, ' +
    '(SELECT MAX(p.submission_deadline) FROM reporting_period p WHERE p.activity_id = a.activity_id) AS latest_deadline, ' +
    '(SELECT COUNT(*) FROM activity_barangays ab WHERE ab.activity_id = a.activity_id) AS barangay_count ' +
    'FROM activities a WHERE a.activity_name ILIKE @search';
  const rows = status.length > 0
    ? await db.query(sql + ' AND a.activity_status = @status ORDER BY a.date_created DESC', '@search', search, '@status', status)
    : await db.query(sql + ' ORDER BY a.date_created DESC', '@search', search);
  res.json({ rows });
}));

router.get('/activities/:id', wrap(async (req, res) => {
  const activity = await db.queryRow('SELECT * FROM activities WHERE activity_id = @id', '@id', toInt(req.params.id));
  if (!activity) return res.status(404).json({ error: 'Activity not found.' });
  const assigned = await db.query('SELECT barangay_code FROM activity_barangays WHERE activity_id = @id', '@id', toInt(req.params.id));
  res.json({ activity, assigned: assigned.map((r) => r.barangay_code) });
}));

function parseBarangays(value) {
  let list = value;
  if (typeof list === 'string') {
    try { list = JSON.parse(list); } catch (e) { list = []; }
  }
  return Array.isArray(list) ? list.map(String) : [];
}

async function saveActivity(req, res, activityId) {
  const body = req.body || {};
  const name = String(body.activity_name || '').trim();
  if (name.length === 0) fail('Activity title is required.');
  const selected = parseBarangays(body.barangays);
  if (selected.length === 0) fail('Assign the activity to at least one barangay.');

  const frequency = String(body.frequency || '');
  let deadline = null;
  if (activityId === 0) {
    deadline = periodHelper.parseDate(body.deadline);
    if (!deadline) fail('Please choose a valid submission deadline.');
    if (periodHelper.Frequencies.indexOf(frequency) < 0) fail('Please choose a valid reporting period (frequency).');
  }

  let templatePath = null;
  let templateName = null;
  if (req.file) {
    const saved = await uploads.save(req.file, 'templates');
    if (!saved.ok) fail(saved.error);
    templatePath = saved.storedPath;
    templateName = saved.originalName;
  }
  const path = require('path');
  const templateType = templateName !== null ? path.extname(templateName).replace(/^\./, '').toLowerCase() : null;
  const isPublic = body.is_public === '1' || body.is_public === 'true' || body.is_public === true || body.is_public === 1 ? 1 : 0;
  const description = clean(body.description);
  const instructions = clean(body.instructions);
  let oldTemplate = null;
  let message;

  try {
    if (activityId === 0) {
      await db.inTransaction(async (tx) => {
        const newId = await tx.execute("INSERT INTO activities (activity_name, description, frequency, instructions, template_file_name, template_file_type, template_link, default_deadline, required_submission, activity_status, is_public, created_by) VALUES (@name, @description, @frequency, @instructions, @tname, @ttype, @tlink, @deadline, 1, 'Active', @public, @user) RETURNING activity_id AS id",
          '@name', name, '@description', description, '@frequency', frequency, '@instructions', instructions, '@tname', templateName, '@ttype', templateType, '@tlink', templatePath, '@deadline', periodHelper.fmt(deadline), '@public', isPublic, '@user', auth.userId(req));
        await periodHelper.createInTransaction(tx, newId, frequency, deadline, auth.userId(req));
        for (const code of selected) {
          await tx.execute('INSERT INTO activity_barangays (activity_id, barangay_code) VALUES (@a, @b)', '@a', newId, '@b', code);
        }
      });
      message = 'Activity created and assigned to ' + selected.length + ' barangays.';
    } else {
      const existing = await db.queryRow('SELECT template_link FROM activities WHERE activity_id = @id', '@id', activityId);
      if (!existing) {
        await uploads.remove(templatePath);
        return res.status(404).json({ error: 'Activity not found.' });
      }
      if (templatePath !== null && existing.template_link !== null) oldTemplate = existing.template_link;
      await db.inTransaction(async (tx) => {
        await tx.execute('UPDATE activities SET activity_name = @name, description = @description, instructions = @instructions, is_public = @public, date_modified = NOW() WHERE activity_id = @id',
          '@name', name, '@description', description, '@instructions', instructions, '@public', isPublic, '@id', activityId);
        if (templatePath !== null) {
          await tx.execute('UPDATE activities SET template_file_name = @tname, template_file_type = @ttype, template_link = @tlink WHERE activity_id = @id', '@tname', templateName, '@ttype', templateType, '@tlink', templatePath, '@id', activityId);
        }
        await tx.execute('DELETE FROM activity_barangays WHERE activity_id = @id', '@id', activityId);
        for (const code of selected) {
          await tx.execute('INSERT INTO activity_barangays (activity_id, barangay_code) VALUES (@a, @b)', '@a', activityId, '@b', code);
        }
      });
      if (oldTemplate !== null) await uploads.remove(oldTemplate);
      message = 'Activity updated.';
    }
  } catch (err) {
    if (err instanceof UserError) throw err;
    console.error(err);
    await uploads.remove(templatePath);
    fail('The activity could not be saved. Please try again.');
  }
  res.json({ ok: true, message });
}

router.post('/activities', upload.single('template'), wrap((req, res) => saveActivity(req, res, 0)));
router.put('/activities/:id', upload.single('template'), wrap((req, res) => saveActivity(req, res, toInt(req.params.id))));

router.delete('/activities/:id', wrap(async (req, res) => {
  const activityId = toInt(req.params.id);
  const activity = await db.queryRow('SELECT * FROM activities WHERE activity_id = @id', '@id', activityId);
  if (!activity) return res.json({ ok: true });
  const submissionCount = await db.scalarInt('SELECT COUNT(*) FROM submissions s JOIN reporting_period p ON p.period_id = s.period_id WHERE p.activity_id = @id', '@id', activityId);
  if (submissionCount > 0) {
    await db.execute("UPDATE activities SET activity_status = 'Archived', date_archived = NOW(), date_modified = NOW() WHERE activity_id = @id", '@id', activityId);
    return res.json({ ok: true, message: 'The activity already has submissions, so it was archived instead of deleted.' });
  }
  await db.execute('DELETE FROM activities WHERE activity_id = @id', '@id', activityId);
  if (activity.template_link !== null) await uploads.remove(activity.template_link);
  res.json({ ok: true, message: 'Activity deleted.' });
}));

router.post('/activities/:id/periods', wrap(async (req, res) => {
  const activityId = toInt(req.params.id);
  const activity = await db.queryRow("SELECT frequency FROM activities WHERE activity_id = @id AND activity_status <> 'Archived'", '@id', activityId);
  const deadline = periodHelper.parseDate((req.body || {}).deadline);
  if (!activity || !deadline) fail('Please choose a valid deadline.');
  const frequency = activity.frequency;
  const periodName = periodHelper.nameFor(frequency, deadline);
  if (await db.scalarInt('SELECT COUNT(*) FROM reporting_period WHERE activity_id = @id AND period_name = @name', '@id', activityId, '@name', periodName) > 0) {
    fail('A period named "' + periodName + '" already exists for this activity.');
  }
  await db.inTransaction(async (tx) => {
    await periodHelper.createInTransaction(tx, activityId, frequency, deadline, auth.userId(req));
    await tx.execute("UPDATE activities SET activity_status = 'Active', date_modified = NOW() WHERE activity_id = @id", '@id', activityId);
  });
  res.json({ ok: true, message: 'Period "' + periodName + '" added.' });
}));

// ---------------- Submissions ----------------
router.get('/submissions', wrap(async (req, res) => {
  const sql = 'SELECT s.date_id, b.barangay_name, a.activity_name, p.period_name, s.date_submitted, s.is_late, s.file_name, s.submission_status, s.score, s.remarks, s.denial_reason ' +
    'FROM submissions s JOIN barangays b ON b.barangay_code = s.barangay_code JOIN reporting_period p ON p.period_id = s.period_id JOIN activities a ON a.activity_id = p.activity_id ' +
    "WHERE a.activity_name ILIKE @search AND (@status = '' OR s.submission_status = @status) AND (@barangay = '' OR s.barangay_code = @barangay) ORDER BY s.date_submitted DESC";
  const rows = await db.query(sql, '@search', '%' + String(req.query.search || '').trim() + '%', '@status', String(req.query.status || ''), '@barangay', String(req.query.barangay || ''));
  res.json({ rows });
}));

router.get('/submissions/:id', wrap(async (req, res) => {
  const row = await db.queryRow("SELECT s.date_id, b.barangay_name, a.activity_name, p.period_name, p.submission_deadline, s.date_submitted, s.is_late, s.file_name FROM submissions s JOIN barangays b ON b.barangay_code = s.barangay_code JOIN reporting_period p ON p.period_id = s.period_id JOIN activities a ON a.activity_id = p.activity_id WHERE s.date_id = @id AND s.submission_status = 'Pending'", '@id', toInt(req.params.id));
  if (!row) return res.status(404).json({ error: 'Not found.' });
  row.score_if_confirmed = scoring.scoreFor(Number(row.is_late) === 1);
  res.json({ row });
}));

router.post('/submissions/:id/confirm', wrap(async (req, res) => {
  const id = toInt(req.params.id);
  const row = await db.queryRow("SELECT is_late FROM submissions WHERE date_id = @id AND submission_status = 'Pending'", '@id', id);
  if (!row) fail('This submission was already reviewed.');
  const remark = ['Good', 'Needs Improvement', 'Bad'].indexOf((req.body || {}).remark) >= 0 ? req.body.remark : 'Good';
  const score = scoring.scoreFor(Number(row.is_late) === 1);
  await db.execute("UPDATE submissions SET submission_status = 'Confirmed', score = @score, confirmed_by = @user, confirmation_date = NOW(), remarks = @remark, denial_reason = NULL, date_modified = NOW() WHERE date_id = @id AND submission_status = 'Pending'",
    '@score', score, '@user', auth.userId(req), '@remark', remark, '@id', id);
  res.json({ ok: true, message: 'Submission confirmed (' + ui.scoreText(score) + ' point).' });
}));

router.post('/submissions/:id/deny', upload.single('attachment'), wrap(async (req, res) => {
  const id = toInt(req.params.id);
  const reason = String((req.body || {}).reason || '').trim();
  if (reason.length === 0) fail('Please enter a reason for denying the submission.');
  let attachmentPath = null;
  if (req.file) {
    const saved = await uploads.save(req.file, 'denials');
    if (!saved.ok) fail(saved.error);
    attachmentPath = saved.storedPath;
  }
  const changed = await db.execute("UPDATE submissions SET submission_status = 'Denied', score = NULL, confirmed_by = @user, confirmation_date = NOW(), remarks = NULL, denial_reason = @reason, denial_attachment = @attachment, date_modified = NOW() WHERE date_id = @id AND submission_status = 'Pending'",
    '@user', auth.userId(req), '@reason', reason, '@attachment', attachmentPath, '@id', id);
  if (changed === 0) await uploads.remove(attachmentPath);
  res.json({ ok: true, message: 'Submission denied. The barangay can now resubmit.' });
}));

// ---------------- Reports ----------------
router.get('/reports/activities', wrap(async (req, res) => {
  const frequency = String(req.query.frequency || '');
  res.json({ rows: await db.query("SELECT activity_id, activity_name FROM activities WHERE frequency = @f AND activity_status <> 'Archived' ORDER BY activity_name", '@f', frequency) });
}));

router.get('/reports/periods', wrap(async (req, res) => {
  res.json({ rows: await db.query('SELECT period_id, period_name FROM reporting_period WHERE activity_id = @a ORDER BY submission_deadline DESC', '@a', toInt(req.query.activity)) });
}));

async function buildReport(q) {
  let year = toInt(q.year); if (Number.isNaN(year)) year = ui.currentYear();
  let month = toInt(q.month); if (Number.isNaN(month)) month = ui.currentMonth();
  if (month < 0 || month > 12) month = ui.currentMonth();
  const key = String(q.key || '');
  switch (key) {
    case 'weekly':
    case 'monthly':
    case 'quarterly': {
      const period = toInt(q.period);
      if (Number.isNaN(period)) return null;
      const label = key === 'weekly' ? 'Weekly' : key === 'monthly' ? 'Monthly' : 'Quarterly';
      return reportBuilder.activitySummary(period, label);
    }
    case 'ranking': return reportBuilder.ranking(year, month);
    case 'roster': return reportBuilder.roster(String(q.barangay || ''));
    case 'calendar': return reportBuilder.monthlyCalendar(year, Math.max(month, 1));
    case 'announcements': return reportBuilder.announcements(year, Math.max(month, 1));
    case 'late': return reportBuilder.lateSubmissions(year, Math.max(month, 1));
    case 'nonsubmission': return reportBuilder.nonSubmission(year, Math.max(month, 1));
    case 'reportcard': {
      const code = String(q.barangay || '');
      if (code.length === 0) return null;
      return reportBuilder.reportCard(code, year);
    }
  }
  return null;
}

const NO_REPORT = 'Choose an activity and period first. Create an activity with that frequency if none is listed.';

router.get('/reports/preview', wrap(async (req, res) => {
  const report = await buildReport(req.query);
  if (!report) fail(NO_REPORT);
  res.json({ report });
}));

router.get('/reports/pdf', wrap(async (req, res) => {
  const report = await buildReport(req.query);
  if (!report) fail(NO_REPORT);
  pdfExport.send(res, report, String(req.query.key) + '-report.pdf');
}));

// ---------------- Announcements ----------------
router.get('/announcements', wrap(async (req, res) => {
  res.json({ rows: await db.query('SELECT announcement_id, title, priority, visibility_type, date_published, status, is_pinned FROM announcements ORDER BY date_created DESC') });
}));

router.get('/announcements/:id', wrap(async (req, res) => {
  const row = await db.queryRow('SELECT * FROM announcements WHERE announcement_id = @id', '@id', toInt(req.params.id));
  if (!row) return res.status(404).json({ error: 'Not found.' });
  res.json({ row });
}));

const VISIBILITY = ['All', 'Specific Role', 'Specific Barangay'];

async function saveAnnouncement(req, res, id) {
  const b = req.body || {};
  const title = String(b.title || '').trim();
  const content = String(b.content || '').trim();
  if (title.length === 0 || content.length === 0) fail('Title and content are required.');
  const visibility = VISIBILITY.indexOf(b.visibility_type) >= 0 ? b.visibility_type : 'All';
  const targetBarangayCode = String(b.target_barangay_code || '');
  if (visibility === 'Specific Barangay' && targetBarangayCode.length === 0) fail('Choose a target barangay.');

  let expiration = null;
  if (String(b.expiration_date || '').trim().length > 0) {
    const parsed = periodHelper.parseDate(b.expiration_date);
    if (!parsed) fail('Expiration date is not valid.');
    expiration = periodHelper.endOfDay(parsed);
  }

  let filePath = null;
  let fileName = null;
  if (req.file) {
    const saved = await uploads.save(req.file, 'announcements');
    if (!saved.ok) fail(saved.error);
    filePath = saved.storedPath;
    fileName = saved.originalName;
  }

  const targetRole = visibility === 'Specific Role' ? toInt(b.target_role_id) : null;
  const targetBarangay = visibility === 'Specific Barangay' ? targetBarangayCode : null;
  const pinned = b.is_pinned === '1' || b.is_pinned === 'true' || b.is_pinned === true || b.is_pinned === 1 ? 1 : 0;
  const priority = ['Low', 'Medium', 'High'].indexOf(b.priority) >= 0 ? b.priority : 'Medium';
  const status = ['Draft', 'Published', 'Archived'].indexOf(b.status) >= 0 ? b.status : 'Published';
  let message;

  try {
    if (id === 0) {
      await db.execute("INSERT INTO announcements (title, content, attachment_file_name, attachment_file_path, created_by, date_published, expiration_date, priority, status, visibility_type, target_role_id, target_barangay_code, is_pinned) VALUES (@title, @content, @fname, @fpath, @user, CASE WHEN @status = 'Published' THEN NOW() ELSE NULL END, @expiration, @priority, @status, @visibility, @role, @barangay, @pinned)",
        '@title', title, '@content', content, '@fname', fileName, '@fpath', filePath, '@user', auth.userId(req), '@expiration', expiration, '@priority', priority, '@status', status, '@visibility', visibility, '@role', targetRole, '@barangay', targetBarangay, '@pinned', pinned);
      message = 'Announcement saved.';
    } else {
      const old = await db.queryRow('SELECT attachment_file_path FROM announcements WHERE announcement_id = @id', '@id', id);
      if (!old) {
        await uploads.remove(filePath);
        return res.status(404).json({ error: 'Announcement not found.' });
      }
      await db.execute("UPDATE announcements SET title = @title, content = @content, expiration_date = @expiration, priority = @priority, status = @status, visibility_type = @visibility, target_role_id = @role, target_barangay_code = @barangay, is_pinned = @pinned, date_published = CASE WHEN @status = 'Published' AND date_published IS NULL THEN NOW() ELSE date_published END, date_modified = NOW() WHERE announcement_id = @id",
        '@title', title, '@content', content, '@expiration', expiration, '@priority', priority, '@status', status, '@visibility', visibility, '@role', targetRole, '@barangay', targetBarangay, '@pinned', pinned, '@id', id);
      if (filePath !== null) {
        await db.execute('UPDATE announcements SET attachment_file_name = @fname, attachment_file_path = @fpath WHERE announcement_id = @id', '@fname', fileName, '@fpath', filePath, '@id', id);
        if (old.attachment_file_path !== null) await uploads.remove(old.attachment_file_path);
      }
      message = 'Announcement updated.';
    }
  } catch (err) {
    if (err instanceof UserError) throw err;
    console.error(err);
    await uploads.remove(filePath);
    fail('The announcement could not be saved. Please try again.');
  }
  res.json({ ok: true, message });
}

router.post('/announcements', upload.single('attachment'), wrap((req, res) => saveAnnouncement(req, res, 0)));
router.put('/announcements/:id', upload.single('attachment'), wrap((req, res) => saveAnnouncement(req, res, toInt(req.params.id))));

router.delete('/announcements/:id', wrap(async (req, res) => {
  const id = toInt(req.params.id);
  const row = await db.queryRow('SELECT * FROM announcements WHERE announcement_id = @id', '@id', id);
  if (!row) return res.json({ ok: true });
  await db.execute('DELETE FROM announcements WHERE announcement_id = @id', '@id', id);
  if (row.attachment_file_path !== null) await uploads.remove(row.attachment_file_path);
  res.json({ ok: true, message: 'Announcement deleted.' });
}));

// ---------------- Important Dates ----------------
router.get('/dates', wrap(async (req, res) => {
  res.json({ rows: await db.query('SELECT date_id, event_date, title, event_type, location, visibility_type, status FROM important_dates ORDER BY event_date DESC') });
}));

router.get('/dates/:id', wrap(async (req, res) => {
  const row = await db.queryRow('SELECT * FROM important_dates WHERE date_id = @id', '@id', toInt(req.params.id));
  if (!row) return res.status(404).json({ error: 'Not found.' });
  res.json({ row });
}));

function timeValue(text) {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(text || '').trim());
  if (!m || +m[1] > 23 || +m[2] > 59) return null;
  return String(m[1]).padStart(2, '0') + ':' + m[2] + ':' + (m[3] || '00');
}

async function saveDate(req, res, id) {
  const b = req.body || {};
  const eventDate = periodHelper.parseDate(b.event_date);
  if (String(b.title || '').trim().length === 0 || !eventDate) fail('Title and a valid date are required.');
  const reminderDate = periodHelper.parseDate(b.reminder_date);
  const reminder = String(b.reminder_date || '').trim().length > 0 && reminderDate ? periodHelper.fmt(reminderDate) : null;

  const visibility = VISIBILITY.indexOf(b.visibility_type) >= 0 ? b.visibility_type : 'All';
  const targetRole = visibility === 'Specific Role' ? toInt(b.target_role_id) : null;
  const targetBarangay = visibility === 'Specific Barangay' && String(b.target_barangay_code || '').length > 0 ? String(b.target_barangay_code) : null;
  const type = ['Meeting', 'Deadline', 'Holiday', 'Event', 'Training'].indexOf(b.event_type) >= 0 ? b.event_type : 'Meeting';
  const status = periodHelper.fmt(eventDate) < ui.todayString() ? 'Past' : 'Upcoming';
  const values = ['@title', String(b.title).trim(), '@description', clean(b.description), '@date', periodHelper.fmt(eventDate), '@start', timeValue(b.start_time), '@end', timeValue(b.end_time), '@type', type, '@visibility', visibility, '@role', targetRole, '@barangay', targetBarangay, '@location', clean(b.location), '@status', status, '@reminder', reminder];

  if (id === 0) {
    await db.execute('INSERT INTO important_dates (title, description, event_date, start_time, end_time, event_type, created_by, visibility_type, target_role_id, target_barangay_code, location, status, reminder_date) VALUES (@title, @description, @date, @start, @end, @type, @user, @visibility, @role, @barangay, @location, @status, @reminder)',
      ...values, '@user', auth.userId(req));
    res.json({ ok: true, message: 'Date added.' });
  } else {
    await db.execute('UPDATE important_dates SET title = @title, description = @description, event_date = @date, start_time = @start, end_time = @end, event_type = @type, visibility_type = @visibility, target_role_id = @role, target_barangay_code = @barangay, location = @location, status = @status, reminder_date = @reminder, date_modified = NOW() WHERE date_id = @id',
      ...values, '@id', id);
    res.json({ ok: true, message: 'Date updated.' });
  }
}

router.post('/dates', wrap((req, res) => saveDate(req, res, 0)));
router.put('/dates/:id', wrap((req, res) => saveDate(req, res, toInt(req.params.id))));
router.delete('/dates/:id', wrap(async (req, res) => {
  await db.execute('DELETE FROM important_dates WHERE date_id = @id', '@id', toInt(req.params.id));
  res.json({ ok: true, message: 'Date deleted.' });
}));

// ---------------- Accounts ----------------
router.get('/accounts', wrap(async (req, res) => {
  res.json({ rows: await db.query("SELECT u.user_id, u.username, u.first_name || ' ' || u.last_name AS full_name, r.role_name AS role, COALESCE(b.barangay_name, '-') AS barangay_name, u.last_login, u.account_status FROM users u JOIN roles r ON r.role_id = u.role_id LEFT JOIN barangays b ON b.barangay_code = u.barangay_code ORDER BY r.role_id, b.barangay_name") });
}));

router.get('/accounts/free-barangays', wrap(async (req, res) => {
  res.json({ rows: await db.query("SELECT barangay_code, barangay_name FROM barangays WHERE status = 'Active' AND barangay_code NOT IN (SELECT barangay_code FROM users WHERE role_id = " + ADMIN_ROLE_SQL + ' AND barangay_code IS NOT NULL) ORDER BY barangay_name') });
}));

router.post('/accounts', wrap(async (req, res) => {
  const b = req.body || {};
  const username = String(b.username || '').trim();
  const barangayCode = String(b.barangay_code || '');
  if (username.length < 4 || String(b.first_name || '').trim().length === 0 || String(b.last_name || '').trim().length === 0 || barangayCode.length === 0) {
    fail('Barangay, a username of at least 4 characters, first name and last name are required.');
  }
  if (!auth.passwordIsStrong(String(b.password || ''))) fail('Password must be at least 8 characters and include letters and numbers.');
  if (await db.scalarInt('SELECT COUNT(*) FROM users WHERE LOWER(username) = LOWER(@u)', '@u', username) > 0) fail('That username is already taken.');
  if (await db.scalarInt('SELECT COUNT(*) FROM users WHERE role_id = ' + ADMIN_ROLE_SQL + ' AND barangay_code = @b', '@b', barangayCode) > 0) fail('This barangay already has an admin account.');
  const hash = await auth.hashPassword(String(b.password));
  try {
    await db.inTransaction(async (tx) => {
      const newId = await tx.execute('INSERT INTO users (username, password_hash, first_name, middle_name, last_name, suffix, contact_number, role_id, barangay_code, account_status, created_by, password_changed) VALUES (@username, @hash, @first, @middle, @last, @suffix, @contact, ' + ADMIN_ROLE_SQL + ", @barangay, 'Active', @creator, NOW()) RETURNING user_id AS id",
        '@username', username, '@hash', hash, '@first', String(b.first_name).trim(), '@middle', clean(b.middle_name), '@last', String(b.last_name).trim(), '@suffix', clean(b.suffix), '@contact', clean(b.contact_number), '@barangay', barangayCode, '@creator', auth.userId(req));
      await tx.execute('UPDATE barangays SET user_id = @u, date_modified = NOW() WHERE barangay_code = @b', '@u', newId, '@b', barangayCode);
    });
  } catch (err) {
    console.error(err);
    fail('The account could not be created. Please try again.');
  }
  res.json({ ok: true, message: 'Account created. Share the username and initial password with the barangay and ask them to change it.' });
}));

router.get('/accounts/:id', wrap(async (req, res) => {
  const row = await db.queryRow('SELECT user_id, username, account_status FROM users WHERE user_id = @id', '@id', toInt(req.params.id));
  if (!row) return res.status(404).json({ error: 'Not found.' });
  res.json({ row });
}));

router.post('/accounts/:id/toggle', wrap(async (req, res) => {
  const id = toInt(req.params.id);
  const user = await db.queryRow('SELECT user_id, username, account_status FROM users WHERE user_id = @id', '@id', id);
  if (!user) return res.status(404).json({ error: 'Not found.' });
  if (id === auth.userId(req)) fail('You cannot deactivate your own account.');
  const newStatus = user.account_status === 'Active' ? 'Inactive' : 'Active';
  await db.execute('UPDATE users SET account_status = @s, date_modified = NOW() WHERE user_id = @id', '@s', newStatus, '@id', id);
  res.json({ ok: true, message: 'Account is now ' + newStatus + '.' });
}));

router.post('/accounts/:id/reset', wrap(async (req, res) => {
  const password = String((req.body || {}).password || '');
  if (!auth.passwordIsStrong(password)) fail('Password must be at least 8 characters and include letters and numbers.');
  await db.execute('UPDATE users SET password_hash = @hash, password_changed = NOW(), date_modified = NOW() WHERE user_id = @id', '@hash', await auth.hashPassword(password), '@id', toInt(req.params.id));
  res.json({ ok: true, message: 'Password updated.' });
}));

module.exports = router;
