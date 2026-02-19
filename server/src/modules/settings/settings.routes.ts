import { Router } from 'express';
import { requireAuth } from '../../middlewares/requireAuth';
import { requireAnyPerm, requirePerm } from '../../middlewares/requirePerm';
import {
  getCompanyInfo,
  updateCompanyInfo,
  deleteCompanyInfo,
  listBranches,
  createBranch,
  updateBranch,
  deleteBranch,
  listAudit,
} from './settings.controller';

const router = Router();
router.use(requireAuth);

// Company info permissions (compatible with generated and special keys)
router.get('/company', requireAnyPerm(['company.view', 'system.company.manage', 'system.settings']), getCompanyInfo);
router.put('/company', requireAnyPerm(['company.update', 'company.create', 'system.company.manage', 'system.settings']), updateCompanyInfo);
router.delete('/company', requireAnyPerm(['company.delete', 'system.company.manage', 'system.settings']), deleteCompanyInfo);

// Branches
router.get('/branches', requirePerm('system.branches'), listBranches);
router.post('/branches', requirePerm('system.branches'), createBranch);
router.put('/branches/:id', requirePerm('system.branches'), updateBranch);
router.delete('/branches/:id', requirePerm('system.branches'), deleteBranch);

// Audit History permissions (table CRUD + special audit key)
router.get('/audit', requireAnyPerm(['audit_logs.view', 'system.audit.view', 'system.settings']), listAudit);

export default router;
