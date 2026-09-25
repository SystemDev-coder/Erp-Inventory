import { useCallback, useEffect, useMemo, useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { Ban, Eye, Printer, ReceiptText, Package, Wallet, RotateCcw, BarChart3 } from 'lucide-react';
import { PageHeader, TabActionToolbar } from '../../components/ui/layout';
import { Tabs } from '../../components/ui/tabs/Tabs';
import { DataTable } from '../../components/ui/table/DataTable';
import { Modal } from '../../components/ui/modal/Modal';
import { ConfirmDialog } from '../../components/ui/modal/ConfirmDialog';
import Badge from '../../components/ui/badge/Badge';
import { SearchableCombobox } from '../../components/ui/combobox/SearchableCombobox';
import { useToast } from '../../components/ui/toast/Toast';
import { useBranch } from '../../context/BranchContext';
import { usePermissions } from '../../hooks/usePermissions';
import { salesService, Sale, SaleItem, PosOrderItemRow, PosPaymentRow } from '../../services/sales.service';
import { accountService, Account } from '../../services/account.service';
import { returnsService } from '../../services/returns.service';
import { defaultDateRange, optionalDateParam } from '../../utils/dateRange';

const formatMoney = (value: number) => `$${Number(value || 0).toFixed(2)}`;

const printHtmlInIframe = (html: string) => {
    const printFrame = document.createElement('iframe');
    printFrame.style.position = 'fixed';
    printFrame.style.right = '0';
    printFrame.style.bottom = '0';
    printFrame.style.width = '0';
    printFrame.style.height = '0';
    printFrame.style.border = '0';
    document.body.appendChild(printFrame);
    const frameWindow = printFrame.contentWindow;
    if (!frameWindow) {
        document.body.removeChild(printFrame);
        return;
    }
    frameWindow.document.open();
    frameWindow.document.write(html);
    frameWindow.document.close();
    printFrame.onload = () => {
        frameWindow.focus();
        frameWindow.print();
        setTimeout(() => {
            if (document.body.contains(printFrame)) document.body.removeChild(printFrame);
        }, 300);
    };
};

const POSOrders = () => {
    const { showToast } = useToast();
    const { can } = usePermissions();
    const { activeBranchId } = useBranch();

    const [dateRange, setDateRange] = useState(() => defaultDateRange());
    const [loading, setLoading] = useState(false);
    const [hasLoaded, setHasLoaded] = useState(false);

    const [orders, setOrders] = useState<Sale[]>([]);
    const ORDERS_PAGE_SIZE = 20;
    const [ordersPageIndex, setOrdersPageIndex] = useState(0);
    const [ordersTotalPages, setOrdersTotalPages] = useState(0);
    const [ordersTotalRows, setOrdersTotalRows] = useState(0);

    const [orderItems, setOrderItems] = useState<PosOrderItemRow[]>([]);
    const [payments, setPayments] = useState<PosPaymentRow[]>([]);

    const [viewOpen, setViewOpen] = useState(false);
    const [viewLoading, setViewLoading] = useState(false);
    const [viewSale, setViewSale] = useState<Sale | null>(null);
    const [viewItems, setViewItems] = useState<SaleItem[]>([]);

    const [voidOpen, setVoidOpen] = useState(false);
    const [saleToVoid, setSaleToVoid] = useState<Sale | null>(null);

    // Returns tab
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [returnableSales, setReturnableSales] = useState<Sale[]>([]);
    const [selectedReturnSaleId, setSelectedReturnSaleId] = useState<number | ''>('');
    const [returnLines, setReturnLines] = useState<Array<{ item_id: number; name: string; sold_qty: number; return_qty: number; unit_price: number }>>([]);
    const [refundAccId, setRefundAccId] = useState<number | ''>('');
    const [submittingReturn, setSubmittingReturn] = useState(false);

    const loadOrders = useCallback(async (nextPageIndex = ordersPageIndex) => {
        setLoading(true);
        const res = await salesService.list({
            posOnly: true,
            includeVoided: true,
            fromDate: optionalDateParam(dateRange.fromDate),
            toDate: optionalDateParam(dateRange.toDate),
            branchId: activeBranchId ?? undefined,
            page: nextPageIndex + 1,
            limit: ORDERS_PAGE_SIZE,
        });
        if (res.success && res.data?.sales) {
            setOrders(res.data.sales);
            setHasLoaded(true);
            setOrdersTotalPages(res.data.pagination?.totalPages ?? 0);
            setOrdersTotalRows(res.data.pagination?.total ?? res.data.sales.length);
        } else {
            showToast('error', 'POS Orders', res.error || 'Failed to load orders');
        }
        setLoading(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dateRange, activeBranchId]);

    const loadItemsAndPayments = useCallback(async () => {
        const [itemsRes, paymentsRes] = await Promise.all([
            salesService.listPosOrderItems({
                fromDate: optionalDateParam(dateRange.fromDate),
                toDate: optionalDateParam(dateRange.toDate),
                branchId: activeBranchId ?? undefined,
                limit: 200,
            }),
            salesService.listPosPayments({
                fromDate: optionalDateParam(dateRange.fromDate),
                toDate: optionalDateParam(dateRange.toDate),
                branchId: activeBranchId ?? undefined,
                limit: 200,
            }),
        ]);
        if (itemsRes.success && itemsRes.data?.items) setOrderItems(itemsRes.data.items);
        if (paymentsRes.success && paymentsRes.data?.payments) setPayments(paymentsRes.data.payments);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dateRange, activeBranchId]);

    const handleDisplay = () => {
        setOrdersPageIndex(0);
        void loadOrders(0);
        void loadItemsAndPayments();
    };

    const handleOrdersPageChange = (next: number) => {
        setOrdersPageIndex(next);
        void loadOrders(next);
    };

    useEffect(() => {
        void accountService.list({ branchId: activeBranchId ?? undefined }).then((res) => {
            if (res.success && res.data?.accounts) setAccounts(res.data.accounts.filter((a) => a.is_active));
        });
        void (async () => {
            const res = await salesService.list({ posOnly: true, limit: 100, branchId: activeBranchId ?? undefined });
            if (res.success && res.data?.sales) {
                setReturnableSales(res.data.sales.filter((s) => s.customer_id && s.status !== 'void'));
            }
        })();
    }, [activeBranchId]);

    const handleSelectReturnSale = async (saleId: number | '') => {
        setSelectedReturnSaleId(saleId);
        setReturnLines([]);
        if (!saleId) return;
        const res = await salesService.get(Number(saleId));
        if (res.success && res.data?.items) {
            setReturnLines(
                res.data.items.map((item) => ({
                    item_id: item.item_id,
                    name: item.item_name || `Product #${item.item_id}`,
                    sold_qty: Number(item.quantity || 0),
                    return_qty: 0,
                    unit_price: Number(item.unit_price || 0),
                }))
            );
        }
    };

    const handleSubmitReturn = async () => {
        const sale = returnableSales.find((s) => s.sale_id === Number(selectedReturnSaleId));
        const linesToReturn = returnLines.filter((l) => l.return_qty > 0);
        if (!sale || !sale.customer_id || linesToReturn.length === 0) {
            showToast('error', 'Return', 'Select a sale and at least one product to return.');
            return;
        }
        setSubmittingReturn(true);
        const res = await returnsService.createSalesReturn({
            saleId: sale.sale_id,
            customerId: sale.customer_id,
            items: linesToReturn.map((l) => ({ itemId: l.item_id, quantity: l.return_qty, unitPrice: l.unit_price })),
            refundViaAccount: !!refundAccId,
            refundAccId: refundAccId ? Number(refundAccId) : undefined,
        });
        setSubmittingReturn(false);
        if (res.success) {
            showToast('success', 'Return', 'Return recorded.');
            setSelectedReturnSaleId('');
            setReturnLines([]);
            setRefundAccId('');
        } else {
            showToast('error', 'Return', res.error || 'Could not record this return.');
        }
    };

    const printSaleInvoice = useCallback(
        async (sale: Sale) => {
            const printRes = await salesService.getPrintHtml(sale.sale_id);
            if (!printRes.success || !printRes.data?.html) {
                showToast('error', 'Print Failed', printRes.error || 'Unable to load print template');
                return;
            }
            printHtmlInIframe(printRes.data.html);
        },
        [showToast]
    );

    const handleView = useCallback(async (sale: Sale) => {
        setViewLoading(true);
        setViewOpen(true);
        const res = await salesService.get(sale.sale_id);
        if (!res.success || !res.data?.sale) {
            showToast('error', 'POS Orders', res.error || 'Failed to load order details');
            setViewOpen(false);
            setViewLoading(false);
            return;
        }
        setViewSale(res.data.sale);
        setViewItems(res.data.items || []);
        setViewLoading(false);
    }, [showToast]);

    const confirmVoid = useCallback(async (reason?: string) => {
        if (!saleToVoid) return;
        const res = await salesService.void(saleToVoid.sale_id, reason);
        if (res.success) {
            showToast('success', 'POS Orders', 'Order voided');
            void loadOrders(ordersPageIndex);
        } else {
            showToast('error', 'POS Orders', res.error || 'Failed to void order');
        }
        setVoidOpen(false);
        setSaleToVoid(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [saleToVoid, showToast]);

    const orderColumns: ColumnDef<Sale>[] = useMemo(
        () => [
            { accessorKey: 'sale_id', header: 'Order ID', cell: ({ row }) => `#S-${row.original.sale_id}` },
            { accessorKey: 'customer_name', header: 'Customer', cell: ({ row }) => row.original.customer_name || 'Walk-in' },
            { accessorKey: 'sale_date', header: 'Date', cell: ({ row }) => new Date(row.original.sale_date).toLocaleString() },
            { accessorKey: 'cashier_name', header: 'Cashier', cell: ({ row }) => row.original.cashier_name || '-' },
            { accessorKey: 'total', header: 'Total', cell: ({ row }) => formatMoney(row.original.total) },
            {
                accessorKey: 'status',
                header: 'Status',
                cell: ({ row }) => (
                    <Badge color={row.original.status === 'paid' ? 'success' : row.original.status === 'void' ? 'error' : 'warning'} variant="light">
                        {row.original.status}
                    </Badge>
                ),
            },
            {
                id: 'actions',
                header: 'Action',
                cell: ({ row }) => {
                    const sale = row.original;
                    return (
                        <div className="flex items-center justify-end gap-2">
                            <button type="button" onClick={() => void handleView(sale)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300" aria-label="View">
                                <Eye className="h-4 w-4" />
                            </button>
                            <button type="button" onClick={() => void printSaleInvoice(sale)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300" aria-label="Print">
                                <Printer className="h-4 w-4" />
                            </button>
                            {sale.status !== 'void' && can('sales.void') && (
                                <button type="button" onClick={() => { setSaleToVoid(sale); setVoidOpen(true); }} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-300" aria-label="Void">
                                    <Ban className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                    );
                },
            },
        ],
        [can, handleView, printSaleInvoice]
    );

    const itemColumns: ColumnDef<PosOrderItemRow>[] = useMemo(
        () => [
            { accessorKey: 'sale_id', header: 'Order', cell: ({ row }) => `#S-${row.original.sale_id}` },
            { accessorKey: 'item_name', header: 'Product', cell: ({ row }) => row.original.item_name || `Product #${row.original.item_id}` },
            { accessorKey: 'quantity', header: 'Qty', cell: ({ row }) => Number(row.original.quantity) },
            { accessorKey: 'unit_price', header: 'Unit Price', cell: ({ row }) => formatMoney(Number(row.original.unit_price)) },
            { accessorKey: 'line_total', header: 'Line Total', cell: ({ row }) => formatMoney(Number(row.original.line_total)) },
            { accessorKey: 'cashier_name', header: 'Cashier', cell: ({ row }) => row.original.cashier_name || '-' },
            { accessorKey: 'sale_date', header: 'Date', cell: ({ row }) => new Date(row.original.sale_date).toLocaleString() },
        ],
        []
    );

    const paymentColumns: ColumnDef<PosPaymentRow>[] = useMemo(
        () => [
            { accessorKey: 'sale_id', header: 'Order', cell: ({ row }) => `#S-${row.original.sale_id}` },
            { accessorKey: 'account_name', header: 'Account', cell: ({ row }) => row.original.account_name || '-' },
            { accessorKey: 'amount_paid', header: 'Amount', cell: ({ row }) => formatMoney(Number(row.original.amount_paid)) },
            { accessorKey: 'reference_no', header: 'Reference', cell: ({ row }) => row.original.reference_no || '-' },
            { accessorKey: 'cashier_name', header: 'Cashier', cell: ({ row }) => row.original.cashier_name || '-' },
            { accessorKey: 'pay_date', header: 'Date', cell: ({ row }) => new Date(row.original.pay_date).toLocaleString() },
        ],
        []
    );

    const reportSummary = useMemo(() => {
        const nonVoid = orders.filter((o) => o.status !== 'void');
        const totalSales = nonVoid.reduce((sum, o) => sum + Number(o.total || 0), 0);
        const byCashier = new Map<string, number>();
        nonVoid.forEach((o) => {
            const key = o.cashier_name || `User #${o.user_id}`;
            byCashier.set(key, (byCashier.get(key) || 0) + Number(o.total || 0));
        });
        const byAccount = new Map<string, number>();
        payments.forEach((p) => {
            const key = p.account_name || `Account #${p.acc_id}`;
            byAccount.set(key, (byAccount.get(key) || 0) + Number(p.amount_paid || 0));
        });
        return {
            totalSales,
            orderCount: nonVoid.length,
            byCashier: Array.from(byCashier.entries()).sort((a, b) => b[1] - a[1]),
            byAccount: Array.from(byAccount.entries()).sort((a, b) => b[1] - a[1]),
        };
    }, [orders, payments]);

    return (
        <div>
            <PageHeader title="POS Orders" description="Sales rung up through the POS screen." />

            <Tabs
                defaultTab="orders"
                tabs={[
                    {
                        id: 'orders',
                        label: 'Orders',
                        icon: ReceiptText,
                        badge: hasLoaded ? ordersTotalRows : undefined,
                        content: (
                            <div className="space-y-2">
                                <TabActionToolbar
                                    title="POS Orders"
                                    onDisplay={handleDisplay}
                                    displayLoading={loading}
                                    dateRange={{
                                        fromDate: dateRange.fromDate,
                                        toDate: dateRange.toDate,
                                        onFromDateChange: (value) => setDateRange((prev) => ({ ...prev, fromDate: value })),
                                        onToDateChange: (value) => setDateRange((prev) => ({ ...prev, toDate: value })),
                                    }}
                                />
                                <DataTable
                                    data={orders}
                                    columns={orderColumns}
                                    isLoading={loading}
                                    serverPagination={{
                                        pageIndex: ordersPageIndex,
                                        pageSize: ORDERS_PAGE_SIZE,
                                        pageCount: Math.max(ordersTotalPages, 1),
                                        totalRows: ordersTotalRows,
                                        onPageChange: handleOrdersPageChange,
                                        onPageSizeChange: () => {},
                                    }}
                                />
                                {!loading && !hasLoaded && <div className="text-sm text-slate-500 px-1">Click Display to load data.</div>}
                                {!loading && hasLoaded && orders.length === 0 && <div className="text-sm text-slate-500 px-1">No POS orders found for this range.</div>}
                            </div>
                        ),
                    },
                    {
                        id: 'items',
                        label: 'Order Products',
                        icon: Package,
                        content: (
                            <div className="space-y-2">
                                <DataTable data={orderItems} columns={itemColumns} isLoading={loading} searchPlaceholder="Search products..." />
                            </div>
                        ),
                    },
                    {
                        id: 'payments',
                        label: 'Payments',
                        icon: Wallet,
                        content: (
                            <div className="space-y-2">
                                <DataTable data={payments} columns={paymentColumns} isLoading={loading} searchPlaceholder="Search payments..." />
                            </div>
                        ),
                    },
                    {
                        id: 'returns',
                        label: 'Returns',
                        icon: RotateCcw,
                        content: (
                            <div className="max-w-2xl space-y-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                    Only POS sales made against a registered customer can be returned here (walk-in sales have no
                                    customer record to attach the return to).
                                </p>
                                <label className="flex flex-col gap-1 text-sm">
                                    <span className="font-medium text-slate-700 dark:text-slate-300">POS Sale</span>
                                    <SearchableCombobox<number>
                                        value={selectedReturnSaleId}
                                        options={returnableSales.map((s) => ({
                                            value: s.sale_id,
                                            label: `#S-${s.sale_id} · ${s.customer_name || 'Customer'} · ${formatMoney(s.total)}`,
                                        }))}
                                        placeholder="Select a POS sale..."
                                        onChange={(v) => void handleSelectReturnSale(v === '' ? '' : Number(v))}
                                    />
                                </label>

                                {returnLines.length > 0 && (
                                    <div className="space-y-2">
                                        {returnLines.map((line, idx) => (
                                            <div key={line.item_id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2">
                                                <div>
                                                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{line.name}</p>
                                                    <p className="text-xs text-slate-500">Sold: {line.sold_qty} @ {formatMoney(line.unit_price)}</p>
                                                </div>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={line.sold_qty}
                                                    value={line.return_qty}
                                                    onChange={(e) => {
                                                        const qty = Math.max(0, Math.min(line.sold_qty, Number(e.target.value || 0)));
                                                        setReturnLines((prev) => prev.map((l, i) => (i === idx ? { ...l, return_qty: qty } : l)));
                                                    }}
                                                    className="w-20 h-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm text-center"
                                                />
                                            </div>
                                        ))}
                                        <label className="flex flex-col gap-1 text-sm">
                                            <span className="font-medium text-slate-700 dark:text-slate-300">Refund To Account (optional)</span>
                                            <SearchableCombobox<number>
                                                value={refundAccId}
                                                options={accounts.map((a) => ({ value: a.acc_id, label: a.name }))}
                                                placeholder="No refund account"
                                                onChange={(v) => setRefundAccId(v === '' ? '' : Number(v))}
                                            />
                                        </label>
                                        <button
                                            type="button"
                                            disabled={submittingReturn}
                                            onClick={handleSubmitReturn}
                                            className="w-full py-3 rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-bold disabled:opacity-60"
                                        >
                                            {submittingReturn ? 'Recording…' : 'Record Return'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        ),
                    },
                    {
                        id: 'reports',
                        label: 'POS Reports',
                        icon: BarChart3,
                        content: (
                            <div className="space-y-4">
                                {!hasLoaded ? (
                                    <div className="text-sm text-slate-500 px-1">Click Display on the Orders tab to load report data for a date range.</div>
                                ) : (
                                    <>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                                                <p className="text-xs font-bold text-slate-500 uppercase">Total POS Sales</p>
                                                <p className="text-3xl font-black text-slate-900 dark:text-white mt-1">{formatMoney(reportSummary.totalSales)}</p>
                                                <p className="text-xs text-slate-500 mt-1">{reportSummary.orderCount} orders (this page)</p>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                                                <p className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-3">Sales by Cashier</p>
                                                <div className="space-y-2">
                                                    {reportSummary.byCashier.length === 0 && <p className="text-xs text-slate-500">No data</p>}
                                                    {reportSummary.byCashier.map(([name, amount]) => (
                                                        <div key={name} className="flex justify-between text-sm">
                                                            <span className="text-slate-600 dark:text-slate-300">{name}</span>
                                                            <span className="font-bold text-slate-900 dark:text-white">{formatMoney(amount)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                                                <p className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-3">Payments by Account</p>
                                                <div className="space-y-2">
                                                    {reportSummary.byAccount.length === 0 && <p className="text-xs text-slate-500">No data</p>}
                                                    {reportSummary.byAccount.map(([name, amount]) => (
                                                        <div key={name} className="flex justify-between text-sm">
                                                            <span className="text-slate-600 dark:text-slate-300">{name}</span>
                                                            <span className="font-bold text-slate-900 dark:text-white">{formatMoney(amount)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        ),
                    },
                ]}
            />

            <Modal
                isOpen={viewOpen}
                onClose={() => { setViewOpen(false); setViewSale(null); setViewItems([]); setViewLoading(false); }}
                title={viewSale ? `Order #S-${viewSale.sale_id}` : 'Order Details'}
                size="xl"
            >
                {viewLoading ? (
                    <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">Loading order details...</div>
                ) : !viewSale ? (
                    <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">No details to display.</div>
                ) : (
                    <div className="space-y-4 text-sm">
                        <div className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/40 sm:grid-cols-2 lg:grid-cols-4">
                            <div><p className="text-xs text-slate-500 dark:text-slate-400">Order #</p><p className="font-semibold text-slate-900 dark:text-slate-100">#S-{viewSale.sale_id}</p></div>
                            <div><p className="text-xs text-slate-500 dark:text-slate-400">Date & Time</p><p className="font-semibold text-slate-900 dark:text-slate-100">{new Date(viewSale.sale_date).toLocaleString()}</p></div>
                            <div><p className="text-xs text-slate-500 dark:text-slate-400">Customer</p><p className="font-semibold text-slate-900 dark:text-slate-100">{viewSale.customer_name || 'Walk-in'}</p></div>
                            <div><p className="text-xs text-slate-500 dark:text-slate-400">Cashier</p><p className="font-semibold text-slate-900 dark:text-slate-100">{viewSale.cashier_name || '-'}</p></div>
                            <div><p className="text-xs text-slate-500 dark:text-slate-400">Status</p><p className="font-semibold text-slate-900 dark:text-slate-100 capitalize">{viewSale.status}</p></div>
                            <div><p className="text-xs text-slate-500 dark:text-slate-400">Total</p><p className="font-semibold text-slate-900 dark:text-slate-100">{formatMoney(viewSale.total)}</p></div>
                        </div>
                        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                            <table className="min-w-full text-sm">
                                <thead className="bg-slate-100 text-left text-slate-600 dark:bg-slate-800 dark:text-slate-200">
                                    <tr>
                                        <th className="px-3 py-2">Product</th>
                                        <th className="px-3 py-2 text-right">Qty</th>
                                        <th className="px-3 py-2 text-right">Unit Price</th>
                                        <th className="px-3 py-2 text-right">Line Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {viewItems.map((item, index) => (
                                        <tr key={`${item.sale_item_id || item.item_id || index}`} className="border-t border-slate-200 dark:border-slate-700">
                                            <td className="px-3 py-2 text-slate-900 dark:text-slate-100">{item.item_name || `Product #${item.item_id}`}</td>
                                            <td className="px-3 py-2 text-right text-slate-900 dark:text-slate-100">{Number(item.quantity || 0)}</td>
                                            <td className="px-3 py-2 text-right text-slate-900 dark:text-slate-100">{formatMoney(Number(item.unit_price || 0))}</td>
                                            <td className="px-3 py-2 text-right font-medium text-slate-900 dark:text-slate-100">{formatMoney(Number(item.line_total || 0))}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </Modal>

            <ConfirmDialog
                isOpen={voidOpen}
                onClose={() => { setVoidOpen(false); setSaleToVoid(null); }}
                onConfirm={(reason) => { void confirmVoid(reason); }}
                title="Void Order?"
                message={saleToVoid ? `Void order #S-${saleToVoid.sale_id}? This reverses inventory, GL and customer balance.` : 'Void this order?'}
                confirmText="Void Order"
                cancelText="Cancel"
                variant="danger"
                requireReason
            />
        </div>
    );
};

export default POSOrders;
