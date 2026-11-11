(function () {
  document.addEventListener('DOMContentLoaded', function () {
    fetch('/api/session', { credentials: 'same-origin', cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (info) {
      BB.csrf = info.csrf;
      if (info.loggedIn) { window.location.href = info.home; return; }
      if (/[?&]expired=1/.test(window.location.search)) BB.notice('litMessage', 'Please sign in to continue.', false);
    });
    BB.$('form1').addEventListener('submit', function (e) {
      e.preventDefault();
      var username = BB.$('txtUsername').value;
      var password = BB.$('txtPassword').value;
      if (username.trim().length === 0 || password.length === 0) {
        BB.notice('litMessage', 'Please enter your username and password.', false);
        return;
      }
      BB.post('/api/login', { username: username, password: password, website: BB.$('txtWebsite').value })
        .then(function (r) { window.location.href = r.home; })
        .catch(function (err) {
          BB.$('txtPassword').value = '';
          BB.notice('litMessage', err.message, false);
        });
    });
  });
})();
