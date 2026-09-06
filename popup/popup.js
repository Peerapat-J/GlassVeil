document.addEventListener("DOMContentLoaded", async () => {
    const get = id => document.getElementById(id);
    const toggle = get("blocker-toggle"), domainEl = get("current-domain"), badge = get("status-badge");
    const pickBtn = get("pick-element-btn"), rulesList = get("rules-list"), emptyState = get("no-rules-message");
    const clearBtn = get("clear-all-btn"), notice = get("page-notice"), retryBtn = get("retry-action");
    const storage = globalThis.GlassVeilStorage.createStorage({ request: message => chrome.runtime.sendMessage(message), area: chrome.storage.local, changes: chrome.storage.onChanged });
    const tabAccess = globalThis.GlassVeilTabAccess.createTabAccess(chrome);
    let siteRecords = [];
    let currentTab = null, currentDomain = "", supported = false, busy = false, retryAction = null;

    get("shortcut-settings-link").addEventListener("click", event => {
        event.preventDefault();
        chrome.tabs.create({ url: "chrome://extensions/shortcuts" }).catch(() => {
            showNotice("Could not open shortcut settings. Try the Edit Shortcut link again.");
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
        supported = false;
        currentDomain = "";
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
            enabled.addEventListener("change", () => {
                const value = enabled.checked;
                runAction(async () => {
                    try { await storage.updateRule(currentDomain, rule.id, { enabled: value }); }
                    catch (error) { enabled.checked = rule.enabled; throw error; }
                    await syncSite();
                });
            });
            const heading = document.createElement("div"); heading.className = "rule-heading"; heading.append(enabled, text);
            const status = document.createElement("span"); status.className = "rule-status"; status.textContent = "Checking…";
            const scope = document.createElement("span"); scope.className = "rule-scope"; scope.textContent = rule.enabled ? "This website" : "This website · Disabled";
            const actions = document.createElement("div"); actions.className = "rule-actions";
            const button = (label, callback, className = "btn-text") => {
                const node = document.createElement("button"); node.className = className; node.textContent = label;
                node.addEventListener("click", callback); actions.appendChild(node); return node;
            };
            button("Test", () => runAction(async () => {
                const result = await tabAccess.send(currentTab, { action: "testRule", selector: rule.selector });
                if (result.status === "invalid") { showNotice("This selector is invalid. Edit it before testing."); return; }
                if (!result.count) { showNotice("This selector matches no elements on the current page."); return; }
                window.close();
            }));
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
                        await storage.updateRule(currentDomain, rule.id, { selector }); await syncSite();
                    });
                });
            });
            button("Delete", () => runAction(async () => { await storage.deleteRule(currentDomain, rule.id); await syncSite(); }), "btn-delete");
            li.append(heading, status, scope, actions); rulesList.appendChild(li);
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
        runAction(async () => { await storage.setEnabled(currentDomain, enabled); await syncSite(); });
    });
    clearBtn.addEventListener("click", () => {
        if (!supported || busy || !window.confirm(`Are you sure you want to reset all rules for ${currentDomain}?`)) return;
        runAction(async () => { await storage.resetSite(currentDomain); await syncSite(); });
    });
    await loadCurrentSite();
});
