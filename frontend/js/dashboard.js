'use strict';

(() => {
  const { api, money, date, node, toast, state } = window.Orbia;
  const content = document.getElementById('dashboard-content');
  const onboarding = document.getElementById('tenant-onboarding');
  const paymentStatuses = { received: 'Comprovante recebido', identified: 'Aguardando identificação', posted: 'Lançado · não conciliado', confirmed: 'Confirmado manualmente', reconciled: 'Conciliado' };

  function decimalToCents(value) {
    const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(value || '0'));
    if (!match) return 0n;
    const cents = BigInt(match[2]) * 100n + BigInt(((match[3] || '') + '00').slice(0, 2));
    return match[1] ? -cents : cents;
  }

  function renderFunds(funds) {
    const list = document.getElementById('fund-summary');
    list.replaceChildren();
    if (!funds.length) {
      list.append(node('p', 'empty-inline', 'Os fundos ainda não foram configurados.'));
      document.getElementById('total-balance').textContent = '—';
      return;
    }
    const total = funds.reduce((sum, fund) => sum + decimalToCents(fund.balance), 0n);
    const absolute = total < 0n ? -total : total;
    document.getElementById('total-balance').textContent = money(`${total < 0n ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`);
    for (const fund of funds) {
      const row = node('div', 'fund-summary-row');
      const copy = node('span', 'fund-summary-copy');
      copy.append(node('strong', '', fund.name), node('small', '', fund.code === 'CAIXINHA' ? 'Reserva coletiva' : 'Despesas ordinárias'));
      row.append(copy, node('strong', 'money-value', money(fund.balance)));
      list.append(row);
    }
  }

  function renderActivity(payments, expenses) {
    const container = document.getElementById('recent-activity');
    const activities = [
      ...payments.map((item) => ({ date: item.received_at, title: item.unit_label ? `Pagamento · ${item.unit_label}` : `Pagamento · ${item.payer_name || 'unidade não identificada'}`, detail: item.allocations || 'Aguardando alocação', amount: item.amount, status: paymentStatuses[item.status] || item.status, sign: '+' })),
      ...expenses.map((item) => ({ date: item.occurred_at, title: `Despesa · ${item.category}`, detail: item.reason, amount: item.amount, status: item.status === 'approved' ? 'Aprovada' : item.status === 'rejected' ? 'Rejeitada' : 'Em revisão', sign: '−' }))
    ].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 5);
    container.replaceChildren();
    if (!activities.length) {
      container.className = 'empty-state empty-state--compact';
      container.append(node('p', 'empty-title', 'Ainda não há movimentações.'), node('p', '', 'Quando houver um pagamento ou despesa lançada, o histórico aparecerá aqui.'));
      return;
    }
    container.className = 'activity-list';
    for (const item of activities) {
      const row = node('article', 'activity-row');
      const copy = node('div', 'activity-copy');
      copy.append(node('strong', '', item.title), node('small', '', item.detail || 'Origem manual'));
      row.append(node('time', 'activity-date', date(item.date)), copy,
        node('strong', item.sign === '+' ? 'activity-amount activity-amount--in' : 'activity-amount activity-amount--out', `${item.sign} ${money(item.amount)}`),
        node('span', 'activity-status', item.status));
      container.append(row);
    }
  }

  async function loadDashboard() {
    if (!state.tenant) {
      onboarding.hidden = false;
      content.hidden = true;
      return;
    }
    onboarding.hidden = true;
    if (!['admin','syndic','finance','council'].includes(state.tenant.role)) {
      content.hidden = true;
      const notice = document.getElementById('global-error');
      notice.className = 'notice notice--soft';
      notice.textContent = state.tenant.role === 'resident'
        ? 'O painel de morador só será exibido quando a unidade individual estiver vinculada com segurança à conta. Nenhum dado financeiro de outros moradores foi carregado.'
        : 'Este perfil não tem acesso ao resumo financeiro do condomínio.';
      notice.hidden = false;
      return;
    }
    content.hidden = false;
    try {
      const [dashboard, payments, expenses] = await Promise.all([api('/api/dashboard'), api('/api/payments'), api('/api/expenses')]);
      renderFunds(dashboard.funds || []);
      document.getElementById('month-inflow').textContent = money(dashboard.currentMonth?.inflow || '0.00');
      document.getElementById('month-outflow').textContent = money(dashboard.currentMonth?.outflow || '0.00');
      document.getElementById('unit-count').textContent = String(dashboard.operations?.activeUnits ?? 0);
      document.getElementById('open-occurrences').textContent = String(dashboard.operations?.openOccurrences ?? 0);
      document.getElementById('pending-expenses').textContent = String(dashboard.operations?.expensesAwaitingReview ?? 0);
      document.getElementById('pending-reviews').textContent = String(dashboard.operations?.aiItemsAwaitingReview ?? 0);
      renderActivity(payments.items || [], expenses.items || []);
      document.getElementById('dashboard-period').textContent = `Atualizado ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}`;
      document.dispatchEvent(new CustomEvent('orbia:dashboard-rendered'));
    } catch (error) { toast(error.message, 'error'); }
  }

  document.getElementById('create-tenant-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const result = await api('/api/tenants', { method: 'POST', body: { name: data.get('name'), address: data.get('address') || null } });
      sessionStorage.setItem('orbia.tenantId', result.item.id);
      toast('Condomínio criado. Seus fundos iniciais já estão separados.', 'success');
      window.location.reload();
    } catch (error) { toast(error.message, 'error'); button.disabled = false; }
  });

  const today = document.getElementById('today-label');
  if (today) today.textContent = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
  window.Orbia.ready.then(loadDashboard).catch(() => {});
})();
