import { Router } from 'express';
import {
  listSuppressed,
  addToSuppression,
  bulkAddToSuppression,
  removeFromSuppression,
  getSuppressionCount,
  listSuppressedDomains,
  addSuppressedDomain,
  bulkAddSuppressedDomains,
  removeSuppressedDomain,
  getSuppressedDomainCount,
} from '../controllers/suppression.controller';
import { validateBody } from '../middleware/validateRequest';
import { z } from 'zod';

const router = Router();

// ─── Email suppression ──────────────────────────────────────────────

const addSchema = z.object({
  email: z.string().email(),
  reason: z.string().optional(),
});

const bulkAddSchema = z.object({
  emails: z.array(z.string()).min(1).max(10000),
  reason: z.string().optional(),
});

router.get('/', listSuppressed);
router.get('/count', getSuppressionCount);
router.post('/', validateBody(addSchema), addToSuppression);
router.post('/bulk', validateBody(bulkAddSchema), bulkAddToSuppression);
router.delete('/:id', removeFromSuppression);

// ─── Domain suppression ─────────────────────────────────────────────

const addDomainSchema = z.object({
  domain: z.string().min(1).max(255),
  reason: z.string().optional(),
});

const bulkAddDomainSchema = z.object({
  domains: z.array(z.string()).min(1).max(1000),
  reason: z.string().optional(),
});

router.get('/domains', listSuppressedDomains);
router.get('/domains/count', getSuppressedDomainCount);
router.post('/domains', validateBody(addDomainSchema), addSuppressedDomain);
router.post('/domains/bulk', validateBody(bulkAddDomainSchema), bulkAddSuppressedDomains);
router.delete('/domains/:id', removeSuppressedDomain);

export default router;
