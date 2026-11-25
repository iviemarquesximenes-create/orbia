'use strict';

(() => {
  const message = document.getElementById('login-message');
  const button = document.getElementById('login-button');
  const description = document.querySelector('.login-entry .muted-copy');
  const params = new URLSearchParams(window.location.search);
  const oldErrors = {
    invalid_state: 'A validação de segurança expirou. Inicie o login novamente.',
    missing_code: 'O provedor não retornou um código de acesso. Tente de novo.',
    oauth_failed: 'Não foi possível concluir o login. Tente novamente.'
  };
  if (params.has('error') && message) message.textContent = oldErrors[params.get('error')] || 'O login não foi concluído.';

  const make = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  };

  async function responseJson(response) {
    const body = await response.json();
    if (!response.ok) {
      throw new Error(body.msg || body.message || body.error_description || body.error?.message || 'Não foi possível concluir a solicitação.');
    }
    return body;
  }

  function showMessage(text) {
    if (message) message.textContent = text;
  }

  function renderSupabaseLogin(settings) {
    const form = make('form', 'login-form');
    const recovery = new URLSearchParams(window.location.hash.slice(1));
    const recoveryAccessToken = recovery.get('access_token');
    const recoveryRefreshToken = recovery.get('refresh_token');
    let mode = recovery.get('type') === 'recovery' && recoveryAccessToken ? 'recovery' : 'login';
    if (mode === 'recovery') window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    const emailLabel = make('label', 'form-field');
    emailLabel.append(make('span', '', 'E-mail'));
    const email = make('input');
    email.type = 'email';
    email.name = 'email';
    email.autocomplete = 'email';
    email.required = true;
    email.maxLength = 254;
    emailLabel.append(email);

    const passwordLabel = make('label', 'form-field');
    passwordLabel.append(make('span', '', mode === 'recovery' ? 'Nova senha' : 'Senha'));
    const password = make('input');
    password.type = 'password';
    password.name = 'password';
    password.autocomplete = 'current-password';
    password.required = true;
    password.minLength = 6;
    passwordLabel.append(password);

    const confirmationLabel = make('label', 'form-field');
    confirmationLabel.append(make('span', '', 'Confirme a senha'));
    const confirmation = make('input');
    confirmation.type = 'password';
    confirmation.name = 'password-confirmation';
    confirmation.autocomplete = 'new-password';
    confirmation.required = true;
    confirmation.minLength = 6;
    confirmationLabel.append(confirmation);
    confirmationLabel.hidden = true;

    const accountButton = make('button', 'button button--outline', 'Criar uma conta');
    accountButton.type = 'button';
    const recoveryButton = make('button', 'button button--outline', 'Esqueci minha senha');
    recoveryButton.type = 'button';
    const links = make('div', 'login-auth-actions');
    links.append(accountButton, recoveryButton);

    const updateMode = () => {
      const creating = mode === 'signup';
      const recovering = mode === 'recovery';
      emailLabel.hidden = recovering;
      email.required = !recovering;
      confirmationLabel.hidden = !creating;
      if (recovering) {
        confirmationLabel.hidden = false;
        confirmationLabel.querySelector('span').textContent = 'Confirme a nova senha';
        passwordLabel.querySelector('span').textContent = 'Nova senha';
      } else {
        confirmationLabel.querySelector('span').textContent = 'Confirme a senha';
        passwordLabel.querySelector('span').textContent = 'Senha';
      }
      confirmation.required = creating || recovering;
      password.autocomplete = creating || recovering ? 'new-password' : 'current-password';
      button.textContent = creating ? 'Criar conta' : recovering ? 'Salvar nova senha' : 'Entrar';
      accountButton.hidden = recovering;
      recoveryButton.hidden = creating || recovering;
      if (description) description.textContent = creating
        ? 'Crie sua conta ORBIA com seu e-mail e uma senha segura.'
        : recovering
          ? 'Escolha uma nova senha para sua conta ORBIA.'
          : 'Entre com seu e-mail e senha para acessar o ORBIA.';
      if (recovering) {
        document.getElementById('login-title').textContent = 'Defina sua nova senha.';
      }
    };
    updateMode();

    accountButton.addEventListener('click', () => {
      mode = mode === 'login' ? 'signup' : 'login';
      updateMode();
      showMessage('');
    });

    recoveryButton.addEventListener('click', async () => {
      if (!email.value.trim()) {
        showMessage('Informe seu e-mail para receber o link de redefinição.');
        email.focus();
        return;
      }
      recoveryButton.disabled = true;
      try {
        const redirectTo = `${window.location.origin}/login.html`;
        const response = await fetch(`${settings.url.replace(/\/+$/, '')}/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`, {
          method: 'POST',
          headers: { apikey: settings.publishableKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.value.trim() })
        });
        if (!response.ok) await responseJson(response);
        showMessage('Se esse e-mail estiver cadastrado, você receberá instruções para redefinir a senha.');
      } catch (error) {
        showMessage(error.message);
      } finally {
        recoveryButton.disabled = false;
      }
    });

    const oldButton = document.getElementById('login-button');
    oldButton.parentNode.insertBefore(form, oldButton);
    oldButton.remove();
    form.append(emailLabel, passwordLabel, confirmationLabel, button, links);
    button.type = 'submit';
    button.disabled = false;

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
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
          await responseJson(await fetch(`${settings.url.replace(/\/+$/, '')}/auth/v1/user`, {
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
        const authResponse = await fetch(`${settings.url.replace(/\/+$/, '')}/auth/v1/${endpoint}`, {
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
  }

  async function initialize() {
    try {
      const sessionResponse = await fetch('/api/auth/me', { credentials: 'same-origin' });
      if (sessionResponse.ok) {
        window.location.replace('/');
        return;
      }
    } catch {}

    try {
      const settings = await responseJson(await fetch('/api/auth/config'));
      if (settings.provider === 'Supabase' && settings.configured && settings.url && settings.publishableKey) {
        renderSupabaseLogin(settings);
        return;
      }
      if (!settings.configured) {
        showMessage('O serviço de login deste ambiente ainda não está configurado.');
        if (button) button.disabled = true;
        return;
      }
      button?.addEventListener('click', async () => {
        button.disabled = true;
        button.textContent = 'Conectando…';
        showMessage('');
        try {
          const result = await responseJson(await fetch('/api/auth/start', { method: 'POST', credentials: 'same-origin' }));
          window.location.assign(result.authorizationUrl);
        } catch (error) {
          showMessage(error.message);
          button.disabled = false;
          button.textContent = 'Entrar com Manus';
        }
      });
    } catch {
      showMessage('Não foi possível verificar o serviço de login.');
      if (button) button.disabled = true;
    }
  }

  initialize();
})();
