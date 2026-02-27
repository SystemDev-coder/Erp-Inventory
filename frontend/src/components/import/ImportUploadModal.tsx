import { useEffect, useState } from 'react';
import { Modal } from '../ui/modal/Modal';
import {
  importService,
  ImportSummary,
  ImportType,
  PreviewRow,
} from '../../services/import.service';
import { useToast } from '../ui/toast/Toast';

type ImportUploadModalProps = {
  isOpen: boolean;
  onClose: () => void;
  importType: ImportType;
  title: string;
  columns: string[];
  templateHeaders: string[];
  onImported?: () => void | Promise<void>;
};

const escapeCsv = (value: unknown) => {
  const text = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
};

const downloadBlob = (filename: string, content: string, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(href);
};

const formatCell = (value: unknown) => {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
};

const statusBadgeClass = (status: PreviewRow['status']) => {
  if (status === 'valid') {
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300';
  }
  if (status === 'failed') {
    return 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300';
  }
  return 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300';
};

const ImportUploadModal = ({
  isOpen,
  onClose,
  importType,
  title,
  columns,
  templateHeaders,
  onImported,
}: ImportUploadModalProps) => {
  const { showToast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setFile(null);
      setLoading(false);
      setSummary(null);
      setShowPreview(false);
    }
  }, [isOpen]);

  const ensureFile = () => {
    if (file) return true;
    showToast('error', 'Import', 'Please select a file first');
    return false;
  };

  const runCheck = async () => {
    if (!ensureFile()) return;
    setLoading(true);
    const response = await importService.preview(importType, file as File);
    setLoading(false);
    if (response.success && response.data) {
      setSummary(response.data);
      setShowPreview(false);
      showToast('success', 'Check complete', 'Validation finished. You can preview or import valid rows.');
      return;
    }
    showToast('error', 'Check failed', response.error || response.message || 'Could not validate file');
  };

  const runPreview = async () => {
    if (!ensureFile()) return;
    if (!summary) {
      await runCheck();
    }
    setShowPreview(true);
  };

  const runImport = async () => {
    if (!ensureFile()) return;
    setLoading(true);
    const response = await importService.import(importType, file as File);
    setLoading(false);
    if (response.success && response.data) {
      if (onImported) await onImported();
      onClose();
      showToast(
        'success',
        'Import completed',
        `Inserted ${response.data.inserted_count}, skipped ${response.data.skipped_count}, failed ${response.data.failed_count}`
      );
      return;
    }
    showToast('error', 'Import failed', response.error || response.message || 'Could not import file');
  };

  const downloadTemplate = () => {
    const csv = `${templateHeaders.join(',')}\n`;
    downloadBlob(
      `${importType}-import-template.csv`,
      csv,
      'text/csv;charset=utf-8'
    );
  };

  const downloadErrorReport = (format: 'csv' | 'json') => {
    if (!summary) return;
    const rows = [
      ...summary.failed_rows.map((row) => ({
        row: row.row,
        status: 'failed',
        message: row.errors.join('; '),
        raw: row.raw,
      })),
      ...summary.skipped_rows.map((row) => ({
        row: row.row,
        status: 'skipped',
        message: row.reason,
        raw: row.raw,
      })),
    ];
    if (!rows.length) {
      showToast('info', 'Error report', 'There are no skipped or failed rows');
      return;
    }
    if (format === 'json') {
      downloadBlob(
        `${importType}-import-errors.json`,
        JSON.stringify(rows, null, 2),
        'application/json;charset=utf-8'
      );
      return;
    }
    const csvLines = [
      ['row', 'status', 'message', 'raw_json'].join(','),
      ...rows.map((row) =>
        [row.row, row.status, escapeCsv(row.message), escapeCsv(JSON.stringify(row.raw))].join(',')
      ),
    ];
    downloadBlob(
      `${importType}-import-errors.csv`,
      csvLines.join('\n'),
      'text/csv;charset=utf-8'
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size={summary || showPreview ? '2xl' : 'md'}
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <input
              type="file"
              accept=".xlsx,.csv"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
              className="max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            />
            <button
              type="button"
              onClick={downloadTemplate}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold dark:border-slate-700"
            >
              Download Template
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!file || loading}
              onClick={() => void runCheck()}
              className="rounded-lg border border-primary-300 px-3 py-2 text-sm font-semibold text-primary-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-primary-500/40 dark:text-primary-300"
            >
              {loading ? 'Working...' : 'Check'}
            </button>
            <button
              type="button"
              disabled={!file || loading}
              onClick={() => void runPreview()}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700"
            >
              Preview
            </button>
            <button
              type="button"
              disabled={!file || loading}
              onClick={() => void runImport()}
              className="rounded-lg bg-primary-600 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              Import Data
            </button>
          </div>
        </div>

        {summary && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <p className="text-xs text-slate-500">Total Rows</p>
                <p className="text-lg font-semibold text-slate-900 dark:text-white">{summary.total_rows}</p>
              </div>
              <div className="rounded-lg border border-emerald-200 p-3 dark:border-emerald-500/30">
                <p className="text-xs text-emerald-700 dark:text-emerald-300">Inserted</p>
                <p className="text-lg font-semibold text-emerald-700 dark:text-emerald-300">{summary.inserted_count}</p>
              </div>
              <div className="rounded-lg border border-amber-200 p-3 dark:border-amber-500/30">
                <p className="text-xs text-amber-700 dark:text-amber-300">Skipped</p>
                <p className="text-lg font-semibold text-amber-700 dark:text-amber-300">{summary.skipped_count}</p>
              </div>
              <div className="rounded-lg border border-rose-200 p-3 dark:border-rose-500/30">
                <p className="text-xs text-rose-700 dark:text-rose-300">Failed</p>
                <p className="text-lg font-semibold text-rose-700 dark:text-rose-300">{summary.failed_count}</p>
              </div>
            </div>

            {(summary.failed_rows.length > 0 || summary.skipped_rows.length > 0) && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Download Error Report:</span>
                <button
                  type="button"
                  onClick={() => downloadErrorReport('csv')}
                  className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-semibold dark:border-slate-700"
                >
                  CSV
                </button>
                <button
                  type="button"
                  onClick={() => downloadErrorReport('json')}
                  className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-semibold dark:border-slate-700"
                >
                  JSON
                </button>
              </div>
            )}
          </div>
        )}

        {showPreview && summary?.preview_rows?.length ? (
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <h4 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">
              Preview (first {summary.preview_rows.length} rows)
            </h4>
            <div className="overflow-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Row</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                    {columns.map((column) => (
                      <th key={column} className="px-3 py-2 font-semibold">{column}</th>
                    ))}
                    <th className="px-3 py-2 font-semibold">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.preview_rows.map((row) => (
                    <tr key={row.row} className="border-t border-slate-200 dark:border-slate-700">
                      <td className="px-3 py-2 align-top">{row.row}</td>
                      <td className="px-3 py-2 align-top">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusBadgeClass(row.status)}`}>
                          {row.status}
                        </span>
                      </td>
                      {columns.map((column) => (
                        <td key={`${row.row}-${column}`} className="px-3 py-2 align-top">
                          {formatCell(row.data[column])}
                        </td>
                      ))}
                      <td className="px-3 py-2 align-top">
                        {row.errors.length ? row.errors.join('; ') : row.skip_reason || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
};

export default ImportUploadModal;
