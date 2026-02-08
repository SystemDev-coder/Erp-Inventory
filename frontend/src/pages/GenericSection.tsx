import { LucideIcon } from 'lucide-react';
import { PageHeader } from '../components/ui/layout';
import { Tabs } from '../components/ui/tabs';

interface GenericSectionProps {
    title: string;
    description: string;
    tabs: Array<{
        id: string;
        label: string;
        icon: LucideIcon;
        badge?: number | string;
        content?: React.ReactNode;
    }>;
    actionLabel?: string;
    onAction?: () => void;
}

const GenericSection: React.FC<GenericSectionProps> = ({
    title,
    description,
    tabs,
    actionLabel,
    onAction,
}) => {
    const tabsWithContent = tabs.map((tab) => ({
        ...tab,
        content: tab.content || (
            <div className="bg-white dark:bg-slate-900 p-20 rounded-2xl border border-slate-200 dark:border-slate-800 text-center">
                <div className="flex flex-col items-center justify-center text-slate-400">
                    <tab.icon className="w-12 h-12 mb-4 opacity-20" />
                    <h3 className="text-lg font-bold text-slate-600 dark:text-slate-400">No {tab.label} records found.</h3>
                    <p className="text-sm mt-1 italic">Get started by creating your first entry.</p>
                </div>
            </div>
        ),
    }));

    return (
        <div>
            <PageHeader
                title={title}
                description={description}
                actions={
                    actionLabel && onAction && (
                        <button
                            onClick={onAction}
                            className="flex items-center gap-2 px-6 py-2.5 bg-primary-600 text-white font-bold rounded-xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-500/20 active:scale-95"
                        >
                            {actionLabel}
                        </button>
                    )
                }
            />

            <Tabs tabs={tabsWithContent} defaultTab={tabs[0]?.id} />
        </div>
    );
};

export default GenericSection;
