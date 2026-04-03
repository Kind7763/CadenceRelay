import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import {
  listContacts,
  getContact,
  createContact,
  updateContact,
  deleteContact,
  bulkDeleteContacts,
  bulkUpdateContacts,
  bulkSuppressContacts,
  bulkDeleteFiltered,
  importContacts,
  importContactsCSV,
  previewCSV,
  exportContacts,
  getContactFilters,
  getFilteredContactCount,
  deleteSuppressedContacts,
  listBouncedEmails,
  verifyEmails,
  verifyListEmails,
  startHealthCheck,
  getHealthCheckProgress,
  getHealthStats,
} from '../controllers/contacts.controller';
import { validateBody } from '../middleware/validateRequest';
import { z } from 'zod';

const router = Router();

// Use disk storage for large CSV files (up to 150MB) to avoid RAM pressure
const uploadDir = path.join('/tmp', 'cadencerelay-uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage: diskStorage, limits: { fileSize: 150 * 1024 * 1024 } });

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  state: z.string().nullable().optional(),
  district: z.string().nullable().optional(),
  block: z.string().nullable().optional(),
  classes: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  management: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
  listIds: z.array(z.string().uuid()).optional(),
});

const updateSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
  status: z.enum(['active', 'bounced', 'complained', 'unsubscribed']).optional(),
  state: z.string().nullable().optional(),
  district: z.string().nullable().optional(),
  block: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  management: z.string().nullable().optional(),
  classes: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
});

router.get('/', listContacts);
router.get('/bounced', listBouncedEmails);
router.get('/export', exportContacts);
router.get('/filters', getContactFilters);
router.post('/count-filtered', getFilteredContactCount);
router.post('/health-check', startHealthCheck);
router.get('/health-check', getHealthCheckProgress);
router.get('/health-stats', getHealthStats);
router.post('/bulk-suppress', bulkSuppressContacts);
router.delete('/bulk-delete-filtered', bulkDeleteFiltered);
router.get('/:id', getContact);
router.post('/', validateBody(createSchema), createContact);
router.put('/:id', validateBody(updateSchema), updateContact);
router.put('/bulk-update', bulkUpdateContacts);
router.delete('/bulk', bulkDeleteContacts);
router.delete('/suppressed', deleteSuppressedContacts);
router.delete('/:id', deleteContact);
router.post('/import', upload.single('file'), importContacts);
router.post('/import-csv', upload.single('file'), importContactsCSV);
router.post('/preview-csv', upload.single('file'), previewCSV);
router.post('/verify-emails', verifyEmails);
router.post('/verify-list/:listId', verifyListEmails);

export default router;
