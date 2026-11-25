'use strict';

(() => {
  const { api, money, date, node, toast, state } = window.Orbia;
  const fundsSelect = document.getElementById('expense-fund-select');
  const unitSelect = document.getElementById('payment-unit-select');
  const allocationList = document.getElementById('allocation-list');
  const statusLabels = { received: 'Comprovante recebido', identified: 'Aguardando identificação', posted: 'Lançado · não conciliado', confirmed: 'Confirmado manualmente', reconciled: 'Conciliado', pending_review: 'Em revisão', approved: 'Aprovada', rejected: 'Rejeitada' };
  let funds = [];

  function labeledCell(label, className = '', text = '') {
    const cell = node('td', className, text);
    cell.dataset.label = label;
    return cell;
  }

  function allocationField(label, control) {
    const field = node('label', 'allocation-field');
    field.append(node('span', 'allocation-field-label', label), control);
    return field;
  }

  async function attemptKey(type, body) {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(body)));
    const hash = [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
    const slot = `orbia.attempt.${state.tenant.id}.${type}`;
    let saved;
    try { saved = JSON.parse(sessionStorage.getItem(slot) || 'null'); } catch { saved = null; }
    if (saved?.hash === hash && saved?.key) return { key: saved.key, slot };
    const key = crypto.randomUUID();
    sessionStorage.setItem(slot, JSON.stringify({ hash, key }));
    return { key, slot };
  }

  function fillSelect(select, items, firstLabel, valueField = 'id', labelField = 'name') {
    if (!select) return;
    const placeholder = node('option', '', firstLabel);
    placeholder.value = '';
    select.replaceChildren(placeholder);
    for (const item of items) {
      const option = node('option', '', item[labelField]);
      option.value = item[valueField];
      select.append(option);
    }
  }

  function allocationRow() {
    const row = node('div', 'allocation-row');
    const fund = node('select', 'allocation-fund');
    fund.setAttribute('aria-label', 'Fundo para alocação');
    fillSelect(fund, funds, 'Selecione um fundo');
    const month = node('input', 'allocation-month');
    month.type = 'month';
    month.value = new Date().toISOString().slice(0, 7);
    month.setAttribute('aria-label', 'Mês de referência');
    const amountWrap = node('div', 'input-prefix allocation-amount-wrap');
    amountWrap.append(node('span', '', 'R$'));
    const amount = node('input', 'allocation-amount');
    amount.type = 'number'; amount.min = '0.01'; amount.step = '0.01'; amount.placeholder = '0,00'; amount.setAttribute('aria-label', 'Valor da alocação');
    amount.inputMode = 'decimal';
    amountWrap.append(amount);
    const remove = node('button', 'icon-button allocation-remove', 'Remover');
    remove.type = 'button';
    remove.addEventListener('click', () => row.remove());
    row.append(allocationField('Fundo', fund), allocationField('Mês de referência', month), allocationField('Valor', amountWrap), remove);
    allocationList.append(row);
  }

  function renderFunds(items) {
    funds = items;
    const summary = document.getElementById('financial-summary');
    summary.replaceChildren();
    for (const select of allocationList.querySelectorAll('.allocation-fund')) {
      const selected = select.value;
      fillSelect(select, items, 'Selecione um fundo');
      if (items.some((item) => item.id === selected)) select.value = selected;
    }
    if (!items.length) {
      summary.append(node('div', 'notice notice--soft', 'Os fundos serão criados ao cadastrar o condomínio.'));
      return;
    }
    fillSelect(fundsSelect, items, 'Selecione um fundo');
    for (const item of items) {
      const card = node('article', 'fund-balance-card');
      const top = node('div', 'fund-balance-top');
      top.append(node('span', 'fund-code', item.code), node('span', 'fund-currency', item.currency || 'BRL'));
      card.append(top, node('h2', '', item.name), node('strong', 'fund-balance-value', money(item.balance)), node('p', '', item.purpose || 'Saldo calculado a partir do ledger.'));
      summary.append(card);
    }
    if (!allocationList.childElementCount) allocationRow();
  }

  function paymentStatus(status) { return statusLabels[status] || status; }

  function renderPayments(items) {
    const tbody = document.getElementById('payment-rows');
    tbody.replaceChildren();
    if (!items.length) {
      const tr = node('tr'); const td = node('td', 'table-empty', 'Ainda não há pagamentos registrados.'); td.colSpan = 5; tr.append(td); tbody.append(tr); return;
    }
    for (const item of items) {
      const tr = node('tr');
      const source = item.unit_label || item.payer_name || 'Unidade não identificada';
      const allocationCell = labeledCell('Alocação', 'allocation-cell', item.allocations || 'Aguardando identificação');
      if (item.unallocated_amount && !/^0(?:\.0+)?$/.test(item.unallocated_amount)) {
        allocationCell.append(node('small', 'table-subtext', `Falta alocar: ${money(item.unallocated_amount)}`));
      }
      const label = item.status === 'identified' && item.allocations ? 'Alocação parcial · em revisão' : paymentStatus(item.status);
      tr.append(labeledCell('Data', '', date(item.received_at)), labeledCell('Unidade / pagador', '', source), allocationCell, labeledCell('Valor original', 'money-value', money(item.amount)), labeledCell('Status', '', label));
      tbody.append(tr);
    }
  }

  function renderExpenses(items) {
    const tbody = document.getElementById('expense-rows');
    tbody.replaceChildren();
    if (!items.length) {
      const tr = node('tr'); const td = node('td', 'table-empty', 'Ainda não há despesas.'); td.colSpan = 6; tr.append(td); tbody.append(tr); return;
    }
    for (const item of items) {
      const tr = node('tr');
      const reason = node('span', 'table-subtext', item.reason);
      const categoryCell = labeledCell('Categoria / motivo', 'stacked-cell'); categoryCell.append(node('strong', '', item.category), reason);
      const actions = node('div', 'table-actions');
      if (item.status === 'pending_review' && ['admin','syndic','finance'].includes(state.tenant?.role)) {
        const approve = node('button', 'button button--tiny button--outline', 'Aprovar'); approve.type = 'button';
        approve.addEventListener('click', () => reviewExpense(item.id, 'approve'));
        const reject = node('button', 'button button--tiny button--quiet', 'Rejeitar'); reject.type = 'button';
        reject.addEventListener('click', () => reviewExpense(item.id, 'reject'));
        actions.append(approve, reject);
      } else actions.textContent = '—';
      tr.append(labeledCell('Data', '', date(item.occurred_at)), categoryCell, labeledCell('Fundo', '', item.fund_name), labeledCell('Valor', 'money-value', money(item.amount)), labeledCell('Status', '', statusLabels[item.status] || item.status), labeledCell('Ações', 'table-actions-cell'));
      tr.lastElementChild.append(actions);
      tbody.append(tr);
    }
  }

  async function reviewExpense(id, decision) {
    try {
      await api(`/api/expenses/${id}/review`, { method: 'POST', body: { decision } });
      toast(decision === 'approve' ? 'Despesa aprovada e lançada no fundo.' : 'Despesa rejeitada.', 'success');
      await window.Orbia.refreshAfterSave(loadData);
    } catch (error) { toast(error.message, 'error'); }
  }

  async function loadData() {
    const [fundResult, unitResult, paymentResult, expenseResult] = await Promise.all([
      api('/api/funds'), api('/api/units'), api('/api/payments'), api('/api/expenses')
    ]);
    renderFunds(fundResult.items || []);
    fillSelect(unitSelect, unitResult.items || [], 'Sem unidade', 'id', 'label');
    renderPayments(paymentResult.items || []);
    renderExpenses(expenseResult.items || []);
    document.dispatchEvent(new CustomEvent('orbia:ledger-loaded', { detail: {
      payments: paymentResult.items || [], expenses: expenseResult.items || [], funds: fundResult.items || []
    } }));
  }

  document.addEventListener('orbia:ledger-filtered', (event) => {
    renderPayments(event.detail.payments);
    renderExpenses(event.detail.expenses);
  });

  document.getElementById('add-allocation')?.addEventListener('click', allocationRow);
  document.getElementById('payment-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const rows = [...allocationList.querySelectorAll('.allocation-row')];
    const allocations = [];
    for (const row of rows) {
      const fundId = row.querySelector('.allocation-fund').value;
      const referenceMonth = row.querySelector('.allocation-month').value;
      const amount = row.querySelector('.allocation-amount').value;
      if (!fundId && !amount) continue;
      if (!fundId || !amount || !referenceMonth) {
        toast('Complete fundo, mês e valor da alocação, ou deixe a linha vazia para identificar depois.', 'error');
        return;
      }
      allocations.push({ fundId, referenceMonth, amount });
    }
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const body = {
        amount: data.get('amount'), receivedAt: data.get('receivedAt'), unitId: data.get('unitId') || null,
        payerName: data.get('payerName') || null, note: data.get('note') || null, allocations
      };
      const attempt = await attemptKey('payment', body);
      const result = await api('/api/payments', { method: 'POST', headers: { 'Idempotency-Key': attempt.key }, body });
      sessionStorage.removeItem(attempt.slot);
      toast(result.item.status === 'posted' ? 'Pagamento lançado uma única vez. A conciliação bancária continua pendente.' : `Pagamento registrado. Falta identificar/alocar ${money(result.item.unallocatedAmount)}.`, 'success');
      form.reset();
      allocationList.replaceChildren(); allocationRow();
      await window.Orbia.refreshAfterSave(loadData);
    } catch (error) { toast(error.message, 'error'); }
    finally { button.disabled = false; }
  });

  document.getElementById('expense-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const body = { fundId: data.get('fundId'), amount: data.get('amount'), occurredAt: data.get('occurredAt'), category: data.get('category'), reason: data.get('reason') };
      const attempt = await attemptKey('expense', body);
      await api('/api/expenses', { method: 'POST', headers: { 'Idempotency-Key': attempt.key }, body });
      sessionStorage.removeItem(attempt.slot);
      toast('Despesa enviada para revisão. Ela ainda não altera o saldo.', 'success');
      form.reset();
      await window.Orbia.refreshAfterSave(loadData);
    } catch (error) { toast(error.message, 'error'); }
    finally { button.disabled = false; }
  });

  window.Orbia.ready.then(() => {
    const role = state.tenant?.role;
    if (!['admin','syndic','finance','council'].includes(role)) {
      for (const selector of ['#financial-summary','.financial-entry-grid','#ledger','#expense-history']) document.querySelector(selector).hidden = true;
      const notice = document.getElementById('global-error');
      notice.className = 'notice notice--soft';
      notice.textContent = 'Este perfil não pode consultar o extrato financeiro. A visualização individual do morador depende do vínculo seguro entre conta e unidade.';
      notice.hidden = false;
      return;
    }
    if (role === 'council') document.querySelector('.financial-entry-grid').hidden = true;
    return loadData();
  }).catch((error) => toast(error.message, 'error'));
})();
