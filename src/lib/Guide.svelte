<script>
  let { guide, current, progress } = $props();
</script>

<section class="rail" aria-label="On air">
  <div class="track">
    {#each guide as g, i}
      <div class="slot" class:on={i === current} style={i === current ? `--p:${progress}%` : ''}>
        <small>{g.t}</small><span>{g.name}</span>
      </div>
    {/each}
  </div>
</section>

<style>
  .rail { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
  .track { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(180px, 1fr); overflow-x: auto; scrollbar-width: thin; scrollbar-color: var(--line-strong) transparent; }
  .slot { padding: 14px 18px 16px; border-left: 1px solid var(--line); min-width: 0; position: relative; }
  .slot:first-child { border-left: 0; }
  small { display: block; font-size: 11px; line-height: 14px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-soft); font-variant-numeric: tabular-nums; }
  span { display: block; margin-top: 4px; font-weight: 600; font-size: 17px; line-height: 24px; letter-spacing: -0.01em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .slot.on { background: var(--card); }
  .slot.on small { color: var(--red); }
  .slot.on::after { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--red); }
  .slot.on::before { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 3px; background: linear-gradient(90deg, var(--red) var(--p, 0%), transparent var(--p, 0%)); }
</style>
