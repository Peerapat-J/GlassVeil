const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeImpact, sameImpact } = require('../content/selector-impact.js');
const { createDOM } = require('./helpers/dom.cjs');
function setup(t) {
    const window = createDOM(t, '<div class="ad" id="first"></div><div class="ad" id="second"></div><p id="keep"></p>');
    const document = window.document;
    const analyze = (elements, generateSelector) => analyzeImpact({ elements, generateSelector, document });
    return { document, analyze, first: document.querySelector('#first'), second: document.querySelector('#second') };
}
test('impact: one match is normal; multiple matches require confirmation', t => {
    const { analyze, first, second } = setup(t);
    const one = analyze([first], () => '#first');
    assert.equal(one.total, 1); assert.equal(one.requiresConfirmation, false);
    const broad = analyze([first], () => '.ad');
    assert.equal(broad.total, 2); assert.equal(broad.requiresConfirmation, true);
    assert.deepEqual([...broad.matches], [first, second]);
});
test('impact: overlapping and duplicate selectors retain per-selection counts with a unique total', t => {
    const { analyze, first, second } = setup(t);
    const impact = analyze([first, second, first], element => element === first ? '.ad' : '#second');
    assert.deepEqual(impact.entries.map(entry => entry.matches.length), [2, 1, 2]);
    assert.equal(impact.total, 2); assert.deepEqual(impact.selectors, ['.ad', '#second']);
});
test('impact: zero matches, invalid CSS and generator failures do not block valid selections', t => {
    const { analyze, first, second } = setup(t);
    for (const invalid of ['[', '/*', '.missing', '']) {
        const impact = analyze([first, second], element => element === first ? invalid : '#second');
        assert.equal(impact.skipped, 1); assert.equal(impact.total, 1);
        assert.deepEqual(impact.selectors, ['#second']);
    }
    const thrown = analyze([first, second], element => { if (element === first) throw new Error(); return '#second'; });
    assert.equal(thrown.entries[0].status, 'invalid'); assert.equal(thrown.total, 1);
});
test('impact: wrong target, disconnected elements and page roots cannot be saved', t => {
    const { analyze, first, document } = setup(t);
    assert.equal(analyze([first], () => '#second').entries[0].status, 'target-missing');
    assert.equal(analyze([first], () => 'body').entries[0].status, 'page-root');
    assert.equal(analyze([first], () => '*').entries[0].status, 'page-root');
    first.remove(); assert.equal(analyze([first], () => '#first').total, 0);
    assert.equal(document.querySelectorAll('#first').length, 0);
});
test('impact: ten distinct exact matches also require confirmation', t => {
    const window = createDOM(t, Array.from({ length: 10 }, (_, i) => `<div id="item-${i}"></div>`).join(''));
    const document = window.document;
    const impact = analyzeImpact({ document, elements: document.querySelectorAll('div'), generateSelector: element => `#${element.id}` });
    assert.equal(impact.total, 10); assert.equal(impact.requiresConfirmation, true);
});
test('impact: unchanged counts cannot hide a replaced target from the review check', t => {
    const { analyze, first, second } = setup(t);
    const before = analyze([first], () => '.ad');
    assert.equal(sameImpact(before, analyze([first], () => '.ad')), true);
    second.replaceWith(second.cloneNode(true));
    assert.equal(sameImpact(before, analyze([first], () => '.ad')), false);
});
