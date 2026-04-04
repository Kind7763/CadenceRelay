import { Router } from 'express';
import {
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  toggleArchiveTemplate,
  getTemplateVersions,
  getTemplateVersion,
  restoreVersion,
  updateVersionLabel,
  previewTemplate,
  spamCheck,
} from '../controllers/templates.controller';
import { validateBody } from '../middleware/validateRequest';
import { z } from 'zod';

const router = Router();

const createSchema = z.object({
  name: z.string().min(1).max(255),
  subject: z.string().min(1).max(998),
  htmlBody: z.string().min(1),
  textBody: z.string().optional(),
  projectId: z.string().uuid().optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  subject: z.string().min(1).max(998).optional(),
  htmlBody: z.string().min(1).optional(),
  textBody: z.string().optional(),
});

// Spam check routes — ad-hoc must come before :id to avoid conflict
router.post('/spam-check', spamCheck);

router.get('/', listTemplates);
router.get('/:id', getTemplate);
router.post('/', validateBody(createSchema), createTemplate);
router.put('/:id', validateBody(updateSchema), updateTemplate);
router.put('/:id/archive', toggleArchiveTemplate);
router.delete('/:id', deleteTemplate);
router.get('/:id/versions', getTemplateVersions);
router.get('/:id/versions/:version', getTemplateVersion);
router.post('/:id/versions/:version/restore', restoreVersion);
router.put('/:id/versions/:version/label', updateVersionLabel);
router.post('/:id/preview', previewTemplate);
router.post('/:id/spam-check', spamCheck);

export default router;
