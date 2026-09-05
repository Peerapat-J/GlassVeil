const test = require('node:test');
const assert = require('node:assert/strict');
const { createSelectionState } = require('../content/picker-state.js');
test('picker state: selection order, active fallback and reset are local to each instance', () => {
    const first = {}, second = {}, parent = {};
    const state = createSelectionState(), other = createSelectionState();
    state.add(first); state.add(second); state.add(second);
    assert.equal(state.size, 2); assert.equal(state.active, second);
    state.delete(second); assert.equal(state.active, first);
    state.delete(first); state.add(parent);
    assert.deepEqual([...state], [parent]); assert.equal(state.active, parent);
    assert.equal(other.size, 0); assert.equal(other.active, null);
    state.clear(); assert.equal(state.size, 0); assert.equal(state.active, null);
});
