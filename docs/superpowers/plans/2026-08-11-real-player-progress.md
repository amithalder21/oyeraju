# Real Player Progress, Time, Thumbnail & Auto-Advance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the floating player pill in `index.html` reflect real YouTube playback — real elapsed/duration time, a real progress bar, a real video thumbnail, and auto-advance when a track ends — instead of the current fixed CSS animation and static icon.

**Architecture:** Replace the raw `iframe.src`-swapping playback approach with a single `YT.Player` instance (YouTube IFrame Player API, `enablejsapi` implicit via the JS API) bound to the existing `<iframe id="player">`. Player state changes drive a polling loop (progress/time) and auto-advance; track metadata drives the thumbnail.

**Tech Stack:** Vanilla HTML/CSS/JS, no build step, no dependencies. YouTube IFrame Player API loaded via `<script src="https://www.youtube.com/iframe_api">`.

## Global Constraints

- All changes are confined to `index.html`. No new files, no build step, no npm/package dependencies.
- No automated test harness exists in this repo — verification is manual, via the Claude Browser tool against a local static server (`python3 -m http.server`), since the YouTube IFrame API requires an http(s) origin (not `file://`).
- Preserve existing function names (`play`, `pause`, `toggle`, `next`, `prev`, `updateMeta`, `setIcon`) and their existing external bindings (`playBtn`/`nextBtn`/`prevBtn` click listeners) — nothing else in the file should need to change to accommodate this work.
- Out of scope (per spec): click/drag-to-seek on the progress bar, any change to playlist data or track selection logic.

---

### Task 1: Real `YT.Player` engine + auto-advance

**Files:**
- Modify: `index.html` (script block, currently lines 425–482)

**Interfaces:**
- Produces: `play()`, `pause()`, `toggle()`, `next()`, `prev()`, `updateMeta()` (same signatures as before — internals change), plus new globals `ytPlayer` (YT.Player instance or `null` before ready), `apiReady` (bool), `loadedIdx` (number — index of the track currently loaded into the player), and `onPlayerStateChange(e)` (event handler, referenced by Task 2).
- Consumes: existing `playlist` array (`{title, movie, id}`), existing DOM ids `trackTitle`, `trackMovie`, `mainPlaySvg`, `ytmLink`, `spotifyLink`, `playBtn`, `nextBtn`, `prevBtn`, `player` (the iframe).

- [ ] **Step 1: Baseline check of current (broken) behavior**

Start a local static server and open the page:

```bash
cd /Users/amithalder/Desktop/oye-raju && python3 -m http.server 8000
```

Use the Claude Browser tool: `preview_start` with `url: "http://localhost:8000"`, then `navigate` to `http://localhost:8000/`. Click the play button (`playBtn`). Confirm current behavior: audio starts, but clicking pause fully unloads the iframe (`about:blank`) rather than pausing — and there is no way to detect when a track ends (open `read_console_messages`, confirm no player-state logging exists).

- [ ] **Step 2: Replace the script block with the real player engine**

Replace the entire existing `<script>...</script>` block (`index.html:425-482`) — i.e. everything from `<script>` through `</script>`, keeping the preceding `<iframe id="player" ...>` tag (`index.html:423`) exactly as-is — with:

```html
<script src="https://www.youtube.com/iframe_api"></script>
<script>
  const playlist = [
    { title: "Chaiyya Chaiyya", movie: "Dil Se (1998) · Sukhwinder Singh", id: "JS68-1RVTNY" },
    { title: "Tanha Tanha", movie: "Rangeela (1995) · Asha Bhosle", id: "DEU1phkgmbE" },
    { title: "Tu Cheez Badi Hai Mast Mast", movie: "Mohra (1994) · Udit Narayan", id: "fT4vP4PnLxg" },
    { title: "Ankhiyon Se Goli Maare", movie: "Dulhe Raja (1998) · Sonu Nigam", id: "i-ueJ148BFU" },
    { title: "Choli Ke Peeche", movie: "Khalnayak (1993) · Alka Yagnik, Ila Arun", id: "Hkj61veJRHA" },
    { title: "Chura Ke Dil Mera", movie: "Main Khiladi Tu Anari (1994)", id: "1eSG6dLiYxY" },
    { title: "Ek Chatur Naar", movie: "Padosan (1968) · Kishore Kumar", id: "Spy2kMTYQ2o" },
    { title: "Kajra Re", movie: "Bunty Aur Babli (2005)", id: "4dsFQFCvVGU" },
    { title: "Tujhe Dekha To", movie: "DDLJ (1995) · Lata & Kumar Sanu", id: "cNV5hLSa9H8" },
    { title: "O Oh Jaane Jaana", movie: "Pyaar Kiya To Darna Kya (1998)", id: "nLQPTYllTcs" }
  ];

  let idx = 0, playing = false;
  let ytPlayer = null, apiReady = false, pendingPlay = false, loadedIdx = 0;
  const titleEl = document.getElementById('trackTitle');
  const movieEl = document.getElementById('trackMovie');
  const mainPlaySvg = document.getElementById('mainPlaySvg');
  const ytmLink = document.getElementById('ytmLink');
  const spotifyLink = document.getElementById('spotifyLink');

  function updateMeta(){
    const t = playlist[idx];
    titleEl.textContent = t.title;
    movieEl.textContent = t.movie;
    ytmLink.href = 'https://music.youtube.com/search?q=' + encodeURIComponent(t.title);
    spotifyLink.href = 'https://open.spotify.com/search/' + encodeURIComponent(t.title);
  }
  function setIcon(){
    mainPlaySvg.innerHTML = playing
      ? '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>'
      : '<path d="M8 5v14l11-7z"/>';
  }

  function onYouTubeIframeAPIReady(){
    apiReady = true;
    ytPlayer = new YT.Player('player', {
      videoId: playlist[idx].id,
      playerVars: { autoplay: 0, controls: 0, playsinline: 1, rel: 0, modestbranding: 1 },
      events: {
        onReady: function(){ if (pendingPlay) { pendingPlay = false; play(); } },
        onStateChange: onPlayerStateChange
      }
    });
    loadedIdx = idx;
  }
  window.onYouTubeIframeAPIReady = onYouTubeIframeAPIReady;

  function onPlayerStateChange(e){
    if (e.data === YT.PlayerState.ENDED) next();
  }

  function play(){
    if (!apiReady || !ytPlayer || typeof ytPlayer.playVideo !== 'function') { pendingPlay = true; return; }
    if (loadedIdx !== idx) {
      ytPlayer.loadVideoById(playlist[idx].id);
      loadedIdx = idx;
    } else {
      ytPlayer.playVideo();
    }
    playing = true;
    setIcon();
    updateMeta();
  }
  function pause(){
    if (ytPlayer && typeof ytPlayer.pauseVideo === 'function') ytPlayer.pauseVideo();
    playing = false;
    setIcon();
    updateMeta();
  }
  function toggle(){ playing ? pause() : play(); }
  function next(){ idx = (idx + 1) % playlist.length; playing ? play() : updateMeta(); }
  function prev(){ idx = (idx - 1 + playlist.length) % playlist.length; playing ? play() : updateMeta(); }

  document.getElementById('playBtn').addEventListener('click', toggle);
  document.getElementById('nextBtn').addEventListener('click', next);
  document.getElementById('prevBtn').addEventListener('click', prev);

  updateMeta();

  let count = 42;
  const liveEl = document.getElementById('liveCount');
  setInterval(() => {
    count += Math.floor(Math.random() * 5) - 2;
    count = Math.max(18, Math.min(96, count));
    liveEl.textContent = count + ' सिप पर · online';
  }, 4000);
</script>
```

Note what changed vs. the original: `const iframe = ...` and `ytSrc()` are gone (no longer needed — `YT.Player` owns the iframe's `src`); `play()`/`pause()`/`next()`/`prev()`/`toggle()` keep identical signatures but now drive the player object; `loadedIdx` tracks which track is actually loaded so resuming from pause calls `playVideo()` (keeps position) while switching tracks calls `loadVideoById()` (starts fresh).

- [ ] **Step 3: Verify engine behavior in-browser**

Reload `http://localhost:8000/` in the Browser tool. Use `read_console_messages` to confirm no errors. Click play — confirm audio starts (network tab / `read_network_requests` should show a request to `www.youtube.com/embed/...`). Click pause, then play again — use `javascript_tool` to run `ytPlayer.getCurrentTime()` immediately after resuming; confirm it's close to where you paused (not reset to 0), proving `pauseVideo()`/`playVideo()` is used instead of a full reload. Click next/prev — confirm the title/subtitle text updates and audio switches tracks.

To verify auto-advance without waiting a full song, run via `javascript_tool`:

```js
ytPlayer.seekTo(ytPlayer.getDuration() - 2, true)
```

then wait ~3 seconds and check `document.getElementById('trackTitle').textContent` — it should now show the *next* track's title, confirming `onPlayerStateChange` caught `ENDED` and called `next()`.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "Wire player to real YT.Player engine with auto-advance on track end"
```

---

### Task 2: Real progress bar + elapsed/duration time text

**Files:**
- Modify: `index.html` — CSS (`.progress`, `.progress i` rules currently at lines 121–130; reduced-motion rule at line 156), markup (`.meta` block currently at lines 405–409), script (const declarations, `setIcon`/`onPlayerStateChange`/`play` from Task 1)

**Interfaces:**
- Consumes: `ytPlayer`, `onPlayerStateChange(e)`, `play()` from Task 1.
- Produces: `progressFill` (DOM ref to `#progressFill`), `timeEl` (DOM ref to `#trackTime`), `formatTime(sec)`, `startProgressPolling()`, `stopProgressPolling()`.

- [ ] **Step 1: Baseline check**

With the server still running, confirm in-browser that the progress bar currently doesn't move at all relative to real position — it's static width (no more CSS animation to remove is a red flag if you still see it looping; if so, Task 1 wasn't applied first).

- [ ] **Step 2: Update the progress bar and time CSS**

In the `<style>` block, replace:

```css
  .progress{
    height:3px; border-radius:2px; background:rgba(247,236,218,.18);
    margin-top:7px; overflow:hidden;
  }
  .progress i{
    display:block; height:100%; width:35%; border-radius:2px;
    background:#F4C361;
    animation:scrub 14s linear infinite;
  }
  @keyframes scrub{ 0%{ width:4%; } 100%{ width:96%; } }
```

with:

```css
  .progress{
    height:3px; border-radius:2px; background:rgba(247,236,218,.18);
    margin-top:7px; overflow:hidden;
  }
  .progress i{
    display:block; height:100%; width:0%; border-radius:2px;
    background:#F4C361;
    transition:width .4s linear;
  }
  .time{
    display:block; margin-top:4px;
    font-family:'Space Mono', monospace;
    font-size:10.5px; color:rgba(247,236,218,.5);
  }
```

Then find the reduced-motion media query (currently line 156):

```css
    .bulbGlow, .steamPuff, .live .dot, .progress i{ animation:none !important; }
```

and remove `.progress i` from that selector list (it no longer animates via CSS, so it has nothing to disable):

```css
    .bulbGlow, .steamPuff, .live .dot{ animation:none !important; }
```

- [ ] **Step 3: Add the time element to the player markup**

Replace the `.meta` block (currently `index.html:405-409`):

```html
  <div class="meta">
    <div class="title" id="trackTitle">Loading…</div>
    <div class="sub" id="trackMovie">&nbsp;</div>
    <div class="progress"><i></i></div>
  </div>
```

with:

```html
  <div class="meta">
    <div class="title" id="trackTitle">Loading…</div>
    <div class="sub" id="trackMovie">&nbsp;</div>
    <div class="progress"><i id="progressFill"></i></div>
    <div class="time" id="trackTime">0:00 / 0:00</div>
  </div>
```

- [ ] **Step 4: Add polling logic to the script**

In the const declarations block, replace:

```js
  const titleEl = document.getElementById('trackTitle');
  const movieEl = document.getElementById('trackMovie');
  const mainPlaySvg = document.getElementById('mainPlaySvg');
  const ytmLink = document.getElementById('ytmLink');
  const spotifyLink = document.getElementById('spotifyLink');
```

with:

```js
  const titleEl = document.getElementById('trackTitle');
  const movieEl = document.getElementById('trackMovie');
  const mainPlaySvg = document.getElementById('mainPlaySvg');
  const ytmLink = document.getElementById('ytmLink');
  const spotifyLink = document.getElementById('spotifyLink');
  const progressFill = document.getElementById('progressFill');
  const timeEl = document.getElementById('trackTime');
  let progressTimer = null;
```

Immediately after `setIcon()`'s closing brace and before `onYouTubeIframeAPIReady()`, insert:

```js
  function formatTime(sec){
    if (!isFinite(sec) || sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return m + ':' + String(s).padStart(2, '0');
  }
  function startProgressPolling(){
    stopProgressPolling();
    progressTimer = setInterval(() => {
      if (!ytPlayer || typeof ytPlayer.getCurrentTime !== 'function') return;
      const current = ytPlayer.getCurrentTime();
      const duration = ytPlayer.getDuration();
      progressFill.style.width = (duration > 0 ? (current / duration) * 100 : 0) + '%';
      timeEl.textContent = formatTime(current) + ' / ' + formatTime(duration);
    }, 500);
  }
  function stopProgressPolling(){
    if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }
  }

```

Replace `onPlayerStateChange`:

```js
  function onPlayerStateChange(e){
    if (e.data === YT.PlayerState.ENDED) next();
  }
```

with:

```js
  function onPlayerStateChange(e){
    if (e.data === YT.PlayerState.PLAYING) startProgressPolling();
    else stopProgressPolling();
    if (e.data === YT.PlayerState.ENDED) next();
  }
```

Replace `play()`'s `loadVideoById` branch — from:

```js
    if (loadedIdx !== idx) {
      ytPlayer.loadVideoById(playlist[idx].id);
      loadedIdx = idx;
    } else {
```

to:

```js
    if (loadedIdx !== idx) {
      ytPlayer.loadVideoById(playlist[idx].id);
      loadedIdx = idx;
      progressFill.style.width = '0%';
      timeEl.textContent = '0:00 / 0:00';
    } else {
```

- [ ] **Step 5: Verify in-browser**

Reload the page. Click play, wait ~2 seconds, then via `javascript_tool` read `document.getElementById('trackTime').textContent` — it should show real elapsed/duration (e.g. `0:02 / 3:41`, not `0:00 / 0:00`). Read `document.getElementById('progressFill').style.width` — should be a small non-zero percentage. Click pause — read the time text again immediately; confirm it did **not** reset to `0:00 / 0:00` (regression check: pausing must freeze the display, not clear it). Click next — confirm the time resets to `0:00 / 0:00` momentarily then starts climbing for the new track.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "Drive progress bar and time display from real YT.Player playback state"
```

---

### Task 3: Real per-track thumbnail

**Files:**
- Modify: `index.html` — CSS (`.thumb svg` rule currently at line 109), markup (`.thumb` block currently at lines 402-404), script (const declarations, `updateMeta()` from Task 1)

**Interfaces:**
- Consumes: `updateMeta()`, `playlist[idx].id` from Task 1.
- Produces: `thumbEl` (DOM ref to `#trackThumb`).

- [ ] **Step 1: Update thumbnail CSS**

In the `<style>` block, replace:

```css
  .thumb svg{ width:24px; height:24px; }
```

with:

```css
  .thumb svg{ width:24px; height:24px; }
  .thumb img{ width:100%; height:100%; border-radius:50%; object-fit:cover; }
```

- [ ] **Step 2: Replace the static thumb icon with an image**

Replace the `.thumb` block (currently `index.html:402-404`):

```html
  <div class="thumb">
    <svg viewBox="0 0 24 24" fill="#2A1B10"><path d="M4 9h13a3 3 0 010 6h-1.2A6 6 0 015 15H4V9zm2 2v2h6.5A2 2 0 0016 11H6z"/></svg>
  </div>
```

with:

```html
  <div class="thumb">
    <img id="trackThumb" src="" alt="" />
  </div>
```

- [ ] **Step 3: Wire the thumbnail URL into `updateMeta()`**

In the const declarations block, replace:

```js
  const progressFill = document.getElementById('progressFill');
  const timeEl = document.getElementById('trackTime');
  let progressTimer = null;
```

with:

```js
  const progressFill = document.getElementById('progressFill');
  const timeEl = document.getElementById('trackTime');
  const thumbEl = document.getElementById('trackThumb');
  let progressTimer = null;
```

Replace `updateMeta()`:

```js
  function updateMeta(){
    const t = playlist[idx];
    titleEl.textContent = t.title;
    movieEl.textContent = t.movie;
    ytmLink.href = 'https://music.youtube.com/search?q=' + encodeURIComponent(t.title);
    spotifyLink.href = 'https://open.spotify.com/search/' + encodeURIComponent(t.title);
  }
```

with:

```js
  function updateMeta(){
    const t = playlist[idx];
    titleEl.textContent = t.title;
    movieEl.textContent = t.movie;
    ytmLink.href = 'https://music.youtube.com/search?q=' + encodeURIComponent(t.title);
    spotifyLink.href = 'https://open.spotify.com/search/' + encodeURIComponent(t.title);
    thumbEl.src = 'https://i.ytimg.com/vi/' + t.id + '/hqdefault.jpg';
    thumbEl.alt = t.title + ' thumbnail';
  }
```

- [ ] **Step 4: Verify in-browser**

Reload the page. Via `javascript_tool`, read `document.getElementById('trackThumb').src` — should match `https://i.ytimg.com/vi/JS68-1RVTNY/hqdefault.jpg` (the first track's id) on load. Click next — confirm the `src` updates to the next track's id. Use `javascript_tool` to check `document.getElementById('trackThumb').naturalWidth > 0` after a short wait, confirming the image actually loaded (not a broken image).

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "Show real YouTube video thumbnail per track"
```

- [ ] **Step 6: Stop the local test server**

```bash
kill %1
```

(or find and kill the `python3 -m http.server 8000` process if it's not the most recent background job).
