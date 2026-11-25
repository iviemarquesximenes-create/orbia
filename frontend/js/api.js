'use strict';

(() => {
  const state = { user: null, tenants: [], tenant: null, csrfToken: '' };

  function activeTenantId() {
    return state.tenant?.id || sessionStorage.getItem('orbia.tenantId') || null;
  }

  async function api(path, options = {}) {
    const method = String(options.method || 'GET').toUpperCase();
    const headers = new Headers(options.headers || {});
    if (options.body !== undefined && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    if (state.csrfToken && !['GET','HEAD','OPTIONS'].includes(method)) headers.set('X-Orbia-CSRF', state.csrfToken);
    const tenantId = activeTenantId();
    if (tenantId && path.startsWith('/api/') && !path.startsWith('/api/auth/')) headers.set('X-Orbia-Tenant-Id', tenantId);
    const response = await fetch(path, {
      method,
      headers,
      credentials: 'same-origin',
      body: options.body === undefined ? undefined : (typeof options.body === 'string' ? options.body : JSON.stringify(options.body))
    });
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await response.json() : { message: await response.text() };
    if (!response.ok) {
      const error = new Error(payload?.error?.message || payload?.message || 'Não foi possível concluir a solicitação.');
      error.status = response.status;
      error.code = payload?.error?.code || 'REQUEST_FAILED';
      throw error;
    }
    return payload;
  }

  function money(value) {
    const text = String(value ?? '0.00').trim().replace(',', '.');
    if (!/^[-]?\d+(?:\.\d{1,2})?$/.test(text)) return '—';
    const negative = text.startsWith('-');
    const unsigned = negative ? text.slice(1) : text;
    const [whole = '0', fraction = ''] = unsigned.split('.');
    let grouped;
    try { grouped = BigInt(whole).toLocaleString('pt-BR'); } catch { grouped = whole; }
    return `${negative ? '−' : ''}R$ ${grouped},${(fraction + '00').slice(0, 2)}`;
  }

  function date(value) {
    if (!value) return 'Sem data';
    const raw = String(value).slice(0, 10);
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (!match) return 'Sem data';
    return `${match[3]}/${match[2]}/${match[1]}`;
  }

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined && text !== null) element.textContent = String(text);
    return element;
  }

  function toast(message, type = 'info') {
    const region = document.getElementById('toast-region');
    document.dispatchEvent(new CustomEvent('orbia:feedback', { detail: { message, type } }));
    if (!region) return;
    const item = node('div', `toast toast--${type}`, message);
    region.append(item);
    window.setTimeout(() => item.remove(), 4200);
  }

  async function refreshAfterSave(refresh) {
    try { await refresh(); }
    catch {
      toast('Registro salvo. A lista não pôde ser atualizada agora. Recarregue a página para consultar; não repita o envio.', 'info');
    }
  }

  async function init() {
    try {
      const result = await api('/api/auth/me');
      state.user = result.user;
      state.tenants = Array.isArray(result.tenants) ? result.tenants : [];
      state.csrfToken = result.csrfToken || '';
      const storedId = sessionStorage.getItem('orbia.tenantId');
      state.tenant = state.tenants.find((item) => item.id === storedId) || state.tenants[0] || null;
      if (state.tenant) sessionStorage.setItem('orbia.tenantId', state.tenant.id);
      else sessionStorage.removeItem('orbia.tenantId');
      document.dispatchEvent(new CustomEvent('orbia:ready', { detail: state }));
      return state;
    } catch (error) {
      if (error.status === 401) {
        window.location.replace('/login.html');
        return state;
      }
      const region = document.getElementById('global-error');
      if (region) {
        region.hidden = false;
        region.textContent = error.message;
      }
      throw error;
    }
  }

  window.Orbia = {
    state,
    api,
    money,
    date,
    node,
    toast,
    refreshAfterSave,
    activeTenantId,
    ready: Promise.resolve(null),
    setTenant(tenantId) {
      if (!state.tenants.some((tenant) => tenant.id === tenantId)) return;
      sessionStorage.setItem('orbia.tenantId', tenantId);
      window.location.reload();
    }
  };
  window.Orbia.ready = init();
})();
