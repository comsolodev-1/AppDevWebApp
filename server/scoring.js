'use strict';
// Port of App_Code/Scoring.vb
const db = require('./db');

const OnTimeScore = 1;
const LateScore = 0.5;

function scoreFor(isLate) {
  return isLate ? LateScore : OnTimeScore;
}

// Returns rows: { Rank, Barangay, Confirmed, Late, Score, barangay_code }
async function ranking(year, month) {
  let sql = "SELECT b.barangay_code, b.barangay_name, " +
    "COALESCE(SUM(CASE WHEN s.submission_status = 'Confirmed' THEN 1 ELSE 0 END), 0) AS confirmed_count, " +
    "COALESCE(SUM(CASE WHEN s.submission_status = 'Confirmed' AND s.is_late = 1 THEN 1 ELSE 0 END), 0) AS late_count, " +
    "COALESCE(SUM(CASE WHEN s.submission_status = 'Confirmed' THEN s.score ELSE 0 END), 0) AS total_score " +
    "FROM barangays b LEFT JOIN (SELECT x.barangay_code, x.submission_status, x.is_late, x.score FROM submissions x " +
    "JOIN reporting_period p ON p.period_id = x.period_id WHERE EXTRACT(YEAR FROM p.submission_deadline) = @year";
  if (month > 0) sql += " AND EXTRACT(MONTH FROM p.submission_deadline) = @month";
  sql += ") s ON s.barangay_code = b.barangay_code WHERE b.status = 'Active' GROUP BY b.barangay_code, b.barangay_name " +
    "ORDER BY total_score DESC, confirmed_count DESC, b.barangay_name";

  const source = month > 0 ? await db.query(sql, '@year', year, '@month', month) : await db.query(sql, '@year', year);

  const result = [];
  let position = 0;
  let currentRank = 0;
  let previousScore = -1;
  for (const row of source) {
    position += 1;
    const score = Number(row.total_score);
    if (score !== previousScore) currentRank = position;
    previousScore = score;
    result.push({
      Rank: currentRank,
      Barangay: row.barangay_name,
      Confirmed: Number(row.confirmed_count),
      Late: Number(row.late_count),
      Score: score,
      barangay_code: row.barangay_code
    });
  }
  return result;
}

module.exports = { OnTimeScore, LateScore, scoreFor, ranking };
