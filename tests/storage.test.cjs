const test = require('node:test');
const assert = require('node:assert/strict');
const { createStorage } = require('../shared/storage.js');
const { createChrome } = require('./helpers/dom.cjs');
function fixture(initial) {
    const chrome = createChrome(initial);
    return { chrome, storage: createStorage({ area: chrome.storage.local, changes: chrome.storage.onChanged }) };
}
test('storage: empty and legacy string rules read repeatedly without migration or writes', async () => {
    const { chrome, storage } = fixture({ rules: { 'example.com': ['.ad', '#banner', '.ad'] } });
    assert.deepEqual(await storage.readSite('missing.example'), { selectors: [], enabled: true });
    for (let i = 0; i < 2; i++) assert.deepEqual(await storage.readSite('example.com'), { selectors: ['.ad', '#banner', '.ad'], enabled: true });
    assert.equal(chrome.writes.length, 0);
});
test('storage: current scope is exact hostname, without parent/sibling/www inheritance', async () => {
    const { storage } = fixture({ rules: { 'example.com': ['.ad'], 'sub.example.com': ['.sub'] }, disabledSites: { 'example.com': true } });
    assert.deepEqual(await storage.readSite('example.com'), { selectors: ['.ad'], enabled: false });
    assert.deepEqual(await storage.readSite('sub.example.com'), { selectors: ['.sub'], enabled: true });
    for (const hostname of ['www.example.com', 'other.example.com', 'notexample.com', 'example.com.invalid']) {
        assert.deepEqual(await storage.readSite(hostname), { selectors: [], enabled: true });
    }
});
test('storage: malformed values are ignored on read without erasing stored data', async () => {
    const original = { rules: { 'example.com': ['.ad', null, {}, '', ' '], 'other.com': { unknown: 'preserve' } }, disabledSites: null };
    const { chrome, storage } = fixture(original);
    assert.deepEqual(await storage.readSite('example.com'), { selectors: ['.ad'], enabled: true });
    assert.deepEqual(await storage.readSite('other.com'), { selectors: [], enabled: true });
    assert.deepEqual(chrome.snapshot(), original);
});
test('storage: append preserves order and other sites; duplicate append does not write', async () => {
    const { chrome, storage } = fixture({ rules: { 'example.com': ['.ad'], 'other.com': ['.keep'] } });
    assert.deepEqual(await storage.appendSelectors('example.com', ['.ad', ' .new ', null, '']), ['.ad', '.new']);
    await storage.appendSelectors('example.com', ['.new']);
    assert.equal(chrome.writes.length, 1);
    assert.deepEqual(chrome.snapshot().rules['other.com'], ['.keep']);
});
test('storage: delete, reset and site toggles preserve unrelated records', async () => {
    const { chrome, storage } = fixture({ rules: { 'example.com': ['.ad', '.second'], 'other.com': ['.keep'] } });
    assert.deepEqual(await storage.deleteRule('example.com', 0), ['.second']);
    assert.deepEqual(await storage.deleteRule('example.com', -1), ['.second']);
    await storage.setEnabled('example.com', false);
    assert.equal((await storage.readSite('example.com')).enabled, false);
    await storage.setEnabled('example.com', true);
    await storage.deleteRule('example.com', 0);
    assert.equal(Object.hasOwn(chrome.snapshot().rules, 'example.com'), false);
    await storage.appendSelectors('example.com', ['.again']); await storage.resetSite('example.com');
    assert.deepEqual(chrome.snapshot(), { rules: { 'other.com': ['.keep'] }, disabledSites: {} });
});
test('storage: hostname keys cannot read or modify object prototypes', async () => {
    const { chrome, storage } = fixture({ rules: {} });
    assert.deepEqual((await storage.readSite('constructor')).selectors, []);
    await storage.appendSelectors('__proto__', ['.ad']);
    assert.deepEqual((await storage.readSite('__proto__')).selectors, ['.ad']);
    assert.equal(Object.getPrototypeOf(chrome.snapshot().rules), Object.prototype);
});
test('storage: local rule/settings changes notify; unrelated changes and unsubscribed listeners do not', () => {
    const { chrome, storage } = fixture(); let calls = 0;
    const unsubscribe = storage.subscribe(() => calls++);
    chrome.storage.onChanged.emit({ rules: {} }, 'sync');
    chrome.storage.onChanged.emit({ unrelated: {} }, 'local');
    chrome.storage.onChanged.emit({ rules: {} }, 'local');
    chrome.storage.onChanged.emit({ disabledSites: {} }, 'local');
    unsubscribe(); chrome.storage.onChanged.emit({ rules: {} }, 'local');
    assert.equal(calls, 2); assert.equal(chrome.storage.onChanged.listeners.size, 0);
});
test('storage: persistence failure rejects instead of reporting a successful save', async () => {
    const { chrome, storage } = fixture();
    chrome.storage.local.set = async () => { throw new Error('storage unavailable'); };
    await assert.rejects(storage.appendSelectors('example.com', ['.ad']), /storage unavailable/);
    assert.deepEqual(chrome.snapshot(), {});
});
