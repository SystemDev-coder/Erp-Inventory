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
    centerTitle?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
    isOpen,
    onClose,
    title,
    children,
    size = 'md',
    showCloseButton = true,
    resizable = false,
    centerTitle = false,
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

    return createPortal(
        <div className="fixed inset-0 z-[9999] overflow-y-auto" style={{ zIndex: MODAL_Z_INDEX }}>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-[#0c2235]/65 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="flex min-h-screen items-center justify-center p-4 sm:p-6">
                <div
                    className={`relative w-full ${sizeClasses[size]} max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)] rounded-xl border border-[#6f8fbd] bg-[#fbfcff] shadow-2xl transform transition-all flex flex-col dark:border-[#264676] dark:bg-[#10233f] ${resizable ? 'resize overflow-auto min-w-[320px] min-h-[240px]' : 'overflow-hidden'}`}
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className={`${centerTitle ? 'relative flex items-center justify-end' : 'flex items-center justify-between'} border-b border-[#264676] bg-gradient-to-r from-[#0a1f44] to-[#102b59] px-6 py-4`}>
                        <h3 className={`text-lg font-semibold text-white ${centerTitle ? 'absolute left-1/2 -translate-x-1/2 w-full text-center pointer-events-none' : ''}`}>
                            {title}
                        </h3>
                        {showCloseButton && (
                            <button
                                onClick={onClose}
                                className="rounded-md p-1 text-[#dde7f7] transition-colors hover:bg-[#163a72] hover:text-white"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        )}
                    </div>

                    {/* Content */}
                    <div className="overflow-y-auto bg-[#fbfcff] px-4 py-4 text-[#10233f] dark:bg-[#10233f] dark:text-[#f4f8ff] sm:px-6">{children}</div>
                </div>
            </div>
        </div>,
        document.body
    );
};
