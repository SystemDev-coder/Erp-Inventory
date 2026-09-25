import { Router } from 'express';
import { requireAuth } from '../../middlewares/requireAuth';
import { requireAnyPerm, requirePerm, requireRoleName } from '../../middlewares/requirePerm';
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
  getOpeningBalanceCleanupInfo,
  transferOpeningBalanceEquityCleanup,
  getAssetOverview,
  prepareAssetAccounts,
  reconcileCustomerBalances,
  listSettingsClosingPeriods,
  createSettingsClosingPeriod,
  updateSettingsClosingPeriod,
  getSettingsClosingSummary,
  closeSettingsClosingPeriod,
  listSettingsProfitOwners,
  upsertSettingsProfitOwner,
  previewSettingsOwnerProfit,
  getBusinessProfile,
  updateBusinessProfile,
} from './settings.controller';

const router = Router();
router.use(requireAuth);

// Company info permissions (compatible with generated and special keys)
router.get('/company', requireAnyPerm(['company.view', 'system.company.manage', 'system.settings']), getCompanyInfo);
router.put('/company', requireAnyPerm(['company.update', 'company.create', 'system.company.manage', 'system.settings']), updateCompanyInfo);
router.delete('/company', requireAnyPerm(['company.delete', 'system.company.manage', 'system.settings']), deleteCompanyInfo);

// Business Profile (Part 5/12): read is any authenticated user - every role's
// UI needs these flags to render correctly, not just admins - so GET stays
// open. Write is restricted to the Developer role specifically (same
// requireRoleName pattern already used for /trash) - choosing/changing a
// client's business type is a one-time deployment-setup decision with a
// wholesale-reset side effect on product config, not a day-to-day admin
// task, so it's deliberately tighter than the plain company.update gate.
router.get('/business-profile', getBusinessProfile);
router.put(
  '/business-profile',
  requireRoleName('developer'),
  requireAnyPerm(['company.update', 'system.company.manage', 'system.settings']),
  updateBusinessProfile
);
router.get('/assets/overview', requireAnyPerm(['system.settings', 'accounts.view', 'finance.reports']), getAssetOverview);
router.post('/assets/prepare', requireAnyPerm(['system.settings', 'accounts.view']), prepareAssetAccounts);
router.post('/customers/reconcile-balances', requireAnyPerm(['system.settings', 'customers.update', 'customers.view']), reconcileCustomerBalances);

// Branches
router.get('/branches', requirePerm('system.branches'), listBranches);
router.post('/branches', requirePerm('system.branches'), createBranch);
router.put('/branches/:id', requirePerm('system.branches'), updateBranch);
router.delete('/branches/:id', requirePerm('system.branches'), deleteBranch);

// Audit History permissions (table CRUD + special audit key)
router.get('/audit', requireAnyPerm(['audit_logs.view', 'system.audit.view', 'system.settings']), listAudit);

// Capital (Owner Equity)
// Phase 10 RBAC audit fix: writes here were gated by 'accounts.view'
// (a read permission held by Viewer/Accountant), letting either create,
// edit, or delete capital contributions/owner drawings/closing periods via
// direct API call despite holding none of the dedicated permission-catalog
// keys below (granted only to Administrator/Developer). Reads keep the
// broader read-permission fallback; writes now require the matching
// capital_contributions.*/owner_drawings.*/finance_closing_periods.* key.
router.get('/capital', requireAnyPerm(['system.settings', 'capital_contributions.view', 'accounts.view', 'finance.reports']), listCapitalContributions);
router.post('/capital', requireAnyPerm(['system.settings', 'capital_contributions.create']), createCapitalContribution);
router.put('/capital/:id', requireAnyPerm(['system.settings', 'capital_contributions.update']), updateCapitalContribution);
router.delete('/capital/:id', requireAnyPerm(['system.settings', 'capital_contributions.delete']), deleteCapitalContribution);
router.get('/capital/report', requireAnyPerm(['system.settings', 'capital_contributions.view', 'accounts.view', 'finance.reports']), getCapitalReport);
router.get('/capital/owners', requireAnyPerm(['system.settings', 'capital_contributions.view', 'accounts.view', 'finance.reports']), listCapitalOwnerEquity);
router.get('/capital/drawings', requireAnyPerm(['system.settings', 'owner_drawings.view', 'accounts.view', 'finance.reports']), listOwnerDrawings);
router.post('/capital/drawings', requireAnyPerm(['system.settings', 'owner_drawings.create']), createOwnerDrawing);
router.put('/capital/drawings/:id', requireAnyPerm(['system.settings', 'owner_drawings.update']), updateOwnerDrawing);
router.delete('/capital/drawings/:id', requireAnyPerm(['system.settings', 'owner_drawings.delete']), deleteOwnerDrawing);

// Accounting cleanup: Opening Balance Equity reclassification (destructive
// accounting-structure change - kept admin-only via system.settings, not
// widened to any dedicated key since none exists for this specific action).
router.get('/account-cleanup/opening-balance-equity', requireAnyPerm(['system.settings', 'accounts.view', 'finance.reports']), getOpeningBalanceCleanupInfo);
router.post('/account-cleanup/opening-balance-equity/transfer', requireAnyPerm(['system.settings']), transferOpeningBalanceEquityCleanup);

// Settings > Closing Finance + Profit Sharing
router.get('/closing/periods', requireAnyPerm(['system.settings', 'finance_closing_periods.view', 'finance.reports', 'accounts.view']), listSettingsClosingPeriods);
router.post('/closing/periods', requireAnyPerm(['system.settings', 'finance_closing_periods.create']), createSettingsClosingPeriod);
router.put('/closing/periods/:id', requireAnyPerm(['system.settings', 'finance_closing_periods.update']), updateSettingsClosingPeriod);
router.get('/closing/periods/:id/summary', requireAnyPerm(['system.settings', 'finance_closing_periods.view', 'finance.reports', 'accounts.view']), getSettingsClosingSummary);
router.post('/closing/periods/:id/close', requireAnyPerm(['system.settings', 'finance_closing_periods.update']), closeSettingsClosingPeriod);
router.get('/closing/profit/owners', requireAnyPerm(['system.settings', 'finance_closing_periods.view', 'finance.reports', 'accounts.view']), listSettingsProfitOwners);
router.post('/closing/profit/owners', requireAnyPerm(['system.settings', 'finance_closing_periods.update']), upsertSettingsProfitOwner);
router.post('/closing/profit/preview', requireAnyPerm(['system.settings', 'finance_closing_periods.view', 'finance.reports', 'accounts.view']), previewSettingsOwnerProfit);

export default router;
