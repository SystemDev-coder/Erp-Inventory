import { Search } from 'lucide-react';

const cards = [
  { title: 'My account', desc: 'Manage your KeydMaal profile, password, and preferences.' },
  { title: 'Purchases & Suppliers', desc: 'Track orders, receipts, and supplier relationships.' },
  { title: 'Finance', desc: 'Manage accounts, cashflow, and settlements.' },
  { title: 'Inventory', desc: 'Stock levels, transfers, and adjustments.' },
  { title: 'Sales & Customers', desc: 'Invoices, receipts, and customer balances.' },
  { title: 'Automation', desc: 'Alerts, exports, and scheduled tasks.' },
];

const Support = () => (
  <div className="space-y-8">
    <div className="text-center space-y-3">
      <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-slate-100">We’re here to help</h1>
      <div className="relative max-w-xl mx-auto">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input
          className="w-full pl-10 pr-3 py-3 rounded-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm shadow-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          placeholder="Search help articles, topics, or features..."
        />
      </div>
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {cards.map((c) => (
        <div
          key={c.title}
          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm hover:shadow-md transition-shadow"
        >
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">{c.title}</h3>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{c.desc}</p>
        </div>
      ))}
    </div>

    <div className="text-center text-sm text-slate-600 dark:text-slate-300">
      Need more help? Email <span className="font-semibold">support@keydmaalerp.com</span>
    </div>
  </div>
);

export default Support;
