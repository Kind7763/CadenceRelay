import { Router } from 'express';
import { trackOpen, trackClick, unsubscribeGet, unsubscribePost } from '../controllers/tracking.controller';

const router = Router();

router.get('/o/:token', trackOpen);
router.get('/c/:token/:linkIndex', trackClick);
router.get('/u/:token', unsubscribeGet);
router.post('/u/:token', unsubscribePost);

export default router;
