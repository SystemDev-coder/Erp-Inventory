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
  listCapitalContributions,
  createCapitalContribution,
  updateCapitalContribution,
  deleteCapitalContribution,
  getCapitalReport,
  listCapitalOwnerEquity,
  listOwnerDrawings,
  createOwnerDrawing,
  updateOwnerDrawing,
  deleteOwnerDrawing,
  getAssetOverview,
  prepareAssetAccounts,
  listSettingsClosingPeriods,
  createSettingsClosingPeriod,
  updateSettingsClosingPeriod,
  getSettingsClosingSummary,
  closeSettingsClosingPeriod,
  listSettingsProfitOwners,
  upsertSettingsProfitOwner,
  previewSettingsOwnerProfit,
} from './settings.controller';

const router = Router();
router.use(requireAuth);

// Company info permissions (compatible with generated and special keys)
router.get('/company', requireAnyPerm(['company.view', 'system.company.manage', 'system.settings']), getCompanyInfo);
router.put('/company', requireAnyPerm(['company.update', 'company.create', 'system.company.manage', 'system.settings']), updateCompanyInfo);
router.delete('/company', requireAnyPerm(['company.delete', 'system.company.manage', 'system.settings']), deleteCompanyInfo);
router.get('/assets/overview', requireAnyPerm(['system.settings', 'accounts.view', 'finance.reports']), getAssetOverview);
router.post('/assets/prepare', requireAnyPerm(['system.settings', 'accounts.view']), prepareAssetAccounts);

// Branches
router.get('/branches', requirePerm('system.branches'), listBranches);
router.post('/branches', requirePerm('system.branches'), createBranch);
router.put('/branches/:id', requirePerm('system.branches'), updateBranch);
router.delete('/branches/:id', requirePerm('system.branches'), deleteBranch);

// Audit History permissions (table CRUD + special audit key)
router.get('/audit', requireAnyPerm(['audit_logs.view', 'system.audit.view', 'system.settings']), listAudit);

// Capital (Owner Equity)
router.get('/capital', requireAnyPerm(['system.settings', 'accounts.view', 'finance.reports']), listCapitalContributions);
router.post('/capital', requireAnyPerm(['system.settings', 'accounts.view']), createCapitalContribution);
router.put('/capital/:id', requireAnyPerm(['system.settings', 'accounts.view']), updateCapitalContribution);
router.delete('/capital/:id', requireAnyPerm(['system.settings', 'accounts.view']), deleteCapitalContribution);
router.get('/capital/report', requireAnyPerm(['system.settings', 'accounts.view', 'finance.reports']), getCapitalReport);
router.get('/capital/owners', requireAnyPerm(['system.settings', 'accounts.view', 'finance.reports']), listCapitalOwnerEquity);
router.get('/capital/drawings', requireAnyPerm(['system.settings', 'accounts.view', 'finance.reports']), listOwnerDrawings);
router.post('/capital/drawings', requireAnyPerm(['system.settings', 'accounts.view']), createOwnerDrawing);
router.put('/capital/drawings/:id', requireAnyPerm(['system.settings', 'accounts.view']), updateOwnerDrawing);
router.delete('/capital/drawings/:id', requireAnyPerm(['system.settings', 'accounts.view']), deleteOwnerDrawing);

// Settings > Closing Finance + Profit Sharing
router.get('/closing/periods', requireAnyPerm(['system.settings', 'finance.reports', 'accounts.view']), listSettingsClosingPeriods);
router.post('/closing/periods', requireAnyPerm(['system.settings', 'finance.reports', 'accounts.view']), createSettingsClosingPeriod);
router.put('/closing/periods/:id', requireAnyPerm(['system.settings', 'finance.reports', 'accounts.view']), updateSettingsClosingPeriod);
router.get('/closing/periods/:id/summary', requireAnyPerm(['system.settings', 'finance.reports', 'accounts.view']), getSettingsClosingSummary);
router.post('/closing/periods/:id/close', requireAnyPerm(['system.settings', 'finance.reports', 'accounts.view']), closeSettingsClosingPeriod);
router.get('/closing/profit/owners', requireAnyPerm(['system.settings', 'finance.reports', 'accounts.view']), listSettingsProfitOwners);
router.post('/closing/profit/owners', requireAnyPerm(['system.settings', 'finance.reports', 'accounts.view']), upsertSettingsProfitOwner);
router.post('/closing/profit/preview', requireAnyPerm(['system.settings', 'finance.reports', 'accounts.view']), previewSettingsOwnerProfit);

export default router;
