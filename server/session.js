'use strict';
// Stateless session (serverless workaround): the session lives in a signed, HttpOnly cookie
// instead of server memory, because every serverless call may run on a different instance.
// Sliding 20 minute timeout, same as before. req.session behaves like the old Session object.
const crypto = require('crypto');
const onHeaders = require('on-headers');
const config = require('./config');

const NAME = 'bantay.sid';

function sign(text) {
  return crypto.createHmac('sha256', config.sessionSecret).update(text).digest('base64url');
}

function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  });
  return out;
}

function safeEqual(a, b) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function middleware(req, res, next) {
  const raw = parseCookies(req.headers.cookie)[NAME];
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
    const flags = '; Path=/; HttpOnly; SameSite=Lax' + (config.requireSsl ? '; Secure' : '');
    if (destroyed || Object.keys(data).length === 0) {
      if (raw) res.append('Set-Cookie', NAME + '=; Max-Age=0' + flags);
      return;
    }
    const maxAge = config.sessionMinutes * 60;
    const body = Buffer.from(JSON.stringify({ d: data, exp: Date.now() + maxAge * 1000 }), 'utf8').toString('base64url');
    res.append('Set-Cookie', NAME + '=' + body + '.' + sign(body) + '; Max-Age=' + maxAge + flags);
  });
  next();
}

module.exports = middleware;
