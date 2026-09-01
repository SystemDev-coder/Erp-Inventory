import { cloneElement, isValidElement, useEffect, useId, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';

interface ActionDropdownItem {
    label: string;
    onClick: () => void;
    icon?: ReactNode;
    variant?: 'default' | 'danger';
    divider?: boolean;
    closeOnClick?: boolean;
    checked?: boolean;
}

interface ActionDropdownProps {
    trigger: ReactNode;
    items: ActionDropdownItem[];
    align?: 'left' | 'right';
}

export const ActionDropdown = ({
    trigger,
    items,
    align = 'right',
}: ActionDropdownProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const [focusedIndex, setFocusedIndex] = useState(-1);
    const anchorRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
    const [position, setPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
    const triggerId = useId();
    const menuId = useId();

    const interactiveItems = items.filter((item) => !item.divider);

    const updatePosition = () => {
        const rect = anchorRef.current?.getBoundingClientRect();
        if (!rect) return;
        const top = rect.bottom + 8;
        const left = align === 'right' ? rect.right - 224 : rect.left;
        setPosition({ top, left });
    };

    useEffect(() => {
        const handlePointerDown = (event: MouseEvent) => {
            const target = event.target as Node;
            if (anchorRef.current?.contains(target) || menuRef.current?.contains(target)) return;
            setIsOpen(false);
        };

        document.addEventListener('mousedown', handlePointerDown);
        window.addEventListener('resize', updatePosition);
        window.addEventListener('scroll', updatePosition, true);
        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
            window.removeEventListener('resize', updatePosition);
            window.removeEventListener('scroll', updatePosition, true);
        };
    }, []);

    useEffect(() => {
        if (isOpen) {
            updatePosition();
            setFocusedIndex(0);
        } else {
            setFocusedIndex(-1);
        }
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        itemRefs.current[focusedIndex]?.focus();
    }, [focusedIndex, isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                setIsOpen(false);
                const triggerEl = anchorRef.current?.querySelector<HTMLElement>('button, [tabindex]');
                triggerEl?.focus();
                return;
            }
            if (event.key === 'ArrowDown') {
                event.preventDefault();
                setFocusedIndex((prev) => (prev + 1) % Math.max(interactiveItems.length, 1));
            }
            if (event.key === 'ArrowUp') {
                event.preventDefault();
                setFocusedIndex((prev) =>
                    prev <= 0 ? Math.max(interactiveItems.length - 1, 0) : prev - 1
                );
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [isOpen, interactiveItems.length]);

    const triggerProps = {
        id: triggerId,
        'aria-expanded': isOpen,
        'aria-haspopup': 'menu' as const,
        'aria-controls': menuId,
        onClick: (event: ReactMouseEvent) => {
            event.preventDefault();
            event.stopPropagation();
            setIsOpen((prev) => !prev);
        },
    };

    const triggerNode = isValidElement(trigger)
        ? cloneElement(trigger as ReactElement<Record<string, unknown>>, {
              ...triggerProps,
              onClick: (event: ReactMouseEvent) => {
                  const originalOnClick = (trigger as ReactElement<{ onClick?: (e: ReactMouseEvent) => void }>).props.onClick;
                  originalOnClick?.(event);
                  triggerProps.onClick(event);
              },
          })
        : (
            <button type="button" className="inline-flex min-h-11 items-center" {...triggerProps}>
                {trigger}
            </button>
        );

    let interactiveIndex = -1;

    return (
        <div className="inline-block" ref={anchorRef}>
            {triggerNode}

            {isOpen &&
                createPortal(
                    <div
                        ref={menuRef}
                        id={menuId}
                        role="menu"
                        aria-labelledby={triggerId}
                        style={{ top: position.top, left: position.left }}
                        className="fixed z-[1050] w-56 rounded-xl bg-white dark:bg-slate-800 shadow-xl border border-slate-200 dark:border-slate-700 py-1 animate-[fadeIn_120ms_ease-out]"
                    >
                        {items.map((item, index) => {
                            if (item.divider) {
                                return (
                                    <div
                                        key={`divider-${index}`}
                                        role="separator"
                                        className="my-1 border-t border-slate-200 dark:border-slate-700"
                                    />
                                );
                            }
                            interactiveIndex += 1;
                            const itemIndex = interactiveIndex;
                            const isCheckbox = typeof item.checked === 'boolean';
                            return (
                                <button
                                    key={item.label + index}
                                    ref={(el) => {
                                        itemRefs.current[itemIndex] = el;
                                    }}
                                    type="button"
                                    role={isCheckbox ? 'menuitemcheckbox' : 'menuitem'}
                                    aria-checked={isCheckbox ? item.checked : undefined}
                                    onClick={() => {
                                        item.onClick();
                                        if (item.closeOnClick !== false) setIsOpen(false);
                                    }}
                                    className={`w-full flex items-center gap-3 min-h-11 px-4 py-2 text-sm transition-colors ${
                                        item.variant === 'danger'
                                            ? 'text-error-600 hover:bg-error-50 dark:text-error-400 dark:hover:bg-error-900/20'
                                            : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
                                    }`}
                                >
                                    {item.icon && <span className="flex-shrink-0" aria-hidden="true">{item.icon}</span>}
                                    <span className="flex-1 text-left">{item.label}</span>
                                    {isCheckbox && item.checked ? (
                                        <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
                                    ) : null}
                                </button>
                            );
                        })}
                    </div>,
                    document.body
                )}
        </div>
    );
};
