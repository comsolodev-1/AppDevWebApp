/* Bantay Barangay - shared front-end code.
   Replaces Site.master, Public.master, App_Code/Ui.vb and the three user controls
   (RankingsView, AnnouncementsView, PasswordForm). */
(function () {
  'use strict';

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var SHORT = MONTHS.map(function (m) { return m.slice(0, 3); });
  var BB = window.BB = { user: null, MONTHS: MONTHS };

  /* ---------------- Session token (no cookies) ----------------
     The server gives the browser a signed token; the browser keeps it in localStorage and sends it in the
     Authorization header. Every response carries a refreshed token (sliding 20 minute timeout). */
  var TOKEN_KEY = 'bb.token';
  function getToken() { try { return window.localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } }
  function storeToken(res) {
    var t = res.headers.get('x-session-token');
    if (t === null) return;
    try {
      if (t === '') window.localStorage.removeItem(TOKEN_KEY);
      else window.localStorage.setItem(TOKEN_KEY, t);
    } catch (e) { /* storage blocked */ }
  }
  BB.clearToken = function () { try { window.localStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ } };
  function authHeaders(extra) {
    var h = extra || {};
    var t = getToken();
    if (t) h['Authorization'] = 'Bearer ' + t;
    return h;
  }
  // fetch that sends the token and keeps it fresh
  BB.fetch = function (url, opts) {
    opts = opts || {};
    opts.headers = authHeaders(opts.headers);
    opts.cache = 'no-store';
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, 30000) : null;
    if (ctl) opts.signal = ctl.signal;
    return fetch(url, opts).then(function (res) {
      if (timer) clearTimeout(timer);
      storeToken(res);
      return res;
    }, function (err) {
      if (timer) clearTimeout(timer);
      var failure = err && err.name === 'AbortError'
        ? new Error('The server took too long to answer (' + url + '). Please try again.')
        : new Error('Could not reach the server (' + url + '). Check your connection and try again.');
      showProblem(failure.message);
      throw failure;
    });
  };

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

  BB.fillSelect = function (select, rows, textField, valueField, firstOption, emptyText) {
    if (typeof select === 'string') select = document.getElementById(select);
    var html = firstOption ? '<option value="' + BB.H(firstOption.value) + '">' + BB.H(firstOption.text) + '</option>' : '';
    if (rows.length === 0 && emptyText) html += '<option value="">' + BB.H(emptyText) + '</option>';
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
    var opts = { method: method, headers: {} };
    if (body instanceof FormData) {
      opts.body = body;
    } else if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    return BB.fetch(url, opts).then(function (res) {
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
        var err = new Error(data.error || ('The request failed (HTTP ' + res.status + ') for ' + url + '.'));
        if (!data.error) showProblem(err.message);   // not a normal validation message: show it on the page
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

  // Download a file through the API (sends the token) and save it; shows an error in the page if it fails
  BB.downloadFile = function (url, fileName) {
    return BB.fetch(url).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (text) {
          var data = {};
          try { data = JSON.parse(text); } catch (e) { data = {}; }
          if (res.status === 401 && data.expired) { window.location.href = '/login.html?expired=1'; return new Promise(function () {}); }
          if (res.status >= 500) { window.location.href = '/error.html'; return new Promise(function () {}); }
          throw new Error(data.error || 'File not found.');
        });
      }
      var name = fileName;
      var cd = res.headers.get('content-disposition') || '';
      var star = /filename\*=UTF-8''([^;]+)/i.exec(cd);
      var plain = /filename="([^"]+)"/i.exec(cd);
      if (star) { try { name = decodeURIComponent(star[1]); } catch (e) { /* keep */ } } else if (plain && !fileName) { name = plain[1]; }
      return res.blob().then(function (blob) {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name || 'download';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      });
    });
  };

  // Links to /download cannot carry the token, so they are fetched with the token and saved by script
  document.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('a[href^="/api/download"]') : null;
    if (!a) return;
    e.preventDefault();
    BB.downloadFile(a.getAttribute('href'), '').catch(function (err) { window.alert(err.message); });
  });

  /* ---------------- Page startup + master pages ---------------- */
  var SUPER = 'Super Admin';
  var BARANGAY = 'Barangay Admin';

  /* The layout (sidebar / top bar / public bar) is built once. After that, clicking a link swaps only the
     content area (no full page reload): the target page is fetched, its #page markup is shown, the URL and
     history are updated, and that page's script runs. Anything unusual falls back to a normal page load. */
  var shell = null;          // { layout, container, title } once the layout is on screen
  var registered = null;     // { options, ready } registered by the page script via BB.page
  var pageCache = {};        // path -> Promise of { title, html, script }
  var navToken = 0;
  var dynScript = null;

  function normalize(path) {
    path = String(path).split('#')[0].split('?')[0];
    return path === '/' ? '/index.html' : path;
  }
  function samePath(a, b) { return normalize(a).toLowerCase() === normalize(b).toLowerCase(); }

  function refreshActive() {
    var links = document.querySelectorAll('a[data-nav]');
    for (var i = 0; i < links.length; i++) {
      links[i].classList.toggle('active', samePath(links[i].getAttribute('href'), window.location.pathname));
    }
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
      return '<a href="' + folder + it[1] + '" data-nav>' + BB.H(it[0]) + '</a>';
    }).join('');
    var settings = '<a href="' + folder + 'Settings.html" data-nav>Settings</a>';
    var today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    var wrap = document.createElement('div');
    wrap.innerHTML =
      '<aside class="sidebar">' +
        '<div class="brand"><img src="/Content/dilg-logo.png" alt="DILG" /><strong>DILG Talisay</strong><span>Camarines Norte</span></div>' +
        '<div class="who"><b>' + BB.H(user.fullName) + '</b><small>' + (isSuper ? 'Super Admin' : 'Barangay Admin - ' + BB.H(user.barangayName)) + '</small></div>' +
        '<nav>' + menu + '</nav>' +
        '<div class="foot">' + settings + '<a href="#" id="btnSignOut" class="linkbtn">Sign Out</a></div>' +
      '</aside>' +
      '<div class="main"><div class="topbar"><span id="bbTitle">' + BB.H(document.title) + '</span><span>' + BB.H(today) + '</span></div><div class="content"></div></div>';
    var content = wrap.querySelector('.content');
    content.appendChild(page);
    while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
    shell = { layout: 'site', container: content, title: document.getElementById('bbTitle') };
    document.getElementById('btnSignOut').addEventListener('click', function (e) {
      e.preventDefault();
      BB.post('/api/logout').then(function () { BB.clearToken(); window.location.href = '/login.html'; });
    });
  }

  function buildPublicLayout(page) {
    var items = [['Dashboard', '/index.html'], ['Rankings', '/Viewer/Rankings.html'], ['Announcements', '/Viewer/Announcements.html'],
      ['Roster', '/Viewer/Roster.html'], ['Calendar', '/Viewer/Calendar.html']];
    var nav = items.map(function (it) {
      return '<a href="' + it[1] + '" data-nav>' + BB.H(it[0]) + '</a>';
    }).join('') + '<a class="login" href="/login.html">Admin Login</a>';

    var bar = document.createElement('div');
    bar.className = 'pubbar';
    bar.innerHTML = '<img src="/Content/dilg-logo.png" alt="DILG" /><span class="title">Bantay Barangay - DILG Talisay, Camarines Norte</span>' + nav;
    var main = document.createElement('div');
    main.className = 'pubmain';
    main.appendChild(page);
    document.body.appendChild(bar);
    document.body.appendChild(main);
    shell = { layout: 'public', container: main, title: null };
  }

  function shellAllows(path) {
    if (!shell) return false;
    if (shell.layout === 'site') {
      var folder = BB.user && BB.user.role === SUPER ? '/Super/' : '/Barangay/';
      return path.toLowerCase().indexOf(folder.toLowerCase()) === 0;
    }
    return samePath(path, '/index.html') || /^\/viewer\//i.test(path);
  }

  function startPage() {
    var p = registered;
    registered = null;
    if (!p) return;
    var info = { loggedIn: !!BB.user, user: BB.user, home: BB.home };
    Promise.resolve().then(function () { return p.ready(info); }).catch(function (err) {
      console.error(err);
      window.location.href = '/error.html';
    });
  }

  function fetchPage(path) {
    var key = normalize(path).toLowerCase();
    if (!pageCache[key]) {
      pageCache[key] = fetch(normalize(path)).then(function (res) {
        if (!res.ok) throw new Error('not found');
        return res.text();
      }).then(function (text) {
        var doc = new DOMParser().parseFromString(text, 'text/html');
        var page = doc.getElementById('page');
        var script = doc.querySelector('script[src^="/js/pages/"]');
        if (!page || !script) throw new Error('not a page');
        return { title: doc.title, html: page.innerHTML, script: script.getAttribute('src') };
      }).catch(function (err) { delete pageCache[key]; throw err; });
    }
    return pageCache[key];
  }

  function navigate(path, push) {
    var token = ++navToken;
    fetchPage(path).then(function (p) {
      if (token !== navToken) return;
      document.title = p.title;
      if (shell.title) shell.title.textContent = p.title;
      shell.container.innerHTML = '';
      var div = document.createElement('div');
      div.id = 'page';
      div.innerHTML = p.html;
      shell.container.appendChild(div);
      window.scrollTo(0, 0);
      var target = normalize(path);
      if (push) window.history.pushState({}, '', target);
      else if (!samePath(target, window.location.pathname)) window.history.replaceState({}, '', target);
      refreshActive();
      registered = null;
      if (dynScript && dynScript.parentNode) dynScript.parentNode.removeChild(dynScript);
      dynScript = document.createElement('script');
      dynScript.src = p.script;
      dynScript.onload = function () {
        if (token !== navToken) return;
        var reg = registered;
        // wrong layout or wrong role for this page: a normal page load handles the sign-out / redirect
        if (!reg || reg.options.layout !== shell.layout || (reg.options.role && (!BB.user || BB.user.role !== reg.options.role))) {
          window.location.href = path;
          return;
        }
        startPage();
      };
      dynScript.onerror = function () { window.location.href = path; };
      document.body.appendChild(dynScript);
    }).catch(function () { window.location.href = path; });
  }

  // Links inside the shell: swap the content instead of reloading the page
  document.addEventListener('click', function (e) {
    if (!shell || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
    var href = a.getAttribute('href');
    if (!href || href.charAt(0) === '#') return;
    var url;
    try { url = new URL(a.href, window.location.href); } catch (err) { return; }
    if (url.origin !== window.location.origin) return;
    if (!/\.html$/i.test(url.pathname) && url.pathname !== '/') return;
    if (!shellAllows(url.pathname)) return;
    e.preventDefault();
    navigate(url.pathname, !samePath(url.pathname, window.location.pathname));
  });

  window.addEventListener('popstate', function () {
    if (shell && shellAllows(window.location.pathname)) navigate(window.location.pathname, false);
    else window.location.reload();
  });

  // Called by every page script. options: { layout: 'site' | 'public', role: 'Super Admin' | 'Barangay Admin' }
  BB.page = function (options, ready) {
    registered = { options: options, ready: ready };
  };

  // First load of any page: check the session, build the layout once, start the page
  document.addEventListener('DOMContentLoaded', function () {
    if (!registered) return;
    var options = registered.options;
    BB.fetch('/api/session')
      .then(function (res) { return res.json(); })
      .then(function (info) {
        BB.user = info.user;
        BB.home = info.home;
        if (options.role && (!info.loggedIn || info.user.role !== options.role)) {
          // not allowed on this page: sign out and go to the login page
          return BB.fetch('/api/logout', { method: 'POST' })
            .then(function () { BB.clearToken(); window.location.href = '/login.html?expired=1'; });
        }
        var page = document.getElementById('page');
        if (options.layout === 'site') buildSiteLayout(info.user, page);
        else if (options.layout === 'public') buildPublicLayout(page);
        refreshActive();
        document.body.classList.remove('boot');
        startPage();
        // load the other pages of the menu in the background so clicking them feels instant
        setTimeout(function () {
          var links = document.querySelectorAll('a[data-nav]');
          for (var i = 0; i < links.length; i++) fetchPage(links[i].getAttribute('href')).catch(function () {});
        }, 600);
      })
      .catch(function (err) {
        console.error(err);
        window.location.href = '/error.html';
      });
  });

  // Lists that never change during a visit (barangays, roles, report types) are loaded once
  var metaPromise = null;
  BB.meta = function () {
    if (!metaPromise) metaPromise = BB.get('/api/super/meta').catch(function (err) { metaPromise = null; throw err; });
    return metaPromise;
  };

  // Anything that fails without being handled is shown on the page instead of failing silently
  function showProblem(message) {
    var host = document.getElementById('page') || document.body;
    var el = document.getElementById('bbProblem');
    if (!el) {
      el = document.createElement('div');
      el.id = 'bbProblem';
      host.insertBefore(el, host.firstChild);
    }
    el.innerHTML = '<div class="notice notice-error"><b>Something could not be loaded.</b> ' + BB.H(message) +
      ' <a href="/diagnose.html">Run diagnostics</a></div>';
  }
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    showProblem(r && r.message ? r.message : String(r));
  });

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
          (r.attachment_file_name === null ? '' : '<a class="btn btn-outline btn-sm" href="/api/download?t=announcement&amp;id=' + r.announcement_id + '">Download: ' + BB.H(r.attachment_file_name) + '</a>') +
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
