import { useState, useEffect, useRef } from 'react';
import { Search, ShoppingCart, Trash2, Plus, Minus, CreditCard, Wallet, User, Package, Zap } from 'lucide-react';
import { useToast } from '../../components/ui/toast/Toast';
import { Modal } from '../../components/ui/modal/Modal';

// Mock Data
const posProducts = [
    { id: '1', name: 'iPhone 15 Pro', sku: 'IPH15P', price: 999.99, stock: 45, category: 'Phones' },
    { id: '2', name: 'MacBook Air M3', sku: 'MBA3', price: 1299.00, stock: 12, category: 'Laptops' },
    { id: '3', name: 'AirPods Pro 2', sku: 'APP2', price: 249.00, stock: 85, category: 'Audio' },
    { id: '4', name: 'iPad Pro 12.9', sku: 'IPP12', price: 1099.00, stock: 8, category: 'Tablets' },
    { id: '5', name: 'Apple Watch S9', sku: 'AWS9', price: 399.00, stock: 20, category: 'Wearables' },
];

interface CartItem {
    id: string;
    name: string;
    price: number;
    qty: number;
}

const POSTab = () => {
    const { showToast } = useToast();
    const searchInputRef = useRef<HTMLInputElement>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [cart, setCart] = useState<CartItem[]>([]);
    const [isPaymentOpen, setIsPaymentOpen] = useState(false);
    const [customerType, setCustomerType] = useState<'walking' | 'registered'>('walking');

    // Focus search on mount
    useEffect(() => {
        searchInputRef.current?.focus();
    }, []);

    const addToCart = (product: typeof posProducts[0]) => {
        const existing = cart.find(item => item.id === product.id);
        if (existing) {
            setCart(cart.map(item => item.id === product.id ? { ...item, qty: item.qty + 1 } : item));
        } else {
            setCart([...cart, { id: product.id, name: product.name, price: product.price, qty: 1 }]);
        }
        setSearchQuery('');
        searchInputRef.current?.focus();
    };

    const updateQty = (id: string, delta: number) => {
        setCart(cart.map(item => {
            if (item.id === id) {
                const newQty = Math.max(1, item.qty + delta);
                return { ...item, qty: newQty };
            }
            return item;
        }));
    };

    const removeFromCart = (id: string) => {
        setCart(cart.filter(item => item.id !== id));
    };

    const filteredProducts = posProducts.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.sku.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const discount = 0; // Simplified for UI demo
    const total = subtotal - discount;

    const handleCheckout = () => {
        if (cart.length === 0) {
            showToast('error', 'Cart is empty', 'Add some items before checking out.');
            return;
        }
        setIsPaymentOpen(true);
    };

    const completeSale = () => {
        showToast('success', 'Sale Completed!', `Transaction for $${total.toFixed(2)} recorded successfully.`);
        setCart([]);
        setIsPaymentOpen(false);
        searchInputRef.current?.focus();
    };

    return (
        <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-250px)]">
            {/* Left & Center: Inventory & Cart */}
            <div className="flex-grow flex flex-col gap-6 overflow-hidden">
                {/* Search & Results */}
                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm shrink-0">
                    <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                        <input
                            ref={searchInputRef}
                            type="text"
                            placeholder="Search product name or scan barcode (Enter to add first result)..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && filteredProducts.length > 0) {
                                    addToCart(filteredProducts[0]);
                                }
                            }}
                            className="w-full pl-12 pr-4 py-3 text-lg border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-slate-800 transition-all font-medium"
                        />
                    </div>

                    {searchQuery && (
                        <div className="absolute z-50 mt-2 w-[500px] max-h-[400px] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-2 custom-scrollbar">
                            {filteredProducts.map(product => (
                                <button
                                    key={product.id}
                                    onClick={() => addToCart(product)}
                                    className="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-colors group"
                                >
                                    <div className="flex items-center gap-4 text-left">
                                        <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center group-hover:bg-primary-50 dark:group-hover:bg-primary-900/10">
                                            <Package className="w-6 h-6 text-slate-500 group-hover:text-primary-600" />
                                        </div>
                                        <div>
                                            <p className="font-bold text-slate-800 dark:text-slate-100">{product.name}</p>
                                            <p className="text-xs text-slate-500 font-medium">{product.sku} • {product.category}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-bold text-primary-600">${product.price.toFixed(2)}</p>
                                        <p className={`text-xs font-bold ${product.stock < 10 ? 'text-red-500' : 'text-slate-400'}`}>
                                            {product.stock} in stock
                                        </p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Cart Table */}
                <div className="flex-grow bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col">
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
                                <Zap className="w-16 h-16 mb-4 opacity-10" />
                                <p className="text-lg font-bold opacity-30 italic">Ready for next customer...</p>
                                <p className="text-sm opacity-30">Scan or search items to start</p>
                            </div>
                        ) : (
                            <table className="w-full text-left border-collapse">
                                <thead className="sticky top-0 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-sm z-10">
                                    <tr>
                                        <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Item</th>
                                        <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Qty</th>
                                        <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Price</th>
                                        <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Subtotal</th>
                                        <th className="px-6 py-3"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {cart.map(item => (
                                        <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 group">
                                            <td className="px-6 py-4">
                                                <p className="font-bold text-slate-800 dark:text-slate-100">{item.name}</p>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center justify-center gap-3">
                                                    <button
                                                        onClick={() => updateQty(item.id, -1)}
                                                        className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                                    >
                                                        <Minus className="w-3 h-3" />
                                                    </button>
                                                    <span className="font-bold text-lg min-w-[20px] text-center">{item.qty}</span>
                                                    <button
                                                        onClick={() => updateQty(item.id, 1)}
                                                        className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                                    >
                                                        <Plus className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-right font-medium text-slate-500">${item.price.toFixed(2)}</td>
                                            <td className="px-6 py-4 text-right font-bold text-slate-800 dark:text-slate-100">
                                                ${(item.price * item.qty).toFixed(2)}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <button
                                                    onClick={() => removeFromCart(item.id)}
                                                    className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-lg transition-all"
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
                            onClick={() => setCustomerType('walking')}
                            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${customerType === 'walking' ? 'bg-white dark:bg-slate-700 text-primary-600 shadow-sm' : 'text-slate-500'}`}
                        >
                            Walking
                        </button>
                        <button
                            onClick={() => setCustomerType('registered')}
                            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${customerType === 'registered' ? 'bg-white dark:bg-slate-700 text-primary-600 shadow-sm' : 'text-slate-500'}`}
                        >
                            Registered
                        </button>
                    </div>
                    {customerType === 'walking' ? (
                        <p className="text-sm text-slate-500 italic text-center py-2">General Customer (No credit allowed)</p>
                    ) : (
                        <button className="w-full py-2.5 px-4 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-400 hover:border-primary-500 hover:text-primary-500 transition-all">
                            Select Customer...
                        </button>
                    )}
                </div>

                {/* Summary Card */}
                <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-xl flex flex-col h-full lg:max-h-[500px]">
                    <h4 className="font-bold text-slate-400 uppercase tracking-widest text-xs mb-6">Payment Summary</h4>

                    <div className="space-y-4 mb-auto">
                        <div className="flex justify-between items-center text-slate-300">
                            <span className="font-medium">Subtotal</span>
                            <span className="font-bold">${subtotal.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center text-slate-300">
                            <span className="font-medium">Tax (0%)</span>
                            <span className="font-bold">$0.00</span>
                        </div>
                        <div className="flex justify-between items-center text-slate-300">
                            <span className="font-medium">Discount</span>
                            <span className="font-bold">-$0.00</span>
                        </div>
                        <div className="pt-4 border-t border-slate-800">
                            <div className="flex justify-between items-end">
                                <span className="font-bold text-slate-400 text-sm">TOTAL AMOUNT</span>
                                <span className="text-4xl font-black text-emerald-400">${total.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>

                    <button
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
            <Modal
                isOpen={isPaymentOpen}
                onClose={() => setIsPaymentOpen(false)}
                title="Complete Transaction"
                size="md"
            >
                <div className="space-y-6">
                    <div className="text-center">
                        <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">Total Receivable</p>
                        <h2 className="text-5xl font-black text-slate-900 dark:text-white">${total.toFixed(2)}</h2>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <button className="p-6 border-2 border-primary-500 bg-primary-50 dark:bg-primary-900/10 rounded-2xl flex flex-col items-center gap-3">
                            <Wallet className="w-8 h-8 text-primary-600" />
                            <span className="font-black text-slate-900 dark:text-white">Cash</span>
                        </button>
                        <button className="p-6 border-2 border-slate-100 dark:border-slate-800 hover:border-primary-500 rounded-2xl flex flex-col items-center gap-3 transition-all">
                            <CreditCard className="w-8 h-8 text-slate-400" />
                            <span className="font-black text-slate-900 dark:text-white">Card</span>
                        </button>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-500">Amount Received</label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-black text-slate-400">$</span>
                            <input
                                type="number"
                                defaultValue={total.toFixed(2)}
                                className="w-full pl-10 pr-4 py-4 text-3xl font-black text-emerald-600 bg-slate-50 dark:bg-slate-800 rounded-2xl border-none focus:ring-0"
                            />
                        </div>
                    </div>

                    <div className="flex flex-col gap-3 pt-4">
                        <button
                            onClick={completeSale}
                            className="w-full py-4 bg-primary-600 text-white font-black text-xl rounded-2xl shadow-lg shadow-primary-500/20"
                        >
                            FINISH & PRINT
                        </button>
                        <button
                            onClick={() => setIsPaymentOpen(false)}
                            className="w-full py-2 font-bold text-slate-400 hover:text-slate-600"
                        >
                            Go Back
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default POSTab;
