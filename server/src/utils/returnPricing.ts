import { PoolClient } from 'pg';

const roundMoney = (value: number) => Math.round(Number(value || 0) * 100) / 100;

export interface PricedReturnLine {
  itemId: number;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

const computeLineReturnAmount = (params: {
  sourceLineTotal: number;
  sourceQty: number;
  subtotal: number;
  documentTotal: number;
  returnQty: number;
}): { unitPrice: number; lineTotal: number } => {
  const sourceQty = Math.max(Number(params.sourceQty || 0), 0);
  const returnQty = Math.max(Number(params.returnQty || 0), 0);
  if (returnQty <= 0) return { unitPrice: 0, lineTotal: 0 };

  const subtotal = Number(params.subtotal || 0);
  const documentTotal = Number(params.documentTotal || 0);
  const sourceLineTotal = Number(params.sourceLineTotal || 0);

  let lineFinalTotal = 0;
  if (subtotal > 0) {
    const lineShare = sourceLineTotal / subtotal;
    const lineDocumentTotal = lineShare * documentTotal;
    lineFinalTotal = sourceQty > 0 ? (lineDocumentTotal / sourceQty) * returnQty : 0;
  } else if (sourceQty > 0) {
    lineFinalTotal = (sourceLineTotal / sourceQty) * returnQty;
  }

  lineFinalTotal = roundMoney(lineFinalTotal);
  const unitPrice = returnQty > 0 ? roundMoney(lineFinalTotal / returnQty) : 0;
  return { unitPrice, lineTotal: lineFinalTotal };
};

type SalesSourceRow = {
  sale_id: number;
  item_id: number;
  quantity: string;
  line_total: string;
  subtotal: string;
  total: string;
};

type PurchaseSourceRow = {
  purchase_id: number;
  item_id: number;
  quantity: string;
  line_total: string;
  subtotal: string;
  total: string;
};

const priceFromWeightedSources = <T extends SalesSourceRow | PurchaseSourceRow>(
  rows: T[],
  itemId: number,
  returnQty: number,
  sourceId?: number | null
): { unitPrice: number; lineTotal: number } => {
  const scoped = sourceId
    ? rows.filter((row) => Number(row.item_id) === itemId && Number((row as SalesSourceRow).sale_id ?? (row as PurchaseSourceRow).purchase_id) === sourceId)
    : rows.filter((row) => Number(row.item_id) === itemId);

  if (!scoped.length) {
    return { unitPrice: 0, lineTotal: 0 };
  }

  if (sourceId && scoped.length === 1) {
    const row = scoped[0];
    return computeLineReturnAmount({
      sourceLineTotal: Number(row.line_total || 0),
      sourceQty: Number(row.quantity || 0),
      subtotal: Number(row.subtotal || 0),
      documentTotal: Number(row.total || 0),
      returnQty,
    });
  }

  let weightedTotal = 0;
  let weightedQty = 0;
  for (const row of scoped) {
    const qty = Number(row.quantity || 0);
    const subtotal = Number(row.subtotal || 0);
    const docTotal = Number(row.total || 0);
    const lineTotal = Number(row.line_total || 0);
    const lineDocumentTotal = subtotal > 0 ? (lineTotal / subtotal) * docTotal : lineTotal;
    weightedTotal += lineDocumentTotal;
    weightedQty += qty;
  }

  if (weightedQty <= 0) return { unitPrice: 0, lineTotal: 0 };
  const unitPrice = roundMoney(weightedTotal / weightedQty);
  const lineTotal = roundMoney(unitPrice * returnQty);
  return { unitPrice, lineTotal };
};

export const resolveSalesReturnPricing = async (
  client: PoolClient,
  params: {
    branchId: number;
    customerId: number;
    saleId?: number | null;
    items: Array<{ itemId: number; quantity: number }>;
  }
): Promise<{ lines: PricedReturnLine[]; subtotal: number; total: number }> => {
  const itemIds = params.items.map((item) => item.itemId);
  if (!itemIds.length) {
    return { lines: [], subtotal: 0, total: 0 };
  }

  const saleParams: Array<number | number[] | null> = [params.branchId, params.customerId, itemIds];
  let saleFilter = '';
  if (params.saleId) {
    saleParams.push(params.saleId);
    saleFilter = `AND s.sale_id = $${saleParams.length}`;
  }

  const sources = await client.query<SalesSourceRow>(
    `SELECT
        s.sale_id,
        si.item_id,
        si.quantity::text AS quantity,
        si.line_total::text AS line_total,
        s.subtotal::text AS subtotal,
        s.total::text AS total
       FROM ims.sales s
       JOIN ims.sale_items si ON si.sale_id = s.sale_id
      WHERE s.branch_id = $1
        AND s.customer_id = $2
        AND si.item_id = ANY($3::int[])
        AND COALESCE(s.status::text, 'posted') <> 'void'
        AND COALESCE((to_jsonb(s) ->> 'doc_type'), 'sale') <> 'quotation'
        ${saleFilter}
      ORDER BY s.sale_date ASC, s.sale_id ASC`,
    saleParams
  );

  const lines: PricedReturnLine[] = params.items.map((item) => {
    const priced = priceFromWeightedSources(sources.rows, item.itemId, item.quantity, params.saleId ?? null);
    return {
      itemId: item.itemId,
      quantity: item.quantity,
      unitPrice: priced.unitPrice,
      lineTotal: priced.lineTotal,
    };
  });

  const subtotal = roundMoney(lines.reduce((sum, line) => sum + line.lineTotal, 0));
  return { lines, subtotal, total: subtotal };
};

export const resolvePurchaseReturnPricing = async (
  client: PoolClient,
  params: {
    branchId: number;
    supplierId: number;
    purchaseId?: number | null;
    items: Array<{ itemId: number; quantity: number }>;
  }
): Promise<{ lines: PricedReturnLine[]; subtotal: number; total: number }> => {
  const itemIds = params.items.map((item) => item.itemId);
  if (!itemIds.length) {
    return { lines: [], subtotal: 0, total: 0 };
  }

  const purchaseParams: Array<number | number[] | null> = [params.branchId, params.supplierId, itemIds];
  let purchaseFilter = '';
  if (params.purchaseId) {
    purchaseParams.push(params.purchaseId);
    purchaseFilter = `AND p.purchase_id = $${purchaseParams.length}`;
  }

  const sources = await client.query<PurchaseSourceRow>(
    `SELECT
        p.purchase_id,
        pi.item_id,
        pi.quantity::text AS quantity,
        pi.line_total::text AS line_total,
        p.subtotal::text AS subtotal,
        p.total::text AS total
       FROM ims.purchases p
       JOIN ims.purchase_items pi ON pi.purchase_id = p.purchase_id
      WHERE p.branch_id = $1
        AND p.supplier_id = $2
        AND pi.item_id = ANY($3::int[])
        AND COALESCE(p.status::text, 'received') <> 'void'
        AND COALESCE(p.doc_type::text, 'purchase') = 'purchase'
        ${purchaseFilter}
      ORDER BY p.purchase_date ASC, p.purchase_id ASC`,
    purchaseParams
  );

  const lines: PricedReturnLine[] = params.items.map((item) => {
    const priced = priceFromWeightedSources(sources.rows, item.itemId, item.quantity, params.purchaseId ?? null);
    return {
      itemId: item.itemId,
      quantity: item.quantity,
      unitPrice: priced.unitPrice,
      lineTotal: priced.lineTotal,
    };
  });

  const subtotal = roundMoney(lines.reduce((sum, line) => sum + line.lineTotal, 0));
  return { lines, subtotal, total: subtotal };
};
