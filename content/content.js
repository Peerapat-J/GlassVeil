// The single runtime entry point. Manifest ordering supplies definition-only modules.
(function () {
    "use strict";
    if (window.glassVeilInjected) return;

    const currentDomain = window.location.hostname;
    const storage = globalThis.GlassVeilStorage.createStorage({
        request: message => chrome.runtime.sendMessage(message), area: chrome.storage.local,
        changes: chrome.storage.onChanged
    });
    const generateSelector = globalThis.GlassVeilSelectorGenerator.createSelectorGenerator({
        document, Node, CSS,
        isPickerStateClass: globalThis.GlassVeilPickerUtils.isPickerStateClass
    });
    const ruleEngine = globalThis.GlassVeilRuleEngine.createRuleEngine({ document, MutationObserver });
    const diagnostics = globalThis.GlassVeilRuleDiagnostics.createDiagnostics({ document, window, ruleEngine });
    let activeRules = [];
    let isBlockerEnabled = true;
    const picker = globalThis.GlassVeilPicker.createPicker({
        document, window, generateSelector,
        utils: globalThis.GlassVeilPickerUtils,
        createSelectionState: globalThis.GlassVeilPickerState.createSelectionState,
        createPickerUI: globalThis.GlassVeilPickerUI.createPickerUI,
        analyzeImpact: globalThis.GlassVeilSelectorImpact.analyzeImpact,
        sameImpact: globalThis.GlassVeilSelectorImpact.sameImpact,
        iconUrl: chrome.runtime.getURL("icons/icon-32.png"),
        loadPreviewPreference: async () => (await chrome.storage.local.get("pickerPreviewEnabled")).pickerPreviewEnabled === true,
        savePreviewPreference: enabled => chrome.storage.local.set({ pickerPreviewEnabled: enabled }),
        saveSelectors: async selectors => {
            activeRules = (await storage.appendSelectors(currentDomain, selectors, window.location.href)).rules;
            ruleEngine.apply(activeRules, isBlockerEnabled);
        }
    });

    const applyRulesFromStorage = async () => {
        try {
            const site = await storage.readSite(currentDomain);
            activeRules = site.rules;
            isBlockerEnabled = site.enabled;
            ruleEngine.apply(activeRules, isBlockerEnabled);
        } catch (err) {
            console.error("[GlassVeil] Failed to load rules from storage:", err);
        }
    };

    window.glassVeilInjected = true;
    storage.subscribe(applyRulesFromStorage);
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === "startPicker") {
            diagnostics.stop();
            picker.start();
            sendResponse({ status: "picker_started" });
        } else if (message.action === "inspectRules") {
            diagnostics.stop();
            sendResponse({ rules: diagnostics.describe(message.rules) });
        } else if (message.action === "testRule") {
            picker.stop();
            sendResponse(diagnostics.test(message.selector));
        } else if (message.action === "stopRuleTest") {
            diagnostics.stop(); sendResponse({ status: "stopped" });
        } else if (message.action === "toggleBlocker") {
            isBlockerEnabled = message.enabled;
            ruleEngine.apply(activeRules, isBlockerEnabled);
            sendResponse({ status: "blocker_toggled" });
        } else if (message.action === "updateRules") {
            activeRules = message.rules;
            ruleEngine.apply(activeRules, isBlockerEnabled);
            sendResponse({ status: "rules_updated" });
        }
        return true;
    });
    applyRulesFromStorage();
})();
