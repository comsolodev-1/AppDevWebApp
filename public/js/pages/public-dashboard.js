BB.page({ layout: 'public' }, function () {
  BB.get('/api/public/dashboard').then(function (d) {
    BB.html('litStats', '<div class="cards">' +
      '<div class="stat"><div class="num">' + d.stats.barangays + '</div><div class="lbl">Barangays</div></div>' +
      '<div class="stat"><div class="num">' + d.stats.activities + '</div><div class="lbl">Public activities</div></div>' +
      '<div class="stat"><div class="num">' + d.stats.confirmed + '</div><div class="lbl">Confirmed reports in ' + d.year + '</div></div></div>');
    BB.html('gvTop', BB.grid([
      { h: 'Rank', cell: function (r) { return BB.H(r.Rank); } },
      { h: 'Barangay', cell: function (r) { return BB.H(r.Barangay); } },
      { h: 'Confirmed Reports', cell: function (r) { return BB.H(r.Confirmed); } },
      { h: 'Total Score', cell: function (r) { return BB.scoreText(r.Score); } }
    ], d.top, 'No ranking data yet.'));
    BB.html('gvActivities', BB.grid([
      { h: 'Activity', cell: function (r) { return BB.H(r.activity_name); } },
      { h: 'Frequency', cell: function (r) { return BB.H(r.frequency); } },
      { h: 'Period', cell: function (r) { return BB.H(r.period_name); } },
      { h: 'Deadline', cell: function (r) { return BB.dateText(r.submission_deadline); } },
      { h: 'Status', cell: function (r) { return BB.badge(r.period_status); } }
    ], d.activities, 'No public activities right now.'));
    BB.html('gvDates', BB.grid([
      { h: 'Date', cell: function (r) { return BB.dateText(r.event_date); } },
      { h: 'Event', cell: function (r) { return BB.H(r.title); } },
      { h: 'Type', cell: function (r) { return BB.H(r.event_type); } },
      { h: 'Location', cell: function (r) { return BB.H(r.location); } }
    ], d.dates, 'No upcoming dates.'));
  });
  BB.announcementsView('annLatest', 3);
});
