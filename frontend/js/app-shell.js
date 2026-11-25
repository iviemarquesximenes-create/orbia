'use strict';

(() => {
  const shell = document.querySelector('.app-shell');
  const desktopNav = document.querySelector('.primary-nav');
  const topbar = document.querySelector('.topbar');
  const orbia = window.Orbia;

  // The shell is deliberately inert on pages such as login.html.
  if (!shell || !desktopNav || !topbar || !orbia) return;
  if (shell.dataset.orbiaShellReady === 'true') return;
  shell.dataset.orbiaShellReady = 'true';

  const iconNames = {
    dashboard: 'dashboard',
    financial: 'financial',
    units: 'units',
    operations: 'operations',
    intelligence: 'intelligence',
    settings: 'settings'
  };
  const mobileTabs = [
    { key: 'dashboard', label: 'Início' },
    { key: 'financial', label: 'Financeiro' },
    { key: 'units', label: 'Unidades' },
    { key: 'operations', label: 'Operação' }
  ];
  const svgNamespace = 'http://www.w3.org/2000/svg';
  const boundTenantSelectors = new WeakSet();
  const boundLogoutButtons = new WeakSet();
  const boundAccountMenus = new WeakSet();
  const roles = { admin: 'Administrador', syndic: 'Síndico', finance: 'Financeiro', council: 'Conselho', employee: 'Funcionário', resident: 'Morador' };

  function roleLabel(role) { return roles[role] || 'Sem condomínio'; }

  function text(value, fallback = '') {
    const valueText = String(value ?? '').trim();
    return valueText || fallback;
  }

  function svgIcon(name, className = 'nav-icon') {
    const svg = document.createElementNS(svgNamespace, 'svg');
    svg.setAttribute('class', className);
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.7');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');

    const use = document.createElementNS(svgNamespace, 'use');
    // The build synchronizes this content hash with every static SVG use.
    use.setAttribute('href', `/assets/orbia-icons.svg?v=138e9755275f#${name}`);
    svg.append(use);
    return svg;
  }

  function pageLinks() {
    return Array.from(desktopNav.querySelectorAll('a[data-page-link]')).map((link) => ({
      key: link.dataset.pageLink,
      href: link.getAttribute('href') || '/',
      label: text(link.textContent, link.dataset.pageLink),
      source: link
    }));
  }

  function createSheet(id, title, triggerLabel) {
    const dialog = document.createElement('dialog');
    dialog.className = 'sheet-dialog';
    dialog.id = id;
    dialog.setAttribute('aria-labelledby', `${id}-title`);

    const header = document.createElement('div');
    header.className = 'sheet-header';
    const heading = document.createElement('h2');
    heading.className = 'sheet-title';
    heading.id = `${id}-title`;
    heading.textContent = title;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'sheet-close';
    close.setAttribute('aria-label', triggerLabel || 'Fechar');
    close.textContent = '×';
    header.append(heading, close);

    const body = document.createElement('div');
    body.className = 'sheet-body';
    const choices = document.createElement('div');
    choices.className = 'sheet-choices';
    body.append(choices);
    dialog.append(header, body);
    document.body.append(dialog);

    close.addEventListener('click', () => closeSheet(dialog));
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      closeSheet(dialog);
    });
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) closeSheet(dialog);
    });
    dialog.addEventListener('close', () => finishSheetClose(dialog));

    return { dialog, choices };
  }

  function dialogIsOpen(dialog) {
    return Boolean(dialog?.open || dialog?.hasAttribute('open'));
  }

  function syncDialogState() {
    const hasOpenDialog = Array.from(document.querySelectorAll('dialog'))
      .some((dialog) => dialogIsOpen(dialog));
    document.body.classList.toggle('dialog-open', hasOpenDialog);
  }

  function setDialogTriggers(dialog, expanded) {
    if (!dialog?.id) return;
    for (const trigger of document.querySelectorAll(`[aria-controls="${dialog.id}"]`)) {
      trigger.setAttribute('aria-expanded', String(expanded));
    }
  }

  function finishSheetClose(dialog) {
    syncDialogState();
    setDialogTriggers(dialog, false);
    const returnFocus = dialog.__orbiaReturnFocus;
    dialog.__orbiaReturnFocus = null;
    if (returnFocus?.isConnected && typeof returnFocus.focus === 'function') {
      window.setTimeout(() => {
        try { returnFocus.focus({ preventScroll: true }); } catch { returnFocus.focus(); }
      }, 0);
    }
  }

  function closeSheet(dialog) {
    if (!dialog) return;
    if (!dialogIsOpen(dialog)) {
      finishSheetClose(dialog);
      return;
    }

    try {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    } catch {
      dialog.removeAttribute('open');
    }

    // Older DOM implementations may not dispatch close for a manually opened dialog.
    if (dialogIsOpen(dialog)) dialog.removeAttribute('open');
    if (!dialogIsOpen(dialog)) finishSheetClose(dialog);
  }

  function closeOtherSheets(except) {
    for (const dialog of document.querySelectorAll('dialog.sheet-dialog')) {
      if (dialog !== except && dialogIsOpen(dialog)) closeSheet(dialog);
    }
  }

  function openSheet(dialog, trigger) {
    if (!dialog) return;
    closeOtherSheets(dialog);
    if (dialogIsOpen(dialog)) return;

    dialog.__orbiaReturnFocus = trigger || document.activeElement;
    try {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    } catch {
      dialog.setAttribute('open', '');
    }
    setDialogTriggers(dialog, true);
    syncDialogState();
    const closeButton = dialog.querySelector('.sheet-close');
    if (closeButton) window.setTimeout(() => closeButton.focus(), 0);
  }

  function createSheetOption({ element, label, icon, meta }) {
    element.classList.add('sheet-option');
    if (icon && iconNames[icon]) element.append(svgIcon(iconNames[icon], 'sheet-option-icon'));
    const copy = document.createElement('span');
    copy.className = 'sheet-option-copy';
    const title = document.createElement('span');
    title.className = 'sheet-option-label';
    title.textContent = label;
    copy.append(title);
    if (meta) {
      const detail = document.createElement('small');
      detail.className = 'sheet-option-meta';
      detail.textContent = meta;
      copy.append(detail);
    }
    element.append(copy);
    return element;
  }

  function createMobileTenantTrigger(tenantSheet) {
    const brand = document.createElement('div');
    brand.className = 'mobile-app-brand';

    const brandMark = document.querySelector('.sidebar .brand-mark')?.cloneNode(true);
    if (brandMark) brand.append(brandMark);

    const wordmark = document.createElement('span');
    wordmark.className = 'mobile-wordmark';
    wordmark.textContent = 'ORBIA';
    brand.append(wordmark);

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'mobile-tenant-trigger';
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.setAttribute('aria-controls', tenantSheet.dialog.id);
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-label', 'Selecionar condomínio ativo');

    const tenantName = document.createElement('span');
    tenantName.className = 'mobile-tenant-name';
    tenantName.textContent = 'Carregando…';
    const chevron = document.createElement('span');
    chevron.className = 'mobile-tenant-chevron';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.textContent = '⌄';
    trigger.append(tenantName, chevron);
    trigger.addEventListener('click', () => openSheet(tenantSheet.dialog, trigger));
    brand.append(trigger);

    return { brand, trigger, tenantName };
  }

  function buildMobileAccount(settingsHref) {
    const account = document.createElement('details');
    account.className = 'mobile-account';

    const summary = document.createElement('summary');
    summary.setAttribute('aria-label', 'Abrir perfil e configurações');
    const avatar = document.createElement('span');
    avatar.className = 'mobile-account-avatar';
    avatar.textContent = 'O';
    summary.append(avatar);

    const menu = document.createElement('div');
    menu.className = 'mobile-account-menu';
    menu.id = 'mobile-account-menu';
    const accountName = document.createElement('strong');
    accountName.className = 'mobile-account-name';
    accountName.textContent = 'Conta ORBIA';
    menu.append(accountName);
    const accountRole = document.createElement('span');
    accountRole.className = 'mobile-account-role';
    accountRole.textContent = 'Carregando perfil';
    menu.append(accountRole);

    const settingsLink = document.createElement('a');
    settingsLink.href = settingsHref || '/pages/settings.html';
    settingsLink.dataset.pageLink = 'settings';
    settingsLink.append(svgIcon('settings', 'account-menu-icon'));
    const settingsText = document.createElement('span');
    settingsText.textContent = 'Configurações';
    settingsLink.append(settingsText);
    menu.append(settingsLink);

    const logout = document.createElement('button');
    logout.type = 'button';
    logout.className = 'logout-button';
    const logoutText = document.createElement('span');
    logoutText.textContent = 'Encerrar sessão';
    logout.append(logoutText);
    menu.append(logout);

    account.append(summary, menu);
    summary.setAttribute('aria-controls', menu.id);
    summary.setAttribute('aria-expanded', 'false');
    account.addEventListener('toggle', () => summary.setAttribute('aria-expanded', String(account.open)));
    if (!boundAccountMenus.has(account)) {
      document.addEventListener('click', (event) => {
        if (!account.contains(event.target)) account.open = false;
      });
      boundAccountMenus.add(account);
    }

    return { account, accountName, accountRole, avatar };
  }

  function buildMobileChrome() {
    const links = pageLinks();
    const linkByKey = new Map(links.map((link) => [link.key, link]));
    const settingsHref = linkByKey.get('settings')?.href || '/pages/settings.html';
    const menuSheet = createSheet('mobile-menu-sheet', 'Menu', 'Fechar menu');
    const tenantSheet = createSheet('mobile-tenant-sheet', 'Selecionar condomínio', 'Fechar seleção de condomínio');
    const tenantChrome = createMobileTenantTrigger(tenantSheet);
    const accountChrome = buildMobileAccount(settingsHref);

    topbar.insertBefore(tenantChrome.brand, topbar.firstChild);
    topbar.append(accountChrome.account);

    for (const link of desktopNav.querySelectorAll('a[data-page-link]')) {
      const icon = iconNames[link.dataset.pageLink];
      const marker = link.querySelector('.nav-marker');
      if (marker && icon) {
        marker.replaceChildren(svgIcon(icon));
        marker.classList.add('nav-marker--icon');
      }
    }

    const tabbar = document.createElement('nav');
    tabbar.className = 'mobile-tabbar';
    tabbar.setAttribute('aria-label', 'Navegação principal');
    for (const tabDefinition of mobileTabs) {
      const source = linkByKey.get(tabDefinition.key);
      if (!source) continue;
      const tab = document.createElement('a');
      tab.setAttribute('href', source.href);
      tab.dataset.pageLink = tabDefinition.key;
      tab.setAttribute('aria-label', tabDefinition.label);
      tab.append(svgIcon(iconNames[tabDefinition.key], 'mobile-tab-icon'));
      const label = document.createElement('span');
      label.textContent = tabDefinition.label;
      tab.append(label);
      tabbar.append(tab);
    }

    const menuTrigger = document.createElement('button');
    menuTrigger.type = 'button';
    menuTrigger.className = 'mobile-tab-menu';
    menuTrigger.dataset.pageLink = 'menu';
    menuTrigger.setAttribute('aria-label', 'Abrir menu de módulos');
    menuTrigger.setAttribute('aria-haspopup', 'dialog');
    menuTrigger.setAttribute('aria-controls', menuSheet.dialog.id);
    menuTrigger.setAttribute('aria-expanded', 'false');
    // The sprite currently has no generic menu glyph; settings is the module hub glyph.
    menuTrigger.append(svgIcon(iconNames.settings, 'mobile-tab-icon'));
    const menuLabel = document.createElement('span');
    menuLabel.textContent = 'Menu';
    menuTrigger.append(menuLabel);
    menuTrigger.addEventListener('click', () => openSheet(menuSheet.dialog, menuTrigger));
    tabbar.append(menuTrigger);
    document.body.append(tabbar);

    const legacyMenuButton = document.getElementById('mobile-menu-button');
    if (legacyMenuButton) {
      legacyMenuButton.setAttribute('aria-haspopup', 'dialog');
      legacyMenuButton.setAttribute('aria-controls', menuSheet.dialog.id);
      legacyMenuButton.addEventListener('click', () => openSheet(menuSheet.dialog, legacyMenuButton));
    }

    for (const link of links) {
      const option = document.createElement('a');
      option.setAttribute('href', link.href);
      option.dataset.pageLink = link.key;
      createSheetOption({ element: option, label: link.label, icon: link.key });
      menuSheet.choices.append(option);
    }

    return { tenantSheet, tenantChrome, menuSheet, accountChrome };
  }

  function renderTenantChoices(sheet, state) {
    if (!sheet?.choices) return;
    sheet.choices.replaceChildren();
    const tenants = Array.isArray(state?.tenants) ? state.tenants : [];

    if (!tenants.length) {
      const empty = document.createElement('p');
      empty.className = 'sheet-empty';
      empty.textContent = 'Nenhum condomínio disponível.';
      sheet.choices.append(empty);

      const onboarding = document.getElementById('tenant-onboarding');
      if (onboarding) {
        const onboardingLink = document.createElement('a');
        onboardingLink.href = '#tenant-onboarding';
        createSheetOption({ element: onboardingLink, label: 'Criar primeiro condomínio', icon: 'units' });
        onboardingLink.addEventListener('click', () => {
          closeSheet(sheet.dialog);
          window.setTimeout(() => onboarding.querySelector('input, button')?.focus(), 0);
        });
        sheet.choices.append(onboardingLink);
      }
      return;
    }

    for (const tenant of tenants) {
      const option = document.createElement('button');
      option.type = 'button';
      const tenantId = tenant?.id;
      const selected = state.tenant && String(state.tenant.id) === String(tenantId);
      option.setAttribute('aria-pressed', String(Boolean(selected)));
      createSheetOption({
        element: option,
        label: text(tenant?.name, 'Condomínio sem nome'),
        icon: 'units',
        meta: selected ? 'Condomínio ativo' : ''
      });
      option.addEventListener('click', () => {
        const knownTenant = (Array.isArray(state.tenants) ? state.tenants : [])
          .find((item) => String(item?.id) === String(tenantId));
        if (!knownTenant) return;
        closeSheet(sheet.dialog);
        if (typeof orbia.setTenant === 'function') orbia.setTenant(knownTenant.id);
      });
      sheet.choices.append(option);
    }
  }

  function updateActiveNavigation() {
    const page = document.body.dataset.page || '';
    const menuIsCurrent = page === 'intelligence' || page === 'settings';
    for (const item of document.querySelectorAll('[data-page-link]')) {
      const key = item.dataset.pageLink;
      const isCurrent = key === page || (key === 'menu' && menuIsCurrent);
      if (isCurrent) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    }
  }

  function populateDesktopTenantSelectors(state) {
    const tenants = Array.isArray(state?.tenants) ? state.tenants : [];
    for (const select of document.querySelectorAll('select.tenant-select')) {
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = tenants.length ? 'Selecione condomínio' : 'Nenhum condomínio';
      select.replaceChildren(placeholder);
      for (const tenant of tenants) {
        const option = document.createElement('option');
        option.value = String(tenant?.id ?? '');
        option.textContent = text(tenant?.name, 'Condomínio sem nome');
        select.append(option);
      }
      select.value = state?.tenant ? String(state.tenant.id) : '';
      select.disabled = tenants.length < 2;
      if (boundTenantSelectors.has(select)) continue;
      boundTenantSelectors.add(select);
      select.addEventListener('change', () => {
        const knownTenant = tenants.find((tenant) => String(tenant?.id) === select.value);
        if (knownTenant && typeof orbia.setTenant === 'function') orbia.setTenant(knownTenant.id);
      });
    }
  }

  function updateGreeting(state) {
    const displayName = text(state?.user?.name, 'Usuário');
    for (const greeting of document.querySelectorAll('.dashboard-greeting')) {
      const nameTarget = greeting.querySelector('[data-greeting-name], .greeting-name');
      if (nameTarget) {
        nameTarget.textContent = displayName;
        continue;
      }
      const prefix = text(greeting.dataset.greetingPrefix, 'Olá');
      greeting.textContent = `${prefix}, ${displayName}`;
    }
  }

  function updateIdentity(state, chrome) {
    const tenants = Array.isArray(state?.tenants) ? state.tenants : [];
    populateDesktopTenantSelectors(state);
    const activeTenantName = text(state?.tenant?.name, 'Crie seu primeiro condomínio');
    for (const element of document.querySelectorAll('.tenant-name')) element.textContent = activeTenantName;
    for (const element of document.querySelectorAll('.current-user')) {
      element.textContent = text(state?.user?.name, 'Usuário');
    }
    for (const element of document.querySelectorAll('.role-label')) {
      element.textContent = roleLabel(state?.tenant?.role);
    }
    for (const badge of document.querySelectorAll('.demo-badge')) badge.hidden = !state?.tenant?.isDemo;

    const name = text(state?.user?.name, 'Conta ORBIA');
    const initial = Array.from(name)[0]?.toLocaleUpperCase('pt-BR') || 'O';
    const accountName = chrome?.accountChrome?.accountName || document.querySelector('.mobile-account-name');
    const accountRole = chrome?.accountChrome?.accountRole || document.querySelector('.mobile-account-role');
    const avatar = chrome?.accountChrome?.avatar || document.querySelector('.mobile-account-avatar');
    if (accountName) accountName.textContent = name;
    if (accountRole) accountRole.textContent = roleLabel(state?.tenant?.role);
    if (avatar) avatar.textContent = initial;
    for (const desktopAvatar of document.querySelectorAll('.user-avatar')) desktopAvatar.textContent = initial;

    if (chrome?.tenantChrome?.tenantName) {
      chrome.tenantChrome.tenantName.textContent = tenants.length ? activeTenantName : 'Nenhum condomínio';
      chrome.tenantChrome.trigger.disabled = tenants.length === 0;
      chrome.tenantChrome.trigger.setAttribute('aria-label', tenants.length
        ? `Selecionar condomínio ativo: ${activeTenantName}`
        : 'Nenhum condomínio; crie seu primeiro condomínio no início');
      chrome.tenantChrome.trigger.title = tenants.length
        ? 'Selecionar condomínio'
        : 'Crie seu primeiro condomínio no início';
    }

    renderTenantChoices(chrome?.tenantSheet, state);
    updateGreeting(state);
    updateActiveNavigation();
    if (!tenants.length && document.body.dataset.page !== 'dashboard') window.location.replace('/');
  }

  function connectActions() {
    for (const button of document.querySelectorAll('.logout-button')) {
      if (boundLogoutButtons.has(button)) continue;
      boundLogoutButtons.add(button);
      button.addEventListener('click', async () => {
        const account = button.closest('.mobile-account');
        if (account) account.open = false;
        try {
          await orbia.api('/api/auth/logout', { method: 'POST' });
        } finally {
          window.location.assign('/login.html');
        }
      });
    }
  }

  const chrome = buildMobileChrome();
  connectActions();
  updateActiveNavigation();

  if (orbia.ready && typeof orbia.ready.then === 'function') {
    orbia.ready.then((state) => updateIdentity(state, chrome)).catch(() => {
      // api.js already exposes authentication/network errors through #global-error.
    });
  }
})();
