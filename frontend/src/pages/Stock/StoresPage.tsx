import { useEffect, useState } from 'react';
import { Store, Package, Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { PageHeader } from '../../components/ui/layout';
import { useToast } from '../../components/ui/toast/Toast';
import { storeService, Store as StoreType, StoreItem } from '../../services/store.service';
import { productService, Product } from '../../services/product.service';
import { Modal } from '../../components/ui/modal/Modal';

const StoresPage = () => {
  const { showToast } = useToast();
  const [stores, setStores] = useState<StoreType[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [storeItems, setStoreItems] = useState<Record<number, StoreItem[]>>({});
  const [modalStore, setModalStore] = useState<StoreType | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [addProductId, setAddProductId] = useState<number | ''>('');
  const [addQty, setAddQty] = useState(1);
  const [formStore, setFormStore] = useState({ storeName: '', storeCode: '', address: '', phone: '' });
  const [showAddStore, setShowAddStore] = useState(false);

  const loadStores = async () => {
    setLoading(true);
    const res = await storeService.list();
    if (res.success && res.data?.stores) setStores(res.data.stores);
    else showToast('error', 'Load failed', res.error || 'Could not load stores');
    setLoading(false);
  };

  const loadStoreItems = async (storeId: number) => {
    const res = await storeService.listItems(storeId);
    if (res.success && res.data?.items) {
      setStoreItems((prev) => ({ ...prev, [storeId]: res.data!.items }));
    }
  };

  const loadProducts = async () => {
    const res = await productService.list();
    if (res.success && res.data?.products) setProducts(res.data.products);
  };

  useEffect(() => {
    loadStores();
  }, []);

  useEffect(() => {
    if (expandedId != null) loadStoreItems(expandedId);
  }, [expandedId]);

  useEffect(() => {
    if (modalStore) loadProducts();
  }, [modalStore]);

  const handleCreateStore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formStore.storeName.trim()) {
      showToast('error', 'Name required', 'Enter store name');
      return;
    }
    setLoading(true);
    const res = await storeService.create({
      storeName: formStore.storeName,
      storeCode: formStore.storeCode || undefined,
      address: formStore.address || undefined,
      phone: formStore.phone || undefined,
    });
    setLoading(false);
    if (res.success) {
      showToast('success', 'Store created');
      setShowAddStore(false);
      setFormStore({ storeName: '', storeCode: '', address: '', phone: '' });
      loadStores();
    } else {
      showToast('error', 'Create failed', res.error || 'Could not create store');
    }
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalStore || !addProductId) {
      showToast('error', 'Select product', 'Choose a product and quantity');
      return;
    }
    setLoading(true);
    const res = await storeService.addItem(modalStore.store_id, {
      productId: Number(addProductId),
      quantity: addQty,
    });
    setLoading(false);
    if (res.success) {
      showToast('success', 'Item added');
      setAddProductId('');
      setAddQty(1);
      loadStoreItems(modalStore.store_id);
      setStoreItems((prev) => ({ ...prev, [modalStore.store_id]: [...(prev[modalStore.store_id] || []), res.data!.item] }));
    } else {
      showToast('error', 'Add failed', res.error || 'Could not add item');
    }
  };

  const handleRemoveItem = async (storeId: number, itemId: number) => {
    setLoading(true);
    const res = await storeService.removeItem(storeId, itemId);
    setLoading(false);
    if (res.success) {
      showToast('success', 'Item removed');
      loadStoreItems(storeId);
    } else {
      showToast('error', 'Remove failed', res.error || 'Could not remove item');
    }
  };

  const fieldCls = 'w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-800 text-slate-900 dark:text-slate-100';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stores"
        description="Manage store locations and their items."
        actions={
          <button
            onClick={() => setShowAddStore(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700"
          >
            <Plus className="w-4 h-4" /> New Store
          </button>
        }
      />

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {loading && stores.length === 0 ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary-600 border-t-transparent" />
          </div>
        ) : stores.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <Store className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No stores yet. Create one to start adding items.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {stores.map((store) => (
              <li key={store.store_id}>
                <button
                  type="button"
                  onClick={() => setExpandedId(expandedId === store.store_id ? null : store.store_id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  {expandedId === store.store_id ? (
                    <ChevronDown className="w-5 h-5 text-slate-500" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-slate-500" />
                  )}
                  <Store className="w-5 h-5 text-primary-500" />
                  <span className="font-semibold text-slate-900 dark:text-white">{store.store_name}</span>
                  {store.store_code && (
                    <span className="text-sm text-slate-500">({store.store_code})</span>
                  )}
                </button>
                {expandedId === store.store_id && (
                  <div className="px-4 pb-4 pt-0 bg-slate-50/50 dark:bg-slate-800/30">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Items in this store</span>
                      <button
                        onClick={() => setModalStore(store)}
                        className="inline-flex items-center gap-1 text-sm px-2 py-1 rounded-lg bg-primary-600 text-white hover:bg-primary-700"
                      >
                        <Package className="w-4 h-4" /> Add item
                      </button>
                    </div>
                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                      <table className="min-w-full text-sm">
                        <thead className="bg-slate-100 dark:bg-slate-800">
                          <tr>
                            <th className="px-3 py-2 text-left">Product</th>
                            <th className="px-3 py-2 text-right">Quantity</th>
                            <th className="px-3 py-2 w-16" />
                          </tr>
                        </thead>
                        <tbody>
                          {(storeItems[store.store_id] || []).map((item) => (
                            <tr key={item.store_item_id} className="border-t border-slate-200 dark:border-slate-700">
                              <td className="px-3 py-2">{item.product_name || `Product #${item.product_id}`}</td>
                              <td className="px-3 py-2 text-right">{Number(item.quantity)}</td>
                              <td className="px-3 py-2">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveItem(store.store_id, item.store_item_id)}
                                  className="text-red-500 hover:text-red-600 p-1"
                                  title="Remove"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {(!storeItems[store.store_id] || storeItems[store.store_id].length === 0) && (
                        <div className="px-3 py-4 text-center text-slate-500 text-sm">No items. Click &quot;Add item&quot; to add products.</div>
                      )}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal
        isOpen={showAddStore}
        onClose={() => setShowAddStore(false)}
        title="New Store"
        size="md"
      >
        <form onSubmit={handleCreateStore} className="space-y-3">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Store name *</label>
          <input className={fieldCls} value={formStore.storeName} onChange={(e) => setFormStore((p) => ({ ...p, storeName: e.target.value }))} placeholder="Main Store" required />
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Store code</label>
          <input className={fieldCls} value={formStore.storeCode} onChange={(e) => setFormStore((p) => ({ ...p, storeCode: e.target.value }))} placeholder="STORE-01" />
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Address</label>
          <input className={fieldCls} value={formStore.address} onChange={(e) => setFormStore((p) => ({ ...p, address: e.target.value }))} placeholder="Optional" />
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Phone</label>
          <input className={fieldCls} value={formStore.phone} onChange={(e) => setFormStore((p) => ({ ...p, phone: e.target.value }))} placeholder="Optional" />
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowAddStore(false)} className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600">Cancel</button>
            <button type="submit" className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700">Create</button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={!!modalStore}
        onClose={() => setModalStore(null)}
        title={modalStore ? `Add item to ${modalStore.store_name}` : 'Add item'}
        size="sm"
      >
        {modalStore && (
          <form onSubmit={handleAddItem} className="space-y-3">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Product</label>
            <select className={fieldCls} value={addProductId} onChange={(e) => setAddProductId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">Select product</option>
              {products.map((p) => (
                <option key={p.product_id} value={p.product_id}>{p.name}</option>
              ))}
            </select>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Quantity</label>
            <input type="number" min={0} step={1} className={fieldCls} value={addQty} onChange={(e) => setAddQty(Number(e.target.value) || 0)} />
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setModalStore(null)} className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600">Cancel</button>
              <button type="submit" className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700">Add</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};

export default StoresPage;
