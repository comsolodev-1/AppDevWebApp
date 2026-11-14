BB.page({ layout: 'site', role: 'Barangay Admin' }, function () {
  var ddl = BB.$('ddlYear');
  BB.fillYears(ddl);
  function bind() {
    BB.get('/api/barangay/history?year=' + ddl.value).then(function (d) {
      BB.html('gvHistory', BB.grid([
        { h: 'Activity', cell: function (r) { return BB.H(r.activity_name); } },
        { h: 'Period', cell: function (r) { return BB.H(r.period_name); } },
        { h: 'Submitted', cell: function (r) { return BB.dateTimeText(r.date_submitted) + ' ' + (Number(r.is_late) === 1 ? BB.badge('Late') : ''); } },
        { h: 'File', cell: function (r) { return '<a href="/api/download?t=submission&amp;id=' + r.date_id + '">' + BB.H(r.file_name) + '</a>'; } },
        { h: 'Status', cell: function (r) { return BB.badge(r.submission_status); } },
        { h: 'Score', cell: function (r) { return BB.scoreText(r.score); } },
        { h: 'Remarks / Reason', cell: function (r) { return BB.H(r.remarks) + ' ' + BB.H(r.denial_reason); } }
      ], d.rows, 'No submissions for this year.'));
    });
  }
  ddl.addEventListener('change', bind);
  BB.$('btnReportCard').addEventListener('click', function () {
    BB.run('litMessage', function () {
      return BB.downloadFile('/api/barangay/report-card.pdf?year=' + ddl.value, 'report-card-' + ddl.value + '.pdf');
    });
  });
  bind();
});
