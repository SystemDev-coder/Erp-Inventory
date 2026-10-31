import { PoolClient } from 'pg';
import { queryMany } from '../db/query';
import { withTransaction } from '../db/withTx';

const notifyBranchUsers = async (
  client: PoolClient,
  params: {
    branchId: number;
    title: string;
    message: string;
    link: string;
    meta: Record<string, unknown>;
  }
) => {
  // A notification failure must not abort the branch-wide synchronisation:
  // one broken recipient row should not prevent later due alerts from being
  // created. The savepoint keeps that failure isolated in the shared
  // transaction used by both the scheduler and notification-list endpoint.
  await client.query('SAVEPOINT sp_credit_due_notify');
  try {
    await insertCreditDueNotification(client, params);
    await client.query('RELEASE SAVEPOINT sp_credit_due_notify');
  } catch (error) {
    await client.query('ROLLBACK TO SAVEPOINT sp_credit_due_notify');
    console.error('ensureCreditDueNotifications failed to write a notification:', (error as Error)?.message);
  }
};

const insertCreditDueNotification = async (
  client: PoolClient,
  params: {
    branchId: number;
    title: string;
    message: string;
    link: string;
    meta: Record<string, unknown>;
  }
) => {
  await client.query(
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

const ensureCreditDueNotificationsWithClient = async (
  branchId: number,
  client: PoolClient
) => {
  if (!branchId) return;

  const runQuery = async <T extends Record<string, unknown>>(sql: string, values: unknown[]) => {
    const res = await client.query<T>(sql, values);
    return res.rows;
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
        (CURRENT_DATE - s.due_date::date)::int AS days_overdue
       FROM ims.sales s
       LEFT JOIN ims.customers c ON c.customer_id = s.customer_id
      WHERE s.branch_id = $1
        AND COALESCE(s.status::text, '') NOT IN ('void', 'paid')
        AND COALESCE(s.sale_type::text, '') = 'credit'
        AND s.due_date IS NOT NULL
        AND s.due_date <= NOW()
        AND COALESCE(s.is_deleted, 0)::int = 0
        AND COALESCE((to_jsonb(s) ->> 'doc_type'), 'sale') <> 'quotation'`,
    [branchId]
  );

  for (const row of overdueSales) {
    const name = row.customer_name || 'Customer';
    await notifyBranchUsers(client, {
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

  // A customer can carry an opening balance before any sale is entered. Its
  // configured deadline must therefore alert independently of ims.sales;
  // otherwise a customer such as one imported at go-live would never receive
  // an alert even though they still owe money when the deadline passes.
  const overdueCustomers = await runQuery<{
    customer_id: number;
    customer_name: string;
    due_at: string;
    balance: string;
  }>(
    `SELECT
        c.customer_id,
        c.full_name AS customer_name,
        c.credit_due_at::text AS due_at,
        COALESCE(
          NULLIF(to_jsonb(c) ->> 'remaining_balance', '')::numeric,
          NULLIF(to_jsonb(c) ->> 'open_balance', '')::numeric,
          0
        )::text AS balance
       FROM ims.customers c
      WHERE c.branch_id = $1
        AND COALESCE(c.is_active, TRUE) = TRUE
        AND COALESCE(c.credit_allowed, TRUE) = TRUE
        AND c.credit_due_at IS NOT NULL
        AND c.credit_due_at <= NOW()
        AND COALESCE(
          NULLIF(to_jsonb(c) ->> 'remaining_balance', '')::numeric,
          NULLIF(to_jsonb(c) ->> 'open_balance', '')::numeric,
          0
        ) > 0.005
        AND COALESCE(c.is_deleted, 0)::int = 0`,
    [branchId]
  );

  for (const row of overdueCustomers) {
    await notifyBranchUsers(client, {
      branchId,
      title: `Credit Due: ${row.customer_name}`,
      message: `${row.customer_name}'s unpaid balance of ${Number(row.balance).toFixed(2)} reached its deadline on ${row.due_at}.`,
      link: '/customers',
      meta: {
        type: 'credit_customer_due',
        ref_id: row.customer_id,
        due_date: row.due_at,
        balance: row.balance,
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
        s.name AS supplier_name,
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
    await notifyBranchUsers(client, {
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

/**
 * Creates a credit-due notification once the exact due timestamp is reached.
 * A transaction-scoped advisory lock prevents the background scheduler and a
 * simultaneous notification-list request from inserting the same alert twice.
 */
export const ensureCreditDueNotifications = async (
  branchId: number,
  client?: PoolClient
) => {
  if (!branchId) return;
  if (client) {
    await ensureCreditDueNotificationsWithClient(branchId, client);
    return;
  }

  await withTransaction(async (tx) => {
    const lock = await tx.query<{ acquired: boolean }>(
      `SELECT pg_try_advisory_xact_lock(42142, $1::integer) AS acquired`,
      [branchId]
    );
    if (!lock.rows[0]?.acquired) return;
    await ensureCreditDueNotificationsWithClient(branchId, tx);
  });
};

// This is deliberately server-side rather than dependent on an open browser:
// a deadline still creates its alert even when no user currently has the
// notification dropdown open.
export const syncCreditDueNotifications = async () => {
  const branches = await queryMany<{ branch_id: number }>(
    `SELECT branch_id
       FROM ims.branches
      WHERE is_active = TRUE`
  );
  for (const branch of branches) {
    await ensureCreditDueNotifications(Number(branch.branch_id));
  }
};
