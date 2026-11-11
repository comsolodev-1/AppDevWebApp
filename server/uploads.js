'use strict';
// Port of App_Code/Uploads.vb - validation and storage of uploaded files.
// Serverless workaround: files are stored in the database (table file_store) instead of a disk.
const path = require('path');
const crypto = require('crypto');
const config = require('./config');
const db = require('./db');

const AllowedExtensions = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.jpg', '.jpeg', '.png'];
const MaxBytes = config.maxUploadBytes;
const MaxMb = Math.round(MaxBytes / (1024 * 1024));

function startsWith(buffer, signature) {
  if (buffer.length < signature.length) return false;
  for (let i = 0; i < signature.length; i++) {
    if (buffer[i] !== signature[i]) return false;
  }
  return true;
}

function signatureMatches(extension, buffer) {
  switch (extension) {
    case '.pdf': return startsWith(buffer, [0x25, 0x50, 0x44, 0x46]);
    case '.docx':
    case '.xlsx': return startsWith(buffer, [0x50, 0x4B, 0x03, 0x04]);
    case '.doc':
    case '.xls': return startsWith(buffer, [0xD0, 0xCF, 0x11, 0xE0]);
    case '.jpg':
    case '.jpeg': return startsWith(buffer, [0xFF, 0xD8, 0xFF]);
    case '.png': return startsWith(buffer, [0x89, 0x50, 0x4E, 0x47]);
  }
  return false;
}

function cleanName(raw) {
  // multer hands the name over as latin1 bytes - restore the UTF-8 text
  let name = Buffer.from(String(raw || ''), 'latin1').toString('utf8');
  return name.split(/[\\/]/).pop();
}

// file: multer memory file. Returns { ok, storedPath, originalName, error }
async function save(file, folder) {
  if (!file) return { ok: false, error: 'Please choose a file to upload.' };
  let name = cleanName(file.originalname);
  const extension = path.extname(name).toLowerCase();
  if (AllowedExtensions.indexOf(extension) < 0) {
    return { ok: false, error: 'File type not allowed. Allowed: PDF, DOC, DOCX, XLS, XLSX, JPG, PNG.' };
  }
  if (!file.size || file.size <= 0) return { ok: false, error: 'The selected file is empty.' };
  if (file.size > MaxBytes) return { ok: false, error: 'File is too large. Maximum size is ' + MaxMb + ' MB.' };
  if (!signatureMatches(extension, file.buffer)) {
    return { ok: false, error: 'The file content does not match its file type.' };
  }
  const storedPath = folder + '/' + crypto.randomBytes(16).toString('hex') + extension;
  await db.execute('INSERT INTO file_store (file_key, content) VALUES (@k, @c)', '@k', storedPath, '@c', file.buffer);
  if (name.length > 200) name = name.substring(name.length - 200);
  return { ok: true, storedPath, originalName: name };
}

// Returns a Buffer or null
async function read(storedPath) {
  if (!storedPath) return null;
  const row = await db.queryRow('SELECT content FROM file_store WHERE file_key = @k', '@k', String(storedPath));
  return row ? row.content : null;
}

async function remove(storedPath) {
  if (!storedPath) return;
  await db.execute('DELETE FROM file_store WHERE file_key = @k', '@k', String(storedPath));
}

function contentTypeFor(fileName) {
  switch (path.extname(fileName).toLowerCase()) {
    case '.pdf': return 'application/pdf';
    case '.doc': return 'application/msword';
    case '.docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case '.xls': return 'application/vnd.ms-excel';
    case '.xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.png': return 'image/png';
  }
  return 'application/octet-stream';
}

module.exports = { AllowedExtensions, MaxBytes, MaxMb, save, read, remove, contentTypeFor };
