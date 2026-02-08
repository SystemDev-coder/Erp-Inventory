// Mock Stock Data
export interface StockItem {
    id: string;
    product: string;
    sku: string;
    warehouse: string;
    quantity: number;
    minStock: number;
    maxStock: number;
    status: 'in-stock' | 'low-stock' | 'out-of-stock';
    lastUpdated: string;
}

export const mockStock: StockItem[] = [
    {
        id: '1',
        product: 'Wireless Mouse',
        sku: 'WM-001',
        warehouse: 'Main Warehouse',
        quantity: 150,
        minStock: 50,
        maxStock: 500,
        status: 'in-stock',
        lastUpdated: '2026-02-03',
    },
    {
        id: '2',
        product: 'USB-C Cable',
        sku: 'UC-002',
        warehouse: 'Main Warehouse',
        quantity: 300,
        minStock: 100,
        maxStock: 1000,
        status: 'in-stock',
        lastUpdated: '2026-02-03',
    },
    {
        id: '3',
        product: 'Webcam HD',
        sku: 'WC-005',
        warehouse: 'Secondary Warehouse',
        quantity: 20,
        minStock: 30,
        maxStock: 200,
        status: 'low-stock',
        lastUpdated: '2026-02-02',
    },
    {
        id: '4',
        product: 'Laptop Stand',
        sku: 'LS-003',
        warehouse: 'Main Warehouse',
        quantity: 0,
        minStock: 20,
        maxStock: 100,
        status: 'out-of-stock',
        lastUpdated: '2026-02-01',
    },
];
