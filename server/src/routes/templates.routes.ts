import { Router } from 'express';
import {
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getTemplateVersions,
  getTemplateVersion,
  restoreVersion,
  updateVersionLabel,
  previewTemplate,
} from '../controllers/templates.controller';
import { validateBody } from '../middleware/validateRequest';
import { z } from 'zod';

const router = Router();

const createSchema = z.object({
  name: z.string().min(1).max(255),
  subject: z.string().min(1).max(998),
  htmlBody: z.string().min(1),
  textBody: z.string().optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  subject: z.string().min(1).max(998).optional(),
  htmlBody: z.string().min(1).optional(),
  textBody: z.string().optional(),
});

router.get('/', listTemplates);
router.get('/:id', getTemplate);
router.post('/', validateBody(createSchema), createTemplate);
router.put('/:id', validateBody(updateSchema), updateTemplate);
router.delete('/:id', deleteTemplate);
router.get('/:id/versions', getTemplateVersions);
router.get('/:id/versions/:version', getTemplateVersion);
router.post('/:id/versions/:version/restore', restoreVersion);
router.put('/:id/versions/:version/label', updateVersionLabel);
router.post('/:id/preview', previewTemplate);

export default router;
