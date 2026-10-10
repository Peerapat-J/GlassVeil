// Reserve capture order at content-script initialization, before page handlers.
(function (root) {
    "use strict";

    const createPickerInput = ({ window, document, onHover, onSelect, onKeyDown }) => {
        let session = null;
        let lastPoint = null;
        let lastHover = null;
        let pressed = false;
        let finishingPress = false;
        const activationEvents = ["pointerdown", "pointerup", "pointercancel", "mousedown", "mouseup",
            "click", "auxclick", "dblclick", "contextmenu", "dragstart"];
        const movementEvents = ["pointermove", "mousemove", "mouseover", "mouseout"];
        const isDown = event => event.type === "pointerdown" || event.type === "mousedown";
        const cancel = event => { event.preventDefault(); event.stopImmediatePropagation(); };

        const hover = element => {
            if (element === lastHover) return;
            lastHover = element;
            onHover(element);
        };

        const hitTest = (x, y) => {
            if (!session) return null;
            const { shield, pickerRoot } = session;
            // Synchronous hit testing does not dispatch input or click the page.
            shield.style.pointerEvents = "none";
            let element;
            try { element = document.elementFromPoint(x, y); }
            finally { shield.style.pointerEvents = "auto"; }
            return element && element !== document.body && element !== document.documentElement &&
                !pickerRoot.contains(element) && element.getRootNode() === document ? element : null;
        };

        const targetFor = event => {
            const { pickerRoot } = session;
            if (event.composedPath().includes(pickerRoot)) {
                lastPoint = { x: event.clientX, y: event.clientY };
                return hitTest(lastPoint.x, lastPoint.y);
            }
            // Also intercept direct page events (e.g. keyboard-generated clicks).
            const element = event.target;
            return element?.nodeType === 1 && element !== document.body && element !== document.documentElement &&
                element.getRootNode() === document ? element : null;
        };

        const scrollUnderPointer = event => {
            let element = targetFor(event);
            // The shield is the wheel target, so the browser cannot discover a
            // nested page scroller itself. Scroll that container without replaying
            // the wheel into page JavaScript; leave viewport scrolling native.
            while (element && element !== document.body && element !== document.documentElement) {
                const style = window.getComputedStyle(element);
                const line = parseFloat(style.lineHeight) || 16;
                const dx = event.deltaX * (event.deltaMode === 1 ? line : event.deltaMode === 2 ? element.clientWidth : 1);
                const dy = event.deltaY * (event.deltaMode === 1 ? line : event.deltaMode === 2 ? element.clientHeight : 1);
                const canY = /^(auto|scroll|overlay)$/.test(style.overflowY || style.overflow) &&
                    (dy > 0 ? element.scrollTop + element.clientHeight < element.scrollHeight : dy < 0 && element.scrollTop > 0);
                const minX = style.direction === "rtl" ? element.clientWidth - element.scrollWidth : 0;
                const maxX = style.direction === "rtl" ? 0 : element.scrollWidth - element.clientWidth;
                const canX = /^(auto|scroll|overlay)$/.test(style.overflowX || style.overflow) &&
                    (dx > 0 ? element.scrollLeft < maxX : dx < 0 && element.scrollLeft > minX);
                if (canX || canY) {
                    event.preventDefault();
                    if (canX) element.scrollLeft += dx;
                    if (canY) element.scrollTop += dy;
                    return;
                }
                if ((dy && /^(contain|none)$/.test(style.overscrollBehaviorY || style.overscrollBehavior)) ||
                    (dx && /^(contain|none)$/.test(style.overscrollBehaviorX || style.overscrollBehavior))) {
                    event.preventDefault(); return;
                }
                element = element.parentElement;
            }
        };

        const guard = event => {
            if (!session) {
                if (!finishingPress) return;
                // Escape/cancel during a held press must not release a click into the page.
                if (isDown(event)) { finishingPress = false; pressed = false; return; }
                if (!activationEvents.includes(event.type)) return;
                cancel(event);
                if (["click", "auxclick", "pointercancel"].includes(event.type)) finishingPress = false;
                return;
            }
            if (event.type === "keydown") { onKeyDown(event); return; }
            if (event.composedPath().includes(session.pickerPanel)) {
                if (isDown(event)) pressed = true;
                if (["pointerup", "mouseup", "pointercancel", "click", "auxclick"].includes(event.type)) pressed = false;
                lastPoint = null;
                hover(null);
                return;
            }
            if (event.type === "wheel") {
                event.stopImmediatePropagation();
                if (event.composedPath().includes(session.pickerRoot)) scrollUnderPointer(event);
                return;
            }
            if (movementEvents.includes(event.type)) {
                event.stopImmediatePropagation();
                if (event.type === "mouseout" && !event.relatedTarget) {
                    lastPoint = null; hover(null);
                } else if (event.type !== "mouseout") hover(targetFor(event));
                return;
            }
            cancel(event);
            if (isDown(event)) pressed = true;
            if (["pointerup", "mouseup", "pointercancel", "click", "auxclick"].includes(event.type)) pressed = false;
            if (event.type === "click" && event.button === 0 && event.detail < 2) {
                const element = targetFor(event);
                if (element) onSelect(element);
                lastHover = null;
            }
        };

        // These guards stay dormant outside a session. Removing and readding them
        // would let later window capture listeners run first on the next session.
        for (const type of [...activationEvents, ...movementEvents, "wheel", "keydown"]) {
            window.addEventListener(type, guard, { capture: true, passive: false });
        }

        const activeModal = () => {
            let modals;
            try { modals = Array.from(document.querySelectorAll("dialog:modal")); }
            catch { return null; /* Older selector engines. */ }
            if (modals.length < 2) return modals[0] || null;
            const containingModal = element => {
                for (; element; element = element.parentElement) if (modals.includes(element)) return element;
                return null;
            };
            // Only the topmost modal's subtree can hold focus. DOM order does
            // not tell us which dialog was shown most recently.
            const focused = containingModal(document.activeElement);
            if (focused) return focused;
            // Focus can be absent (e.g. after blur). The native hit test sees the
            // active dialog or its backdrop and skips inert older dialogs.
            const points = [[window.innerWidth / 2, window.innerHeight / 2], ...modals.map(dialog => {
                const rect = dialog.getBoundingClientRect();
                return [(rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2];
            })];
            for (const [x, y] of points) {
                if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) continue;
                const modal = containingModal(document.elementFromPoint(x, y));
                if (modal) return modal;
            }
            return null;
        };

        const start = ({ pickerRoot, shadowRoot, pickerPanel }) => {
            pressed = false; finishingPress = false; lastPoint = null; lastHover = null;
            // A top-layer popover outside a modal dialog is still inert. Mount
            // inside the active modal (or fullscreen element) before showing it.
            const mount = activeModal() || document.fullscreenElement || document.body;
            mount.appendChild(pickerRoot);
            const styles = {
                position: "fixed", inset: "0", width: "100vw", height: "100vh", margin: "0", padding: "0",
                border: "0", background: "transparent", overflow: "visible", display: "block",
                "pointer-events": "none", "z-index": "2147483647"
            };
            for (const [name, value] of Object.entries(styles)) pickerRoot.style.setProperty(name, value, "important");
            const style = document.createElement("style");
            style.textContent = `
                :host::backdrop { background: transparent; pointer-events: none; }
                .picker-input-shield { position: fixed; inset: 0; z-index: 2147483645;
                    pointer-events: auto; cursor: crosshair; touch-action: pan-y; }
            `;
            const shield = document.createElement("div");
            shield.className = "picker-input-shield";
            shield.setAttribute("aria-hidden", "true");
            shadowRoot.prepend(style, shield);
            session = { pickerRoot, pickerPanel, shield };
            // A manual popover puts selection above existing dialogs/popovers without
            // making the page inert, which would prevent underlying hit testing.
            if (typeof pickerRoot.showPopover === "function") {
                pickerRoot.setAttribute("popover", "manual");
                try { pickerRoot.showPopover(); }
                catch { pickerRoot.removeAttribute("popover"); }
            }
            // UI target handlers still run; their bubbling events stay inside our root.
            for (const type of activationEvents) pickerRoot.addEventListener(type, event => event.stopPropagation());
        };

        const stop = () => {
            finishingPress = pressed;
            session = null; lastPoint = null; lastHover = null; pressed = false;
        };
        const refreshHover = () => {
            if (session && lastPoint) hover(hitTest(lastPoint.x, lastPoint.y));
        };
        return Object.freeze({ start, stop, refreshHover });
    };

    const api = Object.freeze({ createPickerInput });
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else root.GlassVeilPickerInput = api;
})(globalThis);
