import { Router } from 'express';
import {
  listEmailAccounts,
  getEmailAccount,
  createEmailAccount,
  updateEmailAccount,
  deleteEmailAccount,
  testEmailAccount,
} from '../controllers/emailAccounts.controller';

const router = Router();

router.get('/', listEmailAccounts);
router.get('/:id', getEmailAccount);
router.post('/', createEmailAccount);
router.put('/:id', updateEmailAccount);
router.delete('/:id', deleteEmailAccount);
router.post('/:id/test', testEmailAccount);

export default router;
