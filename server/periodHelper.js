'use strict';
// Port of App_Code/PeriodHelper.vb. Dates are handled as UTC midnight so no time zone can shift them.
const { MONTHS } = require('./ui');

const Frequencies = ['Weekly', 'Monthly', 'Quarterly', 'Annual', 'General'];

function parseDate(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(text || '').trim());
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return null;
  return d;
}

function fmt(d) {
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
}

function addDays(d, n) {
  return new Date(d.getTime() + n * 86400000);
}

// Same algorithm as .NET Calendar.GetWeekOfYear(date, FirstFourDayWeek, Monday)
function weekOfYearFullDays(d, firstDayOfWeek, fullDays) {
  const dayOfYear = Math.round((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000);
  const dayForJan1 = d.getUTCDay() - (dayOfYear % 7);
  let offset = (firstDayOfWeek - dayForJan1 + 14) % 7;
  if (offset !== 0 && offset >= fullDays) offset -= 7;
  const day = dayOfYear - offset;
  if (day >= 0) return Math.floor(day / 7) + 1;
  return weekOfYearFullDays(addDays(d, -(dayOfYear + 1)), firstDayOfWeek, fullDays);
}

function weekNumber(d) {
  return weekOfYearFullDays(d, 1, 4);
}

function nameFor(frequency, d) {
  switch (frequency) {
    case 'Weekly': return 'Week ' + weekNumber(d) + ' ' + d.getUTCFullYear();
    case 'Monthly': return MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
    case 'Quarterly': return 'Q' + (Math.floor(d.getUTCMonth() / 3) + 1) + ' ' + d.getUTCFullYear();
    case 'Annual': return String(d.getUTCFullYear());
  }
  return 'General';
}

function numberFor(frequency, d) {
  switch (frequency) {
    case 'Weekly': return Math.min(weekNumber(d), 53);
    case 'Monthly': return d.getUTCMonth() + 1;
    case 'Quarterly': return Math.floor(d.getUTCMonth() / 3) + 1;
  }
  return null;
}

function rangeFor(frequency, d) {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  let start;
  let end;
  switch (frequency) {
    case 'Weekly':
      start = addDays(d, -((d.getUTCDay() + 6) % 7));
      end = addDays(start, 6);
      break;
    case 'Monthly':
      start = new Date(Date.UTC(y, m, 1));
      end = new Date(Date.UTC(y, m + 1, 0));
      break;
    case 'Quarterly': {
      const first = Math.floor(m / 3) * 3;
      start = new Date(Date.UTC(y, first, 1));
      end = new Date(Date.UTC(y, first + 3, 0));
      break;
    }
    case 'Annual':
      start = new Date(Date.UTC(y, 0, 1));
      end = new Date(Date.UTC(y, 11, 31));
      break;
    default:
      start = d;
      end = d;
  }
  return { start, end };
}

// DateTime string 'YYYY-MM-DD 23:59:59'
function endOfDay(d) {
  return fmt(d) + ' 23:59:59';
}

async function createInTransaction(tx, activityId, frequency, deadline, userId) {
  const range = rangeFor(frequency, deadline);
  await tx.execute("INSERT INTO reporting_period (activity_id, period_type, period_name, period_year, period_number, start_date, end_date, submission_deadline, period_status, date_opened, created_by) VALUES (@a, @type, @name, @year, @number, @start, @end, @deadline, 'Open', NOW(), @user)",
    '@a', activityId, '@type', frequency, '@name', nameFor(frequency, deadline), '@year', deadline.getUTCFullYear(),
    '@number', numberFor(frequency, deadline), '@start', fmt(range.start), '@end', fmt(range.end),
    '@deadline', endOfDay(deadline), '@user', userId);
}

module.exports = { Frequencies, parseDate, fmt, nameFor, numberFor, rangeFor, endOfDay, createInTransaction };
