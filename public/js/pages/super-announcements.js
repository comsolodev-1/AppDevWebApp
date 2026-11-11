BB.page({ layout: 'site', role: 'Super Admin' }, function () {
  function clearForm() {
    BB.$('hfId').value = '0';
    BB.$('txtTitle').value = '';
    BB.$('txtContent').value = '';
    BB.$('ddlPriority').value = 'Medium';
    BB.$('ddlVisibility').value = 'All';
    BB.$('ddlStatus').value = 'Published';
    BB.$('txtExpiration').value = '';
    BB.$('chkPinned').checked = false;
    BB.$('fuAttachment').value = '';
    BB.html('litCurrentFile', '');
  }
  function bindGrid() {
    BB.get('/api/super/announcements').then(function (d) {
      BB.html('gvAnnouncements', BB.grid([
        { h: 'Title', cell: function (r) { return '<b>' + BB.H(r.title) + '</b> ' + (Number(r.is_pinned) === 1 ? '<span class="badge badge-medium">Pinned</span>' : ''); } },
        { h: 'Priority', cell: function (r) { return BB.badge(r.priority); } },
        { h: 'Visible to', cell: function (r) { return BB.H(r.visibility_type); } },
        { h: 'Published', cell: function (r) { return BB.dateText(r.date_published); } },
        { h: 'Status', cell: function (r) { return BB.badge(r.status); } },
        { h: 'Actions', cell: function (r) {
          return '<span class="actions"><a href="#" data-act="edit" data-id="' + r.announcement_id + '">Edit</a><a href="#" class="danger" data-act="delete" data-id="' + r.announcement_id + '">Delete</a></span>';
        } }
      ], d.rows, 'No announcements yet.'));
    });
  }
  BB.$('btnNew').addEventListener('click', function () { clearForm(); BB.html('litFormTitle', 'New Announcement'); BB.show('pnlForm', true); });
  BB.$('btnCancel').addEventListener('click', function () { BB.show('pnlForm', false); });
  BB.$('btnSave').addEventListener('click', function () {
    var id = Number(BB.$('hfId').value);
    var fd = new FormData();
    fd.append('title', BB.$('txtTitle').value);
    fd.append('content', BB.$('txtContent').value);
    fd.append('priority', BB.$('ddlPriority').value);
    fd.append('visibility_type', BB.$('ddlVisibility').value);
    fd.append('target_role_id', BB.$('ddlRole').value);
    fd.append('target_barangay_code', BB.$('ddlTargetBarangay').value);
    fd.append('status', BB.$('ddlStatus').value);
    fd.append('expiration_date', BB.$('txtExpiration').value);
    fd.append('is_pinned', BB.$('chkPinned').checked ? '1' : '0');
    if (BB.$('fuAttachment').files[0]) fd.append('attachment', BB.$('fuAttachment').files[0]);
    BB.run('litMessage', function () {
      return BB.api(id === 0 ? 'POST' : 'PUT', '/api/super/announcements' + (id === 0 ? '' : '/' + id), fd).then(function (r) {
        BB.show('pnlForm', false);
        BB.notice('litMessage', r.message, true);
        bindGrid();
      });
    });
  });
  BB.$('gvAnnouncements').addEventListener('click', function (e) {
    var a = e.target.closest('a[data-act]');
    if (!a) return;
    e.preventDefault();
    var id = a.getAttribute('data-id');
    if (a.getAttribute('data-act') === 'edit') {
      BB.get('/api/super/announcements/' + id).then(function (d) {
        var r = d.row;
        clearForm();
        BB.$('hfId').value = id;
        BB.$('txtTitle').value = r.title;
        BB.$('txtContent').value = r.content;
        if (r.priority !== null) BB.$('ddlPriority').value = r.priority;
        BB.$('ddlVisibility').value = r.visibility_type;
        BB.$('ddlStatus').value = r.status;
        if (r.expiration_date !== null) BB.$('txtExpiration').value = String(r.expiration_date).slice(0, 10);
        BB.$('chkPinned').checked = Number(r.is_pinned) === 1;
        if (r.target_barangay_code !== null) BB.$('ddlTargetBarangay').value = r.target_barangay_code;
        if (r.target_role_id !== null) BB.$('ddlRole').value = String(r.target_role_id);
        if (r.attachment_file_name !== null) BB.html('litCurrentFile', '<small>Current file: ' + BB.H(r.attachment_file_name) + ' (upload a new file to replace it)</small>');
        BB.html('litFormTitle', 'Edit Announcement');
        BB.show('pnlForm', true);
      });
    } else if (window.confirm('Delete this announcement?')) {
      BB.run('litMessage', function () {
        return BB.del('/api/super/announcements/' + id).then(function (r) { if (r.message) BB.notice('litMessage', r.message, true); bindGrid(); });
      });
    }
  });
  BB.get('/api/super/meta').then(function (m) {
    BB.fillSelect('ddlRole', m.roles, 'role_name', 'role_id');
    BB.fillSelect('ddlTargetBarangay', m.barangays, 'barangay_name', 'barangay_code');
    bindGrid();
  });
});
