// Classic-script module; instance state is owned by its factory.
(function (root) {
    "use strict";

    const createPicker = ({ window, document, generateSelector, saveSelectors, utils, createSelectionState, createPickerUI }) => {
        const { formatSelectedOutlineLabel, clampPanelPosition, formatConfirmButtonLabel, formatSelectionSummary } = utils;
        let isPickerActive = false;
        let hoveredElement = null;
        const selection = createSelectionState();
        const previewedElements = new Map();
        const selectedOutlineBoxes = new Map();
        let outlineUpdateFrame = null;

        // UI container references
        let pickerRoot = null;
        let shadowRoot = null;
        let pickerPanel = null;

        const getOutlineLayer = () => shadowRoot ? shadowRoot.getElementById("selected-outline-layer") : null;

        const clearSelectedOutlines = () => {
            selectedOutlineBoxes.forEach((outlineBox) => outlineBox.remove());
            selectedOutlineBoxes.clear();

            if (outlineUpdateFrame !== null) {
                window.cancelAnimationFrame(outlineUpdateFrame);
                outlineUpdateFrame = null;
            }
        };

        const syncSelectedOutlines = () => {
            const outlineLayer = getOutlineLayer();
            if (!outlineLayer) return;

            Array.from(selection).forEach((element) => {
                if (!element.isConnected) {
                    selection.delete(element);
                    selectedOutlineBoxes.get(element)?.remove();
                    selectedOutlineBoxes.delete(element);
                }
            });

            selectedOutlineBoxes.forEach((outlineBox, element) => {
                if (!selection.has(element)) {
                    outlineBox.remove();
                    selectedOutlineBoxes.delete(element);
                }
            });

            Array.from(selection).forEach((element, index) => {
                let outlineBox = selectedOutlineBoxes.get(element);
                if (!outlineBox) {
                    outlineBox = document.createElement("div");
                    outlineBox.className = "selected-outline";

                    const outlineLabel = document.createElement("span");
                    outlineLabel.className = "selected-outline-label";
                    outlineBox.appendChild(outlineLabel);

                    outlineLayer.appendChild(outlineBox);
                    selectedOutlineBoxes.set(element, outlineBox);
                }

                const rect = element.getBoundingClientRect();
                const isVisible = rect.width > 0 &&
                    rect.height > 0 &&
                    rect.bottom > 0 &&
                    rect.right > 0 &&
                    rect.top < window.innerHeight &&
                    rect.left < window.innerWidth;

                if (!isVisible) {
                    outlineBox.style.display = "none";
                    return;
                }

                const left = Math.max(0, rect.left);
                const top = Math.max(0, rect.top);
                const right = Math.min(window.innerWidth, rect.right);
                const bottom = Math.min(window.innerHeight, rect.bottom);

                outlineBox.style.display = "block";
                outlineBox.style.left = `${left}px`;
                outlineBox.style.top = `${top}px`;
                outlineBox.style.width = `${Math.max(0, right - left)}px`;
                outlineBox.style.height = `${Math.max(0, bottom - top)}px`;

                const outlineLabel = outlineBox.querySelector(".selected-outline-label");
                if (outlineLabel) {
                    outlineLabel.textContent = formatSelectedOutlineLabel(index);
                }
            });
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
            if (originalDisplay !== "") {
                element.style.display = originalDisplay;
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

            previewedElements.set(element, element.style.display);
            element.style.setProperty("display", "none", "important");
        };

        const isPreviewEnabled = () => {
            const toggle = shadowRoot ? shadowRoot.getElementById("preview-toggle") : null;
            return Boolean(toggle && toggle.classList.contains("checked"));
        };

        const applyPreviewToSelection = () => {
            selection.forEach(previewElement);

            Array.from(previewedElements.keys()).forEach((element) => {
                if (!selection.has(element)) {
                    restorePreviewForElement(element);
                }
            });
        };

        const updateSelectionControls = () => {
            if (!shadowRoot) return;

            const selectedCount = selection.size;
            const hasSelection = selectedCount > 0;
            const activeSelector = selection.active ? generateSelector(selection.active) : "";

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
                    previewToggle.classList.remove("checked");
                    restorePreview();
                }
            }

            if (confirmBtn) {
                confirmBtn.style.display = hasSelection ? "block" : "none";
                confirmBtn.textContent = formatConfirmButtonLabel(selectedCount);
            }

            syncSelectedOutlines();
        };

        const startPicker = () => {
            if (isPickerActive) return;
            isPickerActive = true;
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
                document, window, shadowRoot, clampPanelPosition,
                onCancel: stopPicker,
                onSelectParent: handleSelectParent,
                onConfirm: handleConfirmBlock,
                onTogglePreview: handleTogglePreview
            });

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
            const selector = generateSelector(hoveredElement);
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

                if (isPreviewEnabled()) {
                    previewElement(targetElement);
                }
            }

            updateSelectionControls();
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
            if (!selection.active) return;

            const currentElement = selection.active;
            const parent = currentElement.parentElement;
            if (!parent || parent === document.body || parent === document.documentElement) {
                window.alert("Cannot select parent any further.");
                return;
            }

            selection.delete(currentElement);
            currentElement.classList.remove("glassveil-picker-hovered", "glassveil-picker-selected");
            restorePreviewForElement(currentElement);

            // Set parent as the new selected element
            selection.add(parent);
            parent.classList.remove("glassveil-picker-hovered");
            parent.classList.add("glassveil-picker-selected");

            if (isPreviewEnabled()) {
                previewElement(parent);
            }

            updateSelectionControls();
        };

        const handleTogglePreview = (e) => {
            e.stopPropagation();
            if (selection.size === 0) return;

            const toggle = shadowRoot.getElementById("preview-toggle");
            const isChecked = toggle.classList.toggle("checked");

            if (isChecked) {
                applyPreviewToSelection();
            } else {
                restorePreview();
            }

            syncSelectedOutlines();
        };

        const handleConfirmBlock = async (e) => {
            e.stopPropagation();
            if (selection.size === 0) return;

            const selectedSelectors = Array.from(selection)
                .map(generateSelector)
                .filter(Boolean);

            if (selectedSelectors.length === 0) return;

            console.log("[GlassVeil] Confirming block for selectors:", selectedSelectors);

            try {
                await saveSelectors(selectedSelectors);
            } catch (err) {
                console.error("[GlassVeil] Error saving/applying rules:", err);
            }

            // Clean up picker and stop
            stopPicker();
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
