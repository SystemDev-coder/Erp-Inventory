import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

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

    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isOpen, onClose]);

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
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
                onClick={isFullscreen ? undefined : onClose}
            />

            {/* Modal */}
            <div className="flex min-h-screen items-center justify-center p-4 sm:p-6">
                <div
                    className={`relative w-full ${isFullscreen ? 'max-w-none h-[calc(100vh-2rem)] sm:h-[calc(100vh-3rem)]' : sizeClasses[size]} max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)] ${isFullscreen ? 'rounded-none border-0' : 'rounded-xl border border-slate-200'} bg-white shadow-2xl transform transition-all flex flex-col dark:border-slate-700 dark:bg-slate-900 ${resizable ? 'resize overflow-auto min-w-[320px] min-h-[240px]' : 'overflow-hidden'} ${className || ''}`}
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    {showHeader && (
                        <div className={`${centerTitle ? 'relative flex items-center justify-end' : 'flex items-center justify-between'} border-b border-slate-800 bg-gradient-to-r from-slate-900 to-slate-800 px-6 py-4`}>
                            <h3 className={`text-lg font-semibold text-white ${centerTitle ? 'absolute left-1/2 -translate-x-1/2 w-full text-center pointer-events-none' : ''}`}>
                                {title}
                            </h3>
                            {headerActions ? (
                                <div className="mr-2 flex items-center gap-2">
                                    {headerActions}
                                </div>
                            ) : null}
                            {showCloseButton && (
                                <button
                                    onClick={onClose}
                                    className="rounded-md p-1 text-slate-200 transition-colors hover:bg-primary-500/20 hover:text-white"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            )}
                        </div>
                    )}

                    {!showHeader && showCloseButton && (
                        <button
                            onClick={onClose}
                            className="absolute right-3 top-3 z-10 rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-200 dark:hover:bg-slate-800/60 dark:hover:text-slate-50"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    )}

                    {/* Content */}
                    <div className="erp-modal-body overflow-y-auto bg-white px-4 py-4 text-slate-900 dark:bg-slate-900 dark:text-slate-100 sm:px-6">
                        {children}
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};
