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
test('picker history: selection and deselection restore order and active element', () => {
    const a = {}, b = {}, state = createSelectionState();
    assert.equal(state.canUndo, false); assert.equal(state.undo(), false);
    state.add(a); state.add(b); state.delete(a);
    state.undo(); assert.deepEqual([...state], [a, b]); assert.equal(state.active, b);
    state.undo(); assert.deepEqual([...state], [a]); assert.equal(state.active, a);
    state.undo(); assert.equal(state.size, 0); assert.equal(state.active, null);
    assert.equal(state.canUndo, false);
});
test('picker history: parent replacement is one action, including an already selected parent', () => {
    const child = {}, parent = {}, other = {}, state = createSelectionState();
    state.add(parent); state.add(other); state.add(child);
    state.replaceWithParent(parent);
    assert.deepEqual([...state], [parent, other]); assert.equal(state.active, parent);
    state.undo(); assert.deepEqual([...state], [parent, other, child]); assert.equal(state.active, child);
    state.undo(); assert.deepEqual([...state], [parent, other]); assert.equal(state.active, other);
});
test('picker history: disconnected actions are skipped and cannot resurrect detached elements', () => {
    const a = { connected: true }, b = { connected: true }, state = createSelectionState({ isAvailable: el => el.connected });
    state.add(a); state.add(b); state.delete(a);
    a.connected = false;
    assert.equal(state.canUndo, true); // Removing a is now a no-op; next undo reverses selecting b.
    a.connected = true;
    state.undo(); assert.deepEqual([...state], []);
    assert.equal(state.canUndo, false);
});
test('picker history: pruning disconnected current targets is not a user action', () => {
    const a = { connected: true }, b = { connected: true }, state = createSelectionState({ isAvailable: el => el.connected });
    state.add(a); state.add(b); b.connected = false; state.prune();
    assert.equal(state.active, a);
    state.undo(); assert.equal(state.size, 0); assert.equal(state.canUndo, false);
});
test('picker history: disconnected child is not restored after undoing parent replacement', () => {
    const child = { connected: true }, parent = { connected: true }, state = createSelectionState({ isAvailable: el => el.connected });
    state.add(child); state.replaceWithParent(parent); child.connected = false;
    state.undo(); assert.equal(state.size, 0); assert.equal(state.canUndo, false);
});
test('picker history: no-op operations and session reset do not leave extra undo steps', () => {
    const a = {}, state = createSelectionState();
    state.add(a); state.add(a); state.delete({}); state.replaceWithParent(a);
    state.undo(); assert.equal(state.canUndo, false);
    state.add(a); state.clear(); assert.equal(state.undo(), false);
});
