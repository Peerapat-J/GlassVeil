// background/service-worker.js

// Register context menu on installation
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "glassveil-block-element",
        title: "Block element on this page",
        contexts: ["page", "image", "video", "link"]
    });
});

// Shared helper: activate picker on a given tab
async function activatePickerOnTab(tab) {
    if (!tab || !tab.id) return;

    // Check if the URL is a supported scheme (we can't inject scripts on chrome://, edge://, etc.)
    if (!tab.url || (!tab.url.startsWith("http://") && !tab.url.startsWith("https://"))) {
        console.warn("GlassVeil cannot run on internal/restricted pages:", tab.url);
        return;
    }

    try {
        // Send a message to start the picker
        await chrome.tabs.sendMessage(tab.id, { action: "startPicker" });
    } catch (err) {
        console.log("Content script not detected. Attempting dynamic injection...");
        try {
            // Dynamically inject content scripts if not already present
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ["content/content.js"]
            });

            await chrome.scripting.insertCSS({
                target: { tabId: tab.id },
                files: ["content/content.css"]
            });

            // Retry sending the message
            await chrome.tabs.sendMessage(tab.id, { action: "startPicker" });
        } catch (injectErr) {
            console.error("Failed to dynamically inject GlassVeil script:", injectErr);
        }
    }
}

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === "glassveil-block-element") {
        await activatePickerOnTab(tab);
    }
});

// Handle keyboard shortcut (Cmd+B on Mac, Ctrl+B on Windows/Linux)
chrome.commands.onCommand.addListener(async (command) => {
    if (command === "toggle-picker") {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        await activatePickerOnTab(tab);
    }
});
