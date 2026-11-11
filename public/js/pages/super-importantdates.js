BB.page({ layout: 'site', role: 'Super Admin' }, function () {
  function clearForm() {
    BB.$('hfId').value = '0';
    ['txtTitle', 'txtDescription', 'txtDate', 'txtStart', 'txtEnd', 'txtLocation', 'txtReminder'].forEach(function (n) { BB.$(n).value = ''; });
    BB.$('ddlType').selectedIndex = 0;
    BB.$('ddlVisibility').value = 'All';
  }
  function bindGrid() {
    BB.get('/api/super/dates').then(function (d) {
      BB.html('gvDates', BB.grid([
        { h: 'Date', cell: function (r) { return BB.dateText(r.event_date); } },
        { h: 'Title', cell: function (r) { return BB.H(r.title); } },
        { h: 'Type', cell: function (r) { return BB.H(r.event_type); } },
        { h: 'Location', cell: function (r) { return BB.H(r.location); } },
        { h: 'Visible to', cell: function (r) { return BB.H(r.visibility_type); } },
        { h: 'Status', cell: function (r) { return BB.badge(r.status); } },
        { h: 'Actions', cell: function (r) {
          return '<span class="actions"><a href="#" data-act="edit" data-id="' + r.date_id + '">Edit</a><a href="#" class="danger" data-act="delete" data-id="' + r.date_id + '">Delete</a></span>';
        } }
      ], d.rows, 'No dates added yet.'));
    });
  }
  BB.$('btnNew').addEventListener('click', function () { clearForm(); BB.html('litFormTitle', 'Add Important Date'); BB.show('pnlForm', true); });
  BB.$('btnCancel').addEventListener('click', function () { BB.show('pnlForm', false); });
  BB.$('btnSave').addEventListener('click', function () {
    var id = Number(BB.$('hfId').value);
    var body = {
      title: BB.$('txtTitle').value, description: BB.$('txtDescription').value, event_date: BB.$('txtDate').value,
      start_time: BB.$('txtStart').value, end_time: BB.$('txtEnd').value, event_type: BB.$('ddlType').value,
      visibility_type: BB.$('ddlVisibility').value, target_role_id: BB.$('ddlRole').value, target_barangay_code: BB.$('ddlTargetBarangay').value,
      location: BB.$('txtLocation').value, reminder_date: BB.$('txtReminder').value
    };
    BB.run('litMessage', function () {
      return (id === 0 ? BB.post('/api/super/dates', body) : BB.put('/api/super/dates/' + id, body)).then(function (r) {
        BB.show('pnlForm', false);
        BB.notice('litMessage', r.message, true);
        bindGrid();
      });
    });
  });
  BB.$('gvDates').addEventListener('click', function (e) {
    var a = e.target.closest('a[data-act]');
    if (!a) return;
    e.preventDefault();
    var id = a.getAttribute('data-id');
    if (a.getAttribute('data-act') === 'edit') {
      BB.get('/api/super/dates/' + id).then(function (d) {
        var r = d.row;
        clearForm();
        BB.$('hfId').value = id;
        BB.$('txtTitle').value = r.title;
        BB.$('txtDescription').value = r.description || '';
        BB.$('txtDate').value = String(r.event_date).slice(0, 10);
        if (r.start_time !== null) BB.$('txtStart').value = String(r.start_time).slice(0, 5);
        if (r.end_time !== null) BB.$('txtEnd').value = String(r.end_time).slice(0, 5);
        BB.$('txtLocation').value = r.location || '';
        BB.$('ddlType').value = r.event_type;
        BB.$('ddlVisibility').value = r.visibility_type;
        if (r.reminder_date !== null) BB.$('txtReminder').value = String(r.reminder_date).slice(0, 10);
        if (r.target_barangay_code !== null) BB.$('ddlTargetBarangay').value = r.target_barangay_code;
        if (r.target_role_id !== null) BB.$('ddlRole').value = String(r.target_role_id);
        BB.html('litFormTitle', 'Edit Important Date');
        BB.show('pnlForm', true);
      });
    } else if (window.confirm('Delete this date?')) {
      BB.run('litMessage', function () {
        return BB.del('/api/super/dates/' + id).then(function (r) { BB.notice('litMessage', r.message, true); bindGrid(); });
      });
    }
  });
  BB.get('/api/super/meta').then(function (m) {
    BB.fillSelect('ddlRole', m.roles, 'role_name', 'role_id');
    BB.fillSelect('ddlTargetBarangay', m.barangays, 'barangay_name', 'barangay_code');
    bindGrid();
  });
});
