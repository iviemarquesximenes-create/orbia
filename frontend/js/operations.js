'use strict';

(() => {
  const { api, money, date, node, toast, state } = window.Orbia;
  const labels = { necessary: 'Necessária', requested: 'Solicitada', quoting: 'Em orçamento', awaiting_approval: 'Aguardando aprovação', scheduled: 'Agendada', in_progress: 'Em andamento', completed: 'Realizada', paid: 'Paga', cancelled: 'Cancelada', open: 'Aberta', analyzing: 'Em análise', awaiting_quote: 'Aguardando orçamento', resolved: 'Resolvida', closed: 'Encerrada', draft: 'Rascunho', pending_approval: 'Aguardando aprovação', published: 'Publicada', received: 'Recebido', reviewing: 'Em análise', approved: 'Aprovado', rejected: 'Rejeitado', contracted: 'Contratado' };
  const containers = {
    suppliers: document.getElementById('supplier-list'), maintenance: document.getElementById('maintenance-list'),
    quotes: document.getElementById('quote-list'), occurrences: document.getElementById('occurrence-list'), announcements: document.getElementById('announcement-list')
  };

  function showEmpty(container, text) { container.replaceChildren(node('p', 'empty-inline', text)); }
  function addOperationRow(container, title, description, status, controls = []) {
    const row = node('article', 'operation-row');
    const copy = node('div');
    copy.append(node('strong', '', title), node('small', '', description || 'Sem detalhe adicional'));
    const right = node('div', 'table-actions');
    right.append(node('span', 'operation-status', status));
    for (const control of controls) right.append(control);
    row.append(copy, right);
    container.append(row);
  }

  function renderSuppliers(items) {
    const container = containers.suppliers; container.replaceChildren();
    const select = document.getElementById('quote-supplier-select');
    if (select) {
      const placeholder = node('option', '', 'Sem vínculo'); placeholder.value = ''; select.replaceChildren(placeholder);
      for (const item of items) { const option = node('option', '', item.name); option.value = item.id; select.append(option); }
    }
    if (!items.length) return showEmpty(container, 'Ainda não há prestadores cadastrados.');
    for (const item of items.slice(0, 8)) addOperationRow(container, item.name, [item.company, item.category, item.phone].filter(Boolean).join(' · '), item.status === 'active' ? 'Ativo' : 'Inativo');
  }
  function renderMaintenance(items) {
    const container = containers.maintenance; container.replaceChildren();
    if (!items.length) return showEmpty(container, 'Nenhuma manutenção registrada.');
    for (const item of items.slice(0, 8)) addOperationRow(container, item.name, [item.description || item.category, item.supplier_name, item.scheduled_for ? `prevista ${date(item.scheduled_for)}` : null, item.amount ? money(item.amount) : null].filter(Boolean).join(' · '), labels[item.status] || item.status);
  }
  function renderQuotes(items) {
    const container = containers.quotes; container.replaceChildren();
    if (!items.length) return showEmpty(container, 'Nenhum orçamento registrado.');
    for (const item of items.slice(0, 8)) addOperationRow(container, item.service_name, [item.description, item.supplier_name, item.amount ? money(item.amount) : null, item.valid_until ? `válido até ${date(item.valid_until)}` : null].filter(Boolean).join(' · '), labels[item.status] || item.status);
  }
  function renderOccurrences(items) {
    const container = containers.occurrences; container.replaceChildren();
    if (!items.length) return showEmpty(container, 'Nenhuma ocorrência registrada.');
    for (const item of items.slice(0, 8)) addOperationRow(container, item.title, [item.category, item.location, item.description].filter(Boolean).join(' · '), labels[item.status] || item.status);
  }
  function renderAnnouncements(items) {
    const container = containers.announcements; container.replaceChildren();
    if (!items.length) return showEmpty(container, 'Nenhum comunicado registrado.');
    for (const item of items.slice(0, 8)) {
      const actions = [];
      if (item.status === 'draft' && ['admin','syndic'].includes(state.tenant?.role)) {
        const publish = node('button', 'button button--tiny button--outline', 'Publicar'); publish.type = 'button';
        publish.addEventListener('click', async () => {
          try { await api(`/api/announcements/${item.id}/publish`, { method: 'POST', body: {} }); toast('Comunicado publicado no ORBIA.', 'success'); await window.Orbia.refreshAfterSave(load); }
          catch (error) { toast(error.message, 'error'); }
        });
        actions.push(publish);
      }
      addOperationRow(container, item.title, `${item.category} · ${String(item.body || '').slice(0, 90)}`, labels[item.status] || item.status, actions);
    }
  }

  async function loadList(key, url, render) {
    try { const result = await api(url); render(result.items || []); }
    catch (error) { showEmpty(containers[key], error.status === 403 ? 'Seu perfil não tem acesso a esta lista.' : error.message); }
  }
  async function load() {
    if (!state.tenant) return;
    await Promise.all([
      loadList('suppliers','/api/suppliers',renderSuppliers), loadList('maintenance','/api/maintenance',renderMaintenance),
      loadList('quotes','/api/quotes',renderQuotes), loadList('occurrences','/api/occurrences',renderOccurrences),
      loadList('announcements','/api/announcements',renderAnnouncements)
    ]);
  }

  function bindForm(formId, endpoint, buildPayload, successText) {
    const form = document.getElementById(formId);
    form?.addEventListener('submit', async (event) => {
      event.preventDefault(); const data = new FormData(form); const button = form.querySelector('button[type="submit"]'); button.disabled = true;
      try { await api(endpoint, { method: 'POST', body: buildPayload(data) }); form.reset(); toast(successText, 'success'); await window.Orbia.refreshAfterSave(load); }
      catch (error) { toast(error.message, 'error'); }
      finally { button.disabled = false; }
    });
  }

  bindForm('supplier-form', '/api/suppliers', (d) => ({ name: d.get('name'), category: d.get('category'), phone: d.get('phone') || null, company: d.get('company') || null }), 'Prestador salvo.');
  bindForm('maintenance-form', '/api/maintenance', (d) => ({ name: d.get('name'), category: d.get('category'), scheduledFor: d.get('scheduledFor') || null, amount: d.get('amount') || null, description: d.get('description') || null, isEstimate: Boolean(d.get('scheduledFor') || d.get('amount')) }), 'Manutenção registrada como solicitação.');
  bindForm('occurrence-form', '/api/occurrences', (d) => ({ title: d.get('title'), category: d.get('category'), location: d.get('location') || null, urgency: d.get('urgency'), description: d.get('description') || null }), 'Ocorrência registrada.');
  bindForm('quote-form', '/api/quotes', (d) => ({ serviceName: d.get('serviceName'), amount: d.get('amount') || null, supplierId: d.get('supplierId') || null, validUntil: d.get('validUntil') || null, conditions: d.get('conditions') || null }), 'Orçamento registrado.');
  bindForm('announcement-form', '/api/announcements', (d) => ({ title: d.get('title'), category: d.get('category'), body: d.get('body') }), 'Comunicado salvo como rascunho.');

  window.Orbia.ready.then(() => {
    const role = state.tenant?.role;
    if (!['admin','syndic','finance','employee'].includes(role)) {
      for (const id of ['supplier-form','maintenance-form','quote-form']) document.getElementById(id)?.setAttribute('hidden', '');
    }
    if (!['admin','syndic','resident','employee'].includes(role)) document.getElementById('occurrence-form')?.setAttribute('hidden', '');
    if (!['admin','syndic'].includes(role)) document.getElementById('announcement-form')?.setAttribute('hidden', '');
    return load();
  }).catch((error) => toast(error.message, 'error'));
})();
