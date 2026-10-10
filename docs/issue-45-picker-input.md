# Testing picker input isolation (#45)

The picker receives page pointer interaction on a transparent crosshair surface and uses synchronous document hit testing to choose the element underneath. Links and iframe ads should be selected without activating the page. An iframe is selected as one container, including when its content comes from another origin.

## Load this branch in Chrome

1. Open `chrome://extensions` and enable Developer mode.
2. Choose **Load unpacked** and select `/Users/peerapatj/myProject/GlassVeil`. If already loaded from this folder, click **Reload** on its extension card.
3. Refresh the website after reloading the extension. This initializes the capture guards at `document_start`, before the website registers its own handlers.
4. Start from the extension popup, configured shortcut (normally Cmd+B on macOS), or the **Block element on this page** context menu action.
5. Click an unwanted object. It should appear in the picker selection without opening a link/tab or running the object's action. Use Preview Hide, then Block to save; Cancel/Escape restores unsaved preview changes.

No build or ZIP is needed. Chrome reads the files from this checkout, so switching branches changes the code that the next extension reload will load.

## Controlled fixture

Run from the repository:

```sh
npm run test:browser
```

Open <http://127.0.0.1:8765/> in the browser where the unpacked extension is installed. The server binds only to loopback on ports 8765 and 8766 and serves an explicit file allowlist. Stop it with Ctrl+C in the terminal that started it.

Choose a target scenario, reset the counters, then start the **extension's** picker. Cancel before changing scenarios. During target selection, all four Page activity counters should remain zero and no `#activated` navigation should occur. Cancel and click normally as a positive control: the counters should increase. Refresh/reset before the next run. Saving a fixture rule uses real extension storage for `127.0.0.1`; delete those test rules from the popup afterward so they do not affect later localhost pages.

Scenarios include an ordinary link with nested text, an action button, same-origin and cross-origin iframe ads, a page overlay at maximum z-index, an ad with inline important CSS, a nested CSS scroll container, and a native modal dialog. In extension mode, select the modal scenario first and use the configured shortcut or toolbar popup to start the picker while the dialog is open.

For layout/input checks without installing the extension, open <http://127.0.0.1:8765/?demo=1> and click **Start demo picker**. This loads the actual picker/selector modules in the page; saving hides objects only in that tab and is cleared on refresh. The demo does **not** test isolated-world injection, Chrome storage, the popup, context-menu integration or extension reloads. Choosing the modal scenario automatically starts its demo picker because the page's start button becomes inert outside the dialog.

The standalone demo uses a document stylesheet, so it cannot validate blocking against inline important styles. Test the **Ad with inline important CSS** scenario with the real extension for saving/persistence; the demo can validate its independent selection frames.

## Manual checklist

- [ ] With the picker inactive, click the link/button and an iframe ad. Counters increase, confirming the fixture can detect page activation. Reset/refresh.
- [ ] Select the link's box and its nested text. Check the selection outline/selector, zero page counters, no navigation, and no new tab.
- [ ] Select the action button. Window/document capture handlers and the target's pointer/mouse handlers must remain silent.
- [ ] Select each iframe as a container, toggle Preview Hide, then Cancel. Its content receives no events and the iframe returns. Save separately and verify persistence with the real extension.
- [ ] Select the maximum-z-index overlay. It should not cover the picker or intercept the selection gesture.
- [ ] Open the modal scenario, select its button and toggle Preview Hide. The panel remains usable. Select Parent must report that the modal container cannot be saved because it contains the picker; Undo restores the valid button selection.
- [ ] Try middle/right clicks and a double click. Secondary clicks must not activate/select objects; a double click performs only its first selection toggle. Native page context menus are suppressed during selection.
- [ ] Select/deselect multiple objects; try Select Parent, Undo/Cmd+Z, Exact/Similar modes, Refresh matches and Preview Hide. Inputs retain native editing behavior.
- [ ] Drag the panel; scroll a real page with nested scroll regions, resize the window, and check outlines stay aligned. The shield scrolls a CSS scroll container underneath the pointer or allows native viewport scrolling; custom JavaScript wheel handlers are paused while picking.
- [ ] Hold a press on the page or panel, press Escape, then release. The release/click must not activate the page. A fresh mouse gesture afterward must work normally.
- [ ] Exit with Cancel, Escape and successful Block. Confirm the input surface disappears, previews restore as appropriate, and normal page actions work. Re-enter and repeat.
- [ ] Start from the popup, shortcut and context menu; reload the extension and page and repeat. Confirm one panel appears and fixture rules can be toggled/deleted normally.
- [ ] Retry the reported MangaClouds URL when reachable; record the exact ad target, browser/extension version and whether it is an iframe.

## Inline-important ad follow-up

The reported MangaClouds page was reachable on 2026-10-10. DOM inspection found the visible ad rows/containers use inline important display styles and inline `outline: initial !important` resets. These outrank the original document stylesheet and page-class highlights. This is a confirmed failure mechanism; it does not establish that every returning ad is caused by CSS rather than a changed selector or regenerated markup.

Saved rules now also use [Chrome scripting USER-origin CSS](https://developer.chrome.com/docs/extensions/reference/api/scripting#type-CSSInjection), which takes precedence over author inline important declarations. It applies to matching elements inserted later without modifying their inline styles. Hover/selection outlines draw in the picker shadow root; previewed selections keep a frame using geometry captured before hiding.

All 206 automated tests passed, including user-sheet replacement/removal, sender-document targeting, request rejection, rollback on API failure, ordered rule changes, save waiting/retry, inline-reset selection feedback and preview-frame scrolling/resizing. In the real standalone browser fixture, the inline-reset target had no page outline, while the independent hover and selection frames displayed at its full bounds; the selected frame retained those bounds after Preview Hide and page activity stayed zero. Cancel restored the ad. The USER-origin injection API and the follow-up Block/persistence behavior on MangaClouds still need real-extension QA.

After reloading the extension and refreshing the page:

1. On the fixture in **extension mode**, choose **Ad with inline important CSS**, then start picking. Hover must show a dashed cyan frame; selection must show a numbered frame. Repeat with Preview Hide on and off.
2. Save while Preview Hide is on. The panel must close and the ad must remain hidden. Click **Rewrite / replace protected ad**: the replacement with the same selector must stay hidden despite inline `display:flex !important`.
3. In the popup, disable the saved rule/site: the ad must return. Re-enable: it must hide. Delete the rule and verify it returns. Refresh the fixture and check the persisted enabled/disabled state; delete fixture-only localhost rules afterward.
4. Repeat on the left, right and bottom-right MangaClouds ads. If selecting one row hides only that row, use **Select Parent** and review the frame/match count to choose its container. Save, wait 20 seconds, scroll and refresh. Confirm the saved selector still matches if the site changes its ad markup.
5. Cancel/Escape an unsaved selection: original inline display and priority must return, frames must disappear, and ordinary page interaction must resume.

## Verification boundaries

Checked on 2026-10-10 with the standalone demo in a real browser: ordinary link selection, middle/double-click suppression, same-origin and cross-origin iframe selection, iframe Preview Hide/Cancel, modal-child selection and parent rejection, maximum-z-index overlay selection/save cleanup, panel dragging, nested scrolling (scrollTop advanced to 720), and Escape followed by a normal link click. Page/iframe activity counters remained zero while selecting; the normal click after Escape incremented window/document/target counters and navigated to `#activated` as the positive control.

The real unpacked-extension workflow (isolated-world listener ordering, popup/context-menu/shortcut integration and persistent rule storage), full held-press manual checks, and the reported MangaClouds page remain pending manual QA. The existing automated integration tests cover their DOM/storage/message logic, not actual Chrome extension UI.

`npm test` includes regression coverage for complete activation sequences, window/document capture ordering, hit-test delegation, iframe container selection, panel exemptions, keyboard handling, cancel/save cleanup and cancellation during a held press. jsdom mocks layout and popover behavior; it cannot establish real browser hit testing or extension-world ordering.

The input guards are installed once when the picker factory is created and remain dormant between sessions. Re-registering on each start would put them after the page's existing window listeners. Stopping releases the session's DOM references and removes its root/shield with the picker. If Escape interrupts a held press, the guard consumes that gesture's remaining release/click before allowing fresh interaction.

An extension injected into an already-loaded page cannot retroactively outrank earlier window capture listeners. Refresh the page after extension reload for this guarantee. The shield is a manual top-layer popover where available, with maximum-z-index fallback; it mounts inside an existing modal/fullscreen element to remain interactive. Rules that include an ancestor containing the picker are rejected so Preview Hide cannot hide the picker itself. Shadow-root contents and individual cross-origin iframe contents remain unsupported. General popup/redirect blocking outside a picker session belongs to #4.
