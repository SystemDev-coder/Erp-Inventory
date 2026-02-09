import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface ActionDropdownItem {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
    variant?: 'default' | 'danger';
    divider?: boolean;
}

interface ActionDropdownProps {
    trigger: React.ReactNode;
    items: ActionDropdownItem[];
    align?: 'left' | 'right';
}

export const ActionDropdown: React.FC<ActionDropdownProps> = ({
    trigger,
    items,
    align = 'right',
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const anchorRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

    const updatePosition = () => {
        const rect = anchorRef.current?.getBoundingClientRect();
        if (!rect) return;
        const top = rect.bottom + 8; // gap
        const left = align === 'right' ? rect.right - 224 : rect.left; // 224 = width 56*4
        setPosition({ top, left });
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                anchorRef.current &&
                !anchorRef.current.contains(event.target as Node)
            ) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        window.addEventListener('resize', updatePosition);
        window.addEventListener('scroll', updatePosition, true);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('resize', updatePosition);
            window.removeEventListener('scroll', updatePosition, true);
        };
    }, []);

    useEffect(() => {
        if (isOpen) updatePosition();
    }, [isOpen]);

    return (
        <div className="inline-block" ref={anchorRef}>
            <div onClick={() => setIsOpen(!isOpen)} className="cursor-pointer">
                {trigger}
            </div>

            {isOpen &&
                createPortal(
                    <div
                        style={{ top: position.top, left: position.left }}
                        className="fixed z-[1050] w-56 rounded-xl bg-white dark:bg-slate-800 shadow-xl border border-slate-200 dark:border-slate-700 py-1 animate-[fadeIn_120ms_ease-out]"
                    >
                        {items.map((item, index) => (
                            <div key={index}>
                                {item.divider && (
                                    <div className="my-1 border-t border-slate-200 dark:border-slate-700" />
                                )}
                                {!item.divider && (
                                    <button
                                        onClick={() => {
                                            item.onClick();
                                            setIsOpen(false);
                                        }}
                                        className={`w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors ${
                                            item.variant === 'danger'
                                                ? 'text-error-600 hover:bg-error-50 dark:text-error-400 dark:hover:bg-error-900/20'
                                                : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
                                        }`}
                                    >
                                        {item.icon && <span className="flex-shrink-0">{item.icon}</span>}
                                        <span>{item.label}</span>
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>,
                    document.body
                )}
        </div>
    );
};
