import { useEffect, useMemo, useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '../../components/ui/table/DataTable';
import { PageHeader } from '../../components/ui/layout';
import { useToast } from '../../components/ui/toast/Toast';
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

const dateTime = (value: string) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
};

const initialForm: CreateFixedAssetInput = {
  assetName: '',
  category: '',
  purchaseDate: '',
  cost: 0,
};

export default function Assets() {
  const { showToast } = useToast();
  const [mode, setMode] = useState<AssetViewMode>('list');
  const [assets, setAssets] = useState<FixedAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [form, setForm] = useState<CreateFixedAssetInput>(initialForm);
  const [submitting, setSubmitting] = useState(false);

  const loadAssets = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await assetsService.list({
        search: search || undefined,
        status: statusFilter || undefined,
        category: categoryFilter || undefined,
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

  useEffect(() => {
    if (mode === 'list') {
      void loadAssets();
    }
  }, [mode]);

  const categories = useMemo(
    () =>
      Array.from(
        new Set(assets.map((row) => row.category).filter(Boolean))
      ).sort((a, b) => a.localeCompare(b)),
    [assets]
  );

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
      { accessorKey: 'category', header: 'Category' },
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
        accessorKey: 'useful_life_months',
        header: 'Useful Life',
        cell: ({ row }) => {
          const months = Number(row.original.useful_life_months || 0);
          if (months % 12 === 0) {
            return `${months / 12} year(s)`;
          }
          return `${months} month(s)`;
        },
      },
      {
        accessorKey: 'depreciation_method',
        header: 'Depreciation Method',
        cell: ({ row }) =>
          row.original.depreciation_method === 'straight_line'
            ? 'Straight Line'
            : row.original.depreciation_method,
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => row.original.status || 'active',
      },
      {
        accessorKey: 'created_at',
        header: 'Created At',
        cell: ({ row }) => dateTime(row.original.created_at),
      },
    ],
    []
  );

  const submitRegisterForm = async () => {
    if (!form.assetName.trim()) {
      showToast('error', 'Assets', 'Asset name is required');
      return;
    }
    if (!form.category.trim()) {
      showToast('error', 'Assets', 'Category is required');
      return;
    }
    if (!form.purchaseDate) {
      showToast('error', 'Assets', 'Purchase date is required');
      return;
    }
    if (!Number.isFinite(form.cost) || Number(form.cost) <= 0) {
      showToast('error', 'Assets', 'Cost must be greater than 0');
      return;
    }
    setSubmitting(true);
    try {
      const response = await assetsService.create({
        ...form,
        cost: Number(form.cost),
      });
      if (!response.success) {
        showToast('error', 'Assets', response.error || response.message || 'Failed to register asset');
        return;
      }
      showToast('success', 'Assets', 'Fixed asset registered');
      setForm(initialForm);
      setMode('list');
      await loadAssets();
    } catch (e) {
      showToast('error', 'Assets', e instanceof Error ? e.message : 'Failed to register asset');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Assets"
        description="Manage fixed assets and review registered assets."
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setMode('list');
                void loadAssets();
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
              onClick={() => setMode('register')}
              className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                mode === 'register'
                  ? 'border border-black bg-black text-white'
                  : 'border border-black bg-white text-black'
              }`}
            >
              Fixed Assets
            </button>
          </div>
        }
      />

      {mode === 'list' ? (
        <div className="space-y-4 rounded-xl border border-zinc-300 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <label className="space-y-1 text-sm font-medium text-black">
              <span>Search</span>
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Asset name/category"
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
            <label className="space-y-1 text-sm font-medium text-black">
              <span>Category</span>
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-black focus:border-black focus:outline-none"
              >
                <option value="">All</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => void loadAssets()}
                className="w-full rounded-md border border-black bg-black px-3 py-2 text-sm font-semibold text-white"
              >
                Display
              </button>
            </div>
          </div>

          <DataTable
            data={assets}
            columns={columns}
            isLoading={loading}
            error={error || null}
            searchPlaceholder="Search assets..."
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
              <span>Category *</span>
              <input
                type="text"
                value={form.category}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, category: event.target.value }))
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
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setForm(initialForm);
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
              {submitting ? 'Saving...' : 'Save Asset'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
