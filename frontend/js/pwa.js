'use strict';

(() => {
  const standaloneQuery = window.matchMedia?.('(display-mode: standalone)');
  let installedInThisContext = false;
  let deferredPrompt = null;
  let promptInProgress = false;
  let returnFocus = null;
  const dialog = document.getElementById('pwa-install-dialog');
  const instructions = document.querySelectorAll('[data-pwa-instructions]');
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  function isStandalone() {
    return installedInThisContext || Boolean(standaloneQuery?.matches) || navigator.standalone === true;
  }

  function status(message) {
    for (const element of document.querySelectorAll('[data-pwa-status]')) element.textContent = message;
  }

  function updateInstallationUI() {
    const installed = isStandalone();
    document.documentElement.classList.toggle('pwa-standalone', installed);
    for (const button of document.querySelectorAll('[data-pwa-install]')) {
      button.hidden = installed;
      button.disabled = promptInProgress;
    }
    for (const element of document.querySelectorAll('[data-pwa-install-card]')) element.hidden = installed;
    if (installed) status(standaloneQuery?.matches || navigator.standalone === true
      ? 'Você está usando o ORBIA em modo aplicativo.'
      : 'Instalação concluída. Abra o ORBIA pelo ícone na tela inicial.');
  }

  function showInstructions(trigger) {
    if (!dialog || typeof dialog.showModal !== 'function') {
      status(isIOS
        ? 'No Safari: Compartilhar → Adicionar à Tela de Início → Abrir como App da Web → Adicionar.'
        : 'No menu do navegador, procure Instalar aplicativo ou Adicionar à tela inicial.');
      return;
    }
    returnFocus = trigger;
    const selectedGuide = isIOS ? 'ios' : 'browser';
    for (const instruction of instructions) instruction.hidden = instruction.dataset.pwaInstructions !== selectedGuide;
    if (!dialog.open) dialog.showModal();
    document.getElementById('pwa-install-title')?.focus();
  }

  async function install(trigger) {
    if (isStandalone() || promptInProgress) return;
    if (!deferredPrompt) { showInstructions(trigger); return; }
    const prompt = deferredPrompt;
    deferredPrompt = null;
    promptInProgress = true;
    updateInstallationUI();
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      status(choice?.outcome === 'accepted'
        ? 'Pedido de instalação aceito. Aguarde o navegador concluir.'
        : 'Instalação não concluída. Você pode continuar usando o ORBIA no navegador.');
    } catch {
      status('O navegador não concluiu a instalação. Veja como adicionar manualmente.');
      showInstructions(trigger);
    } finally {
      promptInProgress = false;
      updateInstallationUI();
    }
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    updateInstallationUI();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installedInThisContext = true;
    if (dialog?.open) dialog.close();
    updateInstallationUI();
  });
  standaloneQuery?.addEventListener?.('change', updateInstallationUI);
  window.addEventListener('pageshow', updateInstallationUI);
  for (const button of document.querySelectorAll('[data-pwa-install]')) {
    button.addEventListener('click', () => install(button));
  }
  for (const button of document.querySelectorAll('[data-pwa-close]')) {
    button.addEventListener('click', () => dialog?.close());
  }
  dialog?.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  dialog?.addEventListener('close', () => { if (returnFocus && !returnFocus.hidden) returnFocus.focus(); });
  updateInstallationUI();

  if ('serviceWorker' in navigator && window.isSecureContext && window.top === window.self) {
    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {
        // Installation remains a browser action. Never claim offline support when registration fails.
        status('O acesso continua disponível online. Se não conseguir instalar, recarregue o ORBIA no navegador.');
      });
    };
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }
})();
