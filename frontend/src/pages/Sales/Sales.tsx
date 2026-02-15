import { useCallback, useEffect, useMemo, useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { Ban, Edit3, FileCheck2, Printer, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router';
import { PageHeader, TabActionToolbar } from '../../components/ui/layout';
import { DataTable } from '../../components/ui/table/DataTable';
import Badge from '../../components/ui/badge/Badge';
import { useToast } from '../../components/ui/toast/Toast';
import { Sale, SaleItem, salesService } from '../../services/sales.service';

const formatMoney = (value: number) => `$${Number(value || 0).toFixed(2)}`;

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const buildPrintableInvoice = (sale: Sale, items: SaleItem[]) => {
  const docLabel = sale.doc_type === 'quotation' ? 'Quotation' : 'Invoice';
  const docNo = `S-${sale.sale_id}`;
  const date = new Date(sale.sale_date).toLocaleString();
  const customer = sale.customer_name || 'Walking Customer';
  const paidAmount = Number(sale.paid_amount || 0);
  const balance = Math.max(Number(sale.total || 0) - paidAmount, 0);
  const safeNote = escapeHtml(String(sale.note || ''));

  const itemRows = items
    .map((line, idx) => {
      const qty = Number(line.quantity || 0);
      const unitPrice = Number(line.unit_price || 0);
      const lineTotal = Number(line.line_total || qty * unitPrice);
      const itemLabel = line.product_name
        ? `${escapeHtml(line.product_name)} (ID ${line.product_id})`
        : `Item ${line.product_id}`;
      return `
        <tr>
          <td>${idx + 1}</td>
          <td>${itemLabel}</td>
          <td>${qty.toFixed(3)}</td>
          <td>$${unitPrice.toFixed(2)}</td>
          <td>$${lineTotal.toFixed(2)}</td>
        </tr>
      `;
    })
    .join('');

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${docLabel} ${docNo}</title>
        <style>
          * { box-sizing: border-box; font-family: Arial, sans-serif; }
          body { margin: 24px; color: #0f172a; }
          .header { display: flex; justify-content: space-between; align-items: start; margin-bottom: 18px; }
          .brand { font-size: 22px; font-weight: 700; }
          .doc-type { font-size: 14px; color: #475569; margin-top: 6px; }
          .meta { margin-bottom: 16px; font-size: 14px; display: grid; gap: 6px; }
          .meta b { color: #0f172a; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; font-size: 13px; }
          th { background: #f8fafc; }
          .totals { margin-top: 16px; margin-left: auto; width: 320px; }
          .totals-row { display: flex; justify-content: space-between; border-bottom: 1px solid #e2e8f0; padding: 6px 0; font-size: 14px; }
          .totals-row.total { font-weight: 700; font-size: 16px; }
          .note { margin-top: 16px; font-size: 13px; color: #334155; white-space: pre-wrap; }
          .footer { margin-top: 28px; font-size: 12px; color: #64748b; text-align: center; }
          .void { color: #b91c1c; font-weight: 700; margin-top: 8px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="brand">KeydMaal MS</div>
            <div class="doc-type">${docLabel}</div>
          </div>
          <div>
            <div><b>No:</b> ${docNo}</div>
            <div><b>Date:</b> ${escapeHtml(date)}</div>
          </div>
        </div>

        <div class="meta">
          <div><b>Customer:</b> ${escapeHtml(customer)}</div>
          <div><b>Status:</b> ${escapeHtml(sale.status)}</div>
          <div><b>Type:</b> ${escapeHtml(sale.sale_type)}</div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 60px;">#</th>
              <th>Item ID</th>
              <th style="width: 120px;">Qty</th>
              <th style="width: 140px;">Unit Price</th>
              <th style="width: 160px;">Line Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemRows || '<tr><td colspan="5">No items</td></tr>'}
          </tbody>
        </table>

        <div class="totals">
          <div class="totals-row"><span>Subtotal</span><span>${formatMoney(sale.subtotal)}</span></div>
          <div class="totals-row"><span>Discount</span><span>${formatMoney(sale.discount)}</span></div>
          <div class="totals-row"><span>Paid</span><span>${formatMoney(paidAmount)}</span></div>
          <div class="totals-row"><span>Balance</span><span>${formatMoney(balance)}</span></div>
          <div class="totals-row total"><span>Total</span><span>${formatMoney(sale.total)}</span></div>
        </div>

        ${safeNote ? `<div class="note"><b>Note:</b> ${safeNote}</div>` : ''}
        ${sale.status === 'void' ? '<div class="void">VOIDED DOCUMENT</div>' : ''}

        <div class="footer">
          Printed from KeydMaal ERP - ${new Date().toLocaleString()}
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

  const loadSales = useCallback(async () => {
    setLoading(true);
    const res = await salesService.list({ includeVoided: true });
    if (res.success && res.data?.sales) {
      setSales(res.data.sales);
    } else {
      showToast('error', 'Sales', res.error || 'Failed to load sales');
    }
    setLoading(false);
  }, [showToast]);

  useEffect(() => {
    void loadSales();
  }, [loadSales]);

  const printSaleInvoice = useCallback(
    async (sale: Sale) => {
      const res = await salesService.get(sale.sale_id);
      if (!res.success || !res.data?.sale) {
        showToast('error', 'Sales', res.error || 'Failed to load sale details');
        return;
      }

      const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=1100,height=800');
      if (!printWindow) {
        showToast('error', 'Sales', 'Allow popups to print invoice');
        return;
      }

      const html = buildPrintableInvoice(res.data.sale, res.data.items || []);
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 200);
    },
    [showToast]
  );

  const handleVoid = useCallback(
    async (sale: Sale) => {
      const ok = window.confirm(
        `Void #S-${sale.sale_id}? This will reverse stock/account effects for this sale.`
      );
      if (!ok) return;
      const res = await salesService.void(sale.sale_id, 'Voided from sales list');
      if (res.success) {
        showToast('success', 'Sales', 'Document voided');
        await loadSales();
      } else {
        showToast('error', 'Sales', res.error || 'Failed to void');
      }
    },
    [loadSales, showToast]
  );

  const handleConvertQuotation = useCallback(
    async (sale: Sale) => {
      const ok = window.confirm(`Convert quotation #S-${sale.sale_id} to invoice?`);
      if (!ok) return;
      const res = await salesService.convertQuotation(sale.sale_id, { status: 'unpaid' });
      if (res.success) {
        showToast('success', 'Sales', 'Quotation converted to invoice');
        await loadSales();
      } else {
        showToast('error', 'Sales', res.error || 'Failed to convert quotation');
      }
    },
    [loadSales, showToast]
  );

  const handleDelete = useCallback(
    async (sale: Sale) => {
      const ok = window.confirm(`Delete #S-${sale.sale_id}? This cannot be undone.`);
      if (!ok) return;
      const res = await salesService.remove(sale.sale_id);
      if (res.success) {
        showToast('success', 'Sales', 'Document deleted');
        await loadSales();
      } else {
        showToast('error', 'Sales', res.error || 'Delete failed');
      }
    },
    [loadSales, showToast]
  );

  const columns: ColumnDef<Sale>[] = useMemo(
    () => [
      {
        accessorKey: 'sale_id',
        header: 'Doc #',
        cell: ({ row }) => `S-${row.original.sale_id}`,
      },
      {
        accessorKey: 'sale_date',
        header: 'Date',
        cell: ({ row }) => new Date(row.original.sale_date).toLocaleString(),
      },
      {
        accessorKey: 'doc_type',
        header: 'Document',
        cell: ({ row }) => (
          <span className="capitalize font-medium text-slate-700 dark:text-slate-200">
            {row.original.doc_type}
          </span>
        ),
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
                title="Print invoice"
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
                  onClick={() => void handleVoid(sale)}
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
    [handleConvertQuotation, handleDelete, handleVoid, navigate, printSaleInvoice]
  );

  return (
    <div>
      <PageHeader
        title="Sales Management"
        description="Manage all sales documents in one table and print invoice directly from actions."
      />

      <div className="space-y-2">
        <TabActionToolbar
          title="Sales Documents"
          primaryAction={{ label: 'New Sale', onClick: () => navigate('/sales/new?docType=sale') }}
          onDisplay={() => void loadSales()}
        />
        <DataTable
          data={sales}
          columns={columns}
          isLoading={loading}
          searchPlaceholder="Search by customer or note..."
        />
      </div>
    </div>
  );
};

export default Sales;
