import React, { useState } from 'react';
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

    const handleTabChange = (tabId: string) => {
        setActiveTab(tabId);
        onChange?.(tabId);
    };

    const activeTabContent = tabs.find((tab) => tab.id === activeTab)?.content;

    return (
        <div className="w-full">
            {/* Tab Headers */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-900">
                <div className="flex gap-1 overflow-x-auto no-scrollbar">
                    {tabs.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;

                        return (
                            <button
                                key={tab.id}
                                onClick={() => handleTabChange(tab.id)}
                                className={`
                  flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium whitespace-nowrap transition-all duration-200
                  ${isActive
                                        ? 'border-primary-600 bg-primary-600 text-white shadow-sm'
                                        : 'border-transparent bg-white text-slate-700 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-900 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-700 dark:hover:bg-slate-800/60 dark:hover:text-slate-50'
                                    }
                `}
                            >
                                {Icon && <Icon className="h-3.5 w-3.5" />}
                                <span>{tab.label}</span>
                                {tab.badge !== undefined && (
                                    <span
                                        className={`
                      rounded-full px-1.5 py-0.5 text-[10px] font-semibold
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

            {/* Tab Content */}
            <div className="mt-6">{activeTabContent}</div>
        </div>
    );
};
