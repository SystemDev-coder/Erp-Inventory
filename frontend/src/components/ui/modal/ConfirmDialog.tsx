import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Trash2, CheckCircle, Info } from 'lucide-react';

interface ConfirmDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    highlightedName?: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'warning' | 'info' | 'success';
    isLoading?: boolean;
    /**
     * When true, hide the Cancel button and only show a single confirm/OK button.
     */
    hideCancel?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    highlightedName,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    variant = 'warning',
    isLoading = false,
    hideCancel = false,
}) => {
    useEffect(() => {
        if (!isOpen) return;
        const prevOverflow = document.body.style.overflow;
        const prevPaddingRight = document.body.style.paddingRight;
        const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
        document.body.style.overflow = 'hidden';
        if (scrollbarWidth > 0) {
            document.body.style.paddingRight = `${scrollbarWidth}px`;
        }
        return () => {
            document.body.style.overflow = prevOverflow;
            document.body.style.paddingRight = prevPaddingRight;
        };
    }, [isOpen]);

    if (!isOpen) return null;

    const variantStyles = {
        danger: {
            icon: <Trash2 className="w-12 h-12" />,
            iconBg: 'bg-red-100 dark:bg-red-900/30',
            iconColor: 'text-red-600 dark:text-red-400',
            buttonBg: 'bg-red-600 hover:bg-red-700',
        },
        warning: {
            icon: <AlertTriangle className="w-12 h-12" />,
            iconBg: 'bg-yellow-100 dark:bg-yellow-900/30',
            iconColor: 'text-yellow-600 dark:text-yellow-400',
            buttonBg: 'bg-yellow-600 hover:bg-yellow-700',
        },
        info: {
            icon: <Info className="w-12 h-12" />,
            iconBg: 'bg-blue-100 dark:bg-blue-900/30',
            iconColor: 'text-blue-600 dark:text-blue-400',
            buttonBg: 'bg-blue-600 hover:bg-blue-700',
        },
        success: {
            icon: <CheckCircle className="w-12 h-12" />,
            iconBg: 'bg-green-100 dark:bg-green-900/30',
            iconColor: 'text-green-600 dark:text-green-400',
            buttonBg: 'bg-green-600 hover:bg-green-700',
        },
    };

    const style = variantStyles[variant];

    const handleConfirm = () => {
        onConfirm();
        onClose();
    };

    return createPortal(
        <div className="fixed inset-0 z-[9999] overflow-y-auto" style={{ zIndex: 2147483647 }}>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-[#0c2235]/70 backdrop-blur-sm transition-opacity animate-[fadeIn_200ms_ease-out]"
                onClick={onClose}
            />

            {/* Dialog */}
            <div className="flex min-h-full items-center justify-center p-4">
                <div
                    className="relative w-full max-w-sm rounded-xl border border-[#9ec5df] bg-[#f8fbfe] shadow-2xl transform transition-all animate-[scaleIn_200ms_ease-out] dark:border-[#2c6287] dark:bg-[#12344c]"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Icon */}
                    <div className="flex justify-center pt-6 pb-3">
                        <div className={`${style.iconBg} ${style.iconColor} p-3 rounded-full`}>
                            <div className="w-8 h-8">
                                {style.icon}
                            </div>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="px-6 pb-4 text-center">
                        <h3 className="mb-2 text-lg font-bold text-[#123f5c] dark:text-[#e7f2fb]">
                            {title}
                        </h3>
                        {highlightedName && (
                            <p className="mb-2 text-lg font-extrabold text-[#123f5c] dark:text-[#e7f2fb]">
                                {highlightedName}
                            </p>
                        )}
                        <p className="text-xs leading-relaxed text-[#57748c] dark:text-[#9fc3da]">
                            {message}
                        </p>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 px-6 pb-6">
                        {!hideCancel && (
                            <button
                                onClick={onClose}
                                disabled={isLoading}
                                className="flex-1 rounded-lg border border-[#b7cde0] px-3 py-2 text-sm font-medium text-[#123f5c] transition-colors hover:bg-[#edf5fb] disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#2c6287] dark:text-[#e7f2fb] dark:hover:bg-[#1b5a80]/35"
                            >
                                {cancelText}
                            </button>
                        )}
                        <button
                            onClick={handleConfirm}
                            disabled={isLoading}
                            className={`flex-1 px-3 py-2 text-sm rounded-lg ${style.buttonBg} text-white font-medium transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                            {isLoading ? (
                                <span className="flex items-center justify-center gap-1.5">
                                    <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                    <span className="text-xs">Wait...</span>
                                </span>
                            ) : (
                                confirmText
                            )}
                        </button>
                    </div>
                </div>
            </div>

            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes scaleIn {
                    from { 
                        opacity: 0;
                        transform: scale(0.95);
                    }
                    to { 
                        opacity: 1;
                        transform: scale(1);
                    }
                }
            `}</style>
        </div>,
        document.body
    );
};
