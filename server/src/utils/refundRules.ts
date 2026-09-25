import { PoolClient } from 'pg';
import { ApiError } from './ApiError';

const roundMoney = (value: number): number => {
  const n = Number(value || 0);
  return Math.round((n + Number.EPSILON) * 100) / 100;
};

export type RefundResolution = {
  refundAmount: number;
  balanceAdjustment: number;
  refundAccId: number | null;
  canChooseMethod: boolean;
  originalWasCredit: boolean;
  lockedRefundAccId: number | null;
};

const assertAccountHasBalance = async (
  client: PoolClient,
  branchId: number,
  accId: number,
  amount: number
): Promise<void> => {
  const row = await client.query<{ balance: string }>(
    `SELECT COALESCE(balance, 0)::text AS balance
       FROM ims.accounts
      WHERE acc_id = $1
        AND branch_id = $2
      LIMIT 1`,
    [accId, branchId]
  );
  if (!row.rows[0]) throw ApiError.badRequest('Refund account not found');
  const balance = Number(row.rows[0].balance || 0);
  if (balance + 1e-6 < amount) {
    throw ApiError.badRequest(
      `Insufficient funds in refund account (available ${balance.toFixed(2)}, required ${amount.toFixed(2)})`
    );
  }
};

type OriginalTxn = {
  txnType: 'cash' | 'credit';
  lockedAccId: number | null;
};

const loadOriginalSale = async (
  client: PoolClient,
  branchId: number,
  saleId: number
): Promise<OriginalTxn | null> => {
  const res = await client.query<{ sale_type: string; status: string }>(
    `SELECT sale_type::text AS sale_type,
            status::text AS status
       FROM ims.sales
      WHERE sale_id = $1
        AND branch_id = $2
      LIMIT 1`,
    [saleId, branchId]
  );
  const row = res.rows[0];
  if (!row) return null;

  // Payment amount/account live in ims.sale_payments, not on ims.sales itself.
  const paymentRows = await client.query<{ acc_id: number; amount_paid: string }>(
    `SELECT acc_id, COALESCE(SUM(amount_paid), 0)::text AS amount_paid
       FROM ims.sale_payments
      WHERE branch_id = $1
        AND sale_id = $2
      GROUP BY acc_id
     HAVING COALESCE(SUM(amount_paid), 0) > 0.005
      ORDER BY acc_id ASC`,
    [branchId, saleId]
  );
  const paid = paymentRows.rows.reduce((sum, r) => sum + Number(r.amount_paid || 0), 0);
  const isCredit =
    row.sale_type === 'credit' || (row.status === 'unpaid' && paid <= 0.005);
  // Only "lock" a refund account when the sale was paid through exactly one
  // account - if it was split across multiple, don't guess, require the
  // caller to pick one explicitly.
  const lockedAccId = paymentRows.rows.length === 1 ? Number(paymentRows.rows[0].acc_id) : null;
  return {
    txnType: isCredit ? 'credit' : 'cash',
    lockedAccId,
  };
};

const loadOriginalPurchase = async (
  client: PoolClient,
  branchId: number,
  purchaseId: number
): Promise<OriginalTxn | null> => {
  const res = await client.query<{ purchase_type: string; status: string }>(
    `SELECT purchase_type::text AS purchase_type,
            status::text AS status
       FROM ims.purchases
      WHERE purchase_id = $1
        AND branch_id = $2
      LIMIT 1`,
    [purchaseId, branchId]
  );
  const row = res.rows[0];
  if (!row) return null;

  // Payment amount/account live in ims.supplier_payments, not on ims.purchases itself.
  const paymentRows = await client.query<{ acc_id: number; amount_paid: string }>(
    `SELECT acc_id, COALESCE(SUM(amount_paid), 0)::text AS amount_paid
       FROM ims.supplier_payments
      WHERE branch_id = $1
        AND purchase_id = $2
      GROUP BY acc_id
     HAVING COALESCE(SUM(amount_paid), 0) > 0.005
      ORDER BY acc_id ASC`,
    [branchId, purchaseId]
  );
  const paid = paymentRows.rows.reduce((sum, r) => sum + Number(r.amount_paid || 0), 0);
  const isCredit =
    row.purchase_type === 'credit' ||
    row.status === 'unpaid' ||
    (row.status === 'partial' && paid <= 0.005);
  const lockedAccId = paymentRows.rows.length === 1 ? Number(paymentRows.rows[0].acc_id) : null;
  return {
    txnType: isCredit ? 'credit' : 'cash',
    lockedAccId,
  };
};

export const resolveSalesReturnRefund = async (
  client: PoolClient,
  params: {
    branchId: number;
    saleId?: number | null;
    total: number;
    partyOutstanding: number;
    refundViaAccount?: boolean;
    refundAccIdInput?: number | null;
  }
): Promise<RefundResolution> => {
  const total = roundMoney(params.total);
  let original: OriginalTxn | null = null;

  if (params.saleId) {
    original = await loadOriginalSale(client, params.branchId, Number(params.saleId));
  }

  const originalWasCredit = original?.txnType === 'credit';
  const lockedRefundAccId = original?.lockedAccId ?? null;

  if (originalWasCredit) {
    return {
      refundAmount: 0,
      balanceAdjustment: total,
      refundAccId: null,
      canChooseMethod: false,
      originalWasCredit: true,
      lockedRefundAccId,
    };
  }

  const outstanding = Math.max(Number(params.partyOutstanding || 0), 0);

  if (outstanding + 0.005 < total) {
    // The return value exceeds what the customer owes: apply as much as possible
    // to the outstanding debt first, and only cash-refund whatever's left over -
    // don't hand back cash while debt could still absorb it.
    const cashPortion = roundMoney(total - outstanding);
    const accId = lockedRefundAccId || Number(params.refundAccIdInput || 0);
    if (!accId) {
      throw ApiError.badRequest(
        'Customer balance is less than return total. Refund account from the original sale is required.'
      );
    }
    await assertAccountHasBalance(client, params.branchId, accId, cashPortion);
    return {
      refundAmount: cashPortion,
      balanceAdjustment: outstanding,
      refundAccId: accId,
      canChooseMethod: false,
      originalWasCredit: false,
      lockedRefundAccId,
    };
  }

  if (params.refundViaAccount) {
    const accId = lockedRefundAccId || Number(params.refundAccIdInput || 0);
    if (!accId) throw ApiError.badRequest('Refund account is required');
    await assertAccountHasBalance(client, params.branchId, accId, total);
    return {
      refundAmount: total,
      balanceAdjustment: 0,
      refundAccId: accId,
      canChooseMethod: true,
      originalWasCredit: false,
      lockedRefundAccId,
    };
  }

  return {
    refundAmount: 0,
    balanceAdjustment: total,
    refundAccId: null,
    canChooseMethod: true,
    originalWasCredit: false,
    lockedRefundAccId,
  };
};

export const resolvePurchaseReturnRefund = async (
  client: PoolClient,
  params: {
    branchId: number;
    purchaseId?: number | null;
    total: number;
    partyOutstanding: number;
    refundViaAccount?: boolean;
    refundAccIdInput?: number | null;
  }
): Promise<RefundResolution> => {
  const total = roundMoney(params.total);
  let original: OriginalTxn | null = null;

  if (params.purchaseId) {
    original = await loadOriginalPurchase(client, params.branchId, Number(params.purchaseId));
  }

  const originalWasCredit = original?.txnType === 'credit';
  const lockedRefundAccId = original?.lockedAccId ?? null;

  if (originalWasCredit) {
    return {
      refundAmount: 0,
      balanceAdjustment: total,
      refundAccId: null,
      canChooseMethod: false,
      originalWasCredit: true,
      lockedRefundAccId,
    };
  }

  const outstanding = Math.max(Number(params.partyOutstanding || 0), 0);

  if (outstanding + 0.005 < total) {
    // The return value exceeds what's owed to the supplier: apply as much as
    // possible to the payable first, and only cash-refund whatever's left over.
    const cashPortion = roundMoney(total - outstanding);
    const accId = lockedRefundAccId || Number(params.refundAccIdInput || 0);
    if (!accId) {
      throw ApiError.badRequest(
        'Supplier payable balance is less than return total. Refund must be recorded into the original purchase account.'
      );
    }
    return {
      refundAmount: cashPortion,
      balanceAdjustment: outstanding,
      refundAccId: accId,
      canChooseMethod: false,
      originalWasCredit: false,
      lockedRefundAccId,
    };
  }

  if (params.refundViaAccount) {
    const accId = lockedRefundAccId || Number(params.refundAccIdInput || 0);
    if (!accId) throw ApiError.badRequest('Refund account is required');
    return {
      refundAmount: total,
      balanceAdjustment: 0,
      refundAccId: accId,
      canChooseMethod: true,
      originalWasCredit: false,
      lockedRefundAccId,
    };
  }

  return {
    refundAmount: 0,
    balanceAdjustment: total,
    refundAccId: null,
    canChooseMethod: true,
    originalWasCredit: false,
    lockedRefundAccId,
  };
};

export { requireDeleteReason } from './deleteReason';
