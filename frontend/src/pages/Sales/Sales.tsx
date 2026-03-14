import { useCallback, useMemo, useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { Ban, Edit3, FileCheck2, FileText, Printer, ReceiptText, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router';
import { PageHeader, TabActionToolbar } from '../../components/ui/layout';
import { ConfirmDialog } from '../../components/ui/modal/ConfirmDialog';
import { DataTable } from '../../components/ui/table/DataTable';
import Badge from '../../components/ui/badge/Badge';
import { Tabs } from '../../components/ui/tabs/Tabs';
import { useToast } from '../../components/ui/toast/Toast';
import { Sale, SaleItem, salesService } from '../../services/sales.service';
import { settingsService } from '../../services/settings.service';
import { customerService } from '../../services/customer.service';

const formatMoney = (value: number) => `$${Number(value || 0).toFixed(2)}`;

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const getDocRef = (sale: Pick<Sale, 'sale_id' | 'doc_type'>) => {
  const docType = sale.doc_type || 'sale';
  if (docType === 'quotation') return `Q-${sale.sale_id}`;
  if (docType === 'invoice') return `INV-${sale.sale_id}`;
  return `S-${sale.sale_id}`;
};

type PrintCompany = {
  name: string;
  phone?: string | null;
  logoUrl?: string | null;
};

type PrintCustomer = {
  name: string;
  phone?: string | null;
  address?: string | null;
};

export const buildPrintableDocument = (
  sale: Sale,
  items: SaleItem[],
  company: PrintCompany,
  customer: PrintCustomer
) => {
  const docType = sale.doc_type || 'sale';
  const isQuote = docType === 'quotation';
  const isInvoice = docType === 'invoice';
  const docLabel = isQuote ? 'Quotation' : isInvoice ? 'Invoice' : 'Sale';
  const docNo = isQuote ? `Q-${sale.sale_id}` : isInvoice ? `INV-${sale.sale_id}` : `S-${sale.sale_id}`;
  const brandSubtitle = isQuote ? 'Price Quotation' : isInvoice ? 'Sales Invoice' : 'Sales Document';
  const date = new Date(sale.sale_date).toLocaleDateString();
  const quoteValidUntil = sale.quote_valid_until ? new Date(sale.quote_valid_until).toLocaleDateString() : '';
  const totalAmount = Number(sale.total || 0);
  const taxAmount = Number((sale as any).tax_amount || 0);
  // When status is paid, show full total as paid and 0 balance (fixes display inconsistency)
  const paidAmount =
    sale.status === 'paid'
      ? totalAmount
      : Math.min(Number(sale.paid_amount || 0), totalAmount);
  const balance = Math.max(totalAmount - paidAmount, 0);
  const themeClass = isQuote ? 'quote' : 'invoice';
  const note = (sale.note || '').trim();
  const invoiceStampLabel =
    isQuote || sale.status === 'void'
      ? ''
      : sale.status === 'paid'
      ? 'PAID'
      : sale.status === 'partial'
      ? 'PARTIAL'
      : 'DUE';
  const invoiceStampClass =
    invoiceStampLabel === 'PAID'
      ? 'paid'
      : invoiceStampLabel === 'PARTIAL'
      ? 'partial'
      : invoiceStampLabel === 'DUE'
      ? 'due'
      : '';

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${docLabel} ${docNo}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
          * { box-sizing: border-box; font-family: 'Inter', 'Manrope', 'Segoe UI', Arial, sans-serif; }
          @page { margin: 12mm; }
          body { margin: 0; color: #0f172a; -webkit-print-color-adjust: exact; print-color-adjust: exact; font-size: 11px; line-height: 1.55; }
          body.invoice { --accent: #1e3a8a; --accent-soft: #e0e7ff; --accent-dark: #1e3a8a; --accent-ink:#111827; --header-bg:#1e3a8a; --border:#c7d2fe; }
          body.quote { --accent: #7c3aed; --accent-soft: #ede9fe; --accent-dark: #6d28d9; --accent-ink:#6d28d9; --header-bg:#6d28d9; --border:#ddd6fe; }
          .page { padding: 10px 16px 12px; }
          .sheet { position:relative; border:1px solid var(--border); border-radius:16px; padding:16px; }
          body.quote .sheet { border-style:dashed; }
          .watermark { position:absolute; top:80px; right:24px; font-size:52px; font-weight:800; letter-spacing:0.18em; color:rgba(148,163,184,0.12); transform:rotate(-10deg); pointer-events:none; }
          .stamp { position:absolute; top:18px; right:18px; padding:6px 10px; border:3px solid; border-radius:10px; font-size:13px; font-weight:800; letter-spacing:0.22em; transform:rotate(10deg); text-transform:uppercase; opacity:0.86; }
          .stamp.paid { border-color:#10b981; color:#10b981; }
          .stamp.partial { border-color:#f59e0b; color:#f59e0b; }
          .stamp.due { border-color:#ef4444; color:#ef4444; }
          .hero { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; }
          .brand { display:flex; align-items:center; gap:12px; }
          .logo { width:42px; height:42px; object-fit:contain; border-radius:10px; }
          .brand-name { font-size:15px; font-weight:700; color:#0f172a; }
          .brand-sub { font-size:9px; color:#64748b; letter-spacing:0.2em; text-transform:uppercase; }
          .doc-card { border:1px solid var(--border); border-radius:12px; padding:10px 12px; min-width:190px; background:var(--accent-soft); }
          .doc-label { font-size:10px; letter-spacing:0.22em; text-transform:uppercase; color:#64748b; margin-bottom:6px; }
          .doc-title { font-size:22px; font-weight:800; color:var(--accent-dark); }
          .doc-meta { margin-top:8px; display:grid; grid-template-columns: 1fr 1fr; gap:6px; font-size:10px; color:#475569; }
          .doc-meta b { color:#0f172a; }
          .accent-line { height:4px; background:var(--accent); border-radius:999px; margin:12px 0 6px; }
          .pill { display:inline-flex; background:var(--accent-soft); color:#0f172a; padding:4px 10px; border-radius:999px; font-size:9px; letter-spacing:0.16em; text-transform:uppercase; }
          .flags { margin-top:10px; display:flex; flex-wrap:wrap; gap:8px; }
          .notice { margin-top:10px; border:1px dashed var(--border); background:#ffffff; padding:10px 12px; border-radius:12px; font-size:10px; color:#475569; }
          .notice b { color:#0f172a; }
          .note-box { margin-top:10px; border:1px solid var(--border); background:#ffffff; padding:10px 12px; border-radius:12px; font-size:10.5px; color:#475569; }
          .note-box b { color:#0f172a; }
          .info-grid { display:grid; grid-template-columns: 1.1fr 1fr; gap:12px; margin-top:10px; }
          .box { border:1px solid var(--border); padding:10px 12px; border-radius:12px; background:#ffffff; }
          .box h4 { margin:0 0 6px; font-size:9px; letter-spacing:0.2em; text-transform:uppercase; color:#64748b; }
          .box p { margin:2px 0; font-size:10.5px; color:#475569; }
          .box .name { font-weight:600; color:#0f172a; }
          table { width:100%; border-collapse: collapse; margin-top:14px; border:1px solid var(--border); border-radius:10px; overflow:hidden; }
          thead th { background:var(--header-bg); color:#f8fafc; text-transform:uppercase; letter-spacing:0.16em; font-size:9px; padding:8px; text-align:left; }
          thead th.num { text-align:right; }
          tbody td { padding:8px; border-bottom:1px solid #e2e8f0; font-size:10.5px; }
          tbody td.num { text-align:right; }
          tbody tr:nth-child(even) { background:#f8fafc; }
          .summary { display:flex; justify-content:flex-end; margin-top:12px; }
          .totals { border:1px solid var(--border); padding:12px 14px; border-radius:12px; background:var(--accent-soft); min-width:210px; }
          .totals-row { display:flex; justify-content:space-between; font-size:10.5px; padding:6px 0; color:#475569; }
          .total-highlight { margin-top:10px; background:var(--accent); padding:10px 12px; font-weight:700; display:flex; justify-content:space-between; border-radius:10px; color:#ffffff; }
          .signatures { margin-top:14px; display:flex; justify-content:space-between; font-size:9.5px; color:#64748b; }
          .footer { margin-top:12px; border-top:1px solid var(--border); padding-top:6px; font-size:9px; color:#94a3b8; display:flex; justify-content:space-between; }
          .void { color:#b91c1c; font-weight:700; margin-top:8px; font-size:11px; letter-spacing:0.08em; }
          body.quote .doc-title { color:var(--accent-dark); }
          body.quote .accent-line { background:linear-gradient(90deg, #6d28d9 0%, #a78bfa 100%); }
          body.invoice .doc-title { color:var(--accent-dark); }
          body.invoice .accent-line { background:linear-gradient(90deg, #1e3a8a 0%, #93c5fd 100%); }
        </style>
      </head>
      <body class="${themeClass}">
        <div class="page">
          <div class="sheet">
            <div class="watermark">${escapeHtml((docLabel || 'Document').toUpperCase())}</div>
            ${invoiceStampLabel ? `<div class="stamp ${invoiceStampClass}">${escapeHtml(invoiceStampLabel)}</div>` : ''}
            <div class="hero">
              <div class="brand">
                ${company.logoUrl ? `<img class="logo" src="${escapeHtml(company.logoUrl)}" alt="Logo" />` : ''}
                <div>
                  <div class="brand-name">${escapeHtml(company.name || 'My Inventory ERP')}</div>
                  <div class="brand-sub">${escapeHtml(brandSubtitle)}</div>
                </div>
              </div>
              <div class="doc-card">
                <div class="doc-label">${docLabel}</div>
                <div class="doc-title">${docNo}</div>
                <div class="doc-meta">
                  <div>Date</div><div><b>${escapeHtml(date)}</b></div>
                  ${!isQuote ? `<div>Status</div><div><b>${escapeHtml(String(sale.status))}</b></div>` : ''}
                </div>
              </div>
            </div>

            <div class="accent-line"></div>
            <div class="flags">
              ${
                isQuote && quoteValidUntil
                  ? `<div class="pill">Valid until ${escapeHtml(quoteValidUntil)}</div>`
                  : ''
              }
              ${!isQuote && balance > 0 ? `<div class="pill">Balance due ${escapeHtml(formatMoney(balance))}</div>` : ''}
              ${!isQuote && balance === 0 && sale.status === 'paid' ? `<div class="pill">Paid in full</div>` : ''}
            </div>

            ${
              isQuote
                ? `<div class="notice"><b>Quotation only.</b> This document does not reserve stock or post any sale until converted to an invoice.</div>`
                : ''
            }

            ${
              note
                ? `<div class="note-box"><b>Note:</b> ${escapeHtml(note)}</div>`
                : ''
            }

            <div class="info-grid">
              <div class="box">
                <h4>${escapeHtml(docLabel)} to</h4>
                <p class="name">${escapeHtml(customer.name || 'Walking Customer')}</p>
                ${customer.address ? `<p>${escapeHtml(String(customer.address))}</p>` : ''}
                ${customer.phone ? `<p>Phone: ${escapeHtml(String(customer.phone))}</p>` : ''}
              </div>
              <div class="box">
                <h4>Company</h4>
                <p class="name">${escapeHtml(company.name || 'My Inventory ERP')}</p>
                ${company.phone ? `<p>Phone: ${escapeHtml(String(company.phone))}</p>` : ''}
              </div>
            </div>

          <table>
            <thead>
              <tr>
                <th style="width:48px;">SL.</th>
                <th>Item Description</th>
                <th class="num" style="width:110px;">Price</th>
                <th class="num" style="width:80px;">Qty.</th>
                <th class="num" style="width:130px;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${items.length ? items.map((line, idx) => {
                const qty = Number(line.quantity || 0);
                const unitPrice = Number(line.unit_price || 0);
                const lineTotal = Number(line.line_total || qty * unitPrice);
                const itemId = Number(line.item_id || 0);
                const itemName = line.item_name || '';
                const itemLabel = itemName ? escapeHtml(itemName) : `Item ${itemId}`;
                return `
                  <tr>
                    <td>${idx + 1}</td>
                    <td>${itemLabel}</td>
                    <td class="num">$${unitPrice.toFixed(2)}</td>
                    <td class="num">${qty.toFixed(0)}</td>
                    <td class="num">$${lineTotal.toFixed(2)}</td>
                  </tr>
                `;
              }).join('') : '<tr><td colspan="5" style="padding: 12px; color:#6b7280;">No items</td></tr>'}
            </tbody>
          </table>

            <div class="summary">
              <div class="totals">
                <div class="totals-row"><span>Sub Total</span><span>${formatMoney(sale.subtotal)}</span></div>
                <div class="totals-row"><span>Discount</span><span>${formatMoney(sale.discount)}</span></div>
                <div class="totals-row"><span>Tax</span><span>${formatMoney(taxAmount)}</span></div>
                ${isQuote ? '' : `<div class="totals-row"><span>Paid</span><span>${formatMoney(paidAmount)}</span></div>`}
                ${isQuote ? '' : `<div class="totals-row"><span>Balance</span><span>${formatMoney(balance)}</span></div>`}
                <div class="total-highlight"><span>Total</span><span>${formatMoney(sale.total)}</span></div>
              </div>
            </div>

          ${sale.status === 'void' ? '<div class="void">VOIDED DOCUMENT</div>' : ''}

            <div class="signatures">
              <div>${isQuote ? 'Prepared By' : 'Authorized Sign'}: ____________________</div>
              <div>${isQuote ? 'Customer Acceptance' : 'Client Sign'}: ____________________</div>
            </div>

            <div class="footer">
              <div>${escapeHtml(company.name || 'My Inventory ERP')}</div>
              <div>${company.phone ? escapeHtml(String(company.phone)) : ''}</div>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
};

const Sales = () => {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [sales, setSales] = useState<Sale[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [saleToVoid, setSaleToVoid] = useState<Sale | null>(null);
  const [convertOpen, setConvertOpen] = useState(false);
  const [saleToConvert, setSaleToConvert] = useState<Sale | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [saleToDelete, setSaleToDelete] = useState<Sale | null>(null);

  const loadSales = useCallback(async () => {
    setLoading(true);
    const res = await salesService.list({ includeVoided: true });
    if (res.success && res.data?.sales) {
      setSales(res.data.sales);
      setHasLoaded(true);
    } else {
      showToast('error', 'Sales', res.error || 'Failed to load sales');
    }
    setLoading(false);
  }, [showToast]);

  const printSaleInvoice = useCallback(
    async (sale: Sale) => {
      try {
        // Load sale details first
        const res = await salesService.get(sale.sale_id);
        if (!res.success || !res.data?.sale) {
          showToast('error', 'Sales', res.error || 'Failed to load sale details');
          return;
        }

        const saleRow = res.data.sale;
        const items = res.data.items || [];

        const [companyRes, customerRes] = await Promise.all([
          settingsService.getCompany(),
          saleRow.customer_id ? customerService.get(Number(saleRow.customer_id)) : Promise.resolve(null as any),
        ]);

        const company = {
          name: companyRes?.data?.company?.company_name || 'My Inventory ERP',
          phone: companyRes?.data?.company?.phone || null,
          logoUrl: companyRes?.data?.company?.logo_img || null,
        };

        const customer = {
          name: saleRow.customer_name || 'Walking Customer',
          phone: (customerRes && customerRes.success && customerRes.data?.customer?.phone) ? customerRes.data.customer.phone : null,
          address: (customerRes && customerRes.success && customerRes.data?.customer?.address) ? customerRes.data.customer.address : null,
        };

        // Build the HTML content
        const html = buildPrintableDocument(saleRow, items, company, customer);
        
        // Print in a hidden iframe so no new tab/window appears.
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
        
      } catch (error) {
        console.error('Invoice print error:', error);
        showToast('error', 'Print Failed', 'Unable to generate invoice');
      }
    },
    [showToast]
  );

  const confirmVoid = useCallback(async () => {
    if (!saleToVoid) return;
    setLoading(true);
    const res = await salesService.void(saleToVoid.sale_id, 'Voided from sales list');
    if (res.success) {
      showToast('success', 'Sales', 'Document voided');
      await loadSales();
    } else {
      showToast('error', 'Sales', res.error || 'Failed to void');
    }
    setLoading(false);
    setSaleToVoid(null);
    setVoidOpen(false);
  }, [loadSales, saleToVoid, showToast]);

  const confirmConvertQuotation = useCallback(async () => {
    if (!saleToConvert) return;
    const res = await salesService.convertQuotation(saleToConvert.sale_id, { status: 'unpaid' });
    if (res.success) {
      showToast('success', 'Sales', 'Quotation converted to invoice');
      await loadSales();
    } else {
      showToast('error', 'Sales', res.error || 'Failed to convert quotation');
    }
    setSaleToConvert(null);
    setConvertOpen(false);
  }, [loadSales, saleToConvert, showToast]);

  const handleConvertQuotation = useCallback((sale: Sale) => {
    setSaleToConvert(sale);
    setConvertOpen(true);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!saleToDelete) return;
    const res = await salesService.remove(saleToDelete.sale_id);
    if (res.success) {
      showToast('success', 'Sales', 'Document deleted');
      await loadSales();
    } else {
      showToast('error', 'Sales', res.error || 'Delete failed');
    }
    setSaleToDelete(null);
    setDeleteOpen(false);
  }, [loadSales, saleToDelete, showToast]);

  const handleDelete = useCallback((sale: Sale) => {
    setSaleToDelete(sale);
    setDeleteOpen(true);
  }, []);

  const columns: ColumnDef<Sale>[] = useMemo(
    () => [
      {
        accessorKey: 'sale_id',
        header: 'Doc #',
        cell: ({ row }) => getDocRef(row.original),
      },
      {
        accessorKey: 'sale_date',
        header: 'Date',
        cell: ({ row }) => new Date(row.original.sale_date).toLocaleString(),
      },
      {
        accessorKey: 'doc_type',
        header: 'Document',
        cell: ({ row }) => {
          const docType = row.original.doc_type || 'sale';
          const color = docType === 'quotation' ? 'primary' : docType === 'invoice' ? 'info' : 'dark';
          return (
            <Badge color={color} variant="light">
              {docType}
            </Badge>
          );
        },
      },
      {
        accessorKey: 'customer_name',
        header: 'Customer',
        cell: ({ row }) => row.original.customer_name || 'Walking Customer',
      },
      {
        accessorKey: 'total',
        header: 'Total',
        cell: ({ row }) => formatMoney(row.original.total),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <Badge
            color={
              row.original.status === 'paid'
                ? 'success'
                : row.original.status === 'partial'
                ? 'warning'
                : row.original.status === 'unpaid'
                ? 'error'
                : 'info'
            }
            variant="light"
          >
            {row.original.status}
          </Badge>
        ),
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => {
          const sale = row.original;
          return (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => void printSaleInvoice(sale)}
                className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-900/30"
                title={
                  (sale.doc_type || 'sale') === 'quotation'
                    ? 'Print quotation'
                    : (sale.doc_type || 'sale') === 'invoice'
                    ? 'Print invoice'
                    : 'Print sale'
                }
              >
                <Printer className="h-3.5 w-3.5" />
                Print
              </button>

              {sale.status !== 'void' && (
                <button
                  type="button"
                  onClick={() => navigate(`/sales/${sale.sale_id}/edit`)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  title="Edit"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  Edit
                </button>
              )}

              {sale.doc_type === 'quotation' && sale.status !== 'void' && (
                <button
                  type="button"
                  onClick={() => void handleConvertQuotation(sale)}
                  className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-900/30"
                  title="Convert to invoice"
                >
                  <FileCheck2 className="h-3.5 w-3.5" />
                  Convert
                </button>
              )}

              {sale.status !== 'void' && (
                <button
                  type="button"
                  onClick={() => {
                    setSaleToVoid(sale);
                    setVoidOpen(true);
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-amber-200 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-900/30"
                  title="Void"
                >
                  <Ban className="h-3.5 w-3.5" />
                  Void
                </button>
              )}

              {(sale.status === 'void' || sale.doc_type === 'quotation') && (
                <button
                  type="button"
                  onClick={() => void handleDelete(sale)}
                  className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-900/30"
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              )}
            </div>
          );
        },
      },
    ],
    [handleConvertQuotation, handleDelete, navigate, printSaleInvoice]
  );

  const salesDocs = useMemo(() => {
    return sales.filter((row) => (row.doc_type || 'sale') !== 'quotation');
  }, [sales]);

  const quotationDocs = useMemo(() => {
    return sales.filter((row) => (row.doc_type || 'sale') === 'quotation');
  }, [sales]);

  return (
    <div>
      <PageHeader
        title="Sales Management"
        description="Manage sales/invoices and quotations in separate tabs and print directly from actions."
      />

      <Tabs
        defaultTab="sales"
        tabs={[
          {
            id: 'sales',
            label: 'Sales',
            icon: ReceiptText,
            badge: hasLoaded ? salesDocs.length : undefined,
            content: (
              <div className="space-y-2">
                <TabActionToolbar
                  title="Sales Documents"
                  primaryAction={{ label: 'New Sale', onClick: () => navigate('/sales/new?docType=sale') }}
                  secondaryAction={{ label: 'New Invoice', onClick: () => navigate('/sales/new?docType=invoice') }}
                  onDisplay={() => void loadSales()}
                  displayLoading={loading}
                />
                <DataTable
                  data={salesDocs}
                  columns={columns}
                  isLoading={loading}
                  searchPlaceholder="Search by customer or note..."
                />
                {!loading && !hasLoaded && <div className="text-sm text-slate-500 px-1">Click Display to load data.</div>}
                {!loading && hasLoaded && salesDocs.length === 0 && (
                  <div className="text-sm text-slate-500 px-1">No sales/invoices found.</div>
                )}
              </div>
            ),
          },
          {
            id: 'quotations',
            label: 'Quotations',
            icon: FileText,
            badge: hasLoaded ? quotationDocs.length : undefined,
            content: (
              <div className="space-y-2">
                <TabActionToolbar
                  title="Quotations"
                  primaryAction={{ label: 'New Quotation', onClick: () => navigate('/sales/new?docType=quotation') }}
                  onDisplay={() => void loadSales()}
                  displayLoading={loading}
                />
                <DataTable
                  data={quotationDocs}
                  columns={columns}
                  isLoading={loading}
                  searchPlaceholder="Search quotations by customer or note..."
                />
                {!loading && !hasLoaded && <div className="text-sm text-slate-500 px-1">Click Display to load data.</div>}
                {!loading && hasLoaded && quotationDocs.length === 0 && (
                  <div className="text-sm text-slate-500 px-1">No quotations found.</div>
                )}
              </div>
            ),
          },
        ]}
      />

      <ConfirmDialog
        isOpen={voidOpen}
        onClose={() => {
          setVoidOpen(false);
          setSaleToVoid(null);
        }}
        onConfirm={() => {
          void confirmVoid();
        }}
        title="Void Sale Document?"
        message={
          saleToVoid
            ? `Void #${getDocRef(saleToVoid)}? ${
                saleToVoid.doc_type === 'quotation'
                  ? 'Quotations do not post stock/accounts.'
                  : 'This will reverse stock/account effects for this sale.'
              }`
            : 'Are you sure you want to void this sale?'
        }
        confirmText="Void Document"
        cancelText="Cancel"
        variant="warning"
        isLoading={loading}
      />

      <ConfirmDialog
        isOpen={convertOpen}
        onClose={() => {
          setConvertOpen(false);
          setSaleToConvert(null);
        }}
        onConfirm={() => {
          void confirmConvertQuotation();
        }}
        title="Convert Quotation?"
        message={
          saleToConvert
            ? `Convert quotation #${getDocRef(saleToConvert)} to invoice?`
            : 'Convert this quotation to invoice?'
        }
        confirmText="Convert"
        cancelText="Cancel"
        variant="info"
        isLoading={loading}
      />

      <ConfirmDialog
        isOpen={deleteOpen}
        onClose={() => {
          setDeleteOpen(false);
          setSaleToDelete(null);
        }}
        onConfirm={() => {
          void confirmDelete();
        }}
        title="Delete Document?"
        message={
          saleToDelete
            ? `Delete #${getDocRef(saleToDelete)}? This cannot be undone.`
            : 'This action cannot be undone.'
        }
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        isLoading={loading}
      />
    </div>
  );
};

export default Sales;
