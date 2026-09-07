// Shared popup/service-worker boundary; never loaded into a webpage.
(function (root) {
    "use strict";
    const classifyURL = value => {
        if (typeof value !== "string" || !value.trim()) return { status: "unavailable", message: "GlassVeil cannot access this page. Open a normal website or try again." };
        let url;
        try { url = new URL(value); }
        catch { return { status: "unavailable", message: "The current page address could not be read. Try again." }; }
        if (!["http:", "https:"].includes(url.protocol)) {
            return { status: "unsupported", message: "GlassVeil cannot run on this page. Open a normal HTTP or HTTPS website." };
        }
        if (!/^https?:\/\//i.test(value) || !url.hostname) {
            return { status: "unavailable", message: "The current page address could not be read. Try again." };
        }
        if (url.hostname === "chromewebstore.google.com" ||
            (url.hostname === "chrome.google.com" && /^\/webstore(?:\/|$)/.test(url.pathname))) {
            return { status: "unsupported", message: "GlassVeil cannot run on the Chrome Web Store. Open another website." };
        }
        return { status: "supported", hostname: url.hostname, url: url.href };
    };
    const classifyTab = tab => {
        if (!Number.isInteger(tab?.id) || tab.id < 0) return { status: "unavailable", message: "The current tab is unavailable. Try again." };
        return classifyURL(tab.pendingUrl || tab.url);
    };
    const failure = capability => Object.assign(new Error(capability.message), { kind: capability.status });
    const createTabAccess = chrome => {
        const verify = async tab => {
            const initial = classifyTab(tab);
            if (initial.status !== "supported") throw failure(initial);
            let current;
            try { current = await chrome.tabs.get(tab.id); }
            catch { throw failure({ status: "unavailable", message: "The current tab is unavailable. Reopen the popup or try again." }); }
            const capability = classifyTab(current);
            if (capability.status !== "supported") throw failure(capability);
            if (capability.url !== initial.url || current.pendingUrl) {
                throw failure({ status: "unavailable", message: "The page changed. Reload the site controls before continuing." });
            }
            return current;
        };
        const send = async (tab, message) => {
            await verify(tab);
            try { return await chrome.tabs.sendMessage(tab.id, message); }
            catch {
                // A tab can survive an extension reload without its content script.
                await verify(tab);
                try {
                    const definition = chrome.runtime.getManifest().content_scripts.find(script => script.js?.includes("content/content.js"));
                    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: definition.js });
                    await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: definition.css });
                    await verify(tab);
                    return await chrome.tabs.sendMessage(tab.id, message);
                } catch (error) {
                    if (error.kind) throw error;
                    throw failure({ status: "connection", message: "Could not connect to this page. Refresh the page, then retry. The browser may restrict access to this website." });
                }
            }
        };
        return Object.freeze({ verify, send });
    };
    const api = Object.freeze({ classifyURL, classifyTab, createTabAccess });
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else root.GlassVeilTabAccess = api;
})(globalThis);
