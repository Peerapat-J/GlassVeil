const test = require('node:test');
const assert = require('node:assert/strict');
const { createDOM, settle } = require('./helpers/dom.cjs');
const { createPicker } = require('../content/picker.js');
const utils = require('../content/picker-utils.js');
const { createSelectionState } = require('../content/picker-state.js');
const { createPickerUI } = require('../content/picker-ui.js');
const { createPickerInput } = require('../content/picker-input.js');
const { analyzeImpact, sameImpact } = require('../content/selector-impact.js');
function setup(t, generateSelector = () => '.ad', save = async () => {}, preferences = {}) {
    const window = createDOM(t, '<div class="ad" id="first"></div><div class="ad" id="second" style="display: block !important"></div><p id="keep"></p>');
    const document = window.document, saved = [];
    let confirmations = 0;
    window.confirm = () => { confirmations++; return true; };
    const picker = createPicker({ window, document, generateSelector, utils, createSelectionState, createPickerUI, createPickerInput, analyzeImpact, sameImpact,
        iconUrl: 'data:image/png;base64,', ...preferences, saveSelectors: async selectors => { await save(); saved.push(selectors); } });
    picker.start();
    const shadow = () => document.querySelector('#glassveil-picker-root')?.shadowRoot;
    const click = id => shadow().querySelector(`#${id}`).click();
    const first = document.querySelector('#first'), second = document.querySelector('#second');
    return { window, document, first, second, picker, shadow, click, saved, confirmations: () => confirmations };
}
test('picker: inline resets cannot suppress frames, but Preview Hide hides and restores them', t => {
    const { window, first, shadow, click, picker } = setup(t, () => '#first');
    first.style.cssText = 'display:block!important;outline:none!important;box-shadow:none!important';
    first.getBoundingClientRect = () => first.style.display === 'none'
        ? { left: 0, top: 0, right: 0, bottom: 0 }
        : { left: 50, top: 100, right: 250, bottom: 180 };
    first.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }));
    const hover = shadow().querySelector('.hover-outline');
    assert.equal(hover.style.display, 'block'); assert.equal(hover.style.width, '200px');
    first.click(); click('preview-toggle');
    const selected = shadow().querySelector('.selected-outline:not(.hover-outline)');
    assert.equal(first.style.display, 'none');
    assert.equal(selected.style.display, 'none');
    assert.equal(shadow().querySelector('.hover-outline'), null);
    click('preview-toggle');
    assert.equal(selected.style.display, 'block'); assert.equal(selected.style.top, '100px');
    assert.equal(selected.style.height, '80px');
    click('preview-toggle'); assert.equal(selected.style.display, 'none');
    picker.stop(); assert.equal(first.style.display, 'block');
    assert.equal(first.style.getPropertyPriority('display'), 'important');
});
test('picker: preview frames stay hidden on scroll and resize, then use current geometry when restored', async t => {
    const { window, document, first, shadow, click } = setup(t, () => '#first');
    const scroller = document.createElement('section'); document.body.appendChild(scroller); scroller.appendChild(first);
    let top = 100;
    first.getBoundingClientRect = () => first.style.display === 'none' ? { left: 0, top: 0, right: 0, bottom: 0 }
        : { left: 50, top, right: 250, bottom: top + 80 };
    first.click(); click('preview-toggle');
    const box = shadow().querySelector('.selected-outline');
    const writes = [];
    const observer = new window.MutationObserver(records => writes.push(...records)); observer.observe(first, { attributes: true, attributeFilter: ['style'] });
    scroller.scrollTop = 30; scroller.dispatchEvent(new window.Event('scroll'));
    await new Promise(resolve => window.requestAnimationFrame(resolve));
    assert.equal(box.style.display, 'none'); assert.equal(writes.length, 0);
    top = 130; window.dispatchEvent(new window.Event('resize'));
    await new Promise(resolve => window.requestAnimationFrame(resolve));
    assert.equal(box.style.display, 'none'); assert.equal(first.style.display, 'none');
    assert.equal(writes.length, 0);
    click('preview-toggle');
    assert.equal(box.style.display, 'block'); assert.equal(box.style.top, '130px');
    observer.disconnect();
});
test('impact picker: previews every match, restores display priority, and clears extra outlines on deselection', t => {
    const { first, second, shadow, click, picker } = setup(t);
    for (const element of [first, second]) element.getBoundingClientRect = () => ({ left: 50, top: 100, right: 250, bottom: 180 });
    first.click();
    assert.match(shadow().querySelector('#impact-summary').textContent, /hide 2 elements/);
    assert.equal(shadow().querySelectorAll('.impact-outline').length, 1);
    shadow().querySelectorAll('.selected-outline').forEach(box => assert.equal(box.style.display, 'block'));
    click('preview-toggle'); assert.equal(second.style.display, 'none');
    shadow().querySelectorAll('.selected-outline').forEach(box => assert.equal(box.style.display, 'none'));
    click('preview-toggle'); assert.equal(second.style.display, 'block'); assert.equal(second.style.getPropertyPriority('display'), 'important');
    shadow().querySelectorAll('.selected-outline').forEach(box => assert.equal(box.style.display, 'block'));
    first.click(); assert.equal(shadow().querySelectorAll('.impact-outline').length, 0);
    first.click(); click('preview-toggle'); picker.stop();
    assert.equal(first.style.display, ''); assert.equal(second.style.display, 'block');
    assert.equal(second.style.getPropertyPriority('display'), 'important');
});
test('impact picker: preview can be armed before selection and stays available after undo clears the list', t => {
    const { first, second, shadow, click, picker } = setup(t, element => `#${element.id}`);
    const toggle = () => shadow().querySelector('#preview-toggle');
    assert.notEqual(toggle().style.display, 'none');
    assert.equal(toggle().disabled, false);
    click('preview-toggle');
    assert.equal(toggle().getAttribute('aria-checked'), 'true');
    assert.equal(first.style.display, '');
    first.click();
    assert.equal(first.style.display, 'none');
    assert.equal(second.style.display, 'block');
    click('undo-btn');
    assert.equal(first.style.display, '');
    assert.notEqual(toggle().style.display, 'none');
    assert.equal(toggle().getAttribute('aria-checked'), 'true');
    second.click();
    assert.equal(second.style.display, 'none');
    click('preview-toggle');
    assert.equal(second.style.display, 'block');
    assert.equal(second.style.getPropertyPriority('display'), 'important');
    assert.equal(toggle().getAttribute('aria-checked'), 'false');
    click('preview-toggle'); picker.stop();
    assert.equal(second.style.display, 'block');
    picker.start();
    assert.equal(toggle().getAttribute('aria-checked'), 'true');
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
test('picker undo: similar matches, deduplicated counts and preview clean up through repeated undo', t => {
    const fixture = setup(t); fixture.first.click(); fixture.second.click(); fixture.click('preview-toggle');
    fixture.first.click(); fixture.click('undo-btn');
    assert.equal(fixture.shadow().querySelector('#selection-count').textContent, '2 selected');
    assert.match(fixture.shadow().querySelector('#impact-summary').textContent, /hide 2 elements/);
    assert.equal(fixture.shadow().querySelectorAll('.impact-outline').length, 0);
    fixture.click('undo-btn');
    assert.equal(fixture.shadow().querySelectorAll('.impact-outline').length, 1);
    assert.equal(fixture.second.style.display, 'none');
    fixture.click('undo-btn');
    assert.equal(fixture.shadow().querySelectorAll('.selected-outline').length, 0);
    assert.equal(fixture.second.style.display, 'block');
    assert.equal(fixture.second.style.getPropertyPriority('display'), 'important');
});
test('picker undo: disabled during save, available after failure', async t => {
    let rejectSave;
    const fixture = setup(t, () => '#first', () => new Promise((resolve, reject) => { rejectSave = reject; }));
    fixture.first.click(); fixture.click('confirm-btn');
    assert.equal(fixture.shadow().querySelector('#undo-btn').disabled, true);
    assert.equal(fixture.shadow().querySelector('#impact-refresh').disabled, true);
    assert.equal(fixture.shadow().querySelector('#preview-toggle').disabled, true);
    fixture.document.body.dispatchEvent(new fixture.window.KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
    assert.equal(fixture.shadow().querySelector('#selection-count').textContent, '1 selected');
    rejectSave(new Error('storage failed')); await settle();
    assert.equal(fixture.shadow().querySelector('#undo-btn').disabled, false);
    assert.equal(fixture.shadow().querySelector('#impact-refresh').disabled, false);
    assert.equal(fixture.shadow().querySelector('#preview-toggle').disabled, false);
    fixture.click('undo-btn'); assert.equal(fixture.shadow().querySelector('#selection-count').textContent, '0 selected');
});
test('impact picker: new selections scroll to the bottom while refresh preserves the reading position', t => {
    const fixture = setup(t, element => `#${element.id}`);
    const list = fixture.shadow().querySelector('#impact-list');
    // jsdom has no layout; provide a changing list height to exercise scroll intent.
    Object.defineProperty(list, 'scrollHeight', { get: () => list.children.length * 30 });
    fixture.first.click();
    assert.equal(list.scrollTop, 30);
    list.scrollTop = 5;
    fixture.click('impact-refresh');
    assert.equal(list.scrollTop, 5);
    fixture.second.click();
    assert.equal(list.scrollTop, 60);
    list.scrollTop = 10;
    fixture.second.click();
    assert.equal(list.scrollTop, 10);
    fixture.first.click();
    assert.equal(fixture.shadow().querySelector('#impact-refresh').disabled, true);
    fixture.first.click();
    assert.equal(list.scrollTop, 30);
});

test('impact picker: remove a middle selection directly and undo restores its original position', t => {
    const fixture = setup(t, element => `#${element.id}`);
    const third = fixture.document.querySelector('#keep');
    fixture.first.click(); fixture.second.click(); third.click();
    fixture.click('preview-toggle');
    fixture.shadow().querySelectorAll('.remove-selection')[1].click();
    const selectors = () => Array.from(fixture.shadow().querySelectorAll('#impact-list code'), code => code.textContent);
    assert.deepEqual(selectors(), ['1. #first', '2. #keep']);
    assert.equal(fixture.second.style.display, 'block');
    fixture.click('undo-btn');
    assert.deepEqual(selectors(), ['1. #first', '2. #second', '3. #keep']);
    assert.equal(fixture.second.style.display, 'none');
});

test('impact picker: selector text selection does not capture or cancel the pointer', t => {
    const fixture = setup(t); fixture.first.click();
    const code = fixture.shadow().querySelector('#impact-list code');
    const event = new fixture.window.Event('pointerdown', { bubbles: true, cancelable: true });
    Object.assign(event, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 180 });
    code.setPointerCapture = () => assert.fail('Text selection must not capture the pointer');
    code.dispatchEvent(event);
    assert.equal(event.defaultPrevented, false);
    assert.equal(fixture.shadow().querySelector('.picker-panel').classList.contains('dragging'), false);
});

test('impact picker: preview preference survives a fresh picker and stores both on and off', async t => {
    let stored = true;
    const preferences = { loadPreviewPreference: async () => stored, savePreviewPreference: async value => { stored = value; } };
    const first = setup(t, element => `#${element.id}`, undefined, preferences);
    await settle();
    assert.equal(first.shadow().querySelector('#preview-toggle').getAttribute('aria-checked'), 'true');
    first.first.click(); assert.equal(first.first.style.display, 'none');
    first.click('preview-toggle'); await settle(); assert.equal(stored, false);
    first.picker.stop();
    const second = setup(t, undefined, undefined, preferences); await settle();
    assert.equal(second.shadow().querySelector('#preview-toggle').getAttribute('aria-checked'), 'false');
    second.click('preview-toggle'); await settle(); assert.equal(stored, true);
});

test('impact picker: stale preference reads cannot override a newer user choice or another session', async t => {
    const reads = [];
    const fixture = setup(t, undefined, undefined, { loadPreviewPreference: () => new Promise(resolve => reads.push(resolve)) });
    await settle(); fixture.click('preview-toggle'); reads[0](false); await settle();
    assert.equal(fixture.shadow().querySelector('#preview-toggle').getAttribute('aria-checked'), 'true');
    fixture.picker.stop(); fixture.picker.start(); await settle();
    fixture.picker.stop(); fixture.picker.start(); await settle();
    reads[2](true); await settle(); reads[1](false); await settle();
    assert.equal(fixture.shadow().querySelector('#preview-toggle').getAttribute('aria-checked'), 'true');
});

test('impact picker: preference writes stay ordered and failures are visible without stopping preview', async t => {
    const writes = []; let finish, fail = false;
    const fixture = setup(t, undefined, undefined, { savePreviewPreference: value => {
        writes.push(value);
        if (fail) return Promise.reject(new Error('storage unavailable'));
        return new Promise(resolve => { finish = resolve; });
    } });
    fixture.click('preview-toggle'); await settle();
    fixture.click('preview-toggle'); await settle(); assert.deepEqual(writes, [true]);
    finish(); await settle(); assert.deepEqual(writes, [true, false]);
    finish(); await settle(); fail = true;
    fixture.click('preview-toggle'); await settle();
    assert.equal(fixture.shadow().querySelector('#preview-toggle').getAttribute('aria-checked'), 'true');
    assert.equal(fixture.shadow().querySelector('#preview-preference-notice').hidden, false);
    assert.match(fixture.shadow().querySelector('#preview-preference-notice').textContent, /Could not save/);
});

for (const succeeds of [false, true]) test(`impact picker: preference loaded during save is deferred (success=${succeeds})`, async t => {
    let resolvePreference, finishSave;
    const fixture = setup(t, element => `#${element.id}`, () => new Promise((resolve, reject) => {
        finishSave = () => succeeds ? resolve() : reject(new Error('write failed'));
    }), { loadPreviewPreference: () => new Promise(resolve => { resolvePreference = resolve; }) });
    await settle();
    fixture.first.click(); fixture.click('confirm-btn');
    resolvePreference(true); await settle();
    assert.equal(fixture.shadow().querySelector('#preview-toggle').getAttribute('aria-checked'), 'false');
    assert.notEqual(fixture.first.style.display, 'none');
    finishSave(); await settle();
    if (succeeds) {
        assert.equal(fixture.shadow(), undefined);
        assert.notEqual(fixture.first.style.display, 'none');
    } else {
        assert.equal(fixture.shadow().querySelector('#preview-toggle').getAttribute('aria-checked'), 'true');
        assert.equal(fixture.first.style.display, 'none');
        assert.equal(fixture.shadow().querySelector('#confirm-btn').textContent, 'Retry save');
        assert.match(fixture.shadow().querySelector('#impact-notice').textContent, /Could not save/);
    }
});
