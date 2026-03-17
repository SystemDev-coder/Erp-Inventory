import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../../components/ui/layout';
import { useToast } from '../../components/ui/toast/Toast';
import { trashService, TrashModule, TrashRow } from '../../services/trash.service';
import { DataTable } from '../../components/ui/table/DataTable';
import { ConfirmDialog } from '../../components/ui/modal/ConfirmDialog';

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

export default function Trash() {
  const { showToast } = useToast();
  const [modules, setModules] = useState<TrashModule[]>([]);
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [rows, setRows] = useState<TrashRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<TrashRow | null>(null);
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false);

  const moduleLabelByKey = useMemo(() => new Map(modules.map((m) => [m.key, m.label])), [modules]);

  const requestRestore = useCallback((row: TrashRow) => {
    setRestoreTarget(row);
    setRestoreConfirmOpen(true);
  }, []);

  const columns = useMemo(
    () => [
      {
        accessorKey: 'table',
        header: 'Module',
        cell: ({ row }: any) => moduleLabelByKey.get(row.original.table || selectedTable) || row.original.table || '-',
      },
      { accessorKey: 'id', header: 'ID' },
      { accessorKey: 'label', header: 'Name / Reference' },
      {
        accessorKey: 'deleted_by',
        header: 'Deleted By',
        cell: ({ row }: any) => row.original.deleted_by || '-',
      },
      {
        accessorKey: 'deleted_at',
        header: 'Deleted At',
        cell: ({ row }: any) => formatDate(row.original.deleted_logged_at || row.original.deleted_at),
      },
      { accessorKey: 'created_at', header: 'Created At', cell: ({ row }: any) => formatDate(row.original.created_at) },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }: any) => (
          <button
            type="button"
            onClick={() => requestRestore(row.original)}
            className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
          >
            Restore
          </button>
        ),
      },
    ],
    [moduleLabelByKey, requestRestore, selectedTable]
  );

  const loadTables = async () => {
    const res = await trashService.listTables();
    if (res.success && res.data?.tables) {
      setTables(res.data.tables);
      setModules(res.data.modules || []);
      return;
    }
    showToast('error', 'Trash', res.error || 'Failed to load tables');
  };

  const loadRows = async () => {
    if (!selectedTable) return;
    if (!fromDate || !toDate) {
      showToast('warning', 'Trash', 'Please select a From Date and To Date');
      return;
    }
    setLoading(true);
    const res = await trashService.listRows({
      table: selectedTable,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      limit: 200,
      offset: 0,
    });
    setLoading(false);
    if (res.success && res.data) {
      setRows(res.data.rows || []);
      setTotal(res.data.total || 0);
      return;
    }
    showToast('error', 'Trash', res.error || 'Failed to load deleted records');
  };

  const restoreRow = async (row: TrashRow) => {
    const tableName = row.table || selectedTable;
    if (!tableName) {
      showToast('error', 'Trash', 'Table is missing for this record');
      return;
    }
    const res = await trashService.restore(tableName, row.id);
    if (!res.success) {
      showToast('error', 'Trash', res.error || 'Failed to restore');
      return;
    }
    showToast('success', 'Trash', 'Record restored');
    await loadRows();
  };

  useEffect(() => {
    void loadTables();
  }, []);

  return (
    <div className="space-y-4">
      <PageHeader title="Trash" description="Restore deleted records (admin only)." />

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">Module</label>
            <select
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={selectedTable}
              onChange={(e) => setSelectedTable(e.target.value)}
            >
              <option value="" disabled>
                Select your module
              </option>
              {modules.length > 0
                ? modules.map((module) => (
                    <option key={module.key} value={module.key}>
                      {module.label}
                    </option>
                  ))
                : tables.map((table) => (
                    <option key={table} value={table}>
                      {table}
                    </option>
                  ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">From Date</label>
            <input
              type="date"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">To Date</label>
            <input
              type="date"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={loadRows}
              disabled={!fromDate || !toDate || !selectedTable}
              className="w-full rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700"
            >
              Apply Filter
            </button>
          </div>
        </div>
        <div className="mt-3 text-xs text-slate-500">Showing {rows.length} of {total} deleted records.</div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <DataTable data={rows} columns={columns} isLoading={loading} searchPlaceholder="Search deleted records..." />
      </div>

      <ConfirmDialog
        isOpen={restoreConfirmOpen}
        onClose={() => {
          setRestoreConfirmOpen(false);
          setRestoreTarget(null);
        }}
        onConfirm={() => {
          if (!restoreTarget) return;
          void restoreRow(restoreTarget);
        }}
        title="Restore Record"
        highlightedName={restoreTarget?.label || (restoreTarget ? `ID: ${restoreTarget.id}` : undefined)}
        message="Are you sure you want to restore this record? It will appear again in the system."
        confirmText="Yes, Restore"
        cancelText="No"
        variant="info"
      />
    </div>
  );
}
