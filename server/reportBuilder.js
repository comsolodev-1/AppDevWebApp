'use strict';
// Port of App_Code/ReportBuilder.vb - builds the 10 reports.
// A report is { title, subtitle, columns: [names], rows: [[values]], notes: [text] }
const db = require('./db');
const scoring = require('./scoring');
const calendarData = require('./calendarData');
const ui = require('./ui');

const Keys = [
  ['weekly', '1. Weekly Activity Report Submission Summary'],
  ['monthly', '2. Monthly Activity Report Submission Summary'],
  ['quarterly', '3. Quarterly Activity Report Submission Summary'],
  ['ranking', '4. Barangay Ranking Report'],
  ['roster', '5. Barangay Roster Report'],
  ['calendar', '6. Monthly Calendar Activity Report'],
  ['announcements', '7. Announcement Report'],
  ['late', '8. Late Barangay Activity Submission Report'],
  ['nonsubmission', '9. Barangay Non-Submission Report'],
  ['reportcard', '10. Individual Barangay Report Card']
];

// turn query rows (objects) into the column / row-array shape
function fromRows(rows, columns) {
  if (!columns) columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  return { columns, rows: rows.map((r) => columns.map((c) => (r[c] === undefined ? null : r[c]))) };
}

async function tableFor(sql, columns, ...args) {
  const rows = await db.query(sql, ...args);
  if (rows.length === 0) return { columns, rows: [] };
  return fromRows(rows, columns);
}

async function activitySummary(periodId, frequencyTitle) {
  const info = await db.queryRow('SELECT a.activity_id, a.activity_name, p.period_name, p.submission_deadline FROM reporting_period p JOIN activities a ON a.activity_id = p.activity_id WHERE p.period_id = @p', '@p', periodId);
  const result = { title: frequencyTitle + ' Activity Report Submission Summary', subtitle: '', columns: [], rows: [], notes: [] };
  if (!info) {
    result.subtitle = 'No activity selected.';
    return result;
  }
  result.subtitle = info.activity_name + ' - ' + info.period_name + ' (deadline ' + ui.dateText(info.submission_deadline) + ')';
  const columns = ['Barangay', 'Status', 'Date Submitted', 'Late', 'Score'];
  const t = await tableFor("SELECT b.barangay_name AS \"Barangay\", COALESCE(s.submission_status, 'Not Submitted') AS \"Status\", COALESCE(to_char(s.date_submitted, 'Mon FMDD, YYYY'), '-') AS \"Date Submitted\", CASE WHEN s.date_id IS NULL THEN '-' WHEN s.is_late = 1 THEN 'Yes' ELSE 'No' END AS \"Late\", COALESCE(CAST(s.score AS TEXT), '-') AS \"Score\" " +
    "FROM barangays b JOIN activity_barangays ab ON ab.barangay_code = b.barangay_code AND ab.activity_id = @a " +
    "LEFT JOIN submissions s ON s.barangay_code = b.barangay_code AND s.period_id = @p WHERE b.status = 'Active' ORDER BY b.barangay_name",
    columns, '@a', Number(info.activity_id), '@p', periodId);
  result.columns = t.columns;
  result.rows = t.rows;
  let confirmed = 0; let pending = 0; let denied = 0; let missing = 0;
  for (const row of t.rows) {
    switch (row[1]) {
      case 'Confirmed': confirmed++; break;
      case 'Pending': pending++; break;
      case 'Denied': denied++; break;
      default: missing++;
    }
  }
  result.notes.push('Confirmed: ' + confirmed + '   Pending: ' + pending + '   Denied: ' + denied + '   Not submitted: ' + missing);
  return result;
}

async function ranking(year, month) {
  const result = { title: 'Barangay Ranking Report', subtitle: month > 0 ? ui.monthLabel(year, month) : 'Year ' + year, columns: ['Rank', 'Barangay', 'Confirmed', 'Late', 'Score'], rows: [], notes: [] };
  const source = await scoring.ranking(year, month);
  // the Score column of the original report was a decimal with 2 decimals
  result.rows = source.map((r) => [r.Rank, r.Barangay, r.Confirmed, r.Late, Number(r.Score).toFixed(2)]);
  result.notes.push('Scores: confirmed on-time report = 1.0, confirmed late report = 0.5.');
  return result;
}

async function roster(barangayCode) {
  const result = { title: 'Barangay Roster Report', subtitle: barangayCode.length > 0 ? 'Selected barangay' : 'All barangays', columns: [], rows: [], notes: [] };
  const columns = ['Barangay', 'Name', 'Position', 'Committee', 'Contact'];
  const sql = "SELECT b.barangay_name AS \"Barangay\", r.first_name || ' ' || COALESCE(LEFT(r.middle_name, 1) || '. ', '') || r.last_name || COALESCE(' ' || r.suffix, '') AS \"Name\", r.position AS \"Position\", COALESCE(r.committee, '-') AS \"Committee\", COALESCE(r.contact_number, '-') AS \"Contact\" " +
    "FROM barangay_roster r JOIN barangays b ON b.barangay_code = r.barangay_code WHERE r.status = 'Active'";
  const t = barangayCode.length > 0
    ? await tableFor(sql + ' AND r.barangay_code = @b ORDER BY b.barangay_name, r.last_name', columns, '@b', barangayCode)
    : await tableFor(sql + ' ORDER BY b.barangay_name, r.last_name', columns);
  result.columns = t.columns;
  result.rows = t.rows;
  return result;
}

async function monthlyCalendar(year, month) {
  const source = await calendarData.forMonth(year, month, false);
  return {
    title: 'Monthly Calendar Activity Report',
    subtitle: ui.monthLabel(year, month),
    columns: ['Date', 'Event / Activity', 'Type'],
    rows: source.map((r) => [ui.dateText(r.event_day), r.title, r.kind]),
    notes: []
  };
}

async function announcements(year, month) {
  const columns = ['Title', 'Published', 'Priority', 'Visibility', 'Status'];
  const t = await tableFor("SELECT title AS \"Title\", COALESCE(to_char(date_published, 'Mon FMDD, YYYY'), '-') AS \"Published\", COALESCE(priority, '-') AS \"Priority\", visibility_type AS \"Visibility\", status AS \"Status\" FROM announcements WHERE status <> 'Draft' AND EXTRACT(YEAR FROM date_published) = @y AND EXTRACT(MONTH FROM date_published) = @m ORDER BY date_published", columns, '@y', year, '@m', month);
  return { title: 'Announcement Report', subtitle: ui.monthLabel(year, month), columns: t.columns, rows: t.rows, notes: [] };
}

async function lateSubmissions(year, month) {
  const columns = ['Barangay', 'Late Submissions'];
  const t = await tableFor("SELECT b.barangay_name AS \"Barangay\", COUNT(s.date_id) AS \"Late Submissions\" FROM barangays b LEFT JOIN submissions s ON s.barangay_code = b.barangay_code AND s.is_late = 1 AND EXTRACT(YEAR FROM s.date_submitted) = @y AND EXTRACT(MONTH FROM s.date_submitted) = @m WHERE b.status = 'Active' GROUP BY b.barangay_code, b.barangay_name ORDER BY \"Late Submissions\" DESC, b.barangay_name", columns, '@y', year, '@m', month);
  return { title: 'Late Barangay Activity Submission Report', subtitle: ui.monthLabel(year, month), columns: t.columns, rows: t.rows, notes: [] };
}

async function nonSubmission(year, month) {
  const columns = ['Barangay', 'Activities Not Submitted'];
  const t = await tableFor("SELECT b.barangay_name AS \"Barangay\", COUNT(p.period_id) AS \"Activities Not Submitted\" FROM barangays b " +
    "LEFT JOIN activity_barangays ab ON ab.barangay_code = b.barangay_code " +
    "LEFT JOIN reporting_period p ON p.activity_id = ab.activity_id AND EXTRACT(YEAR FROM p.submission_deadline) = @y AND EXTRACT(MONTH FROM p.submission_deadline) = @m AND p.submission_deadline < NOW() " +
    "AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.period_id = p.period_id AND s.barangay_code = b.barangay_code) " +
    "WHERE b.status = 'Active' GROUP BY b.barangay_code, b.barangay_name ORDER BY \"Activities Not Submitted\" DESC, b.barangay_name", columns, '@y', year, '@m', month);
  return { title: 'Barangay Non-Submission Report', subtitle: ui.monthLabel(year, month), columns: t.columns, rows: t.rows, notes: [] };
}

async function reportCard(barangayCode, year) {
  const barangayName = await db.scalar('SELECT barangay_name FROM barangays WHERE barangay_code = @b', '@b', barangayCode);
  const result = { title: 'Individual Barangay Report Card', subtitle: (barangayName === null ? 'Unknown barangay' : barangayName) + ' - ' + year, columns: [], rows: [], notes: [] };
  let rank = '-';
  let total = '0';
  for (const row of await scoring.ranking(year, 0)) {
    if (row.barangay_code === barangayCode) {
      rank = String(row.Rank);
      total = ui.scoreText(row.Score);
    }
  }
  result.notes.push('Rank: ' + rank + ' of 15   Total score: ' + total);
  const columns = ['Activity', 'Period', 'Deadline', 'Status', 'Late', 'Score'];
  const t = await tableFor("SELECT a.activity_name AS \"Activity\", p.period_name AS \"Period\", to_char(p.submission_deadline, 'Mon FMDD, YYYY') AS \"Deadline\", COALESCE(s.submission_status, 'Not Submitted') AS \"Status\", CASE WHEN s.date_id IS NULL THEN '-' WHEN s.is_late = 1 THEN 'Yes' ELSE 'No' END AS \"Late\", COALESCE(CAST(s.score AS TEXT), '-') AS \"Score\" " +
    "FROM reporting_period p JOIN activities a ON a.activity_id = p.activity_id JOIN activity_barangays ab ON ab.activity_id = a.activity_id AND ab.barangay_code = @b " +
    "LEFT JOIN submissions s ON s.period_id = p.period_id AND s.barangay_code = @b WHERE EXTRACT(YEAR FROM p.submission_deadline) = @y AND a.activity_status <> 'Archived' ORDER BY p.submission_deadline", columns, '@b', barangayCode, '@y', year);
  result.columns = t.columns;
  result.rows = t.rows;
  return result;
}

module.exports = { Keys, activitySummary, ranking, roster, monthlyCalendar, announcements, lateSubmissions, nonSubmission, reportCard };
