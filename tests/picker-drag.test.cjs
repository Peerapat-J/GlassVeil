const test = require('node:test');
const assert = require('node:assert/strict');
const { createDOM } = require('./helpers/dom.cjs');
const { createPickerUI } = require('../content/picker-ui.js');
const { clampPanelPosition } = require('../content/picker-utils.js');

function setup(t) {
    const window = createDOM(t), document = window.document;
    const host = document.createElement('div'); document.body.append(host);
    const shadowRoot = host.attachShadow({ mode: 'open' });
    const noop = () => {};
    const panel = createPickerUI({ document, window, shadowRoot, clampPanelPosition,
        onCancel: noop, onSelectParent: noop, onConfirm: noop, onTogglePreview: noop,
        onRefresh: noop, onPrecisionChange: noop, onUndo: noop, iconUrl: '' });
    // jsdom supplies no layout or pointer capture; model those browser boundaries.
    panel.getBoundingClientRect = () => ({ left: 100, top: 60, width: 500, height: 300 });
    Object.defineProperties(panel, { offsetWidth: { value: 500 }, offsetHeight: { value: 300 } });
    const captured = new Set();
    panel.setPointerCapture = id => captured.add(id);
    panel.hasPointerCapture = id => captured.has(id);
    panel.releasePointerCapture = id => captured.delete(id);
    const pointer = (target, type, values = {}) => {
        const event = new window.Event(type, { bubbles: true, cancelable: true });
        Object.assign(event, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 120, clientY: 80 }, values);
        target.dispatchEvent(event);
        return event;
    };
    return { panel, get: selector => shadowRoot.querySelector(selector), pointer, captured };
}

test('picker drag: panel background, body gaps and header all move the panel and stay within the viewport', t => {
    const { panel, get, pointer, captured } = setup(t);
    for (const target of [panel, get('.selector-box'), get('#impact-summary'), get('.action-row'), get('#selection-count')]) {
        assert.equal(pointer(target, 'pointerdown').defaultPrevented, true);
        assert.equal(captured.has(1), true);
        pointer(panel, 'pointermove', { clientX: 250, clientY: 170 });
        assert.equal(panel.style.left, '230px');
        assert.equal(panel.style.top, '150px');
        pointer(panel, 'pointermove', { clientX: -100, clientY: -100 });
        assert.equal(panel.style.left, '0px');
        assert.equal(panel.style.top, '0px');
        pointer(panel, 'pointerup');
        assert.equal(panel.classList.contains('dragging'), false);
        assert.equal(captured.size, 0);
    }
});

test('picker drag: controls and scrollable match rows do not start a drag', t => {
    const { panel, get, pointer, captured } = setup(t);
    const row = panel.ownerDocument.createElement('li'); row.textContent = '#example'; get('#impact-list').append(row);
    for (const selector of ['#undo-btn', '#undo-btn svg path', '#precision-mode', '.precision-control',
        '#selector-display', '#preview-toggle span', '#cancel-btn', '#impact-refresh', '#impact-list', '#impact-list li']) {
        assert.equal(pointer(get(selector), 'pointerdown').defaultPrevented, false, selector);
        assert.equal(panel.classList.contains('dragging'), false, selector);
        assert.equal(captured.size, 0, selector);
    }
    assert.equal(pointer(panel, 'pointerdown', { button: 2 }).defaultPrevented, false);
});

test('picker drag: only the captured pointer moves or ends a drag, including cancellation and capture loss', t => {
    const { panel, pointer, captured } = setup(t);
    for (const ending of ['pointercancel', 'lostpointercapture']) {
        pointer(panel, 'pointerdown');
        pointer(panel, 'pointerdown', { pointerId: 2 });
        pointer(panel, 'pointermove', { pointerId: 2, clientX: 600 });
        pointer(panel, 'pointerup', { pointerId: 2 });
        assert.equal(panel.style.left, '100px');
        assert.equal(panel.classList.contains('dragging'), true);
        pointer(panel, ending);
        assert.equal(captured.size, 0);
        assert.equal(panel.classList.contains('dragging'), false);
        pointer(panel, 'pointermove', { clientX: 600 });
        assert.equal(panel.style.left, '100px');
    }
});
