(function (root) {
    "use strict";

    const analyzeImpact = ({ elements, generateSelector, document, pickerRoot }) => {
        const matches = new Set();
        const selectors = new Set();
        const entries = Array.from(elements, element => {
            let selector = "";
            try {
                selector = generateSelector(element);
                if (typeof selector !== "string" || !selector.trim()) throw new Error("No selector");
                const sheet = new document.defaultView.CSSStyleSheet();
                sheet.insertRule(`${selector} { display: none !important; }`, 0);
                const found = Array.from(document.querySelectorAll(selector));
                if (found.includes(document.documentElement) || found.includes(document.body) || found.includes(pickerRoot)) {
                    return { selector, matches: [], status: "page-root" };
                }
                if (!found.length) return { selector, matches: [], status: "zero" };
                if (!found.includes(element)) return { selector, matches: [], status: "target-missing" };
                found.forEach(match => matches.add(match));
                selectors.add(selector);
                return { selector, matches: found, status: "valid" };
            } catch {
                return { selector, matches: [], status: "invalid" };
            }
        });
        return {
            entries,
            matches,
            selectors: Array.from(selectors),
            total: matches.size,
            skipped: entries.filter(entry => entry.status !== "valid").length,
            requiresConfirmation: matches.size >= 10 || entries.some(entry => entry.matches.length > 1)
        };
    };

    // Compare identities too: a DOM replacement can keep the same match count.
    const sameImpact = (left, right) => left.entries.length === right.entries.length &&
        left.entries.every((entry, index) => {
            const other = right.entries[index];
            return entry.selector === other.selector && entry.status === other.status &&
                entry.matches.length === other.matches.length && entry.matches.every((element, i) => element === other.matches[i]);
        });

    const api = Object.freeze({ analyzeImpact, sameImpact });
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else root.GlassVeilSelectorImpact = root.GlassVeilSelectorImpact || api;
})(globalThis);
