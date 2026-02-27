import React from 'react';
import { Plus, ChevronDown, Download, Printer, Search } from 'lucide-react';
import { ActionDropdown } from '../dropdown/ActionDropdown';

interface QuickAddItem {
    label: string;
    icon?: React.ReactNode;
    onClick: () => void;
}

interface TabActionToolbarProps {
    title?: string;
    primaryAction: {
        label: string;
        onClick: () => void;
    };
    secondaryAction?: {
        label: string;
        onClick: () => void;
    };
    quickAddItems?: QuickAddItem[];
    onExport?: () => void;
    onPrint?: () => void;
    onSearch?: (value: string) => void;
    /**
     * Optional explicit data load trigger (e.g. "Display" button)
     */
    onDisplay?: () => void;
    displayLabel?: string;
    sticky?: boolean;
}

export const TabActionToolbar: React.FC<TabActionToolbarProps> = ({
    title,
    primaryAction,
    secondaryAction,
    quickAddItems = [],
    onExport,
    onPrint,
    onSearch,
    onDisplay,
    displayLabel,
    sticky = false,
}) => {
    return (
        <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-4 px-1 mb-2 ${sticky ? 'sticky top-0 bg-slate-50/80 dark:bg-slate-900/80 backdrop-blur-md z-30' : ''}`}>
            {title && (
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 hidden lg:block">
                    {title}
                </h3>
            )}

            <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                {/* Search Input */}
                {onSearch && (
                    <div className="relative mr-2">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search..."
                            onChange={(e) => onSearch(e.target.value)}
                            className="pl-9 pr-4 py-2 w-64 text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all"
                        />
                    </div>
                )}
                {secondaryAction && (
                    <button
                        onClick={secondaryAction.onClick}
                        className="px-3 py-2 text-sm font-medium rounded-xl border border-primary-300 text-primary-700 hover:bg-primary-50 dark:border-primary-500/40 dark:text-primary-300 dark:hover:bg-primary-500/10 transition-all"
                    >
                        {secondaryAction.label}
                    </button>
                )}
                {onDisplay && (
                    <button
                        onClick={onDisplay}
                        className="px-3 py-2 text-sm font-medium rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
                    >
                        {displayLabel || 'Display'}
                    </button>
                )}
                {/* Export & Print */}
                {(onExport || onPrint) && (
                    <div className="flex items-center gap-1.5 mr-2 pr-2 border-r border-slate-200 dark:border-slate-800">
                        {onPrint && (
                            <button
                                onClick={onPrint}
                                className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800 rounded-xl transition-all"
                                title="Print"
                            >
                                <Printer className="w-5 h-5" />
                            </button>
                        )}
                        {onExport && (
                            <button
                                onClick={onExport}
                                className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800 rounded-xl transition-all"
                                title="Export"
                            >
                                <Download className="w-5 h-5" />
                            </button>
                        )}
                    </div>
                )}

                {/* Primary Action */}
                <button
                    onClick={primaryAction.onClick}
                    className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white font-bold rounded-xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-500/20 active:scale-95"
                >
                    <Plus className="w-5 h-5" />
                    <span>{primaryAction.label}</span>
                </button>

                {/* Quick Add Dropdown */}
                {quickAddItems.length > 0 && (
                    <ActionDropdown
                        trigger={
                            <button className="flex items-center justify-center w-11 h-11 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-all shadow-sm">
                                <ChevronDown className="w-5 h-5" />
                            </button>
                        }
                        items={quickAddItems.map(item => ({
                            label: item.label,
                            icon: item.icon,
                            onClick: item.onClick
                        }))}
                        align="right"
                    />
                )}
            </div>
        </div>
    );
};
