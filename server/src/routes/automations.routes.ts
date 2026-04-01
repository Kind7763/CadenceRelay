import { Router } from 'express';
import {
  listAutomations, getAutomation, createAutomation, updateAutomation,
  deleteAutomation, activateAutomation, pauseAutomation,
  enrollContacts, getEnrollments,
} from '../controllers/automations.controller';
import { validateBody } from '../middleware/validateRequest';
import { z } from 'zod';

const router = Router();

const stepSchema = z.object({
  templateId: z.string().uuid().optional().nullable(),
  subjectOverride: z.string().max(998).optional().nullable(),
  delayDays: z.number().int().min(0).max(365).optional(),
  delayHours: z.number().int().min(0).max(23).optional(),
  delayMinutes: z.number().int().min(0).max(59).optional(),
});

const createSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional().nullable(),
  triggerType: z.enum(['manual', 'contact_added', 'list_joined', 'email_opened', 'email_clicked', 'tag_added']),
  triggerConfig: z.record(z.unknown()).optional(),
  provider: z.enum(['gmail', 'ses']).optional(),
  projectId: z.string().uuid().optional().nullable(),
  steps: z.array(stepSchema).optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional().nullable(),
  triggerType: z.enum(['manual', 'contact_added', 'list_joined', 'email_opened', 'email_clicked', 'tag_added']).optional(),
  triggerConfig: z.record(z.unknown()).optional(),
  provider: z.enum(['gmail', 'ses']).optional(),
  projectId: z.string().uuid().optional().nullable(),
  steps: z.array(stepSchema).optional(),
});

const enrollSchema = z.object({
  contactIds: z.array(z.string().uuid()).optional(),
  listId: z.string().uuid().optional(),
});

router.get('/', listAutomations);
router.post('/', validateBody(createSchema), createAutomation);
router.get('/:id', getAutomation);
router.put('/:id', validateBody(updateSchema), updateAutomation);
router.delete('/:id', deleteAutomation);
router.post('/:id/activate', activateAutomation);
router.post('/:id/pause', pauseAutomation);
router.post('/:id/enroll', validateBody(enrollSchema), enrollContacts);
router.get('/:id/enrollments', getEnrollments);

export default router;
