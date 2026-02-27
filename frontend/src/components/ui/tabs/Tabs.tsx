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
            <div className="rounded-xl border border-[#b7cde0] bg-[#edf5fb] p-1 dark:border-[#2c6287] dark:bg-[#12344c]">
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
                                        ? 'border-[#0f4f76] bg-[#0f4f76] text-white shadow-sm'
                                        : 'border-transparent bg-white text-[#2b4558] hover:border-[#b7cde0] hover:bg-[#f8fbfe] hover:text-[#123f5c] dark:bg-[#1b5a80]/25 dark:text-[#cfe3f1] dark:hover:border-[#4b7ea2] dark:hover:bg-[#1b5a80]/45 dark:hover:text-[#e7f2fb]'
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
                                                : 'bg-[#e6f0f8] text-[#0f4f76] dark:bg-[#1b5a80]/50 dark:text-[#cfe3f1]'
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
