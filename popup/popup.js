document.addEventListener("DOMContentLoaded", async () => {
    const get = id => document.getElementById(id);
    const toggle = get("blocker-toggle"), domainEl = get("current-domain"), badge = get("status-badge");
    const pickBtn = get("pick-element-btn"), rulesList = get("rules-list"), emptyState = get("no-rules-message");
    const clearBtn = get("clear-all-btn"), notice = get("page-notice"), retryBtn = get("retry-action");
    const storage = globalThis.GlassVeilStorage.createStorage({ request: message => chrome.runtime.sendMessage(message), area: chrome.storage.local, changes: chrome.storage.onChanged });
    const tabAccess = globalThis.GlassVeilTabAccess.createTabAccess(chrome);
    let siteRecords = [];
    let currentTab = null, currentDomain = "", supported = false, busy = false, retryAction = null;
    let recovery = null, recoveryTimer = null;
    const clearRecovery = (message = "") => {
        window.clearTimeout(recoveryTimer); recoveryTimer = null; recovery = null;
        get("recovery-notice").hidden = !message;
        get("recovery-message").textContent = message;
        get("undo-rule-action").hidden = true;
    };
    const offerRecovery = (snapshot, label) => {
        clearRecovery();
        if (!snapshot) return;
        recovery = snapshot;
        get("recovery-notice").hidden = false;
        get("recovery-message").textContent = `${label}. Undo is available for 30 seconds while this popup stays open.`;
        get("undo-rule-action").hidden = false;
        recoveryTimer = window.setTimeout(() => clearRecovery("Undo expired."), Math.max(0, snapshot.expiresAt - Date.now()));
    };
    window.addEventListener("pagehide", () => clearRecovery());

    get("shortcut-settings-link").addEventListener("click", event => {
        event.preventDefault();
        chrome.tabs.create({ url: "chrome://extensions/shortcuts" }).catch(() => {
            showNotice("Could not open shortcut settings. Try the shortcut settings button again.");
        });
    });
    get("extension-version").textContent = `v${chrome.runtime.getManifest().version}`;
    globalThis.GlassVeilMetadata.readMetadata(chrome).then(metadata => {
        get("shortcut-hint").textContent = metadata.shortcut;
        get("shortcut-hint").title = `Picker shortcut: ${metadata.shortcut}`;
    }).catch(() => { get("shortcut-hint").textContent = "Unavailable"; });

    const updateControls = () => {
        pickBtn.disabled = toggle.disabled = clearBtn.disabled = busy || !supported;
        rulesList.querySelectorAll("button, input").forEach(button => { button.disabled = busy || !supported; });
        retryBtn.disabled = busy;
        get("undo-rule-action").disabled = busy || !supported || !recovery;
        get("rules-section").hidden = !supported;
    };
    const showNotice = (message = "", retry = null, label = "Retry") => {
        notice.hidden = !message;
        get("page-message").textContent = message;
        retryAction = retry;
        retryBtn.hidden = !retry;
        retryBtn.textContent = label;
    };
    const updateBadge = () => {
        badge.textContent = toggle.checked ? "Active" : "Disabled";
        badge.classList.toggle("disabled", !toggle.checked);
    };
    const showUnavailable = capability => {
        if (capability.status === "unsupported") {
            clearRecovery();
            currentDomain = "";
        }
        supported = false;
        toggle.checked = false;
        rulesList.replaceChildren(); get("rule-count").textContent = "0";
        clearBtn.style.display = "none";
        domainEl.textContent = capability.status === "unsupported" ? "Unsupported page" : "Unavailable";
        badge.textContent = capability.status === "unsupported" ? "Unsupported" : "Unavailable";
        badge.classList.add("disabled");
        showNotice(capability.message, capability.status === "unsupported" ? null : loadCurrentSite);
        updateControls();
    };
    const refreshDiagnostics = async () => {
        const response = await tabAccess.send(currentTab, { action: "inspectRules", rules: siteRecords });
        if (!siteRecords.length) return;
        for (const item of response.rules) {
            const row = Array.from(rulesList.children).find(row => row.dataset.ruleId === item.id);
            if (!row) continue;
            const status = row.querySelector(".rule-status");
            status.textContent = item.status === "invalid" ? "Invalid selector" : `${item.count} ${item.count === 1 ? "match" : "matches"}`;
            status.title = item.status === "invalid" ? "This rule has invalid CSS selector syntax." : `${item.count} ${item.count === 1 ? "element matches" : "elements match"} this rule on the current page.`;
            status.classList.toggle("invalid", item.status === "invalid");
        }
    };
    const renderRules = records => {
        siteRecords = records;
        rulesList.replaceChildren();
        get("rule-count").textContent = records.length;
        emptyState.style.display = records.length ? "none" : "block";
        clearBtn.style.display = records.length ? "inline-block" : "none";
        records.forEach(rule => {
            const li = document.createElement("li"); li.dataset.ruleId = rule.id;
            const text = document.createElement("span"); text.className = "rule-text"; text.textContent = text.title = rule.selector;
            const enabled = document.createElement("input"); enabled.type = "checkbox"; enabled.checked = rule.enabled;
            enabled.className = "rule-enabled"; enabled.setAttribute("aria-label", `Enable rule ${rule.selector}`);
            enabled.setAttribute("role", "switch");
            enabled.addEventListener("change", () => {
                const value = enabled.checked;
                runAction(async () => {
                    try { await storage.updateRule(currentDomain, rule.id, { enabled: value }); }
                    catch (error) { enabled.checked = rule.enabled; throw error; }
                    clearRecovery();
                    await syncSite();
                });
            });
            const ruleSwitch = document.createElement("label"); ruleSwitch.className = "switch rule-switch";
            const slider = document.createElement("span"); slider.className = "slider"; slider.setAttribute("aria-hidden", "true");
            ruleSwitch.append(enabled, slider);
            const heading = document.createElement("div"); heading.className = "rule-heading"; heading.append(ruleSwitch, text);
            const status = document.createElement("span"); status.className = "rule-status"; status.textContent = "Checking…";
            const actions = document.createElement("div"); actions.className = "rule-actions";
            actions.appendChild(status);
            const button = (label, callback, className = "btn-text") => {
                const node = document.createElement("button"); node.className = className; node.textContent = label;
                node.addEventListener("click", callback); actions.appendChild(node); return node;
            };
            button("Edit", () => {
                if (busy || li.querySelector("form")) return;
                const form = document.createElement("form"), input = document.createElement("input");
                input.className = "rule-editor"; input.value = rule.selector; input.setAttribute("aria-label", "CSS selector");
                const save = document.createElement("button"); save.textContent = "Save"; save.className = "btn-text";
                const cancel = document.createElement("button"); cancel.type = "button"; cancel.textContent = "Cancel"; cancel.className = "btn-text";
                cancel.addEventListener("click", () => form.remove()); form.append(input, save, cancel); li.appendChild(form); input.focus();
                form.addEventListener("submit", event => {
                    event.preventDefault(); const selector = input.value.trim();
                    runAction(async () => {
                        const response = await tabAccess.send(currentTab, { action: "inspectRules", rules: [{ id: rule.id, selector }] });
                        const result = response.rules[0];
                        if (result.status === "invalid") { showNotice("This selector is invalid. Correct it before saving."); return; }
                        if (result.count > 1 && !window.confirm(`This rule matches ${result.count} elements. Save this selector?`)) return;
                        await storage.updateRule(currentDomain, rule.id, { selector }); clearRecovery(); await syncSite();
                    });
                });
            });
            const deleteButton = button("Delete", () => runAction(async () => {
                const result = await storage.deleteRule(currentDomain, rule.id);
                offerRecovery(result.recovery, "Rule deleted");
                await syncSite();
            }), "btn-delete");
            deleteButton.setAttribute("aria-label", `Delete rule ${rule.selector}`);
            deleteButton.title = "Delete rule";
            deleteButton.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6"/></svg>';
            li.append(heading, actions); rulesList.appendChild(li);
        });
        updateControls();
    };
    const readSite = async () => {
        const site = await storage.readSite(currentDomain);
        toggle.checked = site.enabled; updateBadge(); renderRules(site.rules);
        const skipped = site.migration.skipped || 0;
        get("migration-message").hidden = !skipped;
        get("migration-message").textContent = `${skipped} malformed legacy ${skipped === 1 ? "entry was" : "entries were"} skipped. Original data is kept in the local backup.`;
        return site;
    };
    // Retry synchronization reads current storage; it never repeats a delete/reset.
    const syncSite = async () => {
        const site = await readSite();
        await tabAccess.send(currentTab, { action: "updateRules", rules: site.rules });
        await tabAccess.send(currentTab, { action: "toggleBlocker", enabled: site.enabled });
        await refreshDiagnostics();
    };
    const handleFailure = (error, retry) => {
        if (["unsupported", "unavailable"].includes(error.kind)) {
            showUnavailable({ status: error.kind, message: error.message });
        } else {
            badge.textContent = "Error"; badge.classList.add("disabled");
            rulesList.querySelectorAll(".rule-status").forEach(status => { if (status.textContent === "Checking…") status.textContent = "Count unavailable"; });
            showNotice(error.kind === "connection" ? error.message : (error.message || "Could not load or save site settings. Reload the controls and try again."),
                error.kind === "connection" ? () => runAction(retry, retry) : loadCurrentSite,
                error.kind === "connection" ? "Retry" : "Reload controls");
        }
    };
    const runAction = async (action, retry = syncSite) => {
        if (!supported || busy) return;
        busy = true; showNotice(); updateControls();
        try {
            await tabAccess.verify(currentTab);
            await action();
            updateBadge();
        } catch (error) { handleFailure(error, retry); }
        finally { busy = false; updateControls(); }
    };
    const startPicker = async () => {
        await tabAccess.send(currentTab, { action: "startPicker" });
        window.close();
    };
    const loadCurrentSite = async () => {
        if (busy) return;
        busy = true; supported = false; showNotice(); updateControls();
        badge.textContent = "Loading"; domainEl.textContent = "Loading…";
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const capability = globalThis.GlassVeilTabAccess.classifyTab(tab);
            if (capability.status !== "supported") { showUnavailable(capability); return; }
            if (currentDomain !== capability.hostname) clearRecovery();
            currentTab = tab; currentDomain = capability.hostname;
            await tabAccess.verify(currentTab);
            domainEl.textContent = currentDomain;
            await readSite(); supported = true;
            try { await refreshDiagnostics(); } catch (error) { handleFailure(error, syncSite); }
        } catch (error) {
            if (error.kind) handleFailure(error, loadCurrentSite);
            else showUnavailable({ status: "unavailable", message: error.message || "Could not load this tab or its site settings. Try again." });
        } finally { busy = false; updateControls(); }
    };

    retryBtn.addEventListener("click", () => { if (!busy) retryAction?.(); });
    pickBtn.addEventListener("click", () => runAction(startPicker, startPicker));
    toggle.addEventListener("change", () => {
        const enabled = toggle.checked;
        runAction(async () => { await storage.setEnabled(currentDomain, enabled); clearRecovery(); await syncSite(); });
    });
    clearBtn.addEventListener("click", () => {
        runAction(async () => {
            const result = await storage.resetSite(currentDomain);
            offerRecovery(result.recovery, "Site rules reset");
            await syncSite();
        });
    });
    get("undo-rule-action").addEventListener("click", () => runAction(async () => {
        const snapshot = recovery;
        if (!snapshot || Date.now() >= snapshot.expiresAt) { clearRecovery("Undo expired."); return; }
        try { await storage.restoreRules(currentDomain, snapshot); }
        catch (error) {
            if (error.code === "RECOVERY_UNAVAILABLE") clearRecovery();
            throw error;
        }
        clearRecovery("Rules restored.");
        await syncSite();
    }));
    await loadCurrentSite();
});
