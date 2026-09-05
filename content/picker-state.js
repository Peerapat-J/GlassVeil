(function (root) {
    "use strict";

    const createSelectionState = () => {
        const elements = new Set();
        let active = null;
        return Object.freeze({
            get active() { return active; },
            get size() { return elements.size; },
            has: element => elements.has(element),
            add(element) {
                elements.add(element);
                active = element;
            },
            delete(element) {
                elements.delete(element);
                if (active === element) active = Array.from(elements).at(-1) || null;
            },
            clear() {
                elements.clear();
                active = null;
            },
            forEach: callback => elements.forEach(callback),
            [Symbol.iterator]: () => elements.values()
        });
    };

    const api = Object.freeze({ createSelectionState });
    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    } else {
        root.GlassVeilPickerState = root.GlassVeilPickerState || api;
    }
})(globalThis);
