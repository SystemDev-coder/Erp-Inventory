// Mock Customers Data
export interface Customer {
    id: string;
    name: string;
    email: string;
    phone: string;
    type: 'regular' | 'walking';
    totalPurchases: number;
    creditLimit: number;
    status: 'active' | 'inactive';
    joinedDate: string;
}

export const mockCustomers: Customer[] = [
    {
        id: '1',
        name: 'John Smith',
        email: 'john.smith@email.com',
        phone: '+1-555-0101',
        type: 'regular',
        totalPurchases: 15420.50,
        creditLimit: 5000,
        status: 'active',
        joinedDate: '2025-06-15',
    },
    {
        id: '2',
        name: 'Sarah Johnson',
        email: 'sarah.j@email.com',
        phone: '+1-555-0102',
        type: 'regular',
        totalPurchases: 8750.00,
        creditLimit: 3000,
        status: 'active',
        joinedDate: '2025-08-20',
    },
    {
        id: '3',
        name: 'Walk-in Customer',
        email: '',
        phone: '',
        type: 'walking',
        totalPurchases: 125.00,
        creditLimit: 0,
        status: 'active',
        joinedDate: '2026-02-03',
    },
    {
        id: '4',
        name: 'Michael Brown',
        email: 'mbrown@email.com',
        phone: '+1-555-0103',
        type: 'regular',
        totalPurchases: 22100.75,
        creditLimit: 10000,
        status: 'active',
        joinedDate: '2025-03-10',
    },
];
