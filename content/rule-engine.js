// Classic-script module: definitions only; each engine owns its style element.
(function (root) {
    "use strict";

    const createRuleEngine = ({ document, MutationObserver }) => {
        const style = document.createElement("style");
        style.id = "glassveil-injected-style";
        let observer = null;

        // document_start can run before the document element exists.
        if (document.documentElement) {
            document.documentElement.appendChild(style);
        } else {
            observer = new MutationObserver(() => {
                if (document.documentElement) {
                    document.documentElement.appendChild(style);
                    observer.disconnect();
                    observer = null;
                }
            });
            observer.observe(document, { childList: true, subtree: true });
        }

        const apply = (selectors, enabled) => {
            const appliedSelectors = [];
            const invalidSelectors = [];
            if (!enabled || !Array.isArray(selectors)) {
                style.textContent = "";
                return { appliedSelectors, invalidSelectors };
            }

            const sheet = new document.defaultView.CSSStyleSheet();
            const seen = new Set();
            for (const selector of selectors) {
                if (typeof selector !== "string" || !selector.trim() || seen.has(selector)) continue;
                seen.add(selector);
                try {
                    // Validate selector grammar even when nothing currently matches.
                    // CSSOM parsing also prevents malformed CSS from consuming later rules.
                    document.querySelector(selector);
                    sheet.insertRule(`${selector} { display: none !important; }`, sheet.cssRules.length);
                    appliedSelectors.push(selector);
                } catch {
                    invalidSelectors.push(selector);
                }
            }

            style.textContent = Array.from(sheet.cssRules, rule => rule.cssText).join("\n");
            return { appliedSelectors, invalidSelectors };
        };

        const destroy = () => {
            observer?.disconnect();
            observer = null;
            style.remove();
        };

        return Object.freeze({ apply, destroy });
    };

    const api = Object.freeze({ createRuleEngine });
    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    } else {
        root.GlassVeilRuleEngine = root.GlassVeilRuleEngine || api;
    }
})(globalThis);
