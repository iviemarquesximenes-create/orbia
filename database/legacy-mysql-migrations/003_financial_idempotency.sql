ALTER TABLE payment_transactions ADD COLUMN request_hash CHAR(64) NULL;
ALTER TABLE expenses ADD COLUMN idempotency_key VARCHAR(191) NULL;
ALTER TABLE expenses ADD COLUMN request_hash CHAR(64) NULL;
ALTER TABLE expenses ADD UNIQUE KEY uq_expense_idempotency (tenant_id, idempotency_key);
