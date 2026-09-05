const test = require('node:test');
const assert = require('node:assert/strict');
const { createDOM, settle } = require('./helpers/dom.cjs');
const { createPicker } = require('../content/picker.js');
const utils = require('../content/picker-utils.js');
const { createSelectionState } = require('../content/picker-state.js');
const { createPickerUI } = require('../content/picker-ui.js');
const { analyzeImpact, sameImpact } = require('../content/selector-impact.js');
function setup(t, generateSelector = () => '.ad', save = async () => {}) {
    const window = createDOM(t, '<div class="ad" id="first"></div><div class="ad" id="second" style="display: block !important"></div><p id="keep"></p>');
    const document = window.document, saved = [];
    let confirmations = 0;
    window.confirm = () => { confirmations++; return true; };
    const picker = createPicker({ window, document, generateSelector, utils, createSelectionState, createPickerUI, analyzeImpact, sameImpact,
        iconUrl: 'data:image/png;base64,', saveSelectors: async selectors => { await save(); saved.push(selectors); } });
    picker.start();
    const shadow = () => document.querySelector('#glassveil-picker-root')?.shadowRoot;
    const click = id => shadow().querySelector(`#${id}`).click();
    const first = document.querySelector('#first'), second = document.querySelector('#second');
    return { window, document, first, second, picker, shadow, click, saved, confirmations: () => confirmations };
}
test('impact picker: previews every match, restores display priority, and clears extra outlines on deselection', t => {
    const { first, second, shadow, click, picker } = setup(t);
    first.click();
    assert.match(shadow().querySelector('#impact-summary').textContent, /hide 2 elements/);
    assert.equal(shadow().querySelectorAll('.impact-outline').length, 1);
    click('preview-toggle'); assert.equal(second.style.display, 'none');
    click('preview-toggle'); assert.equal(second.style.display, 'block'); assert.equal(second.style.getPropertyPriority('display'), 'important');
    first.click(); assert.equal(shadow().querySelectorAll('.impact-outline').length, 0);
    first.click(); click('preview-toggle'); picker.stop();
    assert.equal(first.style.display, ''); assert.equal(second.style.display, 'block');
    assert.equal(second.style.getPropertyPriority('display'), 'important');
});
test('impact picker: declining broad confirmation leaves selections intact and saves nothing', async t => {
    const fixture = setup(t); fixture.first.click(); fixture.window.confirm = () => false;
    fixture.click('confirm-btn'); await settle();
    assert.equal(fixture.saved.length, 0); assert.ok(fixture.shadow());
    fixture.window.confirm = () => true; fixture.click('confirm-btn'); await settle();
    assert.deepEqual(fixture.saved, [['.ad']]); assert.equal(fixture.shadow(), undefined);
});
test('impact picker: page changes before save require a fresh review, including same-count replacements', async t => {
    const fixture = setup(t); fixture.first.click();
    fixture.second.replaceWith(fixture.second.cloneNode(true));
    fixture.click('confirm-btn'); await settle();
    assert.equal(fixture.saved.length, 0); assert.equal(fixture.confirmations(), 0);
    assert.match(fixture.shadow().querySelector('#impact-notice').textContent, /page changed/);
    fixture.click('confirm-btn'); await settle(); assert.equal(fixture.saved.length, 1);
});
test('impact picker: changes during broad confirmation invalidate approval', async t => {
    const fixture = setup(t); fixture.first.click();
    fixture.window.confirm = () => { fixture.second.remove(); return true; };
    fixture.click('confirm-btn'); await settle(); assert.equal(fixture.saved.length, 0);
    assert.match(fixture.shadow().querySelector('#impact-notice').textContent, /page changed/);
});
test('impact picker: refresh cleans stale outlines and invalid selectors do not stop valid ones', async t => {
    let selector = '.ad';
    const fixture = setup(t, element => element.id === 'second' ? '#second' : selector);
    fixture.first.click(); selector = '['; fixture.click('impact-refresh');
    assert.equal(fixture.shadow().querySelectorAll('.impact-outline').length, 0);
    assert.equal(fixture.shadow().querySelector('#confirm-btn').disabled, true);
    fixture.second.click();
    assert.match(fixture.shadow().querySelector('#impact-summary').textContent, /1 selection cannot be saved/);
    fixture.click('confirm-btn'); await settle(); assert.deepEqual(fixture.saved, [['#second']]);
});
test('impact picker: save failures keep the panel available for retry', async t => {
    let fail = true;
    const fixture = setup(t, () => '#first', async () => { if (fail) throw new Error('storage unavailable'); });
    fixture.first.click(); fixture.click('confirm-btn'); await settle();
    assert.match(fixture.shadow().querySelector('#impact-notice').textContent, /Could not save/);
    fail = false; fixture.click('confirm-btn'); await settle(); assert.equal(fixture.saved.length, 1);
});
test('precision picker: switching modes updates all matches, preview styles and confirmation', async t => {
    const { createSelectorGenerator } = require('../content/selector-generator.js');
    let generate;
    const fixture = setup(t, (element, options) => {
        generate ||= createSelectorGenerator({ document: element.ownerDocument, Node: element.ownerDocument.defaultView.Node,
            CSS: element.ownerDocument.defaultView.CSS, isPickerStateClass: utils.isPickerStateClass });
        return generate(element, options);
    });
    const mode = () => fixture.shadow().querySelector('#precision-mode');
    const changeMode = value => { mode().value = value; mode().dispatchEvent(new fixture.window.Event('change')); };
    fixture.first.click();
    assert.equal(mode().value, 'exact');
    assert.match(fixture.shadow().querySelector('#impact-summary').textContent, /hide 1 element/);
    fixture.click('preview-toggle');
    assert.equal(fixture.first.style.display, 'none');
    assert.equal(fixture.second.style.display, 'block');
    changeMode('similar');
    assert.match(fixture.shadow().querySelector('#impact-summary').textContent, /hide 2 elements/);
    assert.equal(fixture.second.style.display, 'none');
    assert.equal(fixture.shadow().querySelectorAll('.impact-outline').length, 1);
    changeMode('exact');
    assert.equal(fixture.second.style.display, 'block');
    assert.equal(fixture.shadow().querySelectorAll('.impact-outline').length, 0);
    changeMode('similar');
    fixture.click('confirm-btn'); await settle();
    assert.deepEqual(fixture.saved, [['div.ad']]);
    assert.equal(fixture.confirmations(), 1);
    fixture.picker.start(); assert.equal(mode().value, 'exact');
});
test('precision picker: parent selection and multi-select use the current mode', t => {
    const calls = [];
    const fixture = setup(t, (element, options) => { calls.push([element, options.mode]); return `#${element.id}`; });
    const parent = fixture.document.createElement('section'); parent.id = 'parent';
    fixture.first.replaceWith(parent); parent.append(fixture.first);
    fixture.first.click(); fixture.second.click();
    const mode = fixture.shadow().querySelector('#precision-mode'); mode.value = 'similar';
    mode.dispatchEvent(new fixture.window.Event('change'));
    assert.deepEqual(calls.slice(-2), [[fixture.first, 'similar'], [fixture.second, 'similar']]);
    fixture.second.click(); fixture.click('parent-btn');
    assert.deepEqual(calls.at(-1), [parent, 'similar']);
    assert.equal(fixture.shadow().querySelectorAll('.selected-outline').length, 1);
});
