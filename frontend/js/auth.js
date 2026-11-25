'use strict';

(() => {
  const form = document.querySelector('form.login-form');
  const message = document.getElementById('login-message');
  const button = document.getElementById('login-button');
  const description = document.querySelector('.login-entry .muted-copy');
  if (!form || !message || !button) throw new Error('A estrutura da página de login está incompleta.');

  const emailLabel = form.querySelector('[data-auth-email]');
  const email = form.querySelector('input[name="email"]');
  const passwordLabel = form.querySelector('[data-auth-password]');
  const password = form.querySelector('input[name="password"]');
  const confirmationLabel = form.querySelector('[data-auth-confirmation]');
  const confirmation = form.querySelector('input[name="password-confirmation"]');
  const accountButton = document.getElementById('create-account');
  const recoveryButton = document.getElementById('forgot-password');
  const title = document.getElementById('login-title');
  const recovery = new URLSearchParams(window.location.hash.slice(1));
  const recoveryAccessToken = recovery.get('access_token');
  const recoveryRefreshToken = recovery.get('refresh_token');
  let mode = recovery.get('type') === 'recovery' && recoveryAccessToken ? 'recovery' : 'login';
  let settings = null;
  let configurationMessage = 'O login por e-mail ainda não está configurado neste ambiente.';

  if (mode === 'recovery') {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  }

  async function responseJson(response) {
    let body;
    try {
      body = await response.json();
    } catch {
      body = {};
    }
    if (!response.ok) {
      throw new Error(body.msg || body.message || body.error_description || body.error?.message || 'Não foi possível concluir a solicitação.');
    }
    return body;
  }

  function showMessage(text) {
    message.textContent = text;
  }

  function updateMode() {
    const creating = mode === 'signup';
    const recovering = mode === 'recovery';
    emailLabel.hidden = recovering;
    email.required = !recovering;
    confirmationLabel.hidden = !creating && !recovering;
    confirmationLabel.querySelector('span').textContent = recovering ? 'Confirme a nova senha' : 'Confirme a senha';
    confirmation.required = creating || recovering;
    passwordLabel.querySelector('span').textContent = recovering ? 'Nova senha' : 'Senha';
    password.autocomplete = creating || recovering ? 'new-password' : 'current-password';
    button.textContent = creating ? 'Criar conta' : recovering ? 'Salvar nova senha' : 'Entrar';
    accountButton.hidden = recovering;
    accountButton.textContent = creating ? 'Já tenho uma conta' : 'Criar uma conta';
    recoveryButton.hidden = creating || recovering;
    if (description) {
      description.textContent = creating
        ? 'Crie sua conta ORBIA com seu e-mail e uma senha segura.'
        : recovering
          ? 'Escolha uma nova senha para sua conta ORBIA.'
          : 'Entre com seu e-mail e senha para acessar o ORBIA.';
    }
    if (recovering && title) title.textContent = 'Defina sua nova senha.';
  }

  function supabaseEndpoint(path) {
    return `${settings.url.replace(/\/+$/, '')}/auth/v1/${path}`;
  }

  accountButton.addEventListener('click', () => {
    mode = mode === 'login' ? 'signup' : 'login';
    updateMode();
    showMessage(settings ? '' : configurationMessage);
  });

  recoveryButton.addEventListener('click', async () => {
    if (!settings) {
      showMessage(configurationMessage);
      return;
    }
    if (!email.value.trim()) {
      showMessage('Informe seu e-mail para receber o link de redefinição.');
      email.focus();
      return;
    }

    recoveryButton.disabled = true;
    try {
      const redirectTo = `${window.location.origin}/login.html`;
      const response = await fetch(`${supabaseEndpoint('recover')}?redirect_to=${encodeURIComponent(redirectTo)}`, {
        method: 'POST',
        headers: { apikey: settings.publishableKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.value.trim() })
      });
      await responseJson(response);
      showMessage('Se esse e-mail estiver cadastrado, você receberá instruções para redefinir a senha.');
    } catch (error) {
      showMessage(error.message);
    } finally {
      recoveryButton.disabled = false;
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!settings) {
      showMessage(configurationMessage);
      return;
    }
    if ((mode === 'signup' || mode === 'recovery') && password.value !== confirmation.value) {
      showMessage('As senhas informadas não coincidem.');
      confirmation.focus();
      return;
    }

    button.disabled = true;
    accountButton.disabled = true;
    recoveryButton.disabled = true;
    showMessage('');
    try {
      if (mode === 'recovery') {
        await responseJson(await fetch(supabaseEndpoint('user'), {
          method: 'PUT',
          headers: {
            apikey: settings.publishableKey,
            Authorization: `Bearer ${recoveryAccessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ password: password.value })
        }));
        if (recoveryRefreshToken) {
          await responseJson(await fetch('/api/auth/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ accessToken: recoveryAccessToken, refreshToken: recoveryRefreshToken })
          }));
          window.location.replace('/');
          return;
        }
        mode = 'login';
        password.value = '';
        confirmation.value = '';
        updateMode();
        showMessage('Senha atualizada. Entre com sua nova senha.');
        return;
      }

      const endpoint = mode === 'signup' ? 'signup' : 'token?grant_type=password';
      const authResponse = await fetch(supabaseEndpoint(endpoint), {
        method: 'POST',
        headers: { apikey: settings.publishableKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.value.trim(), password: password.value })
      });
      const session = await responseJson(authResponse);
      if (!session.access_token || !session.refresh_token) {
        showMessage('Confira seu e-mail para confirmar a conta e depois entre no ORBIA.');
        return;
      }
      await responseJson(await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ accessToken: session.access_token, refreshToken: session.refresh_token })
      }));
      window.location.replace('/');
    } catch (error) {
      showMessage(error.message);
    } finally {
      button.disabled = false;
      accountButton.disabled = false;
      recoveryButton.disabled = false;
    }
  });

  updateMode();

  async function initialize() {
    try {
      const sessionResponse = await fetch('/api/auth/me', { credentials: 'same-origin' });
      if (sessionResponse.ok) {
        window.location.replace('/');
        return;
      }
    } catch {
      showMessage('Não foi possível verificar sua sessão. Você ainda pode tentar entrar.');
    }

    try {
      const authConfig = await responseJson(await fetch('/api/auth/config'));
      if (authConfig.provider === 'Supabase' && authConfig.configured && authConfig.url && authConfig.publishableKey) {
        settings = authConfig;
        showMessage('');
        return;
      }
      showMessage(configurationMessage);
    } catch {
      configurationMessage = 'Não foi possível carregar a configuração do login. Tente novamente mais tarde.';
      showMessage(configurationMessage);
    }
  }

  initialize();
})();
