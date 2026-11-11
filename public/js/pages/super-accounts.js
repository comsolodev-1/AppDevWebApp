BB.page({ layout: 'site', role: 'Super Admin' }, function (info) {
  function bindGrid() {
    BB.get('/api/super/accounts').then(function (d) {
      BB.html('gvUsers', BB.grid([
        { h: 'Username', cell: function (r) { return BB.H(r.username); } },
        { h: 'Name', cell: function (r) { return BB.H(r.full_name); } },
        { h: 'Role', cell: function (r) { return BB.H(r.role); } },
        { h: 'Barangay', cell: function (r) { return BB.H(r.barangay_name); } },
        { h: 'Last Login', cell: function (r) { return BB.dateTimeText(r.last_login); } },
        { h: 'Status', cell: function (r) { return BB.badge(r.account_status); } },
        { h: 'Actions', cell: function (r) {
          return '<span class="actions"><a href="#" data-act="reset" data-id="' + r.user_id + '" data-name="' + BB.H(r.username) + '">Reset Password</a>' +
            '<a href="#" data-act="toggle" data-id="' + r.user_id + '">' + (r.account_status === 'Active' ? 'Deactivate' : 'Activate') + '</a></span>';
        } }
      ], d.rows, 'No accounts yet.'));
    });
  }
  BB.$('btnNew').addEventListener('click', function () {
    BB.run('litMessage', function () {
      return BB.get('/api/super/accounts/free-barangays').then(function (d) {
        if (d.rows.length === 0) { BB.notice('litMessage', 'Every active barangay already has an admin account.', false); return; }
        BB.fillSelect('ddlBarangay', d.rows, 'barangay_name', 'barangay_code');
        ['txtUsername', 'txtPassword', 'txtFirst', 'txtMiddle', 'txtLast', 'txtSuffix', 'txtContact'].forEach(function (n) { BB.$(n).value = ''; });
        BB.show('pnlForm', true);
        BB.show('pnlReset', false);
      });
    });
  });
  BB.$('btnCancel').addEventListener('click', function () { BB.show('pnlForm', false); });
  BB.$('btnSave').addEventListener('click', function () {
    BB.run('litMessage', function () {
      return BB.post('/api/super/accounts', {
        barangay_code: BB.$('ddlBarangay').value, username: BB.$('txtUsername').value, password: BB.$('txtPassword').value,
        first_name: BB.$('txtFirst').value, middle_name: BB.$('txtMiddle').value, last_name: BB.$('txtLast').value,
        suffix: BB.$('txtSuffix').value, contact_number: BB.$('txtContact').value
      }).then(function (r) {
        BB.show('pnlForm', false);
        BB.notice('litMessage', r.message, true);
        bindGrid();
      });
    });
  });
  BB.$('gvUsers').addEventListener('click', function (e) {
    var a = e.target.closest('a[data-act]');
    if (!a) return;
    e.preventDefault();
    var id = a.getAttribute('data-id');
    if (a.getAttribute('data-act') === 'reset') {
      BB.$('hfResetUserId').value = id;
      BB.html('litResetInfo', '<p>Account: <b>' + BB.H(a.getAttribute('data-name')) + '</b></p>');
      BB.$('txtResetPassword').value = '';
      BB.show('pnlReset', true);
      BB.show('pnlForm', false);
    } else {
      BB.run('litMessage', function () {
        return BB.post('/api/super/accounts/' + id + '/toggle').then(function (r) { BB.notice('litMessage', r.message, true); bindGrid(); });
      });
    }
  });
  BB.$('btnReset').addEventListener('click', function () {
    BB.run('litMessage', function () {
      return BB.post('/api/super/accounts/' + BB.$('hfResetUserId').value + '/reset', { password: BB.$('txtResetPassword').value }).then(function (r) {
        BB.show('pnlReset', false);
        BB.notice('litMessage', r.message, true);
      });
    });
  });
  BB.$('btnCancelReset').addEventListener('click', function () { BB.show('pnlReset', false); });
  bindGrid();
});
