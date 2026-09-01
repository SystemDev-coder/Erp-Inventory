import { PoolClient } from 'pg';
import { query } from '../db/query';

const notifyBranchUsers = async (
  client: PoolClient | null,
  params: {
    branchId: number;
    title: string;
    message: string;
    link: string;
    meta: Record<string, unknown>;
  }
) => {
  const exec = client
    ? (sql: string, values: unknown[]) => client.query(sql, values)
    : (sql: string, values: unknown[]) => query(sql, values);

  await exec(
    `INSERT INTO ims.notifications (branch_id, user_id, title, message, category, link, meta)
     SELECT
       $1,
       ub.user_id,
       $2,
       $3,
       'finance',
       $4,
       $5::jsonb
     FROM ims.user_branches ub
     JOIN ims.users u ON u.user_id = ub.user_id
    WHERE ub.branch_id = $1
      AND COALESCE(u.is_active, TRUE) = TRUE
      AND NOT EXISTS (
        SELECT 1
          FROM ims.notifications n
         WHERE n.user_id = ub.user_id
           AND COALESCE(n.is_deleted, FALSE) = FALSE
           AND COALESCE(n.meta->>'type', '') = $6
           AND COALESCE(n.meta->>'ref_id', '') = $7
           AND COALESCE(n.meta->>'due_date', '') = $8
      )`,
    [
      params.branchId,
      params.title,
      params.message,
      params.link,
      JSON.stringify(params.meta),
      String(params.meta.type || ''),
      String(params.meta.ref_id || ''),
      String(params.meta.due_date || ''),
    ]
  );
};

export const ensureCreditDueNotifications = async (
  branchId: number,
  client?: PoolClient
) => {
  if (!branchId) return;

  const runQuery = async <T extends Record<string, unknown>>(sql: string, values: unknown[]) => {
    if (client) {
      const res = await client.query<T>(sql, values);
      return res.rows;
    }
    const { queryMany } = await import('../db/query');
    return queryMany<T>(sql, values);
  };

  const overdueSales = await runQuery<{
    sale_id: number;
    customer_name: string | null;
    due_date: string;
    total: string;
    days_overdue: number;
  }>(
    `SELECT
        s.sale_id,
        c.full_name AS customer_name,
        s.due_date::text AS due_date,
        s.total::text AS total,
        (CURRENT_DATE - s.due_date)::int AS days_overdue
       FROM ims.sales s
       LEFT JOIN ims.customers c ON c.customer_id = s.customer_id
      WHERE s.branch_id = $1
        AND COALESCE(s.status::text, '') NOT IN ('void', 'paid')
        AND COALESCE(s.sale_type::text, '') = 'credit'
        AND s.due_date IS NOT NULL
        AND s.due_date <= CURRENT_DATE
        AND COALESCE(s.is_deleted, 0)::int = 0
        AND COALESCE((to_jsonb(s) ->> 'doc_type'), 'sale') <> 'quotation'`,
    [branchId]
  );

  for (const row of overdueSales) {
    const name = row.customer_name || 'Customer';
    await notifyBranchUsers(client ?? null, {
      branchId,
      title: `Credit Due: Sale #${row.sale_id}`,
      message: `${name} — sale #${row.sale_id} was due on ${row.due_date} (${row.days_overdue} day(s) overdue). Amount: ${Number(row.total).toFixed(2)}.`,
      link: `/sales/${row.sale_id}/edit`,
      meta: {
        type: 'credit_sale_due',
        ref_id: row.sale_id,
        due_date: row.due_date,
        days_overdue: row.days_overdue,
      },
    });
  }

  const overduePurchases = await runQuery<{
    purchase_id: number;
    supplier_name: string | null;
    due_date: string;
    total: string;
    days_overdue: number;
  }>(
    `SELECT
        p.purchase_id,
        COALESCE(s.supplier_name, s.name) AS supplier_name,
        p.due_date::text AS due_date,
        p.total::text AS total,
        (CURRENT_DATE - p.due_date)::int AS days_overdue
       FROM ims.purchases p
       LEFT JOIN ims.suppliers s ON s.supplier_id = p.supplier_id
      WHERE p.branch_id = $1
        AND COALESCE(p.status::text, '') NOT IN ('void', 'received', 'paid')
        AND COALESCE(p.purchase_type::text, '') = 'credit'
        AND p.due_date IS NOT NULL
        AND p.due_date <= CURRENT_DATE
        AND COALESCE(p.is_deleted, 0)::int = 0
        AND COALESCE(p.doc_type::text, 'purchase') = 'purchase'`,
    [branchId]
  );

  for (const row of overduePurchases) {
    const name = row.supplier_name || 'Supplier';
    await notifyBranchUsers(client ?? null, {
      branchId,
      title: `Credit Due: Purchase #${row.purchase_id}`,
      message: `${name} — purchase #${row.purchase_id} was due on ${row.due_date} (${row.days_overdue} day(s) overdue). Amount: ${Number(row.total).toFixed(2)}.`,
      link: `/purchases/${row.purchase_id}/edit`,
      meta: {
        type: 'credit_purchase_due',
        ref_id: row.purchase_id,
        due_date: row.due_date,
        days_overdue: row.days_overdue,
      },
    });
  }
};
