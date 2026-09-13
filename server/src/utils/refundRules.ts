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
  const res = await client.query<{
    sale_type: string;
    status: string;
    paid_amount: string;
    pay_acc_id: number | null;
  }>(
    `SELECT sale_type::text AS sale_type,
            status::text AS status,
            COALESCE(paid_amount, 0)::text AS paid_amount,
            pay_acc_id
       FROM ims.sales
      WHERE sale_id = $1
        AND branch_id = $2
      LIMIT 1`,
    [saleId, branchId]
  );
  const row = res.rows[0];
  if (!row) return null;
  const paid = Number(row.paid_amount || 0);
  const isCredit =
    row.sale_type === 'credit' || (row.status === 'unpaid' && paid <= 0.005);
  return {
    txnType: isCredit ? 'credit' : 'cash',
    lockedAccId: row.pay_acc_id ? Number(row.pay_acc_id) : null,
  };
};

const loadOriginalPurchase = async (
  client: PoolClient,
  branchId: number,
  purchaseId: number
): Promise<OriginalTxn | null> => {
  const res = await client.query<{
    purchase_type: string;
    status: string;
    paid_amount: string;
    pay_acc_id: number | null;
  }>(
    `SELECT purchase_type::text AS purchase_type,
            status::text AS status,
            COALESCE(paid_amount, 0)::text AS paid_amount,
            pay_acc_id
       FROM ims.purchases
      WHERE purchase_id = $1
        AND branch_id = $2
      LIMIT 1`,
    [purchaseId, branchId]
  );
  const row = res.rows[0];
  if (!row) return null;
  const paid = Number(row.paid_amount || 0);
  const isCredit =
    row.purchase_type === 'credit' ||
    row.status === 'unpaid' ||
    (row.status === 'partial' && paid <= 0.005);
  return {
    txnType: isCredit ? 'credit' : 'cash',
    lockedAccId: row.pay_acc_id ? Number(row.pay_acc_id) : null,
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
    const accId = lockedRefundAccId || Number(params.refundAccIdInput || 0);
    if (!accId) {
      throw ApiError.badRequest(
        'Customer balance is less than return total. Refund account from the original sale is required.'
      );
    }
    await assertAccountHasBalance(client, params.branchId, accId, total);
    return {
      refundAmount: total,
      balanceAdjustment: 0,
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
    const accId = lockedRefundAccId || Number(params.refundAccIdInput || 0);
    if (!accId) {
      throw ApiError.badRequest(
        'Supplier payable balance is less than return total. Refund must be recorded into the original purchase account.'
      );
    }
    return {
      refundAmount: total,
      balanceAdjustment: 0,
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
