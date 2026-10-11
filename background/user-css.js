// User-origin important rules outrank a page's inline important display styles.
(function (root) {
    "use strict";
    const replaceUserCSS = async (chrome, message, sender) => {
        if (sender.id !== chrome.runtime.id || !Number.isInteger(sender.tab?.id) || sender.tab.id < 0 || sender.frameId !== 0 ||
            !/^https?:\/\//.test(sender.url || "") || typeof message.css !== "string" || typeof message.previousCSS !== "string") {
            throw new Error("Invalid style request");
        }
        const target = { tabId: sender.tab.id,
            ...(sender.documentId ? { documentIds: [sender.documentId] } : { frameIds: [sender.frameId] }) };
        const injection = css => ({ target, css, origin: "USER" });
        if (message.css === message.previousCSS) return;
        if (message.css) await chrome.scripting.insertCSS(injection(message.css));
        try {
            if (message.previousCSS) await chrome.scripting.removeCSS(injection(message.previousCSS));
        } catch (error) {
            // Keep the previous known sheet on failure, and make retry safe.
            if (message.css) await chrome.scripting.removeCSS(injection(message.css));
            throw error;
        }
    };
    const api = Object.freeze({ replaceUserCSS });
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else root.GlassVeilUserCSS = api;
})(globalThis);
