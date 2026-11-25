'use strict';

(() => {
  const { api, node, toast, state } = window.Orbia;
  const list = document.getElementById('review-list');
  const form = document.getElementById('review-form');
  const labels = { pending: 'Aguardando análise', approved: 'Revisão confirmada', rejected: 'Rejeitado', ignored: 'Ignorado', clarification_requested: 'Esclarecimento solicitado' };

  function render(items) {
    document.getElementById('review-count').textContent = `${items.length} ${items.length === 1 ? 'item' : 'itens'}`;
    list.replaceChildren();
    if (!items.length) {
      const empty = node('div', 'empty-state');
      empty.append(node('p', 'empty-title', 'A fila está vazia.'), node('p', '', 'Mensagens de canais configurados ou itens inseridos manualmente aparecerão aqui para revisão.'));
      list.append(empty); return;
    }
    for (const item of items) {
      const card = node('article', 'review-item');
      const head = node('div', 'review-item-head');
      head.append(node('h3', '', item.summary), node('span', item.status === 'pending' ? 'status-badge status-badge--review' : 'status-badge status-badge--neutral', labels[item.status] || item.status));
      card.append(head, node('p', '', `Categoria: ${item.category} · Origem: ${item.source_channel || 'manual'} · ${new Date(item.created_at).toLocaleDateString('pt-BR')}`));
      const sourceText = item.payload?.text || item.payload?.sourceText || '';
      if (sourceText) card.append(node('p', '', `Origem registrada: ${sourceText}`));
      if (item.status === 'pending' && ['admin','syndic','finance'].includes(state.tenant?.role)) {
        const actions = node('div', 'review-item-actions');
        for (const [action, label] of [['approve','Confirmar revisão'],['reject','Rejeitar'],['ignore','Ignorar'],['clarify','Pedir esclarecimento']]) {
          const button = node('button', action === 'approve' ? 'button button--tiny button--primary' : 'button button--tiny button--outline', label);
          button.type = 'button'; button.addEventListener('click', () => review(item.id, action)); actions.append(button);
        }
        card.append(actions);
      }
      list.append(card);
    }
  }

  async function load() {
    if (!state.tenant) return;
    if (!['admin','syndic','finance'].includes(state.tenant.role)) {
      list.replaceChildren(node('p', 'empty-inline', 'Este perfil não pode consultar mensagens e dados sensíveis da triagem.'));
      document.getElementById('review-count').textContent = 'Acesso restrito';
      return;
    }
    const result = await api('/api/review'); render(result.items || []);
  }
  async function review(itemId, action) {
    try { await api(`/api/review/${itemId}/action`, { method: 'POST', body: { action } }); toast('Decisão de triagem registrada. Nenhum movimento financeiro foi criado.', 'success'); await window.Orbia.refreshAfterSave(load); }
    catch (error) { toast(error.message, 'error'); }
  }

  form?.addEventListener('submit', async (event) => {
    event.preventDefault(); const data = new FormData(form); const button = form.querySelector('button[type="submit"]'); button.disabled = true;
    try { await api('/api/review', { method: 'POST', body: { category: data.get('category'), summary: data.get('summary'), payload: { sourceText: data.get('source') } } }); form.reset(); toast('Item registrado para análise humana.', 'success'); await window.Orbia.refreshAfterSave(load); }
    catch (error) { toast(error.message, 'error'); }
    finally { button.disabled = false; }
  });

  window.Orbia.ready.then(() => {
    if (!['admin','syndic','finance'].includes(state.tenant?.role)) form?.setAttribute('hidden', '');
    return load();
  }).catch((error) => toast(error.message, 'error'));
})();
