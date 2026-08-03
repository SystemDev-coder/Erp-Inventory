import { useState } from "react";
import { Dropdown } from "../ui/dropdown/Dropdown";
import { DropdownItem } from "../ui/dropdown/DropdownItem";
import { Building2, Check } from "lucide-react";
import { useBranch } from "../../context/BranchContext";

export default function BranchSwitcherDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const { isAdmin, branches, activeBranchId, setActiveBranch } = useBranch();

  if (branches.length === 0) return null;

  const toggleDropdown = () => setIsOpen((prev) => !prev);
  const closeDropdown = () => setIsOpen(false);

  const activeBranchName =
    branches.find((b) => b.branch_id === activeBranchId)?.branch_name ||
    (isAdmin ? "All branches" : "");

  if (branches.length === 1) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-theme-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200">
        <Building2 className="h-4 w-4 text-slate-500 dark:text-slate-300" />
        <span className="max-w-[140px] truncate">{branches[0].branch_name}</span>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={toggleDropdown}
        className="dropdown-toggle flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-theme-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800/60"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <Building2 className="h-4 w-4 text-slate-500 dark:text-slate-300" />
        <span className="max-w-[140px] truncate">{activeBranchName}</span>
        <svg
          className={`shrink-0 text-slate-600 transition-transform duration-200 dark:text-white/80 ${
            isOpen ? "rotate-180" : ""
          }`}
          width="14"
          height="16"
          viewBox="0 0 18 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M4.3125 8.65625L9 13.3437L13.6875 8.65625"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <Dropdown
        isOpen={isOpen}
        onClose={closeDropdown}
        className="absolute right-0 mt-[17px] flex w-[240px] flex-col rounded-2xl border border-slate-200 bg-white p-3 shadow-theme-lg dark:border-slate-700 dark:bg-slate-900"
      >
        <span className="mb-2 block px-1 text-theme-xs font-medium uppercase text-slate-400 dark:text-slate-500">
          Viewing branch
        </span>
        <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
          {isAdmin && (
            <li>
              <DropdownItem
                onItemClick={() => {
                  setActiveBranch(null);
                  closeDropdown();
                }}
                tag="button"
                className="group flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-theme-sm font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800/60"
              >
                All branches
                {activeBranchId === null && <Check className="h-4 w-4 text-primary-600" />}
              </DropdownItem>
            </li>
          )}
          {branches.map((branch) => (
            <li key={branch.branch_id}>
              <DropdownItem
                onItemClick={() => {
                  setActiveBranch(branch.branch_id);
                  closeDropdown();
                }}
                tag="button"
                className="group flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-theme-sm font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800/60"
              >
                <span className="truncate">{branch.branch_name}</span>
                {activeBranchId === branch.branch_id && (
                  <Check className="h-4 w-4 shrink-0 text-primary-600" />
                )}
              </DropdownItem>
            </li>
          ))}
        </ul>
      </Dropdown>
    </div>
  );
}
