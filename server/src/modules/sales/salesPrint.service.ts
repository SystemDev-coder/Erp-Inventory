import fs from 'fs/promises';
import path from 'path';
import { queryOne } from '../../db/query';
import { ApiError } from '../../utils/ApiError';
import { BranchScope } from '../../utils/branchScope';
import { salesService } from './sales.service';

type CompanyRow = {
  company_name?: string | null;
  phone?: string | null;
  address?: string | null;
  logo_url?: string | null;
  banner_url?: string | null;
};

type CustomerRow = {
  full_name?: string | null;
  phone?: string | null;
  address?: string | null;
};

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const resolveAssetUrl = (baseUrl: string, value?: string | null) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('//')) return `https:${raw}`;
  if (raw.startsWith('/')) return `${baseUrl}${raw}`;
  return `${baseUrl}/${raw}`;
};

// Simple template renderer:
// - {{{key}}} inserts raw HTML (caller must pre-escape values).
// - {{key}} inserts HTML-escaped value.
const renderTemplate = (template: string, data: Record<string, string>) => {
  let out = template;
  out = out.replace(/\{\{\{\s*([a-zA-Z0-9_]+)\s*\}\}\}/g, (_m, key) => data[key] ?? '');
  out = out.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key) => escapeHtml(data[key] ?? ''));
  return out;
};

const formatMoney = (value: unknown) => {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '$0.00';
  return `$${n.toFixed(2)}`;
};

const formatQty = (value: unknown) => {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '0';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(3).replace(/0+$/g, '').replace(/\.$/, '');
};

let cachedTemplatesDir: string | null = null;

const resolveTemplatesDir = async () => {
  if (cachedTemplatesDir) return cachedTemplatesDir;

  const candidates = [
    process.env.PRINT_TEMPLATES_DIR,
    path.join(process.cwd(), 'templates'),
    // When the server runs with cwd = /app/server
    path.join(process.cwd(), '..', 'templates'),
    // Works for built output: dist/modules/sales -> repoRoot/templates
    path.resolve(__dirname, '..', '..', '..', '..', 'templates'),
  ].filter(Boolean) as string[];

  for (const dir of candidates) {
    try {
      await fs.access(path.join(dir, 'quotation-print.html'));
      cachedTemplatesDir = dir;
      return dir;
    } catch {
      // try next candidate
    }
  }

  // Final fallback: will still throw a clean error when reading.
  cachedTemplatesDir = path.join(process.cwd(), 'templates');
  return cachedTemplatesDir;
};

const readTemplate = async (fileName: string) => {
  const dir = await resolveTemplatesDir();
  try {
    return await fs.readFile(path.join(dir, fileName), 'utf8');
  } catch {
    throw ApiError.internal(`Print template missing: ${fileName}`);
  }
};

export const salesPrintService = {
  async renderSaleDocumentHtml(id: number, scope: BranchScope, baseUrl: string) {
    const sale = await salesService.getSale(id, scope);
    if (!sale) throw ApiError.notFound('Sale not found');

    const docType = (sale.doc_type || 'sale').toLowerCase();
    const isQuotation = docType === 'quotation';
    const isInvoice = docType === 'invoice' || docType === 'sale';

    // Validation (printing should be blocked if the doc is incomplete).
    if (!sale.customer_id) {
      throw ApiError.badRequest('Please select a customer before printing.');
    }

    const items = await salesService.listItems(id);
    if (!items.length) throw ApiError.badRequest('Cannot print: no items found for this document.');
    for (const line of items) {
      if (Number(line.quantity || 0) <= 0) throw ApiError.badRequest('Cannot print: quantity must be greater than 0.');
      if (Number(line.unit_price || 0) < 0) throw ApiError.badRequest('Cannot print: unit price cannot be negative.');
    }

    const totals = {
      subtotal: Number(sale.subtotal || 0),
      discount: Number(sale.discount || 0),
      tax: Number((sale as any).tax_amount || sale.tax_amount || 0),
      total: Number(sale.total || 0),
    };
    if (!Number.isFinite(totals.total)) throw ApiError.badRequest('Cannot print: totals are missing.');

    const company = await queryOne<CompanyRow>(
      `SELECT company_name, phone, address, logo_url, banner_url
         FROM ims.company
        WHERE company_id = 1
        LIMIT 1`
    );

    const customer = await queryOne<CustomerRow>(
      `SELECT full_name, phone, address
         FROM ims.customers
        WHERE customer_id = $1
        LIMIT 1`,
      [sale.customer_id]
    );

    const companyName = company?.company_name || 'My Inventory ERP';
    const companyPhone = company?.phone ? `Phone: ${company.phone}` : '';
    const companyManager = company?.address ? `Address: ${company.address}` : '';
    const logoUrl = resolveAssetUrl(baseUrl, company?.logo_url || null);
    const bannerUrl = resolveAssetUrl(baseUrl, company?.banner_url || null);

    const saleDate = sale.sale_date ? new Date(sale.sale_date).toLocaleDateString() : '';
    const validUntil = sale.quote_valid_until ? new Date(sale.quote_valid_until).toLocaleDateString() : '';
    const dueDateRaw = (sale as any).due_date || (sale as any).dueDate || null;
    const dueDate = dueDateRaw ? new Date(dueDateRaw).toLocaleDateString() : '-';

    const docNo = isQuotation ? `Q-${sale.sale_id}` : isInvoice ? `INV-${sale.sale_id}` : `S-${sale.sale_id}`;

    const bannerBlock = bannerUrl ? `<img class="banner" src="${escapeHtml(bannerUrl)}" alt="Banner" />` : '';
    const logoBlock = logoUrl ? `<img class="logo" src="${escapeHtml(logoUrl)}" alt="Logo" />` : '';

    const validUntilRow = isQuotation && validUntil ? `<div>Valid Until</div><div><b>${escapeHtml(validUntil)}</b></div>` : '';

    const statusKey = String(sale.status || '').toLowerCase();
    const statusClass = statusKey === 'paid' ? 'paid' : statusKey === 'partial' ? 'partial' : 'unpaid';
    const statusBadge = `<span class="status ${escapeHtml(statusClass)}">${escapeHtml(statusKey || 'unpaid')}</span>`;

    const paidAmount = Math.min(Number((sale as any).paid_amount || 0), totals.total);
    const balance = Math.max(totals.total - paidAmount, 0);
    const paidBlock = isQuotation ? '' : `<div class="tot-row"><span>Paid</span><strong>${escapeHtml(formatMoney(paidAmount))}</strong></div>`;
    const balanceBlock = isQuotation ? '' : `<div class="tot-row"><span>Balance</span><strong>${escapeHtml(formatMoney(balance))}</strong></div>`;

    const itemsRows = items
      .map((line) => {
        const name = line.item_name || `Item ${line.item_id}`;
        const qty = formatQty(line.quantity);
        const price = formatMoney(line.unit_price);
        const lineTotal = formatMoney(line.line_total ?? Number(line.quantity) * Number(line.unit_price));
        return `<tr>
          <td>${escapeHtml(name)}</td>
          <td class="num">${escapeHtml(qty)}</td>
          <td class="num">${escapeHtml(price)}</td>
          <td class="num">${escapeHtml(lineTotal)}</td>
        </tr>`;
      })
      .join('');

    const template = await readTemplate(isQuotation ? 'quotation-print.html' : 'invoice-print.html');

    return renderTemplate(template, {
      companyName,
      companyPhone,
      companyManager,
      customerName: customer?.full_name || sale.customer_name || 'Customer',
      customerPhone: customer?.phone ? `Phone: ${customer.phone}` : '',
      customerAddress: customer?.address ? `Address: ${customer.address}` : '',
      docNo,
      docDate: saleDate,
      dueDate,
      subtotal: formatMoney(totals.subtotal),
      discount: formatMoney(totals.discount),
      tax: formatMoney(totals.tax),
      total: formatMoney(totals.total),
      printDate: new Date().toLocaleDateString(),

      bannerBlock,
      logoBlock,
      validUntilRow,
      statusBadge,
      paidBlock,
      balanceBlock,
      itemsRows,
    });
  },
};
