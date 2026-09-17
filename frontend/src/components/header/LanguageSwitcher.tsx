import { useState } from "react";
import { Dropdown } from "../ui/dropdown/Dropdown";
import { DropdownItem } from "../ui/dropdown/DropdownItem";
import { Check } from "lucide-react";
import { useLanguage, Language } from "../../context/LanguageContext";

const UsFlag = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 40 40" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <clipPath id="lang-flag-us-circle">
        <circle cx="20" cy="20" r="20" />
      </clipPath>
    </defs>
    <g clipPath="url(#lang-flag-us-circle)">
      <rect width="40" height="40" fill="#fff" />
      <rect y="0" width="40" height="3.08" fill="#B22234" />
      <rect y="6.15" width="40" height="3.08" fill="#B22234" />
      <rect y="12.31" width="40" height="3.08" fill="#B22234" />
      <rect y="18.46" width="40" height="3.08" fill="#B22234" />
      <rect y="24.62" width="40" height="3.08" fill="#B22234" />
      <rect y="30.77" width="40" height="3.08" fill="#B22234" />
      <rect y="36.92" width="40" height="3.08" fill="#B22234" />
      <rect width="18" height="21.5" fill="#3C3B6E" />
    </g>
  </svg>
);

const SomaliaFlag = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 40 40" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <circle cx="20" cy="20" r="20" fill="#4189DD" />
    <polygon
      points="20,9 22.65,16.9 31,16.9 24.18,21.78 26.83,29.68 20,24.8 13.17,29.68 15.82,21.78 9,16.9 17.35,16.9"
      fill="#fff"
    />
  </svg>
);

const FLAG_COMPONENTS: Record<Language, (props: { className?: string }) => JSX.Element> = {
  en: UsFlag,
  so: SomaliaFlag,
};

const OPTIONS: { code: Language; labelKey: "english" | "somali" }[] = [
  { code: "en", labelKey: "english" },
  { code: "so", labelKey: "somali" },
];

export default function LanguageSwitcher() {
  const [isOpen, setIsOpen] = useState(false);
  const { language, setLanguage, t } = useLanguage();

  const toggleDropdown = () => setIsOpen((prev) => !prev);
  const closeDropdown = () => setIsOpen(false);

  const CurrentFlag = FLAG_COMPONENTS[language] ?? UsFlag;

  return (
    <div className="relative">
      <button
        onClick={toggleDropdown}
        className="dropdown-toggle relative flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:border-white/15 dark:bg-black dark:text-white/80 dark:hover:bg-white/10 dark:hover:text-white"
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label={t("language")}
        title={t("language")}
      >
        <CurrentFlag className="h-6 w-6 shrink-0 rounded-full" />
      </button>

      <Dropdown
        isOpen={isOpen}
        onClose={closeDropdown}
        className="absolute right-0 mt-[17px] flex w-[180px] flex-col rounded-2xl border border-slate-200 bg-white p-3 shadow-theme-lg dark:border-slate-700 dark:bg-slate-900"
      >
        <span className="mb-2 block px-1 text-theme-xs font-medium uppercase text-slate-400 dark:text-slate-500">
          {t("language")}
        </span>
        <ul className="flex flex-col gap-1">
          {OPTIONS.map((opt) => {
            const Flag = FLAG_COMPONENTS[opt.code];
            return (
              <li key={opt.code}>
                <DropdownItem
                  onItemClick={() => {
                    setLanguage(opt.code);
                    closeDropdown();
                  }}
                  tag="button"
                  className="group flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-theme-sm font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800/60"
                >
                  <span className="flex items-center gap-2">
                    <Flag className="h-5 w-5 shrink-0 rounded-full" />
                    {t(opt.labelKey)}
                  </span>
                  {language === opt.code && <Check className="h-4 w-4 shrink-0 text-primary-600" />}
                </DropdownItem>
              </li>
            );
          })}
        </ul>
      </Dropdown>
    </div>
  );
}
