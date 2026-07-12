# Chrome Web Store listing (copy-paste source)

Everything the Developer Dashboard asks for, in one place.

## Basics

| Field | Value |
|---|---|
| Name | Twitch Vertical Theater Chat |
| Category | Fun (alternative: Tools) |
| Language | English |
| Summary (max 132 chars) | Vertical Theater Mode for Twitch: video on top, chat below or above, in tall or narrow windows. Automatic and lightweight. |

## Description

```
Twitch's Theater Mode assumes a wide screen: video left, chat right. On a
portrait monitor, a snapped half-screen window, or any narrow window, that
leaves you with a tiny player and a cramped sliver of chat.

This extension fixes it. When you're watching a stream in Theater Mode and
the window is taller than it is wide (or narrower than a threshold you can
set), it rebuilds the layout the way a phone app would:

• The video spans the full window width at its natural 16:9 size
• Chat gets all the remaining vertical space, below or above the video
• Floating buttons let you swap chat position or hide it entirely
• Leave Theater Mode, widen the window, or go fullscreen, and Twitch's
  native layout returns instantly and untouched

Everything is automatic — there is nothing to click to activate it, and
nothing to clean up afterwards.

PRIVATE BY DESIGN
No analytics, no tracking, no network requests. The extension runs only on
twitch.tv and does nothing but rearrange the page you're already looking at.
Your four settings sync through your own browser profile.

SETTINGS (toolbar icon)
• Master on/off switch
• Chat below or above the video
• Show/hide chat
• Narrow-window threshold (default 820 px)

Not affiliated with Twitch Interactive. Open source (MIT):
https://github.com/Pineacles/twitch-vertical-theater-chat
```

## Privacy tab

| Question | Answer |
|---|---|
| Single purpose | Reformats Twitch's Theater Mode layout for vertical/narrow browser windows (video on top, chat below). |
| Permission justification: `storage` | Stores the user's four display preferences (enabled, chat position, chat visibility, width threshold) so they persist and sync across the user's own browser profile. |
| Host permission justification (`twitch.tv` content scripts) | The extension's single purpose is restyling Twitch's player page; it needs to run its content script and CSS there. It runs on no other site. |
| Remote code | None — all code is packaged. |
| Data collection | None. No user data is collected, stored remotely, or transmitted. |
| Privacy policy URL | https://github.com/Pineacles/twitch-vertical-theater-chat/blob/master/PRIVACY.md |

## Assets checklist

- [x] Icon 128×128 — `icons/icon-128.png`
- [ ] At least 1 screenshot, 1280×800 or 640×400 — capture a vertical window
      showing the layout (see `docs/screenshots/`)
- [ ] Optional: small promo tile 440×280

Screenshot recipe: load a live stream in a ~600×1000 window with the
extension on, Theater Mode enabled; screenshot the window, then pad it onto a
1280×800 canvas (`magick input.png -resize x760 -background '#0e0e10' -gravity
center -extent 1280x800 shot.png`).

## Trademark note

The listing name uses "Twitch" descriptively ("for Twitch"-style naming is
common and tolerated), the icon does not use the Twitch Glitch logo, and the
description states non-affiliation. If the review bot still objects to the
name, fall back to "Vertical Theater Chat for Twitch".
