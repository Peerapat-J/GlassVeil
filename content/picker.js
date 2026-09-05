// Classic-script module; instance state is owned by its factory.
(function (root) {
    "use strict";

    const createPicker = ({ window, document, generateSelector, saveSelectors, utils, createSelectionState, createPickerUI, analyzeImpact, sameImpact, iconUrl }) => {
        const { formatSelectedOutlineLabel, clampPanelPosition, formatSelectionSummary } = utils;
        let isPickerActive = false;
        let hoveredElement = null;
        const isAvailable = element => element.isConnected && element.getRootNode() === document;
        const selection = createSelectionState({ isAvailable });
        const previewedElements = new Map();
        const selectedOutlineBoxes = new Map();
        let outlineUpdateFrame = null;
        const impactOutlineBoxes = new Map();
        let currentImpact = null;
        let saveInFlight = false;
        let precision = "exact";
        const generateCurrentSelector = element => generateSelector(element, { mode: precision });

        // UI container references
        let pickerRoot = null;
        let shadowRoot = null;
        let pickerPanel = null;

        const getOutlineLayer = () => shadowRoot ? shadowRoot.getElementById("selected-outline-layer") : null;

        const clearSelectedOutlines = () => {
            selectedOutlineBoxes.forEach((outlineBox) => outlineBox.remove());
            selectedOutlineBoxes.clear();
            impactOutlineBoxes.forEach(box => box.remove());
            impactOutlineBoxes.clear();

            if (outlineUpdateFrame !== null) {
                window.cancelAnimationFrame(outlineUpdateFrame);
                outlineUpdateFrame = null;
            }
        };

        const renderOutlines = (elements, boxes, className, labelFor) => {
            const layer = getOutlineLayer();
            if (!layer) return;
            const visibleElements = new Set(Array.from(elements).filter(element => element.isConnected));
            boxes.forEach((box, element) => {
                if (!visibleElements.has(element)) { box.remove(); boxes.delete(element); }
            });
            Array.from(visibleElements).forEach((element, index) => {
                let box = boxes.get(element);
                if (!box) {
                    box = document.createElement("div");
                    box.className = className;
                    const label = document.createElement("span");
                    label.className = "selected-outline-label";
                    box.appendChild(label);
                    layer.appendChild(box);
                    boxes.set(element, box);
                }
                const rect = element.getBoundingClientRect();
                const left = Math.max(0, rect.left), top = Math.max(0, rect.top);
                const right = Math.min(window.innerWidth, rect.right), bottom = Math.min(window.innerHeight, rect.bottom);
                box.style.display = right > left && bottom > top ? "block" : "none";
                Object.assign(box.style, { left: `${left}px`, top: `${top}px`, width: `${Math.max(0, right - left)}px`, height: `${Math.max(0, bottom - top)}px` });
                box.firstChild.textContent = labelFor(index);
            });
        };

        const syncSelectedOutlines = () => {
            renderOutlines(selection, selectedOutlineBoxes, "selected-outline", formatSelectedOutlineLabel);
            const additional = Array.from(currentImpact?.matches || []).filter(element => !selection.has(element));
            renderOutlines(additional, impactOutlineBoxes, "selected-outline impact-outline", () => "Also hidden");
        };

        const scheduleSelectedOutlineSync = () => {
            if (!isPickerActive || outlineUpdateFrame !== null) return;

            outlineUpdateFrame = window.requestAnimationFrame(() => {
                outlineUpdateFrame = null;
                syncSelectedOutlines();
            });
        };

        const handleViewportChange = () => {
            clampPickerPanelToViewport();
            scheduleSelectedOutlineSync();
        };

        const clampPickerPanelToViewport = () => {
            if (!pickerPanel || !pickerPanel.classList.contains("free")) return;

            const rect = pickerPanel.getBoundingClientRect();
            const position = clampPanelPosition({
                left: rect.left,
                top: rect.top,
                panelWidth: rect.width,
                panelHeight: rect.height,
                viewportWidth: window.innerWidth,
                viewportHeight: window.innerHeight
            });

            pickerPanel.style.left = `${position.left}px`;
            pickerPanel.style.top = `${position.top}px`;
        };

        const restorePreviewForElement = (element) => {
            if (!previewedElements.has(element)) return;

            const originalDisplay = previewedElements.get(element);
            if (originalDisplay.value !== "") {
                element.style.setProperty("display", originalDisplay.value, originalDisplay.priority);
            } else {
                element.style.removeProperty("display");
            }

            previewedElements.delete(element);
        };

        const restorePreview = () => {
            Array.from(previewedElements.keys()).forEach(restorePreviewForElement);
        };

        const previewElement = (element) => {
            if (!element || previewedElements.has(element)) return;

            previewedElements.set(element, { value: element.style.getPropertyValue("display"), priority: element.style.getPropertyPriority("display") });
            element.style.setProperty("display", "none", "important");
        };

        const isPreviewEnabled = () => {
            const toggle = shadowRoot ? shadowRoot.getElementById("preview-toggle") : null;
            return Boolean(toggle && toggle.classList.contains("checked"));
        };

        const refreshImpact = () => {
            // Preview changes inline styles; remove it before evaluating the real page.
            restorePreview();
            for (const element of selection) {
                if (!isAvailable(element)) element.classList.remove("glassveil-picker-hovered", "glassveil-picker-selected");
            }
            selection.prune();
            currentImpact = analyzeImpact({ elements: selection, generateSelector: generateCurrentSelector, document, pickerRoot });
            if (isPreviewEnabled()) currentImpact.matches.forEach(previewElement);
            return currentImpact;
        };

        const renderImpact = () => {
            const section = shadowRoot.getElementById("impact-section");
            section.hidden = selection.size === 0;
            const summary = shadowRoot.getElementById("impact-summary");
            summary.textContent = `${currentImpact.requiresConfirmation ? "Warning: " : ""}These rules will hide ${currentImpact.total} ${currentImpact.total === 1 ? "element" : "elements"} in total.`;
            if (currentImpact.skipped) summary.textContent += ` ${currentImpact.skipped} ${currentImpact.skipped === 1 ? "selection cannot" : "selections cannot"} be saved.`;
            summary.classList.toggle("warning", currentImpact.requiresConfirmation);
            const list = shadowRoot.getElementById("impact-list");
            list.replaceChildren();
            const errors = {
                invalid: "Invalid selector — not saved",
                zero: "No matches — not saved",
                "target-missing": "Selected element no longer matches — not saved",
                "page-root": "Includes the page or picker root — not saved"
            };
            currentImpact.entries.forEach((entry, index) => {
                const row = document.createElement("li");
                const code = document.createElement("code");
                code.textContent = `${index + 1}. ${entry.selector || "No selector"}`;
                code.title = entry.selector;
                const count = document.createElement("span");
                count.textContent = entry.status === "valid" ? `${entry.matches.length} ${entry.matches.length === 1 ? "match" : "matches"}` : errors[entry.status];
                row.className = entry.status !== "valid" || entry.matches.length > 1 ? "warning" : "";
                row.append(code, count); list.appendChild(row);
            });
            shadowRoot.getElementById("impact-notice").textContent = "";
        };

        const updateSelectionControls = () => {
            if (!shadowRoot) return;

            refreshImpact();
            renderImpact();
            const selectedCount = selection.size;
            const hasSelection = selectedCount > 0;
            const activeIndex = Array.from(selection).indexOf(selection.active);
            const activeSelector = currentImpact.entries[activeIndex]?.selector || "";

            const instruction = shadowRoot.getElementById("picker-instruction");
            const selectionCount = shadowRoot.getElementById("selection-count");
            const displayInput = shadowRoot.getElementById("selector-display");
            const parentBtn = shadowRoot.getElementById("parent-btn");
            const previewToggle = shadowRoot.getElementById("preview-toggle");
            const confirmBtn = shadowRoot.getElementById("confirm-btn");

            if (instruction) {
                instruction.textContent = hasSelection
                    ? "Click more elements to add, or click selected elements to remove"
                    : "Hover over elements and click to select";
            }

            if (selectionCount) {
                selectionCount.textContent = `${selectedCount} selected`;
            }

            if (displayInput) {
                displayInput.value = formatSelectionSummary(selectedCount, activeSelector);
            }

            if (parentBtn) {
                parentBtn.style.display = selection.active ? "block" : "none";
            }

            if (previewToggle) {
                previewToggle.style.display = hasSelection ? "flex" : "none";
                if (!hasSelection) {
                    restorePreview();
                }
            }

            if (confirmBtn) {
                confirmBtn.style.display = hasSelection ? "block" : "none";
                shadowRoot.getElementById("precision-mode").disabled = saveInFlight;
                confirmBtn.disabled = saveInFlight || currentImpact.selectors.length === 0;
                confirmBtn.textContent = saveInFlight ? "Saving…" : `Block ${currentImpact.skipped ? "valid " : ""}(${currentImpact.total})`;
            }

            shadowRoot.getElementById("undo-btn").disabled = saveInFlight || !selection.canUndo;
            syncSelectedOutlines();
            clampPickerPanelToViewport();
        };

        const startPicker = () => {
            if (isPickerActive || saveInFlight) return;
            isPickerActive = true;
            precision = "exact";
            selection.clear();
            hoveredElement = null;
            previewedElements.clear();

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
            pickerPanel = createPickerUI({
                document, window, shadowRoot, clampPanelPosition, iconUrl,
                onPrecisionChange: value => {
                    if (!saveInFlight) { precision = value === "similar" ? "similar" : "exact"; updateSelectionControls(); }
                },
                onRefresh: () => { if (!saveInFlight) updateSelectionControls(); },
                onUndo: handleUndo,
                onCancel: stopPicker,
                onSelectParent: handleSelectParent,
                onConfirm: handleConfirmBlock,
                onTogglePreview: handleTogglePreview
            });

            updateSelectionControls();

            // Event listeners
            document.addEventListener("mouseover", handleMouseOver, true);
            document.addEventListener("mouseout", handleMouseOut, true);
            document.addEventListener("click", handleElementClick, true);
            document.addEventListener("keydown", handleKeyDown, true);
            document.addEventListener("scroll", handleViewportChange, true);
            window.addEventListener("resize", handleViewportChange, true);
        };

        const stopPicker = () => {
            if (!isPickerActive) return;
            isPickerActive = false;

            restorePreview();

            // Remove picker outline classes
            if (hoveredElement) {
                hoveredElement.classList.remove("glassveil-picker-hovered");
            }
            selection.forEach((element) => {
                element.classList.remove("glassveil-picker-hovered", "glassveil-picker-selected");
            });
            clearSelectedOutlines();

            // Clean up event listeners
            document.removeEventListener("mouseover", handleMouseOver, true);
            document.removeEventListener("mouseout", handleMouseOut, true);
            document.removeEventListener("click", handleElementClick, true);
            document.removeEventListener("keydown", handleKeyDown, true);
            document.removeEventListener("scroll", handleViewportChange, true);
            window.removeEventListener("resize", handleViewportChange, true);

            // Remove Shadow DOM UI
            if (pickerRoot && pickerRoot.parentNode) {
                pickerRoot.parentNode.removeChild(pickerRoot);
            }
            pickerRoot = null;
            shadowRoot = null;
            pickerPanel = null;
            hoveredElement = null;
            selection.clear();
            currentImpact = null;
        };

        // Mouse Move Highlight Handlers
        const handleMouseOver = (e) => {
            if (!isPickerActive) return;

            const el = e.target;

            // Ignore html, body, and picker elements
            if (el === document.documentElement || el === document.body || pickerRoot.contains(el)) {
                return;
            }

            if (hoveredElement && hoveredElement !== el) {
                hoveredElement.classList.remove("glassveil-picker-hovered");
            }

            hoveredElement = el;
            if (!selection.has(hoveredElement)) {
                hoveredElement.classList.add("glassveil-picker-hovered");
            }

            // Generate real-time CSS selector
            let selector = "";
            try { selector = generateCurrentSelector(hoveredElement); } catch { /* Selection will report the invalid candidate. */ }
            const displayInput = shadowRoot.getElementById("selector-display");
            if (displayInput && selection.size === 0) {
                displayInput.value = selector;
            }
        };

        const handleMouseOut = (e) => {
            if (!isPickerActive) return;

            if (hoveredElement && e.target === hoveredElement) {
                if (!selection.has(hoveredElement)) {
                    hoveredElement.classList.remove("glassveil-picker-hovered");
                }
                hoveredElement = null;

                const displayInput = shadowRoot.getElementById("selector-display");
                if (displayInput && selection.size === 0) {
                    displayInput.value = "";
                }
            }
        };

        // Click handler to toggle one element in the current selection
        const handleElementClick = (e) => {
            if (!isPickerActive) return;

            // Check if clicked inside our Shadow DOM panel BEFORE stopping propagation.
            // composedPath() lets us see through Shadow DOM boundaries correctly.
            const path = e.composedPath();
            if (path.includes(pickerRoot)) {
                return;
            }
            if (saveInFlight) { e.preventDefault(); e.stopPropagation(); return; }

            // Prevent navigating or click effects on page elements only
            e.preventDefault();
            e.stopPropagation();

            const targetElement = e.target;

            if (hoveredElement === targetElement) {
                targetElement.classList.remove("glassveil-picker-hovered");
                hoveredElement = null;
            }

            if (selection.has(targetElement)) {
                selection.delete(targetElement);
                targetElement.classList.remove("glassveil-picker-hovered", "glassveil-picker-selected");
                restorePreviewForElement(targetElement);
            } else {
                selection.add(targetElement);
                targetElement.classList.remove("glassveil-picker-hovered");
                targetElement.classList.add("glassveil-picker-selected");

            }

            updateSelectionControls();
        };

        // Keyboard shortcuts stay local to the picker session.
        const handleKeyDown = (e) => {
            if (e.key === "Escape") {
                stopPicker();
                return;
            }
            if (e.defaultPrevented || e.isComposing || e.altKey || e.shiftKey ||
                !(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
            const editable = e.composedPath().some(node => node.isContentEditable ||
                node.matches?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])'));
            if (!editable && handleUndo(e)) e.preventDefault();
        };

        const handleUndo = (e) => {
            if (!isPickerActive || saveInFlight) return false;
            const previous = Array.from(selection);
            const undone = selection.undo();
            previous.forEach(element => element.classList.remove("glassveil-picker-hovered", "glassveil-picker-selected"));
            if (hoveredElement) hoveredElement.classList.remove("glassveil-picker-hovered");
            hoveredElement = null;
            selection.forEach(element => element.classList.add("glassveil-picker-selected"));
            updateSelectionControls();
            if (undone) e.stopPropagation();
            return undone;
        };

        // Action Bar Controller functions
        const handleSelectParent = (e) => {
            e.stopPropagation();
            if (!selection.active || saveInFlight) return;

            const currentElement = selection.active;
            if (!isAvailable(currentElement)) { updateSelectionControls(); return; }
            const parent = currentElement.parentElement;
            if (!parent || parent === document.body || parent === document.documentElement) {
                window.alert("Cannot select parent any further.");
                return;
            }

            selection.replaceWithParent(parent);
            currentElement.classList.remove("glassveil-picker-hovered", "glassveil-picker-selected");
            restorePreviewForElement(currentElement);

            // Set parent as the new selected element
            parent.classList.remove("glassveil-picker-hovered");
            parent.classList.add("glassveil-picker-selected");


            updateSelectionControls();
        };

        const handleTogglePreview = (e) => {
            e.stopPropagation();
            if (selection.size === 0 || saveInFlight) return;
            shadowRoot.getElementById("preview-toggle").classList.toggle("checked");
            updateSelectionControls();
        };

        const handleConfirmBlock = async (e) => {
            e.stopPropagation();
            if (selection.size === 0 || saveInFlight) return;
            const previous = currentImpact;
            updateSelectionControls();
            const reviewed = currentImpact;
            if (!reviewed.selectors.length) return;
            const changed = () => {
                shadowRoot.getElementById("impact-notice").textContent = "The page changed. Review the updated matches and click Block again.";
            };
            if (!sameImpact(previous, reviewed)) { changed(); return; }
            if (reviewed.requiresConfirmation) {
                const accepted = window.confirm(`These rules will hide ${reviewed.total} elements. Broad rules may hide content you did not select. Save these rules?`);
                if (!accepted) return;
                updateSelectionControls();
                if (!sameImpact(reviewed, currentImpact)) { changed(); return; }
            }
            saveInFlight = true;
            const button = shadowRoot.getElementById("confirm-btn");
            shadowRoot.getElementById("undo-btn").disabled = true;
            shadowRoot.getElementById("precision-mode").disabled = true;
            button.disabled = true; button.textContent = "Saving…";
            try {
                await saveSelectors(reviewed.selectors);
                stopPicker();
            } catch (err) {
                console.error("[GlassVeil] Error saving/applying rules:", err);
                if (shadowRoot) {
                    shadowRoot.getElementById("undo-btn").disabled = !selection.canUndo;
                    shadowRoot.getElementById("precision-mode").disabled = false;
                    button.disabled = false; button.textContent = "Retry save";
                    shadowRoot.getElementById("impact-notice").textContent = "Could not save the rules. Please try again.";
                }
            } finally {
                saveInFlight = false;
            }
        };

        return Object.freeze({ start: startPicker, stop: stopPicker });
    };

    const api = Object.freeze({ createPicker });
    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    } else {
        root.GlassVeilPicker = root.GlassVeilPicker || api;
    }
})(globalThis);
