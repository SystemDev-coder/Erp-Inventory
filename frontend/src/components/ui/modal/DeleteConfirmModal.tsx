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
        <h3 className="mb-2 text-xl font-bold text-[#123f5c] dark:text-[#e7f2fb]">
          {title}
        </h3>

        {/* Message */}
        <p className="mb-2 text-sm text-[#57748c] dark:text-[#9fc3da]">
          {message}
        </p>

        {/* Item Name */}
        {itemName && (
          <p className="mb-4 inline-block rounded-lg bg-[#eaf5fb] px-3 py-2 text-sm font-semibold text-[#123f5c] dark:bg-[#1b5a80]/35 dark:text-[#e7f2fb]">
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
            className="rounded-lg border border-[#b7cde0] bg-white px-6 py-2.5 font-medium text-[#123f5c] transition-colors hover:bg-[#edf5fb] disabled:opacity-50 dark:border-[#2c6287] dark:bg-[#12344c] dark:text-[#e7f2fb] dark:hover:bg-[#1b5a80]/35"
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
