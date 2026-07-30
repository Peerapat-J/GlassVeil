# GlassVeil - Personal Element Blocker

GlassVeil is a personal cosmetic element-blocking Chrome extension that lets you manually select and hide unwanted page elements such as banners, overlays, sticky boxes, sidebars, and other distracting interface components.

Instead of relying on a predefined filter list, GlassVeil provides a visual element picker. Select one or more elements on the current website, preview the result, confirm the block, and GlassVeil saves CSS selectors for that domain.

## Features

- Visual element picker for selecting one or more page elements
- Cosmetic blocking using locally stored CSS selectors
- Per-site blocking rules
- Enable or disable blocking for the current site
- View, delete, and reset saved rules from the popup
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
6. Optionally use:
   - **Select Parent** to target a larger container
   - **Preview Hide** to test the selected elements before saving
7. Click **Block Selected**.

<img src="readmeAsset/previewHide.png" alt="GlassVeil Preview Hide control" width="420">

The selectors are saved for the current domain and applied immediately.

<img src="readmeAsset/blockList_v1.png" alt="GlassVeil saved rules list" width="420">

### Toggle blocking for a site

Use the switch in the popup to enable or disable all GlassVeil rules for the current website.

### Delete a saved rule

Open the popup and click the delete icon next to the saved selector.

### Reset all rules for a site

Click **Reset Site Rules** in the popup to remove all saved rules for the current domain.

### Use the keyboard shortcut

Start the element picker with:

- macOS: `Command + B`
- Windows/Linux: `Ctrl + B`

The shortcut can be changed at `chrome://extensions/shortcuts`.

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

Some websites frequently change their HTML structure or generated class names. In those cases, a previously saved selector may stop matching or may require adjustment.

## Privacy

GlassVeil stores rules and site settings locally in your browser using `chrome.storage.local`.

It does not require an account, does not send saved rules to a server, and does not download a remote filter list.
