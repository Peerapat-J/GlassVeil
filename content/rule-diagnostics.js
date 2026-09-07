(function (root) {
    "use strict";
    const createDiagnostics = ({ document, window, ruleEngine }) => {
        let overlay = null, timer = null, frame = null, targets = [];
        const stop = () => {
            if (timer !== null) window.clearTimeout(timer);
            if (frame !== null) window.cancelAnimationFrame(frame);
            timer = frame = null; targets = [];
            overlay?.remove(); overlay = null;
            ruleEngine.resume();
        };
        const inspect = selector => {
            try {
                if (typeof selector !== "string" || !selector.trim()) throw new Error("Empty selector");
                const sheet = new window.CSSStyleSheet(); sheet.insertRule(`${selector} { display:none !important; }`, 0);
                const matches = Array.from(document.querySelectorAll(selector));
                return { status: matches.length ? "valid" : "zero", count: matches.length, matches };
            } catch { return { status: "invalid", count: 0, matches: [] }; }
        };
        const describe = rules => (Array.isArray(rules) ? rules : []).map(rule => {
            const { status, count } = inspect(rule?.selector);
            return { id: rule?.id, status, count };
        });
        const test = selector => {
            stop();
            const result = inspect(selector);
            if (result.status !== "valid") return { status: result.status, count: result.count };
            targets = result.matches;
            ruleEngine.suspend();
            overlay = document.createElement("glassveil-rule-preview");
            const shadow = overlay.attachShadow({ mode: "closed" });
            const style = document.createElement("style");
            style.textContent = ':host{position:fixed;inset:0;pointer-events:none;z-index:2147483647} .box{position:fixed;border:2px solid #ffcf70;background:#ffcf701a;box-sizing:border-box} .notice{position:fixed;top:12px;right:12px;background:#151821;color:white;padding:12px;border:1px solid #ffcf70;border-radius:8px;font:13px system-ui;pointer-events:auto} button{margin-left:12px;cursor:pointer}';
            const notice = document.createElement("div"); notice.className = "notice";
            notice.textContent = `Testing ${result.count} ${result.count === 1 ? "match" : "matches"}. Blocking paused for 5 seconds.`;
            const close = document.createElement("button"); close.textContent = "Done"; close.addEventListener("click", stop); notice.appendChild(close);
            const boxes = targets.map(() => { const box = document.createElement("div"); box.className = "box"; shadow.appendChild(box); return box; });
            shadow.append(style, notice); document.documentElement.appendChild(overlay);
            const draw = () => {
                targets.forEach((element, index) => {
                    const rect = element.getBoundingClientRect(), box = boxes[index];
                    Object.assign(box.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, display: element.isConnected && rect.width && rect.height ? "block" : "none" });
                });
                frame = window.requestAnimationFrame(draw);
            };
            draw(); timer = window.setTimeout(stop, 5000);
            return { status: result.status, count: result.count };
        };
        window.addEventListener?.("pagehide", stop);
        return Object.freeze({ describe, test, stop });
    };
    const api = Object.freeze({ createDiagnostics });
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else root.GlassVeilRuleDiagnostics = api;
})(globalThis);
