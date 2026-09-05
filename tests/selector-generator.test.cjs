const test = require('node:test');
const assert = require('node:assert/strict');
const { createSelectorGenerator } = require('../content/selector-generator.js');
const { isPickerStateClass } = require('../content/picker-utils.js');
const { createDOM } = require('./helpers/dom.cjs');
const fixtures = require('./fixtures/selectors.cjs');
function generator(window, CSS = window.CSS) {
    return createSelectorGenerator({ document: window.document, Node: window.Node, CSS, isPickerStateClass });
}
for (const { name, html, expected } of fixtures) {
    test(`selector: ${name}`, t => {
        const window = createDOM(t, html);
        const target = window.document.querySelector('[data-target]');
        const selector = generator(window)(target);
        assert.equal(selector, expected);
        const matches = [...window.document.querySelectorAll(selector)];
        assert.equal(matches.length, 1);
        assert.equal(matches[0], target);
    });
}
test('selector: invalid escaped ID candidate falls back without losing the target', t => {
    const window = createDOM(t, '<div id="banner" data-target></div>');
    const target = window.document.querySelector('[data-target]');
    const selector = generator(window, { escape: () => '[' })(target);
    assert.equal(selector, 'div');
    assert.deepEqual([...window.document.querySelectorAll(selector)], [target]);
});
test('selector: five-level limit can match similar elements; no exact/similar mode exists yet', t => {
    const branch = '<section><main><article><aside><div><span class="ad"></span></div></aside></article></main></section>';
    const window = createDOM(t, branch + branch);
    const target = window.document.querySelector('span');
    const selector = generator(window)(target);
    assert.equal(selector, 'main > article > aside > div > span.ad');
    const matches = [...window.document.querySelectorAll(selector)];
    assert.equal(matches.length, 2);
    assert.ok(matches.includes(target));
});
test('selector: disconnected targets produce paths with no document match', t => {
    const window = createDOM(t);
    const target = window.document.createElement('aside'); target.className = 'ad';
    const selector = generator(window)(target);
    assert.equal(selector, 'aside.ad');
    assert.equal(window.document.querySelectorAll(selector).length, 0);
});
test('selector: document queries do not enter shadow roots', t => {
    const window = createDOM(t, '<div id="host"></div>');
    const shadow = window.document.querySelector('#host').attachShadow({ mode: 'open' });
    shadow.innerHTML = '<span class="ad"></span>';
    const target = shadow.querySelector('span');
    const selector = generator(window)(target);
    assert.equal(window.document.querySelectorAll(selector).length, 0);
    assert.deepEqual([...shadow.querySelectorAll(selector)], [target]);
});
test('selector: ignores non-elements', t => {
    const window = createDOM(t);
    const generate = generator(window);
    assert.equal(generate(null), '');
    assert.equal(generate(window.document.createTextNode('text')), '');
});
