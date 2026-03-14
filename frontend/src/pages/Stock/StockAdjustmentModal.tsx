import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../../components/ui/modal/Modal';
import { useToast } from '../../components/ui/toast/Toast';
import { inventoryService, InventoryItem } from '../../services/inventory.service';

type AdjustmentType = 'INCREASE' | 'DECREASE';

export type StockAdjustmentModalProps = {
  isOpen: boolean;
  onClose: () => void;
  items: InventoryItem[];
  availableQtyByItemId?: Record<number, number>;
  onSaved: () => void | Promise<void>;
};

const todayYmd = () => new Date().toISOString().slice(0, 10);

export default function StockAdjustmentModal({
  isOpen,
  onClose,
  items,
  availableQtyByItemId,
  onSaved,
}: StockAdjustmentModalProps) {
  const { showToast } = useToast();

  const [itemId, setItemId] = useState<number | ''>('');
  const [adjustmentType, setAdjustmentType] = useState<AdjustmentType>('INCREASE');
  const [quantity, setQuantity] = useState<number>(1);
  const [reason, setReason] = useState<string>('');
  const [adjustmentDate] = useState<string>(todayYmd());
  const [isSaving, setIsSaving] = useState(false);

  const availableQty = useMemo(() => {
    if (!availableQtyByItemId || itemId === '') return undefined;
    return availableQtyByItemId[Number(itemId)];
  }, [availableQtyByItemId, itemId]);

  const decreaseTooLarge =
    adjustmentType === 'DECREASE' &&
    itemId !== '' &&
    availableQty !== undefined &&
    quantity > availableQty;

  useEffect(() => {
    if (!isOpen) return;
    setItemId('');
    setAdjustmentType('INCREASE');
    setQuantity(1);
    setReason('');
  }, [isOpen]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (itemId === '') {
      showToast('error', 'Validation error', 'Item is required.');
      return;
    }
    if (!Number.isFinite(quantity) || quantity < 1) {
      showToast('error', 'Validation error', 'Quantity must be at least 1.');
      return;
    }
    if (decreaseTooLarge) {
      showToast('error', 'Not enough stock', 'Decrease quantity exceeds available stock.');
      return;
    }

    try {
      setIsSaving(true);
      await inventoryService.adjust({
        itemId: Number(itemId),
        adjustmentType,
        quantity: Math.round(quantity),
        adjustmentDate,
        reason: reason.trim() || undefined,
      });
      showToast('success', 'Saved', 'Stock adjustment recorded.');
      await onSaved();
      onClose();
    } catch (err: any) {
      showToast('error', 'Failed', err?.message || 'Could not save stock adjustment.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Stock Adjustment" size="md">
      <form onSubmit={submit} className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Item *</label>
            <select
              value={itemId}
              onChange={(e) => setItemId(e.target.value ? Number(e.target.value) : '')}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-900 outline-none transition-all focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              required
            >
              <option value="">Select item</option>
              {items.map((it) => (
                <option key={it.item_id} value={it.item_id}>
                  {it.item_name}
                </option>
              ))}
            </select>
            {availableQty !== undefined && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Available: <span className="font-semibold">{availableQty}</span>
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Adjustment Type *</label>
            <select
              value={adjustmentType}
              onChange={(e) => setAdjustmentType(e.target.value as AdjustmentType)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-900 outline-none transition-all focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="INCREASE">Increase</option>
              <option value="DECREASE">Decrease</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Quantity *</label>
            <input
              type="number"
              min={1}
              step={1}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Math.round(Number(e.target.value) || 1)))}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-900 outline-none transition-all focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              required
            />
            {decreaseTooLarge && (
              <p className="text-xs font-semibold text-red-600">Quantity exceeds available stock.</p>
            )}
          </div>

          <div className="space-y-2 sm:col-span-2">
            <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Reason (optional)</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Optional"
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-900 outline-none transition-all focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Date</label>
            <input
              type="date"
              value={adjustmentDate}
              disabled
              className="w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-6 py-2.5 text-sm font-bold text-slate-600 transition-all hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving || decreaseTooLarge}
            className="rounded-xl bg-primary-600 px-8 py-2.5 text-sm font-bold text-white shadow-lg shadow-primary-500/20 transition-all hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60 active:scale-95"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

