// Owns the existing hostname -> string[] schema. Structured migration belongs to #17.
(function (root) {
    "use strict";

    const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value);
    const ownValue = (record, key) => isRecord(record) && Object.hasOwn(record, key) ? record[key] : undefined;
    const selectorsFor = (rules, hostname) => {
        const value = ownValue(rules, hostname);
        return Array.isArray(value) ? value.filter(selector => typeof selector === "string" && selector.trim()) : [];
    };

    const mergeUniqueSelectors = (existingSelectors = [], newSelectors = []) => {
        const merged = Array.isArray(existingSelectors) ? [...existingSelectors] : [];
        newSelectors.forEach(selector => {
            if (typeof selector !== "string") return;
            const trimmed = selector.trim();
            if (trimmed && !merged.includes(trimmed)) merged.push(trimmed);
        });
        return merged;
    };

    const createStorage = ({ area, changes }) => {
        const readSite = async hostname => {
            const { rules, disabledSites } = await area.get(["rules", "disabledSites"]);
            return { selectors: selectorsFor(rules, hostname), enabled: !ownValue(disabledSites, hostname) };
        };

        const appendSelectors = async (hostname, selectors) => {
            const { rules } = await area.get("rules");
            const existing = selectorsFor(rules, hostname);
            const merged = mergeUniqueSelectors(existing, selectors);
            if (merged.length !== existing.length) {
                await area.set({ rules: { ...(isRecord(rules) ? rules : {}), [hostname]: merged } });
            }
            return merged;
        };

        const deleteRule = async (hostname, index) => {
            const { rules } = await area.get("rules");
            const selectors = selectorsFor(rules, hostname);
            if (!Number.isInteger(index) || index < 0 || index >= selectors.length) return selectors;
            selectors.splice(index, 1);
            const nextRules = { ...(isRecord(rules) ? rules : {}), [hostname]: selectors };
            if (selectors.length === 0) delete nextRules[hostname];
            await area.set({ rules: nextRules });
            return selectors;
        };

        const resetSite = async hostname => {
            const { rules } = await area.get("rules");
            const nextRules = { ...(isRecord(rules) ? rules : {}) };
            delete nextRules[hostname];
            await area.set({ rules: nextRules });
        };

        const setEnabled = async (hostname, enabled) => {
            const { disabledSites } = await area.get("disabledSites");
            const nextDisabled = { ...(isRecord(disabledSites) ? disabledSites : {}), [hostname]: true };
            if (enabled) delete nextDisabled[hostname];
            await area.set({ disabledSites: nextDisabled });
        };

        const subscribe = callback => {
            const listener = (updates, areaName) => {
                if (areaName === "local" && (updates.rules || updates.disabledSites)) callback();
            };
            changes.addListener(listener);
            return () => changes.removeListener(listener);
        };

        return Object.freeze({ readSite, appendSelectors, deleteRule, resetSite, setEnabled, subscribe });
    };

    const api = Object.freeze({ createStorage, mergeUniqueSelectors });
    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    } else {
        root.GlassVeilStorage = root.GlassVeilStorage || api;
    }
})(globalThis);
