import React, { useMemo, useRef } from "react";
import { FileSpreadsheet, Printer } from "lucide-react";
import { Modal } from "../ui/modal/Modal";

const BORDER_COLOR = "#0b6d7a";

// Column and props definitions
export type ReportColumn<T> = {
  key: keyof T | string;
  header: string;
  width?: string;
  align?: "left" | "center" | "right";
  render?: (row: T, index: number) => React.ReactNode;
};

type ReportModalProps<T> = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  companyInfo?: {
    name?: string;
    manager?: string;
    phone?: string;
    updatedAt?: string;
  };
  data: T[];
  columns: ReportColumn<T>[];
  filters?: Record<string, string | number>;
  generatedAt?: string;
  fileName?: string;
  enablePdf?: boolean;
  autoAction?: "print" | "excel" | null;
  onAutoActionComplete?: () => void;
};

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const getRawValue = <T,>(row: T, col: ReportColumn<T>, index: number) => {
  if (col.render) {
    const rendered = col.render(row, index);
    if (typeof rendered === "string" || typeof rendered === "number") return String(rendered);
  }
  const val = (row as Record<string, unknown>)[col.key as string];
  return val == null ? "" : String(val);
};

export function ReportModal<T extends Record<string, any>>({
  isOpen,
  onClose,
  title,
  subtitle,
  companyInfo,
  data,
  columns,
  filters,
  generatedAt,
  fileName,
  enablePdf = true,
  autoAction = null,
  onAutoActionComplete,
}: ReportModalProps<T>) {
  const printRef = useRef<HTMLDivElement>(null);
  const reportDate = useMemo(() => generatedAt ?? new Date().toISOString().slice(0, 10), [generatedAt]);
  const safeFileName =
    fileName ??
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

  const handlePrint = () => {
    const contentNode = printRef.current;
    if (!contentNode) return;

    const styles = Array.from(document.querySelectorAll("style, link[rel='stylesheet']"))
      .map((el) => el.outerHTML)
      .join("");

    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return;

    doc.open();
    doc.write(
      `<!doctype html><html><head>${styles}<style>
        body { margin: 18px; padding: 0; background: #ffffff; color: #0f172a; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      </style></head><body>${contentNode.outerHTML}</body></html>`
    );
    doc.close();

    const cleanup = () => {
      document.body.removeChild(iframe);
      window.removeEventListener("afterprint", cleanup);
    };

    iframe.onload = () => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      window.addEventListener("afterprint", cleanup);
      setTimeout(cleanup, 1500);
    };
  };

  // Trigger auto actions when requested (print or excel)
  React.useEffect(() => {
    if (!isOpen || !autoAction) return;
    const run = async () => {
      if (autoAction === "excel") {
        handleExportExcel();
      } else if (autoAction === "print") {
        handlePrint();
      }
      onAutoActionComplete?.();
    };
    // slight delay to ensure modal has rendered
    const id = setTimeout(run, 120);
    return () => clearTimeout(id);
  }, [isOpen, autoAction, onAutoActionComplete]);

  const handleExportExcel = () => {
    const headerRow = columns
      .map((col) => `<th style="padding:8px;text-align:${col.align ?? "left"};background:#0f172a;color:#fff;">${escapeHtml(col.header)}</th>`)
      .join("");
    const bodyRows = data
      .map(
        (row, i) =>
          `<tr>${columns
            .map(
              (col) =>
                `<td style="padding:8px;border:1px solid #e2e8f0;text-align:${col.align ?? "left"};">${escapeHtml(
                  getRawValue(row, col, i)
                )}</td>`
            )
            .join("")}</tr>`
      )
      .join("");
    const tableHtml = `<table><thead><tr>${headerRow}</tr></thead><tbody>${bodyRows}</tbody></table>`;
    const blob = new Blob([`\ufeff<html><head><meta charset="UTF-8" /></head><body>${tableHtml}</body></html>`], {
      type: "application/vnd.ms-excel;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeFileName || "report"}-${reportDate}.xls`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Report Preview" size="2xl" resizable>
      <div className="space-y-4">
        {/* Screen controls (hidden on print) */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl bg-gradient-to-r from-primary-700 via-primary-600 to-primary-500 px-6 py-5 text-white shadow-lg print:hidden">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.25em] opacity-80">Report</p>
            <h2 className="text-2xl font-semibold">{title}</h2>
            {subtitle && <p className="text-sm opacity-80">{subtitle}</p>}
          </div>
          <div className="flex flex-wrap gap-2 sm:gap-3">
            {enablePdf && (
              <button
                onClick={handlePrint}
                className="inline-flex items-center gap-2 rounded-xl bg-white text-primary-700 px-4 py-2 text-sm font-semibold shadow-sm hover:bg-slate-50 transition"
              >
                <Printer className="h-4 w-4" /> Export PDF
              </button>
            )}
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold backdrop-blur hover:bg-white/20 transition"
            >
              <Printer className="h-4 w-4" /> Print
            </button>
            <button
              onClick={handleExportExcel}
              className="inline-flex items-center gap-2 rounded-xl bg-white text-primary-700 px-4 py-2 text-sm font-semibold shadow-sm hover:bg-slate-50 transition"
            >
              <FileSpreadsheet className="h-4 w-4" /> Export Excel
            </button>
          </div>
        </div>

        {/* Printable surface */}
        <div
          ref={printRef}
          id="report-print-area"
          className="mx-auto max-w-5xl bg-white text-slate-900 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.35)] border border-slate-300 rounded-lg"
          style={{ pageBreakInside: "avoid" }}
        >
        <div className="flex items-start justify-between text-[11px] text-slate-500 px-6 pt-4">
          <span>{reportDate}</span>
          <span className="uppercase tracking-[0.25em]">{companyInfo?.name || title}</span>
        </div>

        <div className="flex flex-col items-center gap-2 px-6 pb-2 pt-3">
          <h1 className="text-3xl font-extrabold tracking-[0.12em] text-slate-900 text-center uppercase">
            {companyInfo?.name || title}
          </h1>
          <div className="h-1 w-28 rounded-full" style={{ backgroundColor: BORDER_COLOR }} />
        </div>

        <div className="flex flex-col gap-1 px-6 pb-3 text-sm font-semibold text-slate-800">
          <div className="flex flex-wrap justify-between gap-3">
            <span>{subtitle || "Student Report"}</span>
            <span>Print Date: {reportDate}</span>
          </div>
          {companyInfo && (
            <div className="flex flex-wrap gap-4 text-[12px] font-medium text-slate-700">
              <span>Manager: {companyInfo.manager || "-"}</span>
              <span>Phone: {companyInfo.phone || "-"}</span>
              <span>Updated: {companyInfo.updatedAt || "-"}</span>
            </div>
          )}
        </div>

          <div className="px-6 pb-6">
            <div className="overflow-x-auto">
              <table
                className="w-full text-sm"
                style={{ borderCollapse: "collapse", width: "100%" }}
              >
                <thead>
                  <tr>
                    {columns.map((col) => (
                      <th
                        key={col.header}
                        style={{
                          border: `1px solid ${BORDER_COLOR}`,
                          padding: "10px 8px",
                          textAlign: col.align ?? "left",
                          background: "#f5fbff",
                          color: "#0b3050",
                          fontWeight: 700,
                          fontSize: "12px",
                          width: col.width,
                        }}
                      >
                        {col.header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.map((row, i) => (
                    <tr key={i}>
                      {columns.map((col) => (
                        <td
                          key={col.header}
                          style={{
                            border: `1px solid ${BORDER_COLOR}`,
                            padding: "8px 6px",
                            textAlign: col.align ?? "left",
                            fontSize: "12px",
                            lineHeight: 1.4,
                          }}
                        >
                          {col.render ? col.render(row, i) : getRawValue(row, col, i)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {data.length === 0 && (
                    <tr>
                      <td
                        colSpan={columns.length}
                        style={{ border: `1px solid ${BORDER_COLOR}`, padding: "16px", textAlign: "center", color: "#94a3b8" }}
                      >
                        No records to show.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {filters && Object.keys(filters).length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-600">
                {Object.entries(filters).map(([label, value]) => (
                  <span
                    key={label}
                    className="rounded-full border px-3 py-1"
                    style={{
                      borderColor: BORDER_COLOR,
                      color: BORDER_COLOR,
                      background: "#f5fbff",
                      fontWeight: 600,
                    }}
                  >
                    {label}: {value}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
