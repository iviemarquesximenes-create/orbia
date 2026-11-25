'use strict';

(() => {
  const { node, money, date, state } = window.Orbia;

  function operationTabs() {
    const controls = [...document.querySelectorAll('[data-module-target]')];
    if (!controls.length) return;
    function select(target, focus = false) {
      for (const control of controls) {
        const active = control.dataset.moduleTarget === target;
        control.setAttribute('aria-pressed', String(active));
        control.setAttribute('aria-selected', String(active));
      }
      for (const section of document.querySelectorAll('[data-module]')) {
        section.hidden = section.dataset.module !== target;
        section.classList.add('module-section');
        if (section.dataset.module === target && focus) section.querySelector('h2')?.focus({ preventScroll: true });
      }
    }
    controls.forEach((control) => control.addEventListener('click', () => select(control.dataset.moduleTarget)));
    const hashId = window.location.hash.slice(1);
    const hashSection = hashId ? document.getElementById(hashId) : null;
    select(hashSection?.dataset.module || 'occurrence-form');
  }

  function balancePrivacy() {
    const toggle = document.querySelector('.balance-visibility');
    if (!toggle) return;
    let hidden = false;
    const values = new Map();
    function render() {
      for (const element of document.querySelectorAll('#total-balance, #fund-summary .money-value, #month-inflow, #month-outflow')) {
        if (element.textContent !== '••••') values.set(element, element.textContent);
        if (hidden) element.textContent = '••••';
        else if (values.has(element)) element.textContent = values.get(element);
      }
      toggle.setAttribute('aria-pressed', String(hidden));
      toggle.setAttribute('aria-label', hidden ? 'Mostrar saldos na tela' : 'Ocultar saldos na tela');
      toggle.textContent = hidden ? 'Mostrar' : 'Ocultar';
    }
    toggle.addEventListener('click', () => { hidden = !hidden; render(); });
    document.addEventListener('orbia:dashboard-rendered', render);
  }

  function localLedger() {
    const dialog = document.getElementById('ledger-filter-dialog');
    if (!dialog) return;
    let payments = [], expenses = [], funds = [];
    let applied = { kind: 'all', fund: '', from: '', to: '' };
    const summary = document.getElementById('ledger-filter-summary');
    const fields = { kind: document.getElementById('ledger-kind'), fund: document.getElementById('ledger-fund'), from: document.getElementById('ledger-from'), to: document.getElementById('ledger-to') };
    const trigger = document.getElementById('ledger-filter-open');
    const close = dialog.querySelector('.sheet-close');
    const feedback = node('p', 'notice notice--error'); feedback.hidden = true; feedback.setAttribute('role', 'alert');
    dialog.querySelector('.sheet-body').prepend(feedback);
    function dismiss() { dialog.close(); }
    dialog.addEventListener('close', () => {
      document.body.classList.toggle('dialog-open', Boolean(document.querySelector('dialog[open]')));
      trigger.focus({ preventScroll: true });
    });
    trigger.addEventListener('click', () => {
      Object.entries(applied).forEach(([key, value]) => { fields[key].value = value; });
      feedback.hidden = true;
      dialog.showModal(); document.body.classList.add('dialog-open');
    });
    close.addEventListener('click', dismiss);
    dialog.addEventListener('click', (event) => { if (event.target === dialog) dismiss(); });

    function inPeriod(rawDate) {
      const value = String(rawDate || '').slice(0, 10);
      return (!applied.from || value >= applied.from) && (!applied.to || value <= applied.to);
    }
    function filter() {
      const fund = funds.find((item) => item.id === applied.fund);
      const input = payments.filter((item) => inPeriod(item.received_at) && (!fund || String(item.allocations || '').split(' | ').some((part) => part.startsWith(`${fund.name}: `))));
      const output = expenses.filter((item) => inPeriod(item.occurred_at) && (!fund || item.fund_id === fund.id));
      document.getElementById('ledger').hidden = applied.kind === 'out';
      document.getElementById('expense-history').hidden = applied.kind === 'in';
      document.dispatchEvent(new CustomEvent('orbia:ledger-filtered', { detail: { payments: input, expenses: output } }));
      const label = applied.kind === 'in' ? 'Entradas' : applied.kind === 'out' ? 'Saídas' : 'Entradas e saídas';
      summary.textContent = `${label} · ${fund?.name || 'Todos os fundos'}${applied.from ? ` · de ${date(applied.from)}` : ''}${applied.to ? ` até ${date(applied.to)}` : ''} · ${applied.kind === 'in' ? input.length : applied.kind === 'out' ? output.length : input.length + output.length} registro(s) carregado(s)`;
    }
    document.getElementById('ledger-filter-apply').addEventListener('click', () => {
      if (fields.from.value && fields.to.value && fields.from.value > fields.to.value) {
        feedback.textContent = 'A data inicial precisa ser anterior ou igual à data final.'; feedback.hidden = false; fields.from.focus(); return;
      }
      applied = Object.fromEntries(Object.entries(fields).map(([key, element]) => [key, element.value]));
      filter(); dismiss();
    });
    document.getElementById('ledger-filter-clear').addEventListener('click', () => {
      applied = { kind: 'all', fund: '', from: '', to: '' }; filter(); dismiss();
    });
    document.addEventListener('orbia:ledger-loaded', (event) => {
      ({ payments, expenses, funds } = event.detail);
      fields.fund.replaceChildren(node('option', '', 'Todos os fundos')); fields.fund.firstElementChild.value = '';
      for (const fund of funds) { const option = node('option', '', fund.name); option.value = fund.id; fields.fund.append(option); }
      filter();
    });
    window.Orbia.ready.then(() => {
      if (!['admin','syndic','finance','council'].includes(state.tenant?.role)) document.querySelector('.ledger-toolbar').hidden = true;
    }).catch(() => {});
  }

  operationTabs();
  balancePrivacy();
  localLedger();
})();
