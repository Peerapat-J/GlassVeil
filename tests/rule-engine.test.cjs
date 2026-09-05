const test = require('node:test');
const assert = require('node:assert/strict');
const { createRuleEngine } = require('../content/rule-engine.js');
const { createDOM, settle } = require('./helpers/dom.cjs');
function fixture(t, html = '<div class="ad" id="banner"></div><p id="keep"></p>') {
    const window = createDOM(t, html);
    const engine = createRuleEngine({ document: window.document, MutationObserver: window.MutationObserver });
    return { window, engine, style: () => window.document.querySelector('#glassveil-injected-style') };
}
test('rules: applies and clears CSS for enabled/disabled site state', t => {
    const { window, engine, style } = fixture(t);
    assert.deepEqual(engine.apply(['.ad'], true), { appliedSelectors: ['.ad'], invalidSelectors: [] });
    assert.equal(window.getComputedStyle(window.document.querySelector('.ad')).display, 'none');
    assert.notEqual(window.getComputedStyle(window.document.querySelector('#keep')).display, 'none');
    assert.match(style().textContent, /display: none !important/);
    engine.apply(['.ad'], false); assert.equal(style().textContent, '');
    engine.apply(['.ad'], true); engine.apply([], true); assert.equal(style().textContent, '');
});
test('rules: invalid selectors and unterminated CSS cannot consume later valid rules', t => {
    const { engine, style } = fixture(t);
    const invalid = ['[', '.bad {', '/*'];
    const result = engine.apply(['.ad', ...invalid, '#keep'], true);
    assert.deepEqual(result.appliedSelectors, ['.ad', '#keep']);
    assert.deepEqual(result.invalidSelectors, invalid);
    assert.equal(style().sheet.cssRules.length, 2);
    assert.equal(style().sheet.cssRules[1].selectorText, '#keep');
});
test('rules: empty, malformed and duplicate records are isolated; input stays unchanged', t => {
    const { engine, style } = fixture(t);
    const input = ['.ad', '', ' ', null, {}, '.ad'];
    const before = structuredClone(input);
    engine.apply(input, true);
    assert.equal(style().sheet.cssRules.length, 1);
    assert.deepEqual(input, before);
    engine.apply({ broken: true }, true); assert.equal(style().textContent, '');
});
test('rules: overlapping selectors and zero-match rules remain independently valid', t => {
    const { engine, style, window } = fixture(t);
    const selectors = ['.ad', '#banner', '.not-here', '[data-label="a}b"]'];
    assert.deepEqual(engine.apply(selectors, true).appliedSelectors, selectors);
    assert.equal(style().sheet.cssRules.length, 4);
    assert.equal(window.document.querySelectorAll('.not-here').length, 0);
});
test('rules: safely attaches at document_start and cancels pending attachment on destroy', async t => {
    const window = createDOM(t);
    window.document.documentElement.remove();
    const engine = createRuleEngine({ document: window.document, MutationObserver: window.MutationObserver });
    engine.apply(['.ad'], true);
    window.document.appendChild(window.document.createElement('html'));
    await settle();
    assert.equal(window.document.querySelectorAll('#glassveil-injected-style').length, 1);
    engine.destroy(); assert.equal(window.document.querySelectorAll('style').length, 0);
    window.document.documentElement.remove();
    const pending = createRuleEngine({ document: window.document, MutationObserver: window.MutationObserver });
    pending.destroy();
    window.document.appendChild(window.document.createElement('html'));
    await settle(); assert.equal(window.document.querySelectorAll('style').length, 0);
});
