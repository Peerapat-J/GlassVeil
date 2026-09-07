# Approved GlassVeil artwork

`veiled-statue.png` is the exact 1254 × 1254 image supplied and selected by the owner on 2026-09-06: a classical statue with a translucent veil covering its eyes. It represents GlassVeil's "hide what distracts" direction.

Source SHA-256: `8c368b30bf5b779aac3d47d5e059414eb924f22ae5dc45a581c7579ca08446fc`.

The original artwork and its `icons/icon-*.png` exports remain preserved for the existing picker. `veiled-statue-rounded.png` is the edited toolbar/popup master: the outer black margins are removed and rounded corners have real alpha transparency. It was produced from the approved artwork with image editing.

Regenerate the rounded toolbar/popup exports with `python3 scripts/generate_icons.py` (macOS `sips`). These are separate `icons/icon-rounded-{16,32,48,128}.png` assets so the picker image stays unchanged.

Only the 32px picker image is exposed as a web-accessible resource, using a session-specific dynamic URL. The full source artwork is not exposed to webpages.
