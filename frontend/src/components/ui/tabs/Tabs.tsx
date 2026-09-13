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
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-900">
                <div className="flex gap-1 overflow-x-auto no-scrollbar" role="tablist" aria-label="Sections">
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
                                className={`
                  flex items-center gap-1.5 rounded-md border px-3 py-2.5 min-h-11 text-sm font-medium whitespace-nowrap transition-all duration-200
                  ${isActive
                                        ? 'border-primary-600 bg-primary-600 text-white shadow-sm'
                                        : 'border-transparent bg-white text-slate-700 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-900 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-700 dark:hover:bg-slate-800/60 dark:hover:text-slate-50'
                                    }
                `}
                            >
                                {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
                                <span>{tab.label}</span>
                                {tab.badge !== undefined && (
                                    <span
                                        className={`
                      rounded-full px-1.5 py-0.5 text-xs font-semibold
                      ${isActive
                                                ? 'bg-white/20 text-white'
                                                : 'bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-200'
                                            }
                    `}
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
