'use strict';
// Public pages (viewer): dashboard, rankings, announcements, roster, calendar + login/session endpoints.
const express = require('express');
const db = require('../db');
const auth = require('../auth');
const scoring = require('../scoring');
const ui = require('../ui');
const calendarData = require('../calendarData');
const { wrap, toInt } = require('../util');

const router = express.Router();

// Who is signed in (the browser sends its token in the Authorization header)
router.get('/session', (req, res) => {
  res.json({
    loggedIn: auth.isLoggedIn(req),
    user: auth.isLoggedIn(req) ? {
      userId: auth.userId(req), role: auth.role(req), roleId: auth.roleId(req),
      fullName: auth.fullName(req), barangayCode: auth.barangayCode(req), barangayName: auth.barangayName(req)
    } : null,
    home: auth.homeUrl(req)
  });
});

router.post('/login', wrap(async (req, res) => {
  const body = req.body || {};
  // honeypot field
  if (typeof body.website === 'string' && body.website.length > 0) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return res.status(400).json({ error: 'Invalid username or password.' });
  }
  if (String(body.username || '').trim().length === 0 || !body.password || String(body.password).length === 0) {
    return res.status(400).json({ error: 'Please enter your username and password.' });
  }
  const result = await auth.signIn(req, String(body.username), String(body.password));
  if (!result.ok) return res.status(400).json({ error: result.message });
  res.json({ ok: true, home: auth.homeUrl(req) });
}));

router.post('/logout', wrap(async (req, res) => {
  await auth.signOut(req);
  res.json({ ok: true });
}));

router.get('/public/dashboard', wrap(async (req, res) => {
  const year = ui.currentYear();
  const barangays = await db.scalarInt("SELECT COUNT(*) FROM barangays WHERE status = 'Active'");
  const activities = await db.scalarInt("SELECT COUNT(*) FROM activities WHERE is_public = 1 AND activity_status <> 'Archived'");
  const confirmed = await db.scalarInt("SELECT COUNT(*) FROM submissions s JOIN reporting_period p ON p.period_id = s.period_id WHERE s.submission_status = 'Confirmed' AND EXTRACT(YEAR FROM p.submission_deadline) = @year", '@year', year);
  const top = (await scoring.ranking(year, 0)).slice(0, 5);
  const activityRows = await db.query("SELECT a.activity_name, a.frequency, p.period_name, p.submission_deadline, p.period_status FROM activities a JOIN reporting_period p ON p.activity_id = a.activity_id WHERE a.is_public = 1 AND a.activity_status <> 'Archived' AND p.submission_deadline >= NOW() - INTERVAL '30 days' ORDER BY p.submission_deadline LIMIT 10");
  const dates = await db.query("SELECT event_date, title, event_type, location FROM important_dates WHERE visibility_type = 'All' AND event_date >= CURDATE() ORDER BY event_date LIMIT 6");
  res.json({ year, stats: { barangays, activities, confirmed }, top, activities: activityRows, dates });
}));

// Rankings (Controls/RankingsView) - used by viewer, barangay and super pages
router.get('/rankings', wrap(async (req, res) => {
  let year = toInt(req.query.year);
  let month = toInt(req.query.month);
  if (Number.isNaN(year)) year = ui.currentYear();
  if (Number.isNaN(month) || month < 0 || month > 12) month = 0;
  res.json({ rows: await scoring.ranking(year, month) });
}));

// Announcements (Controls/AnnouncementsView) with the visibility rules
router.get('/announcements', wrap(async (req, res) => {
  let max = toInt(req.query.max);
  if (Number.isNaN(max) || max < 1) max = 100;
  let sql = "SELECT announcement_id, title, content, attachment_file_name, date_published, priority, is_pinned FROM announcements " +
    "WHERE status = 'Published' AND (expiration_date IS NULL OR expiration_date >= NOW()) AND (date_published IS NULL OR date_published <= NOW()) ";
  let rows;
  if (auth.isLoggedIn(req) && !auth.isSuperAdmin(req)) {
    sql += "AND (visibility_type = 'All' OR (visibility_type = 'Specific Role' AND target_role_id = @role) OR (visibility_type = 'Specific Barangay' AND target_barangay_code = @barangay)) ";
    sql += 'ORDER BY is_pinned DESC, date_published DESC NULLS LAST LIMIT ' + max;
    rows = await db.query(sql, '@role', auth.roleId(req), '@barangay', auth.barangayCode(req));
  } else {
    sql += "AND visibility_type = 'All' ORDER BY is_pinned DESC, date_published DESC NULLS LAST LIMIT " + max;
    rows = await db.query(sql);
  }
  res.json({ rows });
}));

router.get('/public/barangays', wrap(async (req, res) => {
  res.json({ rows: await db.query("SELECT barangay_code, barangay_name FROM barangays WHERE status = 'Active' ORDER BY barangay_name") });
}));

router.get('/public/roster', wrap(async (req, res) => {
  const code = String(req.query.code || '');
  const rows = await db.query("SELECT first_name || ' ' || COALESCE(LEFT(middle_name, 1) || '. ', '') || last_name || COALESCE(' ' || suffix, '') AS full_name, position, committee FROM barangay_roster WHERE barangay_code = @id AND status = 'Active' ORDER BY last_name, first_name", '@id', code);
  res.json({ rows });
}));

router.get('/calendar', wrap(async (req, res) => {
  let year = toInt(req.query.year);
  let month = toInt(req.query.month);
  if (Number.isNaN(year)) year = ui.currentYear();
  if (Number.isNaN(month) || month < 1 || month > 12) month = ui.currentMonth();
  res.json({ year, month, rows: await calendarData.forMonth(year, month, true) });
}));

module.exports = router;
