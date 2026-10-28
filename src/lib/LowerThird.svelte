<script>
  let { now = '', next = '', clock = '' } = $props();
</script>

<div class="lt">
  <div class="strip">{next}</div>
  <div class="main"><span class="title">{now}</span><span class="clock">{clock}<i>MVT</i></span></div>
</div>

<style>
  .lt { position: absolute; z-index: 3; left: clamp(12px, 2.2vw, 24px); right: clamp(12px, 2.2vw, 24px); bottom: clamp(12px, 2.2vw, 24px); display: grid; pointer-events: none; }
  .strip { justify-self: start; background: #fceaea; color: var(--ink); font-weight: 700; font-size: clamp(11px, 1.3vw, 15px); letter-spacing: 0.06em; text-transform: uppercase; padding: 5px 14px; border-radius: 4px 4px 0 0; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-height: 1em; }
  .main { display: flex; align-items: center; justify-content: space-between; gap: 16px; background: linear-gradient(90deg, #a30010, #cf0d0d 50%, #a30010); color: #fff; border-radius: 0 6px 6px 6px; padding: clamp(8px, 1.2vw, 14px) clamp(12px, 1.6vw, 20px); }
  .title { font-weight: 600; font-size: clamp(14px, 2vw, 24px); letter-spacing: -0.01em; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .clock { font-weight: 600; font-size: clamp(12px, 1.4vw, 16px); letter-spacing: 0.06em; font-variant-numeric: tabular-nums; white-space: nowrap; flex: none; }
  i { font-style: normal; opacity: 0.7; margin-left: 6px; }
</style>
