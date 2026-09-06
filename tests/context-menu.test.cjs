const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { createChrome, event, repo, settle } = require('./helpers/dom.cjs');
function fixture({ existing = true, removeError = '', createError = '' } = {}) {
    const chrome = createChrome(), items = new Map(existing ? [['glassveil-block-element', { title: 'old' }]] : []);
    const unchecked = [], warnings = []; let removeCalls = 0, createCalls = 0;
    const complete = (callback, message) => {
        let read = false;
        Object.defineProperty(chrome.runtime, 'lastError', { configurable: true, get() { read = true; return message ? { message } : undefined; } });
        callback?.();
        if (message && !read) unchecked.push(message);
        delete chrome.runtime.lastError;
    };
    chrome.runtime.onInstalled = event();
    chrome.contextMenus = {
        onClicked: event(),
        removeAll(callback) {
            removeCalls++;
            setImmediate(() => { if (!removeError) items.clear(); complete(callback, removeError); });
        },
        create(properties, callback) {
            createCalls++;
            const message = createError || (items.has(properties.id) ? 'Cannot create item with duplicate id' : '');
            if (!message) items.set(properties.id, properties);
            setImmediate(() => complete(callback, message));
            return properties.id;
        }
    };
    chrome.commands = { onCommand: event() };
    const context = vm.createContext({ chrome, URL, console: { warn: (...args) => warnings.push(args) } });
    context.importScripts = (...files) => files.forEach(file => vm.runInContext(readFileSync(resolve(repo, 'background', file), 'utf8'), context));
    vm.runInContext(readFileSync(resolve(repo, 'background/service-worker.js'), 'utf8'), context);
    const install = () => [...chrome.runtime.onInstalled.listeners][0]({ reason: 'update' });
    return { install, items, unchecked, warnings, calls: () => ({ removeCalls, createCalls }) };
}
for (const existing of [false, true]) test(`context menu: install/reload with existing=${existing} creates one current menu`, async () => {
    const f = fixture({ existing });
    await f.install(); await settle();
    assert.deepEqual(f.unchecked, []); assert.deepEqual(f.warnings, []);
    assert.equal(f.items.size, 1);
    const menu = f.items.get('glassveil-block-element');
    assert.equal(menu.title, 'Block element on this page');
    assert.deepEqual(Array.from(menu.documentUrlPatterns), ['http://*/*', 'https://*/*']);
    await Promise.all([f.install(), f.install()]); await settle();
    assert.equal(f.items.size, 1); assert.deepEqual(f.unchecked, []); assert.deepEqual(f.warnings, []);
});
for (const failure of ['removeError', 'createError']) test(`context menu: handles ${failure} and reports it without unchecked runtime errors`, async () => {
    const f = fixture({ [failure]: 'API failed' });
    await f.install(); await settle();
    assert.deepEqual(f.unchecked, []); assert.equal(f.warnings.length, 1);
    assert.match(f.warnings[0].join(' '), /API failed/);
    if (failure === 'removeError') assert.equal(f.calls().createCalls, 0);
});
