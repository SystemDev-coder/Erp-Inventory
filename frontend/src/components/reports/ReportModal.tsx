import React, { useMemo, useRef } from "react";
import { FileSpreadsheet, Printer } from "lucide-react";
import { Modal } from "../ui/modal/Modal";

const BORDER_COLOR = "#0f172a";
const REPORT_SCREEN_MAX_WIDTH = "1120px";

// Column and props definitions
export type ReportColumn<T> = {
  key: keyof T | string;
  header: string;
  width?: string;
  align?: "left" | "center" | "right";
  render?: (row: T, index: number) => React.ReactNode;
  getHref?: (row: T, index: number) => string | null | undefined;
  onClick?: (row: T, index: number) => void;
};

export type ReportTotalItem = {
  label: string;
  value: string | number;
  href?: string;
  onClick?: () => void;
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
    logoUrl?: string;
    bannerUrl?: string;
    manager?: string;
    phone?: string;
    updatedAt?: string;
  };
  data: T[];
  columns: ReportColumn<T>[];
  filters?: Record<string, string | number>;
  totals?: ReportTotalItem[];
  tableTotals?: ReportTableTotals;
  variant?: "default" | "income-statement" | "balance-sheet" | "cash-flow-statement" | "trial-balance";
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

const formatTrialAmount = (value: number) =>
  Math.abs(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const resolveSortKey = <T,>(columns: ReportColumn<T>[]) => {
  const matchesIdKey = (value: string) =>
    value === "id" || value.endsWith("_id") || value.endsWith("_no") || value.endsWith("_number");
  const headerHasHash = (value: string) => value.includes("#");

  const match = columns.find((col) => {
    const key = String(col.key || "").toLowerCase();
    return matchesIdKey(key) || headerHasHash(col.header);
  });

  return match ? String(match.key) : null;
};

const parseSortableNumber = (value: unknown) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  const raw = String(value).trim();
  if (!raw) return null;
  const direct = Number(raw);
  if (!Number.isNaN(direct)) return direct;
  const match = raw.match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isNaN(parsed) ? null : parsed;
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
  const isTrialBalance = variant === "trial-balance";
  const reportSurfaceWidth = REPORT_SCREEN_MAX_WIDTH;

  const tableRows = useMemo(() => {
    if (isIncomeStatement || isBalanceSheet || isCashFlowStatement || isTrialBalance) return data;
    if (!data || data.length === 0) return data;
    const sortKey = resolveSortKey(columns);
    if (!sortKey) return data;

    const sorted = [...data].sort((a, b) => {
      const aValue = parseSortableNumber((a as Record<string, unknown>)[sortKey]);
      const bValue = parseSortableNumber((b as Record<string, unknown>)[sortKey]);
      if (aValue === null && bValue === null) {
        const aText = String((a as Record<string, unknown>)[sortKey] ?? "");
        const bText = String((b as Record<string, unknown>)[sortKey] ?? "");
        return aText.localeCompare(bText, undefined, { numeric: true });
      }
      if (aValue === null) return 1;
      if (bValue === null) return -1;
      return aValue - bValue;
    });

    return sorted;
  }, [data, columns, isIncomeStatement, isBalanceSheet, isCashFlowStatement, isTrialBalance]);

  const statementData = useMemo(() => {
    if (!isIncomeStatement) return null;

    const rows = data.map((row) => ({
      section: String((row as Record<string, unknown>).section || ""),
      lineItem: String((row as Record<string, unknown>).line_item || ""),
      amount: Number((row as Record<string, unknown>).amount || 0),
      rowType: String((row as Record<string, unknown>).row_type || ""),
    }));

    const sectionOrder: string[] = [];
    rows.forEach((row) => {
      const key = row.section.trim();
      if (key && !sectionOrder.includes(key)) {
        sectionOrder.push(key);
      }
    });

    const sections = sectionOrder
      .map((name) => {
        const sectionRows = rows.filter((row) => row.section === name);
        const detailRows = sectionRows.filter((row) => row.rowType === "detail");
        const totalRow = sectionRows.find((row) => row.rowType === "total");
        return { name, detailRows, totalRow };
      })
      .filter((section) => section.name.toLowerCase() !== "net income");

    const netResultRow =
      rows.find((row) => /(net income|net profit|net loss)/i.test(row.lineItem)) ||
      rows.find((row) => row.section.toLowerCase() === "net income" && row.rowType === "total");

    const totalIncome = sections
      .filter((section) => section.name.toLowerCase().includes("revenue"))
      .reduce((sum, section) => sum + Number(section.totalRow?.amount || 0), 0);

    const totalExpenses = sections
      .filter((section) => {
        const key = section.name.toLowerCase();
        return key.includes("expense") || key.includes("cost");
      })
      .reduce((sum, section) => {
        const value = Number(section.totalRow?.amount || 0);
        return sum + Math.abs(value);
      }, 0);

    const netProfit =
      Number(netResultRow?.amount || 0) ||
      totalIncome - totalExpenses;

    return {
      sections,
      netResultRow,
      totalIncome,
      totalExpenses,
      netProfit,
    };
  }, [isIncomeStatement, data]);

  const balanceSheetData = useMemo(() => {
    if (!isBalanceSheet) return null;

    const normalizeSection = (value: string) =>
      value
        .toLowerCase()
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const rows = data.map((row) => ({
      section: String((row as Record<string, unknown>).section || ""),
      lineItem: String((row as Record<string, unknown>).line_item || ""),
      amount: Number((row as Record<string, unknown>).amount || 0),
      rowType: String((row as Record<string, unknown>).row_type || ""),
    }));

    const detailRows = rows.filter((row) => row.rowType === "detail");
    const totalRows = rows.filter((row) => row.rowType === "total");

    const bySection = (sectionKeys: string[], rowType: "detail" | "total") => {
      const source = rowType === "detail" ? detailRows : totalRows;
      return source.filter((row) => sectionKeys.includes(normalizeSection(row.section)));
    };

    const sumAmount = (sourceRows: Array<{ amount: number }>) =>
      sourceRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);

    const currentAssets = rows.filter(
      (row) =>
        normalizeSection(row.section) === "current assets" &&
        row.rowType === "detail"
    );
    const nonCurrentAssets = rows.filter(
      (row) =>
        ["non current assets", "fixed assets"].includes(normalizeSection(row.section)) &&
        row.rowType === "detail"
    );
    const currentLiabilities = rows.filter(
      (row) =>
        normalizeSection(row.section) === "current liabilities" &&
        row.rowType === "detail"
    );
    const nonCurrentLiabilities = rows.filter(
      (row) => normalizeSection(row.section) === "non current liabilities" && row.rowType === "detail"
    );
    const equity = rows.filter(
      (row) =>
        normalizeSection(row.section) === "equity" &&
        row.rowType === "detail"
    );

    const currentAssetsTotalRow = bySection(["current assets"], "total").find((row) =>
      row.lineItem.toLowerCase().includes("total current assets")
    );
    const currentLiabilitiesTotalRow = bySection(["current liabilities"], "total").find((row) =>
      row.lineItem.toLowerCase().includes("total current liabilities")
    );

    const totalAssetsRow = totalRows.find(
      (row) =>
        row.lineItem.toLowerCase().includes("total assets") &&
        !row.lineItem.toLowerCase().includes("current")
    );
    const totalLiabilitiesRow = totalRows.find(
      (row) =>
        row.lineItem.toLowerCase().includes("total liabilities") &&
        !row.lineItem.toLowerCase().includes("+")
    );
    const totalEquityRow = totalRows.find((row) => {
      const key = row.lineItem.toLowerCase();
      return key.includes("retained equity") || key.includes("total equity") || key.includes("total owners equity");
    });
    const retainedEarningsRow = detailRows.find((row) => row.lineItem.toLowerCase().includes("retained earnings"));
    const netResultRow = detailRows.find((row) =>
      /(net profit|net loss|net income)/i.test(row.lineItem)
    );
    const totalLiabilitiesEquityRow = totalRows.find((row) => {
      const key = row.lineItem.toLowerCase();
      return key.includes("total liabilities + equity") || key.includes("total liabilities + owners equity");
    });

    const currentAssetsTotal =
      currentAssetsTotalRow?.amount ?? sumAmount(currentAssets);
    const nonCurrentAssetsTotal =
      totalRows.find((row) => {
        const key = row.lineItem.toLowerCase();
        return key.includes("total non-current assets") || key.includes("total fixed assets");
      })?.amount ??
      sumAmount(nonCurrentAssets);
    const currentLiabilitiesTotal =
      currentLiabilitiesTotalRow?.amount ?? sumAmount(currentLiabilities);
    const nonCurrentLiabilitiesTotal =
      totalRows.find((row) => row.lineItem.toLowerCase().includes("total non-current liabilities"))?.amount ??
      sumAmount(nonCurrentLiabilities);
    const totalAssets = totalAssetsRow?.amount ?? currentAssetsTotal + nonCurrentAssetsTotal;
    const totalLiabilities = totalLiabilitiesRow?.amount ?? currentLiabilitiesTotal + nonCurrentLiabilitiesTotal;
    const equityDetailTotal = sumAmount(equity);
    const totalEquity =
      totalEquityRow?.amount ??
      (equity.length > 0 ? equityDetailTotal : (totalLiabilitiesEquityRow?.amount ?? totalAssets) - totalLiabilities);
    const totalLiabilitiesEquity = totalLiabilitiesEquityRow?.amount ?? totalLiabilities + totalEquity;
    const netResultAmount = netResultRow?.amount ?? totalEquity;
    const retainedEarnings = retainedEarningsRow?.amount ?? netResultAmount;
    const balanceDelta = totalAssets - totalLiabilitiesEquity;

    return {
      currentAssets,
      nonCurrentAssets,
      currentLiabilities,
      nonCurrentLiabilities,
      equity,
      currentAssetsTotal,
      nonCurrentAssetsTotal,
      currentLiabilitiesTotal,
      nonCurrentLiabilitiesTotal,
      totalAssets,
      totalLiabilities,
      totalEquity,
      totalLiabilitiesEquity,
      retainedEarnings,
      balanceDelta,
    };
  }, [isBalanceSheet, data]);

  const trialBalanceData = useMemo(() => {
    if (!isTrialBalance) return null;

    const rows = data.map((row) => ({
      accountName: String((row as Record<string, unknown>).account_name || ""),
      closingDebit: Number((row as Record<string, unknown>).closing_debit || 0),
      closingCredit: Number((row as Record<string, unknown>).closing_credit || 0),
    }));

    const totalClosingDebit = rows.reduce((sum, row) => sum + row.closingDebit, 0);
    const totalClosingCredit = rows.reduce((sum, row) => sum + row.closingCredit, 0);
    const difference = totalClosingDebit - totalClosingCredit;

    return {
      rows,
      totals: {
        totalClosingDebit,
        totalClosingCredit,
        difference,
        balanced: Math.abs(difference) <= 0.005,
      },
    };
  }, [isTrialBalance, data]);

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
        `<!doctype html><html><head><base href="${escapeHtml(document.baseURI)}" /><title></title>${styles}<style>
         @page { size: A4 landscape; margin: 8mm; }
         body { margin: 0; padding: 0; background: #ffffff; color: #0f172a; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
         #report-print-area { width: 100% !important; max-width: none !important; margin: 0 auto !important; box-shadow: none !important; border: none !important; border-radius: 0 !important; overflow: visible !important; break-inside: auto !important; page-break-inside: auto !important; }
         #report-print-area .overflow-x-auto { overflow: visible !important; }
         #report-print-area table { width: 100% !important; table-layout: fixed; }
         #report-print-area th, #report-print-area td { font-size: 11px !important; padding: 6px 6px !important; word-break: break-word; white-space: normal; }
         #report-print-area .report-letterhead-banner { height: 32mm !important; width: 100% !important; object-fit: cover !important; object-position: center !important; }
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
    const bodyRows = tableRows
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
    <Modal isOpen={isOpen} onClose={onClose} title="Report Preview" size="2xl" resizable centerTitle>
      <div className="space-y-4">
        {/* Screen controls (hidden on print) */}
        <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3 rounded-2xl border border-slate-200 bg-white px-6 py-4 text-black shadow-sm print:hidden dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
            {enablePdf && !isIncomeStatement && !isBalanceSheet && (
              <button
                onClick={handlePrint}
                className="inline-flex items-center gap-2 rounded-xl border border-black bg-white px-4 py-2 text-sm font-semibold text-black transition dark:border-slate-200 dark:bg-slate-900 dark:text-slate-100"
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
              className="inline-flex items-center gap-2 rounded-xl border border-black bg-white px-4 py-2 text-sm font-semibold text-black transition dark:border-slate-200 dark:bg-slate-900 dark:text-slate-100"
            >
              <FileSpreadsheet className="h-4 w-4" /> Export Excel
            </button>
        </div>

        {/* Printable surface */}
        <div
          ref={printRef}
          id="report-print-area"
          className="mx-auto overflow-hidden rounded-2xl border border-zinc-200 bg-white text-black shadow-sm"
          style={{ width: "100%", maxWidth: reportSurfaceWidth }}
        >
          <div className="border-b border-zinc-300" style={{ fontFamily: "Calibri, 'Segoe UI', Arial, sans-serif" }}>
            {companyInfo?.bannerUrl ? (
              <div className="w-full bg-white">
                <img
                  src={companyInfo.bannerUrl}
                  alt={`${companyInfo?.name || "Company"} banner`}
                  className="report-letterhead-banner block w-full bg-white"
                  style={{ height: "140px", width: "100%", objectFit: "cover", objectPosition: "center" }}
                />
                <div
                  aria-hidden="true"
                  className="h-[2px]"
                  style={{ background: "linear-gradient(90deg, #0f172a 0%, #f59e0b 50%, #0f172a 100%)" }}
                />
              </div>
            ) : null}

            <div className="px-6 pb-5 pt-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-[220px] items-center gap-3">
                  {!companyInfo?.bannerUrl && companyInfo?.logoUrl ? (
                    <img src={companyInfo.logoUrl} alt="Logo" className="h-10 w-10 object-contain" />
                  ) : null}
                  <div className="space-y-0.5">
                    <div className="text-[16px] font-semibold leading-tight">{companyInfo?.name || "Business Name"}</div>
                    <div className="text-[12px] text-slate-600">
                      {title}
                      {subtitle ? ` — ${subtitle}` : ""}
                    </div>
                    {companyInfo?.manager || companyInfo?.phone ? (
                      <div className="text-[11px] text-slate-500">
                        <span>Manager: {companyInfo.manager || "-"}</span> <span className="mx-1">·</span>
                        <span>Phone: {companyInfo.phone || "-"}</span>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="min-w-[160px] text-right text-[11px] text-slate-500">
                  <div>Print Date: {formatStatementDate(reportDate)}</div>
                  {companyInfo?.updatedAt ? <div>Updated: {companyInfo.updatedAt}</div> : null}
                </div>
              </div>
            </div>
          </div>
          {isIncomeStatement && statementData ? (
            <div
              className="px-10 py-9 text-slate-900"
              style={{ fontFamily: "Calibri, 'Segoe UI', Arial, sans-serif" }}
            >
              {!companyInfo?.bannerUrl ? (
                <div className="space-y-0.5 leading-tight">
                  <h2 className="text-[14px] font-bold leading-none text-[#1164a1]">Income Statement</h2>
                  <p className="text-[14px] text-slate-500">{companyInfo?.name || "Business Name"}</p>
                  <p className="text-[14px] text-slate-500">{periodLabel || subtitle || ""}</p>
                </div>
              ) : null}

              <div className="mx-auto mt-9 max-w-2xl space-y-6 text-[15px]">
                {statementData.sections.map((section, sectionIndex) => (
                  <section key={`${section.name}-${sectionIndex}`}>
                    <div className="mb-2 border-b-2 border-[#2c90c8] pb-1">
                      <h3 className="text-[14px] font-bold leading-none text-[#1164a1]">{section.name}</h3>
                    </div>
                    <div className="space-y-0.5">
                      {section.detailRows.map((row, index) => (
                        <div key={`${section.name}-${row.lineItem}-${index}`} className="flex justify-between gap-4 border-b border-slate-200 py-1.5">
                          <span>{row.lineItem}</span>
                          <span className="tabular-nums">{formatStatementCurrency(row.amount)}</span>
                        </div>
                      ))}
                    </div>
                    {section.totalRow && (
                      <div className="mt-2 flex justify-between border-b border-t border-slate-300 py-1.5 text-[16px] font-semibold">
                        <span>{section.totalRow.lineItem}</span>
                        <span className="tabular-nums">{formatStatementCurrency(section.totalRow.amount)}</span>
                      </div>
                    )}
                  </section>
                ))}

                <section className="pt-2">
                  <div className="flex justify-between border-t-2 border-slate-900 pt-2 text-[25px] font-semibold leading-tight">
                    <span>{statementData.netResultRow?.lineItem || "Net Profit / (Loss)"}</span>
                    <span className="tabular-nums border-b-2 border-slate-900">
                      {formatStatementCurrency(statementData.netProfit)}
                    </span>
                  </div>
                </section>
              </div>
            </div>
          ) : isBalanceSheet && balanceSheetData ? (
            <div
              className="px-8 py-8 text-slate-900"
              style={{ fontFamily: "Calibri, 'Segoe UI', Arial, sans-serif" }}
            >
              {!companyInfo?.bannerUrl ? (
                <div className="space-y-0.5 leading-tight">
                  <h2 className="text-[30px] font-semibold text-[#1976bc]">Balance Sheet</h2>
                  <p className="text-[15px] text-slate-500">{companyInfo?.name || "Business Name"}</p>
                  <p className="text-[14px] text-slate-500">{balanceSheetDateLabel || `As of ${reportDate}`}</p>
                </div>
              ) : (
                <div className="text-right text-[13px] font-semibold text-slate-600">{balanceSheetDateLabel || `As of ${reportDate}`}</div>
              )}

              <div className="mx-auto mt-8 max-w-3xl space-y-7 text-[14px]">
                <section>
                  <div className="mb-2 flex items-end justify-between border-b-2 border-[#2c90c8] pb-1 text-black">
                    <h3 className="text-[24px] font-semibold leading-none text-[#1e4f8f]">Assets</h3>
                    <span className="text-[13px] font-semibold text-slate-600">{balanceSheetShortDate}</span>
                  </div>
                  <div className="mb-1 text-[22px] font-semibold text-slate-700">Current Assets</div>
                  <div className="space-y-0.5">
                    {balanceSheetData.currentAssets.map((row, index) => (
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
                  {balanceSheetData.nonCurrentAssets.length > 0 && (
                    <>
                      <div className="mb-1 mt-5 text-[22px] font-semibold text-slate-700">Fixed Assets</div>
                      <div className="space-y-0.5">
                        {balanceSheetData.nonCurrentAssets.map((row, index) => (
                          <div key={`${row.lineItem}-${index}`} className="flex justify-between gap-4 border-b border-slate-200 py-1.5">
                            <span>{row.lineItem}</span>
                            <span className="tabular-nums">{formatStatementCurrency(row.amount)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 flex justify-between border-b border-slate-200 py-1.5 text-[16px] font-semibold">
                        <span>Total Fixed Assets</span>
                        <span className="tabular-nums">{formatStatementCurrency(balanceSheetData.nonCurrentAssetsTotal)}</span>
                      </div>
                    </>
                  )}
                  <div className="mt-5 flex justify-between border-t border-slate-300 pt-2 text-[20px] font-semibold">
                    <span>Total Assets</span>
                    <span className="tabular-nums">{formatStatementCurrency(balanceSheetData.totalAssets)}</span>
                  </div>
                </section>

                <section>
                  <div className="mb-2 flex items-end justify-between border-b-2 border-[#2c90c8] pb-1 text-black">
                    <h3 className="text-[24px] font-semibold leading-none text-[#1e4f8f]">Liabilities + Equity</h3>
                    <span className="text-[13px] font-semibold text-slate-600">{balanceSheetShortDate}</span>
                  </div>
                  <div className="mb-1 text-[22px] font-semibold text-slate-700">Current Liabilities</div>
                  <div className="space-y-0.5">
                    {balanceSheetData.currentLiabilities.map((row, index) => (
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
                  {balanceSheetData.nonCurrentLiabilities.length > 0 && (
                    <>
                      <div className="mb-1 mt-5 text-[22px] font-semibold text-slate-700">Non-Current Liabilities</div>
                      <div className="space-y-0.5">
                        {balanceSheetData.nonCurrentLiabilities.map((row, index) => (
                          <div key={`${row.lineItem}-${index}`} className="flex justify-between gap-4 border-b border-slate-200 py-1.5">
                            <span>{row.lineItem}</span>
                            <span className="tabular-nums">{formatStatementCurrency(row.amount)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 flex justify-between border-b border-slate-200 py-1.5 text-[16px] font-semibold">
                        <span>Total Non-Current Liabilities</span>
                        <span className="tabular-nums">{formatStatementCurrency(balanceSheetData.nonCurrentLiabilitiesTotal)}</span>
                      </div>
                    </>
                  )}
                </section>

                <section>
                  <div className="mb-1 text-[22px] font-semibold text-slate-700">Equity</div>
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
                    <span>Total Owners Equity</span>
                    <span className="tabular-nums">{formatStatementCurrency(balanceSheetData.totalEquity)}</span>
                  </div>
                </section>

                <section className="pt-1">
                  <div className="flex justify-between py-1.5 text-[16px] font-semibold">
                    <span>Total Liabilities</span>
                    <span className="tabular-nums">{formatStatementCurrency(balanceSheetData.totalLiabilities)}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-300 pt-3 text-[20px] font-semibold leading-tight">
                    <span>Total Liabilities + Owners Equity</span>
                    <span className="tabular-nums">{formatStatementCurrency(balanceSheetData.totalLiabilitiesEquity)}</span>
                  </div>
                  {Math.abs(balanceSheetData.balanceDelta) > 0.005 && (
                    <div className="mt-2 text-right text-[12px] font-semibold text-red-700">
                      Difference: {formatStatementCurrency(balanceSheetData.balanceDelta)}
                    </div>
                  )}
                </section>
              </div>
            </div>
          ) : isCashFlowStatement && cashFlowData ? (
            <div
              className="overflow-hidden rounded-[24px] border border-zinc-300 text-slate-900"
              style={{ fontFamily: "Calibri, 'Segoe UI', Arial, sans-serif" }}
            >
              {!companyInfo?.bannerUrl ? (
                <div className="border-b border-zinc-300 px-8 py-6 text-center text-slate-900">
                  <h2 className="text-[47px] font-semibold leading-tight">Cash Flow Statement</h2>
                  {cashFlowPeriodLabel && <p className="mt-1 text-[16px]">{cashFlowPeriodLabel}</p>}
                </div>
              ) : cashFlowPeriodLabel ? (
                <div className="border-b border-zinc-300 px-8 py-4 text-right text-[13px] font-semibold text-slate-600">
                  {cashFlowPeriodLabel}
                </div>
              ) : null}

              <div className="px-0 py-0">
                {cashFlowData.sections.map((section) => (
                  <section key={section.section} className="border-b border-slate-200">
                    <div className="px-6 py-2 text-[16px] font-semibold text-black">{section.section}</div>
                    <table className="w-full border-collapse">
                      <tbody>
                        {section.rows.map((row, index) => (
                          <tr key={`${section.section}-${row.lineItem}-${index}`}>
                            <td
                              className={`border-b border-slate-100 px-6 py-2 text-[15px] ${
                                row.rowType === "total" ? "font-semibold" : ""
                              }`}
                            >
                              {row.lineItem}
                            </td>
                            <td
                              className={`w-44 border-b border-slate-100 px-6 py-2 text-right text-[15px] tabular-nums ${
                                row.rowType === "total" ? "font-semibold" : ""
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
                          className={`flex items-center justify-between px-4 py-2 text-[15px] ${
                            isMainTotal
                              ? "border-t border-b border-slate-300 font-semibold text-slate-900"
                              : "border-b border-slate-200 font-semibold text-slate-900"
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
          ) : isTrialBalance && trialBalanceData ? (
            <div className="px-6 pb-6 pt-5 text-slate-900" style={{ fontFamily: "Calibri, 'Segoe UI', Arial, sans-serif" }}>
              {!companyInfo?.bannerUrl ? (
                <div className="mb-4 text-center">
                  <h2 className="text-[26px] font-semibold leading-tight">Trial Balance</h2>
                  <p className="text-[14px] text-slate-600">{subtitle || periodLabel || ""}</p>
                </div>
              ) : subtitle || periodLabel ? (
                <div className="mb-3 text-right text-[12px] font-semibold text-slate-600">{subtitle || periodLabel}</div>
              ) : null}

              <div className="overflow-hidden rounded-md">
                <table className="w-full border-collapse text-[12px]">
                  <thead>
                    <tr className="text-zinc-900">
                      <th className="border-b border-slate-300 px-2 py-2 text-left font-semibold">Particulars</th>
                      <th className="border-b border-slate-300 px-2 py-2 text-center font-semibold">Dr. Balance</th>
                      <th className="border-b border-slate-300 px-2 py-2 text-center font-semibold">Cr. Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trialBalanceData.rows.map((row, index) => (
                      <tr key={`${row.accountName}-${index}`}>
                        <td className="border-b border-slate-200 px-2 py-1.5">{row.accountName}</td>
                        <td className="border-b border-slate-200 px-2 py-1.5 text-right tabular-nums">
                          {row.closingDebit ? formatTrialAmount(row.closingDebit) : ""}
                        </td>
                        <td className="border-b border-slate-200 px-2 py-1.5 text-right tabular-nums">
                          {row.closingCredit ? formatTrialAmount(row.closingCredit) : ""}
                        </td>
                      </tr>
                    ))}
                    <tr className="font-bold text-slate-900">
                      <td className="border-t border-slate-300 px-2 py-2 text-center">
                        Total
                      </td>
                      <td className="border-t border-slate-300 px-2 py-2 text-right tabular-nums">
                        {formatTrialAmount(trialBalanceData.totals.totalClosingDebit)}
                      </td>
                      <td className="border-t border-slate-300 px-2 py-2 text-right tabular-nums">
                        {formatTrialAmount(trialBalanceData.totals.totalClosingCredit)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              {!trialBalanceData.totals.balanced && (
                <div className="mt-2 border border-red-200 px-3 py-2 text-[12px] font-semibold text-red-700">
                  Trial Balance is not balanced. Difference: {formatTrialAmount(trialBalanceData.totals.difference)}
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="px-6 pb-6 pt-6">
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
                              borderBottom: `1px solid ${BORDER_COLOR}`,
                              padding: "12px 10px",
                              textAlign: col.align ?? "left",
                              background: "#f8fafc",
                              color: "#0f172a",
                              fontWeight: 700,
                              fontSize: "13px",
                              width: col.width,
                            }}
                          >
                            {col.header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tableRows.map((row, i) => (
                        <tr key={i} style={{ background: i % 2 === 0 ? "#ffffff" : "#f8fafc" }}>
                          {columns.map((col) => (
                            <td
                              key={col.header}
                              style={{
                                borderBottom: "1px solid #d4d4d8",
                                padding: "10px 8px",
                                textAlign: col.align ?? "left",
                                fontSize: "13px",
                                lineHeight: 1.5,
                              }}
                            >
                              {(() => {
                                const cell = col.render ? col.render(row, i) : getRawValue(row, col, i);
                                const href = col.getHref?.(row, i);
                                if (href) {
                                  return (
                                    <a href={href} style={{ color: "#0f4f76", textDecoration: "underline" }}>
                                      {cell}
                                    </a>
                                  );
                                }
                                if (col.onClick) {
                                  return (
                                    <button
                                      type="button"
                                      onClick={() => col.onClick?.(row, i)}
                                      style={{ color: "#0f4f76", textDecoration: "underline" }}
                                    >
                                      {cell}
                                    </button>
                                  );
                                }
                                return cell;
                              })()}
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
                                  borderTop: `1px solid ${BORDER_COLOR}`,
                                  padding: "9px 6px",
                                  textAlign: isFirstColumn ? "left" : col.align ?? "left",
                                  fontSize: "12px",
                                  lineHeight: 1.4,
                                  background: "#f4f4f5",
                                  color: "#0f172a",
                                  fontWeight: 700,
                                }}
                              >
                                {String(value)}
                              </td>
                            );
                          })}
                        </tr>
                      )}
                      {tableRows.length === 0 && !tableTotals && (
                        <tr>
                          <td
                            colSpan={columns.length}
                            style={{ borderBottom: `1px solid ${BORDER_COLOR}`, padding: "16px", textAlign: "center", color: "#94a3b8" }}
                          >
                            No records to show.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {filters && Object.keys(filters).length > 0 && null}
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
