import { useEffect, useMemo, useState } from 'react';
import {
  BriefcaseBusiness,
  CircleDollarSign,
  History,
  Home,
  Percent,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { PageHeader } from '../../components/ui/layout';
import { Tabs } from '../../components/ui/tabs';
import {
  settingsService,
  CapitalOwnerEquity,
  OwnerDrawing,
  CompanyInfo,
  CapitalContribution,
  OwnerProfitPreview,
  SettingsAssetOverview,
  SettingsClosingPeriod,
  SettingsClosingSummary,
} from '../../services/settings.service';
import { systemService, SystemAuditLog } from '../../services/system.service';
import { useToast } from '../../components/ui/toast/Toast';
import { Modal } from '../../components/ui/modal/Modal';
import { ConfirmDialog } from '../../components/ui/modal/ConfirmDialog';
import { useAuth } from '../../context/AuthContext';
import { assetsService } from '../../services/assets.service';
import { ImageUpload } from '../../components/common/ImageUpload';
import { imageService } from '../../services/image.service';
import { env } from '../../config/env';

const emptyCompanyForm = {
  company_name: '',
  phone: '',
  manager_name: '',
  logo_img: '',
  banner_img: '',
  capital_amount: '0',
};

const today = () => new Date().toISOString().slice(0, 10);
const formatDateOnly = (value?: string | null) => {
  if (!value) return '';
  const raw = String(value).trim();
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return raw;
};

const formatMoney = (value: number) =>
  `$${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const LOGS_LIMIT = 20;

const Settings = () => {
  const modalLabelClass =
    'text-sm font-semibold text-slate-700 dark:text-slate-200 flex flex-col gap-1';
  const modalInputClass =
    'rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all';
  const modalReadOnlyInputClass =
    'rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none';
  const modalTextareaClass = `${modalInputClass} resize-none`;
  const modalBtnSecondaryClass =
    'px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all';
  const modalBtnPrimaryClass =
    'px-4 py-2 rounded-xl bg-primary-600 text-white font-semibold hover:bg-primary-700 transition-all disabled:opacity-60 disabled:cursor-not-allowed';
  const { showToast } = useToast();
  const { permissions } = useAuth();
  const allowRemoteImageUpload = true;
  const logoStorageKey = 'erp.company.logo_img';
  const bannerStorageKey = 'erp.company.banner_img';

  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [companyDisplayed, setCompanyDisplayed] = useState(false);
  const [companyLoading, setCompanyLoading] = useState(false);
  const [companyModalOpen, setCompanyModalOpen] = useState(false);
  const [companySaving, setCompanySaving] = useState(false);
  const [companyDeleting, setCompanyDeleting] = useState(false);
  const [companyDeleteConfirmOpen, setCompanyDeleteConfirmOpen] = useState(false);
  const [companyForm, setCompanyForm] = useState(emptyCompanyForm);

  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });

  const saveLocalImage = (key: string, value: string) => {
    try {
      window.localStorage.setItem(key, value);
    } catch (error) {
      console.warn('Failed to save image in localStorage:', error);
    }
  };

  const clearLocalImage = (key: string) => {
    try {
      window.localStorage.removeItem(key);
    } catch (error) {
      console.warn('Failed to clear image from localStorage:', error);
    }
  };

  const handleLogoUpload = async (file: File) => {
    if (!allowRemoteImageUpload) {
      const dataUrl = await readFileAsDataUrl(file);
      setCompanyForm((prev) => ({ ...prev, logo_img: dataUrl }));
      saveLocalImage(logoStorageKey, dataUrl);
      return dataUrl;
    }
    const res = await imageService.uploadSystemLogo(file);
    if (!res.success) {
      throw new Error(res.error || 'Failed to upload logo');
    }
    const payload: any = res.data || {};
    const logoUrl =
      payload.logoUrl ||
      payload.logo_url ||
      payload.systemInfo?.logo_url ||
      payload.systemInfo?.logoUrl ||
      '';
    if (!logoUrl) {
      throw new Error('Logo upload did not return a URL');
    }
    saveLocalImage(logoStorageKey, logoUrl);
    setCompanyForm((prev) => ({ ...prev, logo_img: logoUrl }));
    return logoUrl;
  };

  const handleBannerUpload = async (file: File) => {
    if (!allowRemoteImageUpload) {
      const dataUrl = await readFileAsDataUrl(file);
      setCompanyForm((prev) => ({ ...prev, banner_img: dataUrl }));
      saveLocalImage(bannerStorageKey, dataUrl);
      return dataUrl;
    }
    const res = await imageService.uploadSystemBanner(file);
    if (!res.success) {
      throw new Error(res.error || 'Failed to upload banner');
    }
    const payload: any = res.data || {};
    const bannerUrl =
      payload.bannerImageUrl ||
      payload.banner_image_url ||
      payload.systemInfo?.banner_image_url ||
      payload.systemInfo?.bannerImageUrl ||
      '';
    if (!bannerUrl) {
      throw new Error('Banner upload did not return a URL');
    }
    saveLocalImage(bannerStorageKey, bannerUrl);
    setCompanyForm((prev) => ({ ...prev, banner_img: bannerUrl }));
    return bannerUrl;
  };

  const handleLogoDelete = async () => {
    if (!allowRemoteImageUpload) {
      setCompanyForm((prev) => ({ ...prev, logo_img: '' }));
      clearLocalImage(logoStorageKey);
      return;
    }
    const res = await imageService.deleteSystemLogo();
    if (!res.success) {
      throw new Error(res.error || 'Failed to delete logo');
    }
    setCompanyForm((prev) => ({ ...prev, logo_img: '' }));
    clearLocalImage(logoStorageKey);
  };

  const handleBannerDelete = async () => {
    if (!allowRemoteImageUpload) {
      setCompanyForm((prev) => ({ ...prev, banner_img: '' }));
      clearLocalImage(bannerStorageKey);
      return;
    }
    const res = await imageService.deleteSystemBanner();
    if (!res.success) {
      throw new Error(res.error || 'Failed to delete banner');
    }
    setCompanyForm((prev) => ({ ...prev, banner_img: '' }));
    clearLocalImage(bannerStorageKey);
  };

  const resolveImageUrl = (value?: string | null) => {
    const raw = (value || '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith('uploads/')) return `${env.API_URL}/${raw}`;
    if (raw.startsWith('/')) return `${env.API_URL}${raw}`;
    return raw;
  };

  const [capitalRows, setCapitalRows] = useState<CapitalContribution[]>([]);
  const [capitalOwnerRows, setCapitalOwnerRows] = useState<CapitalOwnerEquity[]>([]);
  const [capitalTotals, setCapitalTotals] = useState({
    contributed_amount: 0,
    profit_allocated: 0,
    drawing_amount: 0,
    equity_balance: 0,
  });
  const [drawingRows, setDrawingRows] = useState<OwnerDrawing[]>([]);
  const [drawingPage, setDrawingPage] = useState(1);
  const [drawingTotal, setDrawingTotal] = useState(0);
  const [drawingLimit] = useState(8);
  const [capitalLoading, setCapitalLoading] = useState(false);
  const [capitalPage, setCapitalPage] = useState(1);
  const [capitalLimit] = useState(10);
  const [capitalTotal, setCapitalTotal] = useState(0);
  const [capitalSearch, setCapitalSearch] = useState('');
  const [capitalDisplayed, setCapitalDisplayed] = useState(false);
  const [drawingDisplayed, setDrawingDisplayed] = useState(false);
  const [drawingLoading, setDrawingLoading] = useState(false);

  const [capitalModalOpen, setCapitalModalOpen] = useState(false);
  const [capitalSaving, setCapitalSaving] = useState(false);
  const [editingCapital, setEditingCapital] = useState<CapitalContribution | null>(null);
  const [capitalDeleteId, setCapitalDeleteId] = useState<number | null>(null);
  const [capitalDeleteLoading, setCapitalDeleteLoading] = useState(false);
  const [drawingModalOpen, setDrawingModalOpen] = useState(false);
  const [drawingSaving, setDrawingSaving] = useState(false);
  const [editingDrawing, setEditingDrawing] = useState<OwnerDrawing | null>(null);
  const [drawingDeleteId, setDrawingDeleteId] = useState<number | null>(null);
  const [drawingDeleteLoading, setDrawingDeleteLoading] = useState(false);

  const [capitalForm, setCapitalForm] = useState({
    ownerName: '',
    amount: '',
    sharePct: '0',
    date: today(),
    note: '',
  });
  const [drawingForm, setDrawingForm] = useState({
    ownerName: '',
    amount: '',
    date: today(),
    note: '',
  });

  const [closingRows, setClosingRows] = useState<SettingsClosingPeriod[]>([]);
  const [closingDisplayed, setClosingDisplayed] = useState(false);
  const [closingLoading, setClosingLoading] = useState(false);
  const [closingModalOpen, setClosingModalOpen] = useState(false);
  const [closingSaving, setClosingSaving] = useState(false);
  const [closingSummaryOpen, setClosingSummaryOpen] = useState(false);
  const [closingSummaryLoading, setClosingSummaryLoading] = useState(false);
  const [closingSummary, setClosingSummary] = useState<SettingsClosingSummary | null>(null);
  const [closingFinalizeTarget, setClosingFinalizeTarget] = useState<SettingsClosingPeriod | null>(null);
  const [closingFinalizing, setClosingFinalizing] = useState(false);
  const [closingEditingRow, setClosingEditingRow] = useState<SettingsClosingPeriod | null>(null);
  const [closingForm, setClosingForm] = useState({
    closeMode: 'monthly' as 'monthly' | 'quarterly' | 'yearly' | 'custom',
    periodFrom: today(),
    periodTo: today(),
    note: '',
  });

  const [profitDisplayed, setProfitDisplayed] = useState(false);
  const [profitLoading, setProfitLoading] = useState(false);
  const [profitOwners, setProfitOwners] = useState<string[]>([]);
  const [profitPeriods, setProfitPeriods] = useState<SettingsClosingPeriod[]>([]);
  const [profitModalOpen, setProfitModalOpen] = useState(false);
  const [profitPreviewLoading, setProfitPreviewLoading] = useState(false);
  const [profitPreview, setProfitPreview] = useState<OwnerProfitPreview | null>(null);
  const [profitForm, setProfitForm] = useState({
    closingId: '',
    ownerName: '',
    sharePct: '',
  });
  const [newProfitOwnerName, setNewProfitOwnerName] = useState('');
  const [assetAccountsDisplayed, setAssetAccountsDisplayed] = useState(false);
  const [assetAccountsLoading, setAssetAccountsLoading] = useState(false);
  const [assetAccountsCreating, setAssetAccountsCreating] = useState(false);
  const [assetOverview, setAssetOverview] = useState<SettingsAssetOverview | null>(null);
  const [fixedAssetModalOpen, setFixedAssetModalOpen] = useState(false);
  const [fixedAssetSaving, setFixedAssetSaving] = useState(false);
  const [editingFixedAssetId, setEditingFixedAssetId] = useState<number | null>(null);
  const [fixedAssetDeleteTarget, setFixedAssetDeleteTarget] = useState<{ asset_id: number; asset_name: string } | null>(null);
  const [fixedAssetDeleting, setFixedAssetDeleting] = useState(false);
  const [fixedAssetForm, setFixedAssetForm] = useState({
    assetName: '',
    purchaseDate: today(),
    cost: '',
    status: 'active',
  });

  const [logs, setLogs] = useState<SystemAuditLog[]>([]);
  const [logsStartDate, setLogsStartDate] = useState(today());
  const [logsEndDate, setLogsEndDate] = useState(today());
  const [logsDisplayed, setLogsDisplayed] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsPage, setLogsPage] = useState(1);
  const [logsTotal, setLogsTotal] = useState(0);

  const totalCapitalPages = Math.max(1, Math.ceil(capitalTotal / capitalLimit));
  const totalDrawingPages = Math.max(1, Math.ceil(drawingTotal / drawingLimit));
  const ownerOptions = useMemo(() => {
    const names = new Set(capitalOwnerRows.map((item) => item.owner_name));
    if (editingDrawing?.owner_name) names.add(editingDrawing.owner_name);
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [capitalOwnerRows, editingDrawing]);
  const selectedOwnerAvailable = useMemo(() => {
    if (!drawingForm.ownerName) return 0;
    const row = capitalOwnerRows.find((item) => item.owner_name === drawingForm.ownerName);
    const current = Number(row?.equity_balance || 0);
    if (editingDrawing && editingDrawing.owner_name === drawingForm.ownerName) {
      return current + Number(editingDrawing.amount || 0);
    }
    return current;
  }, [capitalOwnerRows, drawingForm.ownerName, editingDrawing]);

  const loadCompany = async () => {
    setCompanyLoading(true);
    const res = await settingsService.getCompany();
    setCompanyLoading(false);
    if (!res.success || !res.data?.company) {
      showToast('error', 'Company Info', res.error || 'Failed to load company info');
      return;
    }
    const loaded = res.data.company;
    const hasValues =
      !!loaded.company_name?.trim() ||
      !!loaded.phone?.trim() ||
      !!loaded.manager_name?.trim() ||
      !!loaded.logo_img?.trim() ||
      !!loaded.banner_img?.trim() ||
      Number(loaded.capital_amount || 0) > 0;
    setCompany(hasValues ? loaded : null);
    const fallbackLogo =
      loaded.logo_img || window.localStorage.getItem(logoStorageKey) || '';
    const fallbackBanner =
      loaded.banner_img || window.localStorage.getItem(bannerStorageKey) || '';
    setCompanyForm({
      company_name: loaded.company_name || '',
      phone: loaded.phone || '',
      manager_name: loaded.manager_name || '',
      logo_img: fallbackLogo,
      banner_img: fallbackBanner,
      capital_amount: String(loaded.capital_amount ?? 0),
    });
    if (fallbackLogo) saveLocalImage(logoStorageKey, fallbackLogo);
    if (fallbackBanner) saveLocalImage(bannerStorageKey, fallbackBanner);
  };

  const loadCapitalOwnerSummary = async (): Promise<CapitalOwnerEquity[] | null> => {
    const ownerRes = await settingsService.listCapitalOwnerEquity({ search: capitalSearch || undefined });
    if (!ownerRes.success || !ownerRes.data) {
      showToast('error', 'Capital', ownerRes.error || 'Failed to load owner equity summary');
      return null;
    }
    const owners = ownerRes.data.owners || [];
    setCapitalOwnerRows(owners);
    setCapitalTotals(
      ownerRes.data.totals || {
        contributed_amount: 0,
        profit_allocated: 0,
        drawing_amount: 0,
        equity_balance: 0,
      }
    );
    return owners;
  };

  const loadCapital = async (page = 1) => {
    setCapitalLoading(true);
    const [capitalRes, owners] = await Promise.all([
      settingsService.listCapital({ page, limit: capitalLimit, search: capitalSearch || undefined }),
      loadCapitalOwnerSummary(),
    ]);
    setCapitalLoading(false);

    if (!capitalRes.success || !capitalRes.data) {
      showToast('error', 'Capital', capitalRes.error || 'Failed to load capital records');
      return;
    }
    if (!owners) return;

    setCapitalRows(capitalRes.data.rows || []);
    setCapitalPage(capitalRes.data.page || page);
    setCapitalTotal(capitalRes.data.total || 0);
    setCapitalDisplayed(true);
    setDrawingDisplayed(false);
  };

  const loadDrawings = async (page = 1) => {
    setDrawingLoading(true);
    const drawingRes = await settingsService.listCapitalDrawings({
      page,
      limit: drawingLimit,
      search: capitalSearch || undefined,
    });
    setDrawingLoading(false);
    if (!drawingRes.success || !drawingRes.data) {
      showToast('error', 'Capital', drawingRes.error || 'Failed to load owner drawings');
      return;
    }
    setDrawingRows(drawingRes.data.rows || []);
    setDrawingPage(drawingRes.data.page || page);
    setDrawingTotal(drawingRes.data.total || 0);
    setDrawingDisplayed(true);
    setCapitalDisplayed(false);
  };

  const handleDisplayCompany = async () => {
    setCompanyDisplayed(true);
    await loadCompany();
  };

  const handleCompanyEdit = () => {
    if (company) {
      setCompanyForm({
        company_name: company.company_name || '',
        phone: company.phone || '',
        manager_name: company.manager_name || '',
        logo_img: company.logo_img || '',
        banner_img: company.banner_img || '',
        capital_amount: String(company.capital_amount ?? 0),
      });
    } else {
      setCompanyForm(emptyCompanyForm);
    }
    setCompanyModalOpen(true);
  };

  const handleCompanySave = async () => {
    const capitalAmount = Number(companyForm.capital_amount || 0);
    if (!Number.isFinite(capitalAmount) || capitalAmount < 0) {
      showToast('error', 'Company Info', 'Capital must be zero or greater');
      return;
    }
    const normalizeImageValue = (value: string) => {
      const trimmed = (value || '').trim();
      if (!trimmed) return '';
      if (trimmed.startsWith('data:') || trimmed.length > 2048) {
        return '';
      }
      return trimmed;
    };
    const safeLogo = normalizeImageValue(companyForm.logo_img);
    const safeBanner = normalizeImageValue(companyForm.banner_img);
    setCompanySaving(true);
    const res = await settingsService.updateCompany({
      company_name: companyForm.company_name,
      phone: companyForm.phone,
      manager_name: companyForm.manager_name,
      logo_img: safeLogo,
      banner_img: safeBanner,
      capital_amount: capitalAmount,
    });
    setCompanySaving(false);

    if (!res.success || !res.data?.company) {
      showToast('error', 'Company Info', res.error || 'Save failed');
      return;
    }

    setCompany(res.data.company);
    setCompanyModalOpen(false);
    showToast('success', 'Company Info', 'Saved');
    await loadCompany();
  };

  const handleCompanyDelete = async () => {
    if (!company) return;
    setCompanyDeleting(true);
    const res = await settingsService.deleteCompany();
    setCompanyDeleting(false);
    if (!res.success) {
      showToast('error', 'Company Info', res.error || 'Delete failed');
      return;
    }
    setCompany(null);
    setCompanyForm(emptyCompanyForm);
    setCompanyDeleteConfirmOpen(false);
    showToast('success', 'Company Info', 'Deleted');
  };

  const openCreateCapital = () => {
    setEditingCapital(null);
    setCapitalForm({ ownerName: '', amount: '', sharePct: '0', date: today(), note: '' });
    setCapitalModalOpen(true);
  };

  const openEditCapital = (row: CapitalContribution) => {
    setEditingCapital(row);
    setCapitalForm({
      ownerName: row.owner_name,
      amount: String(row.amount),
      sharePct: String(row.share_pct ?? 0),
      date: row.date,
      note: row.note || '',
    });
    setCapitalModalOpen(true);
  };

  const submitCapital = async () => {
    const amount = Number(capitalForm.amount);
    const sharePct = Number(capitalForm.sharePct || 0);
    if (!capitalForm.ownerName.trim()) {
      showToast('error', 'Capital', 'Owner name is required');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast('error', 'Capital', 'Amount must be greater than 0');
      return;
    }
    if (!Number.isFinite(sharePct) || sharePct < 0 || sharePct > 100) {
      showToast('error', 'Capital', 'Owner share % must be between 0 and 100');
      return;
    }
    if (!capitalForm.date) {
      showToast('error', 'Capital', 'Date is required');
      return;
    }

    setCapitalSaving(true);
    const payload = {
      ownerName: capitalForm.ownerName.trim(),
      amount,
      sharePct,
      date: capitalForm.date,
      note: capitalForm.note.trim(),
    };

    const res = editingCapital
      ? await settingsService.updateCapital(editingCapital.capital_id, payload)
      : await settingsService.createCapital(payload);
    setCapitalSaving(false);

    if (!res.success) {
      showToast('error', 'Capital', res.error || (editingCapital ? 'Failed to update capital' : 'Failed to create capital'));
      return;
    }

    setCapitalModalOpen(false);
    showToast('success', 'Capital', editingCapital ? 'Capital updated' : 'Capital created');
    await loadCapital(capitalPage);
  };

  const confirmDeleteCapital = async () => {
    if (!capitalDeleteId) return;
    setCapitalDeleteLoading(true);
    const res = await settingsService.deleteCapital(capitalDeleteId);
    setCapitalDeleteLoading(false);
    if (!res.success) {
      showToast('error', 'Capital', res.error || 'Delete failed');
      return;
    }
    setCapitalDeleteId(null);
    showToast('success', 'Capital', 'Capital deleted');
    await loadCapital(capitalPage);
  };

  const closeDrawingModal = () => {
    setDrawingModalOpen(false);
    setEditingDrawing(null);
  };

  const openDrawingModal = async () => {
    const owners =
      capitalOwnerRows.length > 0
        ? capitalOwnerRows
        : ((await loadCapitalOwnerSummary()) || []);
    if (owners.length === 0) {
      showToast('error', 'Capital Drawing', 'No owners found. Add capital first.');
      return;
    }
    setEditingDrawing(null);
    setDrawingForm({
      ownerName: owners[0]?.owner_name || '',
      amount: '',
      date: today(),
      note: '',
    });
    setDrawingModalOpen(true);
  };

  const openEditDrawing = async (row: OwnerDrawing) => {
    setEditingDrawing(row);
    if (capitalOwnerRows.length === 0) {
      await loadCapitalOwnerSummary();
    }
    setDrawingForm({
      ownerName: row.owner_name,
      amount: String(row.amount),
      date: row.date,
      note: row.note || '',
    });
    setDrawingModalOpen(true);
  };

  const submitOwnerDrawing = async () => {
    const ownerName = drawingForm.ownerName.trim();
    if (!ownerName) {
      showToast('error', 'Capital Drawing', 'Owner is required');
      return;
    }
    const amount = Number(drawingForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast('error', 'Capital Drawing', 'Amount must be greater than 0');
      return;
    }
    if (!drawingForm.date) {
      showToast('error', 'Capital Drawing', 'Date is required');
      return;
    }
    if (amount > selectedOwnerAvailable) {
      showToast('error', 'Capital Drawing', `Draw amount exceeds available equity (${formatMoney(selectedOwnerAvailable)})`);
      return;
    }

    setDrawingSaving(true);
    const payload = {
      ownerName,
      amount,
      date: drawingForm.date,
      note: drawingForm.note.trim(),
    };
    const res = editingDrawing
      ? await settingsService.updateCapitalDrawing(editingDrawing.draw_id, payload)
      : await settingsService.createCapitalDrawing(payload);
    setDrawingSaving(false);
    if (!res.success) {
      showToast('error', 'Capital Drawing', res.error || (editingDrawing ? 'Failed to update drawing' : 'Failed to save drawing'));
      return;
    }

    closeDrawingModal();
    showToast('success', 'Capital Drawing', editingDrawing ? 'Drawing updated' : 'Drawing created');
    await loadCapitalOwnerSummary();
    if (drawingDisplayed) {
      await loadDrawings(drawingPage);
    } else if (capitalDisplayed) {
      await loadCapital(capitalPage);
    }
  };

  const confirmDeleteDrawing = async () => {
    if (!drawingDeleteId) return;
    setDrawingDeleteLoading(true);
    const res = await settingsService.deleteCapitalDrawing(drawingDeleteId);
    setDrawingDeleteLoading(false);
    if (!res.success) {
      showToast('error', 'Capital Drawing', res.error || 'Delete failed');
      return;
    }
    setDrawingDeleteId(null);
    showToast('success', 'Capital Drawing', 'Drawing deleted');
    await loadCapitalOwnerSummary();
    if (drawingDisplayed) {
      await loadDrawings(drawingPage);
    } else if (capitalDisplayed) {
      await loadCapital(capitalPage);
    }
  };

  const loadClosing = async () => {
    setClosingLoading(true);
    const res = await settingsService.listClosingPeriods();
    setClosingLoading(false);
    if (!res.success || !res.data?.periods) {
      showToast('error', 'Closing Finance', res.error || 'Failed to load closing periods');
      return;
    }
    setClosingRows(res.data.periods || []);
    setClosingDisplayed(true);
  };

  const loadLogs = async (page = 1) => {
    if (!logsStartDate || !logsEndDate) {
      showToast('error', 'Activity Logs', 'Select start and end date first');
      return;
    }
    if (logsStartDate > logsEndDate) {
      showToast('error', 'Activity Logs', 'End date must be after start date');
      return;
    }

    setLogsLoading(true);
    const res = await systemService.getLogs(page, LOGS_LIMIT, logsStartDate, logsEndDate);
    setLogsLoading(false);
    if (res.success && res.data?.logs) {
      setLogs(res.data.logs);
      setLogsPage(res.data.page || page);
      setLogsTotal(res.data.total || 0);
      setLogsDisplayed(true);
      return;
    }
    showToast('error', 'Activity Logs', res.error || 'Failed to load logs');
  };

  const createClosingPeriod = async () => {
    if (!closingForm.periodFrom || !closingForm.periodTo) {
      showToast('error', 'Closing Finance', 'Both dates are required');
      return;
    }
    setClosingSaving(true);
    const res = closingEditingRow
      ? await settingsService.updateClosingPeriod(closingEditingRow.closing_id, {
          closeMode: closingForm.closeMode,
          periodFrom: closingForm.periodFrom,
          periodTo: closingForm.periodTo,
          note: closingForm.note.trim() || undefined,
        })
      : await settingsService.createClosingPeriod({
          closeMode: closingForm.closeMode,
          periodFrom: closingForm.periodFrom,
          periodTo: closingForm.periodTo,
          note: closingForm.note.trim() || undefined,
        });
    setClosingSaving(false);
    if (!res.success) {
      showToast('error', 'Closing Finance', res.error || 'Failed to save closing period');
      return;
    }
    setClosingModalOpen(false);
    setClosingEditingRow(null);
    setClosingForm({ closeMode: 'monthly', periodFrom: today(), periodTo: today(), note: '' });
    showToast('success', 'Closing Finance', closingEditingRow ? 'Closing period updated' : 'Closing period created');
    await loadClosing();
  };

  const openNewClosingModal = () => {
    setClosingEditingRow(null);
    setClosingForm({ closeMode: 'monthly', periodFrom: today(), periodTo: today(), note: '' });
    setClosingModalOpen(true);
  };

  const openEditClosingModal = (row: SettingsClosingPeriod) => {
    if (row.status === 'closed') {
      showToast('warning', 'Closing Finance', 'This period is closed. Reopen first to edit dates.');
      return;
    }
    setClosingEditingRow(row);
    setClosingForm({
      closeMode: row.close_mode || 'monthly',
      periodFrom: formatDateOnly(row.period_from) || today(),
      periodTo: formatDateOnly(row.period_to) || today(),
      note: row.note || '',
    });
    setClosingModalOpen(true);
  };

  const openClosingSummary = async (closingId: number) => {
    setClosingSummaryLoading(true);
    const res = await settingsService.getClosingSummary(closingId);
    setClosingSummaryLoading(false);
    if (!res.success || !res.data?.summary) {
      showToast('error', 'Closing Finance', res.error || 'Failed to load summary');
      return;
    }
    setClosingSummary(res.data.summary);
    setClosingSummaryOpen(true);
  };

  const finalizeClosingPeriod = async () => {
    if (!closingFinalizeTarget) return;
    setClosingFinalizing(true);
    const res = await settingsService.closeClosingPeriod(closingFinalizeTarget.closing_id);
    setClosingFinalizing(false);
    if (!res.success) {
      showToast('error', 'Closing Finance', res.error || 'Failed to finalize closing period');
      return;
    }
    setClosingFinalizeTarget(null);
    showToast('success', 'Closing Finance', 'Closing period finalized');
    const warnings = res.data?.result?.warnings || [];
    if (warnings.length) {
      showToast('warning', 'Closing Finance', warnings[0]);
    }
    await loadClosing();
    if (profitDisplayed) await loadProfitData();
  };

  const loadProfitData = async () => {
    setProfitLoading(true);
    const [periodRes, ownerRes] = await Promise.all([
      settingsService.listClosingPeriods({ status: 'closed' }),
      settingsService.listProfitOwners(),
    ]);
    setProfitLoading(false);

    if (!periodRes.success || !periodRes.data?.periods) {
      showToast('error', 'Profit Sharing', periodRes.error || 'Failed to load closed periods');
      return;
    }
    if (!ownerRes.success || !ownerRes.data?.owners) {
      showToast('error', 'Profit Sharing', ownerRes.error || 'Failed to load owners');
      return;
    }

    setProfitPeriods(periodRes.data.periods || []);
    setProfitOwners(ownerRes.data.owners || []);
    setProfitDisplayed(true);
  };

  const loadAssetAccounts = async () => {
    setAssetAccountsLoading(true);
    const res = await settingsService.getAssetsOverview();
    setAssetAccountsLoading(false);
    if (!res.success || !res.data?.overview) {
      showToast('error', 'Assets', res.error || 'Failed to load assets overview');
      return;
    }
    setAssetOverview(res.data.overview);
    setAssetAccountsDisplayed(true);
  };

  const createDefaultAssetAccounts = async () => {
    try {
      setAssetAccountsCreating(true);
      const res = await settingsService.prepareAssetAccounts();
      if (!res.success) {
        showToast('error', 'Assets', res.error || 'Failed to prepare asset accounts');
        return;
      }
      showToast('success', 'Assets', `Prepared accounts. New created: ${Number(res.data?.created || 0)}`);
      await loadAssetAccounts();
    } catch (error) {
      showToast('error', 'Assets', error instanceof Error ? error.message : 'Failed to prepare asset accounts');
    } finally {
      setAssetAccountsCreating(false);
    }
  };

  const resetFixedAssetModal = () => {
    setEditingFixedAssetId(null);
    setFixedAssetForm({
      assetName: '',
      purchaseDate: today(),
      cost: '',
      status: 'active',
    });
  };

  const openCreateFixedAssetModal = () => {
    resetFixedAssetModal();
    setFixedAssetModalOpen(true);
  };

  const openEditFixedAssetModal = (asset: {
    asset_id: number;
    asset_name: string;
    purchase_date: string;
    cost: number;
    status: string;
  }) => {
    setEditingFixedAssetId(asset.asset_id);
    setFixedAssetForm({
      assetName: asset.asset_name || '',
      purchaseDate: formatDateOnly(asset.purchase_date) || today(),
      cost: String(Number(asset.cost || 0)),
      status: asset.status || 'active',
    });
    setFixedAssetModalOpen(true);
  };

  const saveFixedAsset = async () => {
    if (!fixedAssetForm.assetName.trim()) {
      showToast('error', 'Assets', 'Asset name is required');
      return;
    }
    if (!fixedAssetForm.purchaseDate) {
      showToast('error', 'Assets', 'Purchase date is required');
      return;
    }
    const cost = Number(fixedAssetForm.cost || 0);
    if (!Number.isFinite(cost) || cost <= 0) {
      showToast('error', 'Assets', 'Cost must be greater than 0');
      return;
    }

    setFixedAssetSaving(true);
    const payload = {
      assetName: fixedAssetForm.assetName.trim(),
      purchaseDate: fixedAssetForm.purchaseDate,
      cost,
      status: fixedAssetForm.status,
    };
    const res = editingFixedAssetId
      ? await assetsService.update(editingFixedAssetId, payload)
      : await assetsService.create(payload);
    setFixedAssetSaving(false);

    if (!res.success) {
      showToast('error', 'Assets', res.error || `Failed to ${editingFixedAssetId ? 'update' : 'create'} fixed asset`);
      return;
    }

    setFixedAssetModalOpen(false);
    resetFixedAssetModal();
    showToast('success', 'Assets', editingFixedAssetId ? 'Fixed asset updated' : 'Fixed asset created');
    if (assetAccountsDisplayed) {
      await loadAssetAccounts();
    }
  };

  const deleteFixedAsset = async () => {
    if (!fixedAssetDeleteTarget) return;
    setFixedAssetDeleting(true);
    const res = await assetsService.delete(fixedAssetDeleteTarget.asset_id);
    setFixedAssetDeleting(false);
    if (!res.success) {
      showToast('error', 'Assets', res.error || 'Failed to delete fixed asset');
      return;
    }
    setFixedAssetDeleteTarget(null);
    showToast('success', 'Assets', 'Fixed asset deleted');
    if (assetAccountsDisplayed) {
      await loadAssetAccounts();
    }
  };

  const resetProfitModal = () => {
    setProfitForm({ closingId: '', ownerName: '', sharePct: '' });
    setNewProfitOwnerName('');
    setProfitPreview(null);
  };

  const openProfitModal = () => {
    if (!profitDisplayed) {
      void loadProfitData();
    }
    resetProfitModal();
    setProfitModalOpen(true);
  };

  const previewOwnerProfit = async (closingId: number, ownerName: string, sharePct?: number) => {
    setProfitPreviewLoading(true);
    const res = await settingsService.previewOwnerProfit({ closingId, ownerName, sharePct });
    setProfitPreviewLoading(false);
    if (!res.success || !res.data?.preview) {
      setProfitPreview(null);
      showToast('error', 'Profit Sharing', res.error || 'Failed to preview owner share');
      return;
    }
    setProfitPreview(res.data.preview);
  };

  const saveOwnerShare = async () => {
    const isNewOwner = profitForm.ownerName === '__new__';
    const ownerName =
      isNewOwner ? newProfitOwnerName.trim() : profitForm.ownerName.trim();
    if (!ownerName) {
      showToast('error', 'Profit Sharing', 'Owner is required');
      return;
    }
    if (isNewOwner && profitForm.sharePct.trim() === '') {
      showToast('error', 'Profit Sharing', 'Enter owner share %');
      return;
    }
    if (!isNewOwner && !profitPreview) {
      showToast('error', 'Profit Sharing', 'Choose period and owner to preview share first');
      return;
    }
    const sharePct =
      !isNewOwner || profitForm.sharePct.trim() === ''
        ? Number(profitPreview?.sharePct || 0)
        : Number(profitForm.sharePct || 0);
    if (!Number.isFinite(sharePct) || sharePct < 0 || sharePct > 100) {
      showToast('error', 'Profit Sharing', 'Share % must be between 0 and 100');
      return;
    }
    const res = await settingsService.saveProfitOwner({ ownerName, sharePct });
    if (!res.success) {
      showToast('error', 'Profit Sharing', res.error || 'Failed to save owner share');
      return;
    }
    showToast('success', 'Profit Sharing', 'Owner share saved');
    await loadProfitData();
  };

  useEffect(() => {
    if (!profitModalOpen) return;
    const closingId = Number(profitForm.closingId || 0);
    const isNewOwner = profitForm.ownerName === '__new__';
    const ownerName =
      isNewOwner ? newProfitOwnerName.trim() : profitForm.ownerName.trim();
    const sharePctText = profitForm.sharePct.trim();
    if (!closingId || !ownerName) {
      setProfitPreview(null);
      return;
    }
    if (!isNewOwner || !sharePctText) {
      void previewOwnerProfit(closingId, ownerName);
      return;
    }
    const sharePct = Number(sharePctText);
    if (!Number.isFinite(sharePct) || sharePct < 0 || sharePct > 100) {
      setProfitPreview(null);
      return;
    }
    void previewOwnerProfit(closingId, ownerName, sharePct);
  }, [profitForm.closingId, profitForm.ownerName, profitForm.sharePct, newProfitOwnerName, profitModalOpen]);

  const companyContent = (
    <div className="bg-white border border-black rounded-xl p-6 space-y-4 text-black">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">Company Info</h3>
        <div className="flex gap-2">
          <button
            onClick={handleDisplayCompany}
            className="px-3 py-2 rounded border border-black bg-white text-black text-sm"
            disabled={companyLoading}
          >
            {companyLoading ? 'Loading...' : 'Display'}
          </button>
          <button
            onClick={handleCompanyEdit}
            className="px-3 py-2 rounded border border-black bg-black text-white text-sm inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> {company ? 'Edit' : 'Add'} Company
          </button>
        </div>
      </div>

      {!companyDisplayed ? (
        <p className="text-sm">Click Display to load company info.</p>
      ) : !company ? (
        <p className="text-sm">No company profile yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left border-b border-black">
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Manager</th>
                <th className="py-2 pr-4">Phone</th>
                <th className="py-2 pr-4">Capital</th>
                <th className="py-2 pr-4">Logo</th>
                <th className="py-2 pr-4">Banner</th>
                <th className="py-2 pr-4">Updated</th>
                <th className="py-2 pr-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-2 pr-4">{company.company_name || '-'}</td>
                <td className="py-2 pr-4">{company.manager_name || '-'}</td>
                <td className="py-2 pr-4">{company.phone || '-'}</td>
                <td className="py-2 pr-4">{formatMoney(Number(company.capital_amount || 0))}</td>
                <td className="py-2 pr-4">
                  {company.logo_img ? (
                    <img
                      src={resolveImageUrl(company.logo_img)}
                      alt="Logo"
                      className="h-10 w-10 rounded object-cover border border-slate-200"
                    />
                  ) : (
                    '-'
                  )}
                </td>
                <td className="py-2 pr-4">
                  {company.banner_img ? (
                    <img
                      src={resolveImageUrl(company.banner_img)}
                      alt="Banner"
                      className="h-10 w-24 rounded object-cover border border-slate-200"
                    />
                  ) : (
                    '-'
                  )}
                </td>
                <td className="py-2 pr-4">{company.updated_at ? new Date(company.updated_at).toLocaleString() : '-'}</td>
                <td className="py-2 pr-4">
                  <div className="flex gap-2">
                    <button onClick={handleCompanyEdit} className="px-2 py-1 rounded border border-black inline-flex items-center gap-1">
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </button>
                    <button
                      onClick={() => setCompanyDeleteConfirmOpen(true)}
                      disabled={companyDeleting}
                      className="px-2 py-1 rounded border border-black inline-flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <Modal isOpen={companyModalOpen} onClose={() => setCompanyModalOpen(false)} title={`${company ? 'Edit' : 'Add'} Company`} size="lg">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="text-sm font-medium flex flex-col gap-1">
            Company Name
            <input className="rounded border border-black px-3 py-2" value={companyForm.company_name} onChange={(e) => setCompanyForm({ ...companyForm, company_name: e.target.value })} />
          </label>
          <label className="text-sm font-medium flex flex-col gap-1">
            Manager Name
            <input className="rounded border border-black px-3 py-2" value={companyForm.manager_name} onChange={(e) => setCompanyForm({ ...companyForm, manager_name: e.target.value })} />
          </label>
          <label className="text-sm font-medium flex flex-col gap-1">
            Phone
            <input className="rounded border border-black px-3 py-2" value={companyForm.phone} onChange={(e) => setCompanyForm({ ...companyForm, phone: e.target.value })} />
          </label>
          <label className="text-sm font-medium flex flex-col gap-1">
            Capital
            <input type="number" min="0" step="0.01" className="rounded border border-black px-3 py-2" value={companyForm.capital_amount} onChange={(e) => setCompanyForm({ ...companyForm, capital_amount: e.target.value })} />
          </label>
          <div className="md:col-span-2">
            <ImageUpload
              label="Company Logo"
              currentImage={companyForm.logo_img || null}
              aspectRatio="square"
              maxWidthClass="max-w-full"
              centered={false}
              variant="inline"
              onUpload={handleLogoUpload}
              onDelete={allowRemoteImageUpload ? handleLogoDelete : undefined}
            />
          </div>
          <div className="md:col-span-2">
            <ImageUpload
              label="Company Banner"
              currentImage={companyForm.banner_img || null}
              aspectRatio="landscape"
              maxWidthClass="max-w-full"
              centered={false}
              variant="inline"
              onUpload={handleBannerUpload}
              onDelete={allowRemoteImageUpload ? handleBannerDelete : undefined}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-4">
          <button className="px-4 py-2 rounded border border-black" onClick={() => setCompanyModalOpen(false)}>Cancel</button>
          <button className="px-4 py-2 rounded border border-black bg-black text-white" onClick={handleCompanySave} disabled={companySaving}>
            {companySaving ? 'Saving...' : company ? 'Update' : 'Save'}
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={companyDeleteConfirmOpen}
        onClose={() => setCompanyDeleteConfirmOpen(false)}
        onConfirm={handleCompanyDelete}
        title="Delete Company Profile?"
        highlightedName={company?.company_name || undefined}
        message="This action will permanently remove company profile data."
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        isLoading={companyDeleting}
      />
    </div>
  );

  const currentAssetRows = assetOverview?.current_assets || [];
  const fixedAssetRows = assetOverview?.fixed_assets || [];

  const assetsContent = (
    <div className="space-y-4 text-black">
      <div className="bg-white border border-black rounded-xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold">Asset Accounts</h3>
            <p className="text-sm text-zinc-600">Display current asset balances and fixed asset costs.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void loadAssetAccounts()}
              className="px-3 py-2 rounded border border-black bg-white text-black text-sm"
              disabled={assetAccountsLoading}
            >
              {assetAccountsLoading ? 'Loading...' : 'Display'}
            </button>
            <button
              onClick={() => void createDefaultAssetAccounts()}
              className="px-3 py-2 rounded border border-black bg-black text-white text-sm"
              disabled={assetAccountsCreating}
            >
              {assetAccountsCreating ? 'Creating...' : 'Prepare Accounts'}
            </button>
            <button
              onClick={openCreateFixedAssetModal}
              className="px-3 py-2 rounded border border-black bg-black text-white text-sm"
            >
              New Fixed Asset
            </button>
          </div>
        </div>

        {!assetAccountsDisplayed ? (
          <p className="text-sm mt-3">Click Display to load current and fixed assets.</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-sm mt-3">
            <div className="rounded border border-black p-3">
              <div className="font-semibold mb-2">Current Assets Accounts</div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-black text-left">
                      <th className="py-2 pr-3">Account</th>
                      <th className="py-2 pr-3">Institution</th>
                      <th className="py-2 pr-0 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentAssetRows.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="py-3 text-zinc-600">No current asset accounts found.</td>
                      </tr>
                    ) : (
                      currentAssetRows.map((row, idx) => (
                        <tr key={`${row.account_name}-${idx}`} className="border-b border-zinc-200">
                          <td className="py-2 pr-3">{row.account_name}</td>
                          <td className="py-2 pr-3">{row.institution || '-'}</td>
                          <td className="py-2 pr-0 text-right">{formatMoney(row.balance)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={2} className="pt-3 font-semibold">Total</td>
                      <td className="pt-3 text-right font-semibold">{formatMoney(assetOverview?.current_assets_total || 0)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <div className="rounded border border-black p-3">
              <div className="font-semibold mb-2">Fixed Assets</div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-black text-left">
                      <th className="py-2 pr-3">Asset</th>
                      <th className="py-2 pr-3">Purchase Date</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2 pr-0 text-right">Cost</th>
                      <th className="py-2 pl-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fixedAssetRows.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-3 text-zinc-600">No fixed assets found.</td>
                      </tr>
                    ) : (
                      fixedAssetRows.map((row) => (
                        <tr key={row.asset_id} className="border-b border-zinc-200">
                          <td className="py-2 pr-3">{row.asset_name}</td>
                          <td className="py-2 pr-3">{row.purchase_date}</td>
                          <td className="py-2 pr-3 capitalize">{row.status || 'active'}</td>
                          <td className="py-2 pr-0 text-right">{formatMoney(row.cost)}</td>
                          <td className="py-2 pl-3">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => openEditFixedAssetModal(row)}
                                className="p-1.5 rounded border border-zinc-400 text-zinc-700 hover:bg-zinc-100"
                                title="Edit fixed asset"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setFixedAssetDeleteTarget({ asset_id: row.asset_id, asset_name: row.asset_name })}
                                className="p-1.5 rounded border border-red-300 text-red-600 hover:bg-red-50"
                                title="Delete fixed asset"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={4} className="pt-3 font-semibold">Total</td>
                      <td className="pt-3 text-right font-semibold">{formatMoney(assetOverview?.fixed_assets_total || 0)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      <Modal
        isOpen={fixedAssetModalOpen}
        onClose={() => {
          setFixedAssetModalOpen(false);
          resetFixedAssetModal();
        }}
        title={editingFixedAssetId ? 'Edit Fixed Asset' : 'New Fixed Asset'}
        size="lg"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="text-sm font-medium flex flex-col gap-1">
            Asset Name *
            <input
              className="rounded border border-black px-3 py-2"
              value={fixedAssetForm.assetName}
              onChange={(e) => setFixedAssetForm((prev) => ({ ...prev, assetName: e.target.value }))}
            />
          </label>
          <label className="text-sm font-medium flex flex-col gap-1">
            Purchase Date *
            <input
              type="date"
              className="rounded border border-black px-3 py-2"
              value={fixedAssetForm.purchaseDate}
              onChange={(e) => setFixedAssetForm((prev) => ({ ...prev, purchaseDate: e.target.value }))}
            />
          </label>
          <label className="text-sm font-medium flex flex-col gap-1">
            Cost *
            <input
              type="number"
              min="0"
              step="0.01"
              className="rounded border border-black px-3 py-2"
              value={fixedAssetForm.cost}
              onChange={(e) => setFixedAssetForm((prev) => ({ ...prev, cost: e.target.value }))}
            />
          </label>
          <label className="text-sm font-medium flex flex-col gap-1">
            Status *
            <select
              className="rounded border border-black px-3 py-2"
              value={fixedAssetForm.status}
              onChange={(e) => setFixedAssetForm((prev) => ({ ...prev, status: e.target.value }))}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="disposed">Disposed</option>
            </select>
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-4">
          <button
            className="px-4 py-2 rounded border border-black"
            onClick={() => {
              setFixedAssetModalOpen(false);
              resetFixedAssetModal();
            }}
          >
            Cancel
          </button>
          <button
            className="px-4 py-2 rounded border border-black bg-black text-white"
            onClick={() => void saveFixedAsset()}
            disabled={fixedAssetSaving}
          >
            {fixedAssetSaving ? 'Saving...' : editingFixedAssetId ? 'Update' : 'Create'}
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!fixedAssetDeleteTarget}
        onClose={() => setFixedAssetDeleteTarget(null)}
        onConfirm={deleteFixedAsset}
        title="Delete Fixed Asset?"
        highlightedName={fixedAssetDeleteTarget?.asset_name}
        message="This action permanently removes the fixed asset."
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        isLoading={fixedAssetDeleting}
      />
    </div>
  );

  const capitalContent = (
    <div className="space-y-4 text-black">
      <div className="bg-white border border-black rounded-xl p-4">
        <div className="flex flex-wrap items-end gap-2 justify-between">
          <div className="flex items-end gap-2">
            <label className="text-sm font-medium flex flex-col gap-1">
              Search
              <input
                value={capitalSearch}
                onChange={(e) => setCapitalSearch(e.target.value)}
                placeholder="Owner / note"
                className="rounded border border-black px-3 py-2 w-64"
              />
            </label>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => void loadCapital(1)}
              className="px-3 py-2 rounded border border-black bg-white text-black text-sm"
              disabled={capitalLoading}
            >
              {capitalLoading ? 'Loading...' : 'Display Capital'}
            </button>
            <button
              onClick={() => void loadDrawings(1)}
              className="px-3 py-2 rounded border border-black bg-white text-black text-sm"
              disabled={drawingLoading}
            >
              {drawingLoading ? 'Loading...' : 'Display Drawing'}
            </button>
            <button onClick={openCreateCapital} className="px-3 py-2 rounded border border-black bg-black text-white text-sm inline-flex items-center gap-2">
              <Plus className="w-4 h-4" /> Add Capital
            </button>
            <button
              onClick={() => void openDrawingModal()}
              className="px-3 py-2 rounded border border-black bg-black text-white text-sm inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Owner Drawing
            </button>
          </div>
        </div>
      </div>

      {!capitalDisplayed && !drawingDisplayed && (
        <div className="bg-white border border-black rounded-xl p-4">
          <p className="text-sm">Click Display Capital or Display Drawing to load one table at a time.</p>
        </div>
      )}

      {capitalDisplayed && (
        <div className="bg-white border border-black rounded-xl p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold">Owner Equity Summary</h3>
            <div className="text-xs text-zinc-600">Profit allocations are included from closed periods</div>
          </div>
          {capitalOwnerRows.length === 0 ? (
            <p className="text-sm mt-3">No owner equity found.</p>
          ) : (
            <div className="overflow-x-auto mt-3">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-black">
                    <th className="py-2 pr-4">Owner</th>
                    <th className="py-2 pr-4">Share %</th>
                    <th className="py-2 pr-4 text-right">Capital</th>
                    <th className="py-2 pr-4 text-right">Profit</th>
                    <th className="py-2 pr-4 text-right">Drawing</th>
                    <th className="py-2 pr-0 text-right">Available Equity</th>
                  </tr>
                </thead>
                <tbody>
                  {capitalOwnerRows.map((row) => (
                    <tr key={row.owner_name} className="border-b border-zinc-200">
                      <td className="py-2 pr-4">{row.owner_name}</td>
                      <td className="py-2 pr-4">{Number(row.share_pct || 0).toFixed(2)}%</td>
                      <td className="py-2 pr-4 text-right">{formatMoney(row.contributed_amount)}</td>
                      <td className="py-2 pr-4 text-right">{formatMoney(row.profit_allocated)}</td>
                      <td className="py-2 pr-4 text-right">{formatMoney(row.drawing_amount)}</td>
                      <td className="py-2 pr-0 text-right font-semibold">{formatMoney(row.equity_balance)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="pt-3 pr-4 font-semibold">Total</td>
                    <td className="pt-3 pr-4">-</td>
                    <td className="pt-3 pr-4 text-right font-semibold">{formatMoney(capitalTotals.contributed_amount)}</td>
                    <td className="pt-3 pr-4 text-right font-semibold">{formatMoney(capitalTotals.profit_allocated)}</td>
                    <td className="pt-3 pr-4 text-right font-semibold">{formatMoney(capitalTotals.drawing_amount)}</td>
                    <td className="pt-3 pr-0 text-right font-semibold">{formatMoney(capitalTotals.equity_balance)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {capitalDisplayed && (
        <div className="bg-white border border-black rounded-xl p-4">
          <h3 className="text-base font-semibold">Capital Contributions</h3>
          {capitalRows.length === 0 ? (
            <p className="text-sm mt-3">No capital records found.</p>
          ) : (
            <div className="overflow-x-auto mt-3">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-black">
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Owner</th>
                    <th className="py-2 pr-4">Amount</th>
                    <th className="py-2 pr-4">Share %</th>
                    <th className="py-2 pr-4">Note</th>
                    <th className="py-2 pr-4">Created By</th>
                    <th className="py-2 pr-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {capitalRows.map((row) => (
                    <tr key={row.capital_id} className="border-b border-zinc-200">
                      <td className="py-2 pr-4">{row.date}</td>
                      <td className="py-2 pr-4">{row.owner_name}</td>
                      <td className="py-2 pr-4">{formatMoney(row.amount)}</td>
                      <td className="py-2 pr-4">{Number(row.share_pct || 0).toFixed(2)}%</td>
                      <td className="py-2 pr-4">{row.note || '-'}</td>
                      <td className="py-2 pr-4">{row.created_by_name || '-'}</td>
                      <td className="py-2 pr-4">
                        <div className="flex gap-2">
                          <button onClick={() => openEditCapital(row)} className="px-2 py-1 rounded border border-black inline-flex items-center gap-1">
                            <Pencil className="w-3.5 h-3.5" /> Edit
                          </button>
                          <button onClick={() => setCapitalDeleteId(row.capital_id)} className="px-2 py-1 rounded border border-black inline-flex items-center gap-1">
                            <Trash2 className="w-3.5 h-3.5" /> Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-3 flex items-center justify-between text-sm">
            <span>Page {capitalPage} of {totalCapitalPages}</span>
            <div className="flex gap-2">
              <button
                className="px-3 py-1 rounded border border-black disabled:opacity-50"
                disabled={capitalPage <= 1 || capitalLoading}
                onClick={() => void loadCapital(Math.max(1, capitalPage - 1))}
              >
                Prev
              </button>
              <button
                className="px-3 py-1 rounded border border-black disabled:opacity-50"
                disabled={capitalPage >= totalCapitalPages || capitalLoading}
                onClick={() => void loadCapital(Math.min(totalCapitalPages, capitalPage + 1))}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {drawingDisplayed && (
        <div className="bg-white border border-black rounded-xl p-4">
          <h3 className="text-base font-semibold">Owner Drawings</h3>
          {drawingRows.length === 0 ? (
            <p className="text-sm mt-3">No drawing records found.</p>
          ) : (
            <div className="overflow-x-auto mt-3">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-black">
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Owner</th>
                    <th className="py-2 pr-4">Amount</th>
                    <th className="py-2 pr-4">Paid From</th>
                    <th className="py-2 pr-4">Note</th>
                    <th className="py-2 pr-4">Created By</th>
                    <th className="py-2 pr-0">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {drawingRows.map((row) => (
                    <tr key={row.draw_id} className="border-b border-zinc-200">
                      <td className="py-2 pr-4">{row.date}</td>
                      <td className="py-2 pr-4">{row.owner_name}</td>
                      <td className="py-2 pr-4">{formatMoney(row.amount)}</td>
                      <td className="py-2 pr-4">{row.account_name}</td>
                      <td className="py-2 pr-4">{row.note || '-'}</td>
                      <td className="py-2 pr-4">{row.created_by_name || '-'}</td>
                      <td className="py-2 pr-0">
                        <div className="flex gap-2">
                          <button onClick={() => void openEditDrawing(row)} className="px-2 py-1 rounded border border-black inline-flex items-center gap-1">
                            <Pencil className="w-3.5 h-3.5" /> Edit
                          </button>
                          <button onClick={() => setDrawingDeleteId(row.draw_id)} className="px-2 py-1 rounded border border-black inline-flex items-center gap-1">
                            <Trash2 className="w-3.5 h-3.5" /> Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-3 flex items-center justify-between text-sm">
            <span>Page {drawingPage} of {totalDrawingPages}</span>
            <div className="flex gap-2">
              <button
                className="px-3 py-1 rounded border border-black disabled:opacity-50"
                disabled={drawingPage <= 1 || drawingLoading}
                onClick={() => void loadDrawings(Math.max(1, drawingPage - 1))}
              >
                Prev
              </button>
              <button
                className="px-3 py-1 rounded border border-black disabled:opacity-50"
                disabled={drawingPage >= totalDrawingPages || drawingLoading}
                onClick={() => void loadDrawings(Math.min(totalDrawingPages, drawingPage + 1))}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      <Modal isOpen={capitalModalOpen} onClose={() => setCapitalModalOpen(false)} title={editingCapital ? 'Edit Capital' : 'Add Capital'} size="lg">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className={modalLabelClass}>
            Owner Name *
            <input
              className={modalInputClass}
              placeholder="e.g. Ahmed Ali"
              value={capitalForm.ownerName}
              onChange={(e) => setCapitalForm({ ...capitalForm, ownerName: e.target.value })}
            />
          </label>
          <label className={modalLabelClass}>
            Amount *
            <input
              type="number"
              min="0"
              step="0.01"
              className={modalInputClass}
              placeholder="0.00"
              value={capitalForm.amount}
              onChange={(e) => setCapitalForm({ ...capitalForm, amount: e.target.value })}
            />
          </label>
          <label className={modalLabelClass}>
            Date *
            <input
              type="date"
              className={modalInputClass}
              value={capitalForm.date}
              onChange={(e) => setCapitalForm({ ...capitalForm, date: e.target.value })}
            />
          </label>
          <label className={modalLabelClass}>
            Share % *
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              className={modalInputClass}
              placeholder="e.g. 50"
              value={capitalForm.sharePct}
              onChange={(e) => setCapitalForm({ ...capitalForm, sharePct: e.target.value })}
            />
          </label>
          <label className={`${modalLabelClass} md:col-span-2`}>
            Note
            <textarea
              className={modalTextareaClass}
              placeholder="Optional note about this capital entry..."
              rows={3}
              value={capitalForm.note}
              onChange={(e) => setCapitalForm({ ...capitalForm, note: e.target.value })}
            />
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-4">
          <button className={modalBtnSecondaryClass} onClick={() => setCapitalModalOpen(false)}>
            Cancel
          </button>
          <button className={modalBtnPrimaryClass} onClick={submitCapital} disabled={capitalSaving}>
            {capitalSaving ? 'Saving...' : editingCapital ? 'Update' : 'Create'}
          </button>
        </div>
      </Modal>

      <Modal
        isOpen={drawingModalOpen}
        onClose={closeDrawingModal}
        title={editingDrawing ? 'Edit Owner Drawing' : 'Owner Drawing'}
        size="md"
      >
        <div className="space-y-4">
          <label className={modalLabelClass}>
            Owner *
            <select
              className={modalInputClass}
              value={drawingForm.ownerName}
              onChange={(e) => setDrawingForm((prev) => ({ ...prev, ownerName: e.target.value }))}
            >
              <option value="">Select owner</option>
              {ownerOptions.map((ownerName) => (
                <option key={ownerName} value={ownerName}>
                  {ownerName}
                </option>
              ))}
            </select>
          </label>

          <label className={modalLabelClass}>
            Available Equity (Auto)
            <input
              readOnly
              className={modalReadOnlyInputClass}
              value={formatMoney(selectedOwnerAvailable)}
            />
          </label>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className={modalLabelClass}>
              Amount *
              <input
                type="number"
                min="0"
                step="0.01"
                className={modalInputClass}
                placeholder="0.00"
                value={drawingForm.amount}
                onChange={(e) => setDrawingForm((prev) => ({ ...prev, amount: e.target.value }))}
              />
            </label>
            <label className={modalLabelClass}>
              Date *
              <input
                type="date"
                className={modalInputClass}
                value={drawingForm.date}
                onChange={(e) => setDrawingForm((prev) => ({ ...prev, date: e.target.value }))}
              />
            </label>
          </div>

          <label className={modalLabelClass}>
            Note
            <textarea
              rows={3}
              className={modalTextareaClass}
              placeholder="Optional note..."
              value={drawingForm.note}
              onChange={(e) => setDrawingForm((prev) => ({ ...prev, note: e.target.value }))}
            />
          </label>

          <div className="flex justify-end gap-2">
            <button className={modalBtnSecondaryClass} onClick={closeDrawingModal}>
              Cancel
            </button>
            <button
              className={modalBtnPrimaryClass}
              onClick={() => void submitOwnerDrawing()}
              disabled={drawingSaving}
            >
              {drawingSaving ? 'Saving...' : editingDrawing ? 'Update Drawing' : 'Create Drawing'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={capitalDeleteId !== null}
        onClose={() => setCapitalDeleteId(null)}
        onConfirm={confirmDeleteCapital}
        title="Delete Capital Entry?"
        message="This will reverse and remove linked accounting records."
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        isLoading={capitalDeleteLoading}
      />

      <ConfirmDialog
        isOpen={drawingDeleteId !== null}
        onClose={() => setDrawingDeleteId(null)}
        onConfirm={confirmDeleteDrawing}
        title="Delete Drawing Entry?"
        message="This will refund the amount back to capital and remove linked accounting records."
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        isLoading={drawingDeleteLoading}
      />
    </div>
  );

  const closingContent = (
    <div className="space-y-4 text-black">
      <div className="bg-white border border-black rounded-xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold">Closing Financial</h3>
            <p className="text-sm text-zinc-600">Use Display to load periods. Add New uses only From Date and To Date.</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => void loadClosing()}
              className="px-3 py-2 rounded border border-black bg-white text-black text-sm"
              disabled={closingLoading}
            >
              {closingLoading ? 'Loading...' : 'Display'}
            </button>
            <button
              onClick={openNewClosingModal}
              className="px-3 py-2 rounded border border-black bg-black text-white text-sm inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Add New
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white border border-black rounded-xl p-4">
        {!closingDisplayed ? (
          <p className="text-sm">Click Display to load closing periods.</p>
        ) : closingRows.length === 0 ? (
          <p className="text-sm">No closing periods found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left border-b border-black">
                  <th className="py-2 pr-4">From</th>
                  <th className="py-2 pr-4">To</th>
                  <th className="py-2 pr-4">Mode</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Net Income</th>
                  <th className="py-2 pr-4">Action</th>
                </tr>
              </thead>
              <tbody>
                {closingRows.map((row) => {
                  const netIncome = Number(row.summary_json?.netIncome || 0);
                  return (
                    <tr key={row.closing_id} className="border-b border-zinc-200">
                      <td className="py-2 pr-4">{formatDateOnly(row.period_from)}</td>
                      <td className="py-2 pr-4">{formatDateOnly(row.period_to)}</td>
                      <td className="py-2 pr-4 capitalize">{row.close_mode}</td>
                      <td className="py-2 pr-4 capitalize">{row.status}</td>
                      <td className="py-2 pr-4">{formatMoney(netIncome)}</td>
                      <td className="py-2 pr-4">
                        <div className="flex gap-2">
                          <button
                            onClick={() => openEditClosingModal(row)}
                            className="px-2 py-1 rounded border border-black text-xs"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => void openClosingSummary(row.closing_id)}
                            className="px-2 py-1 rounded border border-black text-xs"
                          >
                            Summary
                          </button>
                          {row.status !== 'closed' && (
                            <button
                              onClick={() => setClosingFinalizeTarget(row)}
                              className="px-2 py-1 rounded border border-black bg-black text-white text-xs"
                            >
                              Finalize Close
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        isOpen={closingModalOpen}
        onClose={() => {
          setClosingModalOpen(false);
          setClosingEditingRow(null);
        }}
        title={closingEditingRow ? 'Edit Closing Period' : 'Add Closing Period'}
        size="md"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="text-sm font-medium flex flex-col gap-1 md:col-span-2">
              Closing Mode
              <select
                className="rounded border border-black px-3 py-2"
                value={closingForm.closeMode}
                onChange={(e) => setClosingForm({ ...closingForm, closeMode: e.target.value as any })}
              >
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
                <option value="quarterly">Quarterly</option>
              </select>
            </label>
            <label className="text-sm font-medium flex flex-col gap-1">
              From Date *
              <input
                type="date"
                className="rounded border border-black px-3 py-2"
                value={closingForm.periodFrom}
                onChange={(e) => setClosingForm({ ...closingForm, periodFrom: e.target.value })}
              />
            </label>
            <label className="text-sm font-medium flex flex-col gap-1">
              To Date *
              <input
                type="date"
                className="rounded border border-black px-3 py-2"
                value={closingForm.periodTo}
                onChange={(e) => setClosingForm({ ...closingForm, periodTo: e.target.value })}
              />
            </label>
            <label className="text-sm font-medium flex flex-col gap-1 md:col-span-2">
              Note
              <textarea
                rows={3}
                className="rounded border border-black px-3 py-2"
                value={closingForm.note}
                onChange={(e) => setClosingForm({ ...closingForm, note: e.target.value })}
              />
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              className="px-4 py-2 rounded border border-black"
              onClick={() => {
                setClosingModalOpen(false);
                setClosingEditingRow(null);
              }}
            >
              Cancel
            </button>
            <button className="px-4 py-2 rounded border border-black bg-black text-white" onClick={() => void createClosingPeriod()} disabled={closingSaving}>
              {closingSaving ? 'Saving...' : closingEditingRow ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={closingSummaryOpen} onClose={() => setClosingSummaryOpen(false)} title="Closing Summary" size="lg">
        {closingSummaryLoading ? (
          <p className="text-sm">Loading summary...</p>
        ) : !closingSummary ? (
          <p className="text-sm">No summary available.</p>
        ) : (
          <div className="space-y-4 text-sm">
            <div className="font-semibold">
              Period: {formatDateOnly(closingSummary.period.period_from)} to {formatDateOnly(closingSummary.period.period_to)}
            </div>
            {!closingSummary.summary ? (
              <p>No calculated figures available.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div className="rounded border border-black p-2">Sales Revenue: {formatMoney(Number(closingSummary.summary.salesRevenue || 0))}</div>
                <div className="rounded border border-black p-2">Sales Returns: {formatMoney(Number(closingSummary.summary.salesReturns || 0))}</div>
                <div className="rounded border border-black p-2">COGS: {formatMoney(Number(closingSummary.summary.cogs || 0))}</div>
                <div className="rounded border border-black p-2">Expenses: {formatMoney(Number(closingSummary.summary.expenseCharges || 0))}</div>
                <div className="rounded border border-black p-2">Payroll: {formatMoney(Number(closingSummary.summary.payrollExpense || 0))}</div>
                <div className="rounded border border-black p-2 font-semibold">Net Income: {formatMoney(Number(closingSummary.summary.netIncome || 0))}</div>
              </div>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(closingFinalizeTarget)}
        onClose={() => setClosingFinalizeTarget(null)}
        onConfirm={finalizeClosingPeriod}
        title="Finalize Closing Period?"
        highlightedName={
          closingFinalizeTarget
            ? `${formatDateOnly(closingFinalizeTarget.period_from)} to ${formatDateOnly(closingFinalizeTarget.period_to)}`
            : undefined
        }
        message="This will lock transactions inside the selected period and finalize net income."
        confirmText="Finalize"
        cancelText="Cancel"
        variant="warning"
        isLoading={closingFinalizing}
      />
    </div>
  );

  const profitContent = (
    <div className="space-y-4 text-black">
      <div className="bg-white border border-black rounded-xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold">Profit Sharing</h3>
            <p className="text-sm text-zinc-600">Select owner + closed period and view automatic net income share.</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => void loadProfitData()}
              className="px-3 py-2 rounded border border-black bg-white text-black text-sm"
              disabled={profitLoading}
            >
              {profitLoading ? 'Loading...' : 'Display'}
            </button>
            <button
              onClick={openProfitModal}
              className="px-3 py-2 rounded border border-black bg-black text-white text-sm inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Add New
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white border border-black rounded-xl p-4">
        {!profitDisplayed ? (
          <p className="text-sm">Click Display to load owners and closed periods.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div className="rounded border border-black p-3">
              <div className="font-semibold">Available Owners</div>
              <div>{profitOwners.length}</div>
            </div>
            <div className="rounded border border-black p-3">
              <div className="font-semibold">Closed Periods</div>
              <div>{profitPeriods.length}</div>
            </div>
          </div>
        )}
      </div>

      <Modal isOpen={profitModalOpen} onClose={() => setProfitModalOpen(false)} title="Owner Profit Preview" size="md">
        <div className="space-y-4">
          <label className="text-sm font-medium flex flex-col gap-1">
            Closing Period *
            <select
              className="rounded border border-black px-3 py-2"
              value={profitForm.closingId}
              onChange={(e) => setProfitForm((prev) => ({ ...prev, closingId: e.target.value }))}
            >
              <option value="">Select period</option>
              {profitPeriods.map((period) => (
                <option key={period.closing_id} value={period.closing_id}>
                  {formatDateOnly(period.period_from)} to {formatDateOnly(period.period_to)}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium flex flex-col gap-1">
            Owner *
            <select
              className="rounded border border-black px-3 py-2"
              value={profitForm.ownerName}
              onChange={(e) =>
                setProfitForm((prev) => ({
                  ...prev,
                  ownerName: e.target.value,
                  sharePct: e.target.value === '__new__' ? prev.sharePct : '',
                }))
              }
            >
              <option value="">Select owner</option>
              {profitOwners.map((owner) => (
                <option key={owner} value={owner}>
                  {owner}
                </option>
              ))}
              <option value="__new__">+ Add New Owner</option>
            </select>
          </label>

          {profitForm.ownerName === '__new__' && (
            <label className="text-sm font-medium flex flex-col gap-1">
              New Owner Name *
              <input
                type="text"
                placeholder="Enter new owner name"
                className="rounded border border-black px-3 py-2"
                value={newProfitOwnerName}
                onChange={(e) => setNewProfitOwnerName(e.target.value)}
              />
            </label>
          )}

          {profitForm.ownerName === '__new__' && (
            <label className="text-sm font-medium flex flex-col gap-1">
              Share % *
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                className="rounded border border-black px-3 py-2"
                value={profitForm.sharePct}
                onChange={(e) => setProfitForm((prev) => ({ ...prev, sharePct: e.target.value }))}
              />
            </label>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-sm font-medium flex flex-col gap-1">
              Net Income (Auto)
              <input
                type="text"
                readOnly
                className="rounded border border-black bg-zinc-100 px-3 py-2"
                value={formatMoney(profitPreview?.netIncome || 0)}
              />
            </label>
            <label className="text-sm font-medium flex flex-col gap-1">
              Owner Share Amount (Auto)
              <input
                type="text"
                readOnly
                className="rounded border border-black bg-zinc-100 px-3 py-2"
                value={formatMoney(profitPreview?.shareAmount || 0)}
              />
            </label>
          </div>

          {profitPreviewLoading ? (
            <p className="text-sm">Calculating share...</p>
          ) : !profitPreview ? (
            <p className="text-sm text-zinc-600">Choose period and owner to preview share.</p>
          ) : (
            <div className="space-y-2 text-sm">
              <div className="rounded border border-black p-2">Net Income: {formatMoney(profitPreview.netIncome)}</div>
              {profitForm.ownerName === '__new__' && (
                <div className="rounded border border-black p-2">Owner Share %: {profitPreview.sharePct.toFixed(2)}%</div>
              )}
              <div className="rounded border border-black p-2 font-semibold">Owner Share Amount: {formatMoney(profitPreview.shareAmount)}</div>
              <div className="rounded border border-black p-2">
                Source: {profitPreview.source === 'allocation' ? 'Closed allocation' : profitPreview.source === 'rule' ? 'Profit rule' : profitPreview.source === 'input' ? 'Input share %' : 'No owner rule'}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button className="px-4 py-2 rounded border border-black bg-black text-white" onClick={() => void saveOwnerShare()}>
              Save Owner Share
            </button>
            <button className="px-4 py-2 rounded border border-black" onClick={() => setProfitModalOpen(false)}>Close</button>
          </div>
        </div>
      </Modal>
    </div>
  );

  const logsContent = (
    <div className="space-y-4 text-black">
      <div className="bg-white border border-black rounded-xl p-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Start Date
              <input
                type="date"
                value={logsStartDate}
                onChange={(e) => {
                  setLogsStartDate(e.target.value);
                  setLogsDisplayed(false);
                  setLogs([]);
                  setLogsPage(1);
                  setLogsTotal(0);
                }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              End Date
              <input
                type="date"
                value={logsEndDate}
                onChange={(e) => {
                  setLogsEndDate(e.target.value);
                  setLogsDisplayed(false);
                  setLogs([]);
                  setLogsPage(1);
                  setLogsTotal(0);
                }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
              />
            </label>
            <button
              onClick={() => loadLogs(1)}
              className="px-3 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm hover:bg-slate-50"
              disabled={logsLoading}
            >
              {logsLoading ? 'Loading...' : 'Display'}
            </button>
          </div>
        </div>
      </div>

      {!logsDisplayed ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">
          Choose <span className="font-semibold">Start Date</span> and <span className="font-semibold">End Date</span>,
          then click <span className="font-semibold">Display</span>.
        </div>
      ) : logs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">
          No activity logs found for selected date range.
        </div>
      ) : (
        <div className="overflow-x-auto bg-white rounded-xl border border-slate-200 p-4">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th>Action</th>
                <th>Entity</th>
                <th>User</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.audit_id} className="border-t border-slate-200 text-slate-700">
                  <td>{l.action}</td>
                  <td>{l.entity || '-'}</td>
                  <td>{l.username || l.user_id || '-'}</td>
                  <td>{new Date(l.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex justify-between text-sm text-slate-600">
        <span>Page {logsPage} of {Math.max(1, Math.ceil(logsTotal / LOGS_LIMIT))}</span>
        <div className="space-x-2">
          <button
            onClick={() => loadLogs(Math.max(1, logsPage - 1))}
            disabled={!logsDisplayed || logsLoading || logsPage <= 1}
            className="px-3 py-1 border border-slate-300 rounded text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Prev
          </button>
          <button
            onClick={() => loadLogs(logsPage + 1)}
            disabled={!logsDisplayed || logsLoading || logsPage * LOGS_LIMIT >= logsTotal}
            className="px-3 py-1 border border-slate-300 rounded text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );

  const tabs = useMemo(() => {
    const canManageAssets = permissions.includes('accounts.view') || permissions.includes('reports.all');
    const canViewLogs =
      permissions.includes('system.audit.view') ||
      permissions.includes('audit_logs.view') ||
      permissions.includes('system.settings');
    const result = [
      { id: 'company', label: 'Company Info', icon: Home, content: companyContent },
      { id: 'capital', label: 'Capital', icon: CircleDollarSign, content: capitalContent },
      { id: 'closing-period', label: 'Closing Period', icon: CircleDollarSign, content: closingContent },
      { id: 'profit-sharing', label: 'Profit Sharing', icon: Percent, content: profitContent },
    ];
    if (canManageAssets) {
      result.splice(2, 0, { id: 'assets', label: 'Assets', icon: BriefcaseBusiness, content: assetsContent });
    }
    if (canViewLogs) {
      result.push({ id: 'activity-logs', label: 'Activity Logs', icon: History, content: logsContent });
    }
    return result;
  }, [
    permissions,
    companyContent,
    assetsContent,
    capitalContent,
    closingContent,
    profitContent,
    logsContent,
  ]);

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Configure company info, assets, capital, closing period, and profit sharing."
      />
      <Tabs tabs={tabs} defaultTab="company" />
    </div>
  );
};

export default Settings;
