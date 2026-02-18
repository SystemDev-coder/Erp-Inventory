import { useState } from 'react';
import { Store, Package, Plus, Trash2, ChevronDown, ChevronRight, Pencil, Eye } from 'lucide-react';
import { useEffect } from 'react';
import { PageHeader } from '../../components/ui/layout';
import { useToast } from '../../components/ui/toast/Toast';
import { storeService, Store as StoreType, StoreItem } from '../../services/store.service';
import { productService, Product } from '../../services/product.service';
import { Modal } from '../../components/ui/modal/Modal';
import { ConfirmDialog } from '../../components/ui/modal/ConfirmDialog';

const StoresPage: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
  const { showToast } = useToast();
  const [stores, setStores] = useState<StoreType[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [storeItems, setStoreItems] = useState<Record<number, StoreItem[]>>({});

  const [itemModalStore, setItemModalStore] = useState<StoreType | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [addProductId, setAddProductId] = useState<number | ''>('');
  const [addQty, setAddQty] = useState(1);

  const [storeModalOpen, setStoreModalOpen] = useState(false);
  const [editingStoreId, setEditingStoreId] = useState<number | null>(null);
  const [formStore, setFormStore] = useState({ storeName: '', storeCode: '', address: '', phone: '' });
  const [storeToDelete, setStoreToDelete] = useState<StoreType | null>(null);

  const loadStores = async () => {
    setLoading(true);
    const res = await storeService.list();
    if (res.success && res.data?.stores) {
      setStores(res.data.stores);
    } else {
      showToast('error', 'Load failed', res.error || 'Could not load stores');
    }
    setLoading(false);
  };

  useEffect(() => {
    void loadStores();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadStoreItems = async (storeId: number) => {
    const res = await storeService.listItems(storeId);
    if (res.success && res.data?.items) {
      setStoreItems((prev) => ({ ...prev, [storeId]: res.data!.items }));
    } else {
      showToast('error', 'Store Items', res.error || 'Could not load store items');
    }
  };

  const loadProducts = async () => {
    const res = await productService.list();
    if (res.success && res.data?.products) {
      setProducts(res.data.products);
    }
  };

  const openCreateStore = () => {
    setEditingStoreId(null);
    setFormStore({ storeName: '', storeCode: '', address: '', phone: '' });
    setStoreModalOpen(true);
  };

  const openEditStore = (store: StoreType) => {
    setEditingStoreId(store.store_id);
    setFormStore({
      storeName: store.store_name,
      storeCode: store.store_code || '',
      address: store.address || '',
      phone: store.phone || '',
    });
    setStoreModalOpen(true);
  };

  const handleSaveStore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formStore.storeName.trim()) {
      showToast('error', 'Name required', 'Enter store name');
      return;
    }

    setLoading(true);
    const payload = {
      storeName: formStore.storeName,
      storeCode: formStore.storeCode || undefined,
      address: formStore.address || undefined,
      phone: formStore.phone || undefined,
    };

    const res = editingStoreId
      ? await storeService.update(editingStoreId, payload)
      : await storeService.create(payload);

    setLoading(false);
    if (res.success) {
      showToast('success', editingStoreId ? 'Store updated' : 'Store created');
      setStoreModalOpen(false);
      setEditingStoreId(null);
      setFormStore({ storeName: '', storeCode: '', address: '', phone: '' });
      loadStores();
    } else {
      showToast('error', editingStoreId ? 'Update failed' : 'Create failed', res.error || 'Could not save store');
    }
  };

  const confirmDeleteStore = async () => {
    if (!storeToDelete) return;
    setLoading(true);
    const res = await storeService.remove(storeToDelete.store_id);
    setLoading(false);
    if (res.success) {
      showToast('success', 'Store deleted');
      setStoreToDelete(null);
      loadStores();
    } else {
      showToast('error', 'Delete failed', res.error || 'Could not delete store');
    }
  };

  const openAddItemModal = async (store: StoreType) => {
    setItemModalStore(store);
    await loadProducts();
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemModalStore || !addProductId) {
      showToast('error', 'Select item', 'Choose an item and quantity');
      return;
    }
    setLoading(true);
    const res = await storeService.addItem(itemModalStore.store_id, {
      productId: Number(addProductId),
      quantity: addQty,
    });
    setLoading(false);

    if (res.success) {
      showToast('success', 'Item added');
      setAddProductId('');
      setAddQty(1);
      loadStoreItems(itemModalStore.store_id);
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

  const toggleExpanded = async (storeId: number) => {
    const next = expandedId === storeId ? null : storeId;
    setExpandedId(next);
    if (next != null) {
      await loadStoreItems(next);
    }
  };

  const fieldCls = 'w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-800 text-slate-900 dark:text-slate-100';

  return (
    <div className="space-y-6">
      {!embedded && (
        <PageHeader
          title="Store"
          description="Manage stores and store item allocations."
          actions={
            <div className="flex items-center gap-2">
              <button
                onClick={() => loadStores()}
                className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-xl text-slate-700 hover:bg-slate-100"
              >
                <Eye className="w-4 h-4" /> Display
              </button>
              <button
                onClick={openCreateStore}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700"
              >
                <Plus className="w-4 h-4" /> New Store
              </button>
            </div>
          }
        />
      )}

      {embedded && (
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => loadStores()}
            className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-xl text-slate-700 hover:bg-slate-100"
          >
            <Eye className="w-4 h-4" /> Display
          </button>
          <button
            onClick={openCreateStore}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700"
          >
            <Plus className="w-4 h-4" /> New Store
          </button>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {loading && stores.length === 0 ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary-600 border-t-transparent" />
          </div>
        ) : stores.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <Store className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No stores loaded. Click Display to fetch stores.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {stores.map((store) => (
              <li key={store.store_id}>
                <div className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <button type="button" onClick={() => toggleExpanded(store.store_id)}>
                    {expandedId === store.store_id ? (
                      <ChevronDown className="w-5 h-5 text-slate-500" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-slate-500" />
                    )}
                  </button>
                  <Store className="w-5 h-5 text-primary-500" />
                  <span className="font-semibold text-slate-900 dark:text-white">{store.store_name}</span>
                  {store.store_code && <span className="text-sm text-slate-500">({store.store_code})</span>}
                  <div className="ml-auto flex items-center gap-2">
                    <button onClick={() => openEditStore(store)} className="p-1.5 rounded-lg border hover:bg-slate-100" title="Edit Store">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => setStoreToDelete(store)} className="p-1.5 rounded-lg border text-red-600 hover:bg-red-50" title="Delete Store">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {expandedId === store.store_id && (
                  <div className="px-4 pb-4 pt-0 bg-slate-50/50 dark:bg-slate-800/30">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Items in this store</span>
                      <button
                        onClick={() => openAddItemModal(store)}
                        className="inline-flex items-center gap-1 text-sm px-2 py-1 rounded-lg bg-primary-600 text-white hover:bg-primary-700"
                      >
                        <Package className="w-4 h-4" /> Add item
                      </button>
                    </div>
                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                      <table className="min-w-full text-sm">
                        <thead className="bg-slate-100 dark:bg-slate-800">
                          <tr>
                            <th className="px-3 py-2 text-left">Item</th>
                            <th className="px-3 py-2 text-right">Quantity</th>
                            <th className="px-3 py-2 w-16" />
                          </tr>
                        </thead>
                        <tbody>
                          {(storeItems[store.store_id] || []).map((item) => (
                            <tr key={item.store_item_id} className="border-t border-slate-200 dark:border-slate-700">
                              <td className="px-3 py-2">{item.product_name || `Item #${item.product_id}`}</td>
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
                        <div className="px-3 py-4 text-center text-slate-500 text-sm">No items yet.</div>
                      )}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal isOpen={storeModalOpen} onClose={() => setStoreModalOpen(false)} title={editingStoreId ? 'Edit Store' : 'New Store'} size="md">
        <form onSubmit={handleSaveStore} className="space-y-3">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Store name *</label>
          <input className={fieldCls} value={formStore.storeName} onChange={(e) => setFormStore((p) => ({ ...p, storeName: e.target.value }))} placeholder="Main Store" required />
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Store code</label>
          <input className={fieldCls} value={formStore.storeCode} onChange={(e) => setFormStore((p) => ({ ...p, storeCode: e.target.value }))} placeholder="STORE-01" />
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Address</label>
          <input className={fieldCls} value={formStore.address} onChange={(e) => setFormStore((p) => ({ ...p, address: e.target.value }))} />
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Phone</label>
          <input className={fieldCls} value={formStore.phone} onChange={(e) => setFormStore((p) => ({ ...p, phone: e.target.value }))} />
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setStoreModalOpen(false)} className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600">Cancel</button>
            <button type="submit" className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700">Save</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!itemModalStore} onClose={() => setItemModalStore(null)} title={itemModalStore ? `Add item to ${itemModalStore.store_name}` : 'Add item'} size="sm">
        {itemModalStore && (
          <form onSubmit={handleAddItem} className="space-y-3">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Item</label>
            <select className={fieldCls} value={addProductId} onChange={(e) => setAddProductId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">Select item</option>
              {products.map((p) => (
                <option key={p.product_id} value={p.product_id}>{p.name}</option>
              ))}
            </select>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Quantity</label>
            <input type="number" min={0} step={1} className={fieldCls} value={addQty} onChange={(e) => setAddQty(Number(e.target.value) || 0)} />
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setItemModalStore(null)} className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600">Cancel</button>
              <button type="submit" className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700">Add</button>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={!!storeToDelete}
        onClose={() => setStoreToDelete(null)}
        onConfirm={confirmDeleteStore}
        title="Delete Store"
        message={`Delete store "${storeToDelete?.store_name || ''}"?`}
        confirmText="Delete"
        variant="danger"
        isLoading={loading}
      />
    </div>
  );
};

export default StoresPage;
