import React, { useCallback, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useFocusTrap } from '../../../hooks/useFocusTrap';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: React.ReactNode;
    headerActions?: React.ReactNode;
    children: React.ReactNode;
    size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
    showCloseButton?: boolean;
    resizable?: boolean;
    centerTitle?: boolean;
    className?: string;
    isFullscreen?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
    isOpen,
    onClose,
    title,
    headerActions,
    children,
    size = 'md',
    showCloseButton = true,
    resizable = false,
    centerTitle = false,
    className,
    isFullscreen = false,
}) => {
    const MODAL_Z_INDEX = 2147483000;
    const titleId = useId();
    const dialogRef = useRef<HTMLDivElement>(null);
    const handleClose = useCallback(() => onClose(), [onClose]);

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    useFocusTrap(isOpen, dialogRef, isFullscreen ? undefined : handleClose);

    if (!isOpen) return null;

    const sizeClasses = {
        sm: 'max-w-[95vw] sm:max-w-md',
        md: 'max-w-[95vw] sm:max-w-lg',
        lg: 'max-w-[95vw] sm:max-w-2xl',
        xl: 'max-w-[95vw] sm:max-w-4xl',
        '2xl': 'max-w-[95vw] sm:max-w-6xl',
    };

    const showHeader = title !== undefined && title !== null && String(title).trim() !== '';

    return createPortal(
        <div className="fixed inset-0 z-[9999] overflow-y-auto" style={{ zIndex: MODAL_Z_INDEX }}>
            <div
                className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
                aria-hidden="true"
                onClick={isFullscreen ? undefined : onClose}
            />

            <div className="flex min-h-screen items-center justify-center p-4 sm:p-6">
                <div
                    ref={dialogRef}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby={showHeader ? titleId : undefined}
                    aria-label={showHeader ? undefined : 'Dialog'}
                    tabIndex={-1}
                    className={`relative w-full ${isFullscreen ? 'max-w-none h-[calc(100vh-2rem)] sm:h-[calc(100vh-3rem)]' : sizeClasses[size]} max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)] ${isFullscreen ? 'rounded-none border-0' : 'rounded-xl border border-slate-200'} bg-white shadow-2xl transform transition-all flex flex-col dark:border-slate-700 dark:bg-slate-900 ${resizable ? 'resize overflow-auto min-w-[320px] min-h-[240px]' : 'overflow-hidden'} ${className || ''}`}
                    onClick={(e) => e.stopPropagation()}
                >
                    {showHeader && (
                        <div className={`${centerTitle ? 'relative flex items-center justify-end' : 'flex items-center justify-between'} border-b border-primary-800 bg-gradient-to-r from-primary-900 to-primary-700 px-6 py-4`}>
                            <h3
                                id={titleId}
                                className={`text-lg font-semibold text-white ${centerTitle ? 'absolute left-1/2 -translate-x-1/2 w-full text-center pointer-events-none' : ''}`}
                            >
                                {title}
                            </h3>
                            {headerActions ? (
                                <div className="mr-2 flex items-center gap-2">
                                    {headerActions}
                                </div>
                            ) : null}
                            {showCloseButton && (
                                <button
                                    type="button"
                                    onClick={onClose}
                                    aria-label="Close dialog"
                                    className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md p-1 text-slate-200 transition-colors hover:bg-primary-500/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                                >
                                    <X className="w-5 h-5" aria-hidden="true" />
                                </button>
                            )}
                        </div>
                    )}

                    {!showHeader && showCloseButton && (
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Close dialog"
                            className="absolute right-3 top-3 z-10 inline-flex min-h-11 min-w-11 items-center justify-center rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-slate-200 dark:hover:bg-slate-800/60 dark:hover:text-slate-50"
                        >
                            <X className="w-5 h-5" aria-hidden="true" />
                        </button>
                    )}

                    <div className="erp-modal-body overflow-y-auto bg-white px-4 py-4 text-slate-900 dark:bg-slate-900 dark:text-slate-100 sm:px-6">
                        {children}
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};
