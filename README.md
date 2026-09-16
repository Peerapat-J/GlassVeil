# GlassVeil - Personal Element Blocker

GlassVeil is a personal cosmetic element-blocking Chrome extension that lets you manually select and hide unwanted page elements such as advertise banners, overlays, sticky boxes, sidebars, and other distracting interface components.

Instead of relying only on predefined filter list or advertise blocker extension which on some site these ads banners will not be filtered out.

GlassVeil provides a visual element picker. Select one or more elements on the current website, preview the result, confirm the block, and GlassVeil saves CSS selectors for that domain.

## Features

- Visual element picker for selecting one or more page elements
- Exact element and Similar elements modes with stable selector candidates
- Cosmetic blocking using locally stored CSS selectors
- Per-site blocking rules
- Enable or disable blocking for the current site
- Enable, disable, edit, and delete individual rules
- Reset saved rules for the current website
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

## Usage

### keyboard shortcut

Start the element picker with:

- macOS: `Command + B`
- Windows/Linux: `Ctrl + B`

The popup shows the currently configured shortcut, or **Not set** if none is assigned. Change it through the **gear button** beside the status badge or `chrome://extensions/shortcuts`. The version badge beside the app name comes from the installed extension manifest.

### Block page elements

1. Open the website containing an element you want to hide.
2. Click the extension icon.
3. Click **Pick Element to Block**.

<img width="360" height="235" alt="image" src="https://github.com/user-attachments/assets/328647d1-d266-4e14-bb07-1ae6be906aa1" />

4. Hover over a page element to inspect it.
5. Click one or more elements to select them. Click a selected element again to remove it from the current selection.
6. Keep **Exact element** to target each selected element individually, or choose **Similar elements** to preview a shared rule. This choice applies to all current selections. Optionally use:
   - **Select Parent** to target a larger container
   - **Undo** (Cmd+Z on macOS, Ctrl+Z on Windows/Linux) to reverse a selection, deselection, or Select Parent
   - **Preview Hide** to test all matching elements before saving; available from the start. Your on/off choice is remembered across pages and picker sessions until you change it. Closing the picker still restores unsaved preview changes.
   - **Refresh matches** after the page changes
7. Review each selector and the unique total. Amber outlines mark additional elements that would be hidden. Click **Block** to save. Confirmation is required only for matches outside selected elements and their descendants; the warning states how many extra elements will be hidden. Selecting 10 or more elements alone does not trigger a warning.

Drag any non-interactive panel background to reposition the picker. Buttons, inputs, precision options and the scrollable match list keep their normal behavior.

<img width="524" height="350" alt="image" src="https://github.com/user-attachments/assets/ea4e88bf-124a-44cb-a866-e3ff78cfd2e5" />

The selectors are saved for the current domain and applied immediately.

<img width="362" height="478" alt="image" src="https://github.com/user-attachments/assets/a848f88f-7013-4346-b782-dd4bb3bec2d6" />

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

## Installation

### Load as an unpacked extension

1. Download or clone this repository:
2. Open Chrome or another Chromium-based browser.
3. Go to:
   ```text
   chrome://extensions
   ```
4. Enable **Developer mode**.
5. Click **Load unpacked**.
6. Select the project folder.
7. The extension icon should appear in the browser toolbar.
<img width="422" height="226" alt="image" src="https://github.com/user-attachments/assets/0bac79ee-581f-497c-a9c4-07ffd929a6da" />
