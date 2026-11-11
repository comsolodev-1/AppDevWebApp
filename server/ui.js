'use strict';
// Server-side parts of App_Code/Ui.vb (text formatting used by the reports).
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT = MONTHS.map((m) => m.slice(0, 3));

function parts(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(String(value));
  if (!m) return null;
  return { y: +m[1], mo: +m[2], d: +m[3], h: m[4] === undefined ? 0 : +m[4], mi: m[5] === undefined ? 0 : +m[5] };
}

function dateText(value) {
  if (value === null || value === undefined || value === '') return '-';
  const p = parts(value);
  if (!p) return '-';
  return SHORT[p.mo - 1] + ' ' + p.d + ', ' + p.y;
}

function timeText(p) {
  const h12 = p.h % 12 === 0 ? 12 : p.h % 12;
  return h12 + ':' + String(p.mi).padStart(2, '0') + ' ' + (p.h < 12 ? 'AM' : 'PM');
}

function dateTimeText(value) {
  if (value === null || value === undefined || value === '') return '-';
  const p = parts(value);
  if (!p) return '-';
  return SHORT[p.mo - 1] + ' ' + p.d + ', ' + p.y + ' ' + timeText(p);
}

// .NET format "0.0#"
function scoreText(value) {
  if (value === null || value === undefined || value === '') return '-';
  let s = Number(value).toFixed(2);
  if (s.endsWith('0')) s = s.slice(0, -1);
  return s;
}

function monthLabel(year, month) {
  return MONTHS[month - 1] + ' ' + year;
}

// "MMM d, yyyy h:mm tt" for the current server time (PDF "Generated" line)
function nowText() {
  const n = new Date();
  return SHORT[n.getMonth()] + ' ' + n.getDate() + ', ' + n.getFullYear() + ' ' +
    timeText({ h: n.getHours(), mi: n.getMinutes() });
}

function pad2(n) { return String(n).padStart(2, '0'); }

function todayString() {
  const n = new Date();
  return n.getFullYear() + '-' + pad2(n.getMonth() + 1) + '-' + pad2(n.getDate());
}

module.exports = { MONTHS, SHORT, dateText, dateTimeText, scoreText, monthLabel, nowText, todayString, pad2 };
