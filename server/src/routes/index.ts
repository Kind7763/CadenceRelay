import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import authRoutes from './auth.routes';
import settingsRoutes from './settings.routes';

const router = Router();

// Health check
router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Auth (public)
router.use('/auth', authRoutes);

// Protected routes
router.use('/settings', authenticate, settingsRoutes);

// TODO: Mount remaining route modules in upcoming sprints
// router.use('/contacts', authenticate, contactRoutes);
// router.use('/lists', authenticate, listRoutes);
// router.use('/campaigns', authenticate, campaignRoutes);
// router.use('/templates', authenticate, templateRoutes);
// router.use('/analytics', authenticate, analyticsRoutes);
// router.use('/t', trackingRoutes);       // public
// router.use('/webhooks', webhookRoutes); // public

export default router;
