import { Router } from 'express';
import { listLabels, createLabel, deleteLabel } from '../controllers/campaigns.controller';

const router = Router();

router.get('/', listLabels);
router.post('/', createLabel);
router.delete('/:id', deleteLabel);

export default router;
