const windowStorage = chrome => require('../shared/storage.js').createStorage({ request: chrome.runtime.sendMessage, changes: chrome.storage.onChanged });
const test = require('node:test');
const assert = require('node:assert/strict');
const { createDOM, createChrome, load, settle, manifest } = require('./helpers/dom.cjs');
async function fixture(t, initial = {}) {
    const window = createDOM(t, '<section id="parent"><div id="banner"></div></section><div id="sponsor"></div>');
    window.chrome = createChrome(initial);
    load(window); await settle();
    const start = () => new Promise(resolve => window.chrome.runtime.onMessage.emit({ action: 'startPicker' }, {}, resolve));
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
    await start(); await start();
    assert.equal(document.querySelectorAll('#glassveil-picker-root').length, 1);
    document.querySelector('#banner').click();
    assert.equal(shadow().querySelector('#selection-count').textContent, '1 selected');
    shadow().querySelector('#cancel-btn').click(); await start();
    document.querySelector('#banner').click();
    assert.equal(shadow().querySelector('#selection-count').textContent, '1 selected');
});
test('picker: multi-select, parent replacement, preview and cancel restore the page', async t => {
    const { document, start, shadow } = await fixture(t);
    await start(); document.querySelector('#banner').click(); document.querySelector('#sponsor').click();
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
    await start(); document.querySelector('#banner').click(); shadow().querySelector('#confirm-btn').click(); await settle();
    assert.deepEqual(chrome.snapshot().ruleStore.rules['example.com'].map(rule => rule.selector), ['#banner']);
    assert.deepEqual(chrome.snapshot().rules['other.com'], ['.keep']);
    assert.match(document.querySelector('#glassveil-injected-style').textContent, /#banner/);
    assert.equal(document.querySelector('#glassveil-picker-root'), null);
});
test('picker: reports committed rules on apply failure and retries without another save', async t => {
    const { document, chrome, start, shadow } = await fixture(t);
    const send = chrome.runtime.sendMessage;
    let fail = true, release, appends = 0;
    chrome.runtime.sendMessage = async message => {
        if (message.type === 'glassveil-storage' && message.method === 'appendSelectors') appends++;
        if (message.type !== 'glassveil-user-css') return send(message);
        if (fail) return { ok: false, error: 'CSS unavailable' };
        await new Promise(resolve => { release = resolve; });
        return { ok: true };
    };
    await start(); document.querySelector('#banner').click(); shadow().querySelector('#preview-toggle').click();
    shadow().querySelector('#confirm-btn').click(); await settle();
    assert.ok(shadow()); assert.match(shadow().querySelector('#impact-notice').textContent, /Rules saved.*remain enabled/);
    assert.equal(shadow().querySelector('#confirm-btn').textContent, 'Retry applying');
    assert.equal(shadow().querySelector('#cancel-btn').textContent, 'Close');
    assert.equal(chrome.snapshot().ruleStore.rules['example.com'].length, 1);
    assert.equal(appends, 1);
    const beforeRetry = appends;
    fail = false; shadow().querySelector('#confirm-btn').click(); await settle();
    assert.ok(shadow()); assert.equal(shadow().querySelector('#confirm-btn').textContent, 'Applying…');
    assert.equal(appends, beforeRetry);
    assert.equal(document.querySelector('#banner').style.display, 'none');
    release(); await settle(); await settle();
    assert.equal(shadow(), undefined);
    assert.equal(chrome.snapshot().ruleStore.rules['example.com'].length, 1);
});
test('picker: closing an apply failure keeps only the clearly reported saved selection', async t => {
    const { document, chrome, start, shadow } = await fixture(t);
    const send = chrome.runtime.sendMessage;
    chrome.runtime.sendMessage = message => message.type === 'glassveil-user-css'
        ? Promise.resolve({ ok: false, error: 'CSS unavailable' }) : send(message);
    await start(); document.querySelector('#banner').click();
    shadow().querySelector('#confirm-btn').click(); await settle();
    assert.match(shadow().querySelector('#impact-notice').textContent, /Rules saved.*remain enabled/);
    document.querySelector('#sponsor').click();
    shadow().querySelector('#parent-btn').click();
    assert.equal(shadow().querySelector('#selection-count').textContent, '1 selected');
    for (const id of ['precision-mode', 'undo-btn', 'impact-refresh', 'parent-btn']) {
        assert.equal(shadow().querySelector(`#${id}`).disabled, true, id);
    }
    document.querySelector('#banner').remove(); // Retry remains available if the page replaces the original target.
    shadow().querySelector('#preview-toggle').click();
    assert.equal(shadow().querySelector('#confirm-btn').style.display, 'block');
    assert.match(shadow().querySelector('#impact-notice').textContent, /Rules saved.*remain enabled/);
    assert.equal(shadow().querySelector('#confirm-btn').textContent, 'Retry applying');
    shadow().querySelector('#cancel-btn').click();
    assert.equal(shadow(), undefined);
    assert.deepEqual((await windowStorage(chrome).readSite('example.com')).rules.map(rule => rule.selector), ['#banner']);
    // A fresh page reads the committed rules, as the Close notice promised.
    const fresh = await fixture(t, chrome.snapshot());
    assert.match(fresh.document.querySelector('#glassveil-injected-style').textContent, /#banner/);
    assert.doesNotMatch(fresh.document.querySelector('#glassveil-injected-style').textContent, /#sponsor/);
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
for (const action of ['updateRules', 'toggleBlocker']) {
    test(`bootstrap: ${action} waits for user CSS and reports failure before a safe retry`, async t => {
        const { chrome } = await fixture(t, { rules: { 'example.com': ['#banner'] } });
        const originalSend = chrome.runtime.sendMessage;
        let release, failure = action === 'updateRules' ? 'CSS insertion failed' : 'CSS removal failed';
        const attempts = [];
        chrome.runtime.sendMessage = async message => {
            if (message.type !== 'glassveil-user-css') return originalSend(message);
            attempts.push(message);
            await new Promise(resolve => { release = resolve; });
            return failure ? { ok: false, error: failure } : { ok: true };
        };
        const message = action === 'updateRules' ? { action, rules: ['#sponsor'] } : { action, enabled: false };
        let response;
        chrome.runtime.onMessage.emit(message, {}, result => { response = result; });
        await settle();
        assert.equal(response, undefined);
        assert.equal(attempts.length, 1);
        assert.match(attempts[0].previousCSS, /#banner/);
        if (action === 'updateRules') assert.match(attempts[0].css, /#sponsor/);
        else assert.equal(attempts[0].css, '');
        release(); await settle();
        assert.equal(response.status, 'error');
        assert.equal(response.error, failure);
        failure = ''; response = undefined;
        chrome.runtime.onMessage.emit(message, {}, result => { response = result; });
        await settle();
        assert.equal(response, undefined);
        assert.equal(attempts.length, 2);
        assert.equal(attempts[1].previousCSS, attempts[0].previousCSS);
        release(); await settle();
        assert.equal(response.status, action === 'updateRules' ? 'rules_updated' : 'blocker_toggled');
    });
}
for (const action of ['testRule', 'stopRuleTest']) {
    test(`diagnostic message: ${action} awaits user CSS, reports failure and supports retry`, async t => {
        const { chrome, document } = await fixture(t, { rules: { 'example.com': ['#banner'] } });
        const send = message => new Promise(resolve => chrome.runtime.onMessage.emit(message, {}, resolve));
        if (action === 'stopRuleTest') assert.equal((await send({ action: 'testRule', selector: '#banner' })).status, 'valid');
        const originalSend = chrome.runtime.sendMessage;
        let release, fail = true;
        const attempts = [];
        chrome.runtime.sendMessage = async message => {
            if (message.type !== 'glassveil-user-css') return originalSend(message);
            attempts.push(message);
            await new Promise(resolve => { release = resolve; });
            return fail ? { ok: false, error: 'Diagnostic stylesheet unavailable' } : { ok: true };
        };
        const message = { action, selector: '#banner' };
        let response;
        const pending = send(message).then(result => { response = result; });
        await settle();
        assert.equal(response, undefined);
        assert.equal(Boolean(document.querySelector('glassveil-rule-preview')), action === 'stopRuleTest');
        assert.equal(attempts.length, 1);
        release(); await pending;
        assert.equal(response.status, 'error');
        assert.equal(response.error, 'Diagnostic stylesheet unavailable');
        if (action === 'testRule') assert.match(document.querySelector('#glassveil-injected-style').textContent, /#banner/);
        else assert.ok(document.querySelector('glassveil-rule-preview'));
        fail = false; response = undefined;
        const retry = send(message).then(result => { response = result; });
        await settle();
        assert.equal(response, undefined);
        assert.equal(attempts.length, 2);
        assert.equal(attempts[1].previousCSS, attempts[0].previousCSS);
        release(); await retry;
        assert.equal(response.status, action === 'testRule' ? 'valid' : 'stopped');
        chrome.runtime.sendMessage = originalSend;
        await send({ action: 'stopRuleTest' });
        assert.equal(document.querySelector('glassveil-rule-preview'), null);
    });
}
for (const action of ['startPicker', 'inspectRules']) {
    test(`diagnostic handoff: ${action} propagates resume failure before opening or inspecting`, async t => {
        const { chrome, document } = await fixture(t, { rules: { 'example.com': ['#banner'] } });
        const send = message => new Promise(resolve => chrome.runtime.onMessage.emit(message, {}, resolve));
        await send({ action: 'testRule', selector: '#banner' });
        const originalSend = chrome.runtime.sendMessage;
        chrome.runtime.sendMessage = message => message.type === 'glassveil-user-css'
            ? Promise.resolve({ ok: false, error: 'Could not resume diagnostic blocking' }) : originalSend(message);
        const message = { action, rules: [] };
        const result = await send(message);
        assert.equal(result.status, 'error'); assert.match(result.error, /resume diagnostic/);
        assert.ok(document.querySelector('glassveil-rule-preview'));
        assert.equal(document.querySelector('#glassveil-picker-root'), null);
        chrome.runtime.sendMessage = originalSend;
        const retry = await send(message);
        assert.equal(document.querySelector('glassveil-rule-preview'), null);
        if (action === 'startPicker') assert.equal(retry.status, 'picker_started');
        else assert.deepEqual(Array.from(retry.rules), []);
    });
}
test('picker undo: restores parent child, deselection, outlines, active selector and preview', async t => {
    const { document, start, shadow, chrome } = await fixture(t);
    const child = document.querySelector('#banner'), parent = document.querySelector('#parent');
    await start(); const click = id => shadow().querySelector(`#${id}`).click();
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
    await start(); document.querySelector('#banner').click(); document.querySelector('#sponsor').click();
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
    await start(); const child = document.querySelector('#banner'); child.click();
    shadow().querySelector('#preview-toggle').click(); child.remove();
    shadow().querySelector('#undo-btn').click();
    assert.equal(child.style.display, ''); assert.equal(child.classList.contains('glassveil-picker-selected'), false);
    assert.equal(shadow().querySelector('#undo-btn').disabled, true);
    shadow().querySelector('#cancel-btn').click();
    const event = new window.KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true });
    document.body.dispatchEvent(event); assert.equal(event.defaultPrevented, false);
    await start(); assert.equal(shadow().querySelector('#undo-btn').disabled, true);
    document.querySelector('#sponsor').click(); shadow().querySelector('#confirm-btn').click(); await settle();
    await start(); assert.equal(shadow().querySelector('#undo-btn').disabled, true);
    assert.deepEqual(chrome.snapshot().ruleStore.rules['example.com'].map(rule => rule.selector), ['.saved', '#sponsor']);
});
test('picker undo: Select Parent on a detached subtree cleans selection without marking the detached parent', async t => {
    const { document, start, shadow } = await fixture(t);
    await start(); const child = document.querySelector('#banner'), parent = document.querySelector('#parent');
    child.click(); parent.remove(); shadow().querySelector('#parent-btn').click();
    assert.equal(parent.classList.contains('glassveil-picker-selected'), false);
    assert.equal(child.classList.contains('glassveil-picker-selected'), false);
    assert.equal(shadow().querySelector('#undo-btn').disabled, true);
    assert.equal(shadow().querySelector('#selection-count').textContent, '0 selected');
});
