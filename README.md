# Twitch Vertical Theater Chat

Unpacked Brave/Chrome extension that moves Twitch chat below the video when:

- You are on a Twitch watch page.
- Twitch Theater Mode is active.
- The browser window is vertical or narrow.

## Install in Brave

1. Open `brave://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder:

   `C:\Users\RoosM\Desktop\Projects\twitch-vertical-theater-chat`

5. Open a Twitch stream, click Theater Mode, and make the Brave window vertical or narrow.

In vertical Theater Mode, the Twitch top bar is hidden and chat gets the space that is not needed by the 16:9 video. Use the small button on the chat header to move chat between the top and bottom.

## Tuning

To change the chat height, edit `styles.css`:

```css
--tvtc-chat-height: min(42vh, 420px);
```

For example, `min(50vh, 520px)` makes chat taller.
