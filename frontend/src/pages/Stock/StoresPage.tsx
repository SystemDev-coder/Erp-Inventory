import { useEffect, useState } from 'react';
import { Store, Package, Plus, Trash2, ChevronDown, ChevronRight, Pencil, Eye, ArrowLeftRight } from 'lucide-react';
import { PageHeader } from '../../components/ui/layout';
import { useToast } from '../../components/ui/toast/Toast';
import { storeService, Store as StoreType, StoreItem } from '../../services/store.service';
import { productService, Product } from '../../services/product.service';
import { inventoryService } from '../../services/inventory.service';
import { Modal } from '../../components/ui/modal/Modal';
import { ConfirmDialog } from '../../components/ui/modal/ConfirmDialog';
import { itemLabelWithAvailability } from '../../utils/itemAvailability';
import { useBranch } from '../../context/BranchContext';

const StoresPage: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
  const { showToast } = useToast();
  const { activeBranchId } = useBranch();
  const [stores, setStores] = useState<StoreType[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasDisplayed, setHasDisplayed] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [storeItems, setStoreItems] = useState<Record<number, StoreItem[]>>({});
  const [editQty, setEditQty] = useState<Record<number, number>>({});

  const [itemModalStore, setItemModalStore] = useState<StoreType | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [addProductId, setAddProductId] = useState<number | ''>('');
  const [addQty, setAddQty] = useState(1);

  const [storeModalOpen, setStoreModalOpen] = useState(false);
  const [editingStoreId, setEditingStoreId] = useState<number | null>(null);
  const [formStore, setFormStore] = useState({ storeName: '', storeCode: '', address: '', phone: '' });

  // removeItem requires a delete reason (same rule as every other delete in
  // this app) but the button used to call it with none, which always failed
  // server-side with no explanation shown to the user - prompt for it instead.
  const [removeTarget, setRemoveTarget] = useState<{ storeId: number; itemId: number; productName: string } | null>(null);
  const [removing, setRemoving] = useState(false);

  // Store Transfer: a focused store-to-store variant of the existing generic
  // Transfers page/API (frontend/src/pages/Transfers/Transfers.tsx already
  // supports fromType/toType='store', added in the Central Delete
  // Architecture's Phase 6) - no new backend endpoint, just a simpler modal
  // scoped to store<->store so it doesn't need to leave this tab.
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  const [transferForm, setTransferForm] = useState({
    fromStoreId: '' as number | '',
    toStoreId: '' as number | '',
    productId: '' as number | '',
    qty: 1,
    note: '',
  });

  const loadStores = async () => {
    setLoading(true);
    setHasDisplayed(true);
    const res = await storeService.list({
      branchId: activeBranchId ?? undefined,
    });
    if (res.success && res.data?.stores) {
      setStores(res.data.stores);
    } else {
      showToast('error', 'Load failed', res.error || 'Could not load stores');
    }
    setLoading(false);
  };

  useEffect(() => {
    if (hasDisplayed) void loadStores();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBranchId]);

  const loadStoreItems = async (storeId: number) => {
    const res = await storeService.listItems(storeId);
    if (res.success && res.data?.items) {
      setStoreItems((prev) => ({ ...prev, [storeId]: res.data!.items }));
      setEditQty((prev) => {
        const next = { ...prev };
        res.data!.items.forEach((item) => {
          next[item.store_item_id] = Number(item.quantity || 0);
        });
        return next;
      });
    } else {
      showToast('error', 'Store Products', res.error || 'Could not load store products');
    }
  };

  const loadProducts = async () => {
    const res = await productService.list({ branchId: activeBranchId ?? undefined });
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

  const openAddItemModal = async (store: StoreType) => {
    setItemModalStore(store);
    await loadProducts();
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemModalStore || !addProductId) {
      showToast('error', 'Select product', 'Choose a product and quantity');
      return;
    }
    setLoading(true);
    const res = await storeService.addItem(itemModalStore.store_id, {
      productId: Number(addProductId),
      quantity: addQty,
    });
    setLoading(false);

    if (res.success) {
      showToast('success', 'Product added');
      setAddProductId('');
      setAddQty(1);
      loadStoreItems(itemModalStore.store_id);
    } else {
      showToast('error', 'Add failed', res.error || 'Could not add product');
    }
  };

  const handleRemoveItem = async (reason: string) => {
    if (!removeTarget) return;
    const { storeId, itemId } = removeTarget;
    setRemoving(true);
    const res = await storeService.removeItem(storeId, itemId, reason);
    setRemoving(false);
    if (res.success) {
      showToast('success', 'Product removed');
      setRemoveTarget(null);
      loadStoreItems(storeId);
    } else {
      showToast('error', 'Remove failed', res.error || 'Could not remove product');
    }
  };

  const handleUpdateItemQty = async (storeId: number, itemId: number) => {
    const qty = Number(editQty[itemId] ?? 0);
    if (!Number.isFinite(qty) || qty < 0) {
      showToast('error', 'Quantity', 'Enter a valid quantity');
      return;
    }
    setLoading(true);
    const res = await storeService.updateItem(storeId, itemId, qty);
    setLoading(false);
    if (res.success) {
      showToast('success', 'Store Products', 'Quantity updated');
      await loadStoreItems(storeId);
    } else {
      showToast('error', 'Store Products', res.error || 'Could not update quantity');
    }
  };

  const openTransferModal = async () => {
    if (!products.length) await loadProducts();
    setTransferForm({ fromStoreId: '', toStoreId: '', productId: '', qty: 1, note: '' });
    setTransferModalOpen(true);
  };

  const handleSubmitTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferForm.fromStoreId || !transferForm.toStoreId) {
      showToast('error', 'Store Transfer', 'Choose both a source and destination store');
      return;
    }
    if (transferForm.fromStoreId === transferForm.toStoreId) {
      showToast('error', 'Store Transfer', 'Source and destination stores must be different');
      return;
    }
    if (!transferForm.productId || Number(transferForm.qty) <= 0) {
      showToast('error', 'Store Transfer', 'Choose a product and a quantity greater than zero');
      return;
    }
    setTransferSubmitting(true);
    const res = await inventoryService.transfer({
      fromType: 'store',
      toType: 'store',
      fromStoreId: Number(transferForm.fromStoreId),
      toStoreId: Number(transferForm.toStoreId),
      productId: Number(transferForm.productId),
      qty: Number(transferForm.qty),
      note: transferForm.note || undefined,
    });
    setTransferSubmitting(false);
    if (res.success) {
      showToast('success', 'Store Transfer', 'Stock transferred');
      setTransferModalOpen(false);
      if (expandedId === Number(transferForm.fromStoreId)) await loadStoreItems(Number(transferForm.fromStoreId));
      if (expandedId === Number(transferForm.toStoreId)) await loadStoreItems(Number(transferForm.toStoreId));
    } else {
      showToast('error', 'Store Transfer', res.error || 'Transfer failed');
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
          description="Manage stores and store product allocations."
          actions={
            <div className="flex items-center gap-2">
              <button
                onClick={() => void openTransferModal()}
                className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-xl text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <ArrowLeftRight className="w-4 h-4" /> Store Transfer
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
            onClick={() => void openTransferModal()}
            className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-xl text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <ArrowLeftRight className="w-4 h-4" /> Store Transfer
          </button>
          <button
            onClick={openCreateStore}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700"
          >
            <Plus className="w-4 h-4" /> New Store
          </button>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
        <div className="flex items-end justify-end">
          <button
            onClick={() => void loadStores()}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-slate-300 rounded-xl text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Eye className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> {loading ? 'Loading...' : 'Display'}
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {loading && stores.length === 0 ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary-600 border-t-transparent" />
          </div>
        ) : stores.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <Store className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>
              {hasDisplayed ? 'No data found for the selected filters.' : 'Click Display to load data.'}
            </p>
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
                  </div>
                </div>

                {expandedId === store.store_id && (
                  <div className="px-4 pb-4 pt-0 bg-slate-50/50 dark:bg-slate-800/30">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Products in this store</span>
                      <button
                        onClick={() => openAddItemModal(store)}
                        className="inline-flex items-center gap-1 text-sm px-2 py-1 rounded-lg bg-primary-600 text-white hover:bg-primary-700"
                      >
                        <Package className="w-4 h-4" /> Add product
                      </button>
                    </div>
                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                      <table className="min-w-full text-sm">
                        <thead className="bg-slate-100 dark:bg-slate-800">
                          <tr>
                            <th className="px-3 py-2 text-left">Product</th>
                            <th className="px-3 py-2 text-right">Quantity</th>
                            <th className="px-3 py-2 w-48">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(storeItems[store.store_id] || []).map((item) => (
                            <tr key={item.store_item_id} className="border-t border-slate-200 dark:border-slate-700">
                              <td className="px-3 py-2">{item.product_name || `Product #${item.product_id}`}</td>
                              <td className="px-3 py-2 text-right">
                                <input
                                  type="number"
                                  min={0}
                                  step={1}
                                  className="w-28 rounded border border-slate-300 bg-white px-2 py-1 text-right text-sm dark:border-slate-700 dark:bg-slate-900"
                                  value={editQty[item.store_item_id] ?? Number(item.quantity || 0)}
                                  onChange={(e) => setEditQty((prev) => ({ ...prev, [item.store_item_id]: Number(e.target.value || 0) }))}
                                />
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => void handleUpdateItemQty(store.store_id, item.store_item_id)}
                                    className="rounded bg-primary-600 px-2 py-1 text-xs text-white hover:bg-primary-700"
                                  >
                                    Set
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setRemoveTarget({
                                        storeId: store.store_id,
                                        itemId: item.store_item_id,
                                        productName: item.product_name || `Product #${item.product_id}`,
                                      })
                                    }
                                    className="text-red-500 hover:text-red-600 p-1"
                                    title="Remove"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {(!storeItems[store.store_id] || storeItems[store.store_id].length === 0) && (
                        <div className="px-3 py-4 text-center text-slate-500 text-sm">No products yet.</div>
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

      <Modal isOpen={!!itemModalStore} onClose={() => setItemModalStore(null)} title={itemModalStore ? `Add product to ${itemModalStore.store_name}` : 'Add product'} size="sm">
        {itemModalStore && (
          <form onSubmit={handleAddItem} className="space-y-3">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Product</label>
            <select className={fieldCls} value={addProductId} onChange={(e) => setAddProductId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">Select product</option>
              {products.map((p) => (
                <option key={p.product_id} value={p.product_id}>
                  {itemLabelWithAvailability(p.name, p.stock ?? p.quantity ?? p.opening_balance)}
                </option>
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

      <Modal isOpen={transferModalOpen} onClose={() => setTransferModalOpen(false)} title="Store Transfer" size="md">
        <form onSubmit={handleSubmitTransfer} className="space-y-3">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">From store *</label>
          <select
            className={fieldCls}
            value={transferForm.fromStoreId}
            onChange={(e) => setTransferForm((p) => ({ ...p, fromStoreId: e.target.value ? Number(e.target.value) : '' }))}
            required
          >
            <option value="">Select source store</option>
            {stores.map((s) => (
              <option key={s.store_id} value={s.store_id}>{s.store_name}</option>
            ))}
          </select>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">To store *</label>
          <select
            className={fieldCls}
            value={transferForm.toStoreId}
            onChange={(e) => setTransferForm((p) => ({ ...p, toStoreId: e.target.value ? Number(e.target.value) : '' }))}
            required
          >
            <option value="">Select destination store</option>
            {stores
              .filter((s) => s.store_id !== transferForm.fromStoreId)
              .map((s) => (
                <option key={s.store_id} value={s.store_id}>{s.store_name}</option>
              ))}
          </select>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Product *</label>
          <select
            className={fieldCls}
            value={transferForm.productId}
            onChange={(e) => setTransferForm((p) => ({ ...p, productId: e.target.value ? Number(e.target.value) : '' }))}
            required
          >
            <option value="">Select product</option>
            {products.map((p) => (
              <option key={p.product_id} value={p.product_id}>
                {itemLabelWithAvailability(p.name, p.stock ?? p.quantity ?? p.opening_balance)}
              </option>
            ))}
          </select>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Quantity *</label>
          <input
            type="number"
            min={1}
            step={1}
            className={fieldCls}
            value={transferForm.qty}
            onChange={(e) => setTransferForm((p) => ({ ...p, qty: Number(e.target.value) || 0 }))}
            required
          />
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Note</label>
          <input
            className={fieldCls}
            value={transferForm.note}
            onChange={(e) => setTransferForm((p) => ({ ...p, note: e.target.value }))}
            placeholder="Optional"
          />
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setTransferModalOpen(false)} className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600">Cancel</button>
            <button type="submit" disabled={transferSubmitting} className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60">
              {transferSubmitting ? 'Transferring...' : 'Transfer'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        onConfirm={(reason) => void handleRemoveItem(reason || '')}
        requireReason
        title="Remove Product from Store?"
        highlightedName={removeTarget?.productName}
        message="This removes the product's stock record from this store. Provide a reason for the audit log."
        confirmText="Remove"
        cancelText="Cancel"
        variant="danger"
        isLoading={removing}
      />
    </div>
  );
};

export default StoresPage;
