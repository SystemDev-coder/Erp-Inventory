import { useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { ShoppingCart, Clock, FileText, Ban, User, Receipt, Percent, Package, Zap } from 'lucide-react';
import { Tabs } from '../../components/ui/tabs';
import { PageHeader, TabActionToolbar } from '../../components/ui/layout';
import { DataTable } from '../../components/ui/table/DataTable';
import { Modal } from '../../components/ui/modal/Modal';
import { useToast } from '../../components/ui/toast/Toast';
import Badge from '../../components/ui/badge/Badge';
import POSTab from './POSTab';

// Mock Data
const mockSales = [
    { id: '1', order: 'ORD-1240', customer: 'Walking Customer', items: 3, total: 125.00, status: 'Paid', date: '2026-02-03' },
    { id: '2', order: 'ORD-1241', customer: 'John Doe', items: 1, total: 999.00, status: 'On Credit', date: '2026-02-03' },
    { id: '3', order: 'ORD-1242', customer: 'Walking Customer', items: 5, total: 45.50, status: 'Paid', date: '2026-02-02' },
];

const Sales = () => {
    const { showToast } = useToast();
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [activeModal, setActiveModal] = useState<string | null>(null);

    const columns: ColumnDef<any>[] = [
        { accessorKey: 'order', header: 'Order #' },
        { accessorKey: 'date', header: 'Date' },
        { accessorKey: 'customer', header: 'Customer' },
        { accessorKey: 'items', header: 'Items' },
        {
            accessorKey: 'total',
            header: 'Total Bill',
            cell: ({ row }) => `$${row.original.total.toFixed(2)}`
        },
        {
            accessorKey: 'status',
            header: 'Status',
            cell: ({ row }) => (
                <Badge
                    color={row.original.status === 'Paid' ? 'success' : row.original.status === 'On Credit' ? 'warning' : 'error'}
                    variant="light"
                >
                    {row.original.status}
                </Badge>
            )
        },
    ];

    const handleQuickAdd = (type: string) => {
        setActiveModal(type);
        setIsAddOpen(true);
    };

    const tabs = [
        {
            id: 'list',
            label: 'Sales List',
            icon: ShoppingCart,
            badge: mockSales.length,
            content: (
                <div className="space-y-2">
                    <TabActionToolbar
                        title="Recent Sales"
                        primaryAction={{ label: 'New Sale', onClick: () => handleQuickAdd('sale') }}
                        quickAddItems={[
                            { label: 'Add Customer', icon: <User className="w-4 h-4" />, onClick: () => handleQuickAdd('customer') },
                            { label: 'Record Payment', icon: <Receipt className="w-4 h-4" />, onClick: () => handleQuickAdd('payment') },
                            { label: 'Add Discount', icon: <Percent className="w-4 h-4" />, onClick: () => handleQuickAdd('discount') },
                        ]}
                        onExport={() => showToast('info', 'Exporting...', 'Downloading sales list as CSV.')}
                        onPrint={() => window.print()}
                    />
                    <DataTable data={mockSales} columns={columns} searchPlaceholder="Find order..." />
                </div>
            )
        },
        {
            id: 'pos',
            label: 'POS (Quick Sale)',
            icon: Zap,
            content: <POSTab />
        },
        {
            id: 'invoices',
            label: 'Invoices',
            icon: FileText,
            content: (
                <div className="space-y-2">
                    <TabActionToolbar
                        title="Generated Invoices"
                        primaryAction={{ label: 'Create Invoice', onClick: () => handleQuickAdd('invoice') }}
                        quickAddItems={[
                            { label: 'Add Receipt', icon: <Receipt className="w-4 h-4" />, onClick: () => handleQuickAdd('receipt') },
                            { label: 'Add Internal Note', icon: <FileText className="w-4 h-4" />, onClick: () => handleQuickAdd('note') },
                        ]}
                    />
                    <DataTable data={[]} columns={columns} searchPlaceholder="Search invoices..." />
                </div>
            )
        },
        {
            id: 'quotations',
            label: 'Quotations',
            icon: Clock,
            content: (
                <div className="space-y-2">
                    <TabActionToolbar
                        title="Quotations Portfolio"
                        primaryAction={{ label: 'New Quotation', onClick: () => handleQuickAdd('quotation') }}
                        quickAddItems={[
                            { label: 'Add Customer', icon: <User className="w-4 h-4" />, onClick: () => handleQuickAdd('customer') },
                            { label: 'Link Product', icon: <Package className="w-4 h-4" />, onClick: () => handleQuickAdd('product') },
                        ]}
                    />
                    <DataTable data={[]} columns={columns} searchPlaceholder="Search quotes..." />
                </div>
            )
        },
        {
            id: 'voided',
            label: 'Voided Sales',
            icon: Ban,
            content: (
                <div className="space-y-2">
                    <TabActionToolbar
                        title="Cancelled Transactions"
                        primaryAction={{ label: 'Void Sale', onClick: () => handleQuickAdd('void') }}
                        quickAddItems={[
                            { label: 'Add Void Reason', icon: <FileText className="w-4 h-4" />, onClick: () => handleQuickAdd('reason') },
                        ]}
                    />
                    <DataTable data={[]} columns={columns} searchPlaceholder="Search voided..." />
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

            <Modal
                isOpen={isAddOpen}
                onClose={() => setIsAddOpen(false)}
                title={`Add ${activeModal?.charAt(0).toUpperCase()}${activeModal?.slice(1)}`}
                size="md"
            >
                <div className="p-8 text-center text-slate-500">
                    Form for {activeModal} would appear here.
                    <div className="mt-6 flex justify-center gap-2">
                        <button onClick={() => {
                            showToast('success', 'Saved!', `${activeModal} has been processed.`);
                            setIsAddOpen(false);
                        }} className="px-6 py-2.5 bg-primary-600 text-white font-bold rounded-xl">Save & Close</button>
                        <button onClick={() => setIsAddOpen(false)} className="px-6 py-2.5 bg-slate-100 rounded-xl font-bold">Cancel</button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default Sales;
