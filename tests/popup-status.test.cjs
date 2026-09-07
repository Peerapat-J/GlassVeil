const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { classifyURL, classifyTab, createTabAccess } = require('../shared/tab-access.js');
const { formatShortcut } = require('../popup/metadata.js');
const { createDOM, createChrome, load, settle, repo, manifest } = require('./helpers/dom.cjs');
const popupFiles = ['shared/storage.js', 'shared/tab-access.js', 'popup/metadata.js', 'popup/popup.js'];
async function fixture(t, { url = 'https://example.com/', tabId = 7, os = 'mac', shortcut = 'Command+Shift+K', customize = () => {} } = {}) {
    const window = createDOM(t, readFileSync(resolve(repo, 'popup/popup.html'), 'utf8'));
    const chrome = createChrome({ rules: { 'example.com': ['.ad', '.second'] } });
    const calls = { messages: [], injections: [], created: [], closed: false };
    const tab = { id: tabId, url };
    chrome.runtime.getManifest = () => ({ ...manifest, version: '2.3.4' });
    chrome.runtime.getPlatformInfo = async () => ({ os });
    chrome.commands = { getAll: async () => [{ name: 'toggle-picker', shortcut }] };
    chrome.tabs = { query: async () => [tab], get: async () => tab,
        create: async details => calls.created.push(details),
        sendMessage: async (id, message) => { calls.messages.push(message); return message.action === 'inspectRules' ? { rules: [] } : {}; } };
    chrome.scripting = { executeScript: async detail => calls.injections.push(detail), insertCSS: async () => {} };
    customize(chrome, tab, calls);
    window.chrome = chrome; window.confirm = () => true; window.close = () => { calls.closed = true; };
    load(window, popupFiles); await settle();
    const get = id => window.document.getElementById(id);
    return { window, chrome, calls, get, tab };
}
for (const [value, expected] of [
    ['http://example.com/a', 'supported'], ['HTTPS://example.com/a', 'supported'],
    ['chrome://extensions', 'unsupported'], ['edge://settings', 'unsupported'], ['about:blank', 'unsupported'],
    ['chrome-extension://abc/page.html', 'unsupported'], ['file:///tmp/test.html', 'unsupported'], ['data:text/html,hi', 'unsupported'],
    ['https://chromewebstore.google.com/detail/test', 'unsupported'], ['https://chrome.google.com/webstore/detail/test', 'unsupported'],
    ['https://chrome.google.com/webstore-other', 'supported'], ['https://chromewebstore.google.com.example.com/', 'supported'],
    [undefined, 'unavailable'], ['', 'unavailable'], ['not a URL', 'unavailable'], ['https://', 'unavailable'], ['https:example.com', 'unavailable']
]) test(`URL capability: ${String(value)}`, () => assert.equal(classifyURL(value).status, expected));
test('tab capability: missing ID, missing tab and pending navigation', () => {
    assert.equal(classifyTab(undefined).status, 'unavailable');
    assert.equal(classifyTab({ url: 'https://example.com' }).status, 'unavailable');
    assert.equal(classifyTab({ id: 0, url: 'https://example.com' }).status, 'supported');
    assert.equal(classifyTab({ id: 7, url: 'https://example.com', pendingUrl: 'chrome://settings' }).status, 'unsupported');
});
for (const [shortcut, os, expected] of [
    ['Command+Shift+K', 'mac', '⌘⇧K'], ['MacCtrl+Option+K', 'mac', '⌃⌥K'], ['Ctrl+K', 'mac', '⌃K'],
    ['⌘⇧K', 'mac', '⌘⇧K'], ['Ctrl+Shift+K', 'win', 'Ctrl + Shift + K'], ['Alt+K', 'linux', 'Alt + K'],
    ['Search+K', 'cros', 'Search + K'], ['', 'mac', 'Not set'], [undefined, 'win', 'Not set']
]) test(`shortcut: ${shortcut} on ${os}`, () => assert.equal(formatShortcut(shortcut, os), expected));
test('popup: version and configured custom shortcut come from runtime APIs', async t => {
    const { get } = await fixture(t);
    assert.equal(get('extension-version').textContent, 'v2.3.4');
    assert.equal(get('shortcut-hint').textContent, '⌘⇧K');
    assert.equal(get('pick-element-btn').disabled, false);
});
test('popup: no assignment and command API failure never show the suggested binding', async t => {
    const unassigned = await fixture(t, { shortcut: '' });
    assert.equal(unassigned.get('shortcut-hint').textContent, 'Not set');
    const failed = await fixture(t, { customize: chrome => { chrome.commands.getAll = async () => { throw new Error('commands unavailable'); }; } });
    assert.equal(failed.get('shortcut-hint').textContent, 'Unavailable');
    assert.equal(failed.get('pick-element-btn').disabled, false);
    assert.equal(failed.get('extension-version').textContent, 'v2.3.4');
});
test('popup: platform API failure preserves the configured shortcut text', async t => {
    const { get } = await fixture(t, { customize: chrome => { chrome.runtime.getPlatformInfo = async () => { throw new Error('platform unavailable'); }; } });
    assert.equal(get('shortcut-hint').textContent, 'Command + Shift + K');
    assert.equal(get('pick-element-btn').disabled, false);
});
for (const url of ['chrome://settings', 'edge://extensions', 'chrome-extension://abc/options', 'https://chromewebstore.google.com/', '', 'not a URL']) {
    test(`popup: unsupported/unavailable ${url} disables all site actions without storage writes`, async t => {
        const { get, chrome, calls, window } = await fixture(t, { url });
        assert.equal(get('pick-element-btn').disabled, true); assert.equal(get('blocker-toggle').disabled, true);
        assert.equal(get('clear-all-btn').disabled, true); assert.equal(get('rules-section').hidden, true);
        assert.equal(get('page-notice').hidden, false);
        get('pick-element-btn').click(); get('clear-all-btn').click();
        get('blocker-toggle').dispatchEvent(new window.Event('change'));
        get('shortcut-settings-link').click(); await settle();
        assert.equal(chrome.writes.length, 0); assert.equal(calls.messages.length, 0); assert.equal(calls.injections.length, 0);
        assert.equal(calls.created[0].url, 'chrome://extensions/shortcuts');
        assert.equal(get('extension-version').textContent, 'v2.3.4');
        assert.equal(get('shortcut-hint').textContent, '⌘⇧K');
    });
}
test('popup: failed tab query disables controls and Retry recovers', async t => {
    let fail = true;
    const { chrome, tab, get } = await fixture(t, { customize: (chrome, tab) => { chrome.tabs.query = async () => { if (fail) throw new Error('query failed'); return [tab]; }; } });
    assert.equal(get('blocker-toggle').disabled, true); assert.equal(get('retry-action').hidden, false);
    fail = false; get('retry-action').click(); await settle();
    assert.equal(get('pick-element-btn').disabled, false); assert.equal(get('page-notice').hidden, true);
    assert.equal(chrome.writes.length, 1); assert.equal(get('current-domain').textContent, new URL(tab.url).hostname);
});
test('popup: injection failure is a visible retryable connection error, not unsupported', async t => {
    let fail = true;
    const { get, calls } = await fixture(t, { customize: chrome => {
        chrome.tabs.sendMessage = async () => { if (fail) throw new Error('no content script'); };
        chrome.scripting.executeScript = async () => { throw new Error('temporary injection error'); };
    } });
    get('pick-element-btn').click(); await settle();
    assert.equal(get('status-badge').textContent, 'Error'); assert.equal(get('current-domain').textContent, 'example.com');
    assert.match(get('page-message').textContent, /Could not connect/); assert.equal(get('retry-action').hidden, false);
    assert.equal(calls.closed, false);
    fail = false; get('retry-action').click(); await settle(); assert.equal(calls.closed, true);
});
test('popup: retry after persisted delete synchronizes without deleting the next rule', async t => {
    let fail = true;
    const { get, chrome, window } = await fixture(t, { customize: chrome => {
        chrome.tabs.sendMessage = async (id, message) => { if (fail) throw new Error('no receiver'); return message.action === 'inspectRules' ? { rules: [] } : {}; };
        chrome.scripting.executeScript = async () => { throw new Error('injection failed'); };
    } });
    window.document.querySelector('.btn-delete').click(); await settle();
    assert.deepEqual(chrome.snapshot().ruleStore.rules['example.com'].map(rule => rule.selector), ['.second']);
    fail = false; get('retry-action').click(); await settle();
    assert.deepEqual(chrome.snapshot().ruleStore.rules['example.com'].map(rule => rule.selector), ['.second']);
    assert.equal(chrome.writes.length, 2); assert.equal(get('page-notice').hidden, true);
});
test('popup: navigation to a restricted page before an action prevents storage writes and injection', async t => {
    const { get, tab, chrome, calls } = await fixture(t);
    tab.url = 'chrome://settings'; get('blocker-toggle').click(); await settle();
    assert.equal(chrome.writes.length, 1); assert.ok(calls.messages.every(message => message.action === 'inspectRules'));
    assert.equal(get('status-badge').textContent, 'Unsupported'); assert.equal(get('blocker-toggle').disabled, true);
});
test('tab access: never attempts unsupported injection and detects changed/inaccessible tabs', async () => {
    let sent = 0;
    const chrome = { tabs: { get: async () => ({ id: 1, url: 'https://other.com/' }), sendMessage: async () => { sent++; } } };
    const access = createTabAccess(chrome);
    await assert.rejects(access.send({ id: 1, url: 'chrome://settings' }, {}), { kind: 'unsupported' });
    await assert.rejects(access.send({ id: 1, url: 'https://example.com/' }, {}), { kind: 'unavailable' });
    chrome.tabs.get = async () => { throw new Error('gone'); };
    await assert.rejects(access.send({ id: 1, url: 'https://example.com/' }, {}), { kind: 'unavailable' });
    assert.equal(sent, 0);
});
test('popup: missing active tab or missing URL keeps metadata and disables site controls', async t => {
    for (const customize of [chrome => { chrome.tabs.query = async () => []; }, (chrome, tab) => { delete tab.url; }]) {
        const { get, chrome } = await fixture(t, { customize });
        assert.equal(get('status-badge').textContent, 'Unavailable');
        assert.equal(get('blocker-toggle').disabled, true); assert.equal(get('retry-action').hidden, false);
        assert.equal(get('extension-version').textContent, 'v2.3.4'); assert.equal(chrome.writes.length, 0);
    }
});
test('popup: storage failure is visible and reload can recover without a write', async t => {
    let fail = true;
    const { get, chrome } = await fixture(t, { customize: chrome => {
        const original = chrome.storage.local.get;
        chrome.storage.local.get = async keys => { if (fail) throw new Error('storage offline'); return original(keys); };
    } });
    assert.equal(get('pick-element-btn').disabled, true); assert.equal(get('page-notice').hidden, false);
    fail = false; get('retry-action').click(); await settle();
    assert.equal(get('pick-element-btn').disabled, false); assert.equal(chrome.writes.length, 1);
});
test('popup: reopening reads a changed binding instead of caching the old shortcut', async t => {
    assert.equal((await fixture(t, { os: 'win', shortcut: 'Ctrl+K' })).get('shortcut-hint').textContent, 'Ctrl + K');
    assert.equal((await fixture(t, { os: 'win', shortcut: 'Alt+J' })).get('shortcut-hint').textContent, 'Alt + J');
});
test('popup: failed rule toggle keeps the saved state and can retry the same change', async t => {
    const { window, chrome, get } = await fixture(t);
    const checkbox = () => window.document.querySelector('.rule-enabled');
    const originalSet = chrome.storage.local.set;
    chrome.storage.local.set = async () => { throw new Error('storage offline'); };
    checkbox().click(); await settle();
    assert.equal(chrome.snapshot().ruleStore.rules['example.com'][0].enabled, true);
    assert.equal(checkbox().checked, true);
    assert.match(get('page-message').textContent, /storage offline/);
    assert.equal(checkbox().disabled, false);
    chrome.storage.local.set = originalSet;
    checkbox().click(); await settle();
    assert.equal(chrome.snapshot().ruleStore.rules['example.com'][0].enabled, false);
    assert.equal(checkbox().checked, false);
    assert.equal(get('page-notice').hidden, true);
});
