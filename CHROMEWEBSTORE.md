# Chrome Web Store Listing - GlassVeil - Personal Element Blocker

> Last Updated: 2026-07-31

## Store Listing

**Extension Name** [REQUIRED]
GlassVeil - Personal Element Blocker

**Short Description** [REQUIRED]
A private cosmetic element blocker. Visually select and hide unwanted banners, overlays, sidebars, and distracting page elements.

**Detailed Description** [REQUIRED]
GlassVeil - Personal Element Blocker is a lightweight cosmetic filtering tool for cleaning up websites manually. When a page contains an unwanted banner, floating overlay, sticky panel, sidebar widget, or other distracting interface element, GlassVeil lets you select it visually and save a local CSS-based hiding rule.

Key Features:
- Visual Element Picker: Open the picker, hover over page elements, and select one or more targets.
- Multi-Select Workflow: Select several unwanted elements and block them together in one session.
- Parent Selection: Move from the selected element to its parent container when a larger wrapper should be hidden.
- Preview Hide: Test the current selection before saving rules.
- Per-Site Controls: Enable or disable GlassVeil for the current website and inspect or delete saved rules.
- Early Cosmetic Application: Apply locally saved rules near the start of page loading to reduce visible flashing.
- Local Privacy: Store rules and site settings only in Chrome extension storage.

How to Use:
1. Navigate to a website containing an element you want to hide.
2. Click the GlassVeil icon and choose "Pick Element to Block", use the keyboard shortcut, or select "Block element on this page" from the context menu.
3. Move the pointer to inspect page elements.
4. Click one or more unwanted elements. Click a selected element again to remove it from the selection.
5. Use "Select Parent" or "Preview Hide" when needed.
6. Click "Block Selected" to save and apply the rules.
7. Open the popup at any time to delete rules or disable GlassVeil for the current site.

Privacy Note:
GlassVeil is designed for local use. Saved selectors, hostname settings, and toggle preferences remain in `chrome.storage.local`. GlassVeil does not require an account and does not send saved rules to a server.

Important Limitation:
GlassVeil performs cosmetic element blocking. It hides matching page elements but does not prevent their network requests from loading.

Support/Feedback Info:
For issues, questions, or rule resets, please contact the developer through the support homepage.

**Category** [REQUIRED]
Productivity

**Single Purpose** [REQUIRED]
Allows users to visually select and hide specific unwanted elements on web pages using locally stored cosmetic rules.

**Primary Language** [REQUIRED]
English

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon [REQUIRED] | 128 x 128 PNG | Ready | icons/icon-128.png |
| Screenshot 1 [REQUIRED] | 1280 x 800 or 640 x 400 | Not created | |
| Screenshot 2 [RECOMMENDED] | 1280 x 800 or 640 x 400 | Not created | |
| Small Promo Tile [RECOMMENDED] | 440 x 280 | Not created | |

### Screenshot Notes
- Screenshot 1: Show the visual element picker on a mock page, including selected elements and the floating picker panel.
- Screenshot 2: Show the popup with the current-site toggle and saved selector list.

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| `storage` | permissions | Save and retrieve user-created rules and per-site toggle states locally. |
| `activeTab` | permissions | Interact with the active tab when the user launches the picker. |
| `scripting` | permissions | Inject picker scripts and styles when needed. |
| `contextMenus` | permissions | Add the "Block element on this page" action to the browser context menu. |
| `http://*/*`, `https://*/*` | host_permissions | Run the content script on normal websites so locally saved rules can be applied. |

## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** No

### Data Use Certification
- [x] Data is not sold to third parties.
- [x] Data is not used for purposes unrelated to the extension's core functionality.
- [x] Data is not used for creditworthiness or lending purposes.

## Privacy Policy

**Privacy Policy URL** [RECOMMENDED]
https://github.com/Peerapat-J/GlassVeil/blob/main/PRIVACY.md

## Distribution

**Visibility**: Public
**Regions**: All regions
**Pricing**: Free

## Developer Info

**Publisher Name** [REQUIRED]
Peerapat J.

**Contact Email** [REQUIRED]
peerapat.j@example.com

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 1.0.0 | 2026-06-06 | Initial release of the visual cosmetic element-blocking workflow. | Draft |

## Review Notes

### Known Issues / Limitations
- GlassVeil cannot inject scripts or hide elements on restricted browser pages such as `chrome://` pages or the Chrome Web Store.
- Websites that frequently change their DOM structure or generated class names may require saved selectors to be adjusted.
- GlassVeil hides elements cosmetically and does not block their underlying network requests.
