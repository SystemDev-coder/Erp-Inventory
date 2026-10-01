import { Router } from 'express';
import { requireAuth } from '../../middlewares/requireAuth';
import { requirePerm } from '../../middlewares/requirePerm';
import { createAccount, deleteAccount, listAccounts, updateAccount } from './accounts.controller';

const router = Router();

router.use(requireAuth);

router.get('/', requirePerm('accounts.view'), listAccounts);
router.post('/', requirePerm('accounts.create'), createAccount);
router.put('/:id', requirePerm('accounts.update'), updateAccount);
router.delete('/:id', requirePerm('accounts.delete'), deleteAccount);

export default router;
