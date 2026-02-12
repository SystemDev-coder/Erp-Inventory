import { useEffect, useMemo, useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { ListChecks } from 'lucide-react';
import { PageHeader, TabActionToolbar } from '../../components/ui/layout';
import { DataTable } from '../../components/ui/table/DataTable';
import Badge from '../../components/ui/badge/Badge';
import { useToast } from '../../components/ui/toast/Toast';
import { purchaseService, PurchaseItemView } from '../../services/purchase.service';
import { supplierService, Supplier } from '../../services/supplier.service';

const debounce = (fn: (...args: any[]) => void, wait = 300) => {
  let t: ReturnType<typeof setTimeout> | null = null;
  const wrapped = (...args: any[]) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
  wrapped.cancel = () => { if (t) clearTimeout(t); t = null; };
  return wrapped as typeof fn & { cancel: () => void };
};

const Products = () => {
  const { showToast } = useToast();
  const [items, setItems] = useState<PurchaseItemView[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [supplierFilter, setSupplierFilter] = useState<number | 'all'>('all');

  const fetchData = async (term?: string, supplierId?: number | 'all') => {
    setLoading(true);
    const [iRes, sRes] = await Promise.all([
      purchaseService.listItems({
        search: term,
        supplierId: supplierId && supplierId !== 'all' ? supplierId : undefined,
      }),
      supplierService.list(),
    ]);
    if (iRes.success && iRes.data?.items) {
      setItems(iRes.data.items);
    } else {
      showToast('error', 'Load failed', iRes.error || 'Could not load items');
    }
    if (sRes.success && sRes.data?.suppliers) {
      setSuppliers(sRes.data.suppliers);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const debouncedSearch = useMemo(
    () =>
      debounce((term: string) => {
        fetchData(term, supplierFilter);
      }, 300),
    [supplierFilter]
  );

  useEffect(() => () => debouncedSearch.cancel(), [debouncedSearch]);
  useEffect(() => { fetchData(search, supplierFilter); }, [supplierFilter]);

  const columns: ColumnDef<PurchaseItemView>[] = useMemo(() => [
    {
      accessorKey: 'purchase_date',
      header: 'Date',
      cell: ({ row }) => new Date(row.original.purchase_date).toLocaleDateString(),
    },
    {
      accessorKey: 'supplier_name',
      header: 'Supplier',
      cell: ({ row }) => row.original.supplier_name || '-',
    },
    {
      accessorKey: 'description',
      header: 'Item',
      cell: ({ row }) => row.original.description || row.original.product_name || '-',
    },
    {
      accessorKey: 'quantity',
      header: 'Qty',
      cell: ({ row }) => Number(row.original.quantity || 0).toFixed(3),
    },
    {
      accessorKey: 'unit_cost',
      header: 'Unit Cost',
      cell: ({ row }) => `$${Number(row.original.unit_cost || 0).toFixed(2)}`,
    },
    {
      accessorKey: 'discount',
      header: 'Discount',
      cell: ({ row }) => `$${Number(row.original.discount || 0).toFixed(2)}`,
    },
    {
      accessorKey: 'line_total',
      header: 'Line Total',
      cell: ({ row }) => `$${Number(row.original.line_total || 0).toFixed(2)}`,
    },
    {
      accessorKey: 'purchase_type',
      header: 'Type',
      cell: ({ row }) => (
        <Badge color={row.original.purchase_type === 'cash' ? 'success' : 'info'} variant="light">
          {row.original.purchase_type}
        </Badge>
      ),
    },
    { accessorKey: 'purchase_id', header: 'PO #', cell: ({ row }) => `PO-${row.original.purchase_id}` },
  ], []);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Purchased Items"
        description="See every item received from suppliers."
        icon={ListChecks}
      />

      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm p-4 space-y-3 border border-slate-100 dark:border-slate-800">
        <div className="flex flex-wrap gap-3 items-center">
          <TabActionToolbar
            title="Items"
            hidePrimary
            onSearch={(value: string) => { setSearch(value); debouncedSearch(value); }}
            searchPlaceholder="Search item, supplier..."
          />
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-600 dark:text-slate-300">Supplier</span>
            <select
              className="rounded-lg border px-3 py-2 text-sm bg-white border-slate-200 text-slate-900 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100"
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            >
              <option value="all">All</option>
              {suppliers.map((s) => (
                <option key={s.supplier_id} value={s.supplier_id}>{s.supplier_name}</option>
              ))}
            </select>
          </div>
        </div>

        <DataTable
          data={items}
          columns={columns}
          isLoading={loading}
          searchPlaceholder="Search item or supplier..."
        />
      </div>
    </div>
  );
};

export default Products;
