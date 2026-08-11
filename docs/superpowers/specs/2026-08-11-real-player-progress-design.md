# Real player progress, time display, thumbnail & auto-advance

## Problem

The floating player pill (`index.html`) fakes playback feedback:

- The progress fill (`.progress i`) is a fixed 14s CSS `@keyframes scrub` loop, unrelated to the actual song or its position.
- There's no elapsed/duration time text.
- The thumb icon is a static generic SVG, not the track's real artwork.
- The raw `<iframe src=...>` embed approach means we never learn when a track actually ends, so there's no auto-advance — playback just silently stops.

Reference: saloon.wtf's player shows a real `0:05 / 5:04` time readout and the actual video thumbnail, driven by real playback state.

## Goal

Drive the player pill from real YouTube playback state via the IFrame Player API:

1. Real progress bar fill + `M:SS / M:SS` time text.
2. Real video thumbnail per track.
3. Auto-advance to the next track when the current one ends.

## Architecture

Replace the current "set `iframe.src` directly" approach with a single `YT.Player` instance bound to the existing `<iframe id="player">`, using `enablejsapi=1`.

- Load `https://www.youtube.com/iframe_api` once; `window.onYouTubeIframeAPIReady` constructs the `YT.Player` with the current track's video ID and `playerVars` matching today's URL params (autoplay, controls:0, playsinline:1, rel:0, modestbranding:1).
- `play()` → `player.loadVideoById(id)` (or queues until the player is ready, since the API loads asynchronously).
- `pause()` → `player.pauseVideo()` (no longer tears down the iframe with `about:blank`).
- `toggle()`/`next()`/`prev()` keep their existing signatures; only the internals change to call the player object instead of touching `iframe.src`.
- `onPlayerStateChange`:
  - `PLAYING` → start a ~500ms `setInterval` that reads `getCurrentTime()`/`getDuration()`, updates `.progress i` width (`%`) and a new time-text element.
  - `PAUSED`/other → clear that interval.
  - `ENDED` → call `next()` (auto-advance).
- Thumbnail: on `updateMeta()`, set the thumb element's image to `https://i.ytimg.com/vi/<id>/hqdefault.jpg` for the current track.
- Remove the now-unused `@keyframes scrub` CSS animation; width is set inline via JS instead.

## Markup changes

- `.thumb` (`index.html:402-404`): replace the inline SVG with an `<img>` tag, `object-fit: cover`, sourced from the YouTube thumbnail URL. Keep the circular container styling.
- `.meta` (`index.html:405-409`): add a small time-text element (e.g. `<div class="time" id="trackTime">0:00 / 0:00</div>`) alongside the existing `.progress` bar.

## Out of scope

- Click/drag-to-seek on the progress bar.
- Any change to the playlist data or track selection logic.

## Testing

Manual verification in-browser (this is a static single-file site, no test harness):

- Load the site, hit play, confirm the time text and bar advance in real time and match the actual video position.
- Confirm the thumbnail shown matches the playing track.
- Let a track play through to the end (or `player.seekTo()` near the end via devtools) and confirm it auto-advances to the next track.
- Confirm prev/next/pause/resume still work as before.
