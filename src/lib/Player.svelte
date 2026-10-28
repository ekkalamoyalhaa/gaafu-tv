<script>
  import { onMount, onDestroy } from 'svelte';
  import { STREAM_URL, SWITCH_FILE } from '#lib/config.js';
  import Slate from '#lib/Slate.svelte';
  import LowerThird from '#lib/LowerThird.svelte';

  let { now = '', next = '', clock = '' } = $props();

  let monitor, video;
  // Several servers can carry the same stream. Each viewer gets them in random order, which spreads
  // the audience evenly, and moves to the next one if the current one fails.
  let urls = STREAM_URL ? [STREAM_URL] : [];
  let idx = 0, failed = 0;
  const current = () => (urls.length ? urls[idx % urls.length] : '');
  const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  let status = $state(STREAM_URL ? 'idle' : 'slate'); // slate | idle | loading | playing | offline
  let pollTimer = null;
  let muted = $state(true);
  let shown = $state(false); // true once the first frame has played
  let hls = null;
  let retry = 0, retryTimer = null, hiddenTimer = null;

  // live.json tells every viewer which source to use ("direct" = your own server,
  // "cdn" = the CDN). Change one word in that file to move the audience, no rebuild needed.
  async function resolve() {
    try {
      const r = await fetch(`${SWITCH_FILE}?t=${Math.floor(Date.now() / 5000)}`, { cache: 'no-store' });
      if (!r.ok) return false;
      const j = await r.json();
      const list = [j.sources?.[j.mode]].flat().filter(Boolean);
      const same = list.length === urls.length && [...list].sort().join('|') === [...urls].sort().join('|');
      if (list.length && !same) { urls = shuffle(list); idx = 0; failed = 0; return true; }
    } catch { /* keep the current source */ }
    return false;
  }
  // Check again every minute or so, at random times so a whole audience never asks at once.
  function poll() {
    pollTimer = setTimeout(async () => {
      if (!document.hidden && (await resolve()) && hls) { teardown(); await play(); }
      poll();
    }, 45000 + Math.random() * 30000);
  }

  // Hls.js is ~100 kB, so it is only fetched when someone presses play.
  async function load() {
    if (!current() || hls || video.src) return;
    status = 'loading';
    const native = video.canPlayType('application/vnd.apple.mpegurl'); // Safari / iOS plays HLS itself
    if (native && !/Chrome|Android/.test(navigator.userAgent)) {
      video.src = current();
      return;
    }
    const { default: Hls } = await import('hls.js');
    if (!Hls.isSupported()) { video.src = current(); return; }
    hls = new Hls({
      capLevelToPlayerSize: true,   // never download more pixels than the player shows
      startLevel: -1,
      maxBufferLength: 12,          // keep a short buffer: less data, lower delay
      backBufferLength: 20,
      liveSyncDurationCount: 3,
      liveMaxLatencyDurationCount: 8,
      manifestLoadingMaxRetry: urls.length > 1 ? 1 : 2, // with a spare server, give up on a dead one sooner
      manifestLoadingRetryDelay: 500,
      levelLoadingMaxRetry: 3,
      fragLoadingMaxRetry: 3
    });
    hls.on(Hls.Events.ERROR, (_e, d) => {
      if (!d.fatal) return;
      if (d.type === Hls.ErrorTypes.MEDIA_ERROR) { hls.recoverMediaError(); return; }
      offline();
    });
    hls.loadSource(current());
    hls.attachMedia(video);
  }

  // When the feed drops, every viewer must not retry at once. Back off with random jitter.
  function offline() {
    status = 'offline';
    clearTimeout(retryTimer);
    let wait;
    if (urls.length > 1 && failed < urls.length - 1) {
      failed += 1; idx += 1; wait = 300;            // try the next server straight away
    } else {
      failed = 0; idx += 1;                          // every server failed: back off, then start the round again
      wait = Math.min(30000, 2000 * 2 ** retry) * (0.5 + Math.random());
      retry += 1;
    }
    retryTimer = setTimeout(() => { teardown(); play(); }, wait);
  }
  function teardown() {
    if (hls) { hls.destroy(); hls = null; }
    shown = false;
    video?.removeAttribute('src');
    video?.load();
  }

  export async function play() {
    if (!current()) { monitor?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    await load();
    try { await video.play(); } catch { /* needs a tap, the play button stays visible */ }
  }

  function toggle() { video.paused ? play() : video.pause(); }
  function fullscreen() {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else (monitor.requestFullscreen?.() ?? video.webkitEnterFullscreen?.());
  }

  // A hidden tab still downloads video. Stop after a minute, resume at the live edge.
  function visibility() {
    if (!hls) return;
    if (document.hidden && !document.pictureInPictureElement) {
      hiddenTimer = setTimeout(() => hls?.stopLoad(), 60000);
    } else {
      clearTimeout(hiddenTimer);
      hls.startLoad(-1);
      if (hls.liveSyncPosition) video.currentTime = hls.liveSyncPosition;
    }
  }

  onMount(async () => {
    document.addEventListener('visibilitychange', visibility);
    await resolve();                       // pick the right source before anyone presses play
    if (current() && status === 'slate') status = 'idle';
    poll();
    return () => document.removeEventListener('visibilitychange', visibility);
  });
  onDestroy(() => { clearTimeout(retryTimer); clearTimeout(hiddenTimer); clearTimeout(pollTimer); hls?.destroy(); });
</script>

<div class="monitor" class:video={shown} bind:this={monitor}>
  <Slate />
  <!-- svelte-ignore a11y_media_has_caption -->
  <video
    bind:this={video}
    {muted}
    playsinline
    preload="none"
    aria-label="Gaafu TV live broadcast"
    onplaying={() => { status = 'playing'; shown = true; retry = 0; failed = 0; }}
    onwaiting={() => { if (status === 'playing') status = 'loading'; }}
    onclick={toggle}
    onerror={() => { if (!hls && current()) offline(); }}
  ></video>

  <div class="tag"><span class="chip"><i class="dot"></i>Live</span></div>
  <div class="tools">
    <button class="ico" type="button" aria-label={muted ? 'Turn sound on' : 'Turn sound off'} onclick={() => (muted = !muted)}>
      <svg viewBox="0 0 24 24"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" />{#if !muted}<path d="M16 9a4.5 4.5 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" />{:else}<path d="M16 9.5l5 5M21 9.5l-5 5" />{/if}</svg>
    </button>
    <button class="ico" type="button" aria-label="Full screen" onclick={fullscreen}>
      <svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
    </button>
  </div>

  {#if status === 'idle' || (status === 'loading' && !shown)}
    <button class="play" type="button" aria-label="Play live broadcast" onclick={play}>
      {#if status === 'loading'}<span class="spin"></span>{:else}<svg viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z" /></svg>{/if}
    </button>
  {/if}
  {#if status === 'offline'}<div class="note">Reconnecting</div>{/if}

  <LowerThird {now} {next} {clock} />
</div>

<style>
  .monitor {
    position: relative; background: #1a0306; border: 1px solid var(--line); border-radius: 12px; overflow: hidden;
    box-shadow: var(--shadow); aspect-ratio: 16 / 9; max-width: 100%; isolation: isolate; contain: layout paint;
  }
  video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; background: #000; z-index: 2; visibility: hidden; }
  .monitor.video video { visibility: visible; }
  .tag { position: absolute; z-index: 4; top: clamp(12px, 2.2vw, 24px); left: clamp(12px, 2.2vw, 24px); }
  .tag .chip { background: rgba(255, 255, 255, 0.96); color: var(--ink); }
  .tag .chip .dot { background: var(--live); }
  .tools { position: absolute; z-index: 4; top: clamp(10px, 2vw, 22px); right: clamp(10px, 2vw, 22px); display: flex; gap: 8px; }
  .ico { width: 36px; height: 36px; display: grid; place-items: center; border-radius: 4px; border: 0; background: rgba(255, 245, 243, 0.92); color: var(--ink); transition: background 0.15s, color 0.15s; }
  .ico:hover { background: var(--red); color: #fff; }
  .ico svg { width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 1.9; stroke-linecap: round; stroke-linejoin: round; }
  .play {
    position: absolute; z-index: 4; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 76px; height: 76px; border-radius: 50%;
    border: 0; background: var(--red); color: #fff; display: grid; place-items: center; box-shadow: 0 12px 32px -4px rgba(0, 0, 0, 0.5); transition: background 0.15s, transform 0.15s;
  }
  .play:hover { background: var(--live); transform: translate(-50%, -50%) scale(1.06); }
  .play svg { width: 28px; height: 28px; fill: currentColor; margin-left: 4px; }
  .spin { width: 28px; height: 28px; border-radius: 50%; border: 3px solid rgba(255, 255, 255, 0.35); border-top-color: #fff; animation: spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .note { position: absolute; z-index: 4; left: 50%; top: 50%; transform: translate(-50%, -50%); background: rgba(61, 8, 12, 0.85); color: #fff; padding: 8px 14px; border-radius: 4px; font-weight: 600; font-size: 13px; letter-spacing: 0.06em; text-transform: uppercase; }
  @media (max-width: 640px) { .monitor { border-radius: 8px; } .play { width: 60px; height: 60px; } .ico { width: 32px; height: 32px; } }
  @media (prefers-reduced-motion: reduce) { .spin { animation: none; } .ico, .play { transition: none; } }
</style>
