// Classic-script module; instance state is owned by its factory.
(function (root) {
    "use strict";

    const createPickerUI = ({ document, window, shadowRoot, clampPanelPosition, onCancel, onSelectParent, onConfirm, onTogglePreview, onRefresh, onPrecisionChange, onUndo, iconUrl }) => {
        const style = document.createElement("style");
        style.textContent = `
            :host {
                all: initial;
                font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            }

            .picker-panel {
                --silver-light: #e8edf3;
                --silver-mid: #9ca3af;
                --silver-dark: #3b4250;
                --gradient-silver: linear-gradient(135deg, var(--silver-light) 0%, var(--silver-mid) 50%, var(--silver-dark) 100%);
                position: fixed;
                bottom: 24px;
                left: 50%;
                transform: translateX(-50%) translateY(100px);
                background: rgba(13, 16, 19, 0.85);
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
                max-width: calc(100vw - 32px);
            }

            .selected-outline-layer {
                position: fixed;
                inset: 0;
                width: 100vw;
                height: 100vh;
                pointer-events: none;
                z-index: 2147483646;
            }

            .selected-outline {
                position: fixed;
                box-sizing: border-box;
                border: 2px solid #00f2fe;
                border-radius: 4px;
                background: rgba(0, 242, 254, 0.06);
                box-shadow: 0 0 0 1px rgba(2, 8, 23, 0.75), 0 0 18px rgba(0, 242, 254, 0.75);
                pointer-events: none;
            }

            .selected-outline-label {
                position: absolute;
                top: -10px;
                left: -10px;
                min-width: 20px;
                height: 20px;
                padding: 0 6px;
                border-radius: 999px;
                background: #00f2fe;
                color: #020617;
                border: 1px solid rgba(255, 255, 255, 0.9);
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
                font-size: 11px;
                font-weight: 800;
                line-height: 18px;
                text-align: center;
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
                touch-action: none;
                gap: 16px;
            }

            .panel-header:active {
                cursor: grabbing;
            }

            .drag-hint {
                font-size: 10px;
                color: var(--silver-mid);
                letter-spacing: 0.3px;
                pointer-events: none;
                margin-left: 6px;
                border: 1px solid rgba(156, 163, 175, 0.3);
                border-radius: 999px;
                padding: 3px 7px;
                background: rgba(156, 163, 175, 0.08);
            }

            .title-area {
                display: flex;
                align-items: center;
                gap: 8px;
            }



            h3 {
                margin: 0;
                font-size: 14px;
                font-weight: 700;
                color: #ffffff;
                letter-spacing: 0.5px;
            }

            .selection-count {
                font-size: 11px;
                font-weight: 700;
                color: var(--silver-mid);
                background: rgba(156, 163, 175, 0.08);
                border: 1px solid rgba(156, 163, 175, 0.3);
                border-radius: 999px;
                padding: 3px 8px;
                white-space: nowrap;
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
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                font-family: inherit;
                line-height: 16px;
                padding: 8px 14px;
                border-radius: 8px;
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s ease;
                border: none;
                white-space: nowrap;
            }

            .btn-primary {
                background: linear-gradient(100deg, transparent 0%, rgba(13, 17, 23, 0.70) 25%, rgba(13, 17, 23, 0.72) 72%, transparent 100%), var(--gradient-silver);
                color: #ffffff;
                border: 1px solid var(--silver-mid);
                text-shadow: 0 1px 2px rgba(0, 0, 0, 0.65);
                box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.8), inset 0 -1px 1px rgba(232, 237, 243, 0.35), 0 4px 15px rgba(232, 237, 243, 0.16);
            }

            .btn-primary:hover {
                transform: translateY(-1px);
                box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.9), inset 0 -1px 1px rgba(232, 237, 243, 0.45), 0 6px 20px rgba(232, 237, 243, 0.24);
            }

            .btn-secondary {
                background: rgba(156, 163, 175, 0.08);
                color: var(--silver-light);
                border: 1px solid rgba(156, 163, 175, 0.24);
            }

            .btn-secondary:hover {
                background: rgba(156, 163, 175, 0.15);
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
                background: transparent;
                border: none;
                padding: 0;
                font-family: inherit;
                display: flex;
                align-items: center;
                gap: 6px;
                font-size: 11px;
                color: var(--silver-mid);
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
                background: #20d68a;
            }

            .toggle-container.checked .toggle-switch::after {
                transform: translateX(14px);
            }
        `;

        style.textContent += `
            .picker-panel { width: 500px; max-height: calc(100vh - 32px); overflow-y: auto; box-sizing: border-box; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
            .brand-icon { width: 28px; height: 28px; object-fit: contain; flex: 0 0 auto; }
            .drag-hint { white-space: nowrap; }
            .precision-row { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; }
            .precision-control { display: flex; gap: 8px; align-items: center; color: #dce4ee; font-size: 12px; }
            .precision-select { position: relative; }
            .precision-select::after { content: ""; position: absolute; right: 12px; top: 12px; width: 6px; height: 6px; border-right: 1.5px solid #94a3b8; border-bottom: 1.5px solid #94a3b8; transform: rotate(45deg); pointer-events: none; }
            #precision-mode { appearance: none; color-scheme: dark; padding-right: 30px; font-weight: 500; }
            .selection-actions { display: flex; gap: 8px; margin-left: auto; }
            .button-icon { width: 14px; height: 14px; flex: none; }
            .btn:focus-visible, .toggle-container:focus-visible { outline: 2px solid var(--silver-light); outline-offset: 2px; }
            .impact-outline { border-color: #ffcf70; box-shadow: 0 0 0 1px rgba(255,207,112,.35); }
            .impact-outline .selected-outline-label { background: #ffcf70; color: #171717; }
            #impact-section[hidden] { display: none; }
            #impact-section { font: 12px/1.45 system-ui, sans-serif; color: #dce4ee; }
            #impact-summary { margin: 0 0 6px; }
            .warning { color: #ffcf70; }
            #impact-list { list-style: none; padding: 6px 10px; margin: 0; max-height: 128px; overflow-y: auto; border: 1px solid rgba(148,163,184,.3); border-radius: 8px; background: rgba(2,6,23,.25); scrollbar-width: thin; scrollbar-color: #475569 transparent; }
            #impact-list li { display: flex; gap: 12px; justify-content: space-between; padding: 3px 0; }
            #impact-list code { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; }
            #impact-list span { flex: 0 0 auto; max-width: 55%; text-align: right; }
            #impact-notice { color: #ffcf70; margin: 6px 0 0; }
            #impact-refresh { font-weight: 500; }
            .btn:disabled, .toggle-container:disabled { opacity: .45; cursor: default; }
        `;

        const outlineLayer = document.createElement("div");
        outlineLayer.id = "selected-outline-layer";
        outlineLayer.className = "selected-outline-layer";

        const container = document.createElement("div");
        container.id = "glassveil-panel";
        container.className = "picker-panel";
        container.innerHTML = `
            <div class="panel-header" id="panel-drag-handle">
                <div class="title-area">
                    <img class="brand-icon" alt="" />
                    <h3>GlassVeil Picker</h3>
                    <span class="selection-count" id="selection-count">0 selected</span>
                    <span class="drag-hint">drag to move</span>
                </div>
                <span class="instruction" id="picker-instruction">Hover over elements and click to select</span>
            </div>
            <div class="precision-row">
                <label class="precision-control" for="precision-mode">Select
                    <span class="precision-select"><select class="btn btn-secondary" id="precision-mode">
                        <option value="exact">Exact element</option>
                        <option value="similar">Similar elements</option>
                    </select></span>
                </label>
                <div class="selection-actions">
                    <button class="btn btn-secondary" id="undo-btn" disabled title="Undo last selection action (Cmd+Z / Ctrl+Z)" aria-keyshortcuts="Meta+Z Control+Z"><svg class="button-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m9 14-5-5 5-5M4 9h10a6 6 0 0 1 0 12h-3"/></svg>Undo</button>
                    <button class="btn btn-secondary" id="impact-refresh" disabled>Refresh matches</button>
                </div>
            </div>
            <div class="selector-box">
                <input type="text" class="selector-input" id="selector-display" readonly placeholder="Hover element to inspect..." />
            </div>
            <section id="impact-section" hidden aria-label="Selector impact">
                <p id="impact-summary" role="status" aria-live="polite"></p>
                <ul id="impact-list"></ul>
                <p id="impact-notice" role="status" aria-live="polite"></p>
            </section>
            <div class="action-row">
                <div class="control-group">
                    <button class="btn btn-secondary btn-text" id="parent-btn" style="display: none;">Select Parent</button>
                    <button type="button" class="toggle-container" id="preview-toggle" role="switch" aria-checked="false">
                        <span class="toggle-switch" aria-hidden="true"></span>
                        <span>Preview Hide</span>
                    </button>
                </div>
                <div class="control-group">
                    <button class="btn btn-secondary" id="cancel-btn">Cancel</button>
                    <button class="btn btn-primary" id="confirm-btn" style="display: none;">Block Selected (0)</button>
                </div>
            </div>
        `;
        container.querySelector(".brand-icon").src = iconUrl;
        container.querySelector("#undo-btn").addEventListener("click", onUndo);
        container.querySelector("#precision-mode").addEventListener("change", event => onPrecisionChange(event.target.value));
        container.querySelector("#impact-refresh").addEventListener("click", onRefresh);

        shadowRoot.appendChild(style);
        shadowRoot.appendChild(outlineLayer);
        shadowRoot.appendChild(container);

        // Trigger sliding entry animation on next tick
        window.setTimeout(() => {
            container.classList.add("active");
        }, 10);

        // ── Drag-to-move logic ──────────────────────────────────────────
        const dragHandle = shadowRoot.getElementById("panel-drag-handle");
        let isDragging = false;
        let dragOffsetX = 0;
        let dragOffsetY = 0;

        const stopDragging = (e) => {
            if (!isDragging) return;
            isDragging = false;
            container.classList.remove("dragging");

            if (e.pointerId !== undefined && dragHandle.hasPointerCapture(e.pointerId)) {
                dragHandle.releasePointerCapture(e.pointerId);
            }
        };

        dragHandle.addEventListener("pointerdown", (e) => {
            // Only drag on left-button mouse input, while still supporting touch/stylus.
            if (e.pointerType === "mouse" && e.button !== 0) return;
            if (e.target.closest("button, input, a")) return;

            isDragging = true;

            // Convert panel to free (top/left) positioning on first drag
            const rect = container.getBoundingClientRect();
            container.classList.add("free", "dragging");
            container.style.top = rect.top + "px";
            container.style.left = rect.left + "px";

            dragOffsetX = e.clientX - rect.left;
            dragOffsetY = e.clientY - rect.top;

            dragHandle.setPointerCapture(e.pointerId);
            e.preventDefault();
            e.stopPropagation();
        });

        dragHandle.addEventListener("pointermove", (e) => {
            if (!isDragging) return;

            const position = clampPanelPosition({
                left: e.clientX - dragOffsetX,
                top: e.clientY - dragOffsetY,
                panelWidth: container.offsetWidth,
                panelHeight: container.offsetHeight,
                viewportWidth: window.innerWidth,
                viewportHeight: window.innerHeight
            });

            container.style.left = `${position.left}px`;
            container.style.top = `${position.top}px`;

            e.preventDefault();
            e.stopPropagation();
        });

        dragHandle.addEventListener("pointerup", stopDragging);
        dragHandle.addEventListener("pointercancel", stopDragging);
        dragHandle.addEventListener("lostpointercapture", stopDragging);
        // ── End drag logic ──────────────────────────────────────────────

        // Wire panel button listeners
        shadowRoot.getElementById("cancel-btn").addEventListener("click", (e) => {
            e.stopPropagation();
            onCancel();
        });

        shadowRoot.getElementById("parent-btn").addEventListener("click", onSelectParent);
        shadowRoot.getElementById("confirm-btn").addEventListener("click", onConfirm);

        const previewToggle = shadowRoot.getElementById("preview-toggle");
        previewToggle.addEventListener("click", onTogglePreview);
        return container;
    };

    const api = Object.freeze({ createPickerUI });
    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    } else {
        root.GlassVeilPickerUI = root.GlassVeilPickerUI || api;
    }
})(globalThis);
