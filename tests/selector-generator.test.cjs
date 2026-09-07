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
    const selector = generator(window, { escape: value => value === 'banner' ? '[' : window.CSS.escape(value) })(target);
    assert.equal(selector, 'div');
    assert.deepEqual([...window.document.querySelectorAll(selector)], [target]);
});
test('selector: exact distinguishes deeply repeated branches; similar deliberately matches both', t => {
    const branch = '<section><main><article><aside><div><span class="ad"></span></div></aside></article></main></section>';
    const window = createDOM(t, branch + branch);
    const target = window.document.querySelector('span'), generate = generator(window);
    assert.deepEqual([...window.document.querySelectorAll(generate(target))], [target]);
    const similar = generate(target, { mode: 'similar' });
    assert.equal(similar, 'span.ad');
    assert.equal(window.document.querySelectorAll(similar).length, 2);
});
test('selector: disconnected, shadow-root, page-root and picker targets are rejected', t => {
    const window = createDOM(t, '<div id="host"></div><div id="glassveil-picker-root"><span></span></div>');
    const shadow = window.document.querySelector('#host').attachShadow({ mode: 'open' });
    shadow.innerHTML = '<span class="ad"></span>';
    const generate = generator(window);
    for (const target of [window.document.createElement('aside'), shadow.querySelector('span'), window.document.body,
        window.document.documentElement, window.document.querySelector('#glassveil-picker-root span'), null,
        window.document.createTextNode('text')]) assert.equal(generate(target), '');
});
test('selector: candidate scores are deterministic and stable attributes beat positions', t => {
    const window = createDOM(t, '<div class="ad"></div><div class="slot ad" data-testid="sponsor"></div>');
    const target = window.document.querySelector('[data-testid]'), generate = generator(window);
    assert.equal(generate(target), 'div[data-testid=sponsor]');
    const first = generate.getCandidates(target);
    assert.ok(first.length > 1);
    target.className = 'ad slot glassveil-picker-selected';
    assert.deepEqual(generate.getCandidates(target), first);
    target.before(window.document.createElement('div'));
    assert.equal(generate(target), 'div[data-testid=sponsor]');
    assert.deepEqual([...window.document.querySelectorAll(generate(target))], [target]);
});
test('selector: stable parent disambiguates classes without positional dependence', t => {
    const window = createDOM(t, '<section id="news"><div class="ad"></div></section><section id="sports"><div class="ad"></div></section>');
    const target = window.document.querySelector('#sports .ad'), generate = generator(window);
    const selector = generate(target);
    assert.equal(selector, '#sports > div.ad');
    target.before(window.document.createElement('p'));
    assert.equal(generate(target), selector);
});
test('selector: combines stable classes when individual classes are ambiguous', t => {
    const window = createDOM(t, '<div class="ad"></div><div class="slot"></div><div class="ad slot"></div>');
    const target = window.document.querySelector('.ad.slot');
    assert.equal(generator(window)(target), 'div.ad.slot');
});
test('selector: attribute values with quotes, backslashes and Unicode round-trip', t => {
    const window = createDOM(t, '<button></button><button></button>');
    const target = window.document.querySelector('button');
    for (const value of ['Sponsor "banner"', "sponsor\\banner", '広告枠', 'line\nfeed']) {
        target.setAttribute('aria-label', value);
        const selector = generator(window)(target);
        assert.ok(selector.includes('aria-label'));
        assert.deepEqual([...window.document.querySelectorAll(selector)], [target]);
    }
});
test('selector: excludes dynamic tokens and all GlassVeil attributes/classes', t => {
    const window = createDOM(t, '<div></div><div></div>');
    const target = window.document.querySelector('div');
    for (const value of ['react-slot', 'vue-slot', 'ember-slot', 'css-abcxyz', 'sc-abcxyz', 'slot-ab12cd', 'abcdef12', 'slot12345', 'session-token', 'glassveil-custom']) {
        target.id = value; target.className = value; target.setAttribute('data-testid', value);
        target.setAttribute('data-glassveil-marker', 'stable');
        const candidates = generator(window).getCandidates(target, { mode: 'similar' });
        assert.ok(candidates.length);
        assert.ok(candidates.every(candidate => !candidate.selector.includes(value) && !candidate.selector.includes('glassveil')));
    }
});
test('selector: similar falls back to exact rather than broad unqualified tags', t => {
    const window = createDOM(t, '<div></div><div></div>');
    const target = window.document.querySelector('div'), generate = generator(window);
    const selector = generate(target, { mode: 'similar' });
    assert.deepEqual([...window.document.querySelectorAll(selector)], [target]);
});
test('selector: every allow-listed stable attribute can identify a target', t => {
    const window = createDOM(t, '<div></div><div></div>');
    const target = window.document.querySelector('div'), generate = generator(window);
    for (const name of ['data-testid', 'data-test', 'data-component', 'aria-label', 'role', 'name', 'alt']) {
        target.setAttribute(name, 'sponsor');
        assert.equal(generate(target), `div[${name}=sponsor]`);
        target.removeAttribute(name);
    }
});
