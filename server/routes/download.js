'use strict';
// Port of Download.aspx - permission-checked file download (the only way to get uploads)
const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const auth = require('../auth');
const uploads = require('../uploads');
const { wrap } = require('../util');

const router = express.Router();

router.get('/download', wrap(async (req, res) => {
  const deny = () => res.status(404).type('text/plain').send('File not found.');
  const kind = String(req.query.t || '');
  const id = /^\d+$/.test(String(req.query.id || '')) ? parseInt(req.query.id, 10) : NaN;
  if (Number.isNaN(id)) return deny();

  let storedPath = null;
  let displayName = null;

  if (kind === 'submission' || kind === 'denial') {
    if (!auth.isLoggedIn(req)) return deny();
    const row = await db.queryRow('SELECT file_name, file_path, denial_attachment, barangay_code FROM submissions WHERE date_id = @id', '@id', id);
    if (!row) return deny();
    if (!auth.isSuperAdmin(req) && row.barangay_code !== auth.barangayCode(req)) return deny();
    if (kind === 'submission') {
      storedPath = row.file_path;
      displayName = row.file_name;
    } else if (row.denial_attachment !== null) {
      storedPath = row.denial_attachment;
      displayName = 'denial-attachment' + path.extname(storedPath);
    }
  } else if (kind === 'template') {
    const row = await db.queryRow('SELECT template_file_name, template_link, is_public FROM activities WHERE activity_id = @id', '@id', id);
    if (!row || row.template_link === null) return deny();
    let allowed = Number(row.is_public) === 1;
    if (auth.isLoggedIn(req)) {
      if (auth.isSuperAdmin(req)) {
        allowed = true;
      } else if (await db.scalarInt('SELECT COUNT(*) FROM activity_barangays WHERE activity_id = @a AND barangay_code = @b', '@a', id, '@b', auth.barangayCode(req)) > 0) {
        allowed = true;
      }
    }
    if (!allowed) return deny();
    storedPath = row.template_link;
    displayName = row.template_file_name;
  } else if (kind === 'announcement') {
    const row = await db.queryRow("SELECT attachment_file_name, attachment_file_path, visibility_type, target_role_id, target_barangay_code FROM announcements WHERE announcement_id = @id AND status = 'Published'", '@id', id);
    if (!row || row.attachment_file_path === null) return deny();
    let allowed = row.visibility_type === 'All';
    if (auth.isLoggedIn(req) && !allowed) {
      if (auth.isSuperAdmin(req)) {
        allowed = true;
      } else if (row.visibility_type === 'Specific Role' && row.target_role_id !== null && Number(row.target_role_id) === auth.roleId(req)) {
        allowed = true;
      } else if (row.visibility_type === 'Specific Barangay' && row.target_barangay_code !== null && row.target_barangay_code === auth.barangayCode(req)) {
        allowed = true;
      }
    }
    if (!allowed) return deny();
    storedPath = row.attachment_file_path;
    displayName = row.attachment_file_name;
  }

  if (!storedPath) return deny();
  const fullPath = uploads.fullPath(storedPath);
  if (!fullPath || !fs.existsSync(fullPath)) return deny();

  const safeName = String(displayName || 'download').replace(/"/g, '').replace(/[\r\n]/g, '');
  res.set({
    'Content-Type': uploads.contentTypeFor(safeName),
    'Content-Disposition': 'attachment; filename="' + safeName.replace(/[^\x20-\x7E]/g, '_') + '"; filename*=UTF-8\'\'' + encodeURIComponent(safeName),
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store'
  });
  fs.createReadStream(fullPath).pipe(res);
}));

module.exports = router;
