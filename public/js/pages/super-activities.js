BB.page({ layout: 'site', role: 'Super Admin' }, function () {
  var meta = null;

  function checks() { return Array.prototype.slice.call(document.querySelectorAll('#cblBarangays input[type=checkbox]')); }
  function setAll(v) { checks().forEach(function (c) { c.checked = v; }); }

  function clearForm() {
    BB.$('hfActivityId').value = '0';
    BB.$('txtName').value = '';
    BB.$('txtDescription').value = '';
    BB.$('txtRequirements').value = '';
    BB.$('txtDeadline').value = '';
    BB.$('txtDeadline').disabled = false;
    BB.$('ddlFrequency').disabled = false;
    BB.$('ddlFrequency').selectedIndex = 0;
    BB.$('chkPublic').checked = true;
    BB.$('fuTemplate').value = '';
    BB.html('litCurrentTemplate', '');
    setAll(true);
  }

  function bindGrid() {
    BB.get('/api/super/activities?' + BB.qs({ search: BB.$('txtSearch').value, status: BB.$('ddlStatusFilter').value })).then(function (d) {
      BB.html('gvActivities', BB.grid([
        { h: 'Activity', cell: function (r) { return '<b>' + BB.H(r.activity_name) + '</b><br /><small>' + BB.H(r.description) + '</small>'; } },
        { h: 'Frequency', cell: function (r) { return BB.H(r.frequency); } },
        { h: 'Latest Deadline', cell: function (r) { return BB.dateText(r.latest_deadline); } },
        { h: 'Barangays', cell: function (r) { return BB.H(r.barangay_count); } },
        { h: 'Status', cell: function (r) { return BB.badge(r.activity_status); } },
        { h: 'Public', cell: function (r) { return Number(r.is_public) === 1 ? BB.badge('Public') : BB.badge('Private'); } },
        { h: 'Actions', cell: function (r) {
          return '<span class="actions"><a href="#" data-act="edit" data-id="' + r.activity_id + '">Edit</a>' +
            '<a href="#" data-act="period" data-id="' + r.activity_id + '" data-name="' + BB.H(r.activity_name) + '" data-freq="' + BB.H(r.frequency) + '">Add Period</a>' +
            '<a href="#" class="danger" data-act="delete" data-id="' + r.activity_id + '">Delete</a></span>';
        } }
      ], d.rows, 'No activities found.'));
    });
  }

  BB.$('btnNew').addEventListener('click', function () {
    clearForm();
    BB.html('litFormTitle', 'Create New Activity');
    BB.show('pnlForm', true);
    BB.show('pnlPeriod', false);
  });
  BB.$('btnCancel').addEventListener('click', function () { BB.show('pnlForm', false); });
  BB.$('btnAll').addEventListener('click', function () { setAll(true); });
  BB.$('btnNone').addEventListener('click', function () { setAll(false); });
  BB.$('btnFilter').addEventListener('click', bindGrid);

  BB.$('btnSave').addEventListener('click', function () {
    var id = Number(BB.$('hfActivityId').value);
    var fd = new FormData();
    fd.append('activity_name', BB.$('txtName').value);
    fd.append('description', BB.$('txtDescription').value);
    fd.append('instructions', BB.$('txtRequirements').value);
    fd.append('frequency', BB.$('ddlFrequency').value);
    fd.append('deadline', BB.$('txtDeadline').value);
    fd.append('is_public', BB.$('chkPublic').checked ? '1' : '0');
    fd.append('barangays', JSON.stringify(checks().filter(function (c) { return c.checked; }).map(function (c) { return c.value; })));
    if (BB.$('fuTemplate').files[0]) fd.append('template', BB.$('fuTemplate').files[0]);
    BB.run('litMessage', function () {
      return BB.api(id === 0 ? 'POST' : 'PUT', '/api/super/activities' + (id === 0 ? '' : '/' + id), fd).then(function (r) {
        BB.show('pnlForm', false);
        BB.notice('litMessage', r.message, true);
        bindGrid();
      });
    });
  });

  BB.$('btnAddPeriod').addEventListener('click', function () {
    var id = Number(BB.$('hfPeriodActivityId').value);
    BB.run('litMessage', function () {
      return BB.post('/api/super/activities/' + id + '/periods', { deadline: BB.$('txtNewDeadline').value }).then(function (r) {
        BB.show('pnlPeriod', false);
        BB.notice('litMessage', r.message, true);
        bindGrid();
      });
    });
  });
  BB.$('btnCancelPeriod').addEventListener('click', function () { BB.show('pnlPeriod', false); });

  BB.$('gvActivities').addEventListener('click', function (e) {
    var a = e.target.closest('a[data-act]');
    if (!a) return;
    e.preventDefault();
    var id = a.getAttribute('data-id');
    var act = a.getAttribute('data-act');
    if (act === 'edit') {
      BB.run('litMessage', function () {
        return BB.get('/api/super/activities/' + id).then(function (d) {
          var x = d.activity;
          clearForm();
          BB.$('hfActivityId').value = id;
          BB.$('txtName').value = x.activity_name || '';
          BB.$('txtDescription').value = x.description || '';
          BB.$('txtRequirements').value = x.instructions || '';
          BB.$('ddlFrequency').value = x.frequency;
          BB.$('ddlFrequency').disabled = true;
          BB.$('txtDeadline').disabled = true;
          BB.$('chkPublic').checked = Number(x.is_public) === 1;
          if (x.template_file_name !== null) BB.html('litCurrentTemplate', '<small>Current template: ' + BB.H(x.template_file_name) + ' (upload a new file to replace it)</small>');
          checks().forEach(function (c) { c.checked = d.assigned.indexOf(c.value) >= 0; });
          BB.html('litFormTitle', 'Edit Activity');
          BB.show('pnlForm', true);
          BB.show('pnlPeriod', false);
        });
      });
    } else if (act === 'period') {
      BB.$('hfPeriodActivityId').value = id;
      BB.html('litPeriodInfo', '<p><b>' + BB.H(a.getAttribute('data-name')) + '</b> (' + BB.H(a.getAttribute('data-freq')) + ')</p>');
      BB.$('txtNewDeadline').value = '';
      BB.show('pnlPeriod', true);
      BB.show('pnlForm', false);
    } else if (window.confirm('Delete this activity? Activities that already have submissions are archived instead.')) {
      BB.run('litMessage', function () {
        return BB.del('/api/super/activities/' + id).then(function (r) {
          if (r.message) BB.notice('litMessage', r.message, true);
          bindGrid();
        });
      });
    }
  });

  BB.meta().then(function (m) {
    meta = m;
    BB.$('ddlFrequency').innerHTML = m.frequencies.map(function (f) { return '<option>' + BB.H(f) + '</option>'; }).join('');
    // CheckBoxList with RepeatLayout=Table, RepeatColumns=3
    var html = '<table>';
    m.barangays.forEach(function (b, i) {
      if (i % 3 === 0) html += '<tr>';
      html += '<td><input type="checkbox" id="cb' + i + '" value="' + BB.H(b.barangay_code) + '" checked /><label for="cb' + i + '"> ' + BB.H(b.barangay_name) + '</label></td>';
      if (i % 3 === 2 || i === m.barangays.length - 1) html += '</tr>';
    });
    BB.html('cblBarangays', html + '</table>');
    bindGrid();
  });
});
