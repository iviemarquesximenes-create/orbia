'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');

async function dashboardFor(accountType) {
  const dom = new JSDOM(`
    <section hidden id="tenant-onboarding">
      <button data-flow-open="create-tenant-form" hidden></button>
      <p hidden id="tenant-creation-restriction"></p>
      <form id="create-tenant-form"></form>
    </section>
    <div id="dashboard-content"></div>
  `, { url: 'https://orbia.test/', runScripts: 'outside-only' });
  const { window } = dom;
  window.Orbia = {
    api: async () => ({}),
    money: String,
    date: String,
    node: (tag, className, text) => {
      const element = window.document.createElement(tag);
      element.className = className;
      element.textContent = text;
      return element;
    },
    toast() {},
    state: { user: { accountType }, tenant: null },
    ready: Promise.resolve()
  };
  window.eval(fs.readFileSync(path.join(root, 'js/dashboard.js'), 'utf8'));
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  return dom;
}

test('onboarding só mostra o cadastro de condomínio para conta do tipo syndic', async () => {
  const resident = await dashboardFor('resident');
  const syndic = await dashboardFor('sindico');
  try {
    const residentDocument = resident.window.document;
    assert.equal(residentDocument.getElementById('tenant-onboarding').hidden, false);
    assert.equal(residentDocument.querySelector('[data-flow-open]').hidden, true);
    assert.equal(residentDocument.getElementById('tenant-creation-restriction').hidden, false);
    assert.equal(residentDocument.getElementById('create-tenant-form').hidden, true);

    const syndicDocument = syndic.window.document;
    assert.equal(syndicDocument.querySelector('[data-flow-open]').hidden, false);
    assert.equal(syndicDocument.getElementById('tenant-creation-restriction').hidden, true);
    assert.equal(syndicDocument.getElementById('create-tenant-form').hidden, false);
  } finally {
    resident.window.close();
    syndic.window.close();
  }
});
