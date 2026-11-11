BB.page({ layout: 'public' }, function () {
  var ddl = BB.$('ddlBarangay');
  function bind() {
    if (!ddl.value) return;
    BB.get('/api/public/roster?code=' + encodeURIComponent(ddl.value)).then(function (d) {
      BB.html('gvRoster', BB.grid([
        { h: 'Name', cell: function (r) { return BB.H(r.full_name); } },
        { h: 'Position', cell: function (r) { return BB.H(r.position); } },
        { h: 'Committee', cell: function (r) { return BB.H(r.committee); } }
      ], d.rows, 'No officials listed for this barangay.'));
    });
  }
  BB.get('/api/public/barangays').then(function (d) {
    BB.fillSelect(ddl, d.rows, 'barangay_name', 'barangay_code');
    bind();
  });
  ddl.addEventListener('change', bind);
});
