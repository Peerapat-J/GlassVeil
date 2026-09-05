(function (root) {
    "use strict";

    const createSelectionState = ({ isAvailable = () => true } = {}) => {
        const elements = new Set();
        const history = [];
        let active = null;
        const snapshot = () => ({ elements: Array.from(elements), active });
        const availableSnapshot = previous => {
            const remaining = previous.elements.filter(isAvailable);
            return { elements: remaining, active: remaining.includes(previous.active) ? previous.active : remaining.at(-1) || null };
        };
        const restore = previous => {
            elements.clear();
            previous.elements.forEach(element => elements.add(element));
            active = previous.active;
        };
        const same = (left, right) => left.active === right.active && left.elements.length === right.elements.length &&
            left.elements.every((element, index) => element === right.elements[index]);
        const prune = () => restore(availableSnapshot(snapshot()));
        const record = (type, action) => {
            const before = availableSnapshot(snapshot());
            action();
            if (!same(before, availableSnapshot(snapshot()))) history.push({ type, before });
        };
        const nextUndo = () => {
            const current = availableSnapshot(snapshot());
            // Release unavailable references, including in older actions. Detached
            // elements must not reappear if a page later reinserts them.
            history.forEach(entry => { entry.before = availableSnapshot(entry.before); });
            while (history.length && same(history.at(-1).before, current)) history.pop();
            return history.at(-1);
        };
        return Object.freeze({
            get active() { return active; },
            get size() { return elements.size; },
            get canUndo() { return Boolean(nextUndo()); },
            has: element => elements.has(element),
            add(element) {
                if (!isAvailable(element)) return;
                record("select", () => { elements.add(element); active = element; });
            },
            delete(element) {
                record("deselect", () => {
                    elements.delete(element);
                    if (active === element) active = Array.from(elements).at(-1) || null;
                });
            },
            replaceWithParent(parent) {
                if (!active || !isAvailable(active) || !isAvailable(parent) || parent === active) return;
                record("parent", () => { elements.delete(active); elements.add(parent); active = parent; });
            },
            undo() {
                const entry = nextUndo();
                if (!entry) { prune(); return false; }
                history.pop();
                restore(entry.before);
                return true;
            },
            prune,
            clear() {
                elements.clear();
                history.length = 0;
                active = null;
            },
            forEach: callback => elements.forEach(callback),
            [Symbol.iterator]: () => elements.values()
        });
    };

    const api = Object.freeze({ createSelectionState });
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else root.GlassVeilPickerState = root.GlassVeilPickerState || api;
})(globalThis);
