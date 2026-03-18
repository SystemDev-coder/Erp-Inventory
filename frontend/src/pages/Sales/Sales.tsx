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
import { Sale, salesService } from '../../services/sales.service';
import { defaultDateRange } from '../../utils/dateRange';

const formatMoney = (value: number) => `$${Number(value || 0).toFixed(2)}`;

const getDocRef = (sale: Pick<Sale, 'sale_id' | 'doc_type'>) => {
  const docType = sale.doc_type || 'sale';
  if (docType === 'quotation') return `Q-${sale.sale_id}`;
  if (docType === 'invoice') return `INV-${sale.sale_id}`;
  return `S-${sale.sale_id}`;
};

const Sales = () => {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [sales, setSales] = useState<Sale[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [dateRange, setDateRange] = useState(() => defaultDateRange());
  const [voidOpen, setVoidOpen] = useState(false);
  const [saleToVoid, setSaleToVoid] = useState<Sale | null>(null);
  const [convertOpen, setConvertOpen] = useState(false);
  const [saleToConvert, setSaleToConvert] = useState<Sale | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [saleToDelete, setSaleToDelete] = useState<Sale | null>(null);

  const loadSales = useCallback(async () => {
    setLoading(true);
    const res = await salesService.list({ includeVoided: true, fromDate: dateRange.fromDate, toDate: dateRange.toDate });
    if (res.success && res.data?.sales) {
      setSales(res.data.sales);
      setHasLoaded(true);
    } else {
      showToast('error', 'Sales', res.error || 'Failed to load sales');
    }
    setLoading(false);
  }, [showToast, dateRange.fromDate, dateRange.toDate]);

  const printSaleInvoice = useCallback(
    async (sale: Sale) => {
      try {
        if (!sale.customer_id) {
          showToast('error', 'Print Failed', 'Please select a customer before printing.');
          return;
        }

        const printRes = await salesService.getPrintHtml(sale.sale_id);
        if (!printRes.success || !printRes.data?.html) {
          showToast('error', 'Print Failed', printRes.error || 'Unable to load print template');
          return;
        }

        const html = printRes.data.html;
         
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
        showToast('error', 'Print Failed', 'Unable to generate document');
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
                  dateRange={{
                    fromDate: dateRange.fromDate,
                    toDate: dateRange.toDate,
                    onFromDateChange: (value) => {
                      setDateRange((prev) => ({ ...prev, fromDate: value }));
                      setHasLoaded(false);
                    },
                    onToDateChange: (value) => {
                      setDateRange((prev) => ({ ...prev, toDate: value }));
                      setHasLoaded(false);
                    },
                  }}
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
                  dateRange={{
                    fromDate: dateRange.fromDate,
                    toDate: dateRange.toDate,
                    onFromDateChange: (value) => {
                      setDateRange((prev) => ({ ...prev, fromDate: value }));
                      setHasLoaded(false);
                    },
                    onToDateChange: (value) => {
                      setDateRange((prev) => ({ ...prev, toDate: value }));
                      setHasLoaded(false);
                    },
                  }}
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

