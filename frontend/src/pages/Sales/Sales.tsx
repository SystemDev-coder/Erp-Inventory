import { useEffect, useMemo, useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { ShoppingCart, Clock, FileText, Ban } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Tabs } from '../../components/ui/tabs';
import { PageHeader, TabActionToolbar } from '../../components/ui/layout';
import { DataTable } from '../../components/ui/table/DataTable';
import { useToast } from '../../components/ui/toast/Toast';
import Badge from '../../components/ui/badge/Badge';
import { salesService, Sale } from '../../services/sales.service';

const Sales = () => {
    const { showToast } = useToast();
    const navigate = useNavigate();
    const [sales, setSales] = useState<Sale[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | Sale['status']>('all');

    const loadSales = async (term?: string, status?: string) => {
        setLoading(true);
        const res = await salesService.list(term, status);
        if (res.success && res.data?.sales) {
            setSales(res.data.sales);
        } else {
            showToast('error', 'Sales', res.error || 'Failed to load sales');
        }
        setLoading(false);
    };

    const columns: ColumnDef<Sale>[] = useMemo(() => [
        {
            accessorKey: 'sale_id',
            header: 'Sale #',
            cell: ({ row }) => `S-${row.original.sale_id}`,
        },
        {
            accessorKey: 'sale_date',
            header: 'Date',
            cell: ({ row }) => new Date(row.original.sale_date).toLocaleString(),
        },
        {
            accessorKey: 'customer_name',
            header: 'Customer',
            cell: ({ row }) => row.original.customer_name || 'Walking Customer',
        },
        {
            accessorKey: 'sale_type',
            header: 'Type',
            cell: ({ row }) => (row.original.sale_type === 'cash' ? 'Cash' : 'Credit'),
        },
        {
            accessorKey: 'total',
            header: 'Total Bill',
            cell: ({ row }) => `$${Number(row.original.total || 0).toFixed(2)}`,
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
    ], []);

    useEffect(() => {
        loadSales();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const tabs = [
        {
            id: 'list',
            label: 'Sales List',
            icon: ShoppingCart,
            content: (
                <div className="space-y-2">
                    <TabActionToolbar
                        title="Recent Sales"
                        primaryAction={{ label: 'New Sale', onClick: () => navigate('/sales/new') }}
                        onDisplay={() => loadSales(search, statusFilter)}
                    />
                    <DataTable
                        data={sales}
                        columns={columns}
                        isLoading={loading}
                        searchPlaceholder="Find sale by customer or note..."
                    />
                </div>
            )
        },
        {
            id: 'invoices',
            label: 'Invoices',
            icon: FileText,
            content: (
                <div className="bg-white dark:bg-slate-900 p-12 rounded-2xl border border-slate-200 dark:border-slate-800 text-center text-slate-500">
                    Invoice management will be added here later.
                </div>
            )
        },
        {
            id: 'quotations',
            label: 'Quotations',
            icon: Clock,
            content: (
                <div className="bg-white dark:bg-slate-900 p-12 rounded-2xl border border-slate-200 dark:border-slate-800 text-center text-slate-500">
                    Quotation workflows will be added here later.
                </div>
            )
        },
        {
            id: 'voided',
            label: 'Voided Sales',
            icon: Ban,
            content: (
                <div className="bg-white dark:bg-slate-900 p-12 rounded-2xl border border-slate-200 dark:border-slate-800 text-center text-slate-500">
                    Voided sales history will be shown here.
                </div>
            )
        }
    ];

    return (
        <div>
            <PageHeader
                title="Sales Management"
                description="Monitor every penny coming from your customers."
            />
            <Tabs tabs={tabs} defaultTab="list" />
        </div>
    );
};

export default Sales;
