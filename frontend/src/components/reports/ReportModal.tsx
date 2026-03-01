import React, { useMemo, useRef } from "react";
import { FileSpreadsheet, Printer } from "lucide-react";
import { Modal } from "../ui/modal/Modal";

const BORDER_COLOR = "#111111";

// Column and props definitions
export type ReportColumn<T> = {
  key: keyof T | string;
  header: string;
  width?: string;
  align?: "left" | "center" | "right";
  render?: (row: T, index: number) => React.ReactNode;
};

export type ReportTotalItem = {
  label: string;
  value: string | number;
};

export type ReportTableTotals = {
  label?: string;
  labelColumnKey?: string;
  values: Record<string, string | number>;
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
  totals?: ReportTotalItem[];
  tableTotals?: ReportTableTotals;
  variant?: "default" | "income-statement" | "balance-sheet" | "cash-flow-statement";
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

const formatStatementDate = (value: string | number | undefined) => {
  if (!value) return "";
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
};

const formatStatementAmount = (value: number) => {
  const absolute = Math.abs(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return value < 0 ? `(${absolute})` : absolute;
};

const formatStatementCurrency = (value: number) => {
  const absolute = Math.abs(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return value < 0 ? `($${absolute})` : `$${absolute}`;
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
  totals = [],
  tableTotals,
  variant = "default",
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
  const isIncomeStatement = variant === "income-statement";
  const isBalanceSheet = variant === "balance-sheet";
  const isCashFlowStatement = variant === "cash-flow-statement";

  const statementData = useMemo(() => {
    if (!isIncomeStatement) return null;

    const rows = data.map((row) => ({
      section: String((row as Record<string, unknown>).section || ""),
      lineItem: String((row as Record<string, unknown>).line_item || ""),
      amount: Number((row as Record<string, unknown>).amount || 0),
      rowType: String((row as Record<string, unknown>).row_type || ""),
    }));

    const incomeLines = rows.filter(
      (row) => row.rowType === "detail" && row.section.toLowerCase().includes("revenue")
    );
    const incomeTotalRow = rows.find(
      (row) => row.rowType === "total" && row.section.toLowerCase().includes("revenue")
    );

    const expenseLines = rows.filter(
      (row) =>
        row.rowType === "detail" &&
        (row.section.toLowerCase().includes("expense") || row.section.toLowerCase().includes("cost"))
    );

    const netIncomeRow = rows.find((row) =>
      /(net income|net profit|net loss)/i.test(row.lineItem)
    );

    const incomeTotal =
      incomeTotalRow?.amount ?? incomeLines.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const expensesTotal = expenseLines.reduce((sum, row) => sum + Math.abs(Number(row.amount || 0)), 0);
    const netProfit = netIncomeRow?.amount ?? incomeTotal - expensesTotal;

    return {
      incomeLines,
      expenseLines,
      incomeTotal,
      expensesTotal,
      netProfit,
    };
  }, [isIncomeStatement, data]);

  const balanceSheetData = useMemo(() => {
    if (!isBalanceSheet) return null;

    const rows = data.map((row) => ({
      section: String((row as Record<string, unknown>).section || "").toLowerCase(),
      lineItem: String((row as Record<string, unknown>).line_item || ""),
      amount: Number((row as Record<string, unknown>).amount || 0),
      rowType: String((row as Record<string, unknown>).row_type || ""),
    }));

    const assets = rows.filter((row) => row.section.startsWith("assets") && row.rowType === "detail");
    const liabilities = rows.filter(
      (row) =>
        row.section.startsWith("liabilities") &&
        !row.section.includes("+") &&
        row.rowType === "detail"
    );
    const equity = rows.filter(
      (row) =>
        row.section.startsWith("equity") &&
        row.rowType === "detail" &&
        !/(net profit|net loss|net income)/i.test(row.lineItem)
    );

    const currentAssetsTotalRow = rows.find((row) => row.lineItem.toLowerCase().includes("total current assets"));
    const currentLiabilitiesTotalRow = rows.find((row) =>
      row.lineItem.toLowerCase().includes("total current liabilities")
    );

    const totalAssetsRow = rows.find(
      (row) =>
        row.lineItem.toLowerCase().includes("total assets") &&
        !row.lineItem.toLowerCase().includes("current")
    );
    const totalLiabilitiesRow = rows.find(
      (row) =>
        row.lineItem.toLowerCase().includes("total liabilities") &&
        !row.lineItem.toLowerCase().includes("+")
    );
    const totalEquityRow = rows.find(
      (row) =>
        row.lineItem.toLowerCase().includes("retained equity") ||
        row.lineItem.toLowerCase().includes("total equity")
    );
    const retainedEarningsRow = rows.find((row) => row.lineItem.toLowerCase().includes("retained earnings"));
    const netResultRow = rows.find((row) =>
      /(net profit|net loss|net income)/i.test(row.lineItem)
    );
    const totalLiabilitiesEquityRow = rows.find((row) =>
      row.lineItem.toLowerCase().includes("total liabilities + equity")
    );

    const currentAssetsTotal =
      currentAssetsTotalRow?.amount ?? assets.reduce((sum, row) => sum + row.amount, 0);
    const currentLiabilitiesTotal =
      currentLiabilitiesTotalRow?.amount ?? liabilities.reduce((sum, row) => sum + row.amount, 0);
    const totalAssets = totalAssetsRow?.amount ?? currentAssetsTotal;
    const totalLiabilities = totalLiabilitiesRow?.amount ?? currentLiabilitiesTotal;
    const totalEquity = totalEquityRow?.amount ?? totalAssets - totalLiabilities;
    const totalLiabilitiesEquity = totalLiabilitiesEquityRow?.amount ?? totalLiabilities + totalEquity;
    const netResultAmount = netResultRow?.amount ?? totalEquity;
    const retainedEarnings = retainedEarningsRow?.amount ?? netResultAmount;
    const balanceDelta = totalAssets - totalLiabilitiesEquity;

    return {
      assets,
      liabilities,
      equity,
      currentAssetsTotal,
      currentLiabilitiesTotal,
      totalAssets,
      totalLiabilities,
      totalEquity,
      totalLiabilitiesEquity,
      retainedEarnings,
      balanceDelta,
    };
  }, [isBalanceSheet, data]);

  const periodLabel = useMemo(() => {
    const fromDate = filters?.["From Date"];
    const toDate = filters?.["To Date"];
    if (!fromDate || !toDate) return subtitle || "";
    return `for the period ${formatStatementDate(fromDate)} to ${formatStatementDate(toDate)}`;
  }, [filters, subtitle]);

  const balanceSheetDateLabel = useMemo(() => {
    const asOf = filters?.["As Of Date"];
    if (asOf !== undefined) {
      return `As of ${formatStatementDate(asOf)}`;
    }
    return subtitle || "";
  }, [filters, subtitle]);

  const cashFlowData = useMemo(() => {
    if (!isCashFlowStatement) return null;

    const rows = data.map((row) => ({
      section: String((row as Record<string, unknown>).section || "").trim() || "Cash Flow",
      lineItem: String((row as Record<string, unknown>).line_item || ""),
      amount: Number((row as Record<string, unknown>).amount || 0),
      rowType: String((row as Record<string, unknown>).row_type || "detail"),
    }));

    const sectionMap = new Map<string, typeof rows>();
    const sectionOrder: string[] = [];

    rows.forEach((row) => {
      if (!sectionMap.has(row.section)) {
        sectionMap.set(row.section, []);
        sectionOrder.push(row.section);
      }
      sectionMap.get(row.section)!.push(row);
    });

    const summaryRows: typeof rows = [];
    const sections = sectionOrder
      .filter((section) => {
        const lower = section.toLowerCase();
        return lower !== "summary";
      })
      .map((section) => ({
        section,
        rows: sectionMap.get(section) || [],
      }));

    (sectionMap.get("Summary") || []).forEach((row) => summaryRows.push(row));

    return { sections, summaryRows };
  }, [data, isCashFlowStatement]);

  const cashFlowPeriodLabel = useMemo(() => {
    const fromDate = filters?.["From Date"];
    const toDate = filters?.["To Date"];
    if (!fromDate || !toDate) return subtitle || "";
    return `For the period ended ${formatStatementDate(toDate)}`;
  }, [filters, subtitle]);

  const balanceSheetShortDate = useMemo(() => {
    const asOf = filters?.["As Of Date"];
    const source = asOf ? new Date(String(asOf)) : new Date();
    if (Number.isNaN(source.getTime())) return "";
    return source.toLocaleDateString(undefined, { month: "numeric", day: "numeric", year: "2-digit" });
  }, [filters]);

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
    const totalsHtml = totals.length
      ? `<table style="margin-top:12px;border-collapse:collapse;">
           <tbody>
             ${totals
               .map(
                 (item) =>
                   `<tr><td style="padding:6px 10px;border:1px solid #cbd5e1;font-weight:700;">${escapeHtml(item.label)}</td><td style="padding:6px 10px;border:1px solid #cbd5e1;text-align:right;">${escapeHtml(String(item.value))}</td></tr>`
               )
               .join("")}
           </tbody>
         </table>`
      : "";
    const blob = new Blob([`\ufeff<html><head><meta charset="UTF-8" /></head><body>${tableHtml}${totalsHtml}</body></html>`], {
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-zinc-300 bg-white px-6 py-5 text-black shadow-sm print:hidden">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">Report</p>
            <h2 className="text-2xl font-semibold">{title}</h2>
            {subtitle && <p className="text-sm text-zinc-700">{subtitle}</p>}
          </div>
          <div className="flex flex-wrap gap-2 sm:gap-3">
            {enablePdf && (
              <button
                onClick={handlePrint}
                className="inline-flex items-center gap-2 rounded-xl border border-black bg-white px-4 py-2 text-sm font-semibold text-black transition"
              >
                <Printer className="h-4 w-4" /> Export PDF
              </button>
            )}
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-2 rounded-xl border border-black bg-black px-4 py-2 text-sm font-semibold text-white transition"
            >
              <Printer className="h-4 w-4" /> Print
            </button>
            <button
              onClick={handleExportExcel}
              className="inline-flex items-center gap-2 rounded-xl border border-black bg-white px-4 py-2 text-sm font-semibold text-black transition"
            >
              <FileSpreadsheet className="h-4 w-4" /> Export Excel
            </button>
          </div>
        </div>

        {/* Printable surface */}
        <div
          ref={printRef}
          id="report-print-area"
          className={`mx-auto rounded-lg border border-zinc-300 bg-white text-black shadow-sm ${
            isIncomeStatement || isBalanceSheet || isCashFlowStatement ? "max-w-3xl" : "max-w-5xl"
          }`}
          style={{ pageBreakInside: "avoid" }}
        >
          {isIncomeStatement && statementData ? (
            <div
              className="px-10 py-9 text-slate-900"
              style={{ fontFamily: "Calibri, 'Segoe UI', Arial, sans-serif" }}
            >
              <div className="text-center leading-tight">
                <h1 className="text-[30px] font-semibold">{companyInfo?.name || "Business Name"}</h1>
                {companyInfo?.manager && <p className="text-[12px] italic text-slate-500">{companyInfo.manager}</p>}
                {companyInfo?.phone && <p className="text-[12px] italic text-slate-500">{companyInfo.phone}</p>}
                <h2 className="mt-6 text-[38px] font-semibold">Profit &amp; Loss Statement</h2>
                {periodLabel && <p className="text-[13px] italic text-slate-600">{periodLabel}</p>}
              </div>

              <div className="mx-auto mt-9 max-w-2xl space-y-8 text-[14px]">
                <section>
                  <h3 className="mb-3 inline-block border-b border-slate-700 pb-0.5 text-[34px] font-semibold leading-none">
                    Income
                  </h3>
                  <div className="space-y-1.5">
                    {statementData.incomeLines.map((row, index) => (
                      <div key={`${row.lineItem}-${index}`} className="flex items-start justify-between gap-4">
                        <span>{row.lineItem}</span>
                        <span className="tabular-nums">{formatStatementCurrency(row.amount)}</span>
                      </div>
                    ))}
                    {statementData.incomeLines.length === 0 && (
                      <div className="flex items-start justify-between gap-4 text-slate-500">
                        <span>No income lines</span>
                        <span className="tabular-nums">$0.00</span>
                      </div>
                    )}
                  </div>
                  <div className="mt-3 flex justify-between border-b border-t border-slate-300 py-1.5 text-[16px] font-semibold">
                    <span>Total Income</span>
                    <span className="tabular-nums">{formatStatementCurrency(statementData.incomeTotal)}</span>
                  </div>
                </section>

                <section>
                  <h3 className="mb-3 inline-block border-b border-slate-700 pb-0.5 text-[34px] font-semibold leading-none">
                    Expenses
                  </h3>
                  <div className="space-y-1.5">
                    {statementData.expenseLines.map((row, index) => (
                      <div key={`${row.lineItem}-${index}`} className="flex items-start justify-between gap-4">
                        <span>{row.lineItem}</span>
                        <span className="tabular-nums">{formatStatementCurrency(Math.abs(row.amount))}</span>
                      </div>
                    ))}
                    {statementData.expenseLines.length === 0 && (
                      <div className="flex items-start justify-between gap-4 text-slate-500">
                        <span>No expense lines</span>
                        <span className="tabular-nums">$0.00</span>
                      </div>
                    )}
                  </div>
                  <div className="mt-3 flex justify-between border-b border-t border-slate-300 py-1.5 text-[16px] font-semibold">
                    <span>Total Expenses</span>
                    <span className="tabular-nums">{formatStatementCurrency(statementData.expensesTotal)}</span>
                  </div>
                </section>

                <section className="pt-1">
                  <div className="flex justify-between border-t-2 border-slate-900 pt-2 text-[28px] font-semibold leading-tight">
                    <span>Profit / (Loss)</span>
                    <span className="tabular-nums border-b-2 border-slate-900">
                      {formatStatementCurrency(statementData.netProfit)}
                    </span>
                  </div>
                </section>
              </div>
            </div>
          ) : isBalanceSheet && balanceSheetData ? (
            <div
              className="px-10 py-9 text-slate-900"
              style={{ fontFamily: "Calibri, 'Segoe UI', Arial, sans-serif" }}
            >
              <div className="space-y-0.5">
                <h2 className="text-[40px] font-semibold leading-none text-black">Balance Sheet</h2>
                <p className="text-[14px] text-slate-500">{companyInfo?.name || "Business Name"}</p>
                <p className="text-[14px] text-slate-500">{balanceSheetDateLabel || `As of ${reportDate}`}</p>
              </div>

              <div className="mx-auto mt-9 max-w-2xl space-y-8 text-[15px]">
                <section>
                  <div className="mb-2 flex items-end justify-between border-b-2 border-zinc-300 pb-1 text-black">
                    <h3 className="text-[31px] font-semibold leading-none">Assets</h3>
                    <span className="text-[13px] font-semibold">{balanceSheetShortDate}</span>
                  </div>
                  <div className="mb-1 text-[16px] font-semibold text-slate-700">Current Assets</div>
                  <div className="space-y-0.5">
                    {balanceSheetData.assets.map((row, index) => (
                      <div key={`${row.lineItem}-${index}`} className="flex justify-between gap-4 border-b border-slate-200 py-1.5">
                        <span>{row.lineItem}</span>
                        <span className="tabular-nums">{formatStatementCurrency(row.amount)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex justify-between border-b border-slate-200 py-1.5 text-[16px] font-semibold">
                    <span>Total Current Assets</span>
                    <span className="tabular-nums">{formatStatementCurrency(balanceSheetData.currentAssetsTotal)}</span>
                  </div>
                  <div className="mt-5 flex justify-between border-t border-slate-300 pt-2 text-[18px] font-semibold">
                    <span>Total Assets</span>
                    <span className="tabular-nums">{formatStatementCurrency(balanceSheetData.totalAssets)}</span>
                  </div>
                </section>

                <section>
                  <div className="mb-2 flex items-end justify-between border-b-2 border-zinc-300 pb-1 text-black">
                    <h3 className="text-[31px] font-semibold leading-none">Liabilities + Equity</h3>
                    <span className="text-[13px] font-semibold">{balanceSheetShortDate}</span>
                  </div>
                  <div className="mb-1 text-[16px] font-semibold text-slate-700">Current Liabilities</div>
                  <div className="space-y-0.5">
                    {balanceSheetData.liabilities.map((row, index) => (
                      <div key={`${row.lineItem}-${index}`} className="flex justify-between gap-4 border-b border-slate-200 py-1.5">
                        <span>{row.lineItem}</span>
                        <span className="tabular-nums">{formatStatementCurrency(row.amount)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex justify-between border-b border-slate-200 py-1.5 text-[16px] font-semibold">
                    <span>Total Current Liabilities</span>
                    <span className="tabular-nums">{formatStatementCurrency(balanceSheetData.currentLiabilitiesTotal)}</span>
                  </div>
                </section>

                <section>
                  <div className="mb-1 text-[16px] font-semibold text-slate-700">Equity</div>
                  <div className="space-y-0.5">
                    {(balanceSheetData.equity.length
                      ? balanceSheetData.equity
                      : [{ lineItem: "Retained Earnings", amount: balanceSheetData.retainedEarnings }]
                    ).map((row, index) => (
                      <div key={`${row.lineItem}-${index}`} className="flex justify-between gap-4 border-b border-slate-200 py-1.5">
                        <span>{row.lineItem}</span>
                        <span className="tabular-nums">{formatStatementCurrency(row.amount)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex justify-between border-b border-slate-200 py-1.5 text-[16px] font-semibold">
                    <span>Total Equity</span>
                    <span className="tabular-nums">{formatStatementCurrency(balanceSheetData.totalEquity)}</span>
                  </div>
                </section>

                <section className="pt-1">
                  <div className="flex justify-between border-t border-slate-300 pt-3 text-[18px] font-semibold leading-tight">
                    <span>Total Liabilities + Equity</span>
                    <span className="tabular-nums">{formatStatementCurrency(balanceSheetData.totalLiabilitiesEquity)}</span>
                  </div>
                  <div className="mt-2 flex justify-between text-[14px] text-black">
                    <span>Balance Check</span>
                    <span className="tabular-nums">{formatStatementCurrency(balanceSheetData.balanceDelta)}</span>
                  </div>
                </section>
              </div>
            </div>
          ) : isCashFlowStatement && cashFlowData ? (
            <div
              className="overflow-hidden rounded-[24px] border border-zinc-300 bg-white text-slate-900"
              style={{ fontFamily: "Calibri, 'Segoe UI', Arial, sans-serif" }}
            >
              <div className="bg-black px-8 py-6 text-center text-white">
                <h2 className="text-[47px] font-semibold leading-tight">Cash Flow Statement</h2>
                {cashFlowPeriodLabel && <p className="mt-1 text-[16px]">{cashFlowPeriodLabel}</p>}
              </div>
              <div className="h-2 bg-zinc-200" />

              <div className="bg-white px-0 py-0">
                {cashFlowData.sections.map((section) => (
                  <section key={section.section} className="border-b border-slate-200">
                    <div className="bg-zinc-100 px-6 py-2 text-[16px] font-semibold text-black">{section.section}</div>
                    <table className="w-full border-collapse">
                      <tbody>
                        {section.rows.map((row, index) => (
                          <tr key={`${section.section}-${row.lineItem}-${index}`}>
                            <td
                              className={`border-b border-slate-100 px-6 py-2 text-[15px] ${
                                row.rowType === "total" ? "bg-zinc-100 font-semibold" : "bg-white"
                              }`}
                            >
                              {row.lineItem}
                            </td>
                            <td
                              className={`w-44 border-b border-slate-100 px-6 py-2 text-right text-[15px] tabular-nums ${
                                row.rowType === "total" ? "bg-zinc-100 font-semibold" : "bg-white"
                              }`}
                            >
                              {formatStatementAmount(row.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                ))}

                {cashFlowData.summaryRows.length > 0 && (
                  <div className="space-y-2 px-6 py-4">
                    {cashFlowData.summaryRows.map((row, index) => {
                      const isMainTotal = /net increase in cash/i.test(row.lineItem);
                      return (
                        <div
                          key={`summary-${row.lineItem}-${index}`}
                          className={`flex items-center justify-between rounded-sm px-4 py-2 text-[15px] ${
                            isMainTotal
                              ? "bg-black font-semibold text-white"
                              : "bg-zinc-100 font-semibold text-slate-900"
                          }`}
                        >
                          <span>{row.lineItem}</span>
                          <span className="tabular-nums">{formatStatementAmount(row.amount)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
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
                              background: "#ffffff",
                              color: "#000000",
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
                      {tableTotals && (
                        <tr>
                          {columns.map((col, index) => {
                            const columnKey = String(col.key);
                            const isFirstColumn = index === 0;
                            const value = isFirstColumn ? tableTotals.label || "Total" : tableTotals.values[columnKey] ?? "";
                            return (
                              <td
                                key={`total-${col.header}`}
                                style={{
                                  border: `1px solid ${BORDER_COLOR}`,
                                  padding: "9px 6px",
                                  textAlign: isFirstColumn ? "left" : col.align ?? "left",
                                  fontSize: "12px",
                                  lineHeight: 1.4,
                                  background: "#111111",
                                  color: "#ffffff",
                                  fontWeight: 700,
                                }}
                              >
                                {String(value)}
                              </td>
                            );
                          })}
                        </tr>
                      )}
                      {data.length === 0 && !tableTotals && (
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

                {totals.length > 0 && (
                  <div className="mt-4 rounded-md border border-zinc-300 bg-white p-3">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-zinc-300 pb-2">
                      <div className="text-xs font-bold uppercase tracking-[0.2em] text-black">Totals Summary</div>
                      <div className="text-xs font-semibold text-zinc-700">Records: {data.length.toLocaleString()}</div>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      {totals.map((item) => (
                        <div
                          key={item.label}
                          className="rounded border border-zinc-300 bg-white px-3 py-2 text-sm"
                        >
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-700">{item.label}</div>
                          <div className="text-base font-bold text-black">{item.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

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
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
