(function (root) {
    "use strict";
    const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value);
    const own = (value, key) => isRecord(value) && Object.hasOwn(value, key) ? value[key] : undefined;
    const mergeUniqueSelectors = (existing = [], incoming = []) => Array.from(new Set([...existing, ...incoming]
        .filter(value => typeof value === "string" && value.trim()).map(value => value.trim())));
    const methods = ["readSite", "readAll", "appendSelectors", "deleteRule", "updateRule", "resetSite", "setEnabled"];
    const createStorage = ({ area, changes, request, uuid = () => globalThis.crypto.randomUUID(), now = () => Date.now() }) => {
        let queue = Promise.resolve();
        const subscribe = callback => {
            const listener = (updates, areaName) => { if (areaName === "local" && updates.ruleStore) callback(); };
            changes.addListener(listener);
            return () => changes.removeListener(listener);
        };
        if (request) {
            return Object.freeze({ ...Object.fromEntries(methods.map(method => [method, async (...args) => {
                const result = await request({ type: "glassveil-storage", method, args });
                if (!result?.ok) throw new Error(result?.error || "Storage service unavailable");
                return result.value;
            }])), subscribe });
        }
        const migrate = data => {
            const rules = {}, usedIDs = new Set();
            let skipped = data.rules != null && !isRecord(data.rules) ? 1 : 0, duplicates = 0;
            for (const [hostname, entries] of Object.entries(isRecord(data.rules) ? data.rules : {})) {
                if (!Array.isArray(entries)) { skipped++; continue; }
                const seen = new Set(), records = [];
                for (const entry of entries) {
                    const selector = typeof entry === "string" ? entry.trim() : isRecord(entry) && typeof entry.selector === "string" ? entry.selector.trim() : "";
                    if (!selector || (isRecord(entry) && entry.scope != null && entry.scope !== "hostname")) { skipped++; continue; }
                    if (seen.has(selector)) { duplicates++; continue; }
                    seen.add(selector);
                    let id = typeof entry.id === "string" && entry.id.trim() ? entry.id : uuid();
                    while (usedIDs.has(id)) id = uuid();
                    usedIDs.add(id);
                    records.push({ id, selector, enabled: entry.enabled !== false,
                        createdAt: Number.isFinite(entry.createdAt) && entry.createdAt >= 0 ? entry.createdAt : now(),
                        sourceUrl: typeof entry.sourceUrl === "string" ? entry.sourceUrl : "", scope: "hostname" });
                }
                Object.defineProperty(rules, hostname, { value: records, enumerable: true, writable: true, configurable: true });
            }
            return { version: 1, rules, disabledSites: isRecord(data.disabledSites) ? data.disabledSites : {}, migration: { skipped, duplicates } };
        };
        const validate = store => {
            if (!isRecord(store) || store.version !== 1) throw new Error("Unsupported rule schema version. Data has not been changed.");
            if (!isRecord(store.rules) || !isRecord(store.disabledSites)) throw new Error("Rule storage is damaged. Restore a backup before editing.");
            return store;
        };
        const read = async () => {
            const data = await area.get(["ruleStore", "rules", "disabledSites"]);
            if (Object.hasOwn(data, "ruleStore")) return validate(data.ruleStore);
            const store = migrate(data);
            // Legacy keys remain untouched and form the rollback snapshot.
            await area.set({ ruleStore: store });
            return store;
        };
        const siteRules = (store, hostname) => {
            const entries = own(store.rules, hostname);
            return Array.isArray(entries) ? entries.filter(entry => isRecord(entry) && typeof entry.id === "string" && entry.id &&
                typeof entry.selector === "string" && entry.selector.trim() && typeof entry.enabled === "boolean" && entry.scope === "hostname" &&
                Number.isFinite(entry.createdAt) && entry.createdAt >= 0 && typeof entry.sourceUrl === "string") : [];
        };
        const site = (store, hostname) => {
            const rules = siteRules(store, hostname);
            return { rules, selectors: rules.filter(rule => rule.enabled).map(rule => rule.selector), enabled: !own(store.disabledSites, hostname), migration: store.migration || {} };
        };
        const setRules = (store, hostname, rules) => {
            const original = own(store.rules, hostname);
            if (original !== undefined && (!Array.isArray(original) || original.length !== siteRules(store, hostname).length)) {
                throw new Error("This site's stored records are damaged. Export local storage before restoring a backup.");
            }
            store.rules = { ...store.rules, [hostname]: rules };
            if (!rules.length) delete store.rules[hostname];
        };
        const operations = {
            readAll: async () => read(),
            readSite: async hostname => site(await read(), hostname),
            appendSelectors: async (hostname, selectors, sourceUrl = "") => {
                if (!Array.isArray(selectors) || typeof sourceUrl !== "string") throw new Error("Invalid rule input.");
                const store = await read(), rules = siteRules(store, hostname), seen = new Set(rules.map(rule => rule.selector));
                let changed = false;
                for (const selector of mergeUniqueSelectors([], selectors)) {
                    if (seen.has(selector)) continue;
                    seen.add(selector); changed = true;
                    rules.push({ id: uuid(), selector, enabled: true, createdAt: now(), sourceUrl, scope: "hostname" });
                }
                if (changed) { setRules(store, hostname, rules); await area.set({ ruleStore: store }); }
                return site(store, hostname);
            },
            updateRule: async (hostname, id, patch) => {
                const store = await read(), rules = siteRules(store, hostname), rule = rules.find(rule => rule.id === id);
                if (!rule) throw new Error("This rule no longer exists. Reload the controls.");
                if (Object.hasOwn(patch, "selector")) {
                    if (typeof patch.selector !== "string" || !patch.selector.trim()) throw new Error("A selector is required.");
                    const selector = patch.selector.trim();
                    if (rules.some(other => other.id !== id && other.selector === selector)) throw new Error("This selector is already saved.");
                    rule.selector = selector;
                }
                if (Object.hasOwn(patch, "enabled")) {
                    if (typeof patch.enabled !== "boolean") throw new Error("Invalid enabled state.");
                    rule.enabled = patch.enabled;
                }
                setRules(store, hostname, rules); await area.set({ ruleStore: store });
                return site(store, hostname);
            },
            deleteRule: async (hostname, id) => {
                const store = await read(), rules = siteRules(store, hostname);
                if (rules.some(rule => rule.id === id)) { setRules(store, hostname, rules.filter(rule => rule.id !== id)); await area.set({ ruleStore: store }); }
                return site(store, hostname);
            },
            resetSite: async hostname => { const store = await read(); setRules(store, hostname, []); await area.set({ ruleStore: store }); },
            setEnabled: async (hostname, enabled) => {
                if (typeof enabled !== "boolean") throw new Error("Invalid site state.");
                const store = await read(); store.disabledSites = { ...store.disabledSites, [hostname]: true };
                if (enabled) delete store.disabledSites[hostname];
                await area.set({ ruleStore: store });
            }
        };
        return Object.freeze({ ...Object.fromEntries(methods.map(method => [method, (...args) => {
            const task = queue.then(() => {
                if (method !== "readAll" && (typeof args[0] !== "string" || !args[0].trim())) throw new Error("A hostname is required.");
                return operations[method](...args);
            });
            queue = task.catch(() => {});
            return task;
        }])), subscribe });
    };
    const api = Object.freeze({ createStorage, mergeUniqueSelectors, methods });
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else root.GlassVeilStorage = root.GlassVeilStorage || api;
})(globalThis);
