-- Migration: add 'refund' to ims.ledger_entry_enum
-- Required so customer/supplier ledgers can represent cash refunds on returns without affecting outstanding.

ALTER TYPE ims.ledger_entry_enum
  ADD VALUE IF NOT EXISTS 'refund' AFTER 'return';

