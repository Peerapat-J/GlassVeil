const { JSDOM } = require('jsdom');
const escape = require('css.escape');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const manifest = require('../../manifest.json');
const repo = resolve(__dirname, '../..');

function createDOM(t, html = '', url = 'https://example.com/article') {
    const dom = new JSDOM(`<!doctype html><html><head></head><body>${html}</body></html>`, {
        url, runScripts: 'outside-only', pretendToBeVisual: true
    });
    dom.window.CSS = { ...dom.window.CSS, escape };
    t.after(dom.window.close.bind(dom.window));
    return dom.window;
}
function event() {
    const listeners = new Set();
    return {
        listeners,
        addListener: listener => listeners.add(listener),
        removeListener: listener => listeners.delete(listener),
        emit: (...args) => { for (const listener of listeners) listener(...args); }
    };
}
function createChrome(initial = {}) {
    let data = structuredClone(initial);
    const changes = event();
    const writes = [];
    let server;
    const chrome = {
        writes,
        snapshot: () => structuredClone(data),
        runtime: { onMessage: event(), getManifest: () => manifest, getURL: path => `chrome-extension://fixture/${path}` },
        storage: {
            onChanged: changes,
            local: {
                async get(keys) {
                    const names = keys == null ? Object.keys(data) : Array.isArray(keys) ? keys : [keys];
                    return structuredClone(Object.fromEntries(names.filter(key => Object.hasOwn(data, key)).map(key => [key, data[key]])));
                },
                async set(update) {
                    writes.push(structuredClone(update));
                    const diff = Object.fromEntries(Object.entries(update).map(([key, value]) => [key, { oldValue: data[key], newValue: value }]));
                    data = { ...data, ...structuredClone(update) };
                    changes.emit(diff, 'local');
                }
            }
        }
    };
    chrome.runtime.id = 'fixture';
    chrome.runtime.sendMessage = async message => {
        server ||= require('../../shared/storage.js').createStorage({ area: chrome.storage.local, changes });
        try { return { ok: true, value: await server[message.method](...message.args) }; }
        catch (error) { return { ok: false, error: error.message, code: error.code }; }
    };
    return chrome;
}
function load(window, files = manifest.content_scripts[0].js) {
    for (const file of files) window.eval(`${readFileSync(resolve(repo, file), 'utf8')}\n//# sourceURL=${file}`);
}
const settle = () => new Promise(resolve => setImmediate(resolve));
module.exports = { createDOM, createChrome, load, settle, manifest, repo, event };
