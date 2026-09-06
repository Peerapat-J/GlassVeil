const test = require('node:test');
const assert = require('node:assert/strict');
const { createStorage } = require('../shared/storage.js');
const { createChrome } = require('./helpers/dom.cjs');
function fixture(initial) {
    const chrome = createChrome(initial); let id = 0;
    return { chrome, storage: createStorage({ area: chrome.storage.local, changes: chrome.storage.onChanged, uuid: () => `id-${++id}`, now: () => 100 }) };
}
test('storage migration: legacy order, duplicate policy, backup and repeated/restarted reads', async () => {
    const original = { 'example.com': [' .ad ', '#banner', '.ad'] };
    const { chrome, storage } = fixture({ rules: original, disabledSites: { 'example.com': true } });
    const site = await storage.readSite('example.com');
    assert.deepEqual(site.rules.map(rule => rule.selector), ['.ad', '#banner']);
    assert.equal(site.enabled, false); assert.equal(site.migration.duplicates, 1);
    assert.deepEqual(site.rules[0], { id: 'id-1', selector: '.ad', enabled: true, createdAt: 100, sourceUrl: '', scope: 'hostname' });
    assert.deepEqual(await storage.readSite('example.com'), site);
    const reopened = createStorage({ area: chrome.storage.local, changes: chrome.storage.onChanged });
    assert.deepEqual(await reopened.readSite('example.com'), site);
    assert.equal(chrome.writes.length, 1); assert.deepEqual(chrome.snapshot().rules, original);
    assert.equal(chrome.snapshot().ruleStore.version, 1);
});
test('storage migration: mixed records preserve identity/metadata/enabled state and isolate malformed entries', async () => {
    const record = { id: 'existing', selector: '.off', enabled: false, createdAt: 20, sourceUrl: 'https://example.com/a', scope: 'hostname' };
    const original = { 'example.com': [null, {}, '', '.ad', record, { selector: '.future', scope: 'subdomains' }], 'other.com': 'broken' };
    const { chrome, storage } = fixture({ rules: original });
    const site = await storage.readSite('example.com');
    assert.deepEqual(site.selectors, ['.ad']); assert.deepEqual(site.rules[1], record);
    assert.equal(site.migration.skipped, 5); assert.deepEqual(chrome.snapshot().rules, original);
});
test('storage: exact hostname scope and site toggles preserve other sites', async () => {
    const { storage } = fixture({ rules: { 'example.com': ['.ad'], 'sub.example.com': ['.sub'] } });
    await storage.setEnabled('example.com', false);
    assert.equal((await storage.readSite('example.com')).enabled, false);
    assert.equal((await storage.readSite('sub.example.com')).enabled, true);
    for (const host of ['www.example.com', 'other.example.com', 'notexample.com', 'example.com.invalid']) assert.deepEqual((await storage.readSite(host)).rules, []);
});
test('storage: updates use stable IDs, persist disabled state and keep metadata/order', async () => {
    const { chrome, storage } = fixture();
    const site = await storage.appendSelectors('example.com', ['.ad', '.second'], 'https://example.com/a');
    const first = site.rules[0], second = site.rules[1];
    await storage.updateRule('example.com', first.id, { enabled: false, selector: '.edited', id: 'ignored', createdAt: 999 });
    const updated = await storage.readSite('example.com');
    assert.deepEqual(updated.selectors, ['.second']); assert.deepEqual(updated.rules[0], { ...first, selector: '.edited', enabled: false });
    assert.deepEqual(updated.rules[1], second);
    await storage.deleteRule('example.com', first.id); await storage.deleteRule('example.com', first.id);
    assert.deepEqual((await storage.readSite('example.com')).rules, [second]);
    assert.deepEqual(chrome.snapshot().ruleStore.rules['example.com'], [second]);
});
test('storage: duplicate append does not re-enable disabled rules or rewrite metadata', async () => {
    const { chrome, storage } = fixture({ rules: { 'example.com': ['.ad'] } });
    const first = (await storage.readSite('example.com')).rules[0];
    await storage.updateRule('example.com', first.id, { enabled: false }); const writes = chrome.writes.length;
    await storage.appendSelectors('example.com', [' .ad ', '.ad']);
    assert.equal(chrome.writes.length, writes); assert.equal((await storage.readSite('example.com')).rules[0].enabled, false);
    await assert.rejects(storage.updateRule('example.com', 'missing', { enabled: true }), /no longer exists/);
});
test('storage: duplicate edits, invalid flags and empty hostnames reject without changing stored rules', async () => {
    const { storage, chrome } = fixture({ rules: { 'example.com': ['.a', '.b'] } });
    const site = await storage.readSite('example.com'), before = chrome.snapshot();
    await assert.rejects(storage.updateRule('example.com', site.rules[0].id, { selector: '.b' }), /already saved/);
    await assert.rejects(storage.updateRule('example.com', site.rules[0].id, { enabled: 'false' }), /Invalid/);
    await assert.rejects(storage.appendSelectors('', ['.ad']), /hostname/);
    assert.deepEqual(chrome.snapshot(), before);
});
test('storage: serialized concurrent migrations and cross-site mutations retain every update', async () => {
    const { storage, chrome } = fixture({ rules: { 'legacy.com': ['.old'] } });
    await Promise.all([storage.appendSelectors('a.com', ['.a']), storage.appendSelectors('b.com', ['.b']), storage.appendSelectors('a.com', ['.more'])]);
    assert.deepEqual((await storage.readSite('a.com')).selectors, ['.a', '.more']);
    assert.deepEqual((await storage.readSite('b.com')).selectors, ['.b']);
    assert.deepEqual((await storage.readSite('legacy.com')).selectors, ['.old']);
    assert.equal(chrome.writes.length, 4);
});
test('storage: future schema and damaged envelopes are never overwritten', async () => {
    for (const ruleStore of [{ version: 2, rules: {} }, { version: 1, rules: null, disabledSites: {} }, null]) {
        const { storage, chrome } = fixture({ ruleStore, rules: { 'example.com': ['.backup'] } });
        await assert.rejects(storage.appendSelectors('example.com', ['.new']));
        assert.equal(chrome.writes.length, 0); assert.deepEqual(chrome.snapshot().ruleStore, ruleStore);
    }
});
test('storage: migration/write failure rejects, preserves backup and permits later retry', async () => {
    const { storage, chrome } = fixture({ rules: { 'example.com': ['.ad'] } });
    const set = chrome.storage.local.set; chrome.storage.local.set = async () => { throw new Error('storage unavailable'); };
    await assert.rejects(storage.readSite('example.com'), /unavailable/);
    assert.deepEqual(chrome.snapshot(), { rules: { 'example.com': ['.ad'] } });
    chrome.storage.local.set = set; assert.deepEqual((await storage.readSite('example.com')).selectors, ['.ad']);
});
test('storage: reset/prototype keys preserve unrelated sites and legacy backup', async () => {
    const { storage, chrome } = fixture({ rules: { 'other.com': ['.keep'] } });
    await storage.appendSelectors('__proto__', ['.ad']);
    assert.deepEqual((await storage.readSite('__proto__')).selectors, ['.ad']);
    assert.equal(Object.getPrototypeOf(chrome.snapshot().ruleStore.rules), Object.prototype);
    await storage.resetSite('__proto__'); assert.deepEqual((await storage.readSite('other.com')).selectors, ['.keep']);
    assert.deepEqual(chrome.snapshot().rules, { 'other.com': ['.keep'] });
});
test('storage: only authoritative local changes notify subscribers', () => {
    const { storage, chrome } = fixture(); let calls = 0;
    const unsubscribe = storage.subscribe(() => calls++);
    chrome.storage.onChanged.emit({ ruleStore: {} }, 'sync'); chrome.storage.onChanged.emit({ rules: {} }, 'local');
    chrome.storage.onChanged.emit({ ruleStore: {} }, 'local'); unsubscribe(); chrome.storage.onChanged.emit({ ruleStore: {} }, 'local');
    assert.equal(calls, 1);
});
test('storage migration: duplicate IDs become unique and a disabled record survives restart/reset', async () => {
    const { storage, chrome } = fixture({ rules: { 'example.com': [
        { id: 'same', selector: '.a', enabled: false, scope: 'hostname', createdAt: 0 },
        { id: 'same', selector: '.b', enabled: true, scope: 'hostname' }
    ] } });
    const first = await storage.readSite('example.com');
    assert.equal(new Set(first.rules.map(rule => rule.id)).size, 2);
    const reopened = createStorage({ area: chrome.storage.local, changes: chrome.storage.onChanged });
    assert.equal((await reopened.readSite('example.com')).rules[0].enabled, false);
    assert.equal((await reopened.readSite('example.com')).rules[0].createdAt, 0);
    await reopened.resetSite('example.com');
    assert.deepEqual((await storage.readSite('example.com')).rules, []);
    assert.equal(chrome.snapshot().rules['example.com'].length, 2);
});
test('storage: malformed versioned records remain intact when edits cannot safely rewrite the site', async () => {
    const good = { id: 'good', selector: '.good', enabled: true, createdAt: 0, sourceUrl: '', scope: 'hostname' };
    const { storage, chrome } = fixture({ ruleStore: { version: 1, rules: { 'example.com': [good, '.legacy-in-wrong-schema'] }, disabledSites: {} } });
    assert.deepEqual((await storage.readSite('example.com')).selectors, ['.good']);
    const before = chrome.snapshot();
    await assert.rejects(storage.appendSelectors('example.com', ['.new']), /damaged/);
    assert.deepEqual(chrome.snapshot(), before);
    await storage.appendSelectors('other.com', ['.safe']);
    assert.deepEqual(chrome.snapshot().ruleStore.rules['example.com'], before.ruleStore.rules['example.com']);
});
test('storage: site toggles reject damaged records without writes and leave other sites usable', async () => {
    const good = { id: 'good', selector: '.good', enabled: true, createdAt: 0, sourceUrl: '', scope: 'hostname' };
    for (const damaged of [[good, '.malformed'], null, { unexpected: true }]) {
        for (const enabled of [true, false]) {
            const { storage, chrome } = fixture({ ruleStore: { version: 1,
                rules: { 'example.com': damaged, 'other.com': [good] },
                disabledSites: enabled ? { 'example.com': true } : {} } });
            const before = chrome.snapshot();
            await assert.rejects(storage.setEnabled('example.com', enabled), /damaged/);
            assert.equal(chrome.writes.length, 0);
            assert.deepEqual(chrome.snapshot(), before);
            await storage.setEnabled('other.com', false);
            assert.equal((await storage.readSite('other.com')).enabled, false);
            assert.deepEqual(chrome.snapshot().ruleStore.rules, before.ruleStore.rules);
            await storage.setEnabled('empty.com', false);
            assert.equal((await storage.readSite('empty.com')).enabled, false);
            await storage.setEnabled('empty.com', true);
            assert.equal((await storage.readSite('empty.com')).enabled, true);
        }
    }
});
