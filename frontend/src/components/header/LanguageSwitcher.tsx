import { useState } from "react";
import { Dropdown } from "../ui/dropdown/Dropdown";
import { DropdownItem } from "../ui/dropdown/DropdownItem";
import { Languages, Check } from "lucide-react";
import { useLanguage, Language } from "../../context/LanguageContext";

const OPTIONS: { code: Language; labelKey: "english" | "somali" }[] = [
  { code: "en", labelKey: "english" },
  { code: "so", labelKey: "somali" },
];

export default function LanguageSwitcher() {
  const [isOpen, setIsOpen] = useState(false);
  const { language, setLanguage, t } = useLanguage();

  const toggleDropdown = () => setIsOpen((prev) => !prev);
  const closeDropdown = () => setIsOpen(false);

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
        <Languages className="h-5 w-5" aria-hidden="true" />
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
          {OPTIONS.map((opt) => (
            <li key={opt.code}>
              <DropdownItem
                onItemClick={() => {
                  setLanguage(opt.code);
                  closeDropdown();
                }}
                tag="button"
                className="group flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-theme-sm font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800/60"
              >
                <span>{t(opt.labelKey)}</span>
                {language === opt.code && <Check className="h-4 w-4 shrink-0 text-primary-600" />}
              </DropdownItem>
            </li>
          ))}
        </ul>
      </Dropdown>
    </div>
  );
}
