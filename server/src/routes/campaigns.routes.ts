import { Router } from 'express';
import multer from 'multer';
import {
  listCampaigns, getCampaign, createCampaign, updateCampaign, deleteCampaign,
  bulkDeleteCampaigns, scheduleCampaign, sendCampaign, pauseCampaign, resumeCampaign,
  getCampaignRecipients, exportCampaignRecipients, estimateSendCount,
  addAttachments, removeAttachment, downloadAttachment,
  duplicateCampaign, toggleStar, toggleArchive, updateLabel,
  updateDynamicVariables, previewDynamicVariables, resendToNonOpeners,
  createCampaignFromEmails, resendTransientBounced, suppressPermanentBounces,
} from '../controllers/campaigns.controller';
import { validateBody } from '../middleware/validateRequest';
import { z } from 'zod';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB per file
  fileFilter: (_req, file, cb) => {
    // Block executable files
    const blocked = ['.exe', '.bat', '.cmd', '.sh', '.ps1', '.msi'];
    const ext = file.originalname.toLowerCase().split('.').pop();
    if (ext && blocked.includes(`.${ext}`)) {
      cb(new Error(`File type .${ext} is not allowed`));
      return;
    }
    cb(null, true);
  },
});

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  templateId: z.string().uuid().optional(),
  listId: z.string().uuid().optional(),
  provider: z.enum(['gmail', 'ses']).optional(),
  throttlePerSecond: z.number().min(1).max(100).optional(),
  throttlePerHour: z.number().min(1).max(100000).optional(),
  description: z.string().optional(),
  abTest: z.any().optional(),
  subjectOverride: z.string().max(998).nullable().optional(),
  replyTo: z.union([z.string().email(), z.literal(''), z.null()]).optional(),
  emailAccountId: z.union([z.string().uuid(), z.literal(''), z.null()]).optional(),
});

const scheduleSchema = z.object({
  scheduledAt: z.string().datetime(),
});

router.get('/', listCampaigns);
router.post('/from-emails', createCampaignFromEmails);
router.get('/estimate-send-count', estimateSendCount);
router.get('/:id', getCampaign);
// Create campaign with optional attachments (multipart form)
router.post('/', upload.array('attachments', 10), (req, _res, next) => {
  // Parse JSON fields from multipart form
  if (typeof req.body.throttlePerSecond === 'string') req.body.throttlePerSecond = parseInt(req.body.throttlePerSecond) || 5;
  if (typeof req.body.throttlePerHour === 'string') req.body.throttlePerHour = parseInt(req.body.throttlePerHour) || 5000;
  next();
}, createCampaign);
router.put('/:id', validateBody(updateSchema), updateCampaign);
router.delete('/bulk', bulkDeleteCampaigns);
router.delete('/:id', deleteCampaign);
router.post('/:id/schedule', validateBody(scheduleSchema), scheduleCampaign);
router.post('/:id/send', sendCampaign);
router.post('/:id/pause', pauseCampaign);
router.post('/:id/resume', resumeCampaign);
router.get('/:id/recipients', getCampaignRecipients);
router.get('/:id/recipients/export', exportCampaignRecipients);
// Campaign management actions
router.post('/:id/duplicate', duplicateCampaign);
router.post('/:id/resend-non-openers', resendToNonOpeners);
router.post('/:id/resend-transient-bounced', resendTransientBounced);
router.post('/:id/suppress-permanent-bounces', suppressPermanentBounces);
router.put('/:id/star', toggleStar);
router.put('/:id/archive', toggleArchive);
router.put('/:id/label', updateLabel);
// Dynamic variables
router.put('/:id/dynamic-variables', updateDynamicVariables);
router.post('/:id/dynamic-variables/preview', previewDynamicVariables);
// Attachment management
router.post('/:id/attachments', upload.array('attachments', 10), addAttachments);
router.delete('/:id/attachments/:index', removeAttachment);
// Download / preview attachments
router.get('/:id/attachments/:index', downloadAttachment);
router.get('/:id/attachments/:index/preview', downloadAttachment);

export default router;
