import { queryMany } from '../../../db/query';
import { ACTIVE_SALE_SQL, NON_QUOTATION_SALES_WHERE } from '../reports.helpers';

export interface CogsByInvoiceRow {
  sale_id: number;
  sale_date: string;
  doc_type: string;
  customer_name: string;
  cashier_name: string;
  total: number;
  tax_amount: number;
  cogs: number;
  gross_profit: number;
}

const nonQuotationSalesWhere = NON_QUOTATION_SALES_WHERE;

/**
 * NEW: COGS by invoice report (uses inventory_movements * unit_cost).
 * Works with the new moving-average cost logic because each sale movement stores its unit_cost at posting time.
 */
export const cogsReportsService = {
  async getCogsByInvoice(branchId: number, fromDate: string, toDate: string): Promise<CogsByInvoiceRow[]> {
    return queryMany<CogsByInvoiceRow>(
      `WITH cogs AS (
         SELECT
           m.ref_id AS sale_id,
           COALESCE(SUM(COALESCE(m.qty_out, 0) * COALESCE(m.unit_cost, 0)), 0)::double precision AS cogs
         FROM ims.inventory_movements m
         WHERE m.branch_id = $1
           AND m.move_type = 'sale'
           AND m.ref_table = 'sales'
           AND m.ref_id IS NOT NULL
         GROUP BY m.ref_id
       )
       SELECT
         s.sale_id,
         s.sale_date::text AS sale_date,
         COALESCE((to_jsonb(s) ->> 'doc_type'), 'sale') AS doc_type,
         COALESCE(cu.full_name, 'Walk-in') AS customer_name,
         COALESCE(u.full_name, u.name, u.username, 'Unknown') AS cashier_name,
         COALESCE(s.total, 0)::double precision AS total,
         COALESCE(NULLIF(to_jsonb(s) ->> 'tax_amount', '')::numeric, 0)::double precision AS tax_amount,
         COALESCE(cg.cogs, 0)::double precision AS cogs,
         -- VAT is collected on behalf of the tax authority, so it is stripped out
         -- before margin: including it inflated gross profit by the tax amount and
         -- disagreed with the Income Statement, which books tax as a liability.
         (
           COALESCE(s.total, 0)
           - COALESCE(NULLIF(to_jsonb(s) ->> 'tax_amount', '')::numeric, 0)
           - COALESCE(cg.cogs, 0)
         )::double precision AS gross_profit
       FROM ims.sales s
       LEFT JOIN cogs cg ON cg.sale_id = s.sale_id
       LEFT JOIN ims.customers cu ON cu.customer_id = s.customer_id
       LEFT JOIN ims.users u ON u.user_id = s.user_id
       WHERE s.branch_id = $1
         AND s.status <> 'void'
         AND ${nonQuotationSalesWhere}
         AND ${ACTIVE_SALE_SQL}
         AND s.sale_date::date BETWEEN $2::date AND $3::date
       ORDER BY s.sale_date DESC, s.sale_id DESC
       LIMIT 5000`,
      [branchId, fromDate, toDate]
    );
  },
};

