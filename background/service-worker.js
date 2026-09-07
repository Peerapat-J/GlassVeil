importScripts("../shared/tab-access.js", "../shared/storage.js");
const ruleStorage = globalThis.GlassVeilStorage.createStorage({ area: chrome.storage.local, changes: chrome.storage.onChanged });
chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.type !== "glassveil-storage") return;
    if (sender.id !== chrome.runtime.id || !globalThis.GlassVeilStorage.methods.includes(message.method) || !Array.isArray(message.args)) {
        respond({ ok: false, error: "Invalid storage request" }); return;
    }
    ruleStorage[message.method](...message.args).then(value => respond({ ok: true, value }), error => respond({ ok: false, error: error.message, code: error.code }));
    return true;
});
const tabAccess = globalThis.GlassVeilTabAccess.createTabAccess(chrome);

const rebuildContextMenu = () => new Promise((resolve, reject) => {
    chrome.contextMenus.removeAll(() => {
        const removalError = chrome.runtime.lastError;
        if (removalError) { reject(new Error(removalError.message)); return; }
        chrome.contextMenus.create({
            id: "glassveil-block-element",
            title: "Block element on this page",
            contexts: ["page", "image", "video", "link"],
            documentUrlPatterns: ["http://*/*", "https://*/*"]
        }, () => {
            const creationError = chrome.runtime.lastError;
            if (creationError) reject(new Error(creationError.message));
            else resolve();
        });
    });
});
let menuSetup = Promise.resolve();
const initializeContextMenu = () => {
    menuSetup = menuSetup.then(rebuildContextMenu).catch(error => {
        console.warn("GlassVeil could not initialize its context menu:", error.message);
    });
    return menuSetup;
};
chrome.runtime.onInstalled.addListener(initializeContextMenu);
chrome.runtime.onStartup.addListener(initializeContextMenu);

async function activatePickerOnTab(tab) {
    const capability = globalThis.GlassVeilTabAccess.classifyTab(tab);
    if (capability.status !== "supported") return capability;
    try {
        await tabAccess.send(tab, { action: "startPicker" });
        return { status: "started" };
    } catch (error) {
        console.warn("GlassVeil picker unavailable:", error.message);
        return { status: error.kind || "connection", message: error.message };
    }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === "glassveil-block-element") await activatePickerOnTab(tab);
});

chrome.commands.onCommand.addListener(async command => {
    if (command !== "toggle-picker") return;
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        await activatePickerOnTab(tab);
    } catch (error) { console.warn("GlassVeil could not read the active tab:", error.message); }
});
