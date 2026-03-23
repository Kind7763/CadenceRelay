import { Router } from 'express';
import { clearHistory } from '../controllers/admin.controller';

const router = Router();

router.post('/clear-history', clearHistory);

export default router;
