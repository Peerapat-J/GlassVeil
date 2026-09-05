# Architecture and test coverage

GlassVeil loads directly as a Manifest V3 extension. There is no bundle or build step. Test dependencies are development-only; they are not loaded by the extension.

## Module ownership

| File | Responsibility |
| --- | --- |
| `content/content.js` | The only content-script entry point: creates instances, loads site state, connects storage changes and runtime messages. |
| `shared/storage.js` | Shared popup/picker storage API, validation of the existing hostname-to-string-array schema, append/delete/reset/site-toggle operations and change subscription. Future schema migration belongs here. |
| `content/selector-generator.js` | Selector generation with explicit document, Node, CSS.escape and temporary-class dependencies. The existing ID/class/path algorithm is unchanged. |
| `content/selector-impact.js` | Evaluates each selection against the document, isolates invalid candidates, deduplicates matches, and compares reviewed element identities before save. |
| `content/rule-engine.js` | Owns one style element, early attachment, applying/clearing CSS and isolation of invalid selectors. |
| `content/picker-state.js` | Owns selection order and the active element for one picker; no DOM listeners or Chrome APIs. |
| `content/picker-utils.js` | Pure labels, position clamping and temporary-class classification. |
| `content/picker-ui.js` | Shadow DOM panel markup/styles and pointer dragging; accepts callbacks instead of saving rules itself. |
| `content/picker.js` | Picker lifecycle, page events, preview restoration, selection outlines and interaction between state and UI. Saving is an injected callback. |
| `popup/popup.js` | Current-site controls; delegates storage operations to the shared API. |

Definition-only modules publish frozen factory APIs in the extension's isolated world. Mutable state lives inside each factory instance, and collaborators are passed explicitly. CommonJS exports allow tests to load modules without running the extension.

`manifest.json` declares the module order and puts `content/content.js` last. Both fallback injection paths (popup and service worker) read that same list from the manifest. The popup loads `shared/storage.js` before its own script. Only the entry point registers Chrome listeners; its injection guard prevents a second engine or listener set. Picker start/stop separately manages page event listeners.

## Preserved behavior and narrow corrections

- Storage remains `rules[hostname] = string[]` plus `disabledSites[hostname]`. Reads do not migrate, rewrite or remove stored data. Invalid records are skipped when reading; writes affect the requested site and retain other sites.
- Selectors still use the existing stable-looking ID/class heuristics, sibling `:nth-child()` fallback and five-level path limit. Generated selector text is covered by fixtures together with target identity and match count.
- Rule application now parses selectors and CSS rules separately before joining valid CSS. A malformed selector or unterminated CSS comment cannot consume later valid rules. Empty/non-string entries are ignored and duplicate selectors produce one CSS rule.
- Removing a disconnected active selection now falls back to the remaining selection rather than retaining a detached active element.
- Preview hides the union of all valid selector matches and restores original inline display values and priorities. Cyan outlines identify selections; amber outlines show additional matches.

## Coverage and remaining feature work

Tests use Node's test runner, jsdom and CSS.escape against local fixtures. `npm test` needs no browser UI or network after `npm ci`. Tests exercise the actual modules plus bootstrap, popup storage actions and both dynamic injection callers.

| Area | Covered now | Future behavior |
| --- | --- | --- |
| Selectors | Stable/generated/duplicate IDs, stable/unstable/temporary classes, escaped characters, no ID/classes, mixed siblings, invalid ID candidate, disconnected elements and Shadow DOM limits. | Attribute candidate scoring and exact/similar modes in #16. Current attribute and broad-match behavior is characterized without adding these modes. |
| Rules | Site enabled/disabled, invalid isolation, empty/malformed/duplicate/overlapping rules, zero matches, CSS apply/clear and early attachment/cleanup. | Per-rule enabled state and diagnostics in #12 after #17. |
| Storage | Legacy string arrays, repeated read without migration, malformed input, duplicate append, exact hostname matching, delete/reset/toggle, preserved other-site data, change subscriptions and failed persistence. | Structured/versioned migration in #17; path/subdomain scope rules in #21. |
| Picker/loading | Selection order/active fallback, parent replacement, multi-select, preview/cancel, save, repeated initialization and complete fallback file order. | Undo action history in #13. |

The document selector engine does not pierce shadow roots. A disconnected or shadow-root target can yield a selector that does not match that target in the document. The five-level limit can match more than one similar element. Tests record these existing limitations; they do not claim exact blocking guarantees.

The shared storage API still uses Chrome storage read/modify/write operations. It does not introduce cross-tab transactions or undo conflict recovery; these remain considerations for #17/#20. Automated DOM checks do not simulate real layout or prove behavior on live websites.

## Browser checklist

1. Reload the unpacked extension at `chrome://extensions`, then refresh a page containing two known target elements and unrelated content.
2. Start the picker from the popup, context menu and configured shortcut. Confirm one panel appears each time; cancel between attempts.
3. Select two elements, check both numbered outlines, deselect/reselect one, and select a parent container.
4. Drag the panel to each viewport edge. Resize or scroll and confirm the panel/outlines track the page.
5. Toggle Preview Hide on/off, then cancel. Confirm content returns and temporary classes/outlines are removed.
6. Save two selections and reload the page. Confirm both are hidden and unrelated content stays visible.
7. Toggle the site off/on, delete one rule, then reset the site. Verify immediate updates and that rules for another hostname remain unchanged.
8. On a tab opened before reloading the extension, start the picker from the popup and context menu to exercise fallback injection. Confirm the complete module set loads and repeated activation does not duplicate panels.
9. With a disposable test profile, save an invalid selector alongside a valid selector. Confirm valid rules still hide their targets and no script exception prevents later updates.


## Selector impact policy (#15)

- Each selection reports a match count; the total is the union of all valid matches. Duplicate selectors are saved once.
- A selector matching more than one element, or a combined total of at least 10 elements, requires a separate confirmation.
- Invalid/empty selectors, zero matches, selectors that no longer match their selected target, and selectors covering the page/picker root cannot be saved. Other valid selections remain usable and the summary states how many selections will be skipped.
- Counts refresh on selection/deselection, parent selection, Preview Hide, Refresh matches, and immediately before saving. They are snapshots, not a continuous page observer. A change since the displayed snapshot requires another review; approval is also rechecked after the confirmation dialog. Equal counts with different element identities still invalidate the review.
- Cancelling, saving, deselecting or refreshing a changed selector clears obsolete preview overlays. A future Undo action (#13) should refresh selection controls through the same path.
- Saving errors keep the picker available for retry. No selector-generation or storage-schema changes are included.

The toolbar, popup and picker use the owner-selected artwork documented in `icons/source/README.md`.
