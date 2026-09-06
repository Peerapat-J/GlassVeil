const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');
const { createDOM, createChrome, load, settle, repo, event } = require('./helpers/dom.cjs');
const { createStorage } = require('../shared/storage.js');
const { createRuleEngine } = require('../content/rule-engine.js');
const { createDiagnostics } = require('../content/rule-diagnostics.js');
function storage(chrome) { return createStorage({ request: chrome.runtime.sendMessage, changes: chrome.storage.onChanged }); }
for (const action of ['reopen', 'delete', 'reset']) {
    test(`popup: empty inspection clears an active Test after final-rule ${action}`, async t => {
        const chrome = createChrome({ rules: { 'example.com': ['.ad'] } });
        const page = createDOM(t, '<div class="ad"></div>');
        page.chrome = chrome; load(page); await settle();
        const messages = [], tab = { id: 1, url: 'https://example.com/' };
        const send = message => new Promise(resolve => chrome.runtime.onMessage.emit(message, {}, resolve));
        chrome.tabs = { query: async () => [tab], get: async () => tab, sendMessage: async (id, message) => {
            messages.push(message); return send(message);
        } };
        const startTest = async () => {
            await send({ action: 'testRule', selector: '.ad' });
            assert.ok(page.document.querySelector('glassveil-rule-preview'));
        };
        if (action === 'reopen') { await startTest(); await storage(chrome).resetSite('example.com'); }
        const popup = createDOM(t, readFileSync(resolve(repo, 'popup/popup.html'), 'utf8'));
        popup.chrome = chrome; popup.confirm = () => true;
        load(popup, ['shared/storage.js', 'shared/tab-access.js', 'popup/metadata.js', 'popup/popup.js']); await settle();
        if (action !== 'reopen') {
            await startTest();
            popup.document.querySelector(action === 'delete' ? '.btn-delete' : '#clear-all-btn').click();
            await settle();
        }
        assert.equal(page.document.querySelector('glassveil-rule-preview'), null);
        assert.ok(messages.some(message => message.action === 'inspectRules' && message.rules.length === 0));
        assert.equal(popup.document.querySelectorAll('#rules-list li').length, 0);
        assert.equal(page.document.querySelector('#glassveil-injected-style').textContent, '');
    });
}
test('rules: disabled and invalid records remain stored while only enabled valid CSS applies', t => {
    const window = createDOM(t, '<div class="ad"></div><div class="off"></div>');
    const engine = createRuleEngine({ document: window.document, MutationObserver: window.MutationObserver });
    const result = engine.apply([{ selector: '.ad', enabled: true }, { selector: '.off', enabled: false }, { selector: '[', enabled: true }], true);
    assert.deepEqual(result.appliedSelectors, ['.ad']); assert.deepEqual(result.invalidSelectors, ['[']);
    assert.doesNotMatch(window.document.querySelector('style').textContent, /off/);
});
test('diagnostics: counts all matches, isolates invalid/zero and restores latest rules after temporary test', t => {
    const window = createDOM(t, '<div class="ad"></div><div class="ad"></div>'), document = window.document;
    const engine = createRuleEngine({ document, MutationObserver: window.MutationObserver });
    let finish;
    const diagnosticWindow = { CSSStyleSheet: window.CSSStyleSheet, setTimeout: callback => { finish = callback; return 1; },
        clearTimeout() {}, requestAnimationFrame: () => 1, cancelAnimationFrame() {} };
    const diagnostics = createDiagnostics({ document, window: diagnosticWindow, ruleEngine: engine });
    assert.deepEqual(diagnostics.describe([{ id: 'a', selector: '.ad' }, { id: 'b', selector: '[' }, { id: 'c', selector: '.missing' }]),
        [{ id: 'a', status: 'valid', count: 2 }, { id: 'b', status: 'invalid', count: 0 }, { id: 'c', status: 'zero', count: 0 }]);
    engine.apply([{ selector: '.ad', enabled: true }], true);
    assert.deepEqual(diagnostics.test('.ad'), { status: 'valid', count: 2 });
    assert.equal(document.querySelector('#glassveil-injected-style').textContent, ''); assert.ok(document.querySelector('glassveil-rule-preview'));
    engine.apply([{ selector: '.new', enabled: true }], true); finish();
    assert.equal(document.querySelector('glassveil-rule-preview'), null);
    assert.match(document.querySelector('#glassveil-injected-style').textContent, /\.new/);
    diagnostics.test('.ad'); diagnostics.stop(); assert.match(document.querySelector('#glassveil-injected-style').textContent, /\.new/);
    assert.equal(diagnostics.test('[').status, 'invalid'); assert.equal(document.querySelector('glassveil-rule-preview'), null);
});
test('content: per-rule changes reach two open pages and disabled state survives fresh initialization', async t => {
    const chrome = createChrome({ rules: { 'example.com': ['.ad', '['] } });
    const first = createDOM(t, '<div class="ad"></div>'), second = createDOM(t, '<div class="ad"></div>');
    for (const window of [first, second]) { window.chrome = chrome; load(window); } await settle();
    const rule = (await storage(chrome).readSite('example.com')).rules[0];
    await storage(chrome).updateRule('example.com', rule.id, { enabled: false }); await settle();
    for (const window of [first, second]) assert.equal(window.document.querySelector('#glassveil-injected-style').textContent, '');
    const reopened = createDOM(t, '<div class="ad"></div>'); reopened.chrome = chrome; load(reopened); await settle();
    assert.equal(reopened.document.querySelector('#glassveil-injected-style').textContent, '');
    await storage(chrome).updateRule('example.com', rule.id, { enabled: true }); await settle();
    for (const window of [first, second, reopened]) assert.match(window.document.querySelector('#glassveil-injected-style').textContent, /\.ad/);
});
test('popup: per-rule toggle/edit/test/delete preserve stable identity and metadata', async t => {
    const window = createDOM(t, readFileSync(resolve(repo, 'popup/popup.html'), 'utf8'));
    const chrome = createChrome({ rules: { 'example.com': ['.ad', '.off', '[', '.missing'] } });
    const messages = [];
    const tab = { id: 1, url: 'https://example.com/' };
    chrome.tabs = { query: async () => [tab], get: async () => tab, create: async () => {}, sendMessage: async (id, message) => {
        messages.push(message);
        if (message.action === 'inspectRules') return { rules: message.rules.map(rule => ({ id: rule.id, status: rule.selector === '[' ? 'invalid' : rule.selector === '.missing' ? 'zero' : 'valid', count: ['[', '.missing'].includes(rule.selector) ? 0 : 2 })) };
        return { status: 'valid', count: 2 };
    } };
    window.chrome = chrome; window.confirm = () => true; let closed = false; window.close = () => { closed = true; };
    load(window, ['shared/storage.js', 'shared/tab-access.js', 'popup/metadata.js', 'popup/popup.js']); await settle();
    const first = (await storage(chrome).readSite('example.com')).rules[0];
    const row = () => Array.from(window.document.querySelectorAll('#rules-list li')).find(row => row.dataset.ruleId === first.id);
    assert.equal(row().querySelector('.rule-status').textContent, '2 matches');
    assert.match(window.document.querySelector('#rules-list').textContent, /Invalid selector/); assert.match(window.document.querySelector('#rules-list').textContent, /0 matches/);
    row().querySelector('.rule-enabled').click(); await settle();
    assert.equal((await storage(chrome).readSite('example.com')).rules[0].enabled, false);
    const button = label => Array.from(row().querySelectorAll('button')).find(button => button.textContent === label);
    button('Edit').click(); row().querySelector('input.rule-editor').value = '.edited';
    row().querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); await settle();
    assert.deepEqual((await storage(chrome).readSite('example.com')).rules[0], { ...first, selector: '.edited', enabled: false });
    button('Edit').click(); row().querySelector('input.rule-editor').value = '[';
    row().querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); await settle();
    assert.match(window.document.querySelector('#page-message').textContent, /invalid/);
    assert.equal((await storage(chrome).readSite('example.com')).rules[0].selector, '.edited');
    button('Test').click(); await settle(); assert.equal(closed, true); assert.ok(messages.some(message => message.action === 'testRule' && message.selector === '.edited'));
    button('Delete').click(); await settle(); assert.equal((await storage(chrome).readSite('example.com')).rules.some(rule => rule.id === first.id), false);
});
test('background storage router: rejects other senders and serializes all client operations', async () => {
    const chrome = createChrome(); chrome.runtime.onInstalled = event(); chrome.contextMenus = { create() {}, onClicked: event() }; chrome.commands = { onCommand: event() };
    const context = vm.createContext({ chrome, console, URL, crypto: globalThis.crypto });
    context.importScripts = (...files) => files.forEach(file => vm.runInContext(readFileSync(resolve(repo, 'background', file), 'utf8'), context));
    vm.runInContext(readFileSync(resolve(repo, 'background/service-worker.js'), 'utf8'), context);
    const request = (method, args, id = chrome.runtime.id) => new Promise(resolve => chrome.runtime.onMessage.emit({ type: 'glassveil-storage', method, args }, { id }, resolve));
    assert.equal((await request('resetSite', ['example.com'], 'someone-else')).ok, false);
    assert.equal((await request('unknown', [])).ok, false); assert.equal(chrome.writes.length, 0);
    const results = await Promise.all([request('appendSelectors', ['example.com', ['.a']]), request('appendSelectors', ['example.com', ['.b']])]);
    assert.ok(results.every(result => result.ok));
    assert.deepEqual(Array.from((await request('readSite', ['example.com'])).value.selectors), ['.a', '.b']);
});
