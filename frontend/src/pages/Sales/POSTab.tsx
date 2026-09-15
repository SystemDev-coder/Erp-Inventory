import { useEffect, useMemo, useRef, useState } from 'react';
import {
    Search, ShoppingCart, Trash2, Plus, Minus, CreditCard, Wallet, User, Package,
    Zap, LockOpen, Lock, Printer,
} from 'lucide-react';
import { useToast } from '../../components/ui/toast/Toast';
import { Modal } from '../../components/ui/modal/Modal';
import { SearchableCombobox } from '../../components/ui/combobox/SearchableCombobox';
import { productService, Product, Category } from '../../services/product.service';
import { customerService, Customer } from '../../services/customer.service';
import { accountService, Account } from '../../services/account.service';
import { salesService } from '../../services/sales.service';
import { shiftService, Shift } from '../../services/shift.service';
import { useBranch } from '../../context/BranchContext';
import { useAuth } from '../../context/AuthContext';

interface CartItem {
    item_id: number;
    name: string;
    price: number;
    qty: number;
    available_qty: number;
    image_url: string | null;
}

const isCashAccount = (account: Account) => account.name.trim().toLowerCase().startsWith('cash');

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

const POSTab = () => {
    const { showToast } = useToast();
    const { activeBranchId } = useBranch();
    const { user } = useAuth();
    const searchInputRef = useRef<HTMLInputElement>(null);

    const [loading, setLoading] = useState(true);
    const [products, setProducts] = useState<Product[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [activeCategory, setActiveCategory] = useState<number | 'all'>('all');
    const [searchQuery, setSearchQuery] = useState('');

    const [customers, setCustomers] = useState<Customer[]>([]);
    const [accounts, setAccounts] = useState<Account[]>([]);

    const [cart, setCart] = useState<CartItem[]>([]);
    const [customerType, setCustomerType] = useState<'walking' | 'registered'>('walking');
    const [selectedCustomerId, setSelectedCustomerId] = useState<number | ''>('');

    const [checkingShift, setCheckingShift] = useState(true);
    const [openShift, setOpenShift] = useState<Shift | null>(null);
    const [openRegisterModalOpen, setOpenRegisterModalOpen] = useState(false);
    const [openingCash, setOpeningCash] = useState(0);
    const [openingNote, setOpeningNote] = useState('');
    const [registerBusy, setRegisterBusy] = useState(false);
    const [closeRegisterModalOpen, setCloseRegisterModalOpen] = useState(false);
    const [closingCash, setClosingCash] = useState(0);

    const [isPaymentOpen, setIsPaymentOpen] = useState(false);
    const [selectedAccId, setSelectedAccId] = useState<number | ''>('');
    const [amountReceived, setAmountReceived] = useState(0);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        searchInputRef.current?.focus();
    }, []);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            const [pRes, cRes, custRes, accRes] = await Promise.all([
                productService.list({ branchId: activeBranchId ?? undefined, limit: 200 }),
                productService.listCategories({ branchId: activeBranchId ?? undefined }),
                customerService.list({ branchId: activeBranchId ?? undefined }),
                accountService.list({ branchId: activeBranchId ?? undefined }),
            ]);
            if (pRes.success && pRes.data?.products) setProducts(pRes.data.products);
            if (cRes.success && cRes.data?.categories) setCategories(cRes.data.categories);
            if (custRes.success && custRes.data?.customers) setCustomers(custRes.data.customers);
            if (accRes.success && accRes.data?.accounts) setAccounts(accRes.data.accounts.filter((a) => a.is_active));
            setLoading(false);
        };
        void load();
    }, [activeBranchId]);

    const refreshOpenShift = async () => {
        if (!user?.user_id) return;
        setCheckingShift(true);
        const res = await shiftService.list({ status: 'open', userId: user.user_id, branchId: activeBranchId ?? undefined });
        if (res.success && res.data?.shifts?.length) {
            setOpenShift(res.data.shifts[0]);
        } else {
            setOpenShift(null);
        }
        setCheckingShift(false);
    };

    useEffect(() => {
        void refreshOpenShift();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.user_id, activeBranchId]);

    const handleOpenRegister = async () => {
        setRegisterBusy(true);
        const res = await shiftService.open({
            branchId: activeBranchId ?? undefined,
            openingCash: Number(openingCash || 0),
            note: openingNote || undefined,
        });
        setRegisterBusy(false);
        if (res.success && res.data?.shift) {
            setOpenShift(res.data.shift);
            setOpenRegisterModalOpen(false);
            setOpeningCash(0);
            setOpeningNote('');
            showToast('success', 'Register', 'Register opened.');
        } else {
            showToast('error', 'Register', res.error || 'Could not open the register.');
        }
    };

    const handleCloseRegister = async () => {
        if (!openShift) return;
        setRegisterBusy(true);
        const res = await shiftService.close(openShift.shift_id, { closingCash: Number(closingCash || 0) });
        setRegisterBusy(false);
        if (res.success && res.data?.shift) {
            const overShort = res.data.shift.over_short;
            showToast(
                Math.abs(overShort) < 0.005 ? 'success' : 'error',
                'Register Closed',
                Math.abs(overShort) < 0.005
                    ? 'Drawer matched exactly.'
                    : `${overShort > 0 ? 'Over' : 'Short'} by $${Math.abs(overShort).toFixed(2)}.`
            );
            setOpenShift(null);
            setCloseRegisterModalOpen(false);
            setClosingCash(0);
        } else {
            showToast('error', 'Register', res.error || 'Could not close the register.');
        }
    };

    const filteredProducts = useMemo(() => {
        let list = products;
        if (activeCategory !== 'all') list = list.filter((p) => p.category_id === activeCategory);
        const q = searchQuery.trim().toLowerCase();
        if (q) {
            list = list.filter(
                (p) => p.name.toLowerCase().includes(q) || String(p.barcode || '').toLowerCase().includes(q)
            );
        }
        return list;
    }, [products, activeCategory, searchQuery]);

    const availableQtyOf = (product: Product) => Number(product.quantity ?? product.stock ?? 0);

    const addToCart = (product: Product) => {
        const availableQty = availableQtyOf(product);
        if (availableQty <= 0) {
            showToast('error', 'Out of stock', `${product.name} has no available stock.`);
            return;
        }
        setCart((prev) => {
            const existing = prev.find((item) => item.item_id === product.product_id);
            if (existing) {
                if (existing.qty + 1 > availableQty) {
                    showToast('error', 'Stock limit', `Only ${availableQty} ${product.name} available.`);
                    return prev;
                }
                return prev.map((item) => (item.item_id === product.product_id ? { ...item, qty: item.qty + 1 } : item));
            }
            return [
                ...prev,
                {
                    item_id: product.product_id,
                    name: product.name,
                    price: Number(product.sell_price || 0),
                    qty: 1,
                    available_qty: availableQty,
                    image_url: product.image_url || null,
                },
            ];
        });
    };

    const updateQty = (id: number, delta: number) => {
        setCart((prev) =>
            prev.map((item) => {
                if (item.item_id !== id) return item;
                const nextQty = Math.max(1, item.qty + delta);
                if (nextQty > item.available_qty) {
                    showToast('error', 'Stock limit', `Only ${item.available_qty} available.`);
                    return item;
                }
                return { ...item, qty: nextQty };
            })
        );
    };

    const removeFromCart = (id: number) => setCart((prev) => prev.filter((item) => item.item_id !== id));

    const TAX_RATE_PERCENT = 5;
    const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
    const taxAmount = (subtotal * TAX_RATE_PERCENT) / 100;
    const total = subtotal + taxAmount;
    const changeDue = Math.max(0, Number(amountReceived || 0) - total);

    const cashAccounts = useMemo(() => accounts.filter(isCashAccount), [accounts]);
    const otherAccounts = useMemo(() => accounts.filter((a) => !isCashAccount(a)), [accounts]);

    const handleCheckout = () => {
        if (!openShift) {
            showToast('error', 'Register closed', 'Open a register before taking a sale.');
            return;
        }
        if (cart.length === 0) {
            showToast('error', 'Cart is empty', 'Add some items before checking out.');
            return;
        }
        setSelectedAccId(cashAccounts[0]?.acc_id ?? '');
        setAmountReceived(total);
        setIsPaymentOpen(true);
    };

    const completeSale = async () => {
        if (!openShift || !selectedAccId) {
            showToast('error', 'Payment', 'Choose a payment account first.');
            return;
        }
        setSubmitting(true);
        const res = await salesService.create({
            branchId: activeBranchId ?? undefined,
            customerId: customerType === 'registered' && selectedCustomerId ? Number(selectedCustomerId) : undefined,
            saleType: 'cash',
            docType: 'sale',
            status: 'paid',
            subtotal,
            discount: 0,
            total,
            taxRate: TAX_RATE_PERCENT,
            items: cart.map((item) => ({ itemId: item.item_id, quantity: item.qty, unitPrice: item.price })),
            payFromAccId: Number(selectedAccId),
            paidAmount: total,
            posShiftId: openShift.shift_id,
        });
        setSubmitting(false);
        if (!res.success || !res.data?.sale) {
            showToast('error', 'Sale Failed', res.error || 'Could not complete this sale.');
            return;
        }
        showToast('success', 'Sale Completed!', `Transaction for $${total.toFixed(2)} recorded successfully.`);
        const saleId = res.data.sale.sale_id;
        const printRes = await salesService.getPrintHtml(saleId);
        if (printRes.success && printRes.data?.html) {
            printHtmlInIframe(printRes.data.html);
        }
        setCart([]);
        setCustomerType('walking');
        setSelectedCustomerId('');
        setIsPaymentOpen(false);
        setAmountReceived(0);
        searchInputRef.current?.focus();
    };

    if (!checkingShift && !openShift) {
        return (
            <div className="flex h-[calc(100vh-250px)] min-h-[420px] items-center justify-center">
                <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-8 text-center">
                    <LockOpen className="w-12 h-12 text-primary-500 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-2">Register is closed</h3>
                    <p className="text-sm text-slate-500 mb-6">
                        Open a register with a starting cash float before ringing up sales.
                    </p>
                    <button
                        type="button"
                        onClick={() => setOpenRegisterModalOpen(true)}
                        className="w-full py-3 bg-primary-600 hover:bg-primary-700 text-white font-bold rounded-xl transition-all"
                    >
                        Open Register
                    </button>
                </div>

                <Modal isOpen={openRegisterModalOpen} onClose={() => setOpenRegisterModalOpen(false)} title="Open Register" size="sm">
                    <div className="space-y-4">
                        <label className="flex flex-col gap-1 text-sm">
                            <span className="font-medium text-slate-700 dark:text-slate-300">Opening Cash Float</span>
                            <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={openingCash}
                                onChange={(e) => setOpeningCash(Number(e.target.value || 0))}
                                className="h-11 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm"
                            />
                        </label>
                        <label className="flex flex-col gap-1 text-sm">
                            <span className="font-medium text-slate-700 dark:text-slate-300">Note (optional)</span>
                            <input
                                type="text"
                                value={openingNote}
                                onChange={(e) => setOpeningNote(e.target.value)}
                                className="h-11 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm"
                            />
                        </label>
                        <button
                            type="button"
                            disabled={registerBusy}
                            onClick={handleOpenRegister}
                            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl disabled:opacity-60"
                        >
                            {registerBusy ? 'Opening…' : 'Open Register'}
                        </button>
                    </div>
                </Modal>
            </div>
        );
    }

    return (
        <div className="flex flex-col lg:flex-row gap-6 lg:h-[calc(100vh-250px)] min-h-0">
            {/* Left & Center: Categories, Products & Cart */}
            <div className="flex-grow flex flex-col gap-6 overflow-hidden">
                {/* Register banner */}
                {openShift && (
                    <div className="flex items-center justify-between bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-2 shrink-0">
                        <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
                            <Lock className="w-4 h-4" />
                            <span className="font-bold">Register #{openShift.shift_id} open</span>
                            <span className="text-emerald-600/70 dark:text-emerald-400/70">
                                · Float ${openShift.opening_cash.toFixed(2)} · Expected ${openShift.expected_cash.toFixed(2)}
                            </span>
                        </div>
                        <button
                            type="button"
                            onClick={() => { setClosingCash(openShift.expected_cash); setCloseRegisterModalOpen(true); }}
                            className="text-xs font-bold text-emerald-700 dark:text-emerald-300 hover:underline"
                        >
                            Close Register
                        </button>
                    </div>
                )}

                {/* Category pills */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1 shrink-0">
                    <button
                        type="button"
                        onClick={() => setActiveCategory('all')}
                        className={`shrink-0 px-4 py-2 rounded-full text-sm font-bold transition-all ${
                            activeCategory === 'all'
                                ? 'bg-primary-600 text-white'
                                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
                        }`}
                    >
                        All Categories
                    </button>
                    {categories.map((c) => (
                        <button
                            key={c.category_id}
                            type="button"
                            onClick={() => setActiveCategory(c.category_id)}
                            className={`shrink-0 px-4 py-2 rounded-full text-sm font-bold transition-all ${
                                activeCategory === c.category_id
                                    ? 'bg-primary-600 text-white'
                                    : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
                            }`}
                        >
                            {c.name}
                        </button>
                    ))}
                </div>

                {/* Search */}
                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm shrink-0">
                    <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" aria-hidden="true" />
                        <input
                            ref={searchInputRef}
                            type="text"
                            placeholder="Search product name or scan barcode..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && filteredProducts.length > 0) {
                                    addToCart(filteredProducts[0]);
                                }
                            }}
                            aria-label="Search product name or scan barcode"
                            className="w-full pl-12 pr-4 py-3 text-lg border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-slate-800 transition-all font-medium"
                        />
                    </div>
                </div>

                {/* Product grid */}
                <div className="flex-grow bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-y-auto p-4">
                    {loading ? (
                        <div className="h-full flex items-center justify-center text-slate-400">Loading products…</div>
                    ) : filteredProducts.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8">
                            <Package className="w-12 h-12 mb-3 opacity-20" />
                            <p className="font-bold opacity-40">No products found</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                            {filteredProducts.map((product) => {
                                const availableQty = availableQtyOf(product);
                                return (
                                    <button
                                        key={product.product_id}
                                        type="button"
                                        onClick={() => addToCart(product)}
                                        disabled={availableQty <= 0}
                                        className="text-left rounded-xl border border-slate-200 dark:border-slate-800 hover:border-primary-500 dark:hover:border-primary-500 transition-all p-3 disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        <div className="aspect-square w-full rounded-lg bg-slate-100 dark:bg-slate-800 overflow-hidden flex items-center justify-center mb-2">
                                            {product.image_url ? (
                                                <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                                            ) : (
                                                <Package className="w-8 h-8 text-slate-400" />
                                            )}
                                        </div>
                                        {product.category_name && (
                                            <span className="inline-block mb-1 px-2 py-0.5 rounded text-[10px] font-bold bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-300">
                                                {product.category_name}
                                            </span>
                                        )}
                                        <p className="font-bold text-sm text-slate-800 dark:text-slate-100 truncate">{product.name}</p>
                                        <div className="flex items-center justify-between mt-1">
                                            <span className="font-bold text-primary-600">${Number(product.sell_price || 0).toFixed(2)}</span>
                                            <span className={`text-[11px] font-bold ${availableQty <= 0 ? 'text-red-500' : availableQty < 10 ? 'text-amber-500' : 'text-slate-400'}`}>
                                                {availableQty} left
                                            </span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Cart Table */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col max-h-[280px] shrink-0">
                    <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                            <ShoppingCart className="w-5 h-5 text-primary-600" />
                            Current Order
                        </h3>
                        <span className="text-xs font-bold bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-slate-500">
                            {cart.length} Items
                        </span>
                    </div>

                    <div className="flex-grow overflow-y-auto custom-scrollbar">
                        {cart.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8">
                                <Zap className="w-12 h-12 mb-2 opacity-10" />
                                <p className="font-bold opacity-30 italic">Ready for next customer...</p>
                            </div>
                        ) : (
                            <table className="w-full text-left border-collapse">
                                <thead className="sticky top-0 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-sm z-10">
                                    <tr>
                                        <th className="px-4 py-2 text-xs font-bold text-slate-500 uppercase tracking-wider">Item</th>
                                        <th className="px-4 py-2 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Qty</th>
                                        <th className="px-4 py-2 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Price</th>
                                        <th className="px-4 py-2 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Subtotal</th>
                                        <th className="px-4 py-2"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {cart.map((item) => (
                                        <tr key={item.item_id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 group">
                                            <td className="px-4 py-2">
                                                <p className="font-bold text-slate-800 dark:text-slate-100">{item.name}</p>
                                            </td>
                                            <td className="px-4 py-2">
                                                <div className="flex items-center justify-center gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => updateQty(item.item_id, -1)}
                                                        aria-label={`Decrease quantity of ${item.name}`}
                                                        className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                                    >
                                                        <Minus className="w-3 h-3" aria-hidden="true" />
                                                    </button>
                                                    <span className="font-bold min-w-[16px] text-center">{item.qty}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => updateQty(item.item_id, 1)}
                                                        aria-label={`Increase quantity of ${item.name}`}
                                                        className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                                    >
                                                        <Plus className="w-3 h-3" aria-hidden="true" />
                                                    </button>
                                                </div>
                                            </td>
                                            <td className="px-4 py-2 text-right font-medium text-slate-500">${item.price.toFixed(2)}</td>
                                            <td className="px-4 py-2 text-right font-bold text-slate-800 dark:text-slate-100">
                                                ${(item.price * item.qty).toFixed(2)}
                                            </td>
                                            <td className="px-4 py-2 text-right">
                                                <button
                                                    type="button"
                                                    onClick={() => removeFromCart(item.item_id)}
                                                    aria-label={`Remove ${item.name} from cart`}
                                                    className="inline-flex min-h-9 min-w-9 items-center justify-center p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-lg transition-all"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>

            {/* Right: Summary & Customer */}
            <div className="w-full lg:w-[380px] flex flex-col gap-6 shrink-0">
                {/* Customer Info */}
                <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <h4 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                            <User className="w-4 h-4 text-primary-600" />
                            Customer
                        </h4>
                    </div>
                    <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl mb-4">
                        <button
                            type="button"
                            onClick={() => setCustomerType('walking')}
                            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${customerType === 'walking' ? 'bg-white dark:bg-slate-700 text-primary-600 shadow-sm' : 'text-slate-500'}`}
                        >
                            Walking
                        </button>
                        <button
                            type="button"
                            onClick={() => setCustomerType('registered')}
                            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${customerType === 'registered' ? 'bg-white dark:bg-slate-700 text-primary-600 shadow-sm' : 'text-slate-500'}`}
                        >
                            Registered
                        </button>
                    </div>
                    {customerType === 'walking' ? (
                        <p className="text-sm text-slate-500 italic text-center py-2">General Customer (No credit allowed)</p>
                    ) : (
                        <SearchableCombobox<number>
                            value={selectedCustomerId}
                            options={customers.map((c) => ({ value: c.customer_id, label: c.full_name }))}
                            placeholder="Select customer..."
                            onChange={(v) => setSelectedCustomerId(v === '' ? '' : Number(v))}
                        />
                    )}
                </div>

                {/* Summary Card */}
                <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-xl flex flex-col h-full lg:max-h-[420px]">
                    <h4 className="font-bold text-slate-400 uppercase tracking-widest text-xs mb-6">Payment Summary</h4>

                    <div className="space-y-4 mb-auto">
                        <div className="flex justify-between items-center text-slate-300">
                            <span className="font-medium">Subtotal</span>
                            <span className="font-bold">${subtotal.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center text-slate-300">
                            <span className="font-medium">Tax ({TAX_RATE_PERCENT}%)</span>
                            <span className="font-bold">${taxAmount.toFixed(2)}</span>
                        </div>
                        <div className="pt-4 border-t border-slate-800">
                            <div className="flex justify-between items-end">
                                <span className="font-bold text-slate-400 text-sm">TOTAL AMOUNT</span>
                                <span className="text-4xl font-black text-emerald-400">${total.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={handleCheckout}
                        disabled={cart.length === 0}
                        className="w-full mt-8 py-4 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-700 disabled:cursor-not-allowed text-slate-900 font-black text-xl rounded-2xl transition-all flex items-center justify-center gap-3 shadow-lg shadow-emerald-500/20 active:scale-95"
                    >
                        <CreditCard className="w-6 h-6" />
                        PAY NOW
                    </button>
                </div>
            </div>

            {/* Payment Modal */}
            <Modal isOpen={isPaymentOpen} onClose={() => setIsPaymentOpen(false)} title="Complete Transaction" size="md">
                <div className="space-y-6">
                    <div className="text-center">
                        <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">Total Receivable</p>
                        <h2 className="text-5xl font-black text-slate-900 dark:text-white">${total.toFixed(2)}</h2>
                    </div>

                    <div>
                        <p className="text-sm font-bold text-slate-500 mb-2">Pay Into Account</p>
                        <div className="grid grid-cols-2 gap-3">
                            {[...cashAccounts, ...otherAccounts].map((account) => (
                                <button
                                    key={account.acc_id}
                                    type="button"
                                    onClick={() => setSelectedAccId(account.acc_id)}
                                    className={`p-4 rounded-2xl flex flex-col items-center gap-2 border-2 transition-all ${
                                        selectedAccId === account.acc_id
                                            ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/10'
                                            : 'border-slate-100 dark:border-slate-800 hover:border-primary-300'
                                    }`}
                                >
                                    {isCashAccount(account) ? (
                                        <Wallet className="w-6 h-6 text-primary-600" />
                                    ) : (
                                        <CreditCard className="w-6 h-6 text-slate-400" />
                                    )}
                                    <span className="text-xs font-black text-slate-900 dark:text-white text-center">{account.name}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-500">Amount Received</label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-black text-slate-400">$</span>
                            <input
                                type="number"
                                value={amountReceived}
                                onChange={(e) => setAmountReceived(Number(e.target.value || 0))}
                                className="w-full pl-10 pr-4 py-4 text-3xl font-black text-emerald-600 bg-slate-50 dark:bg-slate-800 rounded-2xl border-none focus:ring-0"
                            />
                        </div>
                        {changeDue > 0 && (
                            <p className="text-sm font-bold text-slate-500">Change due: <span className="text-emerald-600">${changeDue.toFixed(2)}</span></p>
                        )}
                    </div>

                    <div className="flex flex-col gap-3 pt-4">
                        <button
                            type="button"
                            onClick={completeSale}
                            disabled={submitting || !selectedAccId}
                            className="w-full py-4 bg-primary-600 text-white font-black text-xl rounded-2xl shadow-lg shadow-primary-500/20 disabled:opacity-60 flex items-center justify-center gap-2"
                        >
                            <Printer className="w-5 h-5" />
                            {submitting ? 'Processing…' : 'FINISH & PRINT'}
                        </button>
                        <button
                            type="button"
                            onClick={() => setIsPaymentOpen(false)}
                            className="w-full py-2 font-bold text-slate-400 hover:text-slate-600"
                        >
                            Go Back
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Close Register Modal */}
            <Modal isOpen={closeRegisterModalOpen} onClose={() => setCloseRegisterModalOpen(false)} title="Close Register" size="sm">
                {openShift && (
                    <div className="space-y-4">
                        <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-4 text-sm space-y-1">
                            <div className="flex justify-between"><span className="text-slate-500">Opening Float</span><span className="font-bold">${openShift.opening_cash.toFixed(2)}</span></div>
                            <div className="flex justify-between"><span className="text-slate-500">Expected Cash</span><span className="font-bold">${openShift.expected_cash.toFixed(2)}</span></div>
                        </div>
                        <label className="flex flex-col gap-1 text-sm">
                            <span className="font-medium text-slate-700 dark:text-slate-300">Counted Cash</span>
                            <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={closingCash}
                                onChange={(e) => setClosingCash(Number(e.target.value || 0))}
                                className="h-11 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm"
                            />
                        </label>
                        <p className={`text-sm font-bold ${Math.abs(closingCash - openShift.expected_cash) < 0.005 ? 'text-emerald-600' : 'text-red-500'}`}>
                            {closingCash - openShift.expected_cash >= 0 ? 'Over' : 'Short'} by ${Math.abs(closingCash - openShift.expected_cash).toFixed(2)}
                        </p>
                        <button
                            type="button"
                            disabled={registerBusy}
                            onClick={handleCloseRegister}
                            className="w-full py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl disabled:opacity-60"
                        >
                            {registerBusy ? 'Closing…' : 'Close Register'}
                        </button>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default POSTab;
