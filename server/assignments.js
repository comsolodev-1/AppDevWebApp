'use strict';
// Port of App_Code/Assignments.vb
const db = require('./db');

async function forBarangay(barangayCode) {
  const sql = "SELECT p.period_id, a.activity_id, a.activity_name, a.description, a.frequency, a.instructions, a.template_file_name, " +
    "p.period_name, p.submission_deadline, p.period_status, (p.submission_deadline < NOW()) AS is_overdue, s.date_id AS submission_id, s.submission_status, s.date_submitted, s.file_name, " +
    "s.score, s.is_late, s.remarks, s.denial_reason, s.denial_attachment, s.resubmission_count, " +
    "CASE WHEN s.date_id IS NULL THEN 'Not Submitted' ELSE s.submission_status END AS display_status " +
    "FROM reporting_period p JOIN activities a ON a.activity_id = p.activity_id " +
    "JOIN activity_barangays ab ON ab.activity_id = a.activity_id AND ab.barangay_code = @b " +
    "LEFT JOIN submissions s ON s.period_id = p.period_id AND s.barangay_code = @b " +
    "WHERE a.activity_status <> 'Archived' ORDER BY p.submission_deadline DESC, a.activity_name";
  const rows = await db.query(sql, '@b', barangayCode);
  return rows.map((r) => Object.assign({}, r, { is_overdue: Number(r.is_overdue) === 1 }));
}

async function periodForBarangay(periodId, barangayCode) {
  const table = await forBarangay(barangayCode);
  return table.find((row) => Number(row.period_id) === Number(periodId)) || null;
}

module.exports = { forBarangay, periodForBarangay };
