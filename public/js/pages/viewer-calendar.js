// Replaces the ASP.NET Calendar control (same table look, month navigation, events per day)
BB.page({ layout: 'public' }, function () {
  var SHORT = BB.MONTHS.map(function (m) { return m.slice(0, 3); });
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var now = new Date();
  var year = now.getFullYear();
  var month = now.getMonth(); // 0-based
  function key(y, m, d) { return y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0'); }

  function render(events) {
    var prev = new Date(year, month - 1, 1);
    var next = new Date(year, month + 1, 1);
    var byDay = {};
    events.forEach(function (e) { (byDay[String(e.event_day).slice(0, 10)] = byDay[String(e.event_day).slice(0, 10)] || []).push(e); });
    var today = key(now.getFullYear(), now.getMonth(), now.getDate());
    var html = '<table class="calendar-table" cellspacing="0" cellpadding="2" style="border-collapse:collapse;">' +
      '<tr><td colspan="7" style="background-color:#1a5c38;"><table cellspacing="0" style="color:White;background-color:#1a5c38;font-weight:bold;height:34px;width:100%;border-collapse:collapse;"><tr>' +
      '<td style="width:15%;"><a href="#" id="calPrev" style="color:White">' + SHORT[prev.getMonth()] + '</a></td>' +
      '<td align="center" style="width:70%;">' + BB.MONTHS[month] + ' ' + year + '</td>' +
      '<td align="right" style="width:15%;"><a href="#" id="calNext" style="color:White">' + SHORT[next.getMonth()] + '</a></td></tr></table></td></tr><tr>';
    DAYS.forEach(function (d) { html += '<th align="center" abbr="' + d + '" scope="col">' + d.slice(0, 3) + '</th>'; });
    html += '</tr>';
    var first = new Date(year, month, 1);
    var start = new Date(year, month, 1 - first.getDay());
    var last = new Date(year, month + 1, 0);
    var cursor = new Date(start);
    while (cursor <= last || cursor.getDay() !== 0) {
      if (cursor.getDay() === 0) html += '<tr>';
      var other = cursor.getMonth() !== month;
      var k = key(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
      var style = 'width:14%;' + (k === today ? 'background-color:#fef9e7;' : '') + (other ? 'color:#b5c4bb;' : '');
      html += '<td align="center" style="' + style + '"><a href="#" onclick="return false"' + (other ? ' style="color:#b5c4bb"' : '') + '>' + cursor.getDate() + '</a>';
      if (!other) (byDay[k] || []).forEach(function (e) { html += '<span class="ev">' + BB.H(e.title) + '</span>'; });
      html += '</td>';
      if (cursor.getDay() === 6) html += '</tr>';
      cursor.setDate(cursor.getDate() + 1);
    }
    html += '</table>';
    BB.html('calEvents', html);
    BB.$('calPrev').addEventListener('click', function (e) { e.preventDefault(); month--; if (month < 0) { month = 11; year--; } load(); });
    BB.$('calNext').addEventListener('click', function (e) { e.preventDefault(); month++; if (month > 11) { month = 0; year++; } load(); });
  }
  function load() {
    BB.get('/api/calendar?year=' + year + '&month=' + (month + 1)).then(function (d) { render(d.rows); });
  }
  load();
});
