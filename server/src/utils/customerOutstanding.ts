import { PoolClient } from 'pg';

/** Net receivable per customer_ledger row (debit increases, credit decreases). */
export const customerLedgerNetSql = `
  CASE
    WHEN COALESCE(l.ref_table, '') = 'sales_returns'
      AND (
        COALESCE(l.entry_type::text, '') = 'refund'
        OR COALESCE(l.note, '') ILIKE '%refund%'
      )
      THEN ABS(COALESCE(l.debit, 0) + COALESCE(l.credit, 0))
    ELSE COALESCE(l.debit, 0) - COALESCE(l.credit, 0)
  END
`;

/** Exclude void/quotation sale rows from ledger totals. */
export const customerLedgerValidSaleFilterSql = `
  NOT (
    COALESCE(l.ref_table, '') = 'sales'
    AND l.ref_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
        FROM ims.sales s
       WHERE s.branch_id = l.branch_id
         AND s.sale_id = l.ref_id
         AND LOWER(COALESCE(s.status::text, '')) <> 'void'
         AND COALESCE((to_jsonb(s) ->> 'doc_type'), 'sale') <> 'quotation'
    )
  )
`;

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const resolveBalanceColumn = async (client: PoolClient): Promise<'remaining_balance' | 'open_balance' | null> => {
  const result = await client.query<{ column_name: string }>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'ims'
        AND table_name = 'customers'
        AND column_name IN ('remaining_balance', 'open_balance')`
  );
  const names = new Set(result.rows.map((row) => row.column_name));
  if (names.has('remaining_balance')) return 'remaining_balance';
  if (names.has('open_balance')) return 'open_balance';
  return null;
};

export const computeCustomerOutstandingFromLedger = async (
  client: PoolClient,
  params: { branchId: number; customerId: number }
): Promise<number> => {
  const result = await client.query<{ amount: string }>(
    `SELECT COALESCE(SUM(${customerLedgerNetSql}), 0)::text AS amount
       FROM ims.customer_ledger l
      WHERE l.branch_id = $1
        AND l.customer_id = $2
        AND ${customerLedgerValidSaleFilterSql}`,
    [params.branchId, params.customerId]
  );
  return roundMoney(Math.max(0, Number(result.rows[0]?.amount || 0)));
};

/** Keep customers.remaining_balance aligned with customer_ledger after sales/receipts. */
export const syncCustomerOutstandingFromLedger = async (
  client: PoolClient,
  params: { branchId: number; customerId: number }
): Promise<void> => {
  if (!params.customerId) return;
  const column = await resolveBalanceColumn(client);
  if (!column) return;

  const next = await computeCustomerOutstandingFromLedger(client, params);
  await client.query(
    `UPDATE ims.customers
        SET ${column} = $3
      WHERE branch_id = $1
        AND customer_id = $2`,
    [params.branchId, params.customerId, next]
  );
};

export const customerOutstandingLedgerCte = `
  ledger AS (
    SELECT
      l.customer_id,
      COALESCE(SUM(COALESCE(l.debit, 0)), 0)::double precision AS total_debit,
      COALESCE(SUM(COALESCE(l.credit, 0)), 0)::double precision AS total_credit,
      COALESCE(SUM(${customerLedgerNetSql}), 0)::double precision AS ledger_balance
    FROM ims.customer_ledger l
    WHERE l.branch_id = $1
      AND ${customerLedgerValidSaleFilterSql}
    GROUP BY l.customer_id
  ),
  operational AS (
    SELECT
      c.customer_id,
      GREATEST(
        COALESCE(c.open_balance, 0)
        + COALESCE(cs.gross_sales, 0)
        - COALESCE(rc.total_receipts, 0)
        - COALESCE(sp.inline_payments, 0)
        - COALESCE(sr.return_credits, 0),
        0
      )::double precision AS operational_balance,
      COALESCE(cs.gross_sales, 0)::double precision AS gross_sales,
      COALESCE(rc.total_receipts, 0)::double precision AS total_receipts
    FROM ims.customers c
    LEFT JOIN (
      SELECT
        s.customer_id,
        COALESCE(SUM(s.total), 0)::double precision AS gross_sales
      FROM ims.sales s
      WHERE s.branch_id = $1
        AND s.customer_id IS NOT NULL
        AND LOWER(COALESCE(s.status::text, '')) <> 'void'
        AND COALESCE((to_jsonb(s) ->> 'doc_type'), 'sale') <> 'quotation'
        AND (
          LOWER(COALESCE(s.sale_type::text, '')) = 'credit'
          OR LOWER(COALESCE(s.status::text, '')) IN ('unpaid', 'partial')
        )
      GROUP BY s.customer_id
    ) cs ON cs.customer_id = c.customer_id
    LEFT JOIN (
      SELECT
        cr.customer_id,
        COALESCE(SUM(cr.amount), 0)::double precision AS total_receipts
      FROM ims.customer_receipts cr
      WHERE cr.branch_id = $1
        AND cr.customer_id IS NOT NULL
      GROUP BY cr.customer_id
    ) rc ON rc.customer_id = c.customer_id
    LEFT JOIN (
      SELECT
        s.customer_id,
        COALESCE(SUM(sp.amount_paid), 0)::double precision AS inline_payments
      FROM ims.sale_payments sp
      JOIN ims.sales s ON s.sale_id = sp.sale_id AND s.branch_id = sp.branch_id
      WHERE sp.branch_id = $1
        AND s.customer_id IS NOT NULL
        AND LOWER(COALESCE(s.status::text, '')) <> 'void'
      GROUP BY s.customer_id
    ) sp ON sp.customer_id = c.customer_id
    LEFT JOIN (
      SELECT
        sr.customer_id,
        COALESCE(SUM(sr.total), 0)::double precision AS return_credits
      FROM ims.sales_returns sr
      WHERE sr.branch_id = $1
        AND sr.customer_id IS NOT NULL
      GROUP BY sr.customer_id
    ) sr ON sr.customer_id = c.customer_id
    WHERE c.branch_id = $1
  )
`;
