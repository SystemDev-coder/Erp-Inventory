import { Router } from 'express';
import path from 'path';
import multer from 'multer';
import type { FileFilterCallback } from 'multer';
import { requireAuth } from '../../middlewares/requireAuth';
import { requirePerm } from '../../middlewares/requirePerm';
import {
  importCustomers,
  importSuppliers,
  importItems,
} from './import.controller';

const allowedExtensions = new Set(['.xlsx', '.csv']);
const allowedMimeTypes = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'application/csv',
]);

const upload = multer({
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (_req: any, file: any, cb: FileFilterCallback) => {
    const extension = path.extname(file.originalname || '').toLowerCase();
    const byExtension = allowedExtensions.has(extension);
    const byMimeType = allowedMimeTypes.has((file.mimetype || '').toLowerCase());
    if (byExtension || byMimeType) {
      cb(null, true);
      return;
    }
    cb(new Error('Only .xlsx and .csv files are supported'));
  },
});

const router = Router();

router.use(requireAuth);

router.post(
  '/customers',
  requirePerm('customers.create'),
  upload.single('file'),
  importCustomers
);
router.post(
  '/suppliers',
  requirePerm('suppliers.create'),
  upload.single('file'),
  importSuppliers
);
router.post(
  '/items',
  requirePerm('items.create'),
  upload.single('file'),
  importItems
);

export default router;
