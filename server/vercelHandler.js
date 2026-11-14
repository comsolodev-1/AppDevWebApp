'use strict';
// Vercel entry helper. The files in /api/[s1]/..., one per path depth (1 to 4 segments), all use this handler.
// Vercel passes the URL pieces as the parameters s1, s2, s3, s4, so the original URL is rebuilt from them
// (this does not depend on how Vercel presents req.url), then the Express app handles the request as usual.
const app = require('./app');

module.exports = function handler(req, res) {
  try {
    const url = new URL(req.url, 'http://localhost');
    const given = req.query || {};
    const segments = [];
    for (let i = 1; i <= 4; i++) {
      const key = 's' + i;
      const value = given[key] !== undefined ? given[key] : url.searchParams.get(key);
      if (value !== undefined && value !== null && value !== '') segments.push(Array.isArray(value) ? value.join('/') : String(value));
      url.searchParams.delete(key);
    }
    if (segments.length > 0) {
      const query = url.searchParams.toString();
      req.url = '/api/' + segments.map(encodeURIComponent).join('/') + (query ? '?' + query : '');
    }
  } catch (err) { /* keep the URL as it is */ }
  return app(req, res);
};
