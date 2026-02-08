import { LayoutDashboard, BarChart3, FileText, Activity, Grid as GridIcon } from 'lucide-react';
import { Tabs } from '../../components/ui/tabs/Tabs';
import { PageHeader } from '../../components/ui/layout/PageHeader';

const Dashboard = () => {
    const tabs = [
        {
            id: 'overview',
            label: 'Overview',
            icon: LayoutDashboard,
            content: (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {/* Stats Cards */}
                    <div className="bg-white dark:bg-slate-900 p-6 rounded-lg border border-slate-200 dark:border-slate-700">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-600 dark:text-slate-400">Total Sales</p>
                                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">$45,231</p>
                            </div>
                            <div className="p-3 bg-primary-100 dark:bg-primary-900/20 rounded-lg">
                                <BarChart3 className="w-6 h-6 text-primary-600 dark:text-primary-400" />
                            </div>
                        </div>
                        <p className="text-sm text-success-600 mt-2">+12.5% from last month</p>
                    </div>

                    <div className="bg-white dark:bg-slate-900 p-6 rounded-lg border border-slate-200 dark:border-slate-700">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-600 dark:text-slate-400">Total Orders</p>
                                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">1,429</p>
                            </div>
                            <div className="p-3 bg-info-100 dark:bg-info-900/20 rounded-lg">
                                <FileText className="w-6 h-6 text-info-600 dark:text-info-400" />
                            </div>
                        </div>
                        <p className="text-sm text-success-600 mt-2">+8.2% from last month</p>
                    </div>

                    <div className="bg-white dark:bg-slate-900 p-6 rounded-lg border border-slate-200 dark:border-slate-700">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-600 dark:text-slate-400">Total Products</p>
                                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">469</p>
                            </div>
                            <div className="p-3 bg-warning-100 dark:bg-warning-900/20 rounded-lg">
                                <GridIcon className="w-6 h-6 text-warning-600 dark:text-warning-400" />
                            </div>
                        </div>
                        <p className="text-sm text-slate-600 mt-2">+23 new this month</p>
                    </div>

                    <div className="bg-white dark:bg-slate-900 p-6 rounded-lg border border-slate-200 dark:border-slate-700">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-600 dark:text-slate-400">Low Stock Items</p>
                                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">12</p>
                            </div>
                            <div className="p-3 bg-error-100 dark:bg-error-900/20 rounded-lg">
                                <Activity className="w-6 h-6 text-error-600 dark:text-error-400" />
                            </div>
                        </div>
                        <p className="text-sm text-error-600 mt-2">Requires attention</p>
                    </div>
                </div>
            ),
        },
        {
            id: 'analytics',
            label: 'Analytics',
            icon: BarChart3,
            content: (
                <div className="text-center py-12 text-slate-500">
                    Analytics dashboard coming soon...
                </div>
            ),
        },
        {
            id: 'reports',
            label: 'Reports',
            icon: FileText,
            content: (
                <div className="text-center py-12 text-slate-500">
                    Reports coming soon...
                </div>
            ),
        },
        {
            id: 'activity',
            label: 'Activity',
            icon: Activity,
            content: (
                <div className="text-center py-12 text-slate-500">
                    Activity feed coming soon...
                </div>
            ),
        },
    ];

    return (
        <div>
            <PageHeader
                title="Dashboard"
                description="Welcome to your inventory management system"
            />

            <Tabs tabs={tabs} defaultTab="overview" />
        </div>
    );
};

export default Dashboard;
