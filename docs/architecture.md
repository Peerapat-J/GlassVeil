# Architecture and test coverage

GlassVeil loads directly as a Manifest V3 extension. There is no bundle or build step. Test dependencies are development-only; they are not loaded by the extension.

## Module ownership

| File | Responsibility |
| --- | --- |
| `content/content.js` | The only content-script entry point: creates instances, loads site state, connects storage changes and runtime messages. |
| `shared/storage.js` | Versioned structured rule API, legacy migration, stable-ID mutations and worker-serialized access; subscribes to the authoritative ruleStore key. |
| `content/selector-generator.js` | Selector generation with explicit document, Node, CSS.escape and temporary-class dependencies. Generates, validates and deterministically scores ID/attribute/class/ancestor/positional candidates for exact or similar selection. |
| `content/selector-impact.js` | Evaluates each selection against the document, isolates invalid candidates, deduplicates matches, and compares reviewed element identities before save. |
| `content/rule-engine.js` | Applies enabled records, isolates invalid selectors, and suspends/resumes the latest rules during Test. |
| `content/rule-diagnostics.js` | Current-document match counts and a timed, dismissible highlight preview. |
| `content/picker-state.js` | Owns selection order, active element and session action-history snapshots; accepts an availability predicate, with no DOM listeners or Chrome APIs. |
| `content/picker-utils.js` | Pure labels, position clamping and temporary-class classification. |
| `content/picker-ui.js` | Shadow DOM panel markup/styles and pointer dragging; accepts callbacks instead of saving rules itself. |
| `content/picker.js` | Picker lifecycle, page events, preview restoration, selection outlines and interaction between state and UI. Saving is an injected callback. |
| `popup/popup.js` | Current-site controls, loading/unsupported/error states and retry; delegates storage and tab operations. |
| `shared/tab-access.js` | Shared popup/service-worker URL capability checks, current-tab verification and manifest-based fallback injection. |
| `popup/metadata.js` | Reads installed version, active command binding and platform; formats shortcut display without using suggested defaults. |

Definition-only modules publish frozen factory APIs in the extension's isolated world. Mutable state lives inside each factory instance, and collaborators are passed explicitly. CommonJS exports allow tests to load modules without running the extension.

`manifest.json` declares the module order and puts `content/content.js` last. Both popup and service worker use `shared/tab-access.js` to read the same JS/CSS lists from the manifest for fallback injection. The worker imports this helper with `importScripts`; it is not injected into webpages. The popup loads `shared/storage.js` before its own script. Only the entry point registers Chrome listeners; its injection guard prevents a second engine or listener set. Picker start/stop separately manages page event listeners.

## Preserved behavior and narrow corrections

- Storage now uses ruleStore version 1. Legacy rules/disabledSites keys remain unchanged as a rollback snapshot; migration and active mutations are owned by one service-worker queue.
- New selectors use the candidate policy below. Migration preserves the selector text rather than regenerating it from the current page.
- Rule application now parses selectors and CSS rules separately before joining valid CSS. A malformed selector or unterminated CSS comment cannot consume later valid rules. Empty/non-string entries are ignored and duplicate selectors produce one CSS rule.
- Removing a disconnected active selection now falls back to the remaining selection rather than retaining a detached active element.
- Preview hides the union of all valid selector matches and restores original inline display values and priorities. Cyan outlines identify selections; amber outlines show additional matches.

## Coverage and remaining feature work

Tests use Node's test runner, jsdom and CSS.escape against local fixtures. `npm test` needs no browser UI or network after `npm ci`. Tests exercise the actual modules plus bootstrap, popup storage actions and both dynamic injection callers.

| Area | Covered now | Future behavior |
| --- | --- | --- |
| Selectors | Stable/generated/duplicate IDs, stable/unstable/temporary classes, escaped characters, no ID/classes, mixed siblings, invalid ID candidate, disconnected elements and Shadow DOM limits. | Website-specific stability remains heuristic; shadow roots are unsupported. Exact/similar modes and candidate scoring are covered. |
| Rules | Site enabled/disabled, invalid isolation, empty/malformed/duplicate/overlapping rules, zero matches, CSS apply/clear and early attachment/cleanup. | Enabled records, invalid/zero-match diagnostics and temporary Test restoration are covered. |
| Storage | Legacy string migration, idempotent/restarted reads, malformed input, duplicate append, exact hostname matching, delete/reset/toggle, preserved other-site data, change subscriptions and failed persistence. | Versioned migration, serialized writes and stable-ID edits are covered; page/subdomain scopes remain #21. |
| Picker/loading | Selection order/active fallback, parent replacement, multi-select, preview/cancel, save, repeated initialization and complete fallback file order. | Undo history, parent/deselection restoration, disconnected-target filtering, keyboard/editable-field boundaries and preview cleanup are covered. |

The document selector engine does not pierce shadow roots. Disconnected, shadow-root, page-root and picker targets return no candidate. Exact mode returns only a selector that currently matches its target alone; this does not guarantee that a future website redesign preserves the selector.

Production popup and content scripts route storage calls to a single service-worker queue, so migration and mutations do not race across those clients. This is serialization within the extension, not a transaction against manual DevTools changes or other software. Persisted delete/reset recovery uses the guarded snapshot API described below. Automated DOM checks do not simulate real layout or prove behavior on live websites.

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
- Confirmation is required only when a selector matches elements outside all selected elements and their descendants. The number of selections alone does not require confirmation.
- Invalid/empty selectors, zero matches, selectors that no longer match their selected target, and selectors covering the page/picker root cannot be saved. Other valid selections remain usable and the summary states how many selections will be skipped.
- Counts refresh on selection/deselection, precision changes, parent selection, Preview Hide, Refresh matches, and immediately before saving. They are snapshots, not a continuous page observer. A change since the displayed snapshot requires another review; approval is also rechecked after the confirmation dialog. Equal counts with different element identities still invalidate the review.
- Cancelling, saving, deselecting, undoing or refreshing a changed selector clears obsolete preview overlays through the same selection-control refresh path.
- Saving errors keep the picker available for retry. Persistence uses the shared structured rule API.

The toolbar, popup and picker use the owner-selected artwork documented in `icons/source/README.md`.


## Selector candidate policy (#16)

- Exact element is the default for each picker session. Only candidates matching that target alone are eligible. Similar elements explicitly prefers a multi-match semantic candidate; without one it falls back to an exact candidate. Bare tags alone never broaden a similar selection. The choice applies to all current selections, refreshes outlines and preview, and is not persisted.
- Candidate sources: stable-looking IDs; allow-listed `data-testid`, `data-test`, `data-component`, `aria-label`, `role`, `name`, and `alt` attributes; tag/class singles, pairs and a combined class set; stable ancestor plus child descriptions; typed positional paths as a last resort. Values use `CSS.escape` and candidates must pass both document matching and CSS rule parsing.
- Base costs (lower is better): ID 0, attributes 20–26 in the listed order, class 40, class pair 42, combined classes 48, bare tag 80. Ancestor combinations add the two source costs plus 30 per ancestor level. Positional fallback starts at 1000 plus 30 per level. Selector length / 1000 breaks cost ties; lexical selector order breaks remaining ties. Exact eligibility takes priority over score. Similar mode ranks multi-match semantic candidates before single matches, then uses the same score.
- Token heuristics reject empty or over-80-character values; any GlassVeil token; temporary/session markers; `react-`, `vue-`, `ember`, `css-`, and `sc-` prefixes; four consecutive digits; eight hexadecimal characters; and mixed alphanumeric suffixes of at least six characters. Classes also reject underscores, over-25-character values, and hyphenated values with digits. This conservative policy may skip legitimate tokens and cannot detect every generated name.
- Work is bounded for semantic combinations: at most eight sorted classes, singles/pairs/full set, eight child descriptions and three anchors at each of six ancestor levels. Positional fallback extends until it uniquely matches the target, with no five-level truncation. There is no persistent cache because page changes must be revalidated before saving.
- Every candidate is checked against the target and document. Page roots and picker matches are excluded. `getCandidates()` exposes ranked candidate metadata for deterministic tests; the picker only needs the chosen selector string.

### Precision manual checks

1. Select one of two deeply repeated elements in Exact mode: only the clicked target should be outlined and hidden by Preview Hide.
2. Change to Similar elements: inspect the count and amber outlines; Preview Hide must include all matches. Switch back and verify extra elements return.
3. Save a similar rule: declining the confirmation must leave the page unchanged; accepting must persist the reviewed selector.
4. Select multiple targets and a parent, then change precision: counts, selection outlines and the preview must update together. A new picker session starts in Exact mode.
5. On a fixture with a stable `data-testid` or ancestor ID, insert an unrelated sibling: generated rules should still identify the same target without a positional step.


## Picker undo policy (#13)

- Each selection, deselection and Select Parent action records the previous ordered selection and active element in a separate history stack. Parent replacement is one action, even when the parent was already selected. No-op actions add no history.
- Undo restores the latest available snapshot. Detached targets, targets moved to another document, and targets moved into a shadow root are filtered out; no-op history is skipped. Checking history also releases unavailable references. Reinserted targets are not resurrected from previously discarded entries.
- The visible Undo button is disabled for empty history or while saving. Cmd+Z and Ctrl+Z use the same handler; Shift/Alt variants and composition are ignored. Input, textarea, select and contenteditable event paths keep their native behavior, including inside the picker shadow root. Escape still cancels.
- Undo refreshes selector impact using the current precision mode and current DOM, restores outdated preview styles and redraws outlines. Preview Hide remains armed even when the selection becomes empty, so undoing the last deselection can restore its preview. Its boolean preference is stored separately from rules in `chrome.storage.local` as `pickerPreviewEnabled` and loaded on each picker session across sites; closing the picker restores page styles without clearing the preference. Precision and preview toggles themselves are not history actions.
- Cancel, successful save and stop clear all selection history. A failed save retains it for recovery. Undo does not change previously saved rules or mutate persisted rules; one-time migration may run at page initialization. Persisted-rule recovery is a separate popup action described below.

### Undo manual checks

1. Select two targets, deselect the first, then Undo repeatedly: verify selection order/count, active selector and numbered outlines return correctly until Undo is disabled.
2. Select a child and Select Parent. Enable Preview Hide and Undo: the parent should return, the child should be selected/previewed, and unrelated siblings should remain visible in Exact mode.
3. In Similar mode, Undo selections with overlapping matches: verify amber outlines and deduplicated impact update, and undoing every selection restores all original inline display styles.
4. Try Cmd+Z and Ctrl+Z on page/picker buttons, then in input/textarea/contenteditable controls: picker history should change only outside editable controls. Shift+modifier+Z should not undo.
5. Remove a selected element with DevTools, then Undo: it must not reappear or leave stale preview/outline state. Repeat until no available history remains.
6. Cancel/restart and save/restart: Undo should be disabled in each new session and existing saved rules should remain intact.


## Popup metadata and page capability (#18 / #19)

- The header version badge reads `chrome.runtime.getManifest().version`. Shortcut display reads the `toggle-picker` entry from [`chrome.commands.getAll()`](https://developer.chrome.com/docs/extensions/reference/api/commands#method-getAll), which reports the active binding. It never falls back to the manifest suggestion. Unassigned/missing commands show Not set; query failure shows Unavailable without blocking site controls.
- [`chrome.runtime.getPlatformInfo()`](https://developer.chrome.com/docs/extensions/reference/api/runtime#method-getPlatformInfo) selects display formatting. macOS named modifiers become glyphs; native glyph strings remain intact. Windows/Linux use spaced plus signs. If platform lookup fails, preserve the returned binding as readable text. Ctrl from an active binding denotes Control; the manifest-only Ctrl-to-Command substitution is not reapplied.
- URL parsing is centralized. HTTP/HTTPS websites are eligible, except known Chrome Web Store URLs. Other schemes (browser-internal, extension, file, data, etc.) are unsupported. Missing/malformed URLs or inaccessible tabs are unavailable and retryable. Context menus are offered on HTTP/HTTPS documents and use the same checks before activation.
- Browser APIs may omit protected tab URLs without an activeTab grant. Opening popup.html as an ordinary tab does not invoke the extension action. A missing URL therefore shows Unavailable rather than guessing a scheme; a provided restricted URL shows Unsupported. See the [activeTab access model](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab). No new permissions are requested.
- Site controls start disabled, stay disabled on unsupported/unavailable pages, and never write an empty hostname entry. Rules are hidden there; version, shortcut display and the shortcut settings gear button remain available. There is no Rule Manager yet (#2).
- Before a site action, verify the tab still exists, has no pending navigation and retains its original URL. A changed page requires reloading controls. Failed communication on an eligible website attempts complete manifest-based JS/CSS injection once; failure shows a distinct connection error with Retry. URL eligibility cannot predict every browser policy or restricted document, so connection errors also explain that browser access may be restricted.
- Retry for a persisted delete/reset/toggle only resynchronizes from current storage. It never replays the destructive operation. Storage errors offer Reload controls. Retry uses the shared structured storage API; no destructive operation is replayed.

### Popup manual checks

1. On a normal website, verify the header version badge matches the installed manifest and the shortcut matches browser settings. Customize/unassign the shortcut, reopen the popup, and verify the new binding/Not set.
2. On chrome://settings, an extension page, and Chrome Web Store, verify an explicit unsupported message, disabled Pick/toggle/reset controls, hidden rules and a working shortcut settings gear button.
3. Simulate a missing/inaccessible tab or storage read failure: verify Unavailable and Retry can reload controls.
4. On an eligible website with a failed connection/injection, verify a connection error and Retry rather than an unsupported label. Restore access, retry and verify picker activation.
5. Reload the extension while a website remains open, then start the picker to exercise complete fallback injection.
6. Navigate the selected tab before acting on its popup: controls must refresh or disable before writing rules to an outdated site.
7. Cause communication to fail after deleting one rule, then retry: the remaining rule must not be deleted. Repeat for reset and toggle; verify storage and current-page blocking agree.


## Structured rules and migration (#17 / #12)

The authoritative key is `ruleStore = { version: 1, rules: { [hostname]: Rule[] }, disabledSites, migration: { skipped, duplicates } }`. Each rule contains `id`, `selector`, `enabled`, `createdAt` (milliseconds), `sourceUrl`, and `scope: "hostname"`. New picker saves capture their page URL; migrated strings have an empty sourceUrl because the original page was not recorded. Editing preserves ID and creation metadata. Disabled records remain stored and are excluded from generated blocking CSS.

All production calls use the runtime storage service in `background/service-worker.js`. It validates the extension sender/method, serializes reads that can migrate and all writes, and returns errors to the caller. Local factory execution is used by that service and DOM tests. Updates/deletes use stable IDs, never list positions; a stale delete cannot remove its next neighbor. Duplicate append does not re-enable an existing disabled rule. Duplicate edits reject.

On the first successful read, legacy nonempty selector strings and compatible mixed records are normalized. Exact duplicate selector text after trimming keeps the first record and its enabled state/order. Existing valid IDs/creation metadata are preserved; duplicate IDs get new IDs. Unsupported scopes, malformed entries and empty selectors are skipped and counted; malformed CSS text is retained as a record so the user can diagnose/edit it. Migration happens once; repeated/restarted clients read the same IDs. Future schema versions and damaged envelopes reject without writes. Malformed records in an already-versioned site are skipped on read; rule mutations for that damaged site reject rather than silently erasing those records. Unrelated sites remain usable. No page/subdomain scope is introduced.

The original `rules` and `disabledSites` keys remain untouched as the pre-migration rollback snapshot. Active edits, deletes, reset and toggles only affect ruleStore; restarting never resurrects the legacy rules. For rollback, first export **all** local extension storage from extension DevTools, then remove only ruleStore and reload the extension to migrate the original snapshot again. That returns to pre-migration rules and does not include later edits. Keep the full export if those edits need recovery. An older extension version reads the preserved legacy keys. No automatic rollback overwrites newer work.

The popup reads current-page diagnostics via content messages. Invalid selectors are isolated from other rows and from CSS application; zero matches is distinct from invalid syntax. New selector edits are validated on the active page before persisting; multi-match edits require confirmation. Source data stays local. Counts are refreshed on opening and after mutations; reopening refreshes a page changed since the previous snapshot.

Test pauses cosmetic blocking in the active tab for five seconds and draws an amber rectangle for each matched element with a visible box. Done, pagehide, another Test, picker activation or diagnostics refresh clears the preview. The engine keeps accepting newer rule/settings updates while suspended; cleanup reapplies the latest state. Original inline styles are not changed. Site CSS, closed shadow roots and non-rendered elements limit visible outlines. Other tabs keep their normal blocking.

### Rule management manual checks

1. Before upgrading a disposable profile, save legacy selectors for two hostnames, including a duplicate and invalid selector. Upgrade/reload: verify ordering, usable rules, invalid labels and skipped-entry reporting. Inspect local storage to confirm original keys are unchanged and ruleStore IDs survive another restart.
2. Disable/re-enable one rule: its selector remains stored and other rules continue working. Verify every matching open tab updates and disabled state survives reload/restart.
3. Verify each row reports its current match count, Invalid selector or 0 matches; errors in one rule must not stop valid rules.
4. Test a hidden rule: matching elements are temporarily revealed and outlined, Done/timeout restores blocking. Change settings during the preview and verify the latest state wins on restoration.
5. Edit a selector: invalid syntax must stay in the editor with an error, duplicate text must reject, multi-match edits require confirmation, and a valid edit must preserve ID/enabled/creation metadata while updating the page.
6. Delete a rule, repeat a stale request, and reset the site: no neighboring/unrelated site's rule should disappear. Restart and verify removed rules are not restored from legacy backup.
7. Save a new picker selection: verify ID, enabled, creation time, source URL and hostname scope. Open two clients and save distinct rules concurrently; both should persist.
8. In a disposable profile, simulate a write failure or future schema version: errors must remain visible and existing data must not be replaced. Export all local storage before testing the rollback procedure above.


## Persisted rule recovery (#20)

Delete and reset persist immediately and return a recovery receipt with the original rule records, resulting site state, hostname, revision and 30-second deadline. The receipt lives only in the calling popup session; no recovery snapshot is written to storage. Reset offers Undo without a confirmation dialog. A later deletion/reset replaces the popup's previous receipt. Closing the popup or navigating its controls to another site discards it.

Every successful site mutation stores a fresh UUID in the optional `ruleStore.revisions[hostname]` map. `restoreRules` runs in the same worker queue as other writes, checks the deadline, revision, current site state and snapshot validity, then restores exact IDs, metadata, enabled flags and order. Restoration creates another revision, so a receipt works at most once. The persisted revision allows a still-open client to recover after worker suspension/restart. Migration schema version remains 1; revisions are additive metadata and legacy backups remain unchanged.

Any later mutation to the same site invalidates the old receipt, including an edit followed by an edit back to the original value. Unrelated sites and no-op stale deletes do not invalidate it. The state comparison also rejects direct storage edits that change current rules or site enabled state without updating the revision. Manual writes that deliberately preserve both state and revision are outside the extension's serialized API guarantees.

The popup removes Undo at expiry and after successful local edits/toggles. Cross-client conflicts are checked authoritatively on restoration and show an error without changing storage. Persistence failure retains the receipt for retry until its original deadline. Successful restore followed by a page-connection failure consumes Undo; Retry only reads and synchronizes current storage, never repeats a destructive write or restore. Storage events update other open pages through the existing content-script subscription.

### Recovery manual checks

1. Delete a rule in the middle of a list and Undo: verify original position, ID, selector, enabled flag, scope and creation metadata. Check other open tabs update.
2. Reset a site: no confirmation dialog, rules disappear immediately, Undo restores the entire list. Site enabled state and other sites remain unchanged.
3. Delete twice: Undo restores only the most recent deletion. Repeated clicks cannot apply the same receipt twice.
4. Leave the popup open for 30 seconds: Undo expires. Close/reopen sooner: the old Undo action is gone.
5. Delete, then edit/toggle/save a rule for the same site from another client: Undo must reject without replacing newer work. Repeat an edit and edit-back; it must still reject. Changes to a different site must not block Undo.
6. Simulate a restoration write failure: the deletion stays saved and Undo can retry before expiry. Simulate a connection failure after a successful restore: Retry must only synchronize, without another write.

Picker confirmation is based on unique matches outside selected elements and their descendants, with no total-count threshold. The warning, amber outlines and confirmation use that same additional-match set; review comparison also checks it for DOM hierarchy changes.
