import React, { useId, useRef, useState } from 'react';
import { LucideIcon } from 'lucide-react';

interface Tab {
    id: string;
    label: string;
    icon?: LucideIcon;
    badge?: string | number;
    content: React.ReactNode;
}

interface TabsProps {
    tabs: Tab[];
    defaultTab?: string;
    onChange?: (tabId: string) => void;
}

export const Tabs: React.FC<TabsProps> = ({ tabs, defaultTab, onChange }) => {
    const [activeTab, setActiveTab] = useState(defaultTab || tabs[0]?.id);
    const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
    const baseId = useId();

    const handleTabChange = (tabId: string) => {
        setActiveTab(tabId);
        onChange?.(tabId);
    };

    const focusTabAt = (index: number) => {
        const next = (index + tabs.length) % tabs.length;
        tabRefs.current[next]?.focus();
        handleTabChange(tabs[next].id);
    };

    const activeTabContent = tabs.find((tab) => tab.id === activeTab)?.content;

    return (
        <div className="w-full">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-1 dark:border-slate-800 dark:bg-slate-900/60">
                <div
                    className="no-scrollbar flex gap-1 overflow-x-auto"
                    role="tablist"
                    aria-label="Sections"
                >
                    {tabs.map((tab, index) => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        const tabId = `${baseId}-tab-${tab.id}`;
                        const panelId = `${baseId}-panel-${tab.id}`;

                        return (
                            <button
                                key={tab.id}
                                ref={(el) => {
                                    tabRefs.current[index] = el;
                                }}
                                id={tabId}
                                type="button"
                                role="tab"
                                aria-selected={isActive}
                                aria-controls={panelId}
                                tabIndex={isActive ? 0 : -1}
                                onClick={() => handleTabChange(tab.id)}
                                onKeyDown={(event) => {
                                    if (event.key === 'ArrowRight') {
                                        event.preventDefault();
                                        focusTabAt(index + 1);
                                    } else if (event.key === 'ArrowLeft') {
                                        event.preventDefault();
                                        focusTabAt(index - 1);
                                    } else if (event.key === 'Home') {
                                        event.preventDefault();
                                        focusTabAt(0);
                                    } else if (event.key === 'End') {
                                        event.preventDefault();
                                        focusTabAt(tabs.length - 1);
                                    }
                                }}
                                className={[
                                    // Layout
                                    'group flex min-h-10 items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2',
                                    'text-sm font-medium',
                                    // Motion
                                    'transition-colors duration-150',
                                    // Focus ring (keyboard only)
                                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                                    'focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50',
                                    'dark:focus-visible:ring-blue-400 dark:focus-visible:ring-offset-slate-900',
                                    // States
                                    isActive
                                        ? // Active: navy blue (blue-500) in light mode, blue-600 in dark
                                          'bg-blue-500 text-white shadow-sm ring-1 ring-inset ring-blue-600/40 ' +
                                          'dark:bg-blue-600 dark:text-white dark:ring-blue-400/30'
                                        : // Inactive: neutral text, subtle hover surface
                                          'text-slate-600 hover:bg-white hover:text-slate-900 ' +
                                          'dark:text-slate-400 dark:hover:bg-slate-800/70 dark:hover:text-slate-100',
                                ].join(' ')}
                            >
                                {Icon && (
                                    <Icon
                                        className={[
                                            'h-4 w-4 shrink-0 transition-colors duration-150',
                                            isActive
                                                ? 'text-white'
                                                : 'text-slate-400 group-hover:text-slate-600 ' +
                                                  'dark:text-slate-500 dark:group-hover:text-slate-300',
                                        ].join(' ')}
                                        aria-hidden="true"
                                    />
                                )}
                                <span>{tab.label}</span>
                                {tab.badge !== undefined && (
                                    <span
                                        className={[
                                            'ml-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none',
                                            isActive
                                                ? 'bg-white/20 text-white'
                                                : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
                                        ].join(' ')}
                                    >
                                        {tab.badge}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {tabs.map((tab) => (
                <div
                    key={tab.id}
                    id={`${baseId}-panel-${tab.id}`}
                    role="tabpanel"
                    aria-labelledby={`${baseId}-tab-${tab.id}`}
                    hidden={activeTab !== tab.id}
                    className="mt-6"
                >
                    {activeTab === tab.id ? activeTabContent : null}
                </div>
            ))}
        </div>
    );
};