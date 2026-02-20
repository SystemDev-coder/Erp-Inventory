import { apiClient } from './api';

export interface SalesReturn {
    sr_id: number;
    branch_id: number;
    branch_name?: string;
    sale_id: number | null;
    customer_id: number | null;
    customer_name?: string | null;
    reference_no: string | null;
    return_date: string;
    subtotal: number;
    total: number;
    status: string;
    note: string | null;
    created_at: string;
}

export interface PurchaseReturn {
    pr_id: number;
    branch_id: number;
    branch_name?: string;
    purchase_id: number | null;
    supplier_id: number | null;
    supplier_name?: string | null;
    reference_no: string | null;
    return_date: string;
    subtotal: number;
    total: number;
    status: string;
    note: string | null;
    created_at: string;
}

export interface ReturnItemInput {
    itemId: number;
    quantity: number;
    unitPrice?: number;
    unitCost?: number;
}

export interface ReturnItemOption {
    item_id: number;
    name: string;
    barcode?: string | null;
    cost_price: number;
    sell_price: number;
}

export const returnsService = {
    listItems() {
        return apiClient.get<{ items: ReturnItemOption[] }>('/api/returns/items');
    },
    listSalesReturns() {
        return apiClient.get<{ rows: SalesReturn[] }>('/api/returns/sales');
    },
    createSalesReturn(payload: {
        saleId?: number;
        customerId: number;
        referenceNo?: string;
        note?: string;
        items: ReturnItemInput[];
    }) {
        return apiClient.post<{ return: SalesReturn }>('/api/returns/sales', payload);
    },
    updateSalesReturn(id: number, payload: {
        saleId?: number;
        customerId: number;
        referenceNo?: string;
        note?: string;
        items: ReturnItemInput[];
    }) {
        return apiClient.put<{ return: SalesReturn }>(`/api/returns/sales/${id}`, payload);
    },
    deleteSalesReturn(id: number) {
        return apiClient.delete(`/api/returns/sales/${id}`);
    },
    listPurchaseReturns() {
        return apiClient.get<{ rows: PurchaseReturn[] }>('/api/returns/purchases');
    },
    createPurchaseReturn(payload: {
        purchaseId?: number;
        supplierId: number;
        referenceNo?: string;
        note?: string;
        items: ReturnItemInput[];
    }) {
        return apiClient.post<{ return: PurchaseReturn }>('/api/returns/purchases', payload);
    },
    updatePurchaseReturn(id: number, payload: {
        purchaseId?: number;
        supplierId: number;
        referenceNo?: string;
        note?: string;
        items: ReturnItemInput[];
    }) {
        return apiClient.put<{ return: PurchaseReturn }>(`/api/returns/purchases/${id}`, payload);
    },
    deletePurchaseReturn(id: number) {
        return apiClient.delete(`/api/returns/purchases/${id}`);
    },
};
