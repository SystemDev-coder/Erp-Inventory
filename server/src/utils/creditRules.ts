import { PoolClient } from 'pg';
import { ApiError } from './ApiError';

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
    docType: SaleDocType;
    saleType: 'cash' | 'credit';
    status: SaleStatus;
  }
): Promise<void> => {
  if (!isCreditSale(params)) return;

  if (!params.customerId) {
    throw ApiError.badRequest(
      'Walk-in customers cannot make credit sales. Select a registered customer or receive full payment.'
    );
  }

  const colCheck = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'ims'
          AND table_name = 'customers'
          AND column_name = 'credit_allowed'
     ) AS exists`
  );
  const hasCreditAllowed = Boolean(colCheck.rows[0]?.exists);

  const result = await client.query<{
    customer_type: string;
    credit_allowed: boolean | null;
  }>(
    hasCreditAllowed
      ? `SELECT COALESCE(customer_type, 'regular') AS customer_type,
                COALESCE(credit_allowed, FALSE) AS credit_allowed
           FROM ims.customers
          WHERE customer_id = $1
          LIMIT 1`
      : `SELECT COALESCE(customer_type, 'regular') AS customer_type,
                NULL::boolean AS credit_allowed
           FROM ims.customers
          WHERE customer_id = $1
          LIMIT 1`,
    [params.customerId]
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
};
