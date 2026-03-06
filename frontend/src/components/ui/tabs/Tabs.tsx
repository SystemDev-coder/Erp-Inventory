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
            <div className="rounded-xl border border-[#9bb3d5] bg-[#f4f7fd] p-1 dark:border-[#264676] dark:bg-[#10233f]">
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
                                        ? 'border-[#163a72] bg-[#163a72] text-white shadow-sm'
                                        : 'border-transparent bg-white text-[#2b4558] hover:border-[#9bb3d5] hover:bg-[#fbfcff] hover:text-[#0a1f44] dark:bg-[#102b59]/25 dark:text-[#dde7f7] dark:hover:border-[#49689b] dark:hover:bg-[#102b59]/45 dark:hover:text-[#f4f8ff]'
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
                                                : 'bg-[#edf2fa] text-[#163a72] dark:bg-[#102b59]/50 dark:text-[#dde7f7]'
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
