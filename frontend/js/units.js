'use strict';

(() => {
  const { api, node, toast, state } = window.Orbia;
  const list = document.getElementById('unit-list');
  const form = document.getElementById('unit-form');
  const formCard = form?.closest('.surface-card');
  const listCard = list?.closest('.surface-card');

  function render(items) {
    document.getElementById('unit-total').textContent = String(items.length);
    list.replaceChildren();
    if (!items.length) {
      const empty = node('div', 'empty-state');
      empty.append(node('p', 'empty-title', 'Nenhuma unidade cadastrada.'), node('p', '', 'Cadastre a primeira unidade para organizar moradores e contribuições.'));
      list.append(empty);
      return;
    }
    for (const item of items) {
      const card = node('article', 'unit-row');
      const mark = node('span', 'unit-mark', item.block ? item.block.slice(0, 1).toUpperCase() : 'U');
      const copy = node('div', 'unit-copy');
      copy.append(node('strong', '', item.label), node('small', '', [item.type, item.block].filter(Boolean).join(' · ')));
      const residents = node('div', 'unit-residents');
      residents.append(node('span', 'metric-label', item.residentCount ? `${item.residentCount} morador${item.residentCount === 1 ? '' : 'es'}` : 'Sem morador vinculado'));
      residents.append(node('span', '', item.residents.length ? item.residents.join(', ') : 'Contato ainda não cadastrado'));
      const status = node('span', item.status === 'active' ? 'status-badge status-badge--good' : 'status-badge status-badge--neutral', item.status === 'active' ? 'Ativa' : 'Inativa');
      card.append(mark, copy, residents, status);
      list.append(card);
    }
  }

  async function load() {
    if (!state.tenant) return;
    const readable = ['admin','syndic','finance','council'].includes(state.tenant.role);
    if (!readable) {
      if (formCard) formCard.hidden = true;
      if (listCard) listCard.hidden = true;
      const notice = document.getElementById('global-error');
      notice.className = 'notice notice--soft';
      notice.textContent = 'Seu perfil não pode consultar a lista completa de unidades. A visualização individual de moradores será habilitada após o vínculo seguro da unidade à conta.';
      notice.hidden = false;
      return;
    }
    if (!['admin','syndic'].includes(state.tenant.role) && formCard) formCard.hidden = true;
    const result = await api('/api/units');
    render(result.items || []);
  }

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await api('/api/units', { method: 'POST', body: {
        label: data.get('label'), type: data.get('type'), block: data.get('block') || null,
        residentName: data.get('residentName') || null, phone: data.get('phone') || null,
        email: data.get('email') || null, notes: data.get('notes') || null
      } });
      form.reset();
      toast('Unidade salva no condomínio ativo.', 'success');
      await window.Orbia.refreshAfterSave(load);
    } catch (error) { toast(error.message, 'error'); }
    finally { button.disabled = false; }
  });

  window.Orbia.ready.then(load).catch((error) => toast(error.message, 'error'));
})();
