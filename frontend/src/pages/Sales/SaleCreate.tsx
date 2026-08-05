import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { ArrowLeft, Plus, Trash2, AlertCircle } from 'lucide-react';
import { PageHeader } from '../../components/ui/layout';
import { useToast } from '../../components/ui/toast/Toast';
import { accountService, Account } from '../../services/account.service';
import { customerService, Customer } from '../../services/customer.service';
import { inventoryService, InventoryItem } from '../../services/inventory.service';
import { SaleDocType, SaleStatus, salesService } from '../../services/sales.service';
import { formatAvailableQty, itemLabelWithAvailability } from '../../utils/itemAvailability';
import { SearchableCombobox } from '../../components/ui/combobox/SearchableCombobox';
import { useBranch } from '../../context/BranchContext';

type FormLine = {
  item_id: number | '';
  quantity: number;
  unit_price: number;
  available_qty?: number;
};

type FormErrors = {
  customer?: string;
  quoteValidUntil?: string;
  items?: string;
  account?: string;
  paidAmount?: string;
  stock?: string;
};

const todayString = () => new Date().toISOString().slice(0, 10);

// Sales tax is a fixed policy rate, not something a cashier should be able to change
// per-sale - shown as read-only text on the form instead of an editable field.
const FIXED_TAX_RATE_PERCENT = 5;

const parseDocType = (value: string | null): SaleDocType => {
  if (value === 'invoice' || value === 'quotation' || value === 'sale') return value;
  return 'sale';
};

type SaleItemOption = {
  item_id: number;
  item_name: string;
  unit_price: number;
  available_qty?: number;
};

const SaleCreate = () => {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const { activeBranchId } = useBranch();
  const { id } = useParams<{ id: string }>();
  const editId = Number(id || 0) || null;
  const isEditing = Boolean(editId);

  const docTypeFromQuery = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return parseDocType(params.get('docType'));
  }, [location.search]);

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [itemOptions, setItemOptions] = useState<SaleItemOption[]>([]);
  const [isDebt, setIsDebt] = useState(false);
  const [formErrors, setFormErrors] = useState<FormErrors>({});

  // ── CSS helpers ───────────────────────────────────────────────────────────
  const baseCls =
    'h-12 w-full rounded-lg border bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition-all focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-900 dark:text-slate-100';
  const okBorder = 'border-slate-300 dark:border-slate-700 focus:border-primary-500 focus:ring-primary-500/20';
  const errBorder = 'border-red-400 dark:border-red-500 focus:border-red-500 focus:ring-red-500/20';

  const controlCls = `${baseCls} ${okBorder}`;
  const controlReadonlyCls =
    'h-12 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 text-sm text-slate-700 shadow-sm outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200';
  const textareaCls =
    'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition-all focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

  const fieldCls = (field: keyof FormErrors) =>
    `${baseCls} ${formErrors[field] ? errBorder : okBorder}`;

  const clearError = (field: keyof FormErrors) =>
    setFormErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });

  const FieldError = ({ field }: { field: keyof FormErrors }) =>
    formErrors[field] ? (
      <p className="mt-1 flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
        <AlertCircle className="h-3 w-3 shrink-0" />
        {formErrors[field]}
      </p>
    ) : null;

  // ── Form state ────────────────────────────────────────────────────────────
  const [saleForm, setSaleForm] = useState({
    customer_id: '' as number | '',
    doc_type: docTypeFromQuery as SaleDocType,
    sale_type: 'cash' as 'cash' | 'credit',
    status: (docTypeFromQuery === 'quotation' ? 'unpaid' : 'paid') as SaleStatus,
    sale_date: todayString(),
    quote_valid_until: '',
    subtotal: 0,
    discount: 0,
    tax_rate: FIXED_TAX_RATE_PERCENT,
    apply_tax: true,
    tax_amount: 0,
    total: 0,
    acc_id: '' as number | '',
    paid_amount: 0,
    note: '',
    items: [{ item_id: '' as number | '', quantity: 1, unit_price: 0 }] as FormLine[],
  });

  useEffect(() => {
    if (!isEditing) {
      setSaleForm((prev) => ({
        ...prev,
        doc_type: docTypeFromQuery,
        status: docTypeFromQuery === 'quotation' ? 'unpaid' : prev.status,
      }));
    }
  }, [docTypeFromQuery, isEditing]);

  useEffect(() => {
    const loadLookups = async () => {
      setLoading(true);
      const [cRes, aRes, iRes, stockRes] = await Promise.all([
        customerService.list({ branchId: activeBranchId ?? undefined }),
        accountService.list({ branchId: activeBranchId ?? undefined }),
        inventoryService.listItems({ branchId: activeBranchId ?? undefined }),
        inventoryService.listStock({ page: 1, limit: 5000, branchId: activeBranchId ?? undefined }),
      ]);

      if (cRes.success && cRes.data?.customers) setCustomers(cRes.data.customers);
      if (aRes.success && aRes.data?.accounts) setAccounts(aRes.data.accounts);
      const stockMap = new Map<number, number>();
      if (stockRes.success && stockRes.data?.rows) {
        stockRes.data.rows.forEach((row) =>
          stockMap.set(Number(row.item_id), Number(row.total_qty ?? row.branch_qty ?? 0))
        );
      }

      if (iRes.success && iRes.data?.items) {
        const mapped = (iRes.data.items as InventoryItem[]).map((item) => {
          const salePrice = Number(item.sale_price || 0);
          const fallbackPrice = salePrice > 0 ? salePrice : Number(item.cost_price || 0);
          const itemId = Number(item.item_id);
          return {
            item_id: itemId,
            item_name: item.item_name,
            unit_price: Number(fallbackPrice),
            available_qty: stockMap.get(itemId) ?? 0,
          };
        });
        setItemOptions(mapped);
      }
      setLoading(false);
    };
    void loadLookups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBranchId]);

  useEffect(() => {
    if (!isEditing || !editId) return;
    const loadSale = async () => {
      setLoading(true);
      const res = await salesService.get(editId);
      if (!res.success || !res.data?.sale) {
        showToast('error', 'Sales', res.error || 'Sale not found');
        navigate('/sales');
        setLoading(false);
        return;
      }

      const sale = res.data.sale;
      const items = (res.data.items || []).map((item) => ({
        item_id: Number(item.item_id),
        quantity: Number(item.quantity),
        unit_price: Number(item.unit_price),
      }));

      const derivedDebt =
        sale.customer_id !== null &&
        sale.doc_type !== 'quotation' &&
        sale.sale_type === 'credit' &&
        sale.status === 'unpaid';

      setIsDebt(derivedDebt);
      setSaleForm({
        customer_id: sale.customer_id ?? '',
        doc_type: sale.doc_type || 'sale',
        sale_type: sale.sale_type || 'cash',
        status: sale.status || 'paid',
        sale_date: sale.sale_date?.slice(0, 10) || todayString(),
        quote_valid_until: sale.quote_valid_until?.slice(0, 10) || '',
        subtotal: Number(sale.subtotal || 0),
        discount: Number(sale.discount || 0),
        tax_rate: FIXED_TAX_RATE_PERCENT,
        apply_tax: Number((sale as any).tax_amount || 0) > 0,
        tax_amount: Number((sale as any).tax_amount || 0),
        total: Number(sale.total || 0),
        acc_id: sale.pay_acc_id ?? '',
        paid_amount: Number(sale.paid_amount || 0),
        note: sale.note || '',
        items: items.length ? items : [{ item_id: '', quantity: 1, unit_price: 0 }],
      });
      setLoading(false);
    };
    void loadSale();
  }, [editId, isEditing, navigate, showToast]);

  const recalcTotals = (
    nextItems: FormLine[],
    headerDiscount: number,
    headerTaxRate = saleForm.tax_rate,
    applyTax = saleForm.apply_tax
  ) => {
    const subtotal = nextItems.reduce(
      (sum, line) => sum + Number(line.quantity || 0) * Number(line.unit_price || 0),
      0
    );
    const discount = Number(headerDiscount || 0);
    const taxRate = applyTax ? Number(headerTaxRate || 0) : 0;
    const taxableAmount = Math.max(0, subtotal - discount);
    const taxAmount = (taxableAmount * taxRate) / 100;
    const total = taxableAmount + taxAmount;
    setSaleForm((prev) => ({
      ...prev,
      subtotal: Number(subtotal.toFixed(2)),
      total: Number(total.toFixed(2)),
      tax_amount: Number(taxAmount.toFixed(2)),
    }));
  };

  const effectiveDocType = saleForm.doc_type;
  const effectiveSaleType: 'cash' | 'credit' = effectiveDocType === 'quotation'
    ? 'credit'
    : isDebt
    ? 'credit'
    : saleForm.sale_type;
  const effectiveStatus: SaleStatus = effectiveDocType === 'quotation' || effectiveSaleType === 'credit'
    ? 'unpaid'
    : saleForm.status;

  const headerDocLabel =
    effectiveDocType === 'quotation' ? 'Quotation' : effectiveDocType === 'invoice' ? 'Invoice' : 'Sale';
  const headerTitle = isEditing ? `Edit ${headerDocLabel}` : `New ${headerDocLabel}`;
  const headerDescription =
    effectiveDocType === 'quotation'
      ? 'Create or edit quotation documents.'
      : 'Create or edit sale and invoice documents.';

  const shouldShowAccount =
    effectiveDocType !== 'quotation' &&
    effectiveSaleType !== 'credit' &&
    effectiveStatus !== 'void' &&
    effectiveStatus !== 'unpaid';

  const itemOptionsMap = useMemo(() => {
    const map = new Map<number, SaleItemOption>();
    itemOptions.forEach((item) => map.set(Number(item.item_id), item));
    return map;
  }, [itemOptions]);

  const getLineAvailableQty = (line: FormLine) => {
    if (!line.item_id) return 0;
    const fromOption = itemOptionsMap.get(Number(line.item_id))?.available_qty;
    if (fromOption !== undefined && fromOption !== null) return Number(fromOption);
    return Number(line.available_qty ?? 0);
  };

  const firstInsufficientLine = saleForm.items.find((line) => {
    if (!line.item_id) return false;
    const available = getLineAvailableQty(line);
    return Number(line.quantity || 0) > available;
  });
  const firstInsufficientAvailableQty = firstInsufficientLine
    ? getLineAvailableQty(firstInsufficientLine)
    : 0;
  const hasInsufficientStock = Boolean(firstInsufficientLine);

  const printHtmlDocument = (html: string) => {
    const printFrame = document.createElement('iframe');
    printFrame.style.position = 'fixed';
    printFrame.style.right = '0';
    printFrame.style.bottom = '0';
    printFrame.style.width = '0';
    printFrame.style.height = '0';
    printFrame.style.border = '0';
    document.body.appendChild(printFrame);

    const frameWindow = printFrame.contentWindow;
    if (!frameWindow) {
      document.body.removeChild(printFrame);
      showToast('error', 'Print Failed', 'Unable to open print frame');
      return;
    }

    frameWindow.document.open();
    frameWindow.document.write(html);
    frameWindow.document.close();

    let printed = false;
    const cleanup = () => {
      setTimeout(() => {
        if (document.body.contains(printFrame)) {
          document.body.removeChild(printFrame);
        }
      }, 300);
    };

    printFrame.onload = () => {
      if (printed) return;
      printed = true;
      frameWindow.focus();
      frameWindow.print();
      cleanup();
    };
  };

  // ── Validation ────────────────────────────────────────────────────────────
  const validate = (): FormErrors => {
    const errors: FormErrors = {};

    const validItems = saleForm.items.filter((line) => line.item_id && line.quantity > 0);
    if (!validItems.length) {
      errors.items = 'Add at least one item with a quantity greater than 0.';
    }

    const requiresCustomer =
      effectiveDocType !== 'quotation' &&
      effectiveStatus !== 'paid' &&
      effectiveStatus !== 'void';
    if (requiresCustomer && !saleForm.customer_id) {
      errors.customer = 'Customer is required for unpaid or partial documents.';
    }

    if (effectiveDocType === 'quotation' && !saleForm.quote_valid_until) {
      errors.quoteValidUntil = 'Quote valid until date is required.';
    }

    if (firstInsufficientLine && effectiveDocType !== 'quotation') {
      const label =
        itemOptions.find((o) => o.item_id === Number(firstInsufficientLine.item_id))?.item_name ||
        `Item ${firstInsufficientLine.item_id}`;
      errors.stock = `${label}: requested ${Number(firstInsufficientLine.quantity)}, only ${formatAvailableQty(firstInsufficientAvailableQty)} available.`;
    }

    if (effectiveDocType !== 'quotation' && shouldShowAccount && !saleForm.acc_id) {
      errors.account = 'Select an account to receive the payment.';
    }

    if (
      effectiveDocType !== 'quotation' &&
      effectiveStatus === 'partial' &&
      Number(saleForm.paid_amount || 0) <= 0
    ) {
      errors.paidAmount = 'Enter the amount paid for a partial payment.';
    }

    return errors;
  };

  const handleSaveSale = async () => {
    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      // scroll to first error
      setTimeout(() => {
        document.querySelector('[data-field-error]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
      return;
    }
    setFormErrors({});

    const validItems = saleForm.items.filter((line) => line.item_id && line.quantity > 0);

    const payload = {
      branchId: activeBranchId ?? undefined,
      customerId: saleForm.customer_id || undefined,
      saleDate: saleForm.sale_date,
      docType: effectiveDocType,
      quoteValidUntil:
        effectiveDocType === 'quotation' && saleForm.quote_valid_until
          ? saleForm.quote_valid_until
          : undefined,
      subtotal: Number(saleForm.subtotal),
      discount: Number(saleForm.discount),
      taxRate: saleForm.apply_tax ? Number(saleForm.tax_rate) : 0,
      total: Number(saleForm.total),
      saleType: effectiveSaleType,
      status: effectiveStatus,
      note: saleForm.note || undefined,
      items: validItems.map((line) => ({
        itemId: Number(line.item_id),
        quantity: Number(line.quantity),
        unitPrice: Number(line.unit_price),
      })),
      payFromAccId: shouldShowAccount ? Number(saleForm.acc_id) : undefined,
      paidAmount: shouldShowAccount
        ? Number(
            effectiveStatus === 'paid'
              ? saleForm.paid_amount || saleForm.total
              : saleForm.paid_amount || 0
          )
        : undefined,
    };

    if (effectiveDocType === 'quotation') {
      setSubmitting(true);
      try {
        const saleRes = isEditing && editId
          ? await salesService.update(editId, payload)
          : await salesService.create(payload);

        if (!saleRes.success || !saleRes.data?.sale) {
          showToast('error', 'Quotation', saleRes.error || 'Failed to save quotation');
          return;
        }

        const savedSale = saleRes.data.sale;
        const printRes = await salesService.getPrintHtml(savedSale.sale_id);
        if (!printRes.success || !printRes.data?.html) {
          showToast('error', 'Quotation', printRes.error || 'Unable to load print template');
          return;
        }

        printHtmlDocument(printRes.data.html);
        showToast('success', 'Quotation', isEditing ? 'Quotation updated and printed' : 'Quotation saved and printed');
        navigate('/sales');
      } catch (error) {
        console.error('Quotation save error:', error);
        showToast('error', 'Quotation', 'Failed to save quotation');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    setSubmitting(true);
    const res = isEditing && editId
      ? await salesService.update(editId, payload)
      : await salesService.create(payload);
    setSubmitting(false);

    if (res.success) {
      showToast('success', 'Sales', isEditing ? 'Document updated' : 'Document created');
      navigate('/sales');
    } else {
      showToast('error', 'Sales', res.error || 'Save failed');
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      <PageHeader
        title={headerTitle}
        description={headerDescription}
        actions={
          <button
            onClick={() => navigate('/sales')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
        }
      />

      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-6">

        {/* ── Row 1: Doc type / Date / Quote valid until ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="flex flex-col text-sm font-medium gap-1 text-slate-800 dark:text-slate-200">
            Document Type
            {effectiveDocType === 'quotation' ? (
              <input className={controlReadonlyCls} value="Quotation" disabled />
            ) : (
              <select
                className={controlCls}
                value={saleForm.doc_type}
                onChange={(e) => {
                  const nextDoc = e.target.value as SaleDocType;
                  setIsDebt(false);
                  setSaleForm((prev) => ({ ...prev, doc_type: nextDoc }));
                }}
                disabled={loading}
              >
                <option value="sale">Sale</option>
                <option value="invoice">Invoice</option>
              </select>
            )}
          </label>

          <label className="flex flex-col text-sm font-medium gap-1 text-slate-800 dark:text-slate-200">
            Date
            <input
              type="date"
              className={controlCls}
              value={saleForm.sale_date}
              onChange={(e) => setSaleForm((prev) => ({ ...prev, sale_date: e.target.value }))}
              disabled={loading}
            />
          </label>

          {effectiveDocType === 'quotation' && (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-800 dark:text-slate-200">
                Quote Valid Until <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                className={fieldCls('quoteValidUntil')}
                value={saleForm.quote_valid_until}
                onChange={(e) => {
                  clearError('quoteValidUntil');
                  setSaleForm((prev) => ({ ...prev, quote_valid_until: e.target.value }));
                }}
                disabled={loading}
              />
              <FieldError field="quoteValidUntil" />
            </div>
          )}
        </div>

        {/* ── Row 2: Customer / Status ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1" data-field-error={formErrors.customer ? '' : undefined}>
            <label className="text-sm font-medium text-slate-800 dark:text-slate-200">
              Customer
              {effectiveDocType !== 'quotation' && effectiveStatus !== 'paid' && effectiveStatus !== 'void' && (
                <span className="text-red-500 ml-0.5">*</span>
              )}
            </label>
            <SearchableCombobox<number>
              value={saleForm.customer_id}
              options={customers.map((customer) => ({
                value: customer.customer_id,
                label: customer.full_name,
              }))}
              placeholder="Walking Customer"
              disabled={loading}
              hasError={!!formErrors.customer}
              onChange={(nextValue) => {
                clearError('customer');
                const customerId = nextValue === '' ? '' : Number(nextValue);
                setIsDebt(false);
                setSaleForm((prev) => ({ ...prev, customer_id: customerId }));
              }}
            />
            <FieldError field="customer" />
          </div>

          <label className="flex flex-col text-sm font-medium gap-1 text-slate-800 dark:text-slate-200">
            Status
            <select
              className={controlCls}
              value={effectiveStatus}
              onChange={(e) =>
                setSaleForm((prev) => ({ ...prev, status: e.target.value as SaleStatus }))
              }
              disabled={loading || saleForm.doc_type === 'quotation' || effectiveSaleType === 'credit'}
            >
              <option value="paid">Paid</option>
              <option value="partial">Partial</option>
              <option value="unpaid">Unpaid</option>
              <option value="void">Void</option>
            </select>
          </label>
        </div>

        {/* ── Row 3: Sale type / Account ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex flex-col text-sm font-medium gap-1 text-slate-800 dark:text-slate-200">
            Sale Type
            <select
              className={controlCls}
              value={effectiveSaleType}
              onChange={(e) =>
                setSaleForm((prev) => {
                  const nextType = e.target.value as 'cash' | 'credit';
                  return {
                    ...prev,
                    sale_type: nextType,
                    status: nextType === 'credit' ? 'unpaid' : prev.status === 'unpaid' ? 'paid' : prev.status,
                    acc_id: nextType === 'credit' ? '' : prev.acc_id,
                    paid_amount: nextType === 'credit' ? 0 : prev.paid_amount,
                  };
                })
              }
              disabled={loading || saleForm.doc_type === 'quotation' || isDebt}
            >
              <option value="cash">Cash</option>
              <option value="credit">Credit</option>
            </select>
          </label>

          {shouldShowAccount && (
            <div className="flex flex-col gap-1" data-field-error={formErrors.account ? '' : undefined}>
              <label className="text-sm font-medium text-slate-800 dark:text-slate-200">
                Receive To Account <span className="text-red-500">*</span>
              </label>
              <SearchableCombobox<number>
                value={saleForm.acc_id}
                options={accounts.map((account) => ({
                  value: account.acc_id,
                  label: `${account.name} (${account.institution || 'Cash'})`,
                }))}
                placeholder="Select account"
                disabled={loading}
                hasError={!!formErrors.account}
                onChange={(nextValue) => {
                  clearError('account');
                  setSaleForm((prev) => ({ ...prev, acc_id: nextValue === '' ? '' : Number(nextValue) }));
                }}
              />
              <FieldError field="account" />
            </div>
          )}
        </div>

        {/* ── Debt toggle ── */}
        {saleForm.customer_id && saleForm.doc_type !== 'quotation' && (
          <div className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-300">
            <input
              id="debt-toggle"
              type="checkbox"
              className="h-4 w-4 accent-primary-600"
              checked={isDebt}
              onChange={(e) => {
                const checked = e.target.checked;
                setIsDebt(checked);
                setSaleForm((prev) => ({
                  ...prev,
                  sale_type: checked ? 'credit' : 'cash',
                  status: checked ? 'unpaid' : 'paid',
                  acc_id: checked ? '' : prev.acc_id,
                  paid_amount: checked ? 0 : prev.paid_amount,
                }));
              }}
            />
            <label htmlFor="debt-toggle" className="select-none">
              Mark as debt for this customer
            </label>
          </div>
        )}

        {/* ── Note ── */}
        <label className="flex flex-col text-sm font-medium gap-1 text-slate-800 dark:text-slate-200">
          Note
          <textarea
            className={`${textareaCls} min-h-[90px]`}
            value={saleForm.note}
            onChange={(e) => setSaleForm((prev) => ({ ...prev, note: e.target.value }))}
            disabled={loading}
          />
        </label>

        {/* ── Items ── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <span className="font-semibold text-slate-800 dark:text-slate-200">Items</span>
              <span className="text-red-500 ml-0.5 text-sm">*</span>
            </div>
            <button
              type="button"
              onClick={() =>
                setSaleForm((prev) => ({
                  ...prev,
                  items: [...prev.items, { item_id: '', quantity: 1, unit_price: 0 }],
                }))
              }
              className="inline-flex items-center gap-1 text-sm px-3 py-1 rounded-lg bg-primary-600 text-white hover:bg-primary-700"
            >
              <Plus size={16} /> Add line
            </button>
          </div>

          {/* Items global errors */}
          {(formErrors.items || formErrors.stock) && (
            <div
              data-field-error=""
              className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{formErrors.items || formErrors.stock}</span>
            </div>
          )}

          <div className="hidden md:grid md:grid-cols-[2fr_1fr_1fr_auto] gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400 px-1">
            <span>Item</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Unit Price</span>
            <span className="text-right pr-6">Line Total / Action</span>
          </div>

          <div className="space-y-2">
            {saleForm.items.map((line, idx) => {
              const lineErr =
                !!line.item_id && Number(line.quantity || 0) > getLineAvailableQty(line);
              return (
                <div
                  key={idx}
                  className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_auto] gap-2 items-start"
                >
                  <div>
                    <SearchableCombobox<number>
                      value={line.item_id}
                      options={itemOptions.map((item) => ({
                        value: item.item_id,
                        label: itemLabelWithAvailability(item.item_name, item.available_qty),
                      }))}
                      placeholder="Select item"
                      disabled={loading}
                      onChange={(nextValue) => {
                        clearError('items');
                        clearError('stock');
                        const itemId = nextValue === '' ? '' : Number(nextValue);
                        const option = itemOptions.find((item) => item.item_id === itemId);
                        const nextItems = [...saleForm.items];
                        nextItems[idx] = {
                          ...nextItems[idx],
                          item_id: itemId,
                          unit_price: option ? Number(option.unit_price || 0) : nextItems[idx].unit_price,
                          available_qty: option?.available_qty ?? 0,
                        };
                        setSaleForm((prev) => ({ ...prev, items: nextItems }));
                        recalcTotals(nextItems, saleForm.discount);
                      }}
                    />
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Available:{' '}
                      <span className="font-medium text-slate-700 dark:text-slate-200">
                        {formatAvailableQty(getLineAvailableQty(line))} units
                      </span>
                    </p>
                  </div>

                  <div>
                    <input
                      type="number"
                      min={0}
                      step={0.001}
                      className={`${lineErr
                        ? `${baseCls} ${errBorder}`
                        : controlCls
                      } text-right`}
                      value={line.quantity}
                      onChange={(e) => {
                        clearError('items');
                        clearError('stock');
                        const quantity = Number(e.target.value || 0);
                        const nextItems = [...saleForm.items];
                        const selected = itemOptions.find((item) => item.item_id === nextItems[idx].item_id);
                        nextItems[idx] = {
                          ...nextItems[idx],
                          quantity,
                          unit_price:
                            nextItems[idx].unit_price > 0
                              ? nextItems[idx].unit_price
                              : Number(selected?.unit_price || 0),
                        };
                        setSaleForm((prev) => ({ ...prev, items: nextItems }));
                        recalcTotals(nextItems, saleForm.discount);
                      }}
                      disabled={loading}
                    />
                    {lineErr && (
                      <p className="mt-1 flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
                        <AlertCircle className="h-3 w-3 shrink-0" />
                        Exceeds available stock
                      </p>
                    )}
                  </div>

                  <input
                    type="number"
                    min={0}
                    className={`${controlReadonlyCls} text-right`}
                    value={line.unit_price}
                    readOnly
                    title="Unit price is set automatically from item price"
                    disabled={loading}
                  />

                  <div className="flex items-center justify-between md:justify-end gap-3 text-sm text-slate-600 dark:text-slate-300">
                    <div className="flex items-center gap-2">
                      <span className="md:hidden font-medium">Line Total</span>
                      <span className="font-semibold">
                        ${(Number(line.quantity || 0) * Number(line.unit_price || 0)).toFixed(2)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const nextItems = saleForm.items.filter((_, i) => i !== idx);
                        const final: FormLine[] = nextItems.length ? nextItems : [{ item_id: '', quantity: 1, unit_price: 0 }];
                        setSaleForm((prev) => ({ ...prev, items: final }));
                        recalcTotals(final, saleForm.discount);
                      }}
                      className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-red-500 hover:bg-red-50"
                      aria-label="Remove line"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Totals row ── */}
        <div className="flex justify-end items-end gap-6 text-sm mt-2">
          <div className="flex flex-col items-end justify-end">
            <span className="text-slate-500">Subtotal</span>
            <span className="mt-1 h-10 flex items-center font-semibold">
              ${saleForm.subtotal.toFixed(2)}
            </span>
          </div>
          <div className="flex flex-col items-end justify-end">
            <span className="text-slate-500">Discount</span>
            <input
              type="number"
              min={0}
              className={`${controlCls} mt-1 text-right h-10`}
              value={saleForm.discount}
              onChange={(e) => {
                const discount = Number(e.target.value || 0);
                const next = { ...saleForm, discount };
                setSaleForm(next);
                recalcTotals(next.items, discount);
              }}
              disabled={loading}
            />
          </div>
          <div className="flex flex-col items-end justify-end">
            <label className="flex items-center gap-1.5 text-slate-500 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={saleForm.apply_tax}
                onChange={(e) => {
                  const applyTax = e.target.checked;
                  const next = { ...saleForm, apply_tax: applyTax };
                  setSaleForm(next);
                  recalcTotals(next.items, next.discount, next.tax_rate, applyTax);
                }}
                disabled={loading}
                className="h-3.5 w-3.5 rounded border-slate-300 dark:border-slate-600 text-primary-600 focus:ring-primary-500"
              />
              VAT ({FIXED_TAX_RATE_PERCENT}% fixed)
            </label>
            <span
              className={`${controlCls} mt-1 h-10 w-36 flex items-center justify-end bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 cursor-default select-none`}
              title={saleForm.apply_tax ? 'Tax rate is fixed by policy and can\'t be changed here' : 'This sale is marked VAT-exempt'}
            >
              {saleForm.apply_tax ? `$${(saleForm.tax_amount || 0).toFixed(2)}` : 'No VAT'}
            </span>
          </div>
          <div className="flex flex-col items-end justify-end">
            <span className="text-slate-500">Total</span>
            <span className="mt-1 h-10 flex items-center font-semibold">
              ${saleForm.total.toFixed(2)}
            </span>
          </div>
        </div>

        {/* ── Paid amount ── */}
        {shouldShowAccount && (
          <div className="flex justify-end">
            <div
              className="flex flex-col gap-1 min-w-[220px]"
              data-field-error={formErrors.paidAmount ? '' : undefined}
            >
              <label className="text-sm font-medium text-slate-800 dark:text-slate-200">
                Amount Paid
                {effectiveStatus === 'partial' && <span className="text-red-500 ml-0.5">*</span>}
              </label>
              <input
                type="number"
                className={`${fieldCls('paidAmount')} text-right`}
                value={saleForm.paid_amount}
                min={0}
                max={saleForm.total}
                onChange={(e) => {
                  clearError('paidAmount');
                  setSaleForm((prev) => ({ ...prev, paid_amount: Number(e.target.value || 0) }));
                }}
                disabled={loading}
              />
              <FieldError field="paidAmount" />
            </div>
          </div>
        )}

        {/* ── Actions ── */}
        <div className="flex justify-end gap-3 pt-4">
          <button
            type="button"
            onClick={() => navigate('/sales')}
            className="px-6 py-2.5 font-semibold text-slate-600 bg-slate-100 dark:bg-slate-800 dark:text-slate-200 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSaveSale()}
            disabled={submitting || loading || hasInsufficientStock}
            className="px-8 py-2.5 bg-primary-600 text-white font-bold rounded-lg hover:bg-primary-700 transition-all shadow-md shadow-primary-500/20 active:scale-95 disabled:opacity-60"
          >
            {submitting
              ? 'Saving...'
              : effectiveDocType === 'quotation'
              ? 'Print Quotation'
              : isEditing
              ? 'Update Document'
              : 'Create Document'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SaleCreate;
