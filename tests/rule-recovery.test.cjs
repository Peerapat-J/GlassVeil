const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { createStorage } = require('../shared/storage.js');
const { createDOM, createChrome, load, settle, repo } = require('./helpers/dom.cjs');
const first = { id: 'a', selector: '.ad', enabled: false, createdAt: 10, sourceUrl: 'https://example.com/a', scope: 'hostname' };
const second = { ...first, id: 'b', selector: '.second', enabled: true };
const initial = () => ({ ruleStore: { version: 1, rules: { 'example.com': [first, second], 'other.com': [{ ...first, id: 'c' }] }, disabledSites: {} } });
function fixture() {
    const chrome = createChrome(initial()); let clock = 100, sequence = 0;
    const storage = createStorage({ area: chrome.storage.local, changes: chrome.storage.onChanged, now: () => clock, uuid: () => `new-${++sequence}` });
    return { chrome, storage, advance: value => { clock += value; } };
}
for (const operation of ['delete', 'reset']) test(`recovery: ${operation} restores exact records/order once, including after a worker restart`, async () => {
    const { storage, chrome } = fixture();
    const result = operation === 'delete' ? await storage.deleteRule('example.com', 'a') : await storage.resetSite('example.com');
    assert.equal(result.rules.length, operation === 'delete' ? 1 : 0);
    assert.equal(result.recovery.expiresAt, 30100);
    assert.equal(JSON.stringify(chrome.snapshot()).includes('expiresAt'), false); // Snapshot stays in the client session.
    const restarted = createStorage({ area: chrome.storage.local, changes: chrome.storage.onChanged, now: () => 200 });
    const restored = await restarted.restoreRules('example.com', result.recovery);
    assert.deepEqual(restored.rules, [first, second]);
    assert.deepEqual(chrome.snapshot().ruleStore.rules['other.com'], initial().ruleStore.rules['other.com']);
    const writes = chrome.writes.length;
    await assert.rejects(restarted.restoreRules('example.com', result.recovery), { code: 'RECOVERY_UNAVAILABLE' });
    assert.equal(chrome.writes.length, writes);
});
test('recovery: expiry at the deadline rejects without writes', async () => {
    const { storage, chrome, advance } = fixture();
    const { recovery } = await storage.resetSite('example.com'); advance(30000);
    const before = chrome.snapshot(), writes = chrome.writes.length;
    await assert.rejects(storage.restoreRules('example.com', recovery), /expired/);
    assert.deepEqual(chrome.snapshot(), before); assert.equal(chrome.writes.length, writes);
});
for (const change of ['append', 'edit', 'delete', 'reset', 'toggle', 'edit-back', 'manual']) test(`recovery: ${change} invalidates an older snapshot without overwriting newer state`, async () => {
    const { storage, chrome } = fixture();
    const { recovery } = await storage.deleteRule('example.com', 'a');
    if (change === 'append') await storage.appendSelectors('example.com', ['.new']);
    if (change === 'edit' || change === 'edit-back') await storage.updateRule('example.com', 'b', { selector: '.edited' });
    if (change === 'edit-back') await storage.updateRule('example.com', 'b', { selector: '.second' });
    if (change === 'delete') await storage.deleteRule('example.com', 'b');
    if (change === 'reset') await storage.resetSite('example.com');
    if (change === 'toggle') await storage.setEnabled('example.com', false);
    if (change === 'manual') {
        const data = chrome.snapshot(); data.ruleStore.rules['example.com'][0].selector = '.manual';
        await chrome.storage.local.set(data);
    }
    const before = chrome.snapshot(), writes = chrome.writes.length;
    await assert.rejects(storage.restoreRules('example.com', recovery), /changed/);
    assert.deepEqual(chrome.snapshot(), before); assert.equal(chrome.writes.length, writes);
});
test('recovery: unrelated writes and stale no-op deletes do not invalidate the snapshot', async () => {
    const { storage } = fixture();
    const { recovery } = await storage.deleteRule('example.com', 'a');
    assert.equal((await storage.deleteRule('example.com', 'a')).recovery, null);
    await storage.appendSelectors('other.com', ['.new']);
    assert.deepEqual((await storage.restoreRules('example.com', recovery)).rules, [first, second]);
});
test('recovery: repeated deletes only allow the newest snapshot and restore its original order', async () => {
    const { storage } = fixture();
    const old = await storage.deleteRule('example.com', 'a');
    const recent = await storage.deleteRule('example.com', 'b');
    await assert.rejects(storage.restoreRules('example.com', old.recovery), /changed/);
    assert.deepEqual((await storage.restoreRules('example.com', recent.recovery)).rules, [second]);
    await assert.rejects(storage.restoreRules('example.com', old.recovery), /changed/);
});
test('recovery: failed restoration keeps the saved deletion and supports retry', async () => {
    const { storage, chrome } = fixture();
    const { recovery } = await storage.resetSite('example.com');
    const before = chrome.snapshot(), set = chrome.storage.local.set;
    chrome.storage.local.set = async () => { throw new Error('write failed'); };
    await assert.rejects(storage.restoreRules('example.com', recovery), /write failed/);
    assert.deepEqual(chrome.snapshot(), before);
    chrome.storage.local.set = set;
    assert.deepEqual((await storage.restoreRules('example.com', recovery)).rules, [first, second]);
});
test('recovery: malformed snapshots, wrong sites and damaged current records cannot be restored', async () => {
    const { storage, chrome } = fixture();
    const { recovery } = await storage.resetSite('example.com');
    const writes = chrome.writes.length;
    for (const snapshot of [null, { ...recovery, before: [null] }, { ...recovery, before: [first, first] }, { ...recovery, expiresAt: NaN }]) {
        await assert.rejects(storage.restoreRules('example.com', snapshot), { code: 'RECOVERY_UNAVAILABLE' });
    }
    await assert.rejects(storage.restoreRules('other.com', recovery), { code: 'RECOVERY_UNAVAILABLE' });
    assert.equal(chrome.writes.length, writes);
    const data = chrome.snapshot(); data.ruleStore.rules['example.com'] = [null]; await chrome.storage.local.set(data);
    await assert.rejects(storage.restoreRules('example.com', recovery), /changed/);
    assert.deepEqual(chrome.snapshot(), data);
});
async function popupFixture(t) {
    const chrome = createChrome(initial()), tab = { id: 1, url: 'https://example.com/' };
    const page = createDOM(t, '<div class="ad"></div><div class="second"></div>');
    page.chrome = chrome; load(page); await settle();
    let failConnection = false;
    chrome.tabs = { query: async () => [tab], get: async () => tab, sendMessage: async (id, message) => {
        if (failConnection) throw new Error('connection failed');
        return new Promise(resolve => chrome.runtime.onMessage.emit(message, {}, resolve));
    } };
    chrome.scripting = { executeScript: async () => { throw new Error('injection failed'); } };
    const popup = createDOM(t, readFileSync(resolve(repo, 'popup/popup.html'), 'utf8'));
    popup.chrome = chrome; popup.confirm = () => { throw new Error('Reset should offer Undo without a dialog'); };
    load(popup, ['shared/storage.js', 'shared/tab-access.js', 'popup/metadata.js', 'popup/popup.js']); await settle();
    return { chrome, page, popup, get: id => popup.document.getElementById(id), failConnection: value => { failConnection = value; } };
}
for (const operation of ['delete', 'reset']) test(`popup recovery: ${operation}, Undo and page synchronization preserve records`, async t => {
    const { chrome, page, popup, get } = await popupFixture(t);
    (operation === 'delete' ? popup.document.querySelectorAll('.btn-delete')[1] : get('clear-all-btn')).click(); await settle();
    assert.equal(get('recovery-notice').hidden, false); assert.equal(get('undo-rule-action').disabled, false);
    assert.equal(page.document.querySelector('#glassveil-injected-style').textContent, '');
    get('undo-rule-action').click(); await settle();
    assert.deepEqual(chrome.snapshot().ruleStore.rules['example.com'], [first, second]);
    assert.match(page.document.querySelector('#glassveil-injected-style').textContent, /second/);
    assert.equal(get('undo-rule-action').hidden, true); assert.match(get('recovery-message').textContent, /restored/);
});
test('popup recovery: expiry and popup closure discard session recovery', async t => {
    const { popup, get } = await popupFixture(t); let expire;
    popup.setTimeout = callback => { expire = callback; return 1; };
    get('clear-all-btn').click(); await settle(); expire();
    assert.equal(get('undo-rule-action').hidden, true); assert.match(get('recovery-message').textContent, /expired/);
    get('undo-rule-action').click(); await settle(); assert.equal(get('rule-count').textContent, '0');
    popup.dispatchEvent(new popup.Event('pagehide'));
    assert.equal(get('recovery-notice').hidden, true);
});
test('popup recovery: storage failure keeps Undo for retry; conflict removes it', async t => {
    const { chrome, get } = await popupFixture(t);
    get('clear-all-btn').click(); await settle();
    const set = chrome.storage.local.set;
    chrome.storage.local.set = async () => { throw new Error('write failed'); };
    get('undo-rule-action').click(); await settle();
    assert.equal(get('undo-rule-action').hidden, false); assert.match(get('page-message').textContent, /write failed/);
    chrome.storage.local.set = set;
    get('undo-rule-action').click(); await settle(); assert.equal(get('rule-count').textContent, '2');
    get('clear-all-btn').click(); await settle();
    await chrome.runtime.sendMessage({ method: 'appendSelectors', args: ['example.com', ['.new']] });
    get('undo-rule-action').click(); await settle();
    assert.equal(get('undo-rule-action').hidden, true); assert.match(get('page-message').textContent, /changed/);
    assert.deepEqual(chrome.snapshot().ruleStore.rules['example.com'].map(rule => rule.selector), ['.new']);
});
test('popup recovery: communication failure keeps recovery; Retry never repeats deletion or restoration', async t => {
    const { chrome, get, failConnection } = await popupFixture(t);
    failConnection(true); get('clear-all-btn').click(); await settle();
    assert.equal(get('undo-rule-action').hidden, false);
    failConnection(false); get('retry-action').click(); await settle();
    assert.equal(get('rule-count').textContent, '0'); assert.equal(get('undo-rule-action').hidden, false);
    failConnection(true); get('undo-rule-action').click(); await settle();
    assert.equal(get('undo-rule-action').hidden, true);
    const writes = chrome.writes.length;
    failConnection(false); get('retry-action').click(); await settle();
    assert.equal(chrome.writes.length, writes); assert.equal(get('rule-count').textContent, '2');
});
test('recovery: concurrent restores serialize so only one succeeds', async () => {
    const { storage, chrome } = fixture();
    const { recovery } = await storage.resetSite('example.com');
    const writes = chrome.writes.length;
    const results = await Promise.allSettled([storage.restoreRules('example.com', recovery), storage.restoreRules('example.com', recovery)]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(chrome.writes.length, writes + 1);
    assert.deepEqual(chrome.snapshot().ruleStore.rules['example.com'], [first, second]);
});
test('recovery: a slow storage read cannot restore after the deadline', async () => {
    const { storage, chrome, advance } = fixture();
    const { recovery } = await storage.resetSite('example.com');
    const get = chrome.storage.local.get, writes = chrome.writes.length;
    chrome.storage.local.get = async keys => { advance(30000); return get(keys); };
    await assert.rejects(storage.restoreRules('example.com', recovery), /expired/);
    assert.equal(chrome.writes.length, writes);
});
test('recovery: reset/restore preserves disabled site state and legacy backup', async () => {
    const chrome = createChrome({ rules: { 'example.com': ['.ad'] }, disabledSites: { 'example.com': true } });
    const storage = createStorage({ area: chrome.storage.local, changes: chrome.storage.onChanged });
    const { recovery } = await storage.resetSite('example.com');
    const result = await storage.restoreRules('example.com', recovery);
    assert.equal(result.enabled, false); assert.deepEqual(result.selectors, ['.ad']);
    assert.deepEqual(chrome.snapshot().rules, { 'example.com': ['.ad'] });
    assert.deepEqual(chrome.snapshot().disabledSites, { 'example.com': true });
});
test('popup recovery: successful local edits discard old Undo but failed deletion keeps it', async t => {
    const { chrome, popup, get } = await popupFixture(t);
    popup.document.querySelector('.btn-delete').click(); await settle();
    const set = chrome.storage.local.set;
    chrome.storage.local.set = async () => { throw new Error('write failed'); };
    get('clear-all-btn').click(); await settle();
    assert.equal(get('undo-rule-action').hidden, false);
    chrome.storage.local.set = set;
    popup.document.querySelector('.rule-enabled').click(); await settle();
    assert.equal(get('undo-rule-action').hidden, true);
});

test('popup recovery: transient reload failure preserves the receipt for a later Undo', async t => {
    const { chrome, get } = await popupFixture(t);
    get('clear-all-btn').click(); await settle();
    const set = chrome.storage.local.set, read = chrome.storage.local.get;
    chrome.storage.local.set = async () => { throw new Error('write failed'); };
    get('undo-rule-action').click(); await settle();
    chrome.storage.local.set = set;
    chrome.storage.local.get = async () => { throw new Error('read failed'); };
    get('retry-action').click(); await settle();
    assert.equal(get('undo-rule-action').hidden, false);
    assert.equal(get('undo-rule-action').disabled, true);
    chrome.storage.local.get = read;
    get('retry-action').click(); await settle();
    assert.equal(get('undo-rule-action').disabled, false);
    get('undo-rule-action').click(); await settle();
    assert.equal(get('rule-count').textContent, '2');
    assert.equal(get('undo-rule-action').hidden, true);
});
