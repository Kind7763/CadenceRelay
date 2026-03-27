import { Router } from 'express';
import { getDashboard, getCampaignAnalytics, getRecipientEvents, getContactAnalytics, exportAnalytics } from '../controllers/analytics.controller';

const router = Router();

router.get('/dashboard', getDashboard);
router.get('/campaigns/:id', getCampaignAnalytics);
router.get('/recipients/:recipientId/events', getRecipientEvents);
router.get('/contacts/:contactId', getContactAnalytics);
router.get('/export', exportAnalytics);

export default router;
