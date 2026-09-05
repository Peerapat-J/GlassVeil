document.addEventListener("DOMContentLoaded", async () => {
    const get = id => document.getElementById(id);
    const toggle = get("blocker-toggle"), domainEl = get("current-domain"), badge = get("status-badge");
    const pickBtn = get("pick-element-btn"), rulesList = get("rules-list"), emptyState = get("no-rules-message");
    const clearBtn = get("clear-all-btn"), notice = get("page-notice"), retryBtn = get("retry-action");
    const storage = globalThis.GlassVeilStorage.createStorage({ area: chrome.storage.local, changes: chrome.storage.onChanged });
    const tabAccess = globalThis.GlassVeilTabAccess.createTabAccess(chrome);
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
        rulesList.querySelectorAll("button").forEach(button => { button.disabled = busy || !supported; });
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
    const renderRules = selectors => {
        rulesList.replaceChildren();
        get("rule-count").textContent = selectors.length;
        emptyState.style.display = selectors.length ? "none" : "block";
        clearBtn.style.display = selectors.length ? "inline-block" : "none";
        selectors.forEach((selector, index) => {
            const li = document.createElement("li"), text = document.createElement("span"), button = document.createElement("button");
            text.className = "rule-text"; text.textContent = text.title = selector;
            button.className = "btn-delete"; button.title = "Delete rule";
            button.setAttribute("aria-label", `Delete rule ${selector}`);
            button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
            button.addEventListener("click", () => runAction(async () => {
                await storage.deleteRule(currentDomain, index);
                await syncSite();
            }));
            li.append(text, button); rulesList.appendChild(li);
        });
        updateControls();
    };
    const readSite = async () => {
        const site = await storage.readSite(currentDomain);
        toggle.checked = site.enabled; updateBadge(); renderRules(site.selectors);
        return site;
    };
    // Retry synchronization reads current storage; it never repeats a delete/reset.
    const syncSite = async () => {
        const site = await readSite();
        await tabAccess.send(currentTab, { action: "updateRules", rules: site.selectors });
        await tabAccess.send(currentTab, { action: "toggleBlocker", enabled: site.enabled });
    };
    const handleFailure = (error, retry) => {
        if (["unsupported", "unavailable"].includes(error.kind)) {
            showUnavailable({ status: error.kind, message: error.message });
        } else {
            badge.textContent = "Error"; badge.classList.add("disabled");
            showNotice(error.kind === "connection" ? error.message : "Could not load or save site settings. Reload the controls and try again.",
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
        } catch (error) {
            if (error.kind) handleFailure(error, loadCurrentSite);
            else showUnavailable({ status: "unavailable", message: "Could not load this tab or its site settings. Try again." });
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
