BB.page({ layout: 'site', role: 'Super Admin' }, function () {
  function bindGrid() {
    BB.get('/api/super/submissions?' + BB.qs({ search: BB.$('txtSearch').value, status: BB.$('ddlStatus').value, barangay: BB.$('ddlBarangay').value })).then(function (d) {
      BB.html('gvSubmissions', BB.grid([
        { h: 'Barangay', cell: function (r) { return BB.H(r.barangay_name); } },
        { h: 'Activity', cell: function (r) { return BB.H(r.activity_name); } },
        { h: 'Period', cell: function (r) { return BB.H(r.period_name); } },
        { h: 'Submitted', cell: function (r) { return BB.dateTimeText(r.date_submitted) + ' ' + (Number(r.is_late) === 1 ? BB.badge('Late') : ''); } },
        { h: 'File', cell: function (r) { return '<a href="/api/download?t=submission&amp;id=' + r.date_id + '">' + BB.H(r.file_name) + '</a>'; } },
        { h: 'Status', cell: function (r) { return BB.badge(r.submission_status) + ' ' + (r.submission_status === 'Confirmed' ? '<small>' + BB.scoreText(r.score) + ' pt</small>' : ''); } },
        { h: 'Remarks / Reason', cell: function (r) { return BB.H(r.remarks) + ' ' + BB.H(r.denial_reason); } },
        { h: 'Action', cell: function (r) { return '<span class="actions">' + (r.submission_status === 'Pending' ? '<a href="#" data-id="' + r.date_id + '">Review</a>' : '') + '</span>'; } }
      ], d.rows, 'No submissions found.'));
    });
  }

  BB.$('btnFilter').addEventListener('click', bindGrid);
  BB.$('gvSubmissions').addEventListener('click', function (e) {
    var a = e.target.closest('a[data-id]');
    if (!a) return;
    e.preventDefault();
    var id = a.getAttribute('data-id');
    BB.get('/api/super/submissions/' + id).then(function (d) {
      var row = d.row;
      var late = Number(row.is_late) === 1;
      BB.$('hfSubmissionId').value = id;
      BB.html('litReviewInfo', '<p><b>' + BB.H(row.barangay_name) + '</b> - ' + BB.H(row.activity_name) + ' (' + BB.H(row.period_name) + ')<br />' +
        'Deadline: ' + BB.dateTimeText(row.submission_deadline) + ' &nbsp; Submitted: ' + BB.dateTimeText(row.date_submitted) + (late ? ' ' + BB.badge('Late') : '') + '<br />' +
        'File: <a href="/api/download?t=submission&amp;id=' + id + '">' + BB.H(row.file_name) + '</a><br />' +
        'Score if confirmed: <b>' + BB.scoreText(row.score_if_confirmed) + '</b></p>');
      BB.$('txtDenyReason').value = '';
      BB.$('fuDenial').value = '';
      BB.show('pnlReview', true);
    }).catch(function () {});
  });

  function done(r) {
    BB.show('pnlReview', false);
    BB.notice('litMessage', r.message, true);
    bindGrid();
  }
  BB.$('btnConfirm').addEventListener('click', function () {
    BB.run('litMessage', function () {
      return BB.post('/api/super/submissions/' + BB.$('hfSubmissionId').value + '/confirm', { remark: BB.$('ddlRemark').value }).then(done);
    }).then(function () { if (BB.$('litMessage').textContent.indexOf('already reviewed') >= 0) { BB.show('pnlReview', false); bindGrid(); } });
  });
  BB.$('btnDeny').addEventListener('click', function () {
    var fd = new FormData();
    fd.append('reason', BB.$('txtDenyReason').value);
    if (BB.$('fuDenial').files[0]) fd.append('attachment', BB.$('fuDenial').files[0]);
    BB.run('litMessage', function () {
      return BB.api('POST', '/api/super/submissions/' + BB.$('hfSubmissionId').value + '/deny', fd).then(done);
    });
  });
  BB.$('btnCancelReview').addEventListener('click', function () { BB.show('pnlReview', false); });

  BB.get('/api/super/meta').then(function (m) {
    BB.fillSelect('ddlBarangay', m.allBarangays, 'barangay_name', 'barangay_code', { value: '', text: 'All barangays' });
    bindGrid();
  });
});
