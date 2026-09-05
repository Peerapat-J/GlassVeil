// Classic-script module: definitions only; content.js owns initialization.
(function (root) {
    "use strict";

    const createSelectorGenerator = ({ document, Node, CSS, isPickerStateClass }) => {
        const generateSelector = (el) => {
            if (!el || el.nodeType !== Node.ELEMENT_NODE) return "";

            const path = [];
            let current = el;
            let depth = 0;

            while (current && current.nodeType === Node.ELEMENT_NODE && depth < 5) {
                let tagName = current.nodeName.toLowerCase();

                // Stop walking up if we hit body or html
                if (tagName === "body" || tagName === "html") {
                    if (path.length === 0) path.unshift(tagName);
                    break;
                }

                // Check for clean ID
                if (current.id) {
                    const cleanId = current.id.trim();
                    // Skip IDs that look dynamic: e.g. containing numbers >= 4 digits, random hashes
                    const isDynamic = /\d{4,}/.test(cleanId) || /^[a-f0-9]{8,}$/i.test(cleanId) || cleanId.startsWith("react-") || cleanId.startsWith("vue-") || cleanId.startsWith("ember") || cleanId.includes("_tmp");

                    if (!isDynamic) {
                        try {
                            const escapedId = CSS.escape(cleanId);
                            // Verify if ID is unique in document
                            if (document.querySelectorAll(`#${escapedId}`).length === 1) {
                                path.unshift(`#${escapedId}`);
                                break; // Unique ID is an absolute selector, stop climbing
                            }
                        } catch (err) {
                            console.warn("Invalid ID character found while escaping:", cleanId);
                        }
                    }
                }

                // Get clean classes
                let classSelector = "";
                const rawClasses = [];

                if (current.classList && current.classList.length > 0) {
                    for (let i = 0; i < current.classList.length; i++) {
                        const cls = current.classList[i];

                        if (
                            isPickerStateClass(cls) ||
                            /\d{4,}/.test(cls) ||
                            cls.length > 25 ||
                            cls.includes("_") ||
                            cls.includes("-") && /\d/.test(cls)
                        ) {
                            continue;
                        }

                        rawClasses.push(cls);
                    }

                    if (rawClasses.length > 0) {
                        classSelector = "." + rawClasses.map(cls => CSS.escape(cls)).join(".");
                    }
                }

                const segment = tagName + classSelector;

                // Check if tag + classes uniquely identifies element among siblings
                const siblings = current.parentElement ? Array.from(current.parentElement.children) : [];
                const matchingSiblings = siblings.filter(sib => {
                    let sibTagName = sib.nodeName.toLowerCase();
                    if (sibTagName !== tagName) return false;

                    if (classSelector) {
                        return rawClasses.every(cls => sib.classList.contains(cls));
                    }
                    return true;
                });

                if (matchingSiblings.length > 1 && current.parentElement) {
                    // Not unique among siblings, add nth-of-type
                    const index = siblings.indexOf(current) + 1;
                    path.unshift(`${segment}:nth-child(${index})`);
                } else {
                    path.unshift(segment);
                }

                current = current.parentElement;
                depth++;
            }

            return path.join(" > ");
        };

        return generateSelector;
    };

    const api = Object.freeze({ createSelectorGenerator });
    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    } else {
        root.GlassVeilSelectorGenerator = root.GlassVeilSelectorGenerator || api;
    }
})(globalThis);
