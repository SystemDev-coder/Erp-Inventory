import { useEffect, useId } from "react";
import flatpickr from "flatpickr";
import "flatpickr/dist/flatpickr.css";
import Label from "./Label";
import { CalenderIcon } from "../../icons";
import Hook = flatpickr.Options.Hook;
import DateOption = flatpickr.Options.DateOption;

type PropsType = {
  id: string;
  mode?: "single" | "multiple" | "range" | "time";
  onChange?: Hook | Hook[];
  defaultDate?: DateOption;
  label?: string;
  placeholder?: string;
};

/**
 * DatePicker — flatpickr-backed, styled to match the ERP design system.
 *
 * Visual:
 *  - Input matches the Lock screen inputs: rounded-xl, blue focus ring,
 *    slate-950 in dark mode, hairline border, comfortable padding.
 *  - The flatpickr popup is themed via the scoped `.erp-datepicker` rules
 *    below (light + dark), so it uses the same blue accent and slate
 *    surfaces as the rest of the app instead of flatpickr's default theme.
 *
 * API is unchanged — existing callers keep working without modification.
 */
export default function DatePicker({
  id,
  mode,
  onChange,
  label,
  defaultDate,
  placeholder,
}: PropsType) {
  // A stable unique scope class so our flatpickr CSS only targets this
  // component's popup (flatpickr attaches the calendar to <body> by default,
  // so we cannot rely on DOM ancestry for scoping — a class is safer).
  const scopeClass = `erp-datepicker-${useId().replace(/[:]/g, "")}`;

  useEffect(() => {
    const flatPickr = flatpickr(`#${id}`, {
      mode: mode || "single",
      static: true,
      monthSelectorType: "static",
      dateFormat: "Y-m-d",
      defaultDate,
      onChange,
      // Attach our scoping class to the popup wrapper so the CSS below
      // only affects this instance and never leaks to other flatpickr uses.
      onReady: (_selectedDates, _dateStr, instance) => {
        instance.calendarContainer.classList.add("erp-datepicker", scopeClass);
      },
    });

    return () => {
      if (!Array.isArray(flatPickr)) {
        flatPickr.destroy();
      }
    };
  }, [mode, onChange, id, defaultDate, scopeClass]);

  return (
    <div>
      {label && <Label htmlFor={id}>{label}</Label>}

      <div className="relative">
        <input
          id={id}
          placeholder={placeholder}
          readOnly
          className={[
            // Base layout
            "h-11 w-full appearance-none rounded-xl border bg-white px-4 py-2.5 pr-11 text-sm shadow-sm outline-none",
            // Colors — light mode
            "border-slate-300 text-slate-900 placeholder:text-slate-400",
            // Focus — light mode (blue-500, matches Lock screen / Tabs)
            "transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/25",
            // Colors — dark mode
            "dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500",
            // Focus — dark mode (blue-400, matches Lock screen / Tabs)
            "dark:focus:border-blue-400 dark:focus:ring-blue-400/25",
          ].join(" ")}
        />

        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500">
          <CalenderIcon className="size-5" />
        </span>
      </div>

      {/* ── flatpickr popup theme ────────────────────────────────────────
          Scoped to `.erp-datepicker` so it never touches other flatpickr
          instances in the app. Uses the same blue + slate palette as the
          Lock screen and Tabs.
      ──────────────────────────────────────────────────────────────────── */}
      <style>{`
        .erp-datepicker.flatpickr-calendar {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          box-shadow: 0 20px 40px -12px rgba(15, 23, 42, 0.18);
          padding: 8px;
          font-family: inherit;
        }

        .erp-datepicker .flatpickr-months {
          align-items: center;
          margin-bottom: 6px;
        }

        .erp-datepicker .flatpickr-month {
          color: #0f172a;
          fill: #0f172a;
          height: 34px;
        }

        .erp-datepicker .flatpickr-current-month {
          font-size: 14px;
          font-weight: 600;
          padding-top: 4px;
        }

        .erp-datepicker .flatpickr-current-month .flatpickr-monthDropdown-months {
          font-weight: 600;
          background: transparent;
          color: #0f172a;
          border: none;
          border-radius: 8px;
          padding: 2px 4px;
        }

        .erp-datepicker .flatpickr-current-month input.cur-year {
          color: #0f172a;
          font-weight: 600;
        }

        .erp-datepicker .flatpickr-prev-month,
        .erp-datepicker .flatpickr-next-month {
          color: #64748b;
          fill: #64748b;
          border-radius: 8px;
          padding: 4px;
          transition: background-color 150ms ease, color 150ms ease;
        }

        .erp-datepicker .flatpickr-prev-month:hover,
        .erp-datepicker .flatpickr-next-month:hover {
          background: #f1f5f9;
          color: #0f172a;
          fill: #0f172a;
        }

        .erp-datepicker .flatpickr-weekdays {
          background: transparent;
        }

        .erp-datepicker span.flatpickr-weekday {
          color: #94a3b8;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .erp-datepicker .flatpickr-day {
          color: #334155;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 500;
          transition: background-color 150ms ease, color 150ms ease;
          border: 1px solid transparent;
        }

        .erp-datepicker .flatpickr-day:hover,
        .erp-datepicker .flatpickr-day:focus {
          background: #f1f5f9;
          border-color: #f1f5f9;
          color: #0f172a;
        }

        .erp-datepicker .flatpickr-day.today {
          border-color: rgba(59, 130, 246, 0.5);
          color: #2563eb;
          font-weight: 600;
        }

        .erp-datepicker .flatpickr-day.today:hover {
          background: rgba(59, 130, 246, 0.1);
          border-color: #3b82f6;
        }

        .erp-datepicker .flatpickr-day.selected,
        .erp-datepicker .flatpickr-day.startRange,
        .erp-datepicker .flatpickr-day.endRange,
        .erp-datepicker .flatpickr-day.selected:hover {
          background: #2563eb;
          border-color: #2563eb;
          color: #ffffff;
          font-weight: 600;
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
        }

        .erp-datepicker .flatpickr-day.inRange {
          background: rgba(37, 99, 235, 0.1);
          border-color: transparent;
          color: #1e40af;
          box-shadow: none;
        }

        .erp-datepicker .flatpickr-day.prevMonthDay,
        .erp-datepicker .flatpickr-day.nextMonthDay {
          color: #cbd5e1;
        }

        .erp-datepicker .flatpickr-day.flatpickr-disabled,
        .erp-datepicker .flatpickr-day.flatpickr-disabled:hover {
          color: #cbd5e1;
          background: transparent;
          border-color: transparent;
          cursor: not-allowed;
        }

        .erp-datepicker .flatpickr-time {
          border-top: 1px solid #e2e8f0;
          margin-top: 6px;
        }

        .erp-datepicker .flatpickr-time input,
        .erp-datepicker .flatpickr-time .flatpickr-am-pm {
          color: #0f172a;
          font-weight: 500;
        }

        .erp-datepicker .flatpickr-time .flatpickr-time-separator {
          color: #64748b;
        }

        .erp-datepicker .arrowUp,
        .erp-datepicker .arrowDown {
          color: #64748b;
        }

        .erp-datepicker .arrowUp:hover,
        .erp-datepicker .arrowDown:hover {
          color: #0f172a;
        }

        /* ── Dark mode ───────────────────────────────────────────────── */
        .dark .erp-datepicker.flatpickr-calendar {
          background: #0f172a;
          border-color: #1e293b;
          box-shadow: 0 20px 40px -12px rgba(0, 0, 0, 0.6);
        }

        .dark .erp-datepicker .flatpickr-month,
        .dark .erp-datepicker .flatpickr-current-month {
          color: #f1f5f9;
          fill: #f1f5f9;
        }

        .dark .erp-datepicker .flatpickr-current-month .flatpickr-monthDropdown-months {
          color: #f1f5f9;
          background: transparent;
        }

        .dark .erp-datepicker .flatpickr-current-month .flatpickr-monthDropdown-months option {
          background: #0f172a;
          color: #f1f5f9;
        }

        .dark .erp-datepicker .flatpickr-current-month input.cur-year {
          color: #f1f5f9;
        }

        .dark .erp-datepicker .flatpickr-prev-month,
        .dark .erp-datepicker .flatpickr-next-month {
          color: #94a3b8;
          fill: #94a3b8;
        }

        .dark .erp-datepicker .flatpickr-prev-month:hover,
        .dark .erp-datepicker .flatpickr-next-month:hover {
          background: #1e293b;
          color: #f1f5f9;
          fill: #f1f5f9;
        }

        .dark .erp-datepicker span.flatpickr-weekday {
          color: #64748b;
        }

        .dark .erp-datepicker .flatpickr-day {
          color: #cbd5e1;
        }

        .dark .erp-datepicker .flatpickr-day:hover,
        .dark .erp-datepicker .flatpickr-day:focus {
          background: #1e293b;
          border-color: #1e293b;
          color: #f1f5f9;
        }

        .dark .erp-datepicker .flatpickr-day.today {
          border-color: rgba(96, 165, 250, 0.5);
          color: #60a5fa;
        }

        .dark .erp-datepicker .flatpickr-day.today:hover {
          background: rgba(96, 165, 250, 0.1);
          border-color: #60a5fa;
        }

        .dark .erp-datepicker .flatpickr-day.selected,
        .dark .erp-datepicker .flatpickr-day.startRange,
        .dark .erp-datepicker .flatpickr-day.endRange,
        .dark .erp-datepicker .flatpickr-day.selected:hover {
          background: #3b82f6;
          border-color: #3b82f6;
          color: #ffffff;
        }

        .dark .erp-datepicker .flatpickr-day.inRange {
          background: rgba(59, 130, 246, 0.15);
          color: #93c5fd;
        }

        .dark .erp-datepicker .flatpickr-day.prevMonthDay,
        .dark .erp-datepicker .flatpickr-day.nextMonthDay {
          color: #475569;
        }

        .dark .erp-datepicker .flatpickr-day.flatpickr-disabled,
        .dark .erp-datepicker .flatpickr-day.flatpickr-disabled:hover {
          color: #475569;
          background: transparent;
          border-color: transparent;
        }

        .dark .erp-datepicker .flatpickr-time {
          border-top-color: #1e293b;
        }

        .dark .erp-datepicker .flatpickr-time input,
        .dark .erp-datepicker .flatpickr-time .flatpickr-am-pm {
          color: #f1f5f9;
        }

        .dark .erp-datepicker .flatpickr-time .flatpickr-time-separator {
          color: #64748b;
        }

        .dark .erp-datepicker .arrowUp,
        .dark .erp-datepicker .arrowDown {
          color: #94a3b8;
        }

        .dark .erp-datepicker .arrowUp:hover,
        .dark .erp-datepicker .arrowDown:hover {
          color: #f1f5f9;
        }

        /* Make sure the popup sits above app chrome in dark mode too */
        .erp-datepicker.flatpickr-calendar.open {
          z-index: 9999;
        }
      `}</style>
    </div>
  );
}