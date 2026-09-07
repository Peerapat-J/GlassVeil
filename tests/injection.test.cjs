const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { createDOM, createChrome, load, settle, manifest, repo, event } = require('./helpers/dom.cjs');
function injectionChrome() {
    const chrome = createChrome();
    const injections = [], messages = [], css = [];
    chrome.tabs = {
        query: async () => [{ id: 7, url: 'https://example.com/article' }],
        get: async () => ({ id: 7, url: 'https://example.com/article' }),
        create: async () => {},
        sendMessage: async (tabId, message) => {
            messages.push({ tabId, message });
            if (messages.length === 1) throw new Error('No receiving content script');
            if (message.action === 'inspectRules') return { rules: [] };
            return { status: 'picker_started' };
        }
    };
    chrome.scripting = {
        executeScript: async details => injections.push(details),
        insertCSS: async details => css.push(details)
    };
    return { chrome, injections, messages, css };
}
function verify({ injections, messages, css }, actions = ['startPicker', 'startPicker']) {
    assert.equal(injections.length, 1);
    assert.deepEqual(Array.from(injections[0].files), manifest.content_scripts[0].js);
    assert.equal(injections[0].target.tabId, 7);
    assert.deepEqual(messages.map(entry => entry.message.action), actions);
    assert.deepEqual(Array.from(css[0].files), manifest.content_scripts[0].css);
}
test('popup fallback injects the complete manifest list in order, then retries', async t => {
    const window = createDOM(t, readFileSync(resolve(repo, 'popup/popup.html'), 'utf8'));
    const fixture = injectionChrome(); window.chrome = fixture.chrome;
    let closed = false; window.close = () => { closed = true; };
    load(window, ['shared/storage.js', 'shared/tab-access.js', 'popup/metadata.js', 'popup/popup.js']); await settle();
    window.document.querySelector('#pick-element-btn').click(); await settle();
    verify(fixture, ['inspectRules', 'inspectRules', 'startPicker']); assert.equal(closed, true);
});
test('background fallback injects the same complete manifest list for context-menu and shortcut activation', async () => {
    const fixture = injectionChrome();
    fixture.chrome.runtime.onInstalled = event(); fixture.chrome.runtime.onStartup = event();
    fixture.chrome.contextMenus = { create() {}, onClicked: event() };
    fixture.chrome.commands = { onCommand: event() };
    const context = vm.createContext({ chrome: fixture.chrome, console, URL });
    context.importScripts = (...files) => files.forEach(file => vm.runInContext(readFileSync(resolve(repo, 'background', file), 'utf8'), context));
    vm.runInContext(readFileSync(resolve(repo, 'background/service-worker.js'), 'utf8'), context);
    await context.activatePickerOnTab({ id: 7, url: 'https://example.com/article' });
    verify(fixture);
    assert.equal(fixture.chrome.commands.onCommand.listeners.size, 1);
    assert.equal(fixture.chrome.contextMenus.onClicked.listeners.size, 1);
    const previousMessages = fixture.messages.length;
    const previousInjections = fixture.injections.length;
    for (const url of ['chrome://settings', 'edge://extensions', 'chrome-extension://abc/page', '', 'malformed']) {
        const outcome = await context.activatePickerOnTab({ id: 7, url });
        assert.ok(['unsupported', 'unavailable'].includes(outcome.status));
    }
    assert.equal(fixture.messages.length, previousMessages);
    assert.equal(fixture.injections.length, previousInjections);
});
test('popup delete and toggle use the shared legacy storage schema', async t => {
    const window = createDOM(t, readFileSync(resolve(repo, 'popup/popup.html'), 'utf8'));
    const chrome = createChrome({ rules: { 'example.com': ['.ad', '.second'], 'other.com': ['.keep'] } });
    chrome.tabs = { query: async () => [{ id: 7, url: 'https://example.com/' }], get: async () => ({ id: 7, url: 'https://example.com/' }), sendMessage: async (id, message) => message.action === 'inspectRules' ? { rules: [] } : {}, create: async () => {} };
    window.chrome = chrome; window.confirm = () => true;
    load(window, ['shared/storage.js', 'shared/tab-access.js', 'popup/metadata.js', 'popup/popup.js']); await settle();
    assert.equal(window.document.querySelectorAll('.rule-text').length, 2);
    window.document.querySelector('.btn-delete').click(); await settle();
    assert.deepEqual(chrome.snapshot().ruleStore.rules['example.com'].map(rule => rule.selector), ['.second']);
    window.document.querySelector('#blocker-toggle').click(); await settle();
    assert.equal(chrome.snapshot().ruleStore.disabledSites['example.com'], true);
    window.document.querySelector('#clear-all-btn').click(); await settle();
    assert.equal(chrome.snapshot().ruleStore.rules['example.com'], undefined);
    assert.deepEqual(chrome.snapshot().ruleStore.rules['other.com'].map(rule => rule.selector), ['.keep']);
});
