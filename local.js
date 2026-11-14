'use strict';
// Local runner: npm start (kept out of the way of Vercel's automatic Express detection)  ->  http://localhost:3000
// (On Vercel the app is started by api/index.js instead.)
const app = require('./server/app');
const config = require('./server/config');

app.listen(config.port, () => {
  console.log('Bantay Barangay is running at http://localhost:' + config.port);
});
