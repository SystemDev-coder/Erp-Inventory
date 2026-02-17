import { useEffect, useMemo, useState } from 'react';
import { Lock, LockOpen, RefreshCcw, Trash2 } from 'lucide-react';
import { Modal } from '../../components/ui/modal/Modal';
import Badge from '../../components/ui/badge/Badge';
import { shiftService, Shift } from '../../services/shift.service';
import { useToast } from '../../components/ui/toast/Toast';

interface ShiftModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ShiftModal: React.FC<ShiftModalProps> = ({ isOpen, onClose }) => {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [openingCash, setOpeningCash] = useState<number>(0);
  const [openingNote, setOpeningNote] = useState('');
  const [closeCashByShift, setCloseCashByShift] = useState<Record<number, number>>({});
  const [closeNoteByShift, setCloseNoteByShift] = useState<Record<number, string>>({});

  const openShifts = useMemo(
    () => shifts.filter((shift) => shift.status === 'open'),
    [shifts]
  );

  const loadShifts = async () => {
    setLoading(true);
    try {
      const response = await shiftService.list({ limit: 120 });
      if (response.success && response.data?.shifts) {
        setShifts(response.data.shifts);
      } else {
        showToast('error', 'Shift', response.error || 'Failed to load shifts');
      }
    } catch (error) {
      showToast('error', 'Shift', 'Failed to load shifts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadShifts();
    }
  }, [isOpen]);

  const handleOpenShift = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const response = await shiftService.open({
        openingCash: Number(openingCash || 0),
        note: openingNote || undefined,
      });
      if (response.success) {
        showToast('success', 'Shift', 'Shift opened successfully');
        setOpeningCash(0);
        setOpeningNote('');
        loadShifts();
      } else {
        showToast('error', 'Shift', response.error || 'Failed to open shift');
      }
    } catch (error) {
      showToast('error', 'Shift', 'Failed to open shift');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloseShift = async (shift: Shift) => {
    const closingCash = Number(closeCashByShift[shift.shift_id] ?? shift.opening_cash ?? 0);
    setSubmitting(true);
    try {
      const response = await shiftService.close(shift.shift_id, {
        closingCash,
        note: closeNoteByShift[shift.shift_id] || undefined,
      });
      if (response.success) {
        showToast('success', 'Shift', 'Shift closed successfully');
        loadShifts();
      } else {
        showToast('error', 'Shift', response.error || 'Failed to close shift');
      }
    } catch (error) {
      showToast('error', 'Shift', 'Failed to close shift');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVoidShift = async (shift: Shift) => {
    if (!confirm('Void this shift?')) return;
    setSubmitting(true);
    try {
      const response = await shiftService.void(shift.shift_id);
      if (response.success) {
        showToast('success', 'Shift', 'Shift voided');
        loadShifts();
      } else {
        showToast('error', 'Shift', response.error || 'Failed to void shift');
      }
    } catch (error) {
      showToast('error', 'Shift', 'Failed to void shift');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Shift Management" size="xl">
      <div className="space-y-6">
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4">
          <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-3">
            Open New Shift
          </div>
          <form onSubmit={handleOpenShift} className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-slate-600 dark:text-slate-400">Opening Cash</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={openingCash}
                onChange={(e) => setOpeningCash(Number(e.target.value || 0))}
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-slate-600 dark:text-slate-400">Note</label>
              <input
                type="text"
                value={openingNote}
                onChange={(e) => setOpeningNote(e.target.value)}
                placeholder="Optional note"
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
              />
            </div>
            <div className="md:col-span-3 flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                <LockOpen className="w-4 h-4" />
                Open Shift
              </button>
            </div>
          </form>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-600 dark:text-slate-300">
            Open shifts: <span className="font-semibold">{openShifts.length}</span>
          </div>
          <button
            type="button"
            onClick={loadShifts}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <RefreshCcw className="w-4 h-4" />
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-500">Loading shifts...</div>
        ) : shifts.length === 0 ? (
          <div className="py-12 text-center text-slate-500">No shifts found</div>
        ) : (
          <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
            {shifts.map((shift) => {
              const isOpen = shift.status === 'open';
              return (
                <div
                  key={shift.shift_id}
                  className="rounded-xl border border-slate-200 dark:border-slate-700 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900 dark:text-white">
                          Shift #{shift.shift_id}
                        </span>
                        <Badge
                          color={shift.status === 'open' ? 'success' : shift.status === 'closed' ? 'info' : 'error'}
                          variant="light"
                        >
                          {shift.status}
                        </Badge>
                      </div>
                      <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                        User: {shift.username || `#${shift.user_id}`} | Branch: {shift.branch_name || `#${shift.branch_id}`}
                      </div>
                      <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                        Opened: {new Date(shift.opened_at).toLocaleString()}
                        {shift.closed_at ? ` | Closed: ${new Date(shift.closed_at).toLocaleString()}` : ''}
                      </div>
                      <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                        Opening: ${Number(shift.opening_cash || 0).toFixed(2)} | Closing: ${Number(shift.closing_cash || 0).toFixed(2)}
                      </div>
                      {shift.note && (
                        <div className="mt-1 text-xs text-slate-700 dark:text-slate-300">
                          Note: {shift.note}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-2 min-w-[210px]">
                      {isOpen && (
                        <>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={closeCashByShift[shift.shift_id] ?? shift.opening_cash}
                            onChange={(e) =>
                              setCloseCashByShift((prev) => ({
                                ...prev,
                                [shift.shift_id]: Number(e.target.value || 0),
                              }))
                            }
                            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                            placeholder="Closing cash"
                          />
                          <input
                            type="text"
                            value={closeNoteByShift[shift.shift_id] || ''}
                            onChange={(e) =>
                              setCloseNoteByShift((prev) => ({
                                ...prev,
                                [shift.shift_id]: e.target.value,
                              }))
                            }
                            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                            placeholder="Closing note (optional)"
                          />
                        </>
                      )}
                      {isOpen ? (
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => handleCloseShift(shift)}
                          className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                        >
                          <Lock className="w-4 h-4" />
                          Close Shift
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={submitting || shift.status === 'void'}
                          onClick={() => handleVoidShift(shift)}
                          className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-60"
                        >
                          <Trash2 className="w-4 h-4" />
                          Void
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-600 text-white hover:bg-slate-700"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default ShiftModal;
