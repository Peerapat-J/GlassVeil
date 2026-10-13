<div align="center">
  <img src="icons/source/veiled-statue-rounded.png" width="144" alt="GlassVeil logo">

  <h1>GlassVeil</h1>

  <p><strong>Personal Element Blocker</strong></p>
  <p><i>Pick what distracts you. Preview it. Hide it.</i></p>

  <p>
    <a href="manifest.json"><img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FPeerapat-J%2FGlassVeil%2Fmain%2Fmanifest.json&amp;query=%24.version&amp;prefix=v&amp;label=version&amp;style=flat&amp;logo=github&amp;logoColor=white&amp;color=22d3ee" alt="Extension version"></a>
    <a href="#installation"><img src="https://img.shields.io/badge/Platform-Chrome%20%7C%20Chromium-8b5cf6?style=flat&amp;logo=googlechrome&amp;logoColor=white" alt="Platform: Chrome and Chromium"></a>
    <a href="manifest.json"><img src="https://img.shields.io/badge/Manifest-V3-2563eb?style=flat&amp;logo=googlechrome&amp;logoColor=white" alt="Manifest V3"></a>
    <a href="#tech-stack"><img src="https://img.shields.io/badge/JavaScript-Vanilla-f7df1e?style=flat&amp;logo=javascript&amp;logoColor=black" alt="Vanilla JavaScript"></a>
    <a href="#privacy"><img src="https://img.shields.io/badge/Storage-Local%20only-10b981?style=flat" alt="Local-only rule storage"></a>
    <a href="https://github.com/Peerapat-J/GlassVeil/actions/workflows/validate.yml"><img src="https://img.shields.io/github/actions/workflow/status/Peerapat-J/GlassVeil/validate.yml?branch=main&amp;label=CI&amp;style=flat&amp;logo=githubactions&amp;logoColor=white" alt="Extension validation on main"></a>
  </p>

  <p>
    <a href="https://github.com/Peerapat-J/GlassVeil/archive/refs/heads/main.zip"><img src="https://img.shields.io/badge/Download-Source-24292f?style=for-the-badge&amp;logo=github&amp;logoColor=white" alt="Download source ZIP"></a>
    &nbsp;
    <a href="https://github.com/Peerapat-J/GlassVeil/issues"><img src="https://img.shields.io/badge/Report%20a%20bug-Issues-475569?style=for-the-badge&amp;logo=github&amp;logoColor=white" alt="Report a bug on GitHub"></a>
  </p>

  <p>
    <a href="#features">Features</a> &middot;
    <a href="#installation">Installation</a> &middot;
    <a href="#usage">Usage</a> &middot;
    <a href="#privacy">Privacy</a> &middot;
    <a href="#development">Development</a>
  </p>
</div>

---

GlassVeil is a Chrome extension that lets you visually select and hide unwanted banners, overlays, sticky boxes, sidebars, and other distracting page elements.

When a filter list misses something, pick the element yourself. Preview the result, confirm the block, and GlassVeil saves a CSS selector for that website. Your saved rules are applied again when you revisit it.

**You choose what disappears. Your rules stay on your device.**

GlassVeil performs **cosmetic blocking**: it hides page elements without blocking their underlying network requests.

## Features

- **Visual element picker** — Select one or more elements directly on the page.
- **Exact or similar elements** — Hide a specific element or preview a shared rule for matching elements.
- **Preview before saving** — Check what will disappear, including additional matches.
- **Selection controls** — Select a parent container, undo changes, refresh matches, and drag the picker panel.
- **Per-site rules** — Enable or disable blocking for the current website.
- **Rule management** — Enable, disable, edit, delete, or reset saved rules.
- **Quick access** — Launch from the popup, the context menu, or a customizable keyboard shortcut.
- **Local storage** — Keep rules and site settings in Chrome extension storage.
- **Isolated picker UI** — Shadow DOM helps protect the picker from conflicting website styles.


## Usage

### Keyboard shortcut

Start the element picker with:

- macOS: `Command + B`
- Windows/Linux: `Ctrl + B`

The popup shows the currently configured shortcut, or **Not set** if none is assigned. Change it through the **gear button** beside the status badge or `chrome://extensions/shortcuts`. The version badge beside the app name comes from the installed extension manifest.

### Block page elements

1. Open the website containing an element you want to hide.
2. Click the extension icon.
3. Click **Pick Element to Block**.

<img width="360" height="235" alt="GlassVeil popup with the Pick Element to Block action" src="https://github.com/user-attachments/assets/328647d1-d266-4e14-bb07-1ae6be906aa1" />

4. Hover over a page element to inspect it.
5. Click one or more elements to select them. Click a selected element again to remove it from the current selection.
6. Keep **Exact element** to target each selected element individually, or choose **Similar elements** to preview a shared rule. This choice applies to all current selections. Optionally use:
   - **Select Parent** to target a larger container
   - **Undo** (Cmd+Z on macOS, Ctrl+Z on Windows/Linux) to reverse a selection, deselection, or Select Parent
   - **Preview Hide** to test all matching elements before saving; available from the start. Your on/off choice is remembered across pages and picker sessions until you change it. Closing the picker still restores unsaved preview changes.
   - **Refresh matches** after the page changes
7. Review each selector and the unique total. Amber outlines mark additional elements that would be hidden. Click **Block** to save. Confirmation is required only for matches outside selected elements and their descendants; the warning states how many extra elements will be hidden. Selecting 10 or more elements alone does not trigger a warning.

Drag any non-interactive panel background to reposition the picker. Buttons, inputs, precision options and the scrollable match list keep their normal behavior.

While the picker is active, a transparent layer receives page clicks so links and ads are selected instead of activated. An ad inside an iframe is selected as the whole iframe container. Cancel or Escape restores normal page interaction. After reloading the extension, refresh the website before testing so the input guards initialize before page handlers.

<img width="524" height="350" alt="GlassVeil element picker and selection controls" src="https://github.com/user-attachments/assets/ea4e88bf-124a-44cb-a866-e3ff78cfd2e5" />

The selectors are saved for the current domain and applied immediately.

<img width="362" height="478" alt="GlassVeil popup showing saved rules for the current website" src="https://github.com/user-attachments/assets/a848f88f-7013-4346-b782-dd4bb3bec2d6" />

## Privacy

Saved rules, site settings, and the Preview Hide preference are stored locally in `chrome.storage.local`. GlassVeil does not require an account or send saved rules to a server.

## Permissions

GlassVeil uses the following permissions:

- `storage` - Save site rules and disabled-site settings locally.
- `activeTab` - Interact with the current active tab when the picker is launched.
- `scripting` - Inject the picker scripts when needed.
- `contextMenus` - Provide the right-click **Block element on this page** action.
- `http://*/*` and `https://*/*` host permissions - Apply locally saved rules on normal websites.

## Limitations

GlassVeil hides matching elements from view. Their network requests can still load.

It cannot run on restricted browser pages such as:

```text
chrome://
edge://
about:
```

The popup disables site controls on unsupported pages while keeping the **gear button** available.
If a normal website cannot be reached, it shows a connection error with **Retry**; refresh the page first. Missing tab details can also be retried.

Some websites frequently change their HTML structure or generated class names. In those cases, a previously saved selector may stop matching or may require adjustment.

## Installation

For a local test page with clickable ads, iframe containers and page event counters, see [the picker testing guide](docs/issue-45-picker-input.md).

### Load as an unpacked extension

1. [Download the source ZIP](https://github.com/Peerapat-J/GlassVeil/archive/refs/heads/main.zip) and extract it, or clone the repository:
   ```sh
   git clone https://github.com/Peerapat-J/GlassVeil.git
   ```
2. Open Chrome or another Chromium-based browser.
3. Go to:
   ```text
   chrome://extensions
   ```
4. Enable **Developer mode**.
5. Click **Load unpacked**.
6. Select the extracted or cloned **GlassVeil** folder containing `manifest.json`.
7. The extension icon should appear in the browser toolbar.

No build step is required to load the extension. Node.js and npm are only needed for development checks.

<img width="422" height="226" alt="GlassVeil installed as an unpacked browser extension" src="https://github.com/user-attachments/assets/0bac79ee-581f-497c-a9c4-07ffd929a6da" />

## Tech stack

| Layer | Technology |
| --- | --- |
| Extension platform | Chrome Extensions API · Manifest V3 |
| Interface | HTML · CSS · Vanilla JavaScript · Shadow DOM |
| Blocking rules | CSS selectors · Local extension storage |
| Development checks | Node.js test runner · jsdom · GitHub Actions |

## Development

Use the Node.js version specified in `.nvmrc`, then install the development dependencies and run the checks:

```sh
npm ci --ignore-scripts
npm test
npm run check:manifest
```

For the local browser test fixture:

```sh
npm run test:browser
```

See the [architecture and test coverage](docs/architecture.md) and [picker testing guide](docs/issue-45-picker-input.md) for details.

## Feedback

Found a bug or have an idea? [Open an issue](https://github.com/Peerapat-J/GlassVeil/issues) with the steps to reproduce it, your browser version, and a screenshot when helpful.
