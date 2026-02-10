import { Router } from 'express';
import { requireAuth } from '../../middlewares/requireAuth';
import { requirePerm } from '../../middlewares/requirePerm';
import {
  getCompanyInfo,
  updateCompanyInfo,
  listBranches,
  createBranch,
  updateBranch,
  deleteBranch,
  listAudit,
} from './settings.controller';

const router = Router();
router.use(requireAuth);

// Company info uses existing system permissions
router.get('/company', requirePerm('system.view'), getCompanyInfo);
router.put('/company', requirePerm('system.update'), updateCompanyInfo);

// Branches
router.get('/branches', requirePerm('system.branches'), listBranches);
router.post('/branches', requirePerm('system.branches'), createBranch);
router.put('/branches/:id', requirePerm('system.branches'), updateBranch);
router.delete('/branches/:id', requirePerm('system.branches'), deleteBranch);

// Audit History
router.get('/audit', requirePerm('system.audit'), listAudit);

export default router;
