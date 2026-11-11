BB.page({ layout: 'site', role: 'Barangay Admin' }, function () {
  var f = ['First', 'Middle', 'Last', 'Suffix', 'Position', 'Committee', 'Contact', 'Email', 'Address'];
  function clearForm() {
    BB.$('hfRosterId').value = '0';
    f.forEach(function (n) { BB.$('txt' + n).value = ''; });
    BB.$('ddlStatus').value = 'Active';
  }
  function bind() {
    BB.get('/api/barangay/roster').then(function (d) {
      BB.html('gvRoster', BB.grid([
        { h: 'Name', cell: function (r) { return BB.H(r.full_name); } },
        { h: 'Position', cell: function (r) { return BB.H(r.position); } },
        { h: 'Committee', cell: function (r) { return BB.H(r.committee); } },
        { h: 'Contact', cell: function (r) { return BB.H(r.contact_number); } },
        { h: 'Status', cell: function (r) { return BB.badge(r.status); } },
        { h: 'Actions', cell: function (r) {
          return '<span class="actions"><a href="#" data-act="edit" data-id="' + r.roster_id + '">Edit</a><a href="#" class="danger" data-act="delete" data-id="' + r.roster_id + '">Delete</a></span>';
        } }
      ], d.rows, 'No officials added yet.'));
    });
  }
  BB.$('btnNew').addEventListener('click', function () { clearForm(); BB.html('litFormTitle', 'Add Official'); BB.show('pnlForm', true); });
  BB.$('btnCancel').addEventListener('click', function () { BB.show('pnlForm', false); });
  BB.$('btnSave').addEventListener('click', function () {
    var body = {
      first_name: BB.$('txtFirst').value, middle_name: BB.$('txtMiddle').value, last_name: BB.$('txtLast').value, suffix: BB.$('txtSuffix').value,
      position: BB.$('txtPosition').value, committee: BB.$('txtCommittee').value, contact_number: BB.$('txtContact').value,
      email: BB.$('txtEmail').value, address: BB.$('txtAddress').value, status: BB.$('ddlStatus').value
    };
    var id = Number(BB.$('hfRosterId').value);
    BB.run('litMessage', function () {
      return (id === 0 ? BB.post('/api/barangay/roster', body) : BB.put('/api/barangay/roster/' + id, body)).then(function (r) {
        BB.show('pnlForm', false);
        BB.notice('litMessage', r.message, true);
        bind();
      });
    });
  });
  BB.$('gvRoster').addEventListener('click', function (e) {
    var a = e.target.closest('a[data-act]');
    if (!a) return;
    e.preventDefault();
    var id = a.getAttribute('data-id');
    if (a.getAttribute('data-act') === 'edit') {
      BB.get('/api/barangay/roster/' + id).then(function (d) {
        var r = d.row;
        BB.$('hfRosterId').value = id;
        BB.$('txtFirst').value = r.first_name || ''; BB.$('txtMiddle').value = r.middle_name || ''; BB.$('txtLast').value = r.last_name || '';
        BB.$('txtSuffix').value = r.suffix || ''; BB.$('txtPosition').value = r.position || ''; BB.$('txtCommittee').value = r.committee || '';
        BB.$('txtContact').value = r.contact_number || ''; BB.$('txtEmail').value = r.email || ''; BB.$('txtAddress').value = r.address || '';
        BB.$('ddlStatus').value = r.status;
        BB.html('litFormTitle', 'Edit Official');
        BB.show('pnlForm', true);
      });
    } else if (window.confirm('Delete this official?')) {
      BB.run('litMessage', function () {
        return BB.del('/api/barangay/roster/' + id).then(function (r) { BB.notice('litMessage', r.message, true); bind(); });
      });
    }
  });
  bind();
});
