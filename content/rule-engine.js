// Classic-script module: definitions only; each engine owns its style element.
(function (root) {
    "use strict";

    const createRuleEngine = ({ document, MutationObserver, replaceUserCSS = async () => {} }) => {
        const style = document.createElement("style");
        style.id = "glassveil-injected-style";
        let observer = null;
        let userCSS = "", pending = Promise.resolve();
        const syncUserCSS = css => {
            pending = pending.catch(() => {}).then(async () => {
                if (css === userCSS) return;
                await replaceUserCSS({ css, previousCSS: userCSS });
                userCSS = css;
            });
            // Callers that save rules use flush() to surface failures in the UI.
            pending.catch(error => console.error("[GlassVeil] Could not apply user CSS:", error));
        };

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

        let latest = [], siteEnabled = true, suspended = false;
        const apply = (selectors, enabled) => {
            latest = selectors; siteEnabled = enabled;
            const appliedSelectors = [];
            const invalidSelectors = [];
            if (suspended || !enabled || !Array.isArray(selectors)) {
                style.textContent = "";
                syncUserCSS("");
                return { appliedSelectors, invalidSelectors };
            }

            const sheet = new document.defaultView.CSSStyleSheet();
            const seen = new Set();
            for (const record of selectors) {
                const selector = typeof record === "string" ? record : record?.enabled === true ? record.selector : null;
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
            syncUserCSS(style.textContent);
            return { appliedSelectors, invalidSelectors };
        };

        const destroy = () => {
            observer?.disconnect();
            observer = null;
            style.remove();
            syncUserCSS("");
        };

        return Object.freeze({ apply, destroy, flush: () => pending,
            suspend() { suspended = true; apply(latest, siteEnabled); }, resume() { suspended = false; apply(latest, siteEnabled); } });
    };

    const api = Object.freeze({ createRuleEngine });
    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    } else {
        root.GlassVeilRuleEngine = root.GlassVeilRuleEngine || api;
    }
})(globalThis);
