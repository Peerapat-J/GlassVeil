// The single runtime entry point. Manifest ordering supplies definition-only modules.
(function () {
    "use strict";
    if (window.glassVeilInjected) return;

    const currentDomain = window.location.hostname;
    const storage = globalThis.GlassVeilStorage.createStorage({
        area: chrome.storage.local,
        changes: chrome.storage.onChanged
    });
    const generateSelector = globalThis.GlassVeilSelectorGenerator.createSelectorGenerator({
        document, Node, CSS,
        isPickerStateClass: globalThis.GlassVeilPickerUtils.isPickerStateClass
    });
    const ruleEngine = globalThis.GlassVeilRuleEngine.createRuleEngine({ document, MutationObserver });
    let activeSelectors = [];
    let isBlockerEnabled = true;
    const picker = globalThis.GlassVeilPicker.createPicker({
        document, window, generateSelector,
        utils: globalThis.GlassVeilPickerUtils,
        createSelectionState: globalThis.GlassVeilPickerState.createSelectionState,
        createPickerUI: globalThis.GlassVeilPickerUI.createPickerUI,
        saveSelectors: async selectors => {
            activeSelectors = await storage.appendSelectors(currentDomain, selectors);
            ruleEngine.apply(activeSelectors, isBlockerEnabled);
        }
    });

    const applyRulesFromStorage = async () => {
        try {
            const site = await storage.readSite(currentDomain);
            activeSelectors = site.selectors;
            isBlockerEnabled = site.enabled;
            ruleEngine.apply(activeSelectors, isBlockerEnabled);
        } catch (err) {
            console.error("[GlassVeil] Failed to load rules from storage:", err);
        }
    };

    window.glassVeilInjected = true;
    storage.subscribe(applyRulesFromStorage);
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === "startPicker") {
            picker.start();
            sendResponse({ status: "picker_started" });
        } else if (message.action === "toggleBlocker") {
            isBlockerEnabled = message.enabled;
            ruleEngine.apply(activeSelectors, isBlockerEnabled);
            sendResponse({ status: "blocker_toggled" });
        } else if (message.action === "updateRules") {
            activeSelectors = message.rules;
            ruleEngine.apply(activeSelectors, isBlockerEnabled);
            sendResponse({ status: "rules_updated" });
        }
        return true;
    });
    applyRulesFromStorage();
})();
