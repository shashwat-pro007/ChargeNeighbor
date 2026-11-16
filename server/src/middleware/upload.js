import crypto from 'node:crypto';
import path from 'node:path';
import multer from 'multer';
import { config } from '../config.js';
import { badRequest } from '../lib/errors.js';

const allowed = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.uploadDir),
  filename: (_req, file, cb) => {
    const ext = allowed.get(file.mimetype) ?? '.jpg';
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
  },
});

export const photoUpload = multer({
  storage,
  limits: { fileSize: config.maxUploadBytes, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!allowed.has(file.mimetype)) {
      return cb(badRequest('Photos must be a JPEG, PNG or WebP image.'));
    }
    return cb(null, true);
  },
}).single('photo');

export const uploadedPath = (file) => `/uploads/${path.basename(file.filename)}`;
