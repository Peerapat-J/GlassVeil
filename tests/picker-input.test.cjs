const test = require('node:test');
const assert = require('node:assert/strict');
const { createDOM, settle } = require('./helpers/dom.cjs');
const { createPicker } = require('../content/picker.js');
const { createPickerInput } = require('../content/picker-input.js');
const { createPickerUI } = require('../content/picker-ui.js');
const { createSelectionState } = require('../content/picker-state.js');
const { analyzeImpact, sameImpact } = require('../content/selector-impact.js');
const utils = require('../content/picker-utils.js');

function setup(t, saveSelectors = async () => {}) {
    const window = createDOM(t, '<a id="ad" href="#activated">Ad</a><button id="button">Button</button><iframe id="frame"></iframe>');
    const document = window.document;
    const picker = createPicker({ window, document, createPickerInput, createPickerUI, createSelectionState,
        analyzeImpact, sameImpact, utils, generateSelector: element => `#${element.id}`, saveSelectors, iconUrl: '' });
    let hit = document.querySelector('#ad');
    const root = () => document.querySelector('#glassveil-picker-root');
    const shadow = () => root().shadowRoot;
    const shield = () => shadow().querySelector('.picker-input-shield');
    document.elementFromPoint = (x, y) => {
        assert.equal(shield().style.pointerEvents, 'none');
        assert.equal(x, 100); assert.equal(y, 120);
        return hit;
    };
    const fire = (target, type, options = {}) => {
        const event = new window.MouseEvent(type, { bubbles: true, composed: true, cancelable: true,
            clientX: 100, clientY: 120, button: 0, ...options });
        target.dispatchEvent(event);
        return event;
    };
    return { window, document, picker, root, shadow, shield, fire, hit: element => { hit = element; } };
}

test('picker input: intercepts complete activation sequences before window/document/target handlers', t => {
    const f = setup(t), seen = [];
    const ad = f.document.querySelector('#ad');
    const types = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click', 'auxclick', 'dblclick', 'contextmenu', 'dragstart'];
    // Page capture listeners are registered before starting selection mode.
    for (const type of types) for (const target of [f.window, f.document, ad]) {
        target.addEventListener(type, () => seen.push(type), true);
        target.addEventListener(type, () => seen.push(type));
    }
    f.picker.start();
    for (const type of types) assert.equal(f.fire(ad, type).defaultPrevented, true, type);
    assert.deepEqual(seen, []);
    assert.equal(f.shadow().querySelector('#selection-count').textContent, '1 selected');
    f.picker.stop();
    assert.equal(f.fire(ad, 'click').defaultPrevented, false);
    assert.equal(seen.length, 6);
    // Re-entering selection retains priority over those same page listeners.
    f.picker.start(); f.fire(ad, 'click');
    assert.equal(seen.length, 6);
});

test('picker input: shield hit-tests hover/click and selects iframe containers without entering frames', t => {
    const f = setup(t);
    f.picker.start();
    const ad = f.document.querySelector('#ad'), frame = f.document.querySelector('#frame');
    f.fire(f.shield(), 'mousemove');
    assert.ok(ad.classList.contains('glassveil-picker-hovered'));
    f.fire(f.shield(), 'click');
    assert.ok(ad.classList.contains('glassveil-picker-selected'));
    f.hit(frame); f.fire(f.shield(), 'pointermove');
    assert.ok(frame.classList.contains('glassveil-picker-hovered'));
    f.fire(f.shield(), 'click');
    assert.ok(frame.classList.contains('glassveil-picker-selected'));
    assert.equal(f.shadow().querySelector('#selection-count').textContent, '2 selected');
    assert.equal(f.shield().style.pointerEvents, 'auto');
    f.shadow().querySelector('#preview-toggle').click();
    assert.equal(ad.style.display, 'none'); assert.equal(frame.style.display, 'none');
    f.picker.stop();
    assert.equal(f.root(), null);
    assert.equal(ad.style.display, ''); assert.equal(frame.style.display, '');
});

test('picker input: no page-root selection, stale hover clears on panel entry, scrolling refreshes hover', t => {
    const f = setup(t);
    f.picker.start();
    const ad = f.document.querySelector('#ad'), button = f.document.querySelector('#button');
    f.fire(f.shield(), 'mousemove');
    f.hit(button); f.document.dispatchEvent(new f.window.Event('scroll'));
    assert.ok(!ad.classList.contains('glassveil-picker-hovered'));
    assert.ok(button.classList.contains('glassveil-picker-hovered'));
    f.fire(f.shadow().querySelector('#undo-btn'), 'mouseover');
    assert.ok(!button.classList.contains('glassveil-picker-hovered'));
    f.hit(f.document.body); f.fire(f.shield(), 'click');
    assert.equal(f.shadow().querySelector('#selection-count').textContent, '0 selected');
    assert.equal(f.fire(f.shield(), 'wheel').defaultPrevented, false);
});

test('picker input: middle/double clicks do not select; panel controls and Escape remain usable', t => {
    const f = setup(t);
    f.picker.start();
    f.fire(f.shield(), 'click', { button: 1 });
    f.fire(f.shield(), 'auxclick', { button: 1 });
    assert.equal(f.shadow().querySelector('#selection-count').textContent, '0 selected');
    f.fire(f.shield(), 'click', { detail: 1 });
    f.fire(f.shield(), 'click', { detail: 2 });
    f.fire(f.shield(), 'dblclick', { detail: 2 });
    assert.equal(f.shadow().querySelector('#selection-count').textContent, '1 selected');
    const preview = f.shadow().querySelector('#preview-toggle');
    assert.equal(f.fire(preview, 'pointerdown').defaultPrevented, false);
    preview.click();
    assert.equal(f.document.querySelector('#ad').style.display, 'none');
    const escape = new f.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    f.document.dispatchEvent(escape);
    assert.equal(escape.defaultPrevented, true); assert.equal(f.root(), null);
    assert.equal(f.document.querySelector('#ad').style.display, '');
});

test('picker input: cancelling a held press drains its release/click, then permits a fresh gesture', t => {
    const f = setup(t);
    f.picker.start(); f.fire(f.shield(), 'pointerdown'); f.picker.stop();
    const ad = f.document.querySelector('#ad');
    const fired = [];
    for (const type of ['pointerup', 'mouseup', 'click']) ad.addEventListener(type, () => fired.push(type));
    for (const type of ['pointerup', 'mouseup', 'click']) assert.equal(f.fire(ad, type).defaultPrevented, true);
    assert.deepEqual(fired, []);
    assert.equal(f.fire(ad, 'pointerdown').defaultPrevented, false);
    assert.equal(f.fire(ad, 'click').defaultPrevented, false);
    assert.deepEqual(fired, ['click']);
});

test('picker input: uses a manual top-layer popover and falls back when the API rejects', t => {
    const f = setup(t), shown = [];
    f.window.HTMLElement.prototype.showPopover = function () { shown.push(this); };
    f.picker.start();
    assert.deepEqual(shown, [f.root()]);
    assert.equal(f.root().getAttribute('popover'), 'manual');
    assert.equal(f.root().style.getPropertyPriority('pointer-events'), 'important');
    f.picker.stop();
    f.window.HTMLElement.prototype.showPopover = () => { throw new Error('Unavailable'); };
    f.picker.start();
    assert.equal(f.root().hasAttribute('popover'), false);
    f.fire(f.shield(), 'click');
    assert.equal(f.shadow().querySelector('#selection-count').textContent, '1 selected');
});

test('picker input: save keeps the shield active until persistence completes, then cleans up', async t => {
    let complete;
    const f = setup(t, () => new Promise(resolve => { complete = resolve; }));
    f.picker.start(); f.fire(f.shield(), 'click');
    f.shadow().querySelector('#confirm-btn').click();
    await settle();
    assert.ok(f.shield());
    assert.equal(f.fire(f.document.querySelector('#button'), 'mousedown').defaultPrevented, true);
    complete(); await settle();
    assert.equal(f.root(), null);
    assert.equal(f.fire(f.document.querySelector('#button'), 'mousedown').defaultPrevented, false);
});

test('picker input: modal mount stays interactive and cannot be hidden together with the picker', t => {
    const f = setup(t);
    const dialog = f.document.createElement('dialog'); dialog.id = 'modal';
    const ad = f.document.querySelector('#ad'); dialog.appendChild(ad); f.document.body.appendChild(dialog);
    const query = f.document.querySelector.bind(f.document);
    f.document.querySelector = selector => selector === 'dialog:modal' ? dialog : query(selector);
    f.picker.start();
    assert.equal(f.root().parentElement, dialog);
    f.fire(f.shield(), 'click');
    assert.equal(f.shadow().querySelector('#selection-count').textContent, '1 selected');
    f.shadow().querySelector('#parent-btn').click();
    assert.equal(f.shadow().querySelector('#confirm-btn').disabled, true);
    assert.match(f.shadow().querySelector('#impact-list').textContent, /Includes the page or picker root/);
    f.shadow().querySelector('#preview-toggle').click();
    assert.equal(dialog.style.display, '');
    f.picker.stop(); assert.equal(f.root(), null);
});

test('picker input: Escape and undo precede page keyboard handlers, including Escape during panel drag', t => {
    const f = setup(t), seen = [];
    f.window.addEventListener('keydown', event => seen.push(event.key), true);
    f.picker.start(); f.fire(f.shield(), 'click');
    f.document.dispatchEvent(new f.window.KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
    assert.equal(f.shadow().querySelector('#selection-count').textContent, '0 selected');
    f.fire(f.shadow().querySelector('#preview-toggle'), 'pointerdown');
    f.document.dispatchEvent(new f.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    assert.equal(f.root(), null); assert.deepEqual(seen, []);
    assert.equal(f.fire(f.document.querySelector('#ad'), 'mouseup').defaultPrevented, true);
    assert.equal(f.fire(f.document.querySelector('#ad'), 'click').defaultPrevented, true);
});

test('picker input: wheel scrolls nested CSS containers without running page handlers', t => {
    const f = setup(t);
    const scroller = f.document.createElement('div');
    scroller.style.overflowY = 'auto'; scroller.style.lineHeight = '20px';
    Object.defineProperties(scroller, { clientHeight: { value: 100 }, scrollHeight: { value: 300 },
        clientWidth: { value: 100 }, scrollWidth: { value: 200 } });
    const ad = f.document.querySelector('#ad'); scroller.appendChild(ad); f.document.body.appendChild(scroller);
    let seen = 0;
    f.window.addEventListener('wheel', () => seen++, true);
    f.picker.start();
    const wheel = options => {
        const event = new f.window.WheelEvent('wheel', { bubbles: true, composed: true, cancelable: true,
            clientX: 100, clientY: 120, ...options });
        f.shield().dispatchEvent(event); return event;
    };
    assert.equal(wheel({ deltaY: 2, deltaMode: 1 }).defaultPrevented, true);
    assert.equal(scroller.scrollTop, 40);
    assert.equal(seen, 0);
    scroller.scrollTop = 200;
    assert.equal(wheel({ deltaY: 10 }).defaultPrevented, false); // Chain to viewport at the end.
    scroller.style.overscrollBehaviorY = 'contain';
    assert.equal(wheel({ deltaY: 10 }).defaultPrevented, true);
    assert.equal(wheel({ deltaY: -10 }).defaultPrevented, true);
    assert.equal(scroller.scrollTop, 190);
    scroller.style.overflowX = 'auto'; scroller.style.direction = 'rtl';
    assert.equal(wheel({ deltaX: -10 }).defaultPrevented, true);
    assert.equal(scroller.scrollLeft, -10);
});
