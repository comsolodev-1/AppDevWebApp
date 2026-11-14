BB.page({ layout: 'site', role: 'Barangay Admin' }, function () {
  var all = [];
  var selectedPeriodId = 0;

  function find(id) { return all.filter(function (r) { return Number(r.period_id) === Number(id); })[0]; }

  function bindGrid() {
    var search = BB.$('txtSearch').value.trim().toLowerCase();
    var status = BB.$('ddlStatus').value;
    var rows = all.filter(function (r) {
      if (search.length > 0 && String(r.activity_name).toLowerCase().indexOf(search) < 0) return false;
      if (status.length > 0 && r.display_status !== status) return false;
      return true;
    });
    BB.html('gvActivities', BB.grid([
      { h: 'Activity', cell: function (r) { return '<b>' + BB.H(r.activity_name) + '</b><br /><small>' + BB.H(r.description) + '</small>'; } },
      { h: 'Frequency', cell: function (r) { return BB.H(r.frequency); } },
      { h: 'Period', cell: function (r) { return BB.H(r.period_name); } },
      { h: 'Deadline', cell: function (r) {
        return BB.dateText(r.submission_deadline) + ' ' + (r.is_overdue && r.display_status === 'Not Submitted' ? '<span class="badge badge-overdue">Overdue</span>' : '');
      } },
      { h: 'Submitted File', cell: function (r) {
        return r.submission_id === null ? '-' : '<a href="/api/download?t=submission&amp;id=' + r.submission_id + '">' + BB.H(r.file_name) + '</a><br /><small>' + BB.dateText(r.date_submitted) + '</small>';
      } },
      { h: 'Status', cell: function (r) {
        return BB.badge(r.display_status) + ' ' + (r.display_status === 'Confirmed' ? '<br /><small>' + BB.scoreText(r.score) + ' pt</small>' : '');
      } },
      { h: 'Action', cell: function (r) {
        var s = r.display_status;
        return '<span class="actions"><a href="#" data-act="details" data-id="' + r.period_id + '">Details</a>' +
          (s === 'Not Submitted' || s === 'Denied' ? '<a href="#" data-act="submit" data-id="' + r.period_id + '">' + (s === 'Denied' ? 'Resubmit' : 'Submit') + '</a>' : '') +
          (s === 'Pending' ? '<a href="#" class="danger" data-act="remove" data-id="' + r.period_id + '">Remove</a>' : '') + '</span>';
      } }
    ], rows, 'No activities assigned yet.'));
  }

  function load() {
    return BB.get('/api/barangay/activities').then(function (d) { all = d.rows; bindGrid(); });
  }

  function textBlock(label, value) {
    if (value === null || value === undefined || String(value).length === 0) return '';
    return '<p><b>' + BB.H(label) + ':</b><br />' + BB.nl2br(value) + '</p>';
  }

  function showDetails(row) {
    var html = '<p><b>' + BB.H(row.activity_name) + '</b> - ' + BB.H(row.period_name) + ' (deadline ' + BB.dateText(row.submission_deadline) + ')</p>';
    html += textBlock('Description', row.description);
    html += textBlock('Requirements / Instructions', row.instructions);
    if (row.template_file_name !== null) {
      html += '<p><a class="btn btn-outline btn-sm" href="/api/download?t=template&amp;id=' + row.activity_id + '">Download template: ' + BB.H(row.template_file_name) + '</a></p>';
    }
    if (row.submission_id !== null) {
      html += '<p>Status: ' + BB.badge(row.submission_status) + ' &nbsp; Submitted ' + BB.dateTimeText(row.date_submitted);
      if (Number(row.is_late) === 1) html += ' ' + BB.badge('Late');
      html += '</p>';
      html += textBlock('Remarks', row.remarks);
      html += textBlock('Denial reason', row.denial_reason);
      if (row.denial_attachment !== null) html += '<p><a href="/api/download?t=denial&amp;id=' + row.submission_id + '">Download denial attachment</a></p>';
    }
    BB.html('litDetails', html);
    BB.show('pnlDetails', true);
    BB.show('pnlSubmit', false);
  }

  BB.$('gvActivities').addEventListener('click', function (e) {
    var a = e.target.closest('a[data-act]');
    if (!a) return;
    e.preventDefault();
    var id = Number(a.getAttribute('data-id'));
    var row = find(id);
    if (!row) return;
    var act = a.getAttribute('data-act');
    if (act === 'details') {
      showDetails(row);
    } else if (act === 'submit') {
      selectedPeriodId = id;
      BB.html('litSubmitInfo', '<p><b>' + BB.H(row.activity_name) + '</b> - ' + BB.H(row.period_name) + '<br />Deadline: ' + BB.dateTimeText(row.submission_deadline) +
        (row.is_overdue ? ' <span class="badge badge-overdue">Overdue - will be marked late (0.5 pt)</span>' : '') + '</p>');
      BB.$('fuReport').value = '';
      BB.show('pnlSubmit', true);
      BB.show('pnlDetails', false);
    } else if (act === 'remove') {
      if (!window.confirm('Remove this submission?')) return;
      BB.run('litMessage', function () {
        return BB.del('/api/barangay/submissions/' + id).then(function (r) {
          if (r.message) BB.notice('litMessage', r.message, true);
          return load();
        });
      });
    }
  });

  BB.$('btnFilter').addEventListener('click', bindGrid);
  BB.$('btnCancelSubmit').addEventListener('click', function () { BB.show('pnlSubmit', false); });
  BB.$('btnCloseDetails').addEventListener('click', function () { BB.show('pnlDetails', false); });
  BB.$('btnConfirmSubmit').addEventListener('click', function () {
    var file = BB.$('fuReport').files[0];
    if (!file) { BB.notice('litMessage', 'Please choose a file to upload.', false); return; }
    var fd = new FormData();
    fd.append('period_id', selectedPeriodId);
    fd.append('file', file);
    BB.run('litMessage', function () {
      return BB.api('POST', '/api/barangay/submissions', fd).then(function (r) {
        BB.show('pnlSubmit', false);
        BB.notice('litMessage', r.message, true);
        return load();
      });
    });
  });
  load();
});
