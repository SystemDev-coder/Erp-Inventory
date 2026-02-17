import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: React.ReactNode;
    children: React.ReactNode;
    size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
    showCloseButton?: boolean;
    resizable?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
    isOpen,
    onClose,
    title,
    children,
    size = 'md',
    showCloseButton = true,
    resizable = false,
}) => {
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

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto">
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="flex min-h-full items-start justify-center p-4 sm:items-center sm:p-6">
                <div
                    className={`relative w-full ${sizeClasses[size]} max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)] bg-white dark:bg-slate-900 rounded-xl shadow-2xl transform transition-all flex flex-col ${resizable ? 'resize overflow-auto min-w-[320px] min-h-[240px]' : 'overflow-hidden'}`}
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                            {title}
                        </h3>
                        {showCloseButton && (
                            <button
                                onClick={onClose}
                                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        )}
                    </div>

                    {/* Content */}
                    <div className="px-4 py-4 sm:px-6 overflow-y-auto">{children}</div>
                </div>
            </div>
        </div>
    );
};
