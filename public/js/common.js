/* Bantay Barangay - shared front-end code.
   Replaces Site.master, Public.master, App_Code/Ui.vb and the three user controls
   (RankingsView, AnnouncementsView, PasswordForm). */
(function () {
  'use strict';

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var SHORT = MONTHS.map(function (m) { return m.slice(0, 3); });
  var BB = window.BB = { csrf: '', user: null, MONTHS: MONTHS };

  /* ---------------- Ui.vb ---------------- */
  BB.H = function (value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  function parts(value) {
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(String(value));
    if (!m) return null;
    return { y: +m[1], mo: +m[2], d: +m[3], h: m[4] === undefined ? 0 : +m[4], mi: m[5] === undefined ? 0 : +m[5] };
  }

  BB.dateText = function (value) {
    if (value === null || value === undefined || value === '') return '-';
    var p = parts(value);
    return p ? SHORT[p.mo - 1] + ' ' + p.d + ', ' + p.y : '-';
  };

  BB.dateTimeText = function (value) {
    if (value === null || value === undefined || value === '') return '-';
    var p = parts(value);
    if (!p) return '-';
    var h12 = p.h % 12 === 0 ? 12 : p.h % 12;
    return SHORT[p.mo - 1] + ' ' + p.d + ', ' + p.y + ' ' + h12 + ':' + String(p.mi).padStart(2, '0') + ' ' + (p.h < 12 ? 'AM' : 'PM');
  };

  // .NET format "0.0#"
  BB.scoreText = function (value) {
    if (value === null || value === undefined || value === '') return '-';
    var s = Number(value).toFixed(2);
    if (s.slice(-1) === '0') s = s.slice(0, -1);
    return s;
  };

  BB.badge = function (status) {
    var text = status === null || status === undefined ? '' : String(status);
    var css = text.toLowerCase().replace(/ /g, '-');
    return '<span class="badge badge-' + BB.H(css) + '">' + BB.H(text) + '</span>';
  };

  BB.nl2br = function (value) {
    return BB.H(value).replace(/\n/g, '<br />');
  };

  BB.notice = function (target, message, success) {
    if (typeof target === 'string') target = document.getElementById(target);
    if (!target) return;
    target.innerHTML = '<div class="' + (success ? 'notice notice-ok' : 'notice notice-error') + '">' + BB.H(message) + '</div>';
  };

  BB.html = function (target, html) {
    if (typeof target === 'string') target = document.getElementById(target);
    if (target) target.innerHTML = html;
  };

  BB.$ = function (id) { return document.getElementById(id); };

  BB.show = function (id, visible) {
    var el = typeof id === 'string' ? document.getElementById(id) : id;
    if (el) el.hidden = !visible;
  };

  BB.fillSelect = function (select, rows, textField, valueField, firstOption) {
    if (typeof select === 'string') select = document.getElementById(select);
    var html = firstOption ? '<option value="' + BB.H(firstOption.value) + '">' + BB.H(firstOption.text) + '</option>' : '';
    rows.forEach(function (r) {
      html += '<option value="' + BB.H(r[valueField]) + '">' + BB.H(r[textField]) + '</option>';
    });
    select.innerHTML = html;
  };

  BB.fillYears = function (select) {
    if (typeof select === 'string') select = document.getElementById(select);
    var now = new Date().getFullYear();
    var html = '';
    for (var y = now + 1; y >= 2024; y--) html += '<option value="' + y + '">' + y + '</option>';
    select.innerHTML = html;
    select.value = String(now);
  };

  BB.fillMonths = function (select) {
    if (typeof select === 'string') select = document.getElementById(select);
    var html = '';
    for (var m = 1; m <= 12; m++) html += '<option value="' + m + '">' + MONTHS[m - 1] + '</option>';
    select.innerHTML = html;
    select.value = String(new Date().getMonth() + 1);
  };

  // GridView look: <table class="grid"> with header cells and an empty-data row
  // columns: [{ h: 'Header', cell: function(row){ return html } }]
  BB.grid = function (columns, rows, emptyText) {
    if (!rows || rows.length === 0) {
      return emptyText ? '<table class="grid" cellspacing="0" style="border-collapse:collapse;"><tr><td>' + BB.H(emptyText) + '</td></tr></table>' : '';
    }
    var html = '<table class="grid" cellspacing="0" style="border-collapse:collapse;"><tr>';
    columns.forEach(function (c) { html += '<th scope="col">' + BB.H(c.h) + '</th>'; });
    html += '</tr>';
    rows.forEach(function (row, i) {
      var attr = columns.rowAttr ? columns.rowAttr(row, i) : '';
      html += '<tr' + attr + '>';
      columns.forEach(function (c) { html += '<td>' + c.cell(row) + '</td>'; });
      html += '</tr>';
    });
    return html + '</table>';
  };

  /* ---------------- API ---------------- */
  BB.api = function (method, url, body) {
    var opts = { method: method, credentials: 'same-origin', headers: { 'X-CSRF-Token': BB.csrf } };
    if (body instanceof FormData) {
      opts.body = body;
    } else if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    return fetch(url, opts).then(function (res) {
      return res.text().then(function (text) {
        var data = {};
        try { data = text ? JSON.parse(text) : {}; } catch (e) { data = {}; }
        if (res.ok) return data;
        if (res.status === 401 && data.expired) {
          window.location.href = '/login.html?expired=1';
          return new Promise(function () {});
        }
        if (res.status >= 500) {
          window.location.href = '/error.html';
          return new Promise(function () {});
        }
        var err = new Error(data.error || 'The request could not be completed.');
        err.status = res.status;
        throw err;
      });
    });
  };
  BB.get = function (url) { return BB.api('GET', url); };
  BB.post = function (url, body) { return BB.api('POST', url, body === undefined ? {} : body); };
  BB.put = function (url, body) { return BB.api('PUT', url, body); };
  BB.del = function (url) { return BB.api('DELETE', url); };
  BB.qs = function (obj) {
    return Object.keys(obj).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(obj[k]); }).join('&');
  };

  // Download a generated file (PDF) and show the error in the page if it fails
  BB.downloadFile = function (url, fileName) {
    return fetch(url, { credentials: 'same-origin' }).then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (res.status === 401 && data.expired) { window.location.href = '/login.html?expired=1'; return new Promise(function () {}); }
          if (res.status >= 500) { window.location.href = '/error.html'; return new Promise(function () {}); }
          throw new Error(data.error || 'The file could not be created.');
        });
      }
      return res.blob().then(function (blob) {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      });
    });
  };

  /* ---------------- Page startup + master pages ---------------- */
  var SUPER = 'Super Admin';
  var BARANGAY = 'Barangay Admin';

  function pathEndsWith(file) {
    return window.location.pathname.toLowerCase().slice(-(file.length + 1)) === '/' + file.toLowerCase();
  }

  function buildSiteLayout(user, page) {
    var isSuper = user.role === SUPER;
    var folder = isSuper ? '/Super/' : '/Barangay/';
    var items = [['Dashboard', 'Dashboard.html']];
    if (isSuper) {
      items.push(['Activities', 'Activities.html'], ['Submissions', 'Submissions.html'], ['Reports', 'Reports.html'], ['Rankings', 'Rankings.html'],
        ['Announcements', 'Announcements.html'], ['Important Dates', 'ImportantDates.html'], ['Accounts', 'Accounts.html']);
    } else {
      items.push(['My Activities', 'MyActivities.html'], ['My Reports', 'MyReports.html'], ['Officials & Roster', 'Roster.html'],
        ['Rankings', 'Rankings.html'], ['Announcements', 'Announcements.html']);
    }
    var menu = items.map(function (it) {
      return '<a href="' + folder + it[1] + '"' + (pathEndsWith(it[1]) ? ' class="active"' : '') + '>' + BB.H(it[0]) + '</a>';
    }).join('');
    var settings = '<a href="' + folder + 'Settings.html"' + (pathEndsWith('Settings.html') ? ' class="active"' : '') + '>Settings</a>';
    var today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    var wrap = document.createElement('div');
    wrap.innerHTML =
      '<aside class="sidebar">' +
        '<div class="brand"><img src="/Content/dilg-logo.png" alt="DILG" /><strong>DILG Talisay</strong><span>Camarines Norte</span></div>' +
        '<div class="who"><b>' + BB.H(user.fullName) + '</b><small>' + (isSuper ? 'Super Admin' : 'Barangay Admin - ' + BB.H(user.barangayName)) + '</small></div>' +
        '<nav>' + menu + '</nav>' +
        '<div class="foot">' + settings + '<a href="#" id="btnSignOut" class="linkbtn">Sign Out</a></div>' +
      '</aside>' +
      '<div class="main"><div class="topbar"><span>' + BB.H(document.title) + '</span><span>' + BB.H(today) + '</span></div><div class="content"></div></div>';
    while (wrap.firstChild) {
      if (wrap.firstChild.className === 'main') {
        var main = wrap.firstChild;
        main.querySelector('.content').appendChild(page);
      }
      document.body.appendChild(wrap.firstChild);
    }
    document.getElementById('btnSignOut').addEventListener('click', function (e) {
      e.preventDefault();
      BB.post('/api/logout').then(function () { window.location.href = '/login.html'; });
    });
  }

  function buildPublicLayout(page) {
    var items = [['Dashboard', '/index.html'], ['Rankings', '/Viewer/Rankings.html'], ['Announcements', '/Viewer/Announcements.html'],
      ['Roster', '/Viewer/Roster.html'], ['Calendar', '/Viewer/Calendar.html']];
    var current = window.location.pathname.toLowerCase();
    if (current === '/') current = '/index.html';
    var nav = items.map(function (it) {
      return '<a href="' + it[1] + '"' + (current === it[1].toLowerCase() ? ' class="active"' : '') + '>' + BB.H(it[0]) + '</a>';
    }).join('') + '<a class="login" href="/login.html">Admin Login</a>';

    var bar = document.createElement('div');
    bar.className = 'pubbar';
    bar.innerHTML = '<img src="/Content/dilg-logo.png" alt="DILG" /><span class="title">Bantay Barangay - DILG Talisay, Camarines Norte</span>' + nav;
    var main = document.createElement('div');
    main.className = 'pubmain';
    main.appendChild(page);
    document.body.appendChild(bar);
    document.body.appendChild(main);
  }

  // options: { layout: 'site' | 'public' | 'bare', role: 'Super Admin' | 'Barangay Admin' }
  BB.page = function (options, ready) {
    document.addEventListener('DOMContentLoaded', function () {
      fetch('/api/session', { credentials: 'same-origin', cache: 'no-store' })
        .then(function (res) { return res.json(); })
        .then(function (info) {
          BB.csrf = info.csrf;
          BB.user = info.user;
          BB.home = info.home;
          if (options.role && (!info.loggedIn || info.user.role !== options.role)) {
            return fetch('/api/logout', { method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF-Token': BB.csrf } })
              .then(function () { window.location.href = '/login.html?expired=1'; });
          }
          var page = document.getElementById('page');
          if (options.layout === 'site') buildSiteLayout(info.user, page);
          else if (options.layout === 'public') buildPublicLayout(page);
          document.body.classList.remove('boot');
          return ready(info);
        })
        .catch(function (err) {
          console.error(err);
          window.location.href = '/error.html';
        });
    });
  };

  // run an async action and show its error as a notice (try/catch of the original code-behind)
  BB.run = function (messageTarget, work) {
    return Promise.resolve().then(work).catch(function (err) {
      BB.notice(messageTarget, err.message, false);
    });
  };

  /* ---------------- Controls/RankingsView ---------------- */
  BB.rankingsView = function (container, highlightCode) {
    if (typeof container === 'string') container = document.getElementById(container);
    container.innerHTML =
      '<div class="row">' +
        '<div class="field"><label>Year</label><select id="rvYear"></select></div>' +
        '<div class="field"><label>Month</label><select id="rvMonth"></select></div>' +
      '</div>' +
      '<p class="sub">Ranking is based on the accumulated compliance scores of confirmed reports (on time = 1.0, late = 0.5).</p>' +
      '<div class="grid-wrap" id="rvGrid"></div>';
    var year = document.getElementById('rvYear');
    var month = document.getElementById('rvMonth');
    BB.fillYears(year);
    var html = '<option value="0">All months</option>';
    for (var m = 1; m <= 12; m++) html += '<option value="' + m + '">' + MONTHS[m - 1] + '</option>';
    month.innerHTML = html;

    var columns = [
      { h: 'Rank', cell: function (r) { return BB.H(r.Rank); } },
      { h: 'Barangay', cell: function (r) { return BB.H(r.Barangay); } },
      { h: 'Confirmed Reports', cell: function (r) { return BB.H(r.Confirmed); } },
      { h: 'Late', cell: function (r) { return BB.H(r.Late); } },
      { h: 'Total Score', cell: function (r) { return BB.scoreText(r.Score); } }
    ];
    columns.rowAttr = function (r) {
      var attr = '';
      var cls = Number(r.Rank) === 1 && Number(r.Score) > 0 ? ' class="rank-1"' : '';
      if (highlightCode && r.barangay_code === highlightCode) attr = ' style="background:#e6f2ec;font-weight:600"';
      return cls + attr;
    };
    function load() {
      BB.get('/api/rankings?' + BB.qs({ year: year.value, month: month.value })).then(function (data) {
        document.getElementById('rvGrid').innerHTML = BB.grid(columns, data.rows, 'No ranking data yet.');
      });
    }
    year.addEventListener('change', load);
    month.addEventListener('change', load);
    load();
  };

  /* ---------------- Controls/AnnouncementsView ---------------- */
  BB.announcementsView = function (container, maxItems) {
    if (typeof container === 'string') container = document.getElementById(container);
    var url = '/api/announcements' + (maxItems ? '?max=' + maxItems : '');
    return BB.get(url).then(function (data) {
      var html = '';
      data.rows.forEach(function (r) {
        var pinned = Number(r.is_pinned) === 1;
        html += '<div class="card ann ' + (pinned ? 'pinned' : '') + '">' +
          '<h3>' + BB.H(r.title) + ' ' + (pinned ? '<span class="badge badge-medium">Pinned</span>' : '') + ' ' +
          (r.priority !== null && r.priority === 'High' ? BB.badge('High') : '') + '</h3>' +
          '<small>Posted ' + BB.dateTimeText(r.date_published) + '</small>' +
          '<p>' + BB.nl2br(r.content) + '</p>' +
          (r.attachment_file_name === null ? '' : '<a class="btn btn-outline btn-sm" href="/download?t=announcement&amp;id=' + r.announcement_id + '">Download: ' + BB.H(r.attachment_file_name) + '</a>') +
          '</div>';
      });
      if (data.rows.length === 0) html = '<div class="card">No announcements at the moment.</div>';
      container.innerHTML = html;
    });
  };

  /* ---------------- Controls/PasswordForm ---------------- */
  BB.passwordForm = function (container) {
    if (typeof container === 'string') container = document.getElementById(container);
    container.innerHTML =
      '<div class="card" style="max-width:460px">' +
        '<h2>Change Password</h2>' +
        '<div id="pwMessage"></div>' +
        '<div class="field"><label>Current password</label><input type="password" id="pwCurrent" maxlength="100" /></div>' +
        '<div class="field" style="margin-top:10px"><label>New password (at least 8 characters, letters and numbers)</label><input type="password" id="pwNew" maxlength="100" /></div>' +
        '<div class="field" style="margin-top:10px"><label>Confirm new password</label><input type="password" id="pwConfirm" maxlength="100" /></div>' +
        '<div style="margin-top:14px"><button type="button" class="btn" id="pwSave">Update Password</button></div>' +
      '</div>';
    document.getElementById('pwSave').addEventListener('click', function () {
      BB.run('pwMessage', function () {
        return BB.post('/api/account/password', {
          current: document.getElementById('pwCurrent').value,
          newPassword: document.getElementById('pwNew').value,
          confirm: document.getElementById('pwConfirm').value
        }).then(function (r) {
          document.getElementById('pwCurrent').value = '';
          BB.notice('pwMessage', r.message, true);
        });
      });
    });
  };
})();
