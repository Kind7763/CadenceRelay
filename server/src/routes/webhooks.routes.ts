import { Router } from 'express';
import express from 'express';
import { handleSnsWebhook } from '../controllers/webhooks.controller';

const router = Router();

// SNS sends JSON with text/plain content type
router.use(express.text({ type: 'text/plain' }));
router.post('/sns', (req, res, next) => {
  // Parse text body as JSON if needed
  if (typeof req.body === 'string') {
    try { req.body = JSON.parse(req.body); } catch { /* leave as is */ }
  }
  next();
}, handleSnsWebhook);

export default router;
