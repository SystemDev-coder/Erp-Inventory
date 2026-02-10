import { FileBarChart } from 'lucide-react';
import GenericSection from '../GenericSection';

const Reports = () => {
  const tabs = [
    {
      id: 'overview',
      label: 'Reports',
      icon: FileBarChart,
      content: (
        <div className="bg-white dark:bg-slate-900 p-20 rounded-2xl border border-slate-200 dark:border-slate-800 text-center">
          <div className="flex flex-col items-center justify-center text-slate-400">
            <FileBarChart className="w-12 h-12 mb-4 opacity-20" />
            <h3 className="text-lg font-bold text-slate-600 dark:text-slate-400">Reports coming soon</h3>
            <p className="text-sm mt-1 italic">Hook up your report queries here.</p>
          </div>
        </div>
      ),
    },
  ];

  return (
    <GenericSection
      title="Reports"
      description="Review performance and operational reports."
      tabs={tabs}
    />
  );
};

export default Reports;
