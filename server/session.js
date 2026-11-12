'use strict';
// Cookie-free, stateless session (serverless workaround).
// The browser keeps a signed token and sends it in the Authorization header; the server answers every
// request with a refreshed token in the X-Session-Token header (sliding 20 minute timeout).
// req.session behaves like the old Session object.
const crypto = require('crypto');
const onHeaders = require('on-headers');
const config = require('./config');

function sign(text) {
  return crypto.createHmac('sha256', config.sessionSecret).update(text).digest('base64url');
}

function safeEqual(a, b) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function middleware(req, res, next) {
  const header = String(req.headers.authorization || '');
  const raw = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  let data = {};
  if (raw) {
    const dot = raw.lastIndexOf('.');
    if (dot > 0 && safeEqual(raw.slice(dot + 1), sign(raw.slice(0, dot)))) {
      try {
        const payload = JSON.parse(Buffer.from(raw.slice(0, dot), 'base64url').toString('utf8'));
        if (payload && payload.exp > Date.now() && payload.d && typeof payload.d === 'object') data = payload.d;
      } catch (e) { data = {}; }
    }
  }

  let destroyed = false;
  const clear = () => { Object.keys(data).forEach((k) => { delete data[k]; }); };
  Object.defineProperty(data, 'destroy', { enumerable: false, value: (cb) => { destroyed = true; clear(); if (cb) cb(); } });
  Object.defineProperty(data, 'regenerate', { enumerable: false, value: (cb) => { clear(); if (cb) cb(); } });
  req.session = data;

  onHeaders(res, () => {
    res.setHeader('Cache-Control', res.getHeader('Cache-Control') || 'no-store');
    if (destroyed || Object.keys(data).length === 0) {
      if (raw) res.setHeader('X-Session-Token', '');     // tells the browser to forget the token
      return;
    }
    const body = Buffer.from(JSON.stringify({ d: data, exp: Date.now() + config.sessionMinutes * 60 * 1000 }), 'utf8').toString('base64url');
    res.setHeader('X-Session-Token', body + '.' + sign(body));
  });
  next();
}

module.exports = middleware;
