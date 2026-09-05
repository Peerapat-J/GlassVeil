(function (root) {
    "use strict";
    // getAll returns the active binding, not the manifest's suggested key.
    const formatShortcut = (shortcut, os) => {
        if (typeof shortcut !== "string" || !shortcut.trim()) return "Not set";
        const parts = shortcut.trim().split("+").map(part => part.trim());
        if (os !== "mac") return parts.join(" + ");
        const modifiers = { Command: "⌘", Cmd: "⌘", Ctrl: "⌃", Control: "⌃", MacCtrl: "⌃", Alt: "⌥", Option: "⌥", Shift: "⇧" };
        return parts.map(part => modifiers[part] || part).join("");
    };
    const readMetadata = async chrome => {
        const version = chrome.runtime.getManifest().version;
        const [commands, platform] = await Promise.allSettled([
            Promise.resolve().then(() => chrome.commands.getAll()),
            Promise.resolve().then(() => chrome.runtime.getPlatformInfo())
        ]);
        const shortcut = commands.status === "fulfilled"
            ? formatShortcut(commands.value.find(command => command.name === "toggle-picker")?.shortcut, platform.value?.os)
            : "Unavailable";
        return { version, shortcut };
    };
    const api = Object.freeze({ formatShortcut, readMetadata });
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else root.GlassVeilMetadata = api;
})(globalThis);
