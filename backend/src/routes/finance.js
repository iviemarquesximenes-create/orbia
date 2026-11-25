'use strict';

const { Router } = require('express');
const { randomUUID } = require('node:crypto');
const { getPool, withTransaction } = require('../lib/db');
const { apiError, asyncRoute, requiredText, parseAmountToCents, centsToDecimal, isUuid, sqlDateTime, sqlMonth } = require('../lib/http');
const { requireAuth } = require('../middleware/auth');
const { requireTenant, authorize } = require('../middleware/tenant');
const { writeAudit } = require('../services/audit');
const { requestHash } = require('../services/idempotency');

const router = Router();
router.use(['/api/dashboard', '/api/funds', '/api/payments', '/api/expenses'], requireAuth, requireTenant);

router.get('/api/dashboard', authorize('finance:read'), asyncRoute(async (req, res) => {
  const pool = getPool();
  const { rows: funds } = await pool.query(
    `SELECT f.id, f.code, f.name, f.currency,
            CAST(f.opening_balance + COALESCE(SUM(fm.amount), 0) AS text) AS balance
     FROM funds f
     LEFT JOIN fund_movements fm ON fm.tenant_id = f.tenant_id AND fm.fund_id = f.id
     WHERE f.tenant_id = $1 AND f.status = 'active'
     GROUP BY f.id, f.code, f.name, f.currency, f.opening_balance
     ORDER BY f.code`,
    [req.tenant.id]
  );
  const { rows: unitRows } = await pool.query('SELECT COUNT(*) AS total FROM units WHERE tenant_id = $1 AND status = \'active\'', [req.tenant.id]);
  const { rows: occurrenceRows } = await pool.query("SELECT COUNT(*) AS total FROM occurrences WHERE tenant_id = $1 AND status NOT IN ('resolved','closed')", [req.tenant.id]);
  const { rows: expenseRows } = await pool.query("SELECT COUNT(*) AS total FROM expenses WHERE tenant_id = $1 AND status = 'pending_review'", [req.tenant.id]);
  const { rows: reviewRows } = await pool.query("SELECT COUNT(*) AS total FROM ai_review_queue WHERE tenant_id = $1 AND status = 'pending'", [req.tenant.id]);
  const { rows: monthRows } = await pool.query(
    `SELECT COALESCE(SUM(CASE WHEN fm.amount > 0 THEN fm.amount ELSE 0 END), 0) AS inflow,
            COALESCE(SUM(CASE WHEN fm.amount < 0 THEN -fm.amount ELSE 0 END), 0) AS outflow
     FROM fund_movements fm
     LEFT JOIN payment_allocations pa ON pa.tenant_id = fm.tenant_id AND pa.id = fm.origin_id AND fm.movement_type = 'payment_allocation'
     LEFT JOIN payment_transactions p ON p.tenant_id = pa.tenant_id AND p.id = pa.payment_transaction_id
     LEFT JOIN expenses e ON e.tenant_id = fm.tenant_id AND e.id = fm.origin_id AND fm.movement_type = 'expense'
     WHERE fm.tenant_id = $1
       AND COALESCE(p.received_at, e.occurred_at, fm.created_at) >= (date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')
       AND COALESCE(p.received_at, e.occurred_at, fm.created_at) < ((date_trunc('month', now() AT TIME ZONE 'UTC') + INTERVAL '1 month') AT TIME ZONE 'UTC')`,
    [req.tenant.id]
  );
  return res.json({
    tenant: req.tenant,
    funds: funds.map((fund) => ({ ...fund, balance: String(fund.balance) })),
    operations: {
      activeUnits: Number(unitRows[0].total),
      openOccurrences: Number(occurrenceRows[0].total),
      expensesAwaitingReview: Number(expenseRows[0].total),
      aiItemsAwaitingReview: Number(reviewRows[0].total)
    },
    currentMonth: { inflow: String(monthRows[0].inflow), outflow: String(monthRows[0].outflow) }
  });
}));

router.get('/api/funds', authorize('finance:read'), asyncRoute(async (req, res) => {
  const { rows } = await getPool().query(
    `SELECT f.id, f.code, f.name, f.purpose, f.currency,
            CAST(f.opening_balance + COALESCE(SUM(fm.amount), 0) AS text) AS balance
     FROM funds f LEFT JOIN fund_movements fm ON fm.tenant_id = f.tenant_id AND fm.fund_id = f.id
     WHERE f.tenant_id = $1 AND f.status = 'active'
     GROUP BY f.id, f.code, f.name, f.purpose, f.currency, f.opening_balance
     ORDER BY f.code`,
    [req.tenant.id]
  );
  return res.json({ items: rows.map((row) => ({ ...row, balance: String(row.balance) })) });
}));

router.get('/api/payments', authorize('finance:read'), asyncRoute(async (req, res) => {
  const { rows } = await getPool().query(
    `SELECT p.id, p.unit_id, u.label AS unit_label, p.payer_name, p.received_at, p.amount, p.status, p.source, p.note,
            CAST(COALESCE(SUM(a.amount), 0) AS text) AS allocated_amount,
            CAST(p.amount - COALESCE(SUM(a.amount), 0) AS text) AS unallocated_amount,
            STRING_AGG(f.name || ': ' || CAST(a.amount AS text) || ' (' || TO_CHAR(a.reference_month, 'YYYY-MM') || ')', ' | ' ORDER BY f.code) AS allocations
     FROM payment_transactions p
     LEFT JOIN units u ON u.tenant_id = p.tenant_id AND u.id = p.unit_id
     LEFT JOIN payment_allocations a ON a.tenant_id = p.tenant_id AND a.payment_transaction_id = p.id
     LEFT JOIN funds f ON f.tenant_id = a.tenant_id AND f.id = a.fund_id
     WHERE p.tenant_id = $1
     GROUP BY p.id, p.unit_id, u.label, p.payer_name, p.received_at, p.amount, p.status, p.source, p.note
     ORDER BY p.received_at DESC LIMIT 100`,
    [req.tenant.id]
  );
  return res.json({ items: rows });
}));

router.post('/api/payments', authorize('finance:write'), asyncRoute(async (req, res) => {
  const amountCents = parseAmountToCents(req.body?.amount);
  const receivedAt = sqlDateTime(req.body?.receivedAt);
  const unitId = req.body?.unitId || null;
  const payerName = req.body?.payerName ? requiredText(req.body.payerName, 180) : null;
  const note = req.body?.note ? requiredText(req.body.note, 1000) : null;
  const idempotencyKey = req.get('idempotency-key') ? requiredText(req.get('idempotency-key'), 191) : null;
  const allocationsInput = Array.isArray(req.body?.allocations) ? req.body.allocations : [];
  if (!idempotencyKey) return apiError(res, 400, 'IDEMPOTENCY_REQUIRED', 'Envie uma chave estável para este pagamento e reutilize-a em novas tentativas.');
  if (!amountCents || amountCents <= 0n || !receivedAt || (req.body?.payerName && !payerName) || (req.body?.note && !note)) {
    return apiError(res, 400, 'INVALID_PAYMENT', 'Informe valor positivo, data válida e dados de pagamento válidos.');
  }
  if (unitId && !isUuid(unitId)) return apiError(res, 400, 'INVALID_UNIT', 'A unidade informada é inválida.');
  if (allocationsInput.length > 12) return apiError(res, 400, 'TOO_MANY_ALLOCATIONS', 'O pagamento pode ter no máximo 12 alocações.');

  const allocations = [];
  let allocatedCents = 0n;
  for (const entry of allocationsInput) {
    const allocationCents = parseAmountToCents(entry?.amount);
    const referenceMonth = sqlMonth(entry?.referenceMonth);
    if (!isUuid(entry?.fundId) || !allocationCents || allocationCents <= 0n || !referenceMonth) {
      return apiError(res, 400, 'INVALID_ALLOCATION', 'Confira fundo, período e valor das alocações.');
    }
    allocatedCents += allocationCents;
    allocations.push({ fundId: entry.fundId, referenceMonth, amount: centsToDecimal(allocationCents) });
  }
  if (allocatedCents > amountCents) return apiError(res, 400, 'ALLOCATIONS_EXCEED_PAYMENT', 'A soma das alocações não pode ultrapassar o pagamento original.');

  const paymentId = randomUUID();
  const paymentStatus = allocatedCents === amountCents ? 'posted' : 'identified';
  const unallocatedAmount = centsToDecimal(amountCents - allocatedCents);
  const hash = requestHash({ amount: centsToDecimal(amountCents), receivedAt, unitId, payerName, note, allocations });
  try {
    await withTransaction(async (connection) => {
      if (unitId) {
        const { rows: unitRows } = await connection.query('SELECT id FROM units WHERE tenant_id = $1 AND id = $2 LIMIT 1', [req.tenant.id, unitId]);
        if (!unitRows.length) throw Object.assign(new Error('UNIT_NOT_FOUND'), { code: 'UNIT_NOT_FOUND' });
      }
      if (allocations.length) {
        const ids = [...new Set(allocations.map((entry) => entry.fundId))];
        const placeholders = ids.map((_id, index) => `$${index + 2}`).join(',');
        const { rows: fundRows } = await connection.query(`SELECT id FROM funds WHERE tenant_id = $1 AND id IN (${placeholders}) AND status = 'active'`, [req.tenant.id, ...ids]);
        if (fundRows.length !== ids.length) throw Object.assign(new Error('FUND_NOT_FOUND'), { code: 'FUND_NOT_FOUND' });
      }
      await connection.query(
        `INSERT INTO payment_transactions (id, tenant_id, unit_id, payer_name, received_at, amount, status, source, idempotency_key, request_hash, note, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'manual', $8, $9, $10, $11)`,
        [paymentId, req.tenant.id, unitId, payerName, receivedAt, centsToDecimal(amountCents), paymentStatus, idempotencyKey, hash, note, req.user.id]
      );
      for (const allocation of allocations) {
        const allocationId = randomUUID();
        await connection.query(
          'INSERT INTO payment_allocations (id, tenant_id, payment_transaction_id, fund_id, reference_month, amount) VALUES ($1, $2, $3, $4, $5, $6)',
          [allocationId, req.tenant.id, paymentId, allocation.fundId, allocation.referenceMonth, allocation.amount]
        );
        await connection.query(
          `INSERT INTO fund_movements (id, tenant_id, fund_id, amount, movement_type, origin_id, description, created_by)
           VALUES ($1, $2, $3, $4, 'payment_allocation', $5, $6, $7)`,
          [randomUUID(), req.tenant.id, allocation.fundId, allocation.amount, allocationId, `Alocação de pagamento${payerName ? ` de ${payerName}` : ''}`, req.user.id]
        );
      }
      await writeAudit(connection, {
        tenantId: req.tenant.id, userId: req.user.id, action: 'payment.created', entityType: 'payment', entityId: paymentId,
        details: { amount: centsToDecimal(amountCents), allocatedAmount: centsToDecimal(allocatedCents), unallocatedAmount, status: paymentStatus, allocations: allocations.map((a) => ({ fundId: a.fundId, amount: a.amount, referenceMonth: a.referenceMonth })) }, requestId: req.id
      });
    });
  } catch (error) {
    if (error.code === '23505') {
      const { rows: existing } = await getPool().query('SELECT id, amount, status, request_hash FROM payment_transactions WHERE tenant_id = $1 AND idempotency_key = $2', [req.tenant.id, idempotencyKey]);
      if (!existing.length || existing[0].request_hash !== hash) return apiError(res, 409, 'IDEMPOTENCY_CONFLICT', 'Esta chave já foi usada com dados diferentes. Confira o lançamento original.');
      return res.json({ replayed: true, item: { id: existing[0].id, amount: existing[0].amount, status: existing[0].status, allocations, allocatedAmount: centsToDecimal(allocatedCents), unallocatedAmount, bankConfirmed: false } });
    }
    if (error.code === 'UNIT_NOT_FOUND') return apiError(res, 404, 'UNIT_NOT_FOUND', 'A unidade não pertence a este condomínio.');
    if (error.code === 'FUND_NOT_FOUND') return apiError(res, 404, 'FUND_NOT_FOUND', 'Um dos fundos não pertence a este condomínio.');
    throw error;
  }
  return res.status(201).json({ item: { id: paymentId, amount: centsToDecimal(amountCents), status: paymentStatus, allocations, allocatedAmount: centsToDecimal(allocatedCents), unallocatedAmount, bankConfirmed: false } });
}));

router.get('/api/expenses', authorize('finance:read'), asyncRoute(async (req, res) => {
  const { rows } = await getPool().query(
    `SELECT e.id, e.amount, e.occurred_at, e.category, e.reason, e.status, e.receipt_path, e.created_at,
            f.name AS fund_name, s.name AS supplier_name
     FROM expenses e JOIN funds f ON f.tenant_id = e.tenant_id AND f.id = e.fund_id
     LEFT JOIN suppliers s ON s.tenant_id = e.tenant_id AND s.id = e.supplier_id
     WHERE e.tenant_id = $1 ORDER BY e.occurred_at DESC LIMIT 100`,
    [req.tenant.id]
  );
  return res.json({ items: rows });
}));

router.post('/api/expenses', authorize('finance:write'), asyncRoute(async (req, res) => {
  const amountCents = parseAmountToCents(req.body?.amount);
  const reason = requiredText(req.body?.reason, 1000);
  const category = requiredText(req.body?.category, 100);
  const occurredAt = sqlDateTime(req.body?.occurredAt);
  const fundId = req.body?.fundId;
  const supplierId = req.body?.supplierId || null;
  const idempotencyKey = requiredText(req.get('idempotency-key'), 191);
  if (!idempotencyKey) return apiError(res, 400, 'IDEMPOTENCY_REQUIRED', 'Envie uma chave estável para esta despesa e reutilize-a em novas tentativas.');
  if (!amountCents || amountCents <= 0n || !reason || !category || !occurredAt || !isUuid(fundId)) {
    return apiError(res, 400, 'INVALID_EXPENSE', 'Despesa exige valor, motivo, categoria, data e fundo válidos.');
  }
  if (supplierId && !isUuid(supplierId)) return apiError(res, 400, 'INVALID_SUPPLIER', 'O prestador informado é inválido.');
  const expenseId = randomUUID();
  const hash = requestHash({ amount: centsToDecimal(amountCents), reason, category, occurredAt, fundId, supplierId });
  try {
    await withTransaction(async (connection) => {
    const { rows: funds } = await connection.query('SELECT id FROM funds WHERE tenant_id = $1 AND id = $2 AND status = \'active\' LIMIT 1', [req.tenant.id, fundId]);
    if (!funds.length) throw Object.assign(new Error('FUND_NOT_FOUND'), { code: 'FUND_NOT_FOUND' });
    if (supplierId) {
      const { rows: suppliers } = await connection.query('SELECT id FROM suppliers WHERE tenant_id = $1 AND id = $2 LIMIT 1', [req.tenant.id, supplierId]);
      if (!suppliers.length) throw Object.assign(new Error('SUPPLIER_NOT_FOUND'), { code: 'SUPPLIER_NOT_FOUND' });
    }
    await connection.query(
      `INSERT INTO expenses (id, tenant_id, fund_id, supplier_id, amount, occurred_at, category, reason, status, idempotency_key, request_hash, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending_review', $9, $10, $11)`,
      [expenseId, req.tenant.id, fundId, supplierId, centsToDecimal(amountCents), occurredAt, category, reason, idempotencyKey, hash, req.user.id]
    );
    await writeAudit(connection, { tenantId: req.tenant.id, userId: req.user.id, action: 'expense.requested', entityType: 'expense', entityId: expenseId, details: { amount: centsToDecimal(amountCents), category, fundId }, requestId: req.id });
    });
  } catch (error) {
    if (error.code === '23505') {
      const { rows: existing } = await getPool().query('SELECT id, amount, category, reason, status, fund_id, request_hash FROM expenses WHERE tenant_id = $1 AND idempotency_key = $2', [req.tenant.id, idempotencyKey]);
      if (!existing.length || existing[0].request_hash !== hash) return apiError(res, 409, 'IDEMPOTENCY_CONFLICT', 'Esta chave já foi usada com dados diferentes. Confira a despesa original.');
      const item = existing[0];
      return res.json({ replayed: true, item: { id: item.id, amount: item.amount, category: item.category, reason: item.reason, status: item.status, fundId: item.fund_id } });
    }
    throw error;
  }
  return res.status(201).json({ item: { id: expenseId, amount: centsToDecimal(amountCents), category, reason, status: 'pending_review', fundId } });
}));

router.post('/api/expenses/:expenseId/review', authorize('finance:approve'), asyncRoute(async (req, res) => {
  const { expenseId } = req.params;
  const decision = req.body?.decision;
  const note = req.body?.note ? requiredText(req.body.note, 1000) : null;
  if (!isUuid(expenseId) || !['approve','reject'].includes(decision)) return apiError(res, 400, 'INVALID_REVIEW', 'A revisão precisa ser aprovar ou rejeitar.');
  await withTransaction(async (connection) => {
    const { rows } = await connection.query('SELECT id, fund_id, amount, reason, status FROM expenses WHERE tenant_id = $1 AND id = $2 FOR UPDATE', [req.tenant.id, expenseId]);
    if (!rows.length) throw Object.assign(new Error('EXPENSE_NOT_FOUND'), { code: 'EXPENSE_NOT_FOUND' });
    const expense = rows[0];
    if (expense.status !== 'pending_review') throw Object.assign(new Error('EXPENSE_ALREADY_REVIEWED'), { code: 'EXPENSE_ALREADY_REVIEWED' });
    const status = decision === 'approve' ? 'approved' : 'rejected';
    await connection.query('UPDATE expenses SET status = $1, reviewed_by = $2, reviewed_at = now(), review_note = $3 WHERE tenant_id = $4 AND id = $5', [status, req.user.id, note, req.tenant.id, expenseId]);
    if (decision === 'approve') {
      await connection.query(
        `INSERT INTO fund_movements (id, tenant_id, fund_id, amount, movement_type, origin_id, description, created_by)
         VALUES ($1, $2, $3, $4, 'expense', $5, $6, $7)`,
        [randomUUID(), req.tenant.id, expense.fund_id, `-${String(expense.amount)}`, expenseId, expense.reason.slice(0, 500), req.user.id]
      );
    }
    await writeAudit(connection, { tenantId: req.tenant.id, userId: req.user.id, action: `expense.${decision}d`, entityType: 'expense', entityId: expenseId, details: { note }, requestId: req.id });
  }).catch((error) => {
    if (error.code === '23505') throw Object.assign(new Error('EXPENSE_ALREADY_POSTED'), { code: 'EXPENSE_ALREADY_POSTED' });
    throw error;
  });
  return res.json({ item: { id: expenseId, status: decision === 'approve' ? 'approved' : 'rejected' } });
}));

module.exports = router;
