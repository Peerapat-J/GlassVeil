// content/content.js

(function () {
    // Prevent duplicate injection
    if (window.glassVeilInjected) return;
    window.glassVeilInjected = true;

    const currentDomain = window.location.hostname;
    let isBlockerEnabled = true;
    let activeSelectors = [];

    // Create style element immediately at document_start to avoid flickering
    const styleEl = document.createElement("style");
    styleEl.id = "glassveil-injected-style";

    // Append to documentElement because head/body might not exist yet
    if (document.documentElement) {
        document.documentElement.appendChild(styleEl);
    } else {
        // Fallback if documentElement is not ready (rare)
        const observer = new MutationObserver(() => {
            if (document.documentElement) {
                document.documentElement.appendChild(styleEl);
                observer.disconnect();
            }
        });
        observer.observe(document, { childList: true, subtree: true });
    }

    // 1. Core Hiding Engine: Fetch rules and apply them
    const applyRules = (selectors, enabled) => {
        console.log("[GlassVeil] Applying rules. Enabled:", enabled, "Selectors:", selectors);
        if (!enabled || !selectors || selectors.length === 0) {
            styleEl.textContent = "";
            return;
        }
        // Generate cosmetic blocking CSS rule
        const cssRules = selectors
            .map(sel => `${sel} { display: none !important; }`)
            .join("\n");
        styleEl.textContent = cssRules;
    };

    const applyRulesFromStorage = async () => {
        try {
            const { disabledSites = {}, rules = {} } = await chrome.storage.local.get(["disabledSites", "rules"]);
            isBlockerEnabled = !disabledSites[currentDomain];
            activeSelectors = rules[currentDomain] || [];
            console.log("[GlassVeil] Loaded from storage for domain:", currentDomain, "rules:", activeSelectors, "enabled:", isBlockerEnabled);
            applyRules(activeSelectors, isBlockerEnabled);
        } catch (err) {
            console.error("[GlassVeil] Failed to load rules from storage:", err);
        }
    };

    // Run immediately
    applyRulesFromStorage();

    // Listen for storage changes to support real-time toggle/delete in popup
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === "local") {
            console.log("[GlassVeil] Storage changed:", changes);
            if (changes.rules || changes.disabledSites) {
                applyRulesFromStorage();
            }
        }
    });

    // Listen to messages from popup/background scripts
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === "startPicker") {
            startPicker();
            sendResponse({ status: "picker_started" });
        } else if (message.action === "toggleBlocker") {
            isBlockerEnabled = message.enabled;
            applyRules(activeSelectors, isBlockerEnabled);
            sendResponse({ status: "blocker_toggled" });
        } else if (message.action === "updateRules") {
            activeSelectors = message.rules;
            applyRules(activeSelectors, isBlockerEnabled);
            sendResponse({ status: "rules_updated" });
        }
        return true; // Keep channel open
    });

    // ==========================================
    // ELEMENT PICKER ENGINE
    // ==========================================

    let isPickerActive = false;
    let hoveredElement = null;
    let selectedElement = null;
    let originalDisplay = "";

    // UI container references
    let pickerRoot = null;
    let shadowRoot = null;

    const startPicker = () => {
        if (isPickerActive) return;
        isPickerActive = true;
        selectedElement = null;
        hoveredElement = null;

        // Create the Shadow DOM container for Picker UI
        pickerRoot = document.createElement("div");
        pickerRoot.id = "glassveil-picker-root";
        // Ensure the container is isolated from page layouts
        pickerRoot.style.position = "fixed";
        pickerRoot.style.zIndex = "2147483647"; // Max z-index
        pickerRoot.style.top = "0";
        pickerRoot.style.left = "0";
        pickerRoot.style.width = "0";
        pickerRoot.style.height = "0";
        document.body.appendChild(pickerRoot);

        shadowRoot = pickerRoot.attachShadow({ mode: "open" });

        // Inject Shadow DOM UI Markup & Style
        injectShadowUI();

        // Event listeners
        document.addEventListener("mouseover", handleMouseOver, true);
        document.addEventListener("mouseout", handleMouseOut, true);
        document.addEventListener("click", handleElementClick, true);
        document.addEventListener("keydown", handleKeyDown, true);
    };

    const stopPicker = () => {
        if (!isPickerActive) return;
        isPickerActive = false;

        // Remove picker outline classes
        if (hoveredElement) {
            hoveredElement.classList.remove("glassveil-picker-hovered");
        }
        if (selectedElement) {
            selectedElement.classList.remove("glassveil-picker-hovered");
            if (originalDisplay !== "") {
                selectedElement.style.display = originalDisplay;
            }
        }

        // Clean up event listeners
        document.removeEventListener("mouseover", handleMouseOver, true);
        document.removeEventListener("mouseout", handleMouseOut, true);
        document.removeEventListener("click", handleElementClick, true);
        document.removeEventListener("keydown", handleKeyDown, true);

        // Remove Shadow DOM UI
        if (pickerRoot && pickerRoot.parentNode) {
            pickerRoot.parentNode.removeChild(pickerRoot);
        }
        pickerRoot = null;
        shadowRoot = null;
        hoveredElement = null;
        selectedElement = null;
        originalDisplay = "";
    };

    // Shadow DOM UI Markup
    const injectShadowUI = () => {
        const style = document.createElement("style");
        style.textContent = `
            :host {
                all: initial;
                font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            }

            .picker-panel {
                position: fixed;
                bottom: 24px;
                left: 50%;
                transform: translateX(-50%) translateY(100px);
                background: rgba(13, 14, 21, 0.85);
                backdrop-filter: blur(20px);
                -webkit-backdrop-filter: blur(20px);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 16px;
                padding: 16px 20px;
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
                display: flex;
                flex-direction: column;
                gap: 12px;
                width: 460px;
                z-index: 2147483647;
                opacity: 0;
                transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease;
            }

            .picker-panel.active {
                transform: translateX(-50%) translateY(0);
                opacity: 1;
            }

            /* When freely positioned after a drag, disable centering transform */
            .picker-panel.free {
                bottom: unset;
                left: unset;
                transform: none;
            }

            .picker-panel.dragging {
                transition: none !important;
                box-shadow: 0 16px 56px rgba(0, 0, 0, 0.7);
                border-color: rgba(0, 242, 254, 0.25);
            }

            .panel-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                cursor: grab;
                user-select: none;
            }

            .panel-header:active {
                cursor: grabbing;
            }

            .drag-hint {
                font-size: 10px;
                color: rgba(148, 163, 184, 0.45);
                letter-spacing: 0.3px;
                pointer-events: none;
                margin-left: 6px;
            }

            .title-area {
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .logo-shield {
                width: 10px;
                height: 12px;
                background: linear-gradient(135deg, #00f2fe 0%, #7f00ff 100%);
                clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
            }

            h3 {
                margin: 0;
                font-size: 14px;
                font-weight: 700;
                color: #ffffff;
                letter-spacing: 0.5px;
            }

            .instruction {
                font-size: 11px;
                color: #94a3b8;
            }

            .selector-box {
                display: flex;
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 8px;
                padding: 8px 12px;
                align-items: center;
                gap: 8px;
            }

            .selector-input {
                background: transparent;
                border: none;
                color: #e2e8f0;
                font-family: monospace;
                font-size: 12px;
                width: 100%;
                outline: none;
            }

            .action-row {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-top: 4px;
            }

            .control-group {
                display: flex;
                gap: 8px;
            }

            .btn {
                padding: 8px 14px;
                border-radius: 8px;
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s ease;
                border: none;
            }

            .btn-primary {
                background: linear-gradient(135deg, #00f2fe 0%, #7f00ff 100%);
                color: #ffffff;
                box-shadow: 0 4px 10px rgba(0, 242, 254, 0.2);
            }

            .btn-primary:hover {
                transform: translateY(-1px);
                box-shadow: 0 6px 14px rgba(0, 242, 254, 0.3);
            }

            .btn-secondary {
                background: rgba(255, 255, 255, 0.08);
                color: #e2e8f0;
                border: 1px solid rgba(255, 255, 255, 0.05);
            }

            .btn-secondary:hover {
                background: rgba(255, 255, 255, 0.15);
            }

            .btn-text {
                background: transparent;
                color: #94a3b8;
                padding: 8px 10px;
                font-weight: 500;
            }

            .btn-text:hover {
                color: #ffffff;
                text-decoration: underline;
            }

            /* Toggle Styles */
            .toggle-container {
                display: flex;
                align-items: center;
                gap: 6px;
                font-size: 11px;
                color: #94a3b8;
                cursor: pointer;
                user-select: none;
            }

            .toggle-switch {
                position: relative;
                width: 30px;
                height: 16px;
                background-color: rgba(255, 255, 255, 0.1);
                border-radius: 10px;
                transition: background-color 0.2s;
            }

            .toggle-switch::after {
                content: "";
                position: absolute;
                width: 12px;
                height: 12px;
                border-radius: 50%;
                background-color: #ffffff;
                top: 2px;
                left: 2px;
                transition: transform 0.2s;
            }

            .toggle-container.checked .toggle-switch {
                background: linear-gradient(135deg, #00f2fe 0%, #7f00ff 100%);
            }

            .toggle-container.checked .toggle-switch::after {
                transform: translateX(14px);
            }
        `;

        const container = document.createElement("div");
        container.id = "glassveil-panel";
        container.className = "picker-panel";
        container.innerHTML = `
            <div class="panel-header" id="panel-drag-handle">
                <div class="title-area">
                    <div class="logo-shield"></div>
                    <h3>GlassVeil Picker</h3>
                    <span class="drag-hint">drag to move</span>
                </div>
                <span class="instruction" id="picker-instruction">Hover over elements and click to select</span>
            </div>
            <div class="selector-box">
                <input type="text" class="selector-input" id="selector-display" readonly placeholder="Hover element to inspect..." />
            </div>
            <div class="action-row">
                <div class="control-group">
                    <button class="btn btn-secondary btn-text" id="parent-btn" style="display: none;">Select Parent</button>
                    <div class="toggle-container" id="preview-toggle" style="display: none;">
                        <div class="toggle-switch"></div>
                        <span>Preview Hide</span>
                    </div>
                </div>
                <div class="control-group">
                    <button class="btn btn-secondary" id="cancel-btn">Cancel</button>
                    <button class="btn btn-primary" id="confirm-btn" style="display: none;">Block Element</button>
                </div>
            </div>
        `;

        shadowRoot.appendChild(style);
        shadowRoot.appendChild(container);

        // Trigger sliding entry animation on next tick
        setTimeout(() => {
            container.classList.add("active");
        }, 10);

        // ── Drag-to-move logic ──────────────────────────────────────────
        const dragHandle = shadowRoot.getElementById("panel-drag-handle");
        let isDragging = false;
        let dragOffsetX = 0;
        let dragOffsetY = 0;

        dragHandle.addEventListener("mousedown", (e) => {
            // Only drag on left-button, not on child buttons/inputs
            if (e.button !== 0) return;
            if (e.target.closest("button, input, a")) return;

            isDragging = true;

            // Convert panel to free (top/left) positioning on first drag
            const rect = container.getBoundingClientRect();
            container.classList.add("free", "dragging");
            container.style.top = rect.top + "px";
            container.style.left = rect.left + "px";

            dragOffsetX = e.clientX - rect.left;
            dragOffsetY = e.clientY - rect.top;

            e.preventDefault();
            e.stopPropagation();
        });

        // Use shadowRoot's ownerDocument so events fire even when mouse
        // leaves the shadow host element during a fast drag.
        const ownerDoc = shadowRoot.host.ownerDocument;

        ownerDoc.addEventListener("mousemove", (e) => {
            if (!isDragging) return;

            let newLeft = e.clientX - dragOffsetX;
            let newTop  = e.clientY - dragOffsetY;

            // Clamp inside the viewport
            const panelW = container.offsetWidth;
            const panelH = container.offsetHeight;
            newLeft = Math.max(0, Math.min(newLeft, window.innerWidth  - panelW));
            newTop  = Math.max(0, Math.min(newTop,  window.innerHeight - panelH));

            container.style.left = newLeft + "px";
            container.style.top  = newTop  + "px";
        }, true);

        ownerDoc.addEventListener("mouseup", () => {
            if (!isDragging) return;
            isDragging = false;
            container.classList.remove("dragging");
        }, true);
        // ── End drag logic ──────────────────────────────────────────────

        // Wire panel button listeners
        shadowRoot.getElementById("cancel-btn").addEventListener("click", (e) => {
            e.stopPropagation();
            stopPicker();
        });

        shadowRoot.getElementById("parent-btn").addEventListener("click", handleSelectParent);
        shadowRoot.getElementById("confirm-btn").addEventListener("click", handleConfirmBlock);

        const previewToggle = shadowRoot.getElementById("preview-toggle");
        previewToggle.addEventListener("click", handleTogglePreview);
    };

    // Mouse Move Highlight Handlers
    const handleMouseOver = (e) => {
        if (!isPickerActive || selectedElement) return;

        const el = e.target;

        // Ignore html, body, and picker elements
        if (el === document.documentElement || el === document.body || pickerRoot.contains(el)) {
            return;
        }

        if (hoveredElement && hoveredElement !== el) {
            hoveredElement.classList.remove("glassveil-picker-hovered");
        }

        hoveredElement = el;
        hoveredElement.classList.add("glassveil-picker-hovered");

        // Generate real-time CSS selector
        const selector = generateSelector(hoveredElement);
        const displayInput = shadowRoot.getElementById("selector-display");
        if (displayInput) {
            displayInput.value = selector;
        }
    };

    const handleMouseOut = (e) => {
        if (!isPickerActive || selectedElement) return;

        if (hoveredElement && e.target === hoveredElement) {
            hoveredElement.classList.remove("glassveil-picker-hovered");
            hoveredElement = null;

            const displayInput = shadowRoot.getElementById("selector-display");
            if (displayInput) {
                displayInput.value = "";
            }
        }
    };

    // Click handler to freeze selection
    const handleElementClick = (e) => {
        if (!isPickerActive) return;

        // Check if clicked inside our Shadow DOM panel BEFORE stopping propagation.
        // composedPath() lets us see through Shadow DOM boundaries correctly.
        const path = e.composedPath();
        if (path.includes(pickerRoot)) {
            return;
        }

        // Prevent navigating or click effects on page elements only
        e.preventDefault();
        e.stopPropagation();

        if (selectedElement) {
            // Re-enable original state if clicking another element
            selectedElement.classList.remove("glassveil-picker-hovered");
            if (originalDisplay !== "") {
                selectedElement.style.display = originalDisplay;
                originalDisplay = "";
            }
        }

        selectedElement = e.target;
        if (hoveredElement) {
            hoveredElement.classList.remove("glassveil-picker-hovered");
            hoveredElement = null;
        }

        selectedElement.classList.add("glassveil-picker-hovered");

        // Show Confirmation Controls
        shadowRoot.getElementById("picker-instruction").textContent = "Selected Element locked";
        shadowRoot.getElementById("parent-btn").style.display = "block";
        shadowRoot.getElementById("preview-toggle").style.display = "flex";
        shadowRoot.getElementById("confirm-btn").style.display = "block";

        // Update displayed selector
        const selector = generateSelector(selectedElement);
        shadowRoot.getElementById("selector-display").value = selector;
    };

    // Keyboard shortcut handlers (Escape to cancel)
    const handleKeyDown = (e) => {
        if (e.key === "Escape") {
            stopPicker();
        }
    };

    // Action Bar Controller functions
    const handleSelectParent = (e) => {
        e.stopPropagation();
        if (!selectedElement) return;

        const parent = selectedElement.parentElement;
        if (!parent || parent === document.body || parent === document.documentElement) {
            alert("Cannot select parent any further.");
            return;
        }

        // Remove highlight and reset preview on current element
        selectedElement.classList.remove("glassveil-picker-hovered");
        if (originalDisplay !== "") {
            selectedElement.style.display = originalDisplay;
            originalDisplay = "";
        }

        // Set parent as the new selected element
        selectedElement = parent;
        selectedElement.classList.add("glassveil-picker-hovered");

        // Reset preview toggle visual state
        const toggle = shadowRoot.getElementById("preview-toggle");
        toggle.classList.remove("checked");

        // Update displayed selector
        const selector = generateSelector(selectedElement);
        shadowRoot.getElementById("selector-display").value = selector;
    };

    const handleTogglePreview = (e) => {
        e.stopPropagation();
        if (!selectedElement) return;

        const toggle = shadowRoot.getElementById("preview-toggle");
        const isChecked = toggle.classList.toggle("checked");

        if (isChecked) {
            // Hide element temporarily
            originalDisplay = selectedElement.style.display;
            selectedElement.style.setProperty("display", "none", "important");
        } else {
            // Restore element
            if (originalDisplay !== "") {
                selectedElement.style.display = originalDisplay;
                originalDisplay = "";
            } else {
                selectedElement.style.removeProperty("display");
            }
        }
    };

    const handleConfirmBlock = async (e) => {
        e.stopPropagation();
        if (!selectedElement) return;

        const selector = shadowRoot.getElementById("selector-display").value;
        if (!selector) return;

        console.log("[GlassVeil] Confirming block for selector:", selector);

        try {
            // Save selector to storage
            const { rules = {} } = await chrome.storage.local.get("rules");
            const siteRules = rules[currentDomain] || [];

            if (!siteRules.includes(selector)) {
                siteRules.push(selector);
                rules[currentDomain] = siteRules;
                await chrome.storage.local.set({ rules });
                console.log("[GlassVeil] Rule successfully saved to local storage.");
            } else {
                console.log("[GlassVeil] Rule already exists in local storage.");
            }

            // Apply rules immediately in the active session
            activeSelectors = siteRules;
            applyRules(activeSelectors, isBlockerEnabled);
        } catch (err) {
            console.error("[GlassVeil] Error saving/applying rule:", err);
        }

        // Clean up picker and stop
        stopPicker();
    };

    // ==========================================
    // CSS SELECTOR GENERATION LOGIC
    // ==========================================
    const generateSelector = (el) => {
        if (!el || el.nodeType !== Node.ELEMENT_NODE) return "";

        const path = [];
        let current = el;
        let depth = 0;

        while (current && current.nodeType === Node.ELEMENT_NODE && depth < 5) {
            let tagName = current.nodeName.toLowerCase();

            // Stop walking up if we hit body or html
            if (tagName === "body" || tagName === "html") {
                if (path.length === 0) path.unshift(tagName);
                break;
            }

            // Check for clean ID
            if (current.id) {
                const cleanId = current.id.trim();
                // Skip IDs that look dynamic: e.g. containing numbers >= 4 digits, random hashes
                const isDynamic = /\d{4,}/.test(cleanId) || /^[a-f0-9]{8,}$/i.test(cleanId) || cleanId.startsWith("react-") || cleanId.startsWith("vue-") || cleanId.startsWith("ember") || cleanId.includes("_tmp");

                if (!isDynamic) {
                    try {
                        const escapedId = CSS.escape(cleanId);
                        // Verify if ID is unique in document
                        if (document.querySelectorAll(`#${escapedId}`).length === 1) {
                            path.unshift(`#${escapedId}`);
                            break; // Unique ID is an absolute selector, stop climbing
                        }
                    } catch (err) {
                        console.warn("Invalid ID character found while escaping:", cleanId);
                    }
                }
            }

            // Get clean classes
            let classSelector = "";
            if (current.classList && current.classList.length > 0) {
                const cleanClasses = [];
                for (let i = 0; i < current.classList.length; i++) {
                    const cls = current.classList[i];
                    // Filter out picker outline classes or dynamic classes
                    if (
                        cls === "glassveil-picker-hovered" ||
                        /\d{4,}/.test(cls) ||
                        cls.length > 25 || // Dynamic class strings are usually very long
                        cls.includes("_") || // CSS module hashes often contain underscores or dashes followed by hashes
                        cls.includes("-") && /\d/.test(cls) // dynamic e.g. col-md-4 is fine, but ad-123 is not. Let's keep it simple.
                    ) {
                        continue;
                    }
                    cleanClasses.push(CSS.escape(cls));
                }

                if (cleanClasses.length > 0) {
                    classSelector = "." + cleanClasses.join(".");
                }
            }

            const segment = tagName + classSelector;

            // Check if tag + classes uniquely identifies element among siblings
            const siblings = current.parentElement ? Array.from(current.parentElement.children) : [];
            const matchingSiblings = siblings.filter(sib => {
                let sibTagName = sib.nodeName.toLowerCase();
                if (sibTagName !== tagName) return false;

                if (classSelector) {
                    const classes = classSelector.substring(1).split(".");
                    return classes.every(cls => sib.classList.contains(cls));
                }
                return true;
            });

            if (matchingSiblings.length > 1 && current.parentElement) {
                // Not unique among siblings, add nth-of-type
                const index = siblings.indexOf(current) + 1;
                path.unshift(`${segment}:nth-child(${index})`);
            } else {
                path.unshift(segment);
            }

            current = current.parentElement;
            depth++;
        }

        return path.join(" > ");
    };

})();
