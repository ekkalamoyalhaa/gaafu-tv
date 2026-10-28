<div class="slate" aria-hidden="true">
  <div class="ring"></div><div class="ring"></div><div class="ring"></div><div class="ring"></div><div class="ring"></div><div class="ring"></div>
  <div class="mark"><img src="/logo-512.webp" alt="" width="512" height="512" /><b>TV</b></div>
</div>

<style>
  .slate { position: absolute; inset: 0; z-index: 0; overflow: hidden; background: radial-gradient(120% 120% at 50% 50%, #5a060d 0%, #3d080c 55%, #240407 100%); }
  .ring {
    position: absolute; left: 50%; top: 50%; border-radius: 50%; aspect-ratio: 1; transform: translate(-50%, -50%);
    background: radial-gradient(circle, rgba(120, 0, 12, 0.85), rgba(190, 8, 24, 0.9));
    box-shadow: inset 0 0 0 1px rgba(255, 70, 85, 0.35), 0 10px 40px rgba(20, 0, 3, 0.55), inset 0 8px 24px rgba(0, 0, 0, 0.35);
    animation: breathe 6s ease-in-out infinite; animation-delay: calc(var(--n) * -0.9s); will-change: transform;
  }
  .ring:nth-child(1) { width: 34%; --n: 5; background: radial-gradient(circle, #4a0008, #7a0010); }
  .ring:nth-child(2) { width: 52%; --n: 4; }
  .ring:nth-child(3) { width: 70%; --n: 3; }
  .ring:nth-child(4) { width: 88%; --n: 2; }
  .ring:nth-child(5) { width: 108%; --n: 1; }
  .ring:nth-child(6) { width: 130%; --n: 0; }
  @keyframes breathe { 0%, 100% { transform: translate(-50%, -50%) scale(1); } 50% { transform: translate(-50%, -50%) scale(1.035); } }
  .mark { position: absolute; left: 50%; top: 50%; width: 19%; transform: translate(-50%, -50%); z-index: 1; filter: drop-shadow(0 14px 30px rgba(0, 0, 0, 0.45)); }
  .mark img { width: 100%; height: auto; display: block; }
  .mark b { position: absolute; left: 100%; top: 4%; margin-left: 6%; font-size: clamp(14px, 2.6vw, 34px); font-weight: 700; letter-spacing: 0.04em; color: #fff; line-height: 1; }
  @media (prefers-reduced-motion: reduce) { .ring { animation: none; } }
</style>
