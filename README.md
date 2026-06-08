# Twitch Vertical Theater Chat

A Chromium browser extension that moves Twitch chat below the video when Theater Mode is used in a vertical or narrow window.

## What it does

When all of the following are true:

- You are on a Twitch watch page
- Twitch Theater Mode is active
- The browser window is taller than it is wide, or narrower than 820px

…the extension repositions the player to fill the width of the window and places chat below it, using the leftover vertical space. Floating icon buttons let you swap chat between top and bottom, or hide chat entirely so the player can use the full viewport.

The extension also:

- Detects Twitch's collapsed chat state and mirrors it in the vertical layout
- Restores Twitch's native layout when fullscreen is entered, so player controls and hover behavior remain intact
- Restores Twitch's native layout when you exit Theater Mode, leave the watch page, or widen the window

## Install (developer mode)

The extension is not yet on the Chrome Web Store. To use it, load it as an unpacked extension in any Chromium-based browser (Chrome, Brave, Edge, Arc, Vivaldi, Opera, etc.):

1. Open your browser's extensions page:
   - Chrome: `chrome://extensions`
   - Brave: `brave://extensions`
   - Edge: `edge://extensions`
   - Other Chromium browsers: see their docs
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the folder containing this repository.
5. Open a Twitch stream, enable Theater Mode, and resize the window to be vertical or narrow.

A packaged store release is planned for a future version.

## Tuning

Default chat sizing is defined in `styles.css`:

```css
--tvtc-chat-height: 34dvh;
```

Increase or decrease the value to make chat taller or shorter.

## Compatibility

Requires a Chromium browser with native CSS nesting support (Chrome 112+, released April 2023). Firefox is not supported.
