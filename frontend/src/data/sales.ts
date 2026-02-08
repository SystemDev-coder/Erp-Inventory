// Mock Sales Data
export interface Sale {
    id: string;
    invoiceNumber: string;
    customer: string;
    date: string;
    total: number;
    paid: number;
    status: 'paid' | 'pending' | 'overdue';
    items: number;
}

export const mockSales: Sale[] = [
    {
        id: '1',
        invoiceNumber: 'INV-2026-001',
        customer: 'John Smith',
        date: '2026-02-01',
        total: 1250.00,
        paid: 1250.00,
        status: 'paid',
        items: 5,
    },
    {
        id: '2',
        invoiceNumber: 'INV-2026-002',
        customer: 'Sarah Johnson',
        date: '2026-02-02',
        total: 850.50,
        paid: 500.00,
        status: 'pending',
        items: 3,
    },
    {
        id: '3',
        invoiceNumber: 'INV-2026-003',
        customer: 'Michael Brown',
        date: '2026-02-03',
        total: 3200.00,
        paid: 3200.00,
        status: 'paid',
        items: 12,
    },
    {
        id: '4',
        invoiceNumber: 'INV-2026-004',
        customer: 'Walk-in Customer',
        date: '2026-01-28',
        total: 450.00,
        paid: 0,
        status: 'overdue',
        items: 2,
    },
];
