import { X } from 'lucide-react';

type Props = {
  label: string;
  onRemove: () => void;
};

// A removable filter pill - e.g. "Material: Steel [x]" in an "Active Criteria" row.
// No equivalent existed anywhere in this codebase; built on the same rounded-full pill
// shape as the existing Badge component (components/ui/badge/Badge.tsx), just with a
// clickable remove button, which Badge's endIcon (a plain, non-interactive ReactNode)
// can't provide on its own.
export const FilterChip = ({ label, onRemove }: Props) => (
  <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700 dark:bg-primary-500/15 dark:text-primary-300">
    {label}
    <button
      type="button"
      onClick={onRemove}
      className="rounded-full p-0.5 text-primary-500 hover:bg-primary-100 hover:text-primary-800 dark:text-primary-300 dark:hover:bg-primary-500/25 dark:hover:text-primary-100"
      aria-label={`Remove filter: ${label}`}
    >
      <X className="h-3 w-3" />
    </button>
  </span>
);
