// Mock Products Data
export interface Product {
    id: string;
    name: string;
    sku: string;
    category: string;
    brand: string;
    price: number;
    stock: number;
    unit: string;
    status: 'active' | 'inactive';
    createdAt: string;
}

export const mockProducts: Product[] = [
    {
        id: '1',
        name: 'Wireless Mouse',
        sku: 'WM-001',
        category: 'Electronics',
        brand: 'TechPro',
        price: 29.99,
        stock: 150,
        unit: 'pcs',
        status: 'active',
        createdAt: '2026-01-15',
    },
    {
        id: '2',
        name: 'USB-C Cable',
        sku: 'UC-002',
        category: 'Accessories',
        brand: 'ConnectPlus',
        price: 12.99,
        stock: 300,
        unit: 'pcs',
        status: 'active',
        createdAt: '2026-01-20',
    },
    {
        id: '3',
        name: 'Laptop Stand',
        sku: 'LS-003',
        category: 'Accessories',
        brand: 'ErgoDesk',
        price: 45.00,
        stock: 75,
        unit: 'pcs',
        status: 'active',
        createdAt: '2026-01-22',
    },
    {
        id: '4',
        name: 'Mechanical Keyboard',
        sku: 'MK-004',
        category: 'Electronics',
        brand: 'TechPro',
        price: 89.99,
        stock: 45,
        unit: 'pcs',
        status: 'active',
        createdAt: '2026-01-25',
    },
    {
        id: '5',
        name: 'Webcam HD',
        sku: 'WC-005',
        category: 'Electronics',
        brand: 'VisionCam',
        price: 65.00,
        stock: 20,
        unit: 'pcs',
        status: 'inactive',
        createdAt: '2026-02-01',
    },
];

export interface Category {
    id: string;
    name: string;
    description: string;
    productCount: number;
    status: 'active' | 'inactive';
}

export const mockCategories: Category[] = [
    { id: '1', name: 'Electronics', description: 'Electronic devices and gadgets', productCount: 125, status: 'active' },
    { id: '2', name: 'Accessories', description: 'Computer and phone accessories', productCount: 89, status: 'active' },
    { id: '3', name: 'Furniture', description: 'Office and home furniture', productCount: 45, status: 'active' },
    { id: '4', name: 'Stationery', description: 'Office supplies and stationery', productCount: 210, status: 'active' },
];

export interface Brand {
    id: string;
    name: string;
    country: string;
    productCount: number;
    status: 'active' | 'inactive';
}

export const mockBrands: Brand[] = [
    { id: '1', name: 'TechPro', country: 'USA', productCount: 85, status: 'active' },
    { id: '2', name: 'ConnectPlus', country: 'China', productCount: 120, status: 'active' },
    { id: '3', name: 'ErgoDesk', country: 'Germany', productCount: 45, status: 'active' },
    { id: '4', name: 'VisionCam', country: 'Japan', productCount: 32, status: 'active' },
];
