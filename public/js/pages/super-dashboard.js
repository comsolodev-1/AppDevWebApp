BB.page({ layout: 'site', role: 'Super Admin' }, function () {
  BB.get('/api/super/dashboard').then(function (d) {
    if (d.pending > 0) BB.html('litAlerts', '<div class="notice notice-warn"><b>Action required:</b> ' + d.pending + ' submissions are waiting for review.</div>');
    BB.html('litStats', '<div class="cards">' +
      '<div class="stat"><div class="num">' + d.activeActivities + '</div><div class="lbl">Active activities</div></div>' +
      '<div class="stat"><div class="num">' + d.pending + '</div><div class="lbl">Pending review</div></div>' +
      '<div class="stat"><div class="num">' + d.confirmed + '</div><div class="lbl">Confirmed in ' + d.year + '</div></div>' +
      '<div class="stat"><div class="num">' + d.late + '</div><div class="lbl">Late in ' + d.year + '</div></div>' +
      '<div class="stat"><div class="num">' + d.missing + '</div><div class="lbl">Overdue, not submitted</div></div></div>');
    BB.html('gvPending', BB.grid([
      { h: 'Barangay', cell: function (r) { return BB.H(r.barangay_name); } },
      { h: 'Activity', cell: function (r) { return BB.H(r.activity_name); } },
      { h: 'Period', cell: function (r) { return BB.H(r.period_name); } },
      { h: 'Submitted', cell: function (r) { return BB.dateTimeText(r.date_submitted) + ' ' + (Number(r.is_late) === 1 ? BB.badge('Late') : ''); } }
    ], d.pendingRows, 'No submissions waiting for review.'));
    BB.html('gvRank', BB.grid([
      { h: 'Rank', cell: function (r) { return BB.H(r.Rank); } },
      { h: 'Barangay', cell: function (r) { return BB.H(r.Barangay); } },
      { h: 'Confirmed Reports', cell: function (r) { return BB.H(r.Confirmed); } },
      { h: 'Late', cell: function (r) { return BB.H(r.Late); } },
      { h: 'Total Score', cell: function (r) { return BB.scoreText(r.Score); } }
    ], d.ranking));
  });
});
