'use strict';

(() => {
  const { api, node, toast, state } = window.Orbia;
  const tenantsList = document.getElementById('tenant-list');
  const integrationsList = document.getElementById('integration-list');
  const form = document.getElementById('integration-form');

  function showEmpty(container, text) { container.replaceChildren(node('p', 'empty-inline', text)); }

  function renderTenants(items) {
    tenantsList.replaceChildren();
    if (!items.length) return showEmpty(tenantsList, 'Nenhum condomínio associado. Crie o primeiro na Visão geral.');
    for (const tenant of items) {
      const row = node('article', 'integration-row');
      const copy = node('div');
      copy.append(node('strong', '', tenant.name), node('small', '', `${tenant.role} · ${tenant.address || 'Endereço não cadastrado'}`));
      const badge = tenant.isDemo ? node('span', 'badge badge--demo', 'DEMO') : node('span', 'status-badge status-badge--good', 'Ativo');
      row.append(copy, badge);
      tenantsList.append(row);
    }
  }

  function renderIntegrations(items) {
    integrationsList.replaceChildren();
    const badge = document.getElementById('integration-config-badge');
    if (!items.length) {
      showEmpty(integrationsList, 'Nenhuma instância registrada. A integração permanece opcional.');
      if (badge) badge.textContent = 'Pendente';
      return;
    }
    const anyActive = items.some((item) => item.status === 'active');
    if (badge) badge.textContent = anyActive ? 'Entrada habilitada' : 'Pendente';
    for (const item of items) {
      const row = node('article', 'integration-row');
      const copy = node('div');
      copy.append(node('strong', '', item.display_name), node('small', '', `Instância: ${item.instance_name} · Entrada n8n: ${item.inboundConfigured ? 'segredo configurado' : 'pendente'} · Armazenamento de anexos: ${item.attachmentsConfigured ? 'credencial configurada' : 'pendente'} · Saída: não implementada`));
      const status = node('span', 'integration-state', item.status === 'active' ? 'Entrada habilitada' : item.status === 'error' ? 'Com erro' : 'Pendente');
      row.append(copy, status);
      if (item.status === 'pending' && item.inboundConfigured && ['admin','syndic'].includes(state.tenant?.role)) {
        const activate = node('button', 'button button--tiny button--outline', 'Ativar entrada');
        activate.type = 'button';
        activate.addEventListener('click', async () => {
          try { await api(`/api/integrations/${item.id}/activate`, { method: 'POST', body: {} }); toast('Integração de entrada ativada. Valide o workflow n8n antes de enviar eventos reais.', 'success'); await window.Orbia.refreshAfterSave(loadIntegrations); }
          catch (error) { toast(error.message, 'error'); }
        });
        row.append(activate);
      }
      integrationsList.append(row);
    }
  }

  async function loadIntegrations() {
    try { const result = await api('/api/integrations'); renderIntegrations(result.items || []); }
    catch (error) {
      if (error.status === 403) {
        if (form) form.hidden = true;
        showEmpty(integrationsList, 'Seu perfil não pode administrar integrações.');
      } else showEmpty(integrationsList, error.message);
    }
  }

  async function load() {
    const [tenantsResult, authResult] = await Promise.all([
      api('/api/tenants'), api('/api/auth/config')
    ]);
    renderTenants(tenantsResult.items || []);
    const authStatus = document.getElementById('auth-status');
    if (authStatus) {
      authStatus.textContent = authResult.configured ? 'Configurado' : 'Pendente';
      authStatus.className = authResult.configured ? 'status-badge status-badge--good' : 'status-badge status-badge--review';
    }
    await loadIntegrations();
  }

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await api('/api/integrations', { method: 'POST', body: { instanceName: data.get('instanceName'), displayName: data.get('displayName') || 'Evolution API + n8n' } });
      form.reset();
      const displayName = form.querySelector('[name="displayName"]'); if (displayName) displayName.value = 'Evolution API + n8n';
      toast('Instância registrada como pendente. Configure o segredo no servidor e o workflow n8n antes de ativar.', 'success');
      await window.Orbia.refreshAfterSave(loadIntegrations);
    } catch (error) { toast(error.message, 'error'); }
    finally { button.disabled = false; }
  });

  window.Orbia.ready.then(() => {
    if (!['admin','syndic'].includes(state.tenant?.role) && form) form.hidden = true;
    return load();
  }).catch((error) => toast(error.message, 'error'));
})();
