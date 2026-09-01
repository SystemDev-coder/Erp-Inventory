import { useEffect, useState } from 'react';
import { AlertCircle, Trash2 } from 'lucide-react';
import { Modal } from './Modal';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  title: string;
  message: string;
  itemName?: string;
  isDeleting?: boolean;
  requireReason?: boolean;
  reasonLabel?: string;
}

const DeleteConfirmModal = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  itemName,
  isDeleting = false,
  requireReason = true,
  reasonLabel = 'Reason for deletion',
}: Props) => {
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setReason('');
      setReasonError('');
    }
  }, [isOpen]);

  const handleConfirm = () => {
    const trimmed = reason.trim();
    if (requireReason && !trimmed) {
      setReasonError('A reason is required');
      return;
    }
    onConfirm(trimmed);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm" title="" resizable>
      <div className="text-center py-4">
        <div className="mx-auto flex items-center justify-center w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/20 mb-4">
          <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
        </div>

        <h3 className="mb-2 text-xl font-bold text-slate-900 dark:text-slate-100">
          {title}
        </h3>

        <p className="mb-2 text-sm text-slate-500 dark:text-slate-300">
          {message}
        </p>

        {itemName && (
          <p className="mb-4 inline-block rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-900 dark:bg-slate-800/60 dark:text-slate-100">
            {itemName}
          </p>
        )}

        <div className="mb-4 text-left">
          <label htmlFor="delete-reason" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {reasonLabel} {requireReason ? <span className="text-red-500">*</span> : null}
          </label>
          <textarea
            id="delete-reason"
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (reasonError) setReasonError('');
            }}
            rows={3}
            aria-invalid={Boolean(reasonError)}
            aria-describedby={reasonError ? 'delete-reason-error' : undefined}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            placeholder="Explain why this record is being deleted..."
            disabled={isDeleting}
          />
          {reasonError ? (
            <p id="delete-reason-error" className="mt-1 text-xs font-medium text-red-500" role="alert">{reasonError}</p>
          ) : null}
        </div>

        <p className="text-xs text-red-600 dark:text-red-400 mb-6">
          This action cannot be undone.
        </p>

        <div className="flex gap-3 justify-center">
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="rounded-lg border border-slate-200 bg-white px-6 py-2.5 font-medium text-slate-800 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800/60"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isDeleting}
            className="px-6 py-2.5 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            {isDeleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default DeleteConfirmModal;
