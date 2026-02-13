import React from 'react';
import { AlertTriangle, Trash2, CheckCircle, Info } from 'lucide-react';

interface ConfirmDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
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
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    variant = 'warning',
    isLoading = false,
    hideCancel = false,
}) => {
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

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto">
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity animate-[fadeIn_200ms_ease-out]"
                onClick={onClose}
            />

            {/* Dialog */}
            <div className="flex min-h-full items-center justify-center p-4">
                <div
                    className="relative w-full max-w-sm bg-white dark:bg-slate-900 rounded-xl shadow-2xl transform transition-all animate-[scaleIn_200ms_ease-out]"
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
                        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">
                            {title}
                        </h3>
                        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                            {message}
                        </p>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 px-6 pb-6">
                        {!hideCancel && (
                            <button
                                onClick={onClose}
                                disabled={isLoading}
                                className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
        </div>
    );
};
