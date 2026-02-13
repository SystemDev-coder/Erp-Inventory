import { useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { Plus, Warehouse, AlertCircle, ArrowRightLeft, MoveRight } from 'lucide-react';
import { Tabs } from '../../components/ui/tabs';
import { PageHeader } from '../../components/ui/layout';
import { DataTable } from '../../components/ui/table/DataTable';
import { Modal } from '../../components/ui/modal/Modal';
import { useToast } from '../../components/ui/toast/Toast';
import Badge from '../../components/ui/badge/Badge';

// Mock Data
const mockStock = [
    { id: '1', item: 'iPhone 15 Pro', warehouse: 'Main Store', qty: 45, value: 44999.55, status: 'Healthy' },
    { id: '2', item: 'MacBook Air M3', warehouse: 'Warehouse A', qty: 12, value: 15588.00, status: 'Healthy' },
    { id: '3', item: 'AirPods Pro 2', warehouse: 'Main Store', qty: 85, value: 21165.00, status: 'Healthy' },
    { id: '4', item: 'iPad Pro 12.9', warehouse: 'Main Store', qty: 8, value: 8792.00, status: 'Low' },
    { id: '5', item: 'Apple Watch S9', warehouse: 'Service Center', qty: 0, value: 0.00, status: 'Out' },
];

const Stock = () => {
    const { showToast } = useToast();
    const [isAddOpen, setIsAddOpen] = useState(false);

    const columns: ColumnDef<any>[] = [
        { accessorKey: 'item', header: 'Item Name' },
        { accessorKey: 'warehouse', header: 'Location' },
        {
            accessorKey: 'qty',
            header: 'Quantity',
            cell: ({ row }) => (
                <span className="font-bold">{row.original.qty}</span>
            )
        },
        {
            accessorKey: 'value',
            header: 'Total Value',
            cell: ({ row }) => `$${row.original.value.toLocaleString()}`
        },
        {
            accessorKey: 'status',
            header: 'Status',
            cell: ({ row }) => (
                <Badge
                    color={row.original.status === 'Healthy' ? 'success' : row.original.status === 'Low' ? 'warning' : 'error'}
                    variant="light"
                >
                    {row.original.status === 'Healthy' ? 'In Stock' : row.original.status === 'Low' ? 'Low Stock' : 'Out of Stock'}
                </Badge>
            )
        },
    ];

    const tabs = [
        {
            id: 'levels',
            label: 'Stock Levels',
            icon: Warehouse,
            content: (
                <DataTable
                    data={mockStock}
                    columns={columns}
                    searchPlaceholder="Find an item in stock..."
                    onEdit={(row) => console.log('Adjust', row)}
                />
            )
        },
        {
            id: 'low',
            label: 'Low Stock',
            icon: AlertCircle,
            content: (
                <div className="bg-white dark:bg-slate-900 p-12 rounded-2xl border border-slate-200 dark:border-slate-800 text-center text-slate-500">
                    Items currently running low will be listed here.
                </div>
            )
        },
        {
            id: 'movements',
            label: 'Stock Movements',
            icon: MoveRight,
            content: (
                <div className="bg-white dark:bg-slate-900 p-12 rounded-2xl border border-slate-200 dark:border-slate-800 text-center text-slate-500">
                    History of all stock added or removed.
                </div>
            )
        },
        {
            id: 'adjustments',
            label: 'Stock Adjustments',
            icon: ArrowRightLeft,
            content: (
                <div className="bg-white dark:bg-slate-900 p-12 rounded-2xl border border-slate-200 dark:border-slate-800 text-center text-slate-500">
                    Manually correct stock counts after audit.
                </div>
            )
        },
        {
            id: 'warehouses',
            label: 'Warehouses',
            icon: Warehouse,
            content: (
                <div className="bg-white dark:bg-slate-900 p-12 rounded-2xl border border-slate-200 dark:border-slate-800 text-center text-slate-500">
                    Manage your physical storage locations.
                </div>
            )
        }
    ];

    return (
        <div>
            <PageHeader
                title="Stock"
                description="Monitor how much of each product you have in your locations."
                actions={
                    <button
                        onClick={() => setIsAddOpen(true)}
                        className="flex items-center gap-2 px-6 py-2.5 bg-primary-600 text-white font-bold rounded-xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-500/20 active:scale-95"
                    >
                        <Plus className="w-5 h-5" />
                        Stock Adjustment
                    </button>
                }
            />
            <Tabs tabs={tabs} defaultTab="levels" />

            <Modal
                isOpen={isAddOpen}
                onClose={() => setIsAddOpen(false)}
                title="Record Stock Adjustment"
                size="md"
            >
                <form onSubmit={(e) => {
                    e.preventDefault();
                    showToast('success', 'Adjustment Saved', 'Stock level has been manually corrected.');
                    setIsAddOpen(false);
                }} className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Select Item</label>
                        <select className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 focus:ring-2 focus:ring-primary-500 outline-none transition-all">
                            <option>iPhone 15 Pro</option>
                            <option>MacBook Air M3</option>
                        </select>
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Correction Type</label>
                        <select className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 focus:ring-2 focus:ring-primary-500 outline-none transition-all">
                            <option>Inventory Audit (Correction)</option>
                            <option>Damage / Loss</option>
                            <option>Found Stock</option>
                        </select>
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700 dark:text-slate-300">New Quantity Count</label>
                        <input type="number" required placeholder="Enter the actual physical count" className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 focus:ring-2 focus:ring-primary-500 outline-none transition-all" />
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                        <button type="button" onClick={() => setIsAddOpen(false)} className="px-6 py-2.5 font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all">Cancel</button>
                        <button type="submit" className="px-8 py-2.5 bg-primary-600 text-white font-bold rounded-xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-500/20 active:scale-95">Save Correction</button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default Stock;
