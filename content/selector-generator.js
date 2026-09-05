// Classic-script module: definitions only; content.js owns initialization.
(function (root) {
    "use strict";

    // Conservative heuristics, not a guarantee that a website will keep a token.
    const isStableToken = value => Boolean(value) && value.length <= 80 &&
        !/glassveil|(?:^|[-_])(?:tmp|temp|session)(?:$|[-_\d])/i.test(value) &&
        !/^(?:react-|vue-|ember|css-|sc-)/i.test(value) &&
        !/\d{4,}|[a-f0-9]{8,}/i.test(value) &&
        !/(?:^|[-_])(?=[a-z0-9]*\d)(?=[a-z0-9]*[a-z])[a-z0-9]{6,}(?:$|[-_])/i.test(value);
    const attributes = ["data-testid", "data-test", "data-component", "aria-label", "role", "name", "alt"];

    const createSelectorGenerator = ({ document, Node, CSS, isPickerStateClass }) => {
        const describe = element => {
            const tag = CSS.escape(element.localName);
            const parts = [{ selector: tag, cost: 80, semantic: false }];
            if (isStableToken(element.id)) parts.push({ selector: `#${CSS.escape(element.id)}`, cost: 0, semantic: true });
            attributes.forEach((name, index) => {
                const value = element.getAttribute(name);
                if (isStableToken(value)) parts.push({ selector: `${tag}[${name}=${CSS.escape(value)}]`, cost: 20 + index, semantic: true });
            });
            const classes = Array.from(element.classList).filter(value =>
                !isPickerStateClass(value) && isStableToken(value) && value.length <= 25 &&
                !value.includes("_") && !(/-/.test(value) && /\d/.test(value))
            ).sort().slice(0, 8);
            classes.forEach(value => parts.push({ selector: `${tag}.${CSS.escape(value)}`, cost: 40, semantic: true }));
            // Bounded combinations avoid exponential work on utility-class-heavy pages.
            for (let i = 0; i < classes.length; i++) {
                for (let j = i + 1; j < classes.length; j++) {
                    parts.push({ selector: `${tag}.${CSS.escape(classes[i])}.${CSS.escape(classes[j])}`, cost: 42, semantic: true });
                }
            }
            if (classes.length > 2) parts.push({ selector: tag + classes.map(value => `.${CSS.escape(value)}`).join(""), cost: 48, semantic: true });
            return parts;
        };

        const getCandidates = (element, { mode = "exact" } = {}) => {
            if (!element || element.nodeType !== Node.ELEMENT_NODE || element.getRootNode() !== document ||
                element === document.body || element === document.documentElement || element.closest("#glassveil-picker-root")) return [];
            const candidates = new Map();
            const add = (selector, cost, semantic = false, positional = false) => {
                try {
                    const matches = Array.from(document.querySelectorAll(selector));
                    if (!matches.includes(element) || matches.includes(document.body) || matches.includes(document.documentElement) ||
                        matches.some(match => match.id === "glassveil-picker-root")) return;
                    const sheet = new document.defaultView.CSSStyleSheet();
                    sheet.insertRule(`${selector} { display: none !important; }`, 0);
                    const score = cost + selector.length / 1000;
                    if (!candidates.has(selector) || candidates.get(selector).score > score) {
                        candidates.set(selector, { selector, count: matches.length, score, semantic, positional });
                    }
                } catch { /* Invalid candidates are isolated; other candidates remain available. */ }
            };
            const local = describe(element);
            const childParts = [...local].sort((a, b) => a.cost - b.cost || (a.selector < b.selector ? -1 : 1)).slice(0, 8);
            local.forEach(part => add(part.selector, part.cost, part.semantic));

            // Combine local descriptions with nearby stable ancestors. No positional
            // steps here: semantic anchors should survive unrelated sibling insertions.
            let parent = element.parentElement;
            for (let depth = 1; parent && parent !== document.body && depth <= 6; depth++, parent = parent.parentElement) {
                const anchors = describe(parent).filter(part => part.semantic)
                    .sort((a, b) => a.cost - b.cost || (a.selector < b.selector ? -1 : 1)).slice(0, 3);
                for (const anchor of anchors) {
                    for (const child of childParts) {
                        add(`${anchor.selector}${depth === 1 ? " > " : " "}${child.selector}`,
                            anchor.cost + child.cost + depth * 30, anchor.semantic || child.semantic);
                    }
                }
            }

            // Exact fallback has no five-level truncation: extend a typed position
            // path until it identifies the target, even in deeply repeated markup.
            const path = [];
            let current = element;
            while (current && current !== document.documentElement) {
                const tag = CSS.escape(current.localName);
                const siblings = Array.from(current.parentElement?.children || []).filter(sibling => sibling.localName === current.localName);
                path.unshift(`${tag}:nth-of-type(${siblings.indexOf(current) + 1})`);
                const selector = path.join(" > ");
                add(selector, 1000 + path.length * 30, false, true);
                if (candidates.get(selector)?.count === 1) break;
                current = current.parentElement;
            }
            const eligible = Array.from(candidates.values()).filter(candidate => candidate.count === 1 ||
                (mode === "similar" && candidate.semantic && !candidate.positional));
            return eligible.sort((a, b) => {
                // Only an explicit Similar choice prefers a reusable multi-match rule.
                if (mode === "similar") {
                    const difference = Number(b.count > 1) - Number(a.count > 1);
                    if (difference) return difference;
                }
                return a.score - b.score || (a.selector < b.selector ? -1 : a.selector > b.selector ? 1 : 0);
            });
        };
        const generateSelector = (element, options) => getCandidates(element, options)[0]?.selector || "";
        generateSelector.getCandidates = getCandidates;
        return generateSelector;
    };

    const api = Object.freeze({ createSelectorGenerator, isStableToken });
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else root.GlassVeilSelectorGenerator = root.GlassVeilSelectorGenerator || api;
})(globalThis);
