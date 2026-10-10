const test = require('node:test');
const assert = require('node:assert/strict');
const { replaceUserCSS } = require('../background/user-css.js');
const sender = { id: 'fixture', tab: { id: 7 }, frameId: 0, documentId: 'document-a', url: 'https://example.com/' };
function fixture() {
    const calls = [];
    const chrome = { runtime: { id: 'fixture' }, scripting: {
        insertCSS: async details => calls.push(['insert', details]),
        removeCSS: async details => calls.push(['remove', details])
    } };
    return { chrome, calls };
}
test('user CSS: replace and clear sheets at USER origin in the sender document only', async () => {
    const { chrome, calls } = fixture();
    await replaceUserCSS(chrome, { css: '#ad { display:none !important }', previousCSS: '' }, sender);
    await replaceUserCSS(chrome, { css: '.ad { display:none !important }', previousCSS: '#ad { display:none !important }' }, sender);
    await replaceUserCSS(chrome, { css: '', previousCSS: '.ad { display:none !important }' }, sender);
    assert.deepEqual(calls.map(([action]) => action), ['insert', 'insert', 'remove', 'remove']);
    for (const [, details] of calls) {
        assert.equal(details.origin, 'USER');
        assert.deepEqual(details.target, { tabId: 7, documentIds: ['document-a'] });
    }
    assert.equal(calls[2][1].css, calls[0][1].css);
    assert.equal(calls[3][1].css, calls[1][1].css);
});
test('user CSS: rejects foreign senders, iframe callers and invalid requests before scripting', async () => {
    const { chrome, calls } = fixture();
    for (const invalid of [{ ...sender, id: 'other' }, { ...sender, tab: undefined }, { ...sender, frameId: 1 }, { ...sender, url: 'chrome://settings' }]) {
        await assert.rejects(replaceUserCSS(chrome, { css: '', previousCSS: '' }, invalid), /Invalid style request/);
    }
    await assert.rejects(replaceUserCSS(chrome, { css: 5, previousCSS: '' }, sender));
    assert.equal(calls.length, 0);
});
test('user CSS: failed removal rolls back the new sheet; insertion failure keeps the old sheet', async () => {
    const { chrome, calls } = fixture();
    chrome.scripting.removeCSS = async details => { calls.push(['remove', details]); if (details.css === 'old') throw new Error('remove failed'); };
    await assert.rejects(replaceUserCSS(chrome, { css: 'new', previousCSS: 'old' }, sender), /remove failed/);
    assert.deepEqual(calls.map(([action, details]) => [action, details.css]), [['insert', 'new'], ['remove', 'old'], ['remove', 'new']]);
    calls.length = 0;
    chrome.scripting.insertCSS = async () => { throw new Error('insert failed'); };
    await assert.rejects(replaceUserCSS(chrome, { css: 'new', previousCSS: 'old' }, sender), /insert failed/);
    assert.equal(calls.length, 0);
});
