import { useState, useRef, useEffect } from 'react';

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
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(event.target as Node)
            ) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="relative inline-block" ref={dropdownRef}>
            <div onClick={() => setIsOpen(!isOpen)} className="cursor-pointer">
                {trigger}
            </div>

            {isOpen && (
                <div
                    className={`absolute z-50 mt-2 w-56 rounded-lg bg-white dark:bg-slate-800 shadow-lg border border-slate-200 dark:border-slate-700 py-1 ${align === 'right' ? 'right-0' : 'left-0'
                        }`}
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
                                    className={`w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors ${item.variant === 'danger'
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
                </div>
            )}
        </div>
    );
};
