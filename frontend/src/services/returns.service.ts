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
    refund_acc_id?: number | null;
    refund_account_name?: string | null;
    refund_amount?: number;
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
    refund_acc_id?: number | null;
    refund_account_name?: string | null;
    refund_amount?: number;
    status: string;
    note: string | null;
    created_at: string;
}

export interface SalesReturnItem {
    sr_item_id: number;
    sr_id: number;
    item_id: number;
    item_name?: string;
    quantity: number;
    unit_price: number;
    line_total: number;
}

export interface PurchaseReturnItem {
    pr_item_id: number;
    pr_id: number;
    item_id: number;
    item_name?: string;
    quantity: number;
    unit_cost: number;
    line_total: number;
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
    sold_qty?: number;
    returned_qty?: number;
    available_qty?: number;
}

export const returnsService = {
    listItems() {
        return apiClient.get<{ items: ReturnItemOption[] }>('/api/returns/items');
    },
    listSalesCustomers() {
        return apiClient.get<{ customers: any[] }>('/api/returns/sales/customers');
    },
    listSalesItemsByCustomer(customerId: number) {
        return apiClient.get<{ items: ReturnItemOption[] }>(`/api/returns/sales/customer-items?customerId=${customerId}`);
    },
    listPurchaseItemsBySupplier(supplierId: number) {
        return apiClient.get<{ items: ReturnItemOption[] }>(`/api/returns/purchases/supplier-items?supplierId=${supplierId}`);
    },
    listSalesReturns(params?: { fromDate?: string; toDate?: string }) {
        const qsParts: string[] = [];
        if (params?.fromDate) qsParts.push(`fromDate=${encodeURIComponent(params.fromDate)}`);
        if (params?.toDate) qsParts.push(`toDate=${encodeURIComponent(params.toDate)}`);
        const qs = qsParts.length ? `?${qsParts.join('&')}` : '';
        return apiClient.get<{ rows: SalesReturn[] }>(`/api/returns/sales${qs}`);
    },
    getSalesReturn(id: number) {
        return apiClient.get<{ return: SalesReturn }>(`/api/returns/sales/${id}`);
    },
    getSalesReturnItems(id: number) {
        return apiClient.get<{ items: SalesReturnItem[] }>(`/api/returns/sales/${id}/items`);
    },
    createSalesReturn(payload: {
        saleId?: number;
        customerId: number;
        referenceNo?: string;
        note?: string;
        refundAccId?: number;
        refundAmount?: number;
        items: ReturnItemInput[];
    }) {
        return apiClient.post<{ return: SalesReturn }>('/api/returns/sales', payload);
    },
    updateSalesReturn(id: number, payload: {
        saleId?: number;
        customerId: number;
        referenceNo?: string;
        note?: string;
        refundAccId?: number;
        refundAmount?: number;
        items: ReturnItemInput[];
    }) {
        return apiClient.put<{ return: SalesReturn }>(`/api/returns/sales/${id}`, payload);
    },
    deleteSalesReturn(id: number) {
        return apiClient.delete(`/api/returns/sales/${id}`);
    },
    listPurchaseReturns(params?: { fromDate?: string; toDate?: string }) {
        const qsParts: string[] = [];
        if (params?.fromDate) qsParts.push(`fromDate=${encodeURIComponent(params.fromDate)}`);
        if (params?.toDate) qsParts.push(`toDate=${encodeURIComponent(params.toDate)}`);
        const qs = qsParts.length ? `?${qsParts.join('&')}` : '';
        return apiClient.get<{ rows: PurchaseReturn[] }>(`/api/returns/purchases${qs}`);
    },
    getPurchaseReturn(id: number) {
        return apiClient.get<{ return: PurchaseReturn }>(`/api/returns/purchases/${id}`);
    },
    getPurchaseReturnItems(id: number) {
        return apiClient.get<{ items: PurchaseReturnItem[] }>(`/api/returns/purchases/${id}/items`);
    },
    createPurchaseReturn(payload: {
        purchaseId?: number;
        supplierId: number;
        referenceNo?: string;
        note?: string;
        refundAccId?: number;
        refundAmount?: number;
        items: ReturnItemInput[];
    }) {
        return apiClient.post<{ return: PurchaseReturn }>('/api/returns/purchases', payload);
    },
    updatePurchaseReturn(id: number, payload: {
        purchaseId?: number;
        supplierId: number;
        referenceNo?: string;
        note?: string;
        refundAccId?: number;
        refundAmount?: number;
        items: ReturnItemInput[];
    }) {
        return apiClient.put<{ return: PurchaseReturn }>(`/api/returns/purchases/${id}`, payload);
    },
    deletePurchaseReturn(id: number) {
        return apiClient.delete(`/api/returns/purchases/${id}`);
    },
};
