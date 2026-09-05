// Classic-script module; instance state is owned by its factory.
(function (root) {
    "use strict";

    const pickerStateClasses = new Set([
        "glassveil-picker-hovered",
        "glassveil-picker-selected"
    ]);

    const isPickerStateClass = (className) => pickerStateClasses.has(className);

    const formatSelectedOutlineLabel = (selectedIndex) => `${selectedIndex + 1}`;

    const clampPanelPosition = ({
        left,
        top,
        panelWidth,
        panelHeight,
        viewportWidth,
        viewportHeight
    }) => {
        const maxLeft = Math.max(0, viewportWidth - panelWidth);
        const maxTop = Math.max(0, viewportHeight - panelHeight);

        return {
            left: Math.max(0, Math.min(left, maxLeft)),
            top: Math.max(0, Math.min(top, maxTop))
        };
    };

    const formatConfirmButtonLabel = (selectedCount) => `Block Selected (${selectedCount})`;

    const formatSelectionSummary = (selectedCount, activeSelector = "") => {
        if (selectedCount === 0) return "";
        if (selectedCount === 1) return activeSelector || "1 element selected";
        return `${selectedCount} elements selected`;
    };

    const api = Object.freeze({ isPickerStateClass, formatSelectedOutlineLabel, clampPanelPosition, formatConfirmButtonLabel, formatSelectionSummary });
    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    } else {
        root.GlassVeilPickerUtils = root.GlassVeilPickerUtils || api;
    }
})(globalThis);
