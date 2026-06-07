// popup/popup.js

document.addEventListener("DOMContentLoaded", async () => {
    const toggle = document.getElementById("blocker-toggle");
    const domainEl = document.getElementById("current-domain");
    const statusBadge = document.getElementById("status-badge");
    const pickBtn = document.getElementById("pick-element-btn");
    const rulesList = document.getElementById("rules-list");
    const emptyState = document.getElementById("no-rules-message");
    const ruleCountEl = document.getElementById("rule-count");
    const clearBtn = document.getElementById("clear-all-btn");
    const shortcutLink = document.getElementById("shortcut-settings-link");

    // Open the Chrome shortcut settings page
    shortcutLink.addEventListener("click", (e) => {
        e.preventDefault();
        chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
    });

    let currentTab = null;
    let currentDomain = "";

    // 1. Get the current active tab and domain
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.url) {
            currentTab = tab;
            const url = new URL(tab.url);
            currentDomain = url.hostname;
            domainEl.textContent = currentDomain;
        } else {
            domainEl.textContent = "Unavailable";
            pickBtn.disabled = true;
            toggle.disabled = true;
            return;
        }
    } catch (err) {
        console.error("Failed to get current tab details:", err);
        domainEl.textContent = "Error";
        pickBtn.disabled = true;
        return;
    }

    // 2. Load stored extension state
    const loadState = async () => {
        const { disabledSites = {}, rules = {} } = await chrome.storage.local.get(["disabledSites", "rules"]);
    
        // Check if blocking is active for this domain
        const isEnabled = !disabledSites[currentDomain];
        toggle.checked = isEnabled;
        updateStatusBadge(isEnabled);

        // Load blocked elements list
        const siteRules = rules[currentDomain] || [];
        renderRules(siteRules);
    };

    const updateStatusBadge = (isEnabled) => {
        if (isEnabled) {
            statusBadge.textContent = "Active";
            statusBadge.classList.remove("disabled");
        } else {
            statusBadge.textContent = "Disabled";
            statusBadge.classList.add("disabled");
        }
    };

    const renderRules = (siteRules) => {
        rulesList.innerHTML = "";
        ruleCountEl.textContent = siteRules.length;

        if (siteRules.length === 0) {
            emptyState.style.display = "block";
            clearBtn.style.display = "none";
            return;
        }

        emptyState.style.display = "none";
        clearBtn.style.display = "inline-block";

        siteRules.forEach((selector, index) => {
            const li = document.createElement("li");
      
            const textSpan = document.createElement("span");
            textSpan.className = "rule-text";
            textSpan.textContent = selector;
            textSpan.title = selector; // Tooltip for long selectors
      
            const deleteBtn = document.createElement("button");
            deleteBtn.className = "btn-delete";
            deleteBtn.title = "Delete rule";
            deleteBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
            `;

            deleteBtn.addEventListener("click", () => deleteRule(index));

            li.appendChild(textSpan);
            li.appendChild(deleteBtn);
            rulesList.appendChild(li);
        });
    };

    // 3. Setup toggle listener
    toggle.addEventListener("change", async () => {
        const isEnabled = toggle.checked;
        updateStatusBadge(isEnabled);

        const { disabledSites = {} } = await chrome.storage.local.get("disabledSites");
    
        if (isEnabled) {
            delete disabledSites[currentDomain];
        } else {
            disabledSites[currentDomain] = true;
        }

        await chrome.storage.local.set({ disabledSites });

        // Send status change message to content script
        try {
            await chrome.tabs.sendMessage(currentTab.id, { 
                action: "toggleBlocker", 
                enabled: isEnabled 
            });
        } catch (err) {
            console.log("Could not communicate with tab content script:", err);
        }
    });

    // 4. Setup Picker activation listener
    pickBtn.addEventListener("click", async () => {
        try {
            await chrome.tabs.sendMessage(currentTab.id, { action: "startPicker" });
            window.close(); // Close popup so it doesn't obstruct picker mode
        } catch (err) {
            console.log("Content script not ready. Attempting dynamic injection...");
            try {
                // Dynamically inject content scripts if not already present
                await chrome.scripting.executeScript({
                    target: { tabId: currentTab.id },
                    files: ["content/content.js"]
                });
                await chrome.scripting.insertCSS({
                    target: { tabId: currentTab.id },
                    files: ["content/content.css"]
                });
                // Retry after injection
                await chrome.tabs.sendMessage(currentTab.id, { action: "startPicker" });
                window.close();
            } catch (injectErr) {
                console.error("Failed to inject or start picker:", injectErr);
            }
        }
    });

    // 5. Delete specific rule
    const deleteRule = async (index) => {
        const { rules = {} } = await chrome.storage.local.get("rules");
        const siteRules = rules[currentDomain] || [];
    
        // Remove element at index
        siteRules.splice(index, 1);
    
        if (siteRules.length === 0) {
            delete rules[currentDomain];
        } else {
            rules[currentDomain] = siteRules;
        }

        await chrome.storage.local.set({ rules });
        renderRules(siteRules);

        // Send updated rules message to tab content script
        try {
            await chrome.tabs.sendMessage(currentTab.id, { 
                action: "updateRules", 
                rules: siteRules 
            });
        } catch (err) {
            console.log("Could not send updated rules to content script:", err);
        }
    };

    // 6. Reset all rules for this site
    clearBtn.addEventListener("click", async () => {
        const confirmReset = confirm(`Are you sure you want to reset all rules for ${currentDomain}?`);
        if (!confirmReset) return;

        const { rules = {} } = await chrome.storage.local.get("rules");
        delete rules[currentDomain];
    
        await chrome.storage.local.set({ rules });
        renderRules([]);

        // Send clear message to tab content script
        try {
            await chrome.tabs.sendMessage(currentTab.id, { 
                action: "updateRules", 
                rules: [] 
            });
        } catch (err) {
            console.log("Could not clear rules in content script:", err);
        }
    });

    // Initial load
    await loadState();
});
