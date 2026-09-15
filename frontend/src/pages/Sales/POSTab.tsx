import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import {
    ArrowLeft, Search, Package, MinusCircle, PlusCircle, Trash2, PauseCircle,
    XCircle, CreditCard, Wallet, Headphones, Footprints, Smartphone, Watch,
    Laptop, Store, Lightbulb, LayoutGrid,
} from 'lucide-react';
import { ThemeToggleButton } from '../../components/common/ThemeToggleButton';
import NotificationDropdown from '../../components/header/NotificationDropdown';
import UserDropdown from '../../components/header/UserDropdown';
import { SearchableCombobox } from '../../components/ui/combobox/SearchableCombobox';
import { useToast } from '../../components/ui/toast/Toast';
import { productService, Product, Category } from '../../services/product.service';
import { customerService, Customer } from '../../services/customer.service';
import { accountService, Account } from '../../services/account.service';
import { salesService } from '../../services/sales.service';
import { useBranch } from '../../context/BranchContext';

interface CartItem {
    item_id: number;
    name: string;
    price: number;
    qty: number;
    available_qty: number;
    image_url: string | null;
}

const isCashAccount = (account: Account) => account.name.trim().toLowerCase().startsWith('cash');

// Categories are user-defined in this app (no fixed icon/color per name like the
// reference design has), so each one is assigned a look deterministically by
// position instead - keeps every category visually distinct without needing
// per-category configuration data.
const CATEGORY_LOOKS: Array<{ icon: typeof Headphones; className: string }> = [
    { icon: Headphones, className: 'text-purple-500' },
    { icon: Footprints, className: 'text-orange-500' },
    { icon: Smartphone, className: 'text-pink-500' },
    { icon: Watch, className: 'text-amber-500' },
    { icon: Laptop, className: 'text-primary-500' },
    { icon: Store, className: 'text-emerald-500' },
    { icon: Lightbulb, className: 'text-yellow-500' },
];

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
    const navigate = useNavigate();
    const productSearchRef = useRef<HTMLInputElement>(null);

    const [loading, setLoading] = useState(true);
    const [products, setProducts] = useState<Product[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [activeCategory, setActiveCategory] = useState<number | 'all'>('all');
    const [productSearch, setProductSearch] = useState('');

    const [customers, setCustomers] = useState<Customer[]>([]);
    const [accounts, setAccounts] = useState<Account[]>([]);

    const [cart, setCart] = useState<CartItem[]>([]);
    const [selectedCustomerId, setSelectedCustomerId] = useState<number | ''>('');
    const [addProductId, setAddProductId] = useState<number | ''>('');
    const [discount, setDiscount] = useState(0);

    const [selectedAccId, setSelectedAccId] = useState<number | ''>('');
    const [submitting, setSubmitting] = useState(false);

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

    const filteredProducts = useMemo(() => {
        let list = products;
        if (activeCategory !== 'all') list = list.filter((p) => p.category_id === activeCategory);
        const q = productSearch.trim().toLowerCase();
        if (q) {
            list = list.filter(
                (p) => p.name.toLowerCase().includes(q) || String(p.barcode || '').toLowerCase().includes(q)
            );
        }
        return list;
    }, [products, activeCategory, productSearch]);

    const availableQtyOf = (product: Product) => Number(product.quantity ?? product.stock ?? 0);
    const cartQtyOf = (productId: number) => cart.find((item) => item.item_id === productId)?.qty ?? 0;

    const addToCart = (product: Product, delta = 1) => {
        const availableQty = availableQtyOf(product);
        setCart((prev) => {
            const existing = prev.find((item) => item.item_id === product.product_id);
            const nextQty = (existing?.qty ?? 0) + delta;
            if (nextQty <= 0) {
                return prev.filter((item) => item.item_id !== product.product_id);
            }
            if (nextQty > availableQty) {
                showToast('error', 'Stock limit', `Only ${availableQty} ${product.name} available.`);
                return prev;
            }
            if (existing) {
                return prev.map((item) => (item.item_id === product.product_id ? { ...item, qty: nextQty } : item));
            }
            return [
                ...prev,
                {
                    item_id: product.product_id,
                    name: product.name,
                    price: Number(product.sell_price || 0),
                    qty: nextQty,
                    available_qty: availableQty,
                    image_url: product.image_url || null,
                },
            ];
        });
    };

    const updateCartQty = (id: number, delta: number) => {
        setCart((prev) => {
            const item = prev.find((line) => line.item_id === id);
            if (!item) return prev;
            const nextQty = item.qty + delta;
            if (nextQty <= 0) return prev.filter((line) => line.item_id !== id);
            if (nextQty > item.available_qty) {
                showToast('error', 'Stock limit', `Only ${item.available_qty} available.`);
                return prev;
            }
            return prev.map((line) => (line.item_id === id ? { ...line, qty: nextQty } : line));
        });
    };

    const removeFromCart = (id: number) => setCart((prev) => prev.filter((item) => item.item_id !== id));
    const clearCart = () => setCart([]);

    const handleAddProductFromSelect = (productId: number | '') => {
        setAddProductId(productId);
        if (!productId) return;
        const product = products.find((p) => p.product_id === Number(productId));
        if (product) addToCart(product);
        setAddProductId('');
    };

    // Hardware barcode scanners act as a keyboard: they "type" the barcode
    // into whatever's focused, then send Enter. This is what actually fires
    // on that Enter - it must match the barcode EXACTLY (not the substring
    // match the visible grid filter uses, which would add the wrong product
    // if one barcode happens to contain another as a substring) and it must
    // search every product regardless of which category tab is selected, so
    // a scan always works no matter what's currently being browsed.
    const handleSearchEnter = () => {
        const raw = productSearch.trim();
        if (!raw) return;
        const exactBarcodeMatch = products.find((p) => String(p.barcode || '').toLowerCase() === raw.toLowerCase());
        if (exactBarcodeMatch) {
            addToCart(exactBarcodeMatch);
            setProductSearch('');
            return;
        }
        if (filteredProducts.length > 0) {
            addToCart(filteredProducts[0]);
            return;
        }
        showToast('error', 'Not found', `No product matches "${raw}".`);
    };

    const TAX_RATE_PERCENT = 5;
    const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
    const taxAmount = (subtotal * TAX_RATE_PERCENT) / 100;
    const total = Math.max(0, subtotal + taxAmount - Number(discount || 0));

    const cashAccounts = useMemo(() => accounts.filter(isCashAccount), [accounts]);
    const otherAccounts = useMemo(() => accounts.filter((a) => !isCashAccount(a)), [accounts]);

    const handleHold = () => {
        showToast('error', 'Hold', 'Holding an order for later isn’t available yet.');
    };

    const handleVoid = () => {
        if (cart.length === 0) return;
        clearCart();
        setDiscount(0);
        showToast('success', 'Order Cleared', 'The current order was cleared.');
    };

    const handlePayment = async () => {
        if (cart.length === 0) {
            showToast('error', 'Cart is empty', 'Add some products before taking payment.');
            return;
        }
        if (!selectedAccId) {
            showToast('error', 'Payment', 'Choose a payment method first.');
            return;
        }
        setSubmitting(true);
        const res = await salesService.create({
            branchId: activeBranchId ?? undefined,
            customerId: selectedCustomerId ? Number(selectedCustomerId) : undefined,
            saleType: 'cash',
            docType: 'sale',
            status: 'paid',
            subtotal,
            discount: Number(discount || 0),
            total,
            taxRate: TAX_RATE_PERCENT,
            items: cart.map((item) => ({ itemId: item.item_id, quantity: item.qty, unitPrice: item.price })),
            payFromAccId: Number(selectedAccId),
            paidAmount: total,
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
        clearCart();
        setSelectedCustomerId('');
        setDiscount(0);
        setSelectedAccId('');
        productSearchRef.current?.focus();
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
            {/* Header */}
            <header className="px-4 py-3 flex items-center justify-between gap-4 flex-wrap border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={() => navigate('/sales')}
                        aria-label="Back to Sales"
                        className="flex items-center justify-center size-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                        <ArrowLeft className="size-4" />
                    </button>
                    <div className="relative w-64">
                        <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 size-4" aria-hidden="true" />
                        <input
                            ref={productSearchRef}
                            type="text"
                            placeholder="Search product or scan barcode"
                            value={productSearch}
                            onChange={(e) => setProductSearch(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleSearchEnter();
                                }
                            }}
                            autoFocus
                            className="w-full px-3 pe-8 py-2 h-9 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                        />
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <ThemeToggleButton />
                    <NotificationDropdown />
                    <UserDropdown />
                </div>
            </header>

            {/* Main */}
            <main className="mx-4 my-4 p-5 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
                <div className="grid grid-cols-12 gap-6">
                    {/* Left Side */}
                    <div className="col-span-12 lg:col-span-8">
                        {/* Categories */}
                        <div className="border-b border-slate-200 dark:border-slate-800 mb-5 pb-5">
                            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-3">Categories</h1>
                            <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
                                <button
                                    type="button"
                                    onClick={() => setActiveCategory('all')}
                                    className={`shrink-0 inline-flex items-center gap-2 pl-2 pr-3 py-1 rounded-full border text-sm font-medium transition ${
                                        activeCategory === 'all'
                                            ? 'border-primary-500 text-primary-600 bg-white dark:bg-slate-900'
                                            : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 hover:border-primary-300'
                                    }`}
                                >
                                    <span className="bg-slate-50 dark:bg-slate-800 size-7 rounded-full border border-slate-200 dark:border-slate-700 flex items-center justify-center">
                                        <LayoutGrid className="size-3.5" />
                                    </span>
                                    <span>All Categories</span>
                                </button>
                                {categories.map((c, idx) => {
                                    const look = CATEGORY_LOOKS[idx % CATEGORY_LOOKS.length];
                                    const Icon = look.icon;
                                    const isActive = activeCategory === c.category_id;
                                    return (
                                        <button
                                            key={c.category_id}
                                            type="button"
                                            onClick={() => setActiveCategory(c.category_id)}
                                            className={`shrink-0 inline-flex items-center gap-2 pl-2 pr-3 py-1 rounded-full border text-sm font-medium transition ${
                                                isActive
                                                    ? 'border-primary-500 text-primary-600 bg-white dark:bg-slate-900'
                                                    : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 hover:border-primary-300'
                                            }`}
                                        >
                                            <span className="bg-slate-50 dark:bg-slate-800 size-7 rounded-full border border-slate-200 dark:border-slate-700 flex items-center justify-center">
                                                <Icon className={`size-3.5 ${look.className}`} />
                                            </span>
                                            <span>{c.name}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Products */}
                        <div className="overflow-y-auto max-h-[calc(100vh-284px)]">
                            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-0">Products</h2>
                            </div>
                            {loading ? (
                                <div className="py-16 text-center text-slate-400">Loading products…</div>
                            ) : filteredProducts.length === 0 ? (
                                <div className="py-16 text-center text-slate-400">
                                    <Package className="size-10 mx-auto mb-3 opacity-20" />
                                    <p className="font-semibold opacity-50">No products found</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                    {filteredProducts.map((product) => {
                                        const availableQty = availableQtyOf(product);
                                        const qty = cartQtyOf(product.product_id);
                                        return (
                                            <div
                                                key={product.product_id}
                                                className={`bg-white dark:bg-slate-900 border rounded-lg p-4 transition ${
                                                    qty > 0
                                                        ? 'border-primary-500 ring-1 ring-primary-500/30'
                                                        : 'border-slate-200 dark:border-slate-800'
                                                }`}
                                            >
                                                <button
                                                    type="button"
                                                    onClick={() => addToCart(product)}
                                                    disabled={availableQty <= qty}
                                                    className="w-full bg-slate-50 dark:bg-slate-800 p-4 rounded-lg flex items-center justify-center aspect-square overflow-hidden disabled:cursor-not-allowed disabled:opacity-60"
                                                >
                                                    {product.image_url ? (
                                                        <img src={product.image_url} alt={product.name} className="w-full h-full object-contain" />
                                                    ) : (
                                                        <Package className="size-10 text-slate-400" />
                                                    )}
                                                </button>
                                                <div className="pt-5">
                                                    {product.category_name && (
                                                        <span className="inline-block text-[10px] text-primary-600 bg-primary-50 dark:bg-primary-900/20 dark:text-primary-300 px-1.5 py-0.5 rounded mb-1">
                                                            {product.category_name}
                                                        </span>
                                                    )}
                                                    <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mt-1 mb-4 truncate">{product.name}</h2>
                                                    <div className="flex items-center justify-between gap-1">
                                                        <span className="text-sm font-medium text-primary-600">${Number(product.sell_price || 0).toFixed(2)}</span>
                                                        <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                                                            <button
                                                                type="button"
                                                                aria-label={`Decrease ${product.name}`}
                                                                onClick={() => addToCart(product, -1)}
                                                                disabled={qty <= 0}
                                                                className="disabled:opacity-30 hover:text-red-500 transition"
                                                            >
                                                                <MinusCircle className="size-4" />
                                                            </button>
                                                            <span className="text-sm font-medium text-slate-900 dark:text-slate-100 min-w-4 text-center">{qty}</span>
                                                            <button
                                                                type="button"
                                                                aria-label={`Increase ${product.name}`}
                                                                onClick={() => addToCart(product, 1)}
                                                                disabled={availableQty <= qty}
                                                                className="disabled:opacity-30 hover:text-emerald-500 transition"
                                                            >
                                                                <PlusCircle className="size-4" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <p className={`mt-1 text-[11px] font-medium ${availableQty <= 0 ? 'text-red-500' : availableQty < 10 ? 'text-amber-500' : 'text-slate-400'}`}>
                                                        {availableQty} in stock
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right Side */}
                    <div className="col-span-12 lg:col-span-4">
                        <div className="ml-0 lg:ml-3 lg:pl-5 pl-0 border-0 lg:border-l border-slate-200 dark:border-slate-800 overflow-y-auto h-full lg:max-h-[calc(100vh-170px)]">
                            {/* Order List */}
                            <div className="flex items-center justify-between p-4 rounded-lg bg-slate-50 dark:bg-slate-800 mb-6">
                                <div>
                                    <p className="text-base font-bold text-slate-900 dark:text-slate-100 mb-1">Order List</p>
                                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-0">New sale</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={clearCart}
                                    aria-label="Clear order"
                                    className="size-8 rounded-md border border-slate-200 dark:border-slate-700 flex items-center justify-center bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-red-500 hover:text-white hover:border-red-500 transition"
                                >
                                    <Trash2 className="size-4" />
                                </button>
                            </div>

                            {/* Customer Information */}
                            <div className="mb-5 pb-5 border-b border-slate-200 dark:border-slate-800">
                                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4">Customer Information</h2>
                                <div className="mb-3">
                                    <label className="text-sm text-slate-800 dark:text-slate-200 font-semibold mb-1 block">Customer</label>
                                    <SearchableCombobox<number>
                                        value={selectedCustomerId}
                                        options={customers.map((c) => ({ value: c.customer_id, label: c.full_name }))}
                                        placeholder="Walk-in customer"
                                        onChange={(v) => setSelectedCustomerId(v === '' ? '' : Number(v))}
                                    />
                                </div>
                                <div className="mb-0">
                                    <label className="text-sm text-slate-800 dark:text-slate-200 font-semibold mb-1 block">Add Product</label>
                                    <SearchableCombobox<number>
                                        value={addProductId}
                                        options={filteredProducts.map((p) => ({ value: p.product_id, label: p.name }))}
                                        placeholder="Search and select..."
                                        onChange={(v) => handleAddProductFromSelect(v === '' ? '' : Number(v))}
                                    />
                                </div>
                            </div>

                            {/* Product Added */}
                            <div className="mb-5 pb-5 border-b border-slate-200 dark:border-slate-800">
                                <div className="flex items-center justify-between gap-3 mb-4">
                                    <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 inline-flex items-center gap-1 mb-0">
                                        Product Added
                                        <span className="inline-flex items-center justify-center size-4 bg-emerald-500 text-white text-[10px] font-medium rounded-full">
                                            {cart.length}
                                        </span>
                                    </h2>
                                    <button type="button" onClick={clearCart} className="text-sm font-medium text-red-500 inline-flex items-center gap-1">
                                        <XCircle className="size-3.5" /> Clear All
                                    </button>
                                </div>

                                {cart.length === 0 ? (
                                    <div className="text-center p-6 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 mb-4">
                                        <Package className="size-8 text-slate-300 dark:text-slate-600 mb-2 inline-block" />
                                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">No Products Selected</p>
                                        <p className="text-sm text-slate-500 mb-0">Tap products to add them</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3 mb-4">
                                        {cart.map((item) => (
                                            <div key={item.item_id} className="flex items-center justify-between flex-wrap gap-3 p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <div className="size-14 rounded-md bg-slate-50 dark:bg-slate-800 p-2 flex items-center justify-center overflow-hidden shrink-0">
                                                        {item.image_url ? (
                                                            <img src={item.image_url} alt={item.name} className="w-10 h-10 object-contain" />
                                                        ) : (
                                                            <Package className="size-6 text-slate-400" />
                                                        )}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{item.name}</h3>
                                                        <span className="text-xs text-slate-500">${item.price.toFixed(2)} each</span>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-medium text-emerald-600">${(item.price * item.qty).toFixed(2)}</span>
                                                    <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1">
                                                        <button type="button" aria-label="Decrease" onClick={() => updateCartQty(item.item_id, -1)} className="text-slate-500 hover:text-red-500">
                                                            <MinusCircle className="size-4" />
                                                        </button>
                                                        <span className="text-sm font-semibold min-w-[16px] text-center">{item.qty}</span>
                                                        <button type="button" aria-label="Increase" onClick={() => updateCartQty(item.item_id, 1)} className="text-slate-500 hover:text-emerald-500">
                                                            <PlusCircle className="size-4" />
                                                        </button>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        aria-label={`Remove ${item.name}`}
                                                        onClick={() => removeFromCart(item.item_id)}
                                                        className="size-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500 hover:bg-red-500 hover:text-white hover:border-red-500 transition"
                                                    >
                                                        <Trash2 className="size-4 mx-auto" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <label className="flex flex-col gap-1 text-sm">
                                    <span className="font-semibold text-slate-800 dark:text-slate-200">Discount ($)</span>
                                    <input
                                        type="number"
                                        min={0}
                                        step="0.01"
                                        value={discount}
                                        onChange={(e) => setDiscount(Number(e.target.value || 0))}
                                        className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                                    />
                                </label>
                            </div>

                            {/* Sub Total */}
                            <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-5 mb-5">
                                <p className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-sm mb-2">Sub Total <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">${subtotal.toFixed(2)}</span></p>
                                <p className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-sm mb-2">Tax ({TAX_RATE_PERCENT}%) <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">${taxAmount.toFixed(2)}</span></p>
                                <p className="flex items-center justify-between text-red-500 text-sm mb-4">Discount <span className="text-sm font-semibold">-${Number(discount || 0).toFixed(2)}</span></p>
                                <p className="flex items-center justify-between text-slate-900 dark:text-slate-100 font-semibold text-sm mb-0">Grand Total <span className="text-sm font-semibold">${total.toFixed(2)}</span></p>
                            </div>

                            {/* Payment Method */}
                            <div>
                                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-3">Payment Method</h2>
                                <div className="grid grid-cols-3 gap-2 mb-3">
                                    {[...cashAccounts, ...otherAccounts].map((account) => (
                                        <button
                                            key={account.acc_id}
                                            type="button"
                                            onClick={() => setSelectedAccId(account.acc_id)}
                                            className={`px-2 py-3 rounded-md border text-slate-700 dark:text-slate-200 flex flex-col items-center gap-0.5 transition ${
                                                selectedAccId === account.acc_id
                                                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/10 text-primary-600'
                                                    : 'border-slate-200 dark:border-slate-700 hover:border-primary-300'
                                            }`}
                                        >
                                            {isCashAccount(account) ? <Wallet className="size-4" /> : <CreditCard className="size-4" />}
                                            <span className="text-[11px] font-medium truncate max-w-full">{account.name}</span>
                                        </button>
                                    ))}
                                </div>
                                <div className="bg-slate-900 text-white text-center py-3 rounded-md mb-2">
                                    <span className="text-sm font-semibold">Grand Total : ${total.toFixed(2)}</span>
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                    <button
                                        type="button"
                                        onClick={handleHold}
                                        className="py-2.5 rounded-md bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium inline-flex items-center justify-center gap-1 transition"
                                    >
                                        <PauseCircle className="size-4" /> <span className="hidden sm:inline">Hold</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleVoid}
                                        className="py-2.5 rounded-md bg-red-500 hover:bg-red-600 text-white text-sm font-medium inline-flex items-center justify-center gap-1 transition"
                                    >
                                        <XCircle className="size-4" /> <span className="hidden sm:inline">Void</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handlePayment}
                                        disabled={submitting}
                                        className="py-2.5 rounded-md bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium inline-flex items-center justify-center gap-1 transition disabled:opacity-60"
                                    >
                                        <CreditCard className="size-4" /> <span className="hidden sm:inline">{submitting ? 'Processing…' : 'Payment'}</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            <div className="text-center text-sm text-slate-500 dark:text-slate-400 my-4">© 2026 Dubia. All rights reserved.</div>
        </div>
    );
};

export default POSTab;
