import { useMemo, useState } from 'react';
import {
  CalendarCheck2,
  Clock3,
  Lock,
  PlayCircle,
  Plus,
  RefreshCw,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { PageHeader } from '../../components/ui/layout';
import { Modal } from '../../components/ui/modal/Modal';
import { useToast } from '../../components/ui/toast/Toast';
import { accountService, Account } from '../../services/account.service';
import {
  ClosingSnapshot,
  FinanceClosingPeriod,
  financeService,
  ProfitAllocation,
  ProfitShareRule,
} from '../../services/finance.service';

type WizardStep = 1 | 2 | 3;
type RuleMode = 'saved' | 'custom';

const today = () => new Date().toISOString().slice(0, 10);
const formatMoney = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value || 0));
const formatDateOnly = (value?: string | null) => {
  if (!value) return '-';
  const text = String(value).trim();
  if (!text) return '-';
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return text;
  return parsed.toISOString().slice(0, 10);
};
const toDateInput = (value?: string | null) => {
  const formatted = formatDateOnly(value);
  return formatted === '-' ? '' : formatted;
};
const toDateTimeLocalInput = (value?: string | null) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const pad = (num: number) => String(num).padStart(2, '0');
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(
    parsed.getMinutes()
  )}`;
};

const emptyRule = (): ProfitShareRule => ({
  ruleName: 'Default Distribution',
  sourceAccId: undefined,
  retainedPct: 0,
  retainedAccId: undefined,
  reinvestmentPct: 0,
  reinvestmentAccId: undefined,
  reservePct: 0,
  reserveAccId: undefined,
  partners: [{ partnerName: '', sharePct: 100, accId: undefined }],
  isDefault: false,
});

const ClosingFinance = () => {
  const { showToast } = useToast();

  const [loading, setLoading] = useState(false);
  const [displayed, setDisplayed] = useState(false);
  const [periods, setPeriods] = useState<FinanceClosingPeriod[]>([]);
  const [rules, setRules] = useState<ProfitShareRule[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    closeMode: 'monthly' as 'monthly' | 'quarterly' | 'yearly' | 'custom',
    periodFrom: today(),
    periodTo: today(),
    operationalFrom: '',
    operationalTo: '',
    scheduledAt: '',
    note: '',
  });
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<FinanceClosingPeriod | null>(null);
  const [editForm, setEditForm] = useState({
    closeMode: 'monthly' as 'monthly' | 'quarterly' | 'yearly' | 'custom',
    periodFrom: today(),
    periodTo: today(),
    operationalFrom: '',
    operationalTo: '',
    scheduledAt: '',
    note: '',
  });

  const [closeOpen, setCloseOpen] = useState(false);
  const [closeStep, setCloseStep] = useState<WizardStep>(1);
  const [closeTarget, setCloseTarget] = useState<FinanceClosingPeriod | null>(null);
  const [ruleMode, setRuleMode] = useState<RuleMode>('saved');
  const [selectedRuleId, setSelectedRuleId] = useState<number | undefined>(undefined);
  const [closeRule, setCloseRule] = useState<ProfitShareRule>(emptyRule());
  const [autoTransfer, setAutoTransfer] = useState(true);
  const [saveRuleAsDefault, setSaveRuleAsDefault] = useState(false);
  const [forceClose, setForceClose] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [previewData, setPreviewData] = useState<{
    summary: ClosingSnapshot;
    allocations: ProfitAllocation[];
    warnings: string[];
  } | null>(null);

  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryData, setSummaryData] = useState<{
    period: FinanceClosingPeriod;
    summary: ClosingSnapshot | null;
    profit?: {
      allocations?: ProfitAllocation[];
      warnings?: string[];
    };
  } | null>(null);
  const [reopenTarget, setReopenTarget] = useState<FinanceClosingPeriod | null>(null);
  const [reopenReason, setReopenReason] = useState('');

  const equityAccounts = useMemo(
    () =>
      accounts.filter(
        (account) =>
          (account.account_type || '').toLowerCase() === 'equity' && !account.name.toLowerCase().includes('company')
      ),
    [accounts]
  );

  const activeSnapshot = useMemo<ClosingSnapshot | null>(() => {
    if (previewData?.summary) return previewData.summary;
    const closed = periods.find((period) => period.status === 'closed');
    if (!closed?.summary_json) return null;
    return closed.summary_json as ClosingSnapshot;
  }, [periods, previewData]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [periodRes, rulesRes, accountsRes] = await Promise.all([
        financeService.listClosingPeriods(),
        financeService.listProfitShareRules(),
        accountService.list(),
      ]);
      if (periodRes.success && periodRes.data?.periods) setPeriods(periodRes.data.periods);
      if (rulesRes.success && rulesRes.data?.rules) setRules(rulesRes.data.rules);
      if (accountsRes.success && accountsRes.data?.accounts) setAccounts(accountsRes.data.accounts);
      setDisplayed(true);
    } finally {
      setLoading(false);
    }
  };

  const resetCloseWizard = () => {
    setCloseStep(1);
    setCloseTarget(null);
    setRuleMode('saved');
    setSelectedRuleId(undefined);
    setCloseRule(emptyRule());
    setAutoTransfer(true);
    setSaveRuleAsDefault(false);
    setForceClose(false);
    setConfirmClose(false);
    setPreviewData(null);
  };

  const createPeriod = async () => {
    if (!createForm.periodFrom || !createForm.periodTo) {
      showToast({ type: 'error', title: 'Period dates are required' });
      return;
    }
    const payload = {
      closeMode: createForm.closeMode,
      periodFrom: createForm.periodFrom,
      periodTo: createForm.periodTo,
      operationalFrom: createForm.operationalFrom || undefined,
      operationalTo: createForm.operationalTo || undefined,
      scheduledAt: createForm.scheduledAt ? new Date(createForm.scheduledAt).toISOString() : undefined,
      note: createForm.note || undefined,
    };
    const res = await financeService.createClosingPeriod(payload);
    if (res.success) {
      showToast({ type: 'success', title: 'Closing period created' });
      setCreateOpen(false);
      await loadData();
    } else {
      showToast({ type: 'error', title: res.message || 'Failed to create period' });
    }
  };

  const openEditPeriod = (period: FinanceClosingPeriod) => {
    setEditTarget(period);
    setEditForm({
      closeMode: period.close_mode,
      periodFrom: toDateInput(period.period_from) || today(),
      periodTo: toDateInput(period.period_to) || today(),
      operationalFrom: toDateInput(period.operational_from),
      operationalTo: toDateInput(period.operational_to),
      scheduledAt: toDateTimeLocalInput(period.scheduled_at),
      note: period.note || '',
    });
    setEditOpen(true);
  };

  const updatePeriod = async () => {
    if (!editTarget) return;
    if (!editForm.periodFrom || !editForm.periodTo) {
      showToast({ type: 'error', title: 'Period dates are required' });
      return;
    }
    const payload = {
      closeMode: editForm.closeMode,
      periodFrom: editForm.periodFrom,
      periodTo: editForm.periodTo,
      operationalFrom: editForm.operationalFrom || '',
      operationalTo: editForm.operationalTo || '',
      scheduledAt: editForm.scheduledAt ? new Date(editForm.scheduledAt).toISOString() : '',
      note: editForm.note || '',
    };
    const res = await financeService.updateClosingPeriod(editTarget.closing_id, payload);
    if (res.success) {
      const updatedPeriod = res.data?.period || editTarget;
      setEditOpen(false);
      setEditTarget(null);

      const previewRes = await financeService.previewClosingPeriod(updatedPeriod.closing_id, {
        autoTransfer: false,
        force: false,
        saveRuleAsDefault: false,
      });
      if (previewRes.success && previewRes.data?.preview) {
        setSummaryData({
          period: previewRes.data.preview.period,
          summary: previewRes.data.preview.summary,
          profit: {
            allocations: previewRes.data.preview.allocations,
            warnings: previewRes.data.preview.warnings,
          },
        });
        setSummaryOpen(true);
      }

      showToast({ type: 'success', title: 'Closing period updated and preview refreshed' });
      await loadData();
      return;
    }
    showToast({ type: 'error', title: res.message || 'Failed to update period' });
  };

  const openCloseWizard = (period: FinanceClosingPeriod) => {
    setCloseOpen(true);
    setCloseTarget(period);
    setCloseStep(1);
    setPreviewData(null);
    setConfirmClose(false);

    const defaultRule = rules.find((rule) => rule.isDefault) || rules[0];
    if (defaultRule?.ruleId) {
      setRuleMode('saved');
      setSelectedRuleId(defaultRule.ruleId || undefined);
    } else {
      setRuleMode('custom');
      setSelectedRuleId(undefined);
    }
  };

  const buildClosePayload = () => ({
    autoTransfer,
    saveRuleAsDefault,
    force: forceClose,
    ruleId: ruleMode === 'saved' ? selectedRuleId : undefined,
    rule: ruleMode === 'custom' ? closeRule : undefined,
  });

  const generatePreview = async () => {
    if (!closeTarget) return;
    const res = await financeService.previewClosingPeriod(closeTarget.closing_id, buildClosePayload());
    if (!res.success || !res.data?.preview) {
      showToast({ type: 'error', title: res.message || 'Failed to preview closing' });
      return;
    }
    setPreviewData({
      summary: res.data.preview.summary,
      allocations: res.data.preview.allocations,
      warnings: res.data.preview.warnings,
    });
    setCloseStep(2);
  };

  const closePeriod = async () => {
    if (!closeTarget) return;
    if (!confirmClose) {
      showToast({ type: 'warning', title: 'Please confirm before closing this period' });
      return;
    }
    const res = await financeService.closeClosingPeriod(closeTarget.closing_id, buildClosePayload());
    if (!res.success) {
      showToast({ type: 'error', title: res.message || 'Failed to close period' });
      return;
    }
    showToast({ type: 'success', title: 'Finance period closed successfully' });
    setCloseOpen(false);
    resetCloseWizard();
    await loadData();
  };

  const reopenPeriod = async () => {
    if (!reopenTarget) return;
    const res = await financeService.reopenClosingPeriod(reopenTarget.closing_id, { reason: reopenReason });
    if (res.success) {
      showToast({ type: 'success', title: 'Period reopened' });
      setReopenTarget(null);
      setReopenReason('');
      await loadData();
      return;
    }
    showToast({ type: 'error', title: res.message || 'Failed to reopen period' });
  };

  const openSummary = async (period: FinanceClosingPeriod) => {
    const res = await financeService.getClosingSummary(period.closing_id);
    if (!res.success || !res.data?.summary) {
      showToast({ type: 'error', title: res.message || 'Failed to load summary' });
      return;
    }
    setSummaryData(res.data.summary);
    setSummaryOpen(true);
  };

  const runScheduled = async () => {
    const res = await financeService.runScheduledClosings();
    if (res.success) {
      const done = res.data?.result?.closed ?? 0;
      showToast({ type: 'success', title: `Scheduled closing completed (${done} period${done === 1 ? '' : 's'})` });
      await loadData();
      return;
    }
    showToast({ type: 'error', title: res.message || 'Failed to run scheduled closing' });
  };

  const updatePartner = (index: number, patch: Partial<{ partnerName: string; sharePct: number; accId: number | null }>) => {
    setCloseRule((prev) => ({
      ...prev,
      partners: prev.partners.map((partner, i) => (i === index ? { ...partner, ...patch } : partner)),
    }));
  };

  const addPartner = () => {
    setCloseRule((prev) => ({
      ...prev,
      partners: [...prev.partners, { partnerName: '', sharePct: 0, accId: undefined }],
    }));
  };

  const removePartner = (index: number) => {
    setCloseRule((prev) => ({
      ...prev,
      partners: prev.partners.filter((_, i) => i !== index),
    }));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Finance Closing & Profit Sharing"
        description="Define closing periods, lock transactions, calculate net income, and post automatic profit distribution."
        actions={
          <>
            <button
              type="button"
              onClick={() => void loadData()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-[#9bc0e6] bg-white px-4 py-2.5 text-sm font-semibold text-[#0c3556] hover:bg-[#f0f7ff]"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Loading...' : 'Display'}
            </button>
            <button
              type="button"
              onClick={runScheduled}
              className="inline-flex items-center gap-2 rounded-xl border border-[#2b6e8c] bg-[#0f4f74] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0b4567]"
            >
              <PlayCircle className="h-4 w-4" />
              Run Scheduled
            </button>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-[#2e7e4f] bg-[#1f8f4d] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#16723d]"
            >
              <Plus className="h-4 w-4" />
              New Closing Period
            </button>
          </>
        }
      />

      {activeSnapshot && (
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-[#a9d4c1] bg-[#f2fff8] p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#2b7e4d]">Net Income Impact</p>
              {activeSnapshot.netIncome >= 0 ? (
                <TrendingUp className="h-5 w-5 text-[#1f8f4d]" />
              ) : (
                <TrendingDown className="h-5 w-5 text-[#c53939]" />
              )}
            </div>
            <p className="mt-2 text-2xl font-bold text-[#103a22]">{formatMoney(activeSnapshot.netIncome)}</p>
            <p className="mt-1 text-sm text-[#3b6b52]">Revenue after COGS, expense charges, payroll, and other income.</p>
          </div>
          <div className="rounded-2xl border border-[#b7d2ea] bg-[#f3f9ff] p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#2e648f]">Inventory Valuation</p>
              <Wallet className="h-5 w-5 text-[#1a5f90]" />
            </div>
            <p className="mt-2 text-2xl font-bold text-[#14395a]">{formatMoney(activeSnapshot.stockValuation)}</p>
            <p className="mt-1 text-sm text-[#3c6282]">Current store/item valuation integrated into closing decisions.</p>
          </div>
          <div className="rounded-2xl border border-[#e7c3bb] bg-[#fff6f4] p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8a4335]">COGS</p>
              <CalendarCheck2 className="h-5 w-5 text-[#934637]" />
            </div>
            <p className="mt-2 text-2xl font-bold text-[#6b2f25]">{formatMoney(activeSnapshot.cogs)}</p>
            <p className="mt-1 text-sm text-[#8b584d]">Calculated from inventory movements with purchase fallback logic.</p>
          </div>
        </div>
      )}

      {!displayed ? (
        <div className="rounded-2xl border border-dashed border-[#7ea5ce] bg-[#f3f9ff] p-10 text-center">
          <p className="text-xl font-semibold text-[#0f3d62]">Closing panel ready</p>
          <p className="mt-2 text-sm text-[#4f6f8d]">
            Click <strong>Display</strong> to load periods, rules, and finance integration data.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-[#9fc1df] bg-white shadow-sm">
          <div className="border-b border-[#d7e8f7] px-5 py-4">
            <h3 className="text-lg font-semibold text-[#173f63]">Closing Periods</h3>
            <p className="text-sm text-[#4e6f8f]">
              Each period locks transactions after close. Reopen is limited to authorized roles.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-[#0d3f65] text-white">
                <tr>
                  <th className="px-4 py-3 text-left">Period</th>
                  <th className="px-4 py-3 text-left">Mode</th>
                  <th className="px-4 py-3 text-left">Operational</th>
                  <th className="px-4 py-3 text-left">Scheduled</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-right">Net Income</th>
                  <th className="px-4 py-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {periods.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                      No closing periods yet.
                    </td>
                  </tr>
                ) : (
                  periods.map((period) => {
                    const summary = (period.summary_json || null) as ClosingSnapshot | null;
                    const netIncome =
                      summary && typeof (summary as any).netIncome === 'number'
                        ? Number((summary as any).netIncome)
                        : null;
                    return (
                      <tr key={period.closing_id} className="border-b border-[#ebf2f9]">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-[#173f63]">
                            {formatDateOnly(period.period_from)} to {formatDateOnly(period.period_to)}
                          </div>
                          <div className="text-xs text-[#6b8cab]">ID #{period.closing_id}</div>
                        </td>
                        <td className="px-4 py-3 capitalize text-[#274d70]">{period.close_mode}</td>
                        <td className="px-4 py-3 text-[#355b7f]">
                          {period.operational_from && period.operational_to
                            ? `${formatDateOnly(period.operational_from)} to ${formatDateOnly(period.operational_to)}`
                            : '-'}
                        </td>
                        <td className="px-4 py-3 text-[#355b7f]">
                          {period.scheduled_at ? new Date(period.scheduled_at).toLocaleString() : '-'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="inline-flex items-center gap-1 rounded-full border border-[#d3e6f8] bg-[#f3f9ff] px-2.5 py-1 text-xs font-semibold capitalize text-[#21527b]">
                            {period.status === 'closed' ? (
                              <Lock className="h-3.5 w-3.5" />
                            ) : period.status === 'reopened' ? (
                              <ShieldAlert className="h-3.5 w-3.5" />
                            ) : (
                              <Clock3 className="h-3.5 w-3.5" />
                            )}
                            {period.status}
                          </div>
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-semibold ${
                            netIncome === null ? 'text-[#5a7895]' : netIncome >= 0 ? 'text-[#16723d]' : 'text-[#c03939]'
                          }`}
                        >
                          {netIncome === null ? 'Use Summary' : formatMoney(netIncome)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                if (period.status === 'closed') {
                                  showToast({
                                    type: 'warning',
                                    title: 'This period is closed. Reopen it first to edit dates.',
                                  });
                                  return;
                                }
                                openEditPeriod(period);
                              }}
                              className="rounded-lg border border-[#9fc1df] bg-[#f4f9ff] px-3 py-1.5 text-xs font-semibold text-[#1c4a72] hover:bg-[#e9f4ff]"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => openSummary(period)}
                              className="rounded-lg border border-[#9fc1df] bg-white px-3 py-1.5 text-xs font-semibold text-[#1c4a72] hover:bg-[#f5fbff]"
                            >
                              Summary
                            </button>
                            {period.status !== 'closed' && (
                              <button
                                type="button"
                                onClick={() => openCloseWizard(period)}
                                className="rounded-lg border border-[#2b6e8c] bg-[#0f4f74] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0a4364]"
                              >
                                Close
                              </button>
                            )}
                            {period.status === 'closed' && (
                              <button
                                type="button"
                                onClick={() => {
                                  setReopenTarget(period);
                                  setReopenReason('');
                                }}
                                className="rounded-lg border border-[#c58044] bg-[#fff6ed] px-3 py-1.5 text-xs font-semibold text-[#995923] hover:bg-[#ffe7d3]"
                              >
                                Reopen
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Create Closing Period" size="lg">
        <div className="space-y-4">
          <div className="rounded-xl border border-[#d6e5f4] bg-[#f7fbff] p-4 text-sm text-[#395f80]">
            Step 1: choose period dates. Step 2: optional operational period and schedule. Step 3: create period.
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1">
              <span className="text-sm font-semibold text-[#264c70]">Close Mode</span>
              <select
                value={createForm.closeMode}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, closeMode: e.target.value as any }))}
                className="w-full rounded-xl border border-[#aac7e2] bg-white px-3 py-2 text-sm text-[#173f63] outline-none focus:border-[#4b83b4]"
              >
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
                <option value="custom">Custom</option>
              </select>
            </label>
            <div className="hidden md:block" />
            <label className="space-y-1">
              <span className="text-sm font-semibold text-[#264c70]">Period From</span>
              <input
                type="date"
                value={createForm.periodFrom}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, periodFrom: e.target.value }))}
                className="w-full rounded-xl border border-[#aac7e2] bg-white px-3 py-2 text-sm text-[#173f63] outline-none focus:border-[#4b83b4]"
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-semibold text-[#264c70]">Period To</span>
              <input
                type="date"
                value={createForm.periodTo}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, periodTo: e.target.value }))}
                className="w-full rounded-xl border border-[#aac7e2] bg-white px-3 py-2 text-sm text-[#173f63] outline-none focus:border-[#4b83b4]"
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-semibold text-[#264c70]">Operational From (Optional)</span>
              <input
                type="date"
                value={createForm.operationalFrom}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, operationalFrom: e.target.value }))}
                className="w-full rounded-xl border border-[#aac7e2] bg-white px-3 py-2 text-sm text-[#173f63] outline-none focus:border-[#4b83b4]"
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-semibold text-[#264c70]">Operational To (Optional)</span>
              <input
                type="date"
                value={createForm.operationalTo}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, operationalTo: e.target.value }))}
                className="w-full rounded-xl border border-[#aac7e2] bg-white px-3 py-2 text-sm text-[#173f63] outline-none focus:border-[#4b83b4]"
              />
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className="text-sm font-semibold text-[#264c70]">Scheduled Auto Close (Optional)</span>
              <input
                type="datetime-local"
                value={createForm.scheduledAt}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, scheduledAt: e.target.value }))}
                className="w-full rounded-xl border border-[#aac7e2] bg-white px-3 py-2 text-sm text-[#173f63] outline-none focus:border-[#4b83b4]"
              />
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className="text-sm font-semibold text-[#264c70]">Note</span>
              <textarea
                rows={2}
                value={createForm.note}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, note: e.target.value }))}
                className="w-full rounded-xl border border-[#aac7e2] bg-white px-3 py-2 text-sm text-[#173f63] outline-none focus:border-[#4b83b4]"
                placeholder="Describe this closing period purpose..."
              />
            </label>
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="rounded-xl border border-[#aac7e2] px-4 py-2 text-sm font-semibold text-[#2f5b82] hover:bg-[#f3f9ff]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={createPeriod}
              className="rounded-xl border border-[#2e7e4f] bg-[#1f8f4d] px-4 py-2 text-sm font-semibold text-white hover:bg-[#16723d]"
            >
              Create Period
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={editOpen}
        onClose={() => {
          setEditOpen(false);
          setEditTarget(null);
        }}
        title="Edit Closing Period"
        size="lg"
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-[#d6e5f4] bg-[#f7fbff] p-4 text-sm text-[#395f80]">
            Update dates and scheduling. If period dates change, summary/profit values are recalculated on next close/preview.
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1">
              <span className="text-sm font-semibold text-[#264c70]">Close Mode</span>
              <select
                value={editForm.closeMode}
                onChange={(e) => setEditForm((prev) => ({ ...prev, closeMode: e.target.value as any }))}
                className="w-full rounded-xl border border-[#aac7e2] bg-white px-3 py-2 text-sm text-[#173f63] outline-none focus:border-[#4b83b4]"
              >
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
                <option value="custom">Custom</option>
              </select>
            </label>
            <div className="hidden md:block" />
            <label className="space-y-1">
              <span className="text-sm font-semibold text-[#264c70]">Period From</span>
              <input
                type="date"
                value={editForm.periodFrom}
                onChange={(e) => setEditForm((prev) => ({ ...prev, periodFrom: e.target.value }))}
                className="w-full rounded-xl border border-[#aac7e2] bg-white px-3 py-2 text-sm text-[#173f63] outline-none focus:border-[#4b83b4]"
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-semibold text-[#264c70]">Period To</span>
              <input
                type="date"
                value={editForm.periodTo}
                onChange={(e) => setEditForm((prev) => ({ ...prev, periodTo: e.target.value }))}
                className="w-full rounded-xl border border-[#aac7e2] bg-white px-3 py-2 text-sm text-[#173f63] outline-none focus:border-[#4b83b4]"
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-semibold text-[#264c70]">Operational From (Optional)</span>
              <input
                type="date"
                value={editForm.operationalFrom}
                onChange={(e) => setEditForm((prev) => ({ ...prev, operationalFrom: e.target.value }))}
                className="w-full rounded-xl border border-[#aac7e2] bg-white px-3 py-2 text-sm text-[#173f63] outline-none focus:border-[#4b83b4]"
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-semibold text-[#264c70]">Operational To (Optional)</span>
              <input
                type="date"
                value={editForm.operationalTo}
                onChange={(e) => setEditForm((prev) => ({ ...prev, operationalTo: e.target.value }))}
                className="w-full rounded-xl border border-[#aac7e2] bg-white px-3 py-2 text-sm text-[#173f63] outline-none focus:border-[#4b83b4]"
              />
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className="text-sm font-semibold text-[#264c70]">Scheduled Auto Close (Optional)</span>
              <input
                type="datetime-local"
                value={editForm.scheduledAt}
                onChange={(e) => setEditForm((prev) => ({ ...prev, scheduledAt: e.target.value }))}
                className="w-full rounded-xl border border-[#aac7e2] bg-white px-3 py-2 text-sm text-[#173f63] outline-none focus:border-[#4b83b4]"
              />
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className="text-sm font-semibold text-[#264c70]">Note</span>
              <textarea
                rows={2}
                value={editForm.note}
                onChange={(e) => setEditForm((prev) => ({ ...prev, note: e.target.value }))}
                className="w-full rounded-xl border border-[#aac7e2] bg-white px-3 py-2 text-sm text-[#173f63] outline-none focus:border-[#4b83b4]"
                placeholder="Update closing period notes..."
              />
            </label>
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setEditOpen(false);
                setEditTarget(null);
              }}
              className="rounded-xl border border-[#aac7e2] px-4 py-2 text-sm font-semibold text-[#2f5b82] hover:bg-[#f3f9ff]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={updatePeriod}
              className="rounded-xl border border-[#2b6e8c] bg-[#0f4f74] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0b4567]"
            >
              Save Changes
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={closeOpen}
        onClose={() => {
          setCloseOpen(false);
          resetCloseWizard();
        }}
        title="Close Finance Period"
        size="2xl"
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-[#d6e5f4] bg-[#f7fbff] p-4 text-sm text-[#355d7f]">
            <div className="font-semibold text-[#194468]">Step {closeStep} of 3</div>
            <div className="mt-1">
              {closeStep === 1 && 'Set period options and profit sharing rule.'}
              {closeStep === 2 && 'Preview calculations and verify totals before posting.'}
              {closeStep === 3 && 'Final confirmation. Closing will lock transactions in this period.'}
            </div>
          </div>

          {closeTarget && (
            <div className="rounded-xl border border-[#d7e8f7] bg-white p-4 text-sm text-[#224768]">
              <div className="font-semibold">Period</div>
              <div>
                {formatDateOnly(closeTarget.period_from)} to {formatDateOnly(closeTarget.period_to)} ({closeTarget.close_mode})
              </div>
            </div>
          )}

          {closeStep === 1 && (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-sm font-semibold text-[#264c70]">Rule Source</span>
                  <select
                    value={ruleMode}
                    onChange={(e) => setRuleMode(e.target.value as RuleMode)}
                    className="w-full rounded-xl border border-[#aac7e2] bg-white px-3 py-2 text-sm text-[#173f63] outline-none focus:border-[#4b83b4]"
                  >
                    <option value="saved">Saved Rule</option>
                    <option value="custom">Custom Rule</option>
                  </select>
                </label>
                {ruleMode === 'saved' ? (
                  <label className="space-y-1">
                    <span className="text-sm font-semibold text-[#264c70]">Select Rule</span>
                    <select
                      value={selectedRuleId || ''}
                      onChange={(e) => setSelectedRuleId(e.target.value ? Number(e.target.value) : undefined)}
                      className="w-full rounded-xl border border-[#aac7e2] bg-white px-3 py-2 text-sm text-[#173f63] outline-none focus:border-[#4b83b4]"
                    >
                      <option value="">Default automatic</option>
                      {rules.map((rule) => (
                        <option key={rule.ruleId || rule.ruleName} value={rule.ruleId || ''}>
                          {rule.ruleName}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <label className="space-y-1">
                    <span className="text-sm font-semibold text-[#264c70]">Rule Name</span>
                    <input
                      type="text"
                      value={closeRule.ruleName}
                      onChange={(e) => setCloseRule((prev) => ({ ...prev, ruleName: e.target.value }))}
                      className="w-full rounded-xl border border-[#aac7e2] bg-white px-3 py-2 text-sm text-[#173f63] outline-none focus:border-[#4b83b4]"
                      placeholder="e.g. Monthly Partner Split"
                    />
                  </label>
                )}
              </div>

              {ruleMode === 'custom' && (
                <div className="space-y-4 rounded-xl border border-[#d7e8f7] bg-[#fdfefe] p-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="space-y-1">
                      <span className="text-sm font-semibold text-[#264c70]">Source Capital Account</span>
                      <select
                        value={closeRule.sourceAccId || ''}
                        onChange={(e) =>
                          setCloseRule((prev) => ({
                            ...prev,
                            sourceAccId: e.target.value ? Number(e.target.value) : undefined,
                          }))
                        }
                        className="w-full rounded-xl border border-[#aac7e2] bg-white px-3 py-2 text-sm text-[#173f63] outline-none focus:border-[#4b83b4]"
                      >
                        <option value="">Select source account</option>
                        {equityAccounts.map((account) => (
                          <option key={account.acc_id} value={account.acc_id}>
                            {account.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    {[
                      { key: 'retainedPct', label: 'Retained %', accKey: 'retainedAccId' },
                      { key: 'reinvestmentPct', label: 'Reinvestment %', accKey: 'reinvestmentAccId' },
                      { key: 'reservePct', label: 'Reserve %', accKey: 'reserveAccId' },
                    ].map((entry) => (
                      <div key={entry.key} className="space-y-2">
                        <label className="space-y-1">
                          <span className="text-sm font-semibold text-[#264c70]">{entry.label}</span>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step="0.01"
                            value={(closeRule as any)[entry.key]}
                            onChange={(e) =>
                              setCloseRule((prev) => ({
                                ...prev,
                                [entry.key]: Number(e.target.value || 0),
                              }))
                            }
                            className="w-full rounded-xl border border-[#aac7e2] bg-white px-3 py-2 text-sm text-[#173f63] outline-none focus:border-[#4b83b4]"
                          />
                        </label>
                        <select
                          value={((closeRule as any)[entry.accKey] as number | undefined) || ''}
                          onChange={(e) =>
                            setCloseRule((prev) => ({
                              ...prev,
                              [entry.accKey]: e.target.value ? Number(e.target.value) : undefined,
                            }))
                          }
                          className="w-full rounded-xl border border-[#aac7e2] bg-white px-3 py-2 text-sm text-[#173f63] outline-none focus:border-[#4b83b4]"
                        >
                          <option value="">Allocation account</option>
                          {equityAccounts.map((account) => (
                            <option key={`${entry.accKey}-${account.acc_id}`} value={account.acc_id}>
                              {account.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-[#264c70]">Partners / Shareholders</p>
                      <button
                        type="button"
                        onClick={addPartner}
                        className="rounded-lg border border-[#9fc1df] bg-[#f5fbff] px-2.5 py-1 text-xs font-semibold text-[#21527b]"
                      >
                        Add Partner
                      </button>
                    </div>
                    {closeRule.partners.map((partner, index) => (
                      <div key={`partner-${index}`} className="grid gap-2 md:grid-cols-[1.4fr_0.7fr_1fr_auto]">
                        <input
                          type="text"
                          value={partner.partnerName}
                          onChange={(e) => updatePartner(index, { partnerName: e.target.value })}
                          className="w-full rounded-xl border border-[#aac7e2] bg-white px-3 py-2 text-sm text-[#173f63] outline-none focus:border-[#4b83b4]"
                          placeholder="Partner name"
                        />
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step="0.01"
                          value={partner.sharePct}
                          onChange={(e) => updatePartner(index, { sharePct: Number(e.target.value || 0) })}
                          className="w-full rounded-xl border border-[#aac7e2] bg-white px-3 py-2 text-sm text-[#173f63] outline-none focus:border-[#4b83b4]"
                          placeholder="%"
                        />
                        <select
                          value={partner.accId || ''}
                          onChange={(e) => updatePartner(index, { accId: e.target.value ? Number(e.target.value) : null })}
                          className="w-full rounded-xl border border-[#aac7e2] bg-white px-3 py-2 text-sm text-[#173f63] outline-none focus:border-[#4b83b4]"
                        >
                          <option value="">Partner account</option>
                          {equityAccounts.map((account) => (
                            <option key={`partner-${index}-${account.acc_id}`} value={account.acc_id}>
                              {account.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => removePartner(index)}
                          className="rounded-xl border border-[#f0c2c2] bg-[#fff5f5] px-3 py-2 text-xs font-semibold text-[#b94d4d]"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid gap-3 md:grid-cols-3">
                <label className="inline-flex items-center gap-2 rounded-xl border border-[#d6e5f4] bg-white px-3 py-2 text-sm text-[#2a557b]">
                  <input
                    type="checkbox"
                    checked={autoTransfer}
                    onChange={(e) => setAutoTransfer(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  Auto transfer profit
                </label>
                <label className="inline-flex items-center gap-2 rounded-xl border border-[#d6e5f4] bg-white px-3 py-2 text-sm text-[#2a557b]">
                  <input
                    type="checkbox"
                    checked={saveRuleAsDefault}
                    onChange={(e) => setSaveRuleAsDefault(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  Save rule as default
                </label>
                <label className="inline-flex items-center gap-2 rounded-xl border border-[#f0cf9f] bg-[#fff9ef] px-3 py-2 text-sm text-[#7f4e17]">
                  <input
                    type="checkbox"
                    checked={forceClose}
                    onChange={(e) => setForceClose(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  Force close with warnings
                </label>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setCloseOpen(false);
                    resetCloseWizard();
                  }}
                  className="rounded-xl border border-[#aac7e2] px-4 py-2 text-sm font-semibold text-[#2f5b82] hover:bg-[#f3f9ff]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={generatePreview}
                  className="rounded-xl border border-[#2b6e8c] bg-[#0f4f74] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0b4567]"
                >
                  Generate Preview
                </button>
              </div>
            </div>
          )}

          {closeStep === 2 && previewData && (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-[#d6e5f4] bg-white p-3">
                  <p className="text-xs uppercase tracking-wide text-[#5b7896]">Net Revenue</p>
                  <p className="text-lg font-semibold text-[#173f63]">{formatMoney(previewData.summary.netRevenue)}</p>
                </div>
                <div className="rounded-xl border border-[#f0d0c7] bg-white p-3">
                  <p className="text-xs uppercase tracking-wide text-[#8d5a4c]">COGS</p>
                  <p className="text-lg font-semibold text-[#6b2f25]">{formatMoney(previewData.summary.cogs)}</p>
                </div>
                <div className="rounded-xl border border-[#d0e8da] bg-white p-3">
                  <p className="text-xs uppercase tracking-wide text-[#4f7e63]">Net Income</p>
                  <p className={`text-lg font-semibold ${previewData.summary.netIncome >= 0 ? 'text-[#1f8f4d]' : 'text-[#c53939]'}`}>
                    {formatMoney(previewData.summary.netIncome)}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-[#d7e8f7] bg-white">
                <div className="border-b border-[#e7f0f8] px-4 py-3 font-semibold text-[#234a6d]">Profit Allocation Preview</div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-[#f4f9ff] text-[#2d597e]">
                      <tr>
                        <th className="px-3 py-2 text-left">Type</th>
                        <th className="px-3 py-2 text-left">Label</th>
                        <th className="px-3 py-2 text-right">%</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.allocations.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-3 py-5 text-center text-slate-500">
                            No allocation generated (net income is zero/negative).
                          </td>
                        </tr>
                      ) : (
                        previewData.allocations.map((row, idx) => (
                          <tr key={`${row.label}-${idx}`} className="border-t border-[#edf4fb]">
                            <td className="px-3 py-2 capitalize text-[#274d70]">{row.allocationType}</td>
                            <td className="px-3 py-2 text-[#173f63]">{row.label}</td>
                            <td className="px-3 py-2 text-right text-[#355b7f]">{row.sharePct.toFixed(2)}</td>
                            <td className="px-3 py-2 text-right font-semibold text-[#163a5b]">{formatMoney(row.amount)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {previewData.warnings.length > 0 && (
                <div className="space-y-2 rounded-xl border border-[#f3d8a6] bg-[#fff9ef] p-4 text-sm text-[#7f4e17]">
                  <div className="font-semibold">Warnings</div>
                  {previewData.warnings.map((warning, idx) => (
                    <div key={`warn-${idx}`} className="flex items-start gap-2">
                      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{warning}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setCloseStep(1)}
                  className="rounded-xl border border-[#aac7e2] px-4 py-2 text-sm font-semibold text-[#2f5b82] hover:bg-[#f3f9ff]"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => setCloseStep(3)}
                  className="rounded-xl border border-[#2b6e8c] bg-[#0f4f74] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0b4567]"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {closeStep === 3 && previewData && (
            <div className="space-y-4">
              <div className="rounded-xl border border-[#d7e8f7] bg-white p-4 text-sm text-[#2a557b]">
                <div className="font-semibold text-[#183f63]">Final check before submission</div>
                <p className="mt-2">
                  Closing this period will lock transactions between <strong>{formatDateOnly(closeTarget?.period_from)}</strong>{' '}
                  and <strong>{formatDateOnly(closeTarget?.period_to)}</strong>.
                </p>
                <p className="mt-1">
                  Net income to finalize: <strong>{formatMoney(previewData.summary.netIncome)}</strong>
                </p>
              </div>
              <label className="inline-flex items-center gap-2 rounded-xl border border-[#d6e5f4] bg-white px-3 py-2 text-sm text-[#2a557b]">
                <input
                  type="checkbox"
                  checked={confirmClose}
                  onChange={(e) => setConfirmClose(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                I confirmed preview values and want to close this finance period.
              </label>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setCloseStep(2)}
                  className="rounded-xl border border-[#aac7e2] px-4 py-2 text-sm font-semibold text-[#2f5b82] hover:bg-[#f3f9ff]"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={closePeriod}
                  className="rounded-xl border border-[#2e7e4f] bg-[#1f8f4d] px-4 py-2 text-sm font-semibold text-white hover:bg-[#16723d]"
                >
                  Finalize Close
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      <Modal isOpen={summaryOpen} onClose={() => setSummaryOpen(false)} title="Closing Summary Report" size="xl">
        {!summaryData ? (
          <div className="py-10 text-center text-slate-500">No summary loaded.</div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-[#d7e8f7] bg-white p-4">
              <div className="text-sm text-[#4c7194]">
                Period {formatDateOnly(summaryData.period.period_from)} to {formatDateOnly(summaryData.period.period_to)}
              </div>
              <div className="mt-1 text-lg font-semibold text-[#173f63] capitalize">
                Status: {summaryData.period.status}
              </div>
            </div>

            {summaryData.summary && (
              <div className="grid gap-3 md:grid-cols-2">
                {[
                  ['Sales Revenue', summaryData.summary.salesRevenue],
                  ['Sales Returns', summaryData.summary.salesReturns],
                  ['COGS', summaryData.summary.cogs],
                  ['Expense Charges', summaryData.summary.expenseCharges],
                  ['Payroll Expense', summaryData.summary.payrollExpense],
                  ['Other Income', summaryData.summary.otherIncome],
                  ['Net Income', summaryData.summary.netIncome],
                  ['Stock Valuation', summaryData.summary.stockValuation],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-xl border border-[#e4eef8] bg-[#f9fcff] p-3">
                    <p className="text-xs uppercase tracking-wide text-[#5b7896]">{label}</p>
                    <p className="text-base font-semibold text-[#153a5a]">{formatMoney(Number(value))}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-xl border border-[#d7e8f7] bg-white">
              <div className="border-b border-[#e7f0f8] px-4 py-3 font-semibold text-[#234a6d]">Distribution Entries</div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-[#f4f9ff] text-[#2d597e]">
                    <tr>
                      <th className="px-3 py-2 text-left">Type</th>
                      <th className="px-3 py-2 text-left">Label</th>
                      <th className="px-3 py-2 text-right">%</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(summaryData.profit?.allocations || []).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-5 text-center text-slate-500">
                          No distribution rows recorded.
                        </td>
                      </tr>
                    ) : (
                      (summaryData.profit?.allocations || []).map((row, idx) => (
                        <tr key={`sum-alloc-${idx}`} className="border-t border-[#edf4fb]">
                          <td className="px-3 py-2 capitalize text-[#274d70]">{row.allocationType}</td>
                          <td className="px-3 py-2 text-[#173f63]">{row.label}</td>
                          <td className="px-3 py-2 text-right text-[#355b7f]">{row.sharePct.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right font-semibold text-[#163a5b]">{formatMoney(row.amount)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {(summaryData.profit?.warnings || []).length > 0 && (
              <div className="space-y-2 rounded-xl border border-[#f3d8a6] bg-[#fff9ef] p-4 text-sm text-[#7f4e17]">
                <div className="font-semibold">Warnings</div>
                {(summaryData.profit?.warnings || []).map((warning, idx) => (
                  <div key={`sum-warn-${idx}`} className="flex items-start gap-2">
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{warning}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        isOpen={Boolean(reopenTarget)}
        onClose={() => {
          setReopenTarget(null);
          setReopenReason('');
        }}
        title="Reopen Closing Period"
        size="md"
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-[#f3d8a6] bg-[#fff9ef] p-3 text-sm text-[#7f4e17]">
            Reopening will unlock transactions for this period and allow edits.
          </div>
          <div className="text-sm text-[#2a557b]">
            {reopenTarget ? `${formatDateOnly(reopenTarget.period_from)} to ${formatDateOnly(reopenTarget.period_to)}` : ''}
          </div>
          <label className="space-y-1">
            <span className="text-sm font-semibold text-[#264c70]">Reason (optional)</span>
            <textarea
              rows={3}
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
              className="w-full rounded-xl border border-[#aac7e2] bg-white px-3 py-2 text-sm text-[#173f63] outline-none focus:border-[#4b83b4]"
              placeholder="Explain why this period is being reopened"
            />
          </label>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setReopenTarget(null);
                setReopenReason('');
              }}
              className="rounded-xl border border-[#aac7e2] px-4 py-2 text-sm font-semibold text-[#2f5b82] hover:bg-[#f3f9ff]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={reopenPeriod}
              className="rounded-xl border border-[#c58044] bg-[#e98d3d] px-4 py-2 text-sm font-semibold text-white hover:bg-[#d67c2b]"
            >
              Reopen Period
            </button>
          </div>
        </div>
      </Modal>

      {loading && (
        <div className="rounded-xl border border-[#d7e8f7] bg-white px-4 py-3 text-sm text-[#2a557b]">
          Loading finance closing data...
        </div>
      )}
    </div>
  );
};

export default ClosingFinance;
