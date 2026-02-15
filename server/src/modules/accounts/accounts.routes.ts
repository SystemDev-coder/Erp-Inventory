import { Router } from 'express';
import { requireAuth } from '../../middlewares/requireAuth';
import { createAccount, deleteAccount, listAccounts, updateAccount } from './accounts.controller';

const router = Router();

router.use(requireAuth);

router.get('/', listAccounts);
router.post('/', createAccount);
router.put('/:id', updateAccount);
router.delete('/:id', deleteAccount);

export default router;
