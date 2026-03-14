import { useMemo, useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '../../components/ui/table/DataTable';
import { PageHeader } from '../../components/ui/layout';
import { useToast } from '../../components/ui/toast/Toast';
import { ConfirmDialog } from '../../components/ui/modal/ConfirmDialog';
import { Modal } from '../../components/ui/modal/Modal';
import { assetsService, CreateFixedAssetInput, FixedAsset } from '../../services/assets.service';

type AssetViewMode = 'list' | 'register';

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

const initialForm: CreateFixedAssetInput = {
  assetName: '',
  purchaseDate: '',
  cost: 0,
  status: 'active',
};

export default function Assets({
  embedded = false,
  registerInModal = false,
}: {
  embedded?: boolean;
  registerInModal?: boolean;
}) {
  const { showToast } = useToast();
  const [mode, setMode] = useState<AssetViewMode>('list');
  const [assets, setAssets] = useState<FixedAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasDisplayed, setHasDisplayed] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [form, setForm] = useState<CreateFixedAssetInput>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [editingAssetId, setEditingAssetId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FixedAsset | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [assetModalOpen, setAssetModalOpen] = useState(false);
  const useModalForm = embedded && registerInModal;

  const loadAssets = async () => {
    setHasDisplayed(true);
    setLoading(true);
    setError('');
    try {
      const response = await assetsService.list({
        search: search || undefined,
        status: statusFilter || undefined,
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

  const statuses = useMemo(
    () =>
      Array.from(
        new Set(assets.map((row) => row.status).filter(Boolean))
      ).sort((a, b) => a.localeCompare(b)),
    [assets]
  );

  const columns = useMemo<ColumnDef<FixedAsset>[]>(
    () => [
      { accessorKey: 'asset_name', header: 'Asset Name' },
      {
        accessorKey: 'purchase_date',
        header: 'Purchase Date',
        cell: ({ row }) => dateOnly(row.original.purchase_date),
      },
      {
        accessorKey: 'cost',
        header: 'Cost',
        cell: ({ row }) => money(row.original.cost),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => row.original.status || 'active',
      },
    ],
    []
  );

  const submitRegisterForm = async () => {
    if (!form.assetName?.trim()) {
      showToast('error', 'Assets', 'Asset name is required');
      return;
    }
    if (!form.purchaseDate) {
      showToast('error', 'Assets', 'Purchase date is required');
      return;
    }
    if (!Number.isFinite(Number(form.cost)) || Number(form.cost) <= 0) {
      showToast('error', 'Assets', 'Cost must be greater than 0');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        assetName: form.assetName.trim(),
        purchaseDate: form.purchaseDate,
        cost: Number(form.cost),
        status: form.status || 'active',
      };
      const response = editingAssetId
        ? await assetsService.update(editingAssetId, payload)
        : await assetsService.create(payload);
      if (!response.success) {
        showToast(
          'error',
          'Assets',
          response.error || response.message || `Failed to ${editingAssetId ? 'update' : 'register'} asset`
        );
        return;
      }
      showToast('success', 'Assets', editingAssetId ? 'Asset updated' : 'Asset registered');
      setForm(initialForm);
      setEditingAssetId(null);
      if (useModalForm) {
        setAssetModalOpen(false);
      } else {
        setMode('list');
      }
      setAssets([]);
      setHasDisplayed(false);
    } catch (e) {
      showToast('error', 'Assets', e instanceof Error ? e.message : 'Failed to save asset');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDeleteAsset = async () => {
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
      setAssets([]);
      setHasDisplayed(false);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      {!embedded ? (
        <PageHeader
          title="Assets"
          description="Manage fixed assets."
          actions={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setMode('list');
                  setEditingAssetId(null);
                  setAssets([]);
                  setHasDisplayed(false);
                }}
                className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                  mode === 'list'
                    ? 'border border-black bg-black text-white'
                    : 'border border-black bg-white text-black'
                }`}
              >
                Assets List
              </button>
              <button
                type="button"
                onClick={() => {
                  setForm(initialForm);
                  setEditingAssetId(null);
                  setMode('register');
                }}
                className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                  mode === 'register'
                    ? 'border border-black bg-black text-white'
                    : 'border border-black bg-white text-black'
                }`}
              >
                New Asset
              </button>
            </div>
          }
        />
      ) : (
        <div className="flex items-center justify-between rounded-xl border border-zinc-300 bg-white p-4 shadow-sm">
          <h3 className="text-base font-semibold text-black">Assets</h3>
          {useModalForm ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void loadAssets()}
                disabled={loading}
                className="rounded-lg border border-black bg-white px-3 py-2 text-xs font-semibold text-black disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'Loading...' : 'Display'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setForm(initialForm);
                  setEditingAssetId(null);
                  setAssetModalOpen(true);
                }}
                className="rounded-lg border border-black bg-black px-3 py-2 text-xs font-semibold text-white"
              >
                New Asset
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setMode('list');
                  setEditingAssetId(null);
                  setAssets([]);
                  setHasDisplayed(false);
                }}
                className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                  mode === 'list'
                    ? 'border border-black bg-black text-white'
                    : 'border border-black bg-white text-black'
                }`}
              >
                Assets List
              </button>
              <button
                type="button"
                onClick={() => {
                  setForm(initialForm);
                  setEditingAssetId(null);
                  setMode('register');
                }}
                className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                  mode === 'register'
                    ? 'border border-black bg-black text-white'
                    : 'border border-black bg-white text-black'
                }`}
              >
                New Asset
              </button>
            </div>
          )}
        </div>
      )}

      {useModalForm || mode === 'list' ? (
        <div className="space-y-4 rounded-xl border border-zinc-300 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="space-y-1 text-sm font-medium text-black">
              <span>Search</span>
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Asset name"
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-black focus:border-black focus:outline-none"
              />
            </label>
            <label className="space-y-1 text-sm font-medium text-black">
              <span>Status</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
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
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => void loadAssets()}
                disabled={loading}
                className="w-full rounded-md border border-black bg-black px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'Loading...' : 'Display'}
              </button>
            </div>
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
            onEdit={(row) => {
              setEditingAssetId(row.asset_id);
              setForm({
                assetName: row.asset_name,
                purchaseDate: row.purchase_date,
                cost: Number(row.cost || 0),
                status: row.status || 'active',
              });
              if (useModalForm) {
                setAssetModalOpen(true);
              } else {
                setMode('register');
              }
            }}
            onDelete={async (row) => {
              setDeleteTarget(row);
            }}
          />
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-300 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm font-medium text-black">
              <span>Asset Name *</span>
              <input
                type="text"
                value={form.assetName}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, assetName: event.target.value }))
                }
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-black focus:border-black focus:outline-none"
              />
            </label>
            <label className="space-y-1 text-sm font-medium text-black">
              <span>Purchase Date *</span>
              <input
                type="date"
                value={form.purchaseDate}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, purchaseDate: event.target.value }))
                }
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-black focus:border-black focus:outline-none"
              />
            </label>
            <label className="space-y-1 text-sm font-medium text-black">
              <span>Cost *</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.cost || ''}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, cost: Number(event.target.value) }))
                }
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-black focus:border-black focus:outline-none"
              />
            </label>
            <label className="space-y-1 text-sm font-medium text-black">
              <span>Status *</span>
              <select
                value={form.status || 'active'}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, status: event.target.value }))
                }
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-black focus:border-black focus:outline-none"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="disposed">Disposed</option>
              </select>
            </label>
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setForm(initialForm);
                setEditingAssetId(null);
                setMode('list');
              }}
              className="rounded-md border border-black bg-white px-4 py-2 text-sm font-semibold text-black"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void submitRegisterForm()}
              disabled={submitting}
              className="rounded-md border border-black bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-70"
            >
              {submitting ? 'Saving...' : editingAssetId ? 'Update Asset' : 'Save Asset'}
            </button>
          </div>
        </div>
      )}

      {useModalForm && (
        <Modal
          isOpen={assetModalOpen}
          onClose={() => {
            setAssetModalOpen(false);
            setEditingAssetId(null);
            setForm(initialForm);
          }}
          title={editingAssetId ? 'Edit Asset' : 'New Asset'}
          size="lg"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="space-y-1 text-sm font-medium text-black">
                <span>Asset Name *</span>
                <input
                  type="text"
                  value={form.assetName}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, assetName: event.target.value }))
                  }
                  className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-black focus:border-black focus:outline-none"
                />
              </label>
              <label className="space-y-1 text-sm font-medium text-black">
                <span>Purchase Date *</span>
                <input
                  type="date"
                  value={form.purchaseDate}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, purchaseDate: event.target.value }))
                  }
                  className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-black focus:border-black focus:outline-none"
                />
              </label>
              <label className="space-y-1 text-sm font-medium text-black">
                <span>Cost *</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.cost || ''}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, cost: Number(event.target.value) }))
                  }
                  className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-black focus:border-black focus:outline-none"
                />
              </label>
              <label className="space-y-1 text-sm font-medium text-black">
                <span>Status *</span>
                <select
                  value={form.status || 'active'}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, status: event.target.value }))
                  }
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
                  setForm(initialForm);
                }}
                className="rounded-md border border-black bg-white px-4 py-2 text-sm font-semibold text-black"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitRegisterForm()}
                disabled={submitting}
                className="rounded-md border border-black bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-70"
              >
                {submitting ? 'Saving...' : editingAssetId ? 'Update Asset' : 'Save Asset'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDeleteAsset}
        title="Delete Asset?"
        highlightedName={deleteTarget?.asset_name}
        message="This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        isLoading={deleting}
      />
    </div>
  );
}
