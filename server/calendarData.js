'use strict';
// Port of App_Code/CalendarData.vb
const db = require('./db');

async function forMonth(year, month, publicOnly) {
  const dateFilter = publicOnly ? " AND visibility_type = 'All'" : '';
  const activityFilter = publicOnly ? ' AND a.is_public = 1' : '';
  const sql = "SELECT event_date AS event_day, title, event_type AS kind FROM important_dates WHERE EXTRACT(YEAR FROM event_date) = @year AND EXTRACT(MONTH FROM event_date) = @month" + dateFilter +
    " UNION ALL SELECT CAST(p.submission_deadline AS DATE) AS event_day, a.activity_name || ' (deadline)' AS title, 'Deadline' AS kind FROM reporting_period p JOIN activities a ON a.activity_id = p.activity_id " +
    "WHERE EXTRACT(YEAR FROM p.submission_deadline) = @year AND EXTRACT(MONTH FROM p.submission_deadline) = @month AND a.activity_status <> 'Archived'" + activityFilter +
    " ORDER BY event_day, title";
  return db.query(sql, '@year', year, '@month', month);
}

module.exports = { forMonth };
