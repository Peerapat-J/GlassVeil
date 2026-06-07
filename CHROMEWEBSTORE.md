# Chrome Web Store Listing — GlassVeil Ad Shield

> Last Updated: 2026-06-06

## Store Listing

**Extension Name** [REQUIRED]
GlassVeil Ad Shield

**Short Description** [REQUIRED]
A personal cosmetic ad blocker. Pick and hide annoying banners, overlays, and sidebars on any website with a single click.

**Detailed Description** [REQUIRED]
GlassVeil Ad Shield is a lightweight, customizable cosmetic filtering tool that empowers you to clean up your favorite websites. If standard ad blockers miss an annoying top banner, floating popup, or sidebar widget, GlassVeil lets you select and hide it permanently.

Key Features:
- Visual Element Picker: Click "Pick Element to Block", hover over any part of a webpage to see a glowing neon selection outline, and click to hide it instantly.
- Precision Selectors: Smart algorithm automatically generates robust, clean CSS selector paths that won't break when website classes change.
- Parent Selector adjustment: Easily walk up the element tree to block the entire ad wrapper container instead of just a single image.
- Live Preview mode: Toggle visibility before committing to a block rule.
- Quick Control Panel: Turn the blocker on or off for specific domains, and inspect or delete active rules in real-time.
- Zero Layout Flickering: Injects cosmetic rules at the very start of page loading, preventing elements from flashing before hiding.

How to Use:
1. Navigate to a website with a banner or element you want to hide.
2. Click the GlassVeil icon in your toolbar, then click "Pick Element to Block" (or right-click anywhere and choose "Block element on this page").
3. Move your mouse to highlight the unwanted element.
4. Click the element to lock it. Use "Select Parent" to expand the blocking area if needed.
5. Click "Block Element" to confirm. The element is now hidden and will stay hidden on all future visits.
6. Open the popup control panel at any time to remove rules or toggle blocking for the site.

Privacy Note:
GlassVeil is built for local privacy. All blocked element rules, hostname configurations, and toggle preferences are stored strictly inside your browser's local storage (chrome.storage.local). No data is collected, tracked, or transmitted off-device.

Support/Feedback Info:
For issues, questions, or rule resets, please contact the developer via the support homepage.

**Category** [REQUIRED]
Productivity

**Single Purpose** [REQUIRED]
Allows users to visually select and hide specific unwanted elements or banners on any web page.

**Primary Language** [REQUIRED]
English

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon [REQUIRED] | 128×128 PNG | ✅ Ready | icons/icon-128.png |
| Screenshot 1 [REQUIRED] | 1280×800 or 640×400 | ⬜ Not created | |
| Screenshot 2 [RECOMMENDED] | 1280×800 or 640×400 | ⬜ Not created | |
| Small Promo Tile [RECOMMENDED] | 440×280 | ⬜ Not created | |

### Screenshot Notes
- Screenshot 1: Shows the visual Element Picker mode in action on a mock news site, highlighting an ad banner with a neon cyan glowing border and the floating Shadow DOM panel at the bottom center.
- Screenshot 2: Shows the extension's popup control panel open on a website, displaying the toggles, status badge, and the list of active blocked selectors.

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| `storage` | permissions | Required to save and retrieve user-defined block rules and domain toggle states locally. |
| `activeTab` | permissions | Required to interact with the active browser tab when launching the element picker. |
| `scripting` | permissions | Required to programmatically inject the picker's content scripts and stylesheets. |
| `contextMenus` | permissions | Required to add the "Block element on this page" option to the browser right-click menu. |
| `http://*/*`, `https://*/*` | host_permissions | Required to run content scripts on pages loaded by the user to automatically hide blocked elements. |

## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** No

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

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
| 1.0.0 | 2026-06-06 | Initial release of visual cosmetic ad-blocking engine. | Draft |

## Review Notes

### Known Issues / Limitations
- Cannot inject scripts or hide elements on restricted browser pages (e.g. `chrome://` pages, Chrome Web Store).
- If a website completely randomizes its DOM structure (including tag hierarchy) on every load, static selectors might require manual updates.
