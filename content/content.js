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
    const ruleEngine = globalThis.GlassVeilRuleEngine.createRuleEngine({ document, MutationObserver,
        replaceUserCSS: async ({ css, previousCSS }) => {
            const result = await chrome.runtime.sendMessage({ type: "glassveil-user-css", css, previousCSS });
            if (!result?.ok) throw new Error(result?.error || "Could not apply blocking styles");
        }
    });
    const diagnostics = globalThis.GlassVeilRuleDiagnostics.createDiagnostics({ document, window, ruleEngine });
    let activeRules = [];
    let isBlockerEnabled = true;
    const applyCurrentRules = async () => {
        ruleEngine.apply(activeRules, isBlockerEnabled);
        await ruleEngine.flush();
    };
    const picker = globalThis.GlassVeilPicker.createPicker({
        document, window, generateSelector,
        utils: globalThis.GlassVeilPickerUtils,
        createSelectionState: globalThis.GlassVeilPickerState.createSelectionState,
        createPickerUI: globalThis.GlassVeilPickerUI.createPickerUI,
        createPickerInput: globalThis.GlassVeilPickerInput.createPickerInput,
        analyzeImpact: globalThis.GlassVeilSelectorImpact.analyzeImpact,
        sameImpact: globalThis.GlassVeilSelectorImpact.sameImpact,
        iconUrl: chrome.runtime.getURL("icons/icon-32.png"),
        loadPreviewPreference: async () => (await chrome.storage.local.get("pickerPreviewEnabled")).pickerPreviewEnabled === true,
        savePreviewPreference: enabled => chrome.storage.local.set({ pickerPreviewEnabled: enabled }),
        saveSelectors: async selectors => {
            activeRules = (await storage.appendSelectors(currentDomain, selectors, window.location.href)).rules;
            try { await applyCurrentRules(); }
            catch (error) {
                // Persistence already committed; retries must only apply the saved state.
                throw Object.assign(new Error(error.message), { rulesSaved: true });
            }
        },
        applySavedRules: applyCurrentRules
    });

    const applyRulesFromStorage = async () => {
        const site = await storage.readSite(currentDomain);
        activeRules = site.rules;
        isBlockerEnabled = site.enabled;
        await applyCurrentRules();
    };
    const reloadRules = () => applyRulesFromStorage().catch(error => {
        console.error("[GlassVeil] Failed to load or apply stored rules:", error);
    });

    window.glassVeilInjected = true;
    storage.subscribe(reloadRules);
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        const respondAsync = operation => operation.then(sendResponse,
            error => sendResponse({ status: "error", error: error.message || "Could not apply blocking styles" }));
        if (message.action === "startPicker") {
            respondAsync(diagnostics.stop().then(() => {
                picker.start();
                return { status: "picker_started" };
            }));
        } else if (message.action === "inspectRules") {
            respondAsync(diagnostics.stop().then(() => ({ rules: diagnostics.describe(message.rules) })));
        } else if (message.action === "testRule") {
            picker.stop();
            respondAsync(diagnostics.test(message.selector));
        } else if (message.action === "stopRuleTest") {
            respondAsync(diagnostics.stop().then(() => ({ status: "stopped" })));
        } else if (message.action === "toggleBlocker" || message.action === "updateRules") {
            if (message.action === "toggleBlocker") isBlockerEnabled = message.enabled;
            else activeRules = message.rules;
            respondAsync(applyCurrentRules().then(() => ({
                status: message.action === "toggleBlocker" ? "blocker_toggled" : "rules_updated"
            })));
        }
        return true;
    });
    reloadRules();
})();
