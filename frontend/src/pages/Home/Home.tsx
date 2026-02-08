import { BarChart3, AlertTriangle, Zap, History } from 'lucide-react';
import { PageHeader } from '../../components/ui/layout';
import { Tabs } from '../../components/ui/tabs';

const Home = () => {
    const tabs = [
        {
            id: 'overview',
            label: 'Overview',
            icon: BarChart3,
            content: (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                        <p className="text-sm font-medium text-slate-500">Today's Sales</p>
                        <h3 className="text-2xl font-bold mt-2">$1,240.00</h3>
                        <p className="text-xs text-emerald-600 mt-2 font-medium">↑ 12% from yesterday</p>
                    </div>
                    <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                        <p className="text-sm font-medium text-slate-500">New Subscriptions</p>
                        <h3 className="text-2xl font-bold mt-2">12</h3>
                        <p className="text-xs text-emerald-600 mt-2 font-medium">↑ 4% from last week</p>
                    </div>
                    <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                        <p className="text-sm font-medium text-slate-500">Active Stock</p>
                        <h3 className="text-2xl font-bold mt-2">450 items</h3>
                        <p className="text-xs text-slate-500 mt-2 font-medium">Steady</p>
                    </div>
                    <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                        <p className="text-sm font-medium text-slate-500">Low Stock Alerts</p>
                        <h3 className="text-2xl font-bold mt-2 text-amber-600">8</h3>
                        <p className="text-xs text-amber-600 mt-2 font-medium">Requires attention</p>
                    </div>
                </div>
            )
        },
        {
            id: 'alerts',
            label: 'Alerts',
            icon: AlertTriangle,
            content: (
                <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl border border-slate-200 dark:border-slate-800 text-center">
                    <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
                    <h3 className="text-lg font-bold">Important Alerts</h3>
                    <p className="text-slate-500 mt-2">You have 8 items running low on stock. Please restock soon.</p>
                </div>
            )
        },
        {
            id: 'quick-actions',
            label: 'Quick Actions',
            icon: Zap,
            content: (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <button className="flex flex-col items-center justify-center p-8 bg-primary-50 dark:bg-primary-900/10 border border-primary-100 dark:border-primary-800 rounded-2xl hover:bg-primary-100 transition-colors">
                        <Zap className="w-8 h-8 text-primary-600 mb-3" />
                        <span className="font-bold text-primary-900 dark:text-primary-100">Add New Sale</span>
                    </button>
                    <button className="flex flex-col items-center justify-center p-8 bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-800 rounded-2xl hover:bg-emerald-100 transition-colors">
                        <BarChart3 className="w-8 h-8 text-emerald-600 mb-3" />
                        <span className="font-bold text-emerald-900 dark:text-emerald-100">Add New Product</span>
                    </button>
                    <button className="flex flex-col items-center justify-center p-8 bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-800 rounded-2xl hover:bg-amber-100 transition-colors">
                        <History className="w-8 h-8 text-amber-600 mb-3" />
                        <span className="font-bold text-amber-900 dark:text-amber-100">Record Payment</span>
                    </button>
                </div>
            )
        },
        {
            id: 'recent-activity',
            label: 'Recent Activity',
            icon: History,
            content: (
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                    <div className="p-4 border-b border-slate-200 dark:border-slate-800 font-bold">Latest Changes</div>
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {[1, 2, 3, 4, 5].map((i) => (
                            <div key={i} className="p-4 flex items-center gap-4">
                                <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                                    <History className="w-5 h-5 text-slate-500" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium">Sale recorded for John Doe</p>
                                    <p className="text-xs text-slate-500">2 hours ago</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )
        }
    ];

    return (
        <div>
            <PageHeader
                title="Welcome Back"
                description="Here's what's happening in your shop today."
            />
            <Tabs tabs={tabs} defaultTab="overview" />
        </div>
    );
};

export default Home;
