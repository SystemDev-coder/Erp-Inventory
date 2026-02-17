import { AlertCircle, Trash2 } from 'lucide-react';
import { Modal } from './Modal';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  itemName?: string;
  isDeleting?: boolean;
}

const DeleteConfirmModal = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title, 
  message, 
  itemName,
  isDeleting = false 
}: Props) => {
  const handleConfirm = () => {
    onConfirm();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm" title="" resizable>
      <div className="text-center py-4">
        {/* Icon */}
        <div className="mx-auto flex items-center justify-center w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/20 mb-4">
          <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
        </div>

        {/* Title */}
        <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
          {title}
        </h3>

        {/* Message */}
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
          {message}
        </p>

        {/* Item Name */}
        {itemName && (
          <p className="text-sm font-semibold text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800 px-3 py-2 rounded-lg inline-block mb-4">
            {itemName}
          </p>
        )}

        {/* Warning */}
        <p className="text-xs text-red-600 dark:text-red-400 mb-6">
          This action cannot be undone.
        </p>

        {/* Actions */}
        <div className="flex gap-3 justify-center">
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="px-6 py-2.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors disabled:opacity-50"
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
