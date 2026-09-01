import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Trash2, CheckCircle, Info } from 'lucide-react';
import { useFocusTrap } from '../../../hooks/useFocusTrap';

interface ConfirmDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (reason?: string) => void;
    title: string;
    message: string;
    highlightedName?: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'warning' | 'info' | 'success';
    isLoading?: boolean;
    hideCancel?: boolean;
    requireReason?: boolean;
    reasonLabel?: string;
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
    requireReason = false,
    reasonLabel = 'Reason',
}) => {
    const MODAL_Z_INDEX = 2147483000;
    const [reason, setReason] = useState('');
    const [reasonError, setReasonError] = useState('');
    const titleId = useId();
    const messageId = useId();
    const reasonId = useId();
    const reasonErrorId = useId();
    const dialogRef = useRef<HTMLDivElement>(null);
    const handleClose = useCallback(() => {
        if (!isLoading) onClose();
    }, [isLoading, onClose]);

    useEffect(() => {
        if (!isOpen) {
            setReason('');
            setReasonError('');
        }
    }, [isOpen]);

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

    useFocusTrap(isOpen, dialogRef, handleClose);

    if (!isOpen) return null;

    const variantStyles = {
        danger: {
            icon: <Trash2 className="w-12 h-12" aria-hidden="true" />,
            iconBg: 'bg-red-100 dark:bg-red-900/30',
            iconColor: 'text-red-600 dark:text-red-400',
            buttonBg: 'bg-red-600 hover:bg-red-700',
        },
        warning: {
            icon: <AlertTriangle className="w-12 h-12" aria-hidden="true" />,
            iconBg: 'bg-yellow-100 dark:bg-yellow-900/30',
            iconColor: 'text-yellow-600 dark:text-yellow-400',
            buttonBg: 'bg-yellow-600 hover:bg-yellow-700',
        },
        info: {
            icon: <Info className="w-12 h-12" aria-hidden="true" />,
            iconBg: 'bg-blue-100 dark:bg-blue-900/30',
            iconColor: 'text-blue-600 dark:text-blue-400',
            buttonBg: 'bg-blue-600 hover:bg-blue-700',
        },
        success: {
            icon: <CheckCircle className="w-12 h-12" aria-hidden="true" />,
            iconBg: 'bg-green-100 dark:bg-green-900/30',
            iconColor: 'text-green-600 dark:text-green-400',
            buttonBg: 'bg-green-600 hover:bg-green-700',
        },
    };

    const style = variantStyles[variant];

    const handleConfirm = () => {
        const trimmed = reason.trim();
        if (requireReason && !trimmed) {
            setReasonError('A reason is required');
            return;
        }
        onConfirm(requireReason ? trimmed : undefined);
        onClose();
    };

    return createPortal(
        <div className="fixed inset-0 z-[9999] overflow-y-auto" style={{ zIndex: MODAL_Z_INDEX }}>
            <div
                className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm transition-opacity animate-[fadeIn_200ms_ease-out]"
                aria-hidden="true"
                onClick={handleClose}
            />

            <div className="flex min-h-full items-center justify-center p-4">
                <div
                    ref={dialogRef}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby={titleId}
                    aria-describedby={messageId}
                    tabIndex={-1}
                    className="erp-modal-body relative w-full max-w-sm rounded-xl border border-slate-200 bg-white shadow-2xl transform transition-all animate-[scaleIn_200ms_ease-out] dark:border-slate-700 dark:bg-slate-900"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="flex justify-center pt-6 pb-3">
                        <div className={`${style.iconBg} ${style.iconColor} p-3 rounded-full`}>
                            <div className="w-8 h-8">
                                {style.icon}
                            </div>
                        </div>
                    </div>

                    <div className="px-6 pb-4 text-center">
                        <h3 id={titleId} className="mb-2 text-lg font-bold text-slate-900 dark:text-slate-100">
                            {title}
                        </h3>
                        {highlightedName && (
                            <p className="mb-2 text-lg font-extrabold text-slate-900 dark:text-slate-100">
                                {highlightedName}
                            </p>
                        )}
                        <p id={messageId} className="text-sm leading-relaxed text-slate-500 dark:text-slate-300">
                            {message}
                        </p>
                        {requireReason && (
                            <div className="mt-4 text-left">
                                <label
                                    htmlFor={reasonId}
                                    className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
                                >
                                    {reasonLabel} <span className="text-red-500">*</span>
                                </label>
                                <textarea
                                    id={reasonId}
                                    value={reason}
                                    onChange={(e) => {
                                        setReason(e.target.value);
                                        if (reasonError) setReasonError('');
                                    }}
                                    rows={3}
                                    aria-invalid={Boolean(reasonError)}
                                    aria-describedby={reasonError ? reasonErrorId : undefined}
                                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                                    placeholder="Enter reason..."
                                    disabled={isLoading}
                                />
                                {reasonError ? (
                                    <p id={reasonErrorId} className="mt-1 text-xs font-medium text-red-500" role="alert">
                                        {reasonError}
                                    </p>
                                ) : null}
                            </div>
                        )}
                    </div>

                    <div className="flex gap-2 px-6 pb-6">
                        {!hideCancel && (
                            <button
                                type="button"
                                onClick={handleClose}
                                disabled={isLoading}
                                className="flex-1 min-h-11 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800/60"
                            >
                                {cancelText}
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={handleConfirm}
                            disabled={isLoading}
                            className={`flex-1 min-h-11 px-3 py-2 text-sm rounded-lg ${style.buttonBg} text-white font-medium transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                            {isLoading ? (
                                <span className="flex items-center justify-center gap-1.5">
                                    <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" aria-hidden="true">
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
