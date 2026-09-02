import { useMemo, useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '../../../components/ui/table/DataTable';
import { PageHeader } from '../../../components/ui/layout';
import { useToast } from '../../../components/ui/toast/Toast';
import { AccountsReceivableRow, financialReportsService } from '../../../services/reports/financialReports.service';
import { defaultAsOfDate, truncationNote } from '../reportUtils';
import { useBranch } from '../../../context/BranchContext';

const money = (value: number) =>
  `$${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatDate = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString();
};

export default function AccountsReceivableReportPage() {
  const { showToast } = useToast();
  const { activeBranchId } = useBranch();
  const [asOfDate, setAsOfDate] = useState(defaultAsOfDate());
  const [rows, setRows] = useState<AccountsReceivableRow[]>([]);
  const [meta, setMeta] = useState<{ truncated?: boolean; maxRows?: number; rowCount?: number }>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasDisplayed, setHasDisplayed] = useState(false);

  const loadReport = async () => {
    if (!asOfDate) {
      showToast('error', 'Accounts Receivable', 'As-of date is required');
      return;
    }

    setLoading(true);
    setHasDisplayed(true);
    setError('');
    try {
      const response = await financialReportsService.getAccountsReceivable({
        asOfDate,
        branchId: activeBranchId ?? undefined,
      });
      if (!response.success || !response.data) {
        setRows([]);
        setMeta(undefined);
        setError(response.error || response.message || 'Failed to load receivable report');
        return;
      }
      setRows(response.data.rows || []);
      setMeta(response.data.meta);
    } catch (e) {
      setRows([]);
      setMeta(undefined);
      setError(e instanceof Error ? e.message : 'Failed to load receivable report');
    } finally {
      setLoading(false);
    }
  };

  const trunc = truncationNote(meta, rows.length);

  const columns = useMemo<ColumnDef<AccountsReceivableRow>[]>(
    () => [
      { accessorKey: 'customer_name', header: 'Customer' },
      { accessorKey: 'invoice_no', header: 'Invoice No' },
      {
        accessorKey: 'invoice_date',
        header: 'Invoice Date',
        cell: ({ row }) => formatDate(row.original.invoice_date),
      },
      {
        accessorKey: 'due_date',
        header: 'Due Date',
        cell: ({ row }) => formatDate(row.original.due_date),
      },
      {
        accessorKey: 'amount',
        header: 'Amount',
        cell: ({ row }) => money(row.original.amount),
      },
      {
        accessorKey: 'paid',
        header: 'Paid',
        cell: ({ row }) => money(row.original.paid),
      },
      {
        accessorKey: 'balance',
        header: 'Balance',
        cell: ({ row }) => money(row.original.balance),
      },
      { accessorKey: 'status', header: 'Status' },
    ],
    []
  );

  const totals = useMemo(() => {
    const totalOutstanding = rows.reduce((sum, row) => sum + Number(row.balance || 0), 0);
    const overdue = rows
      .filter((row) => String(row.status).toLowerCase() === 'overdue')
      .reduce((sum, row) => sum + Number(row.balance || 0), 0);
    const paid = rows.reduce((sum, row) => sum + Number(row.paid || 0), 0);
    return { totalOutstanding, overdue, paid };
  }, [rows]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Accounts Receivable Report"
        description="Outstanding customer invoices as of a specific date."
      />

      <div className="rounded-xl border border-zinc-300 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <label htmlFor="ar-as-of-date" className="space-y-1 text-sm font-medium text-black">
            <span>As of Date</span>
            <input
              id="ar-as-of-date"
              type="date"
              value={asOfDate}
              onChange={(event) => setAsOfDate(event.target.value)}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-black focus:border-black focus:outline-none"
            />
          </label>
          <div className="md:col-span-3 flex items-end">
            <button
              type="button"
              onClick={() => void loadReport()}
              disabled={loading}
              className="w-full min-h-11 rounded-md border border-black bg-black px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Loading...' : 'Display'}
            </button>
          </div>
        </div>
      </div>

      {trunc && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {trunc}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-zinc-300 bg-white p-3 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-600">Total Outstanding</div>
          <div className="mt-1 text-2xl font-bold text-black">{money(totals.totalOutstanding)}</div>
        </div>
        <div className="rounded-lg border border-zinc-300 bg-white p-3 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-600">Overdue</div>
          <div className="mt-1 text-2xl font-bold text-black">{money(totals.overdue)}</div>
        </div>
        <div className="rounded-lg border border-zinc-300 bg-white p-3 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-600">Paid</div>
          <div className="mt-1 text-2xl font-bold text-black">{money(totals.paid)}</div>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-300 bg-white p-4 shadow-sm">
        {!hasDisplayed && !loading && (
          <div className="mb-3 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
            Click <span className="font-semibold">Display</span> to load data.
          </div>
        )}
        {hasDisplayed && !loading && rows.length === 0 && (
          <div className="mb-3 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
            No data found for the selected filters.
          </div>
        )}
        <DataTable
          data={hasDisplayed ? rows : []}
          columns={columns}
          isLoading={loading}
          error={error || null}
          searchPlaceholder="Search receivables..."
        />
      </div>
    </div>
  );
}
