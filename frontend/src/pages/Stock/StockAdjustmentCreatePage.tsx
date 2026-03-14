import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '../../components/ui/layout';
import { useToast } from '../../components/ui/toast/Toast';
import { inventoryService, InventoryItem, StockLevelRow } from '../../services/inventory.service';

type AdjustmentType = 'INCREASE' | 'DECREASE';

type Line = {
  item_id: number | '';
  adjustment_type: AdjustmentType;
  quantity: number;
  available_qty?: number;
};

const todayYmd = () => new Date().toISOString().slice(0, 10);

type ItemOption = {
  item_id: number;
  item_name: string;
  available_qty: number;
};

export default function StockAdjustmentCreatePage() {
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [itemOptions, setItemOptions] = useState<ItemOption[]>([]);

  const [form, setForm] = useState<{
    adjustment_date: string;
    reason: string;
    items: Line[];
  }>({
    adjustment_date: todayYmd(),
    reason: '',
    items: [{ item_id: '', adjustment_type: 'INCREASE', quantity: 1 }],
  });

  useEffect(() => {
    const loadLookups = async () => {
      try {
        setLoading(true);
        const [itemsRes, stockRes] = await Promise.all([
          inventoryService.listItems({ page: 1, limit: 5000 }),
          inventoryService.listStock({ page: 1, limit: 5000 }),
        ]);

        const stockMap = new Map<number, number>();
        (stockRes.data?.rows ?? []).forEach((row) => {
          stockMap.set(Number(row.item_id), Math.round(Number(row.total_qty ?? row.branch_qty ?? 0)));
        });

        const mapped = (itemsRes.data?.items ?? []).map((item: InventoryItem) => {
          const id = Number(item.item_id);
          return {
            item_id: id,
            item_name: item.item_name,
            available_qty: stockMap.get(id) ?? 0,
          };
        });
        setItemOptions(mapped);
      } catch (err: any) {
        showToast('error', 'Stock Adjustment', err?.message || 'Failed to load items.');
      } finally {
        setLoading(false);
      }
    };
    void loadLookups();
  }, [showToast]);

  const itemById = useMemo(() => {
    const map = new Map<number, ItemOption>();
    itemOptions.forEach((it) => map.set(it.item_id, it));
    return map;
  }, [itemOptions]);

  const hasInsufficientStock = useMemo(() => {
    return form.items.some((line) => {
      if (line.item_id === '') return false;
      const available = itemById.get(Number(line.item_id))?.available_qty ?? 0;
      return line.adjustment_type === 'DECREASE' && Number(line.quantity || 0) > available;
    });
  }, [form.items, itemById]);

  const handleSave = async () => {
    const lines = form.items.filter((l) => l.item_id !== '');
    if (lines.length === 0) {
      showToast('error', 'Validation error', 'Please select at least one item.');
      return;
    }
    for (const line of lines) {
      if (!Number.isFinite(Number(line.quantity)) || Number(line.quantity) < 1) {
        showToast('error', 'Validation error', 'Quantity must be at least 1.');
        return;
      }
      const available = itemById.get(Number(line.item_id))?.available_qty ?? 0;
      if (line.adjustment_type === 'DECREASE' && Number(line.quantity) > available) {
        showToast('error', 'Not enough stock', 'One of the decrease lines exceeds available stock.');
        return;
      }
    }

    try {
      setSubmitting(true);
      for (const line of lines) {
        await inventoryService.adjust({
          itemId: Number(line.item_id),
          adjustmentType: line.adjustment_type,
          quantity: Math.round(Number(line.quantity)),
          adjustmentDate: form.adjustment_date,
          reason: form.reason.trim() || undefined,
        });
      }
      showToast('success', 'Saved', 'Stock adjustments recorded.');
      navigate('/stock-management/adjust-items');
    } catch (err: any) {
      showToast('error', 'Failed', err?.message || 'Could not save adjustments.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="New Stock Adjustment"
        description="Increase or decrease stock quantities."
        actions={
          <button
            type="button"
            onClick={() => navigate('/stock-management/adjust-items')}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition-all hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
        }
      />

      <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-800 dark:text-slate-200">
            Date
            <input
              type="date"
              className="rounded-lg border px-3 py-2 text-sm bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
              value={form.adjustment_date}
              onChange={(e) => setForm((prev) => ({ ...prev, adjustment_date: e.target.value }))}
              disabled={loading || submitting}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium text-slate-800 dark:text-slate-200 md:col-span-2">
            Reason (optional)
            <input
              type="text"
              className="rounded-lg border px-3 py-2 text-sm bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
              placeholder="Optional"
              value={form.reason}
              onChange={(e) => setForm((prev) => ({ ...prev, reason: e.target.value }))}
              disabled={loading || submitting}
            />
          </label>
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Items</h2>
            <button
              type="button"
              onClick={() =>
                setForm((prev) => ({
                  ...prev,
                  items: [...prev.items, { item_id: '', adjustment_type: 'INCREASE', quantity: 1 }],
                }))
              }
              className="flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700 active:scale-95 disabled:opacity-60"
              disabled={loading || submitting}
            >
              <Plus className="h-4 w-4" />
              Add line
            </button>
          </div>

          <div className="mt-4 overflow-auto rounded-2xl border border-slate-200 dark:border-slate-800">
            <table className="min-w-[860px] w-full border-collapse bg-white dark:bg-slate-900">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-extrabold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                    Item *
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-extrabold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                    Type *
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-extrabold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                    Qty *
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-extrabold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {form.items.map((line, idx) => {
                  const selected = line.item_id === '' ? null : itemById.get(Number(line.item_id)) ?? null;
                  const available = selected?.available_qty ?? 0;
                  const insufficient =
                    line.item_id !== '' &&
                    line.adjustment_type === 'DECREASE' &&
                    Number(line.quantity || 0) > available;

                  return (
                    <tr
                      key={idx}
                      className="border-t border-slate-200 dark:border-slate-800 odd:bg-white even:bg-slate-50/40 dark:odd:bg-slate-900 dark:even:bg-slate-900/60"
                    >
                      <td className="px-4 py-4 align-top">
                        <select
                          className="w-full rounded-lg border px-3 py-2 text-sm bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                          value={line.item_id}
                          onChange={(e) => {
                            const val = e.target.value ? Number(e.target.value) : '';
                            setForm((prev) => {
                              const next = [...prev.items];
                              next[idx] = { ...next[idx], item_id: val };
                              return { ...prev, items: next };
                            });
                          }}
                          disabled={loading || submitting}
                          required
                        >
                          <option value="">Select item</option>
                          {itemOptions.map((it) => (
                            <option key={it.item_id} value={it.item_id}>
                              {it.item_name}
                            </option>
                          ))}
                        </select>
                        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {selected ? (
                            <>
                              Available Quantity: <span className="font-semibold">{available}</span> units
                            </>
                          ) : (
                            <span className="opacity-60">Select an item to see availability.</span>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-4 align-top">
                        <select
                          className="w-full rounded-lg border px-3 py-2 text-sm bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                          value={line.adjustment_type}
                          onChange={(e) => {
                            const val = e.target.value as AdjustmentType;
                            setForm((prev) => {
                              const next = [...prev.items];
                              next[idx] = { ...next[idx], adjustment_type: val };
                              return { ...prev, items: next };
                            });
                          }}
                          disabled={loading || submitting}
                        >
                          <option value="INCREASE">Increase</option>
                          <option value="DECREASE">Decrease</option>
                        </select>
                      </td>

                      <td className="px-4 py-4 align-top">
                        <div className="flex justify-end">
                          <input
                            type="number"
                            min={1}
                            step={1}
                            className="w-28 rounded-lg border px-3 py-2 text-sm bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-right"
                            value={line.quantity}
                            onChange={(e) => {
                              const v = Math.max(1, Math.round(Number(e.target.value) || 1));
                              setForm((prev) => {
                                const next = [...prev.items];
                                next[idx] = { ...next[idx], quantity: v };
                                return { ...prev, items: next };
                              });
                            }}
                            disabled={loading || submitting}
                            required
                          />
                        </div>
                        {insufficient && (
                          <div className="mt-1 text-right text-xs font-semibold text-red-600">
                            Quantity exceeds available stock.
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-4 align-top">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setForm((prev) => {
                                const next = [...prev.items];
                                next.splice(idx + 1, 0, { item_id: '', adjustment_type: 'INCREASE', quantity: 1 });
                                return { ...prev, items: next };
                              });
                            }}
                            className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-2 text-slate-700 transition-all hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                            disabled={loading || submitting}
                            aria-label="Add line below"
                            title="Add line below"
                          >
                            <Plus className="h-4 w-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setForm((prev) => {
                                const next = prev.items.filter((_, i) => i !== idx);
                                return {
                                  ...prev,
                                  items: next.length ? next : [{ item_id: '', adjustment_type: 'INCREASE', quantity: 1 }],
                                };
                              });
                            }}
                            className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-2 text-red-600 transition-all hover:bg-red-50 dark:border-slate-700 dark:bg-slate-900 dark:text-red-400 dark:hover:bg-slate-800"
                            disabled={loading || submitting}
                            aria-label="Remove line"
                            title="Remove line"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-6">
          <button
            type="button"
            onClick={() => navigate('/stock-management/adjust-items')}
            className="px-6 py-2.5 font-semibold text-slate-600 bg-slate-100 dark:bg-slate-800 dark:text-slate-200 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={submitting || loading || hasInsufficientStock}
            className="px-8 py-2.5 bg-primary-600 text-white font-bold rounded-lg hover:bg-primary-700 transition-all shadow-md shadow-primary-500/20 active:scale-95 disabled:opacity-60"
          >
            {submitting ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
