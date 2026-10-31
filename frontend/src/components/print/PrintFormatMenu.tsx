import { ChevronDown } from 'lucide-react';
import { ActionDropdown } from '../ui/dropdown/ActionDropdown';
import { PAPER_SIZE_LABELS, PaperSize } from '../../services/settings.service';
import { useBusinessConfig } from '../../context/BusinessConfigContext';

interface PrintFormatMenuProps {
  // Called with the chosen format - a one-time override for this print only,
  // never changes the saved default (Settings -> Print Settings).
  onSelect: (paperSize: PaperSize) => void;
  className?: string;
  disabled?: boolean;
}

const DEFAULT_TRIGGER_CLASS =
  'inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-300';

// Document Print Settings: a small caret menu placed next to an existing
// "Print" button/icon, offering a one-time format override (A4/A5/80mm/58mm
// Thermal) without touching the saved business-wide default. The trigger
// itself does nothing but open the menu - the caller's own Print
// button/icon still does the normal, default-format print.
export const PrintFormatMenu = ({ onSelect, className, disabled }: PrintFormatMenuProps) => {
  const { profile } = useBusinessConfig();
  const defaultSize = profile.receiptConfig.paperSize;

  return (
    <ActionDropdown
      align="right"
      trigger={
        <button
          type="button"
          className={className || DEFAULT_TRIGGER_CLASS}
          aria-label="Choose print format"
          title="Print as..."
          disabled={disabled}
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      }
      items={(Object.entries(PAPER_SIZE_LABELS) as [PaperSize, string][]).map(([value, label]) => ({
        label: value === defaultSize ? `${label} (default)` : label,
        checked: value === defaultSize,
        onClick: () => onSelect(value),
      }))}
    />
  );
};
