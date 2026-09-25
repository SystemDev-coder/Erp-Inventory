import { PoolClient } from 'pg';
import { ApiError } from './ApiError';
import { computeCustomerOutstandingFromLedger } from './customerOutstanding';
import { settingsService } from '../modules/settings/settings.service';

export type SaleDocType = 'sale' | 'invoice' | 'quotation';
export type SaleStatus = 'paid' | 'partial' | 'unpaid' | 'void';

export const isCreditSale = (params: {
  docType: SaleDocType;
  saleType: 'cash' | 'credit';
  status: SaleStatus;
}): boolean => {
  if (params.docType === 'quotation') return false;
  if (params.status === 'void') return false;
  if (params.saleType === 'credit') return true;
  return params.status === 'unpaid' || params.status === 'partial';
};

export const assertCustomerCreditAllowed = async (
  client: PoolClient,
  params: {
    customerId?: number | null;
    branchId: number;
    docType: SaleDocType;
    saleType: 'cash' | 'credit';
    status: SaleStatus;
    outstandingChange?: number;
  }
): Promise<void> => {
  if (!isCreditSale(params)) return;

  // Part 8: Business Profile enforcement, not just frontend hiding - if this
  // client's configuration has credit sales turned off, reject here
  // regardless of what the request asked for, same as every other guard in
  // this function.
  const profile = await settingsService.getBusinessProfile();
  if (!profile.salesConfig.credit) {
    throw ApiError.badRequest('Credit sales are disabled for this business. Enable them in Business Profile settings first.');
  }

  if (!params.customerId) {
    throw ApiError.badRequest(
      'Walk-in customers cannot make credit sales. Select a registered customer or receive full payment.'
    );
  }

  const colCheck = await client.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'ims' AND table_name = 'customers'
        AND column_name IN ('credit_allowed', 'credit_limit')`
  );
  const availableColumns = new Set(colCheck.rows.map((row) => row.column_name));
  const hasCreditAllowed = availableColumns.has('credit_allowed');
  const hasCreditLimit = availableColumns.has('credit_limit');

  const result = await client.query<{
    customer_type: string;
    credit_allowed: boolean | null;
    credit_limit: string | null;
  }>(
    hasCreditAllowed
      ? `SELECT COALESCE(customer_type, 'regular') AS customer_type,
                COALESCE(credit_allowed, FALSE) AS credit_allowed,
                ${hasCreditLimit ? 'credit_limit::text' : 'NULL::text'} AS credit_limit
           FROM ims.customers
          WHERE customer_id = $1
            AND branch_id = $2
          LIMIT 1`
      : `SELECT COALESCE(customer_type, 'regular') AS customer_type,
                NULL::boolean AS credit_allowed,
                ${hasCreditLimit ? 'credit_limit::text' : 'NULL::text'} AS credit_limit
           FROM ims.customers
          WHERE customer_id = $1
            AND branch_id = $2
          LIMIT 1`,
    [params.customerId, params.branchId]
  );

  const row = result.rows[0];
  if (!row) throw ApiError.badRequest('Customer not found');

  if (row.customer_type === 'one-time') {
    throw ApiError.badRequest(
      'Walk-in (one-time) customers cannot make credit sales. Convert to a regular customer first.'
    );
  }

  if (hasCreditAllowed && row.credit_allowed === false) {
    throw ApiError.badRequest(
      'Credit is not allowed for this customer. Enable "Credit Allowed" on their profile first.'
    );
  }
  if (hasCreditLimit && row.credit_limit != null) {
    const currentOutstanding = await computeCustomerOutstandingFromLedger(client, {
      branchId: params.branchId,
      customerId: params.customerId,
    });
    const projectedOutstanding = Math.max(0, currentOutstanding + Number(params.outstandingChange || 0));
    const creditLimit = Number(row.credit_limit);
    if (projectedOutstanding > creditLimit + 0.000001) {
      throw ApiError.badRequest(
        `Customer credit limit of ${creditLimit.toFixed(2)} would be exceeded (projected outstanding ${projectedOutstanding.toFixed(2)}).`
      );
    }
  }

};
