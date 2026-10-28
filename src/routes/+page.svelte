<script>
  import { onMount } from 'svelte';
  import Player from '#lib/Player.svelte';
  import Guide from '#lib/Guide.svelte';
  import { GUIDE, SITE_URL, TIMEZONE } from '#lib/config.js';

  let player;
  let clock = $state('--:--:--');
  let current = $state(GUIDE.length - 1);
  let progress = $state(0);
  let copied = $state(false);

  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const mins = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
  const nextIndex = (i) => (i + 1) % GUIDE.length;
  let now = $derived(GUIDE[current].name);
  let next = $derived(`Next ${GUIDE[nextIndex(current)].t}  ${GUIDE[nextIndex(current)].name}`);

  function tick() {
    const p = Object.fromEntries(fmt.formatToParts(new Date()).map((x) => [x.type, x.value]));
    clock = `${p.hour}:${p.minute}:${p.second}`;
    const m = +p.hour * 60 + +p.minute + +p.second / 60;
    let cur = GUIDE.length - 1;
    for (let i = 0; i < GUIDE.length; i++) if (m >= mins(GUIDE[i].t)) cur = i;
    const start = mins(GUIDE[cur].t);
    let end = mins(GUIDE[nextIndex(cur)].t);
    if (end <= start) end += 1440;
    let at = m; if (at < start) at += 1440;
    current = cur;
    progress = Math.max(0, Math.min(100, ((at - start) / (end - start)) * 100));
  }

  onMount(() => {
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  });

  async function copy() {
    try { await navigator.clipboard.writeText(location.href.split('#')[0]); copied = true; setTimeout(() => (copied = false), 2000); } catch {}
  }
</script>

<div class="wrap">
  <header class="bar">
    <a class="brand" href="/" aria-label="Gaafu TV">
      <img src="/logo-128.webp" alt="" width="44" height="44" />
      <span class="word">Gaafu<sup>TV</sup></span>
    </a>
    <div class="end">
      <span class="chip hide-sm"><i class="dot"></i>Live</span>
      <button class="btn" type="button" onclick={() => player.play()}>
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z" /></svg>Watch live
      </button>
    </div>
  </header>

  <main>
    <Player bind:this={player} {now} {next} {clock} />

    <div class="actions">
      <button class="btn" type="button" onclick={() => player.play()}>
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z" /></svg>Watch live on web
      </button>
      <div class="r">
        <button class="btn ghost" type="button" onclick={copy}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 8l5-5 5 5M5 14v6h14v-6" /></svg>
          {copied ? 'Link copied' : 'Copy link'}
        </button>
        <a class="link" href={SITE_URL} target="_blank" rel="noopener">www.gaafu.tv
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M8 7h9v9" /></svg>
        </a>
      </div>
    </div>

    <Guide guide={GUIDE} {current} {progress} />
  </main>

  <footer><span>© 2026 Gaafu TV</span><a href={SITE_URL} target="_blank" rel="noopener">Maldives Covered</a></footer>
</div>

<style>
  .bar { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding-block: 18px 8px; }
  .brand { display: flex; align-items: center; gap: 12px; text-decoration: none; min-width: 0; }
  .brand img { width: 44px; height: 44px; display: block; flex: none; }
  .word { font-weight: 700; font-size: 26px; letter-spacing: -0.02em; line-height: 1; color: var(--red); white-space: nowrap; }
  .word sup { font-size: 11px; letter-spacing: 0.08em; color: var(--ink); margin-left: 3px; vertical-align: top; position: relative; top: -2px; }
  .end { display: flex; align-items: center; gap: 12px; }
  .actions { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding-block: 18px; flex-wrap: wrap; }
  .r { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .link { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; font-size: 14px; letter-spacing: 0.02em; color: var(--red); text-decoration: none; background: var(--panel); border: 1px solid var(--line); border-radius: 4px; padding: 9px 14px; transition: border-color 0.15s; }
  .link:hover { border-color: var(--red); }
  .link svg { width: 13px; height: 13px; }
  footer { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding-block: 28px 8px; font-size: 13px; color: var(--ink-soft); }
  footer a { text-decoration: none; }
  footer a:hover { color: var(--red); }
  @media (max-width: 640px) { .word { font-size: 22px; } .brand img { width: 38px; height: 38px; } .hide-sm { display: none; } .end .btn { padding: 10px 14px; } }
</style>
