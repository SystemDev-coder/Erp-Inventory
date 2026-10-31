import { useEffect, useState } from 'react';
import { settingsService } from '../services/settings.service';

const Footer: React.FC = () => {
  const [companyName, setCompanyName] = useState<string>('');

  useEffect(() => {
    settingsService.getCompany().then((response) => {
      if (response.success && response.data?.company?.company_name) {
        setCompanyName(response.data.company.company_name);
      }
    });
  }, []);

  const year = new Date().getFullYear();

  return (
    <footer className="mx-auto w-full max-w-(--breakpoint-2xl) px-4 py-4 md:px-6">
      <div className="flex flex-col items-center justify-between gap-2 border-t border-slate-200 pt-4 text-xs text-slate-500 sm:flex-row dark:border-slate-800 dark:text-slate-400">
        <p>
          © {year} {companyName || 'KeydMaal ERP'}. All rights reserved.
        </p>
        <p>
          Prepared by{' '}
          <a
            href="https://madalict.com"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-primary-600 hover:underline dark:text-primary-400"
          >
            Madal ICT — madalict.com
          </a>
        </p>
      </div>
    </footer>
  );
};

export default Footer;
