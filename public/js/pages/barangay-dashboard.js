BB.page({ layout: 'site', role: 'Barangay Admin' }, function () {
  BB.get('/api/barangay/dashboard').then(function (d) {
    var alerts = '';
    if (d.notSubmitted > 0) alerts += '<div class="notice notice-warn"><b>Action required:</b> ' + d.notSubmitted + ' activities still need a report submission.</div>';
    if (d.denied > 0) alerts += '<div class="notice notice-error"><b>Resubmission required:</b> ' + d.denied + ' submissions were denied. Review the remarks and resubmit.</div>';
    BB.html('litAlerts', alerts);
    BB.html('litStats', '<div class="cards">' +
      '<div class="stat"><div class="num">' + d.notSubmitted + '</div><div class="lbl">Not submitted</div></div>' +
      '<div class="stat"><div class="num">' + d.pending + '</div><div class="lbl">Pending review</div></div>' +
      '<div class="stat"><div class="num">' + d.confirmed + '</div><div class="lbl">Confirmed</div></div>' +
      '<div class="stat"><div class="num">' + d.denied + '</div><div class="lbl">Denied</div></div>' +
      '<div class="stat"><div class="num">' + BB.H(d.scoreText) + '</div><div class="lbl">Score ' + d.year + '</div></div>' +
      '<div class="stat"><div class="num">' + BB.H(d.rankText) + '</div><div class="lbl">Rank ' + d.year + '</div></div></div>');
    BB.html('gvDeadlines', BB.grid([
      { h: 'Activity', cell: function (r) { return BB.H(r.activity_name); } },
      { h: 'Period', cell: function (r) { return BB.H(r.period_name); } },
      { h: 'Deadline', cell: function (r) { return BB.dateText(r.submission_deadline); } },
      { h: 'Status', cell: function (r) { return BB.badge(r.display_status); } }
    ], d.todo, 'Nothing due. Great job!'));
  });
  BB.announcementsView('annLatest', 3);
});
