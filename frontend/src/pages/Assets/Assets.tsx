import { useMemo, useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '../../components/ui/table/DataTable';
import { PageHeader } from '../../components/ui/layout';
import { useToast } from '../../components/ui/toast/Toast';
import { ConfirmDialog } from '../../components/ui/modal/ConfirmDialog';
import { Modal } from '../../components/ui/modal/Modal';
import { assetsService, Asset, AssetState, AssetType } from '../../services/assets.service';
import { defaultDateRange } from '../../utils/dateRange';

const money = (value: number) =>
  `$${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const dateOnly = (value: string) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString();
};

const today = () => new Date().toISOString().slice(0, 10);

type AssetForm = {
  assetName: string;
  type: AssetType;
  purchasedDate: string;
  amount: string;
  state: AssetState;
};

const emptyForm = (type: AssetType): AssetForm => ({
  assetName: '',
  type,
  purchasedDate: today(),
  amount: '',
  state: 'active',
});

export default function Assets() {
  const { showToast } = useToast();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasDisplayed, setHasDisplayed] = useState(false);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'' | AssetType>('');
  const [stateFilter, setStateFilter] = useState<'' | AssetState>('');
  const [dateRange, setDateRange] = useState(() => defaultDateRange());

  const [assetModalOpen, setAssetModalOpen] = useState(false);
  const [form, setForm] = useState<AssetForm>(() => emptyForm('fixed'));
  const [editingAssetId, setEditingAssetId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Asset | null>(null);
  const [deleting, setDeleting] = useState(false);

  const statuses = useMemo(
    () =>
      Array.from(new Set(assets.map((row) => row.state).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b)
      ),
    [assets]
  );

  const loadAssets = async () => {
    if ((dateRange.fromDate && !dateRange.toDate) || (!dateRange.fromDate && dateRange.toDate)) {
      showToast('error', 'Assets', 'Both From Date and To Date are required together');
      return;
    }
    if (dateRange.fromDate && dateRange.toDate && dateRange.fromDate > dateRange.toDate) {
      showToast('error', 'Assets', 'From date cannot be after To date');
      return;
    }

    setHasDisplayed(true);
    setLoading(true);
    setError('');

    try {
      const response = await assetsService.list({
        search: search || undefined,
        type: typeFilter || undefined,
        state: stateFilter || undefined,
        fromDate: dateRange.fromDate || undefined,
        toDate: dateRange.toDate || undefined,
      });
      if (!response.success || !response.data?.assets) {
        setAssets([]);
        setError(response.error || response.message || 'Failed to load assets');
        return;
      }
      setAssets(response.data.assets);
    } catch (e) {
      setAssets([]);
      setError(e instanceof Error ? e.message : 'Failed to load assets');
    } finally {
      setLoading(false);
    }
  };

  const columns = useMemo<ColumnDef<Asset>[]>(
    () => [
      { accessorKey: 'asset_name', header: 'Asset Name' },
      {
        accessorKey: 'asset_type',
        header: 'Type',
        cell: ({ row }) => (row.original.asset_type === 'fixed' ? 'Fixed' : 'Current'),
      },
      {
        accessorKey: 'purchased_date',
        header: 'Purchased Date',
        cell: ({ row }) => dateOnly(row.original.purchased_date),
      },
      {
        accessorKey: 'amount',
        header: 'Amount',
        cell: ({ row }) => money(row.original.amount),
      },
      {
        accessorKey: 'state',
        header: 'State',
        cell: ({ row }) => (row.original.state || 'active').toString(),
      },
    ],
    []
  );

  const openCreate = (type: AssetType) => {
    setEditingAssetId(null);
    setForm(emptyForm(type));
    setAssetModalOpen(true);
  };

  const openEdit = (asset: Asset) => {
    setEditingAssetId(asset.asset_id);
    setForm({
      assetName: asset.asset_name || '',
      type: asset.asset_type || 'current',
      purchasedDate: (asset.purchased_date || '').slice(0, 10) || today(),
      amount: String(Number(asset.amount || 0)),
      state: (asset.state || 'active') as AssetState,
    });
    setAssetModalOpen(true);
  };

  const submitAsset = async () => {
    if (!form.assetName.trim()) {
      showToast('error', 'Assets', 'Asset name is required');
      return;
    }

    const amount = form.amount.trim() === '' ? 0 : Number(form.amount);
    if (!Number.isFinite(amount)) {
      showToast('error', 'Assets', 'Amount is invalid');
      return;
    }
    if (amount < 0) {
      showToast('error', 'Assets', 'Amount cannot be negative');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        assetName: form.assetName.trim(),
        type: form.type,
        purchasedDate: form.purchasedDate ? form.purchasedDate : undefined,
        amount,
        state: form.state || 'active',
      };

      const response = editingAssetId
        ? await assetsService.update(editingAssetId, payload)
        : await assetsService.create(payload);

      if (!response.success) {
        showToast('error', 'Assets', response.error || response.message || 'Failed to save asset');
        return;
      }

      showToast('success', 'Assets', editingAssetId ? 'Asset updated' : 'Asset created');
      setAssetModalOpen(false);
      setEditingAssetId(null);
      setForm(emptyForm('fixed'));
      if (hasDisplayed) {
        await loadAssets();
      }
    } catch (e) {
      showToast('error', 'Assets', e instanceof Error ? e.message : 'Failed to save asset');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const response = await assetsService.delete(deleteTarget.asset_id);
      if (!response.success) {
        showToast('error', 'Assets', response.error || response.message || 'Failed to delete asset');
        return;
      }
      showToast('success', 'Assets', 'Asset deleted');
      setDeleteTarget(null);
      if (hasDisplayed) {
        await loadAssets();
      }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Assets"
        description="Manage current and fixed assets register."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void loadAssets()}
              disabled={loading}
              className="rounded-lg border border-black bg-white px-4 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Loading...' : 'Display'}
            </button>
            <button
              type="button"
              onClick={() => openCreate('current')}
              className="rounded-lg border border-black bg-black px-4 py-2 text-sm font-semibold text-white"
            >
              New Current Asset
            </button>
            <button
              type="button"
              onClick={() => openCreate('fixed')}
              className="rounded-lg border border-black bg-black px-4 py-2 text-sm font-semibold text-white"
            >
              New Fixed Asset
            </button>
          </div>
        }
      />

      <div className="space-y-4 rounded-xl border border-zinc-300 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <label className="space-y-1 text-sm font-medium text-black md:col-span-2">
            <span>Search</span>
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search asset name..."
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-black focus:border-black focus:outline-none"
            />
          </label>
          <label className="space-y-1 text-sm font-medium text-black">
            <span>Type</span>
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value as any)}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-black focus:border-black focus:outline-none"
            >
              <option value="">All</option>
              <option value="current">Current</option>
              <option value="fixed">Fixed</option>
            </select>
          </label>
          <label className="space-y-1 text-sm font-medium text-black">
            <span>State</span>
            <select
              value={stateFilter}
              onChange={(event) => setStateFilter(event.target.value as any)}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-black focus:border-black focus:outline-none"
            >
              <option value="">All</option>
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm font-medium text-black">
            <span>From Date</span>
            <input
              type="date"
              value={dateRange.fromDate}
              onChange={(event) => setDateRange((prev) => ({ ...prev, fromDate: event.target.value }))}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-black focus:border-black focus:outline-none"
            />
          </label>
          <label className="space-y-1 text-sm font-medium text-black">
            <span>To Date</span>
            <input
              type="date"
              value={dateRange.toDate}
              onChange={(event) => setDateRange((prev) => ({ ...prev, toDate: event.target.value }))}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-black focus:border-black focus:outline-none"
            />
          </label>
        </div>

        {!hasDisplayed && !loading && (
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
            Click <span className="font-semibold">Display</span> to load data.
          </div>
        )}
        {hasDisplayed && !loading && assets.length === 0 && (
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
            No data found for the selected filters.
          </div>
        )}

        <DataTable
          data={hasDisplayed ? assets : []}
          columns={columns}
          isLoading={loading}
          error={error || null}
          searchPlaceholder="Search assets..."
          onEdit={(row) => openEdit(row as Asset)}
          onDelete={(row) => setDeleteTarget(row as Asset)}
        />
      </div>

      <Modal
        isOpen={assetModalOpen}
        onClose={() => {
          setAssetModalOpen(false);
          setEditingAssetId(null);
          setForm(emptyForm('fixed'));
        }}
        title={editingAssetId ? 'Edit Asset' : form.type === 'fixed' ? 'New Fixed Asset' : 'New Current Asset'}
        size="lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm font-medium text-black md:col-span-2">
              <span>Asset Name *</span>
              <input
                type="text"
                value={form.assetName}
                onChange={(event) => setForm((prev) => ({ ...prev, assetName: event.target.value }))}
                placeholder={form.type === 'fixed' ? 'e.g. Office Building' : 'e.g. Cash @ Merchant'}
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-black focus:border-black focus:outline-none"
              />
            </label>
            <label className="space-y-1 text-sm font-medium text-black">
              <span>Purchased Date</span>
              <input
                type="date"
                value={form.purchasedDate}
                onChange={(event) => setForm((prev) => ({ ...prev, purchasedDate: event.target.value }))}
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-black focus:border-black focus:outline-none"
              />
            </label>
            <label className="space-y-1 text-sm font-medium text-black">
              <span>Amount</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
                placeholder="0.00"
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-black focus:border-black focus:outline-none"
              />
            </label>
            <label className="space-y-1 text-sm font-medium text-black">
              <span>State</span>
              <select
                value={form.state}
                onChange={(event) => setForm((prev) => ({ ...prev, state: event.target.value as AssetState }))}
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-black focus:border-black focus:outline-none"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="disposed">Disposed</option>
              </select>
            </label>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setAssetModalOpen(false);
                setEditingAssetId(null);
                setForm(emptyForm('fixed'));
              }}
              className="rounded-md border border-black bg-white px-4 py-2 text-sm font-semibold text-black"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void submitAsset()}
              disabled={submitting}
              className="rounded-md border border-black bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-70"
            >
              {submitting ? 'Saving...' : editingAssetId ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
        title="Delete Asset?"
        highlightedName={deleteTarget?.asset_name || undefined}
        message="This action will remove the asset from the register."
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        isLoading={deleting}
      />
    </div>
  );
}

