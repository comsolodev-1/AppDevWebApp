BB.page({ layout: 'site', role: 'Super Admin' }, function () {
  var meta = null;
  var ddlReport = BB.$('ddlReport'), ddlActivity = BB.$('ddlActivity'), ddlPeriod = BB.$('ddlPeriod'),
    ddlBarangay = BB.$('ddlBarangay'), ddlYear = BB.$('ddlYear'), ddlMonth = BB.$('ddlMonth');

  function bindPeriods() {
    ddlPeriod.innerHTML = '';
    if (ddlActivity.options.length === 0) return Promise.resolve();
    return BB.get('/api/super/reports/periods?activity=' + ddlActivity.value).then(function (d) {
      BB.fillSelect(ddlPeriod, d.rows, 'period_name', 'period_id');
    });
  }

  function showControlsFor(key) {
    var isSummary = key === 'weekly' || key === 'monthly' || key === 'quarterly';
    var monthly = ['ranking', 'calendar', 'announcements', 'late', 'nonsubmission'].indexOf(key) >= 0;
    BB.show('pnlActivity', isSummary);
    BB.show('pnlPeriod', isSummary);
    BB.show('pnlBarangay', key === 'roster' || key === 'reportcard');
    BB.show('pnlYear', monthly || key === 'reportcard');
    BB.show('pnlMonth', monthly);
    var keep = ddlBarangay.value;
    BB.fillSelect(ddlBarangay, meta.barangays, 'barangay_name', 'barangay_code', key === 'reportcard' ? null : { value: '', text: 'All barangays' });
    if (key === 'reportcard' && keep) ddlBarangay.value = keep;
    var cur = ddlMonth.value || String(new Date().getMonth() + 1);
    var html = key === 'ranking' ? '<option value="0">All months</option>' : '';
    for (var m = 1; m <= 12; m++) html += '<option value="' + m + '">' + BB.MONTHS[m - 1] + '</option>';
    ddlMonth.innerHTML = html;
    ddlMonth.value = cur === '0' && key !== 'ranking' ? String(new Date().getMonth() + 1) : cur;
    if (isSummary) {
      var frequency = key === 'weekly' ? 'Weekly' : key === 'monthly' ? 'Monthly' : 'Quarterly';
      return BB.get('/api/super/reports/activities?frequency=' + frequency).then(function (d) {
        BB.fillSelect(ddlActivity, d.rows, 'activity_name', 'activity_id');
        return bindPeriods();
      });
    }
    return Promise.resolve();
  }

  function params() {
    return BB.qs({ key: ddlReport.value, period: ddlPeriod.value, barangay: ddlBarangay.value, year: ddlYear.value, month: ddlMonth.value });
  }

  ddlReport.addEventListener('change', function () { BB.show('pnlResult', false); showControlsFor(ddlReport.value); });
  ddlActivity.addEventListener('change', bindPeriods);

  BB.$('btnPreview').addEventListener('click', function () {
    BB.run('litMessage', function () {
      return BB.get('/api/super/reports/preview?' + params()).then(function (d) {
        var r = d.report;
        BB.html('litTitle', BB.H(r.title));
        BB.html('litSubtitle', BB.H(r.subtitle));
        BB.html('litNotes', r.notes.map(function (n) { return '<p>' + BB.H(n) + '</p>'; }).join(''));
        var cols = r.columns.map(function (name, i) { return { h: name, cell: function (row) { return BB.H(row[i]); } }; });
        BB.html('gvPreview', BB.grid(cols, r.rows, 'No records for the selected filters.'));
        BB.show('pnlResult', true);
      }).catch(function (err) { BB.show('pnlResult', false); throw err; });
    });
  });
  BB.$('btnPdf').addEventListener('click', function () {
    BB.run('litMessage', function () { return BB.downloadFile('/api/super/reports/pdf?' + params(), ddlReport.value + '-report.pdf'); });
  });

  BB.get('/api/super/meta').then(function (m) {
    meta = m;
    BB.fillSelect(ddlReport, m.reports, 'label', 'key');
    BB.fillYears(ddlYear);
    BB.fillMonths(ddlMonth);
    return showControlsFor(ddlReport.value);
  });
});
