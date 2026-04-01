import { Router } from 'express';
import {
  listSuppressed,
  addToSuppression,
  bulkAddToSuppression,
  removeFromSuppression,
  getSuppressionCount,
} from '../controllers/suppression.controller';
import { validateBody } from '../middleware/validateRequest';
import { z } from 'zod';

const router = Router();

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

export default router;
