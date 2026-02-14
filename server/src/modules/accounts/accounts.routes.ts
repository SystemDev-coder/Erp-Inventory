import { Router } from 'express';
import { requireAuth } from '../../middlewares/requireAuth';
import { loadUserBranches } from '../../middleware/branchAccess.middleware';
import { listAccounts, createAccount, updateAccount, deleteAccount } from './accounts.controller';

const router = Router();

// Apply authentication and branch context
router.use(requireAuth);
router.use(loadUserBranches); // ← This sets database context automatically!

router.get('/', listAccounts);
router.post('/', createAccount);
router.put('/:id', updateAccount);
router.delete('/:id', deleteAccount);

export default router;
