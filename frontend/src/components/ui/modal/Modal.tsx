import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
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

    return createPortal(
        <div className="fixed inset-0 z-[9999] overflow-y-auto" style={{ zIndex: 2147483647 }}>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-[#0c2235]/65 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="flex min-h-screen items-center justify-center p-4 sm:p-6">
                <div
                    className={`relative w-full ${sizeClasses[size]} max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)] rounded-xl border border-[#9ec5df] bg-[#f8fbfe] shadow-2xl transform transition-all flex flex-col dark:border-[#2c6287] dark:bg-[#12344c] ${resizable ? 'resize overflow-auto min-w-[320px] min-h-[240px]' : 'overflow-hidden'}`}
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-[#2c6287] bg-gradient-to-r from-[#123f5c] to-[#1b5a80] px-6 py-4">
                        <h3 className="text-lg font-semibold text-white">
                            {title}
                        </h3>
                        {showCloseButton && (
                            <button
                                onClick={onClose}
                                className="rounded-md p-1 text-[#cfe3f1] transition-colors hover:bg-[#0f4f76] hover:text-white"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        )}
                    </div>

                    {/* Content */}
                    <div className="overflow-y-auto bg-[#f8fbfe] px-4 py-4 text-[#12344c] dark:bg-[#12344c] dark:text-[#e7f2fb] sm:px-6">{children}</div>
                </div>
            </div>
        </div>,
        document.body
    );
};
