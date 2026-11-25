'use strict';

(() => {
  const template = document.getElementById('flow-template');
  if (!template || !window.Orbia) return;
  const flows = new Map();
  const { node, money, date } = window.Orbia;

  function lockPage() {
    document.body.classList.toggle('dialog-open', Boolean(document.querySelector('dialog[open]')));
  }

  function decimalCents(value) {
    const text = String(value || '').replace(',', '.');
    if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
    const [whole, fraction = ''] = text.split('.');
    return BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2));
  }

  function setup(form) {
    const steps = [...form.querySelectorAll('.flow-step')];
    if (!steps.length) return;
    const dialog = template.content.firstElementChild.cloneNode(true);
    const title = dialog.querySelector('.flow-title');
    title.id = `flow-title-${form.id}`;
    dialog.setAttribute('aria-labelledby', title.id);
    dialog.id = `dialog-${form.id}`;
    const description = dialog.querySelector('.flow-description');
    const progress = dialog.querySelector('.flow-progress');
    const review = dialog.querySelector('.flow-review');
    const feedback = dialog.querySelector('.flow-feedback');
    const next = dialog.querySelector('.flow-next');
    const prev = dialog.querySelector('.flow-prev');
    const back = dialog.querySelector('.flow-back');
    const close = dialog.querySelector('.flow-close');
    const submit = form.querySelector('button[type="submit"]');
    const originalSubmitLabel = submit?.textContent.trim() || 'Concluir';
    const home = document.createComment(`form-home:${form.id}`);
    const launches = [...document.querySelectorAll(`[data-flow-open="${form.id}"]`)];
    form.before(home);
    const notes = node('div', 'flow-notes');
    for (const child of [...form.children]) {
      if (!child.classList.contains('flow-step') && child !== submit) notes.append(child);
    }
    form.append(notes);
    let current = 0;
    let completed = false;
    let initiatingElement;
    let submitting = false;
    document.body.append(dialog);

    function error(message, control) {
      feedback.textContent = message;
      feedback.hidden = false;
      if (control) {
        control.setAttribute('aria-invalid', 'true');
        control.focus({ preventScroll: true });
        dialog.querySelector('.flow-body').scrollTop = Math.max(0, control.offsetTop - 80);
      }
    }

    function validate(index) {
      for (const input of steps[index].querySelectorAll('input, select, textarea')) {
        input.removeAttribute('aria-invalid');
        if (!input.disabled && !input.checkValidity()) {
          const label = input.closest('label')?.querySelector('span')?.textContent.trim() || 'este campo';
          error(`Confira ${label.toLocaleLowerCase('pt-BR')}: ${input.validationMessage}`, input);
          return false;
        }
      }
      if (form.id === 'payment-form' && steps[index].querySelector('#allocation-list')) {
        let total = 0n;
        for (const row of form.querySelectorAll('.allocation-row')) {
          const fund = row.querySelector('.allocation-fund');
          const amount = row.querySelector('.allocation-amount');
          const month = row.querySelector('.allocation-month');
          if (!fund.value && !amount.value) continue;
          const cents = decimalCents(amount.value);
          if (!fund.value || !month.value || cents === null || cents <= 0n) {
            error('Complete fundo, mês e valor da alocação, ou remova a linha para identificar depois.', !fund.value ? fund : !month.value ? month : amount);
            return false;
          }
          total += cents;
        }
        const received = decimalCents(form.elements.amount.value);
        if (received !== null && total > received) {
          error('A soma das alocações não pode ser maior que o valor original recebido.');
          return false;
        }
      }
      return true;
    }

    function valueOf(control) {
      if (control.tagName === 'SELECT') return control.selectedOptions[0]?.textContent || 'Não informado';
      if (!control.value) return 'Não informado';
      if (control.type === 'number') return money(control.value);
      if (control.type === 'date') return date(control.value);
      if (control.type === 'month') return control.value.split('-').reverse().join('/');
      return control.value;
    }

    function reviewInformation() {
      review.replaceChildren();
      steps.forEach((step, index) => {
        const group = node('div', 'flow-review-group');
        group.append(node('h3', '', step.dataset.title));
        for (const label of step.querySelectorAll('label')) {
          const control = label.querySelector('input, select, textarea');
          if (!control) continue;
          const button = node('button', 'flow-review-row');
          button.type = 'button';
          const name = label.querySelector('span')?.textContent.trim() || control.name;
          const text = node('span');
          text.append(node('strong', '', name), node('span', '', valueOf(control)));
          button.append(text, node('span', '', 'Editar ›'));
          button.addEventListener('click', () => {
            render(index);
            control.focus({ preventScroll: true });
          });
          group.append(button);
        }
        if (step.querySelector('#allocation-list') && !step.querySelector('.allocation-row')) {
          group.append(node('p', 'legal-note', 'Sem alocação. O pagamento ficará aguardando identificação.'));
        }
        review.append(group);
      });
      review.append(node('p', 'notice notice--soft', form.dataset.flowDescription));
    }

    function render(index) {
      current = index;
      completed = false;
      feedback.hidden = true;
      const isReview = index === steps.length;
      steps.forEach((step, i) => { step.hidden = i !== index; });
      notes.hidden = !isReview;
      if (submit) submit.hidden = true;
      review.hidden = !isReview;
      prev.hidden = index === 0;
      back.disabled = index === 0;
      next.disabled = submitting;
      next.textContent = isReview ? originalSubmitLabel : 'Continuar →';
      progress.textContent = isReview ? 'Revisar e concluir' : `Etapa ${index + 1} de ${steps.length}`;
      title.textContent = isReview ? 'Confira antes de concluir' : steps[index].dataset.title;
      description.textContent = isReview ? 'Toque em qualquer informação para editar. Nada foi enviado ainda.' : steps[index].dataset.description;
      if (isReview) reviewInformation();
      dialog.querySelector('.flow-body').scrollTop = 0;
      title.focus({ preventScroll: true });
    }

    function canOpen() {
      return !form.hidden && !home.parentElement.closest('[hidden]');
    }

    function open(trigger) {
      if (!canOpen() || dialog.open) return;
      initiatingElement = trigger || document.activeElement;
      dialog.querySelector('.flow-fields').append(form);
      form.classList.remove('flow-park');
      form.classList.add('flow-active');
      form.append(review);
      dialog.showModal();
      lockPage();
      render(0);
    }

    function dismiss() {
      if (submitting) return;
      dialog.close();
    }

    function advance() {
      if (completed) return dismiss();
      if (submitting) return;
      if (current < steps.length) {
        if (validate(current)) render(current + 1);
      } else {
        for (let index = 0; index < steps.length; index++) {
          if (!validate(index)) {
            const message = feedback.textContent;
            render(index);
            error(message);
            return;
          }
        }
        form.requestSubmit(submit);
      }
    }

    // Enter and accessibility submission cannot bypass the explicit review screen.
    form.addEventListener('submit', (event) => {
      if (current !== steps.length || !dialog.open || submitting) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (dialog.open && !submitting) advance();
        return;
      }
      for (let index = 0; index < steps.length; index++) {
        if (!validate(index)) {
          event.preventDefault(); event.stopImmediatePropagation();
          const message = feedback.textContent; render(index); error(message); return;
        }
      }
      feedback.hidden = true;
    }, true);

    form.addEventListener('reset', () => {
      if (!dialog.open) return;
      queueMicrotask(() => {
        completed = true;
        steps.forEach((step) => { step.hidden = true; });
        review.hidden = true; notes.hidden = true;
        if (submit) submit.hidden = true;
        progress.textContent = 'Concluído';
        title.textContent = 'Tudo certo. Registro salvo.';
        description.textContent = form.dataset.flowDescription;
        prev.hidden = true;
        next.textContent = 'Voltar ao aplicativo';
        next.disabled = false;
        title.focus({ preventScroll: true });
      });
    });

    if (submit) new MutationObserver(() => {
      submitting = submit.disabled;
      if (!completed) {
        next.disabled = submitting;
        next.textContent = submitting ? 'Enviando…' : current === steps.length ? originalSubmitLabel : 'Continuar →';
      }
      close.disabled = submitting;
      back.disabled = submitting || current === 0;
      prev.disabled = submitting;
    }).observe(submit, { attributes: true, attributeFilter: ['disabled'] });

    next.addEventListener('click', advance);
    prev.addEventListener('click', () => render(Math.max(0, current - 1)));
    back.addEventListener('click', () => { if (current > 0) render(current - 1); });
    close.addEventListener('click', dismiss);
    dialog.addEventListener('cancel', (event) => { if (submitting) event.preventDefault(); });
    dialog.addEventListener('close', () => {
      home.after(form);
      form.classList.remove('flow-active'); form.classList.add('flow-park');
      steps.forEach((step) => { step.hidden = false; });
      dialog.querySelector('.flow-body').append(review);
      lockPage();
      if (initiatingElement?.isConnected) initiatingElement.focus({ preventScroll: true });
    });
    for (const launch of launches) {
      launch.addEventListener('click', () => open(launch));
      launch.hidden = !canOpen();
    }
    flows.set(form.id, { form, open, dialog, error });
  }

  document.addEventListener('orbia:feedback', (event) => {
    if (event.detail?.type !== 'error') return;
    for (const flow of flows.values()) if (flow.dialog.open) flow.error(event.detail.message);
  });

  window.Orbia.ready.then(() => {
    document.querySelectorAll('form[data-flow]').forEach(setup);
    const observer = new MutationObserver(() => {
      for (const [id, flow] of flows) {
        if (flow.dialog.open) continue;
        for (const button of document.querySelectorAll(`[data-flow-open="${id}"]`)) {
          const shouldHide = flow.form.hidden || Boolean(flow.form.closest('[hidden]'));
          if (button.hidden !== shouldHide) button.hidden = shouldHide;
        }
      }
    });
    observer.observe(document.querySelector('main') || document.body, { attributes: true, subtree: true, attributeFilter: ['hidden'] });
    const hash = window.location.hash;
    const linkMap = { '#payments': 'payment-form', '#expenses': 'expense-form' };
    if (linkMap[hash]) flows.get(linkMap[hash])?.open();
    document.addEventListener('click', (event) => {
      const anchor = event.target.closest('a[href^="#"]');
      if (anchor && linkMap[anchor.getAttribute('href')]) {
        event.preventDefault(); flows.get(linkMap[anchor.getAttribute('href')])?.open(anchor);
      }
    });
  }).catch(() => {});
})();
