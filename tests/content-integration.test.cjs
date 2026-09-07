const windowStorage = chrome => require('../shared/storage.js').createStorage({ request: chrome.runtime.sendMessage, changes: chrome.storage.onChanged });
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
    assert.deepEqual(chrome.snapshot().ruleStore.rules['example.com'].map(rule => rule.selector), ['#banner']);
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
    await windowStorage(chrome).setEnabled('example.com', true); await settle();
    assert.match(style(), /#banner/); assert.doesNotMatch(style(), /#sponsor/);
    await windowStorage(chrome).resetSite('example.com'); await windowStorage(chrome).appendSelectors('example.com', ['[', '#sponsor']); await settle();
    assert.match(style(), /#sponsor/); assert.doesNotMatch(style(), /#banner/);
    await windowStorage(chrome).resetSite('example.com'); await settle(); assert.equal(style(), '');
});
test('picker undo: restores parent child, deselection, outlines, active selector and preview', async t => {
    const { document, start, shadow, chrome } = await fixture(t);
    const child = document.querySelector('#banner'), parent = document.querySelector('#parent');
    start(); const click = id => shadow().querySelector(`#${id}`).click();
    assert.equal(shadow().querySelector('#undo-btn').disabled, true);
    child.click(); click('preview-toggle'); click('parent-btn');
    assert.equal(parent.style.display, 'none'); assert.equal(child.style.display, '');
    click('undo-btn');
    assert.equal(parent.style.display, ''); assert.equal(child.style.display, 'none');
    assert.equal(child.classList.contains('glassveil-picker-selected'), true);
    assert.equal(parent.classList.contains('glassveil-picker-selected'), false);
    assert.equal(shadow().querySelector('#selector-display').value, '#banner');
    assert.equal(shadow().querySelectorAll('.selected-outline').length, 1);
    child.click(); assert.equal(child.style.display, '');
    click('undo-btn'); assert.equal(child.style.display, 'none');
    click('undo-btn'); assert.equal(child.style.display, '');
    assert.equal(shadow().querySelector('#selection-count').textContent, '0 selected');
    assert.equal(shadow().querySelectorAll('.selected-outline').length, 0);
    assert.equal(shadow().querySelector('#undo-btn').disabled, true);
    assert.equal(chrome.writes.length, 1); // The only write is migration, not Undo.
});
test('picker undo: Cmd/Ctrl+Z preserve editable fields and ignore redo/composition', async t => {
    const { window, document, start, shadow } = await fixture(t);
    start(); document.querySelector('#banner').click(); document.querySelector('#sponsor').click();
    const key = (target, modifiers = {}) => {
        const event = new window.KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, composed: true, cancelable: true, ...modifiers });
        target.dispatchEvent(event); return event.defaultPrevented;
    };
    for (const markup of ['<input>', '<textarea></textarea>', '<select></select>', '<div contenteditable="true"><span></span></div>']) {
        const box = document.createElement('div'); box.innerHTML = markup; shadow().appendChild(box);
        assert.equal(key(box.querySelector('span') || box.firstChild), false);
        box.remove();
    }
    const input = document.createElement('input'); document.body.appendChild(input);
    assert.equal(key(input), false);
    assert.equal(key(document.body, { shiftKey: true }), false);
    assert.equal(key(document.body, { altKey: true }), false);
    assert.equal(key(document.body, { isComposing: true }), false);
    assert.equal(shadow().querySelector('#selection-count').textContent, '2 selected');
    assert.equal(key(document.body), true);
    assert.equal(shadow().querySelector('#selection-count').textContent, '1 selected');
    assert.equal(key(shadow().querySelector('#undo-btn'), { ctrlKey: false, metaKey: true }), true);
    assert.equal(shadow().querySelector('#undo-btn').disabled, true);
    assert.equal(key(document.body), false);
});
test('picker undo: removed targets clean styles and history; cancel and save reset session history', async t => {
    const { window, document, start, shadow, chrome } = await fixture(t, { rules: { 'example.com': ['.saved'] } });
    start(); const child = document.querySelector('#banner'); child.click();
    shadow().querySelector('#preview-toggle').click(); child.remove();
    shadow().querySelector('#undo-btn').click();
    assert.equal(child.style.display, ''); assert.equal(child.classList.contains('glassveil-picker-selected'), false);
    assert.equal(shadow().querySelector('#undo-btn').disabled, true);
    shadow().querySelector('#cancel-btn').click();
    const event = new window.KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true });
    document.body.dispatchEvent(event); assert.equal(event.defaultPrevented, false);
    start(); assert.equal(shadow().querySelector('#undo-btn').disabled, true);
    document.querySelector('#sponsor').click(); shadow().querySelector('#confirm-btn').click(); await settle();
    start(); assert.equal(shadow().querySelector('#undo-btn').disabled, true);
    assert.deepEqual(chrome.snapshot().ruleStore.rules['example.com'].map(rule => rule.selector), ['.saved', '#sponsor']);
});
test('picker undo: Select Parent on a detached subtree cleans selection without marking the detached parent', async t => {
    const { document, start, shadow } = await fixture(t);
    start(); const child = document.querySelector('#banner'), parent = document.querySelector('#parent');
    child.click(); parent.remove(); shadow().querySelector('#parent-btn').click();
    assert.equal(parent.classList.contains('glassveil-picker-selected'), false);
    assert.equal(child.classList.contains('glassveil-picker-selected'), false);
    assert.equal(shadow().querySelector('#undo-btn').disabled, true);
    assert.equal(shadow().querySelector('#selection-count').textContent, '0 selected');
});
