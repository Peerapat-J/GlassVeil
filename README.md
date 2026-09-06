# GlassVeil - Personal Element Blocker

GlassVeil is a personal cosmetic element-blocking Chrome extension that lets you manually select and hide unwanted page elements such as banners, overlays, sticky boxes, sidebars, and other distracting interface components.

Instead of relying on a predefined filter list, GlassVeil provides a visual element picker. Select one or more elements on the current website, preview the result, confirm the block, and GlassVeil saves CSS selectors for that domain.

## Features

- Visual element picker for selecting one or more page elements
- Undo picker selections with the Undo button or Cmd/Ctrl+Z
- Exact element and Similar elements modes with stable selector candidates
- Per-selector match counts, combined impact preview, and confirmation for broad rules
- Cosmetic blocking using locally stored CSS selectors
- Per-site blocking rules
- Enable or disable blocking for the current site
- Enable, disable, edit, test, and delete individual rules
- Match counts and invalid-selector diagnostics in the popup
- Reset saved rules for the current website
- Undo a rule deletion or site reset within 30 seconds
- Clear unsupported-page messages and retry for connection errors
- Popup version and shortcut reflect the installed extension settings
- Default keyboard shortcut:
  - macOS: `Cmd + B`
  - Windows/Linux: `Ctrl + B`
- Customizable shortcut at:
  ```text
  chrome://extensions/shortcuts
  ```
- Context menu action: **Block element on this page**
- Shadow DOM picker interface to reduce conflicts with website styles
- Local-only storage using Chrome extension storage

## Installation

### Load as an unpacked extension

1. Download or clone this repository:
   ```text
   git clone https://github.com/Peerapat-J/GlassVeil.git
   ```
2. Open Chrome or another Chromium-based browser.
3. Go to:
   ```text
   chrome://extensions
   ```
4. Enable **Developer mode**.
5. Click **Load unpacked**.
6. Select the project folder.
7. The extension icon should appear in the browser toolbar.

## Usage

### Block page elements

1. Open the website containing an element you want to hide.
2. Click the extension icon.
3. Click **Pick Element to Block**.

<img src="readmeAsset/menu_v1.png" alt="GlassVeil Pick Element button" width="420">

4. Hover over a page element to inspect it.
5. Click one or more elements to select them. Click a selected element again to remove it from the current selection.
6. Keep **Exact element** to target each selected element individually, or choose **Similar elements** to preview a shared rule. This choice applies to all current selections. Optionally use:
   - **Select Parent** to target a larger container
   - **Undo** (Cmd+Z on macOS, Ctrl+Z on Windows/Linux) to reverse a selection, deselection, or Select Parent
   - **Preview Hide** to test all matching elements before saving; available from the start, so you can turn it on before selecting anything
   - **Refresh matches** after the page changes
7. Review each selector and the unique total. Amber outlines mark additional elements that would be hidden. Click **Block** to save; broad rules require another confirmation.

<img src="readmeAsset/previewHide.png" alt="GlassVeil Preview Hide control" width="420">

The selectors are saved for the current domain and applied immediately.

<img src="readmeAsset/blockList_v1.png" alt="GlassVeil saved rules list" width="420">

### Toggle blocking for a site

Use the switch in the popup to enable or disable all GlassVeil rules for the current website.

### Manage individual rules

Each saved rule has a small enable/disable toggle, with its current-page match count, **Edit**, and a trash icon on the next row. Turn a rule off and back on to compare its effect; it stays saved while disabled. The heading counts saved rules; each rule's match count tells you how many elements it matches on the current page. Invalid selectors are labeled, and **0 matches** means the rule does not match the current page.

**Edit** validates the new selector before saving and asks for confirmation when it matches several elements. Existing rules upgrade automatically to records with stable IDs; the original legacy storage is retained as a local rollback snapshot. See [storage and migration details](docs/architecture.md#structured-rules-and-migration-17--12).

### Delete a saved rule

Open the popup and click the **trash icon** next to the saved selector.

### Reset all rules for a site

Click **Reset Site Rules** in the popup to remove all saved rules for the current domain.

After deleting a rule or resetting a site, click **Undo** within 30 seconds while the popup stays open. It restores the original rules, order and enabled states. Another deletion replaces the previous Undo action; later changes to the same site prevent restoration so newer work stays intact. Closing the popup discards Undo. A failed restore can be retried before expiry.

### Use the keyboard shortcut

Start the element picker with:

- macOS: `Command + B`
- Windows/Linux: `Ctrl + B`

The popup shows the currently configured shortcut, or **Not set** if none is assigned. Change it through the **gear button** beside the status badge or `chrome://extensions/shortcuts`. The version badge beside the app name comes from the installed extension manifest.

## Permissions

GlassVeil uses the following permissions:

- `storage` - Save site rules and disabled-site settings locally.
- `activeTab` - Interact with the current active tab when the picker is launched.
- `scripting` - Inject the picker scripts when needed.
- `contextMenus` - Provide the right-click **Block element on this page** action.
- `http://*/*` and `https://*/*` host permissions - Apply locally saved rules on normal websites.

## Limitations

GlassVeil performs cosmetic element blocking. It hides matching elements from view but does not prevent their network requests from loading.

It cannot run on restricted browser pages such as:

```text
chrome://
edge://
about:
```

The popup disables site controls on unsupported pages while keeping the **gear button** available. If a normal website cannot be reached, it shows a connection error with **Retry**; refresh the page first. Missing tab details can also be retried.

Some websites frequently change their HTML structure or generated class names. In those cases, a previously saved selector may stop matching or may require adjustment.

## Privacy

GlassVeil stores rules and site settings locally in your browser using `chrome.storage.local`.

It does not require an account, does not send saved rules to a server, and does not download a remote filter list.

## Development workflow

- `dev` is the integration branch. Start short-lived feature or fix branches from an up-to-date `dev` and open pull requests back to `dev`.
- `main` is the release branch. Release reviewed work through a `dev` → `main` pull request.
- After a release, fast-forward `dev` to `main` when possible so release merge commits and documentation stay in sync. If both branches have new commits, review their differences and merge deliberately; do not force-push to synchronize them.
- Before switching branches, check `git status` and preserve any unfinished local work.

### Automated validation

Use Node.js 22 LTS, at least 22.22.2, as required by the DOM test environment. With nvm installed, run `nvm install` and `nvm use` from the repository root (`.nvmrc` selects the latest Node 22). Install the locked test dependencies with `npm ci --ignore-scripts`; no build step is needed to load the extension.

Run the same checks as CI:

```sh
npm ci --ignore-scripts
npm test
npm run check:syntax
npm run check:manifest
git fetch origin
git diff --check origin/dev...HEAD
git diff --check
git diff --cached --check
```

For a release PR, replace `origin/dev` with `origin/main`. The first diff checks committed PR changes; the other two check unstaged and staged changes locally.

GitHub Actions runs these validations on every pull request and on pushes to `dev` or `main`, using a read-only repository token. PR checks run against the proposed merge, and whitespace checks compare it with the PR base. Push checks compare the previous and new commits (or the empty tree for a newly created branch).

`npm test` includes the classic-script syntax gate and offline DOM tests. `check:syntax` compiles every `.js` file in `content`, `shared`, `popup`, and `background` as a classic script without executing it, so module-only syntax cannot slip through Node's module detection. `check:manifest` parses `manifest.json`. Add future linting, packaging, or browser checks as separate workflow steps with matching local commands.

See [Architecture and test coverage](docs/architecture.md) for module ownership, loading order, and the current selector/storage limitations.

### Browser validation

For changes affecting extension behavior, reload the unpacked extension at `chrome://extensions`, refresh a test page, and check:

- Select two elements and confirm both numbered outlines appear; deselect one and select it again.
- Drag the picker panel and confirm it stays within the viewport.
- Toggle Preview Hide on/off, then cancel and confirm the page is restored.
- Select and save elements, refresh the page, and confirm the saved rules still hide them.
- Disable and re-enable the site, then delete a rule and confirm the page updates immediately.
