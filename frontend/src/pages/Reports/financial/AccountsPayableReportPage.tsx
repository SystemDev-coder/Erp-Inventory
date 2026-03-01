import { useEffect, useMemo, useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '../../../components/ui/table/DataTable';
import { PageHeader } from '../../../components/ui/layout';
import { useToast } from '../../../components/ui/toast/Toast';
import { AccountsPayableRow, financialReportsService } from '../../../services/reports/financialReports.service';
import { defaultReportRange } from '../reportUtils';

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

export default function AccountsPayableReportPage() {
  const { showToast } = useToast();
  const [range, setRange] = useState(defaultReportRange());
  const [rows, setRows] = useState<AccountsPayableRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadReport = async () => {
    if (!range.fromDate || !range.toDate) {
      showToast('error', 'Accounts Payable', 'From and To dates are required');
      return;
    }
    if (range.fromDate > range.toDate) {
      showToast('error', 'Accounts Payable', 'From date cannot be after To date');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const response = await financialReportsService.getAccountsPayable(range);
      if (!response.success || !response.data) {
        setRows([]);
        setError(response.error || response.message || 'Failed to load payable report');
        return;
      }
      setRows(response.data.rows || []);
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : 'Failed to load payable report');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadReport();
  }, []);

  const columns = useMemo<ColumnDef<AccountsPayableRow>[]>(
    () => [
      { accessorKey: 'supplier_name', header: 'Supplier' },
      { accessorKey: 'bill_no', header: 'Bill No' },
      {
        accessorKey: 'bill_date',
        header: 'Bill Date',
        cell: ({ row }) => formatDate(row.original.bill_date),
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
    const settled = rows.reduce((sum, row) => sum + Number(row.paid || 0), 0);
    return { totalOutstanding, overdue, settled };
  }, [rows]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Accounts Payable Report"
        description="Outstanding supplier bills and settlement status."
      />

      <div className="rounded-xl border border-zinc-300 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <label className="space-y-1 text-sm font-medium text-black">
            <span>From Date</span>
            <input
              type="date"
              value={range.fromDate}
              onChange={(event) =>
                setRange((prev) => ({ ...prev, fromDate: event.target.value }))
              }
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-black focus:border-black focus:outline-none"
            />
          </label>
          <label className="space-y-1 text-sm font-medium text-black">
            <span>To Date</span>
            <input
              type="date"
              value={range.toDate}
              onChange={(event) =>
                setRange((prev) => ({ ...prev, toDate: event.target.value }))
              }
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-black focus:border-black focus:outline-none"
            />
          </label>
          <div className="md:col-span-2 flex items-end">
            <button
              type="button"
              onClick={() => void loadReport()}
              className="w-full rounded-md border border-black bg-black px-4 py-2 text-sm font-semibold text-white"
            >
              Display
            </button>
          </div>
        </div>
      </div>

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
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-600">Settled</div>
          <div className="mt-1 text-2xl font-bold text-black">{money(totals.settled)}</div>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-300 bg-white p-4 shadow-sm">
        <DataTable
          data={rows}
          columns={columns}
          isLoading={loading}
          error={error || null}
          searchPlaceholder="Search payables..."
        />
      </div>
    </div>
  );
}

