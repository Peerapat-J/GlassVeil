const test = require('node:test');
const assert = require('node:assert/strict');
const { createDOM, createChrome, load, settle, manifest } = require('./helpers/dom.cjs');
async function fixture(t, initial = {}) {
    const window = createDOM(t, '<section id="parent"><div id="banner"></div></section><div id="sponsor"></div>');
    window.chrome = createChrome(initial);
    load(window); await settle();
    const start = () => window.chrome.runtime.onMessage.emit({ action: 'startPicker' }, {}, () => {});
    const shadow = () => window.document.querySelector('#glassveil-picker-root')?.shadowRoot;
    return { window, document: window.document, chrome: window.chrome, start, shadow };
}
test('bootstrap: definition-only modules do not attach UI, storage or message listeners', t => {
    const window = createDOM(t); window.chrome = createChrome();
    load(window, manifest.content_scripts[0].js.slice(0, -1));
    assert.equal(window.document.querySelectorAll('style').length, 0);
    assert.equal(window.chrome.runtime.onMessage.listeners.size, 0);
    assert.equal(window.chrome.storage.onChanged.listeners.size, 0);
});
test('bootstrap: repeated injection preserves one engine, listener set and picker instance', async t => {
    const { window, document, chrome, start, shadow } = await fixture(t);
    const api = window.GlassVeilPicker;
    load(window); await settle();
    assert.equal(window.GlassVeilPicker, api);
    assert.equal(document.querySelectorAll('#glassveil-injected-style').length, 1);
    assert.equal(chrome.storage.onChanged.listeners.size, 1);
    assert.equal(chrome.runtime.onMessage.listeners.size, 1);
    start(); start();
    assert.equal(document.querySelectorAll('#glassveil-picker-root').length, 1);
    document.querySelector('#banner').click();
    assert.equal(shadow().querySelector('#selection-count').textContent, '1 selected');
    shadow().querySelector('#cancel-btn').click(); start();
    document.querySelector('#banner').click();
    assert.equal(shadow().querySelector('#selection-count').textContent, '1 selected');
});
test('picker: multi-select, parent replacement, preview and cancel restore the page', async t => {
    const { document, start, shadow } = await fixture(t);
    start(); document.querySelector('#banner').click(); document.querySelector('#sponsor').click();
    assert.equal(shadow().querySelectorAll('.selected-outline').length, 2);
    document.querySelector('#sponsor').click();
    shadow().querySelector('#parent-btn').click();
    assert.equal(document.querySelector('#parent').classList.contains('glassveil-picker-selected'), true);
    assert.equal(document.querySelector('#banner').classList.contains('glassveil-picker-selected'), false);
    shadow().querySelector('#preview-toggle').click();
    assert.equal(document.querySelector('#parent').style.display, 'none');
    shadow().querySelector('#cancel-btn').click();
    assert.equal(document.querySelector('#parent').style.display, '');
    assert.equal(document.querySelectorAll('.glassveil-picker-selected').length, 0);
    assert.equal(document.querySelector('#glassveil-picker-root'), null);
});
test('picker: saving uses shared storage and applies hostname rules immediately', async t => {
    const { document, chrome, start, shadow } = await fixture(t, { rules: { 'other.com': ['.keep'] } });
    start(); document.querySelector('#banner').click(); shadow().querySelector('#confirm-btn').click(); await settle();
    assert.deepEqual(chrome.snapshot().rules['example.com'], ['#banner']);
    assert.deepEqual(chrome.snapshot().rules['other.com'], ['.keep']);
    assert.match(document.querySelector('#glassveil-injected-style').textContent, /#banner/);
    assert.equal(document.querySelector('#glassveil-picker-root'), null);
});
test('bootstrap: legacy rules, disabled sites and cross-page storage events use the current hostname', async t => {
    const { document, chrome } = await fixture(t, {
        rules: { 'example.com': ['#banner'], 'sub.example.com': ['#sponsor'] }, disabledSites: { 'example.com': true }
    });
    const style = () => document.querySelector('#glassveil-injected-style').textContent;
    assert.equal(style(), '');
    await chrome.storage.local.set({ disabledSites: {} }); await settle();
    assert.match(style(), /#banner/); assert.doesNotMatch(style(), /#sponsor/);
    await chrome.storage.local.set({ rules: { 'example.com': ['[', '#sponsor'] } }); await settle();
    assert.match(style(), /#sponsor/); assert.doesNotMatch(style(), /#banner/);
    await chrome.storage.local.set({ rules: {} }); await settle(); assert.equal(style(), '');
});
