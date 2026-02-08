import { useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { Package, Grid, DollarSign, Tag, Archive, Layers, List } from 'lucide-react';
import { Tabs } from '../../components/ui/tabs';
import { PageHeader, TabActionToolbar } from '../../components/ui/layout';
import { DataTable } from '../../components/ui/table/DataTable';
import { Modal } from '../../components/ui/modal/Modal';
import { useToast } from '../../components/ui/toast/Toast';
import Badge from '../../components/ui/badge/Badge';

// Mock Data
const mockProducts = [
    { id: '1', name: 'iPhone 15 Pro', sku: 'IPH15P', category: 'Electronics', price: 999.99, stock: 45, status: 'Active' },
    { id: '2', name: 'MacBook Air M3', sku: 'MBA3', category: 'Laptops', price: 1299.00, stock: 12, status: 'Active' },
    { id: '3', name: 'AirPods Pro 2', sku: 'APP2', category: 'Accessories', price: 249.00, stock: 85, status: 'Active' },
];

const Products = () => {
    const { showToast } = useToast();
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [activeModal, setActiveModal] = useState<string | null>(null);

    const columns: ColumnDef<any>[] = [
        { accessorKey: 'name', header: 'Product Name' },
        { accessorKey: 'sku', header: 'SKU' },
        { accessorKey: 'category', header: 'Category' },
        {
            accessorKey: 'price',
            header: 'Price',
            cell: ({ row }) => `$${row.original.price.toFixed(2)}`
        },
        {
            accessorKey: 'stock',
            header: 'Stock Count',
            cell: ({ row }) => (
                <span className={row.original.stock < 10 ? 'text-red-600 font-bold' : ''}>
                    {row.original.stock}
                </span>
            )
        },
        {
            accessorKey: 'status',
            header: 'Status',
            cell: ({ row }) => (
                <Badge
                    color={row.original.status === 'Active' ? 'success' : 'error'}
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
            id: 'catalog',
            label: 'Products Catalog',
            icon: Package,
            badge: mockProducts.length,
            content: (
                <div className="space-y-2">
                    <TabActionToolbar
                        title="Your Inventory Items"
                        primaryAction={{ label: 'Add Product', onClick: () => handleQuickAdd('product') }}
                        quickAddItems={[
                            { label: 'Import via Excel', icon: <Archive className="w-4 h-4" />, onClick: () => showToast('info', 'Import', 'Excel import coming soon.') },
                            { label: 'Print Barcodes', icon: <Tag className="w-4 h-4" />, onClick: () => window.print() },
                        ]}
                        onExport={() => showToast('success', 'Export Success', 'Products catalog downloaded.')}
                    />
                    <DataTable data={mockProducts} columns={columns} searchPlaceholder="Find a product..." />
                </div>
            )
        },
        {
            id: 'categories',
            label: 'Categories',
            icon: Grid,
            content: (
                <div className="space-y-2">
                    <TabActionToolbar
                        title="Product Groups"
                        primaryAction={{ label: 'New Category', onClick: () => handleQuickAdd('category') }}
                        quickAddItems={[
                            { label: 'Add Sub-category', icon: <Layers className="w-4 h-4" />, onClick: () => handleQuickAdd('subcategory') },
                        ]}
                    />
                    <DataTable data={[]} columns={[{ accessorKey: 'name', header: 'Category Name' }]} searchPlaceholder="Search categories..." />
                </div>
            )
        },
        {
            id: 'prices',
            label: 'Prices',
            icon: DollarSign,
            content: (
                <div className="space-y-2">
                    <TabActionToolbar
                        title="Price Lists"
                        primaryAction={{ label: 'Update Price', onClick: () => handleQuickAdd('price') }}
                        quickAddItems={[
                            { label: 'Add Discount Rule', icon: <List className="w-4 h-4" />, onClick: () => handleQuickAdd('discount') },
                        ]}
                    />
                    <DataTable data={[]} columns={columns} searchPlaceholder="Search prices..." />
                </div>
            )
        },
        {
            id: 'labels',
            label: 'Labels',
            icon: Tag,
            content: (
                <div className="space-y-2">
                    <TabActionToolbar
                        title="Barcode Designer"
                        primaryAction={{ label: 'Print All Labels', onClick: () => window.print() }}
                    />
                    <div className="bg-white dark:bg-slate-900 p-12 rounded-2xl border border-slate-200 dark:border-slate-800 text-center text-slate-500">
                        Select items to print labels for.
                    </div>
                </div>
            )
        }
    ];

    return (
        <div>
            <PageHeader
                title="Products"
                description="Your entire catalog of sellable items."
            />
            <Tabs tabs={tabs} defaultTab="catalog" />

            <Modal
                isOpen={isAddOpen}
                onClose={() => setIsAddOpen(false)}
                title={`Action: ${activeModal}`}
                size="md"
            >
                <div className="p-8 text-center">
                    <p className="text-slate-500 mb-6">Form for {activeModal} would go here in full implementation.</p>
                    <div className="flex justify-center gap-3">
                        <button onClick={() => {
                            showToast('success', 'Success', `Item ${activeModal} added successfully.`);
                            setIsAddOpen(false);
                        }} className="px-6 py-2.5 bg-primary-600 text-white font-bold rounded-xl shadow-lg">Confirm</button>
                        <button onClick={() => setIsAddOpen(false)} className="px-6 py-2.5 bg-slate-100 rounded-xl font-bold">Cancel</button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default Products;
