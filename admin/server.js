// Gaafu TV source switch (hardened for gaafu.tv)
// Node 20+
import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';

const PORT = Number(process.env.PORT) || 8787;
const PASSWORD = process.env.ADMIN_PASSWORD || '';
const SESSION_SECRET = process.env.SESSION_SECRET || '';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://www.gaafu.tv';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || ALLOWED_ORIGIN)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const DATA_FILE = process.env.DATA_FILE || './data/state.json';
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const TRUSTED_PROXIES = (process.env.TRUSTED_PROXIES || '127.0.0.1,::1')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const INSECURE_COOKIE = process.env.INSECURE_COOKIE === '1';
const COOKIE_NAME = process.env.COOKIE_NAME || '__Host-gtv';
const SESSION_HOURS = Math.max(1, Number(process.env.SESSION_HOURS) || 8);
const IDLE_MINUTES = Math.max(5, Number(process.env.IDLE_MINUTES) || 30);

// Enforce secrets
if (PASSWORD.length < 16) {
  console.error('FATAL: ADMIN_PASSWORD must be at least 16 characters.');
  process.exit(1);
}
if (SESSION_SECRET.length < 32) {
  console.error('FATAL: SESSION_SECRET must be at least 32 characters (use `openssl rand -hex 32`).');
  process.exit(1);
}

/* ---------- state ---------- */
const toList = (v) =>
  (Array.isArray(v) ? v : String(v || '').split(/[\n,]/))
    .map((x) => String(x).trim())
    .filter(Boolean);

let state = {
  mode: 'direct',
  sources: { direct: toList(process.env.DIRECT_URL), cdn: toList(process.env.CDN_URL) },
  log: []
};

try {
  const raw = await readFile(DATA_FILE, 'utf8');
  const parsed = JSON.parse(raw);
  state = { ...state, ...parsed };
} catch {
  /* first run */
}
state.sources = { direct: toList(state.sources?.direct), cdn: toList(state.sources?.cdn) };

async function save() {
  await mkdir(path.dirname(DATA_FILE), { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  await writeFile(tmp, JSON.stringify(state, null, 2));
  await rename(tmp, DATA_FILE);
}

const publicState = () => ({ mode: state.mode, sources: state.sources });

function note(what) {
  state.log.unshift({ at: new Date().toISOString(), what });
  state.log.length = Math.min(state.log.length, 30);
}

/* ---------- crypto/sessions ---------- */
const hmac = (v) => crypto.createHmac('sha256', SESSION_SECRET).update(v).digest('hex');
const sign = hmac;
const safeEq = (a, b) => {
  try {
    const x = Buffer.from(a);
    const y = Buffer.from(b);
    if (x.length !== y.length) return false;
    return crypto.timingSafeEqual(x, y);
  } catch {
    return false;
  }
};

function makeSession() {
  const exp = String(Date.now() + SESSION_HOURS * 3600e3);
  const idle = String(Date.now() + IDLE_MINUTES * 60e3);
  const csrf = crypto.randomBytes(32).toString('hex');
  const payload = `${exp}.${idle}.${csrf}`;
  return `${payload}.${sign(payload)}`;
}

function parseSession(t) {
  if (!t) return null;
  const parts = t.split('.');
  if (parts.length < 4) return null;
  const sig = parts.pop();
  const payload = parts.join('.');
  const [expStr, idleStr, csrf] = parts;
  const exp = Number(expStr);
  const idle = Number(idleStr);
  if (!sig || !csrf) return null;
  if (!safeEq(sig, sign(payload))) return null;
  const now = Date.now();
  if (Number.isNaN(exp) || exp < now) return null;
  if (Number.isNaN(idle) || idle < now) return null;
  return { exp, idle, csrf };
}

function renewSession(t) {
  const s = parseSession(t);
  if (!s) return null;
  const exp = String(Date.now() + SESSION_HOURS * 3600e3);
  const idle = String(Date.now() + IDLE_MINUTES * 60e3);
  const payload = `${exp}.${idle}.${s.csrf}`;
  return `${payload}.${sign(payload)}`;
}

/* ---------- network/ip ---------- */
function getIp(req) {
  const cf = req.headers['cf-connecting-ip'];
  if (typeof cf === 'string' && cf.trim()) {
    return cf.trim();
  }
  if (TRUST_PROXY) {
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff.trim()) {
      const parts = xff.split(',').map((x) => x.trim()).filter(Boolean);
      if (parts.length) {
        return parts[0];
      }
    }
  }
  return req.socket.remoteAddress || '';
}

/* ---------- rate limiting ---------- */
const fails = new Map();
const ipKey = (req) => getIp(req) || 'unknown';

function locked(k) {
  const f = fails.get(k);
  return f && f.n >= 5 && f.until > Date.now();
}
function fail(k) {
  const f = fails.get(k) || { n: 0, until: 0 };
  f.n += 1;
  f.until = Date.now() + 15 * 60e3;
  fails.set(k, f);
}
function clearFail(k) {
  fails.delete(k);
}

/* ---------- helpers ---------- */
function body(req, max = 10000) {
  return new Promise((res, rej) => {
    let s = '';
    req.on('data', (c) => {
      s += c;
      if (s.length > max) {
        rej(new Error('too big'));
        req.destroy();
      }
    });
    req.on('end', () => res(s));
    req.on('error', rej);
  });
}

function cookies(req) {
  const h = req.headers.cookie || '';
  const out = {};
  h.split(';').forEach((c) => {
    const i = c.indexOf('=');
    if (i === -1) return;
    const k = c.slice(0, i).trim();
    const v = c.slice(i + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

function setCookie(res, value, maxAgeSec) {
  const secure = INSECURE_COOKIE ? '' : '; Secure';
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(value)}`,
    'HttpOnly',
    'SameSite=Strict',
    'Path=/'
  ];
  if (maxAgeSec >= 0) parts.push(`Max-Age=${maxAgeSec}`);
  if (secure) parts.push(secure.trim());
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearCookie(res) {
  setCookie(res, '', 0);
}

function send(res, code, data, type = 'application/json', extra = {}) {
  const headers = {
    'Content-Type': type + '; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Cache-Control': 'no-store',
    ...extra
  };
  if (extra['Cache-Control']) headers['Cache-Control'] = extra['Cache-Control'];
  res.writeHead(code, headers);
  res.end(typeof data === 'string' ? data : JSON.stringify(data));
}

const validUrl = (u) => /^https:\/\/[^\s]+\.m3u8(\?[^\s]*)?$/.test(u);

function isAllowedOrigin(o) {
  if (!o) return false;
  try {
    const url = new URL(o);
    if (url.protocol !== 'https:') return false;
    return ALLOWED_ORIGINS.includes(`${url.protocol}//${url.host}`);
  } catch {
    return false;
  }
}

function sameOrigin(req) {
  const o = req.headers.origin;
  if (!o) return false;
  return isAllowedOrigin(o);
}

/* ---------- server ---------- */
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    if (req.method === 'GET' && p === '/live.json') {
      const origin = req.headers.origin;
      const allow = isAllowedOrigin(origin) ? origin : ALLOWED_ORIGIN;
      return send(res, 200, publicState(), 'application/json', {
        'Cache-Control': 'public, max-age=5, stale-while-revalidate=10',
        'Access-Control-Allow-Origin': allow,
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Max-Age': '600'
      });
    }
    if (req.method === 'OPTIONS' && p === '/live.json') {
      const origin = req.headers.origin;
      const allow = isAllowedOrigin(origin) ? origin : ALLOWED_ORIGIN;
      return send(res, 204, '', 'text/plain', {
        'Access-Control-Allow-Origin': allow,
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Max-Age': '600'
      });
    }
    if (p === '/healthz') return send(res, 200, 'ok\n', 'text/plain', { 'Cache-Control': 'no-store' });

    if (req.method === 'POST' && p === '/login') {
      const k = ipKey(req);
      if (locked(k)) {
        res.setHeader('Retry-After', '900');
        return send(res, 429, loginPage('Too many attempts. Try again later.'), 'text/html');
      }
      let bodyStr = '';
      try {
        bodyStr = await body(req);
      } catch {
        return send(res, 400, loginPage('Bad request.'), 'text/html');
      }
      const params = new URLSearchParams(bodyStr);
      const pw = params.get('password') || '';
      if (!safeEq(sign(pw), sign(PASSWORD))) {
        fail(k);
        return send(res, 401, loginPage('Invalid credentials.'), 'text/html');
      }
      clearFail(k);
      const sess = makeSession();
      setCookie(res, sess, SESSION_HOURS * 3600);
      return send(res, 303, '', 'text/plain', { Location: '/admin' });
    }

    if (req.method === 'POST' && p === '/logout') {
      clearCookie(res);
      return send(res, 303, '', 'text/plain', { Location: '/admin' });
    }

    if (req.method === 'GET' && (p === '/' || p === '/admin')) {
      const c = cookies(req);
      const t = c[COOKIE_NAME];
      const s = parseSession(t);
      if (!s) {
        clearCookie(res);
        return send(res, 200, loginPage(), 'text/html');
      }
      const renewed = renewSession(t);
      if (renewed) setCookie(res, renewed, SESSION_HOURS * 3600);
      return send(res, 200, adminPage(s.csrf), 'text/html');
    }

    if (p.startsWith('/api/')) {
      const c = cookies(req);
      const t = c[COOKIE_NAME];
      const s = parseSession(t);
      if (!s) return send(res, 401, { error: 'Sign in first.' });
      const renewed = renewSession(t);
      if (renewed) setCookie(res, renewed, SESSION_HOURS * 3600);

      if (req.method !== 'GET') {
        if (!sameOrigin(req)) return send(res, 403, { error: 'Forbidden.' });
        let b = '';
        try {
          b = await body(req);
        } catch {
          return send(res, 400, { error: 'Bad request.' });
        }
        const hdrCsrf = req.headers['x-csrf-token'];
        let okCsrf = false;
        if (typeof hdrCsrf === 'string' && safeEq(hdrCsrf, s.csrf)) okCsrf = true;
        if (!okCsrf && b) {
          try {
            const jb = JSON.parse(b);
            if (jb && typeof jb.csrf === 'string' && safeEq(jb.csrf, s.csrf)) okCsrf = true;
          } catch {}
        }
        if (!okCsrf) return send(res, 403, { error: 'Invalid CSRF token.' });
        req._body = b;
      }

      const out = () => ({ ...publicState(), log: state.log, csrf: s.csrf });

      if (req.method === 'GET' && p === '/api/state') {
        return send(res, 200, out(), 'application/json', { 'Cache-Control': 'no-store' });
      }

      if (req.method === 'POST' && p === '/api/mode') {
        try {
          const bodyStr = req._body || (await body(req));
          const { mode } = JSON.parse(bodyStr || '{}');
          if (mode !== 'direct' && mode !== 'cdn') return send(res, 400, { error: 'Mode must be direct or cdn.' });
          if (!state.sources[mode] || !state.sources[mode].length) return send(res, 400, { error: `Add the ${mode} address first.` });
          if (state.mode !== mode) {
            state.mode = mode;
            note(`Switched to ${mode === 'cdn' ? 'CDN' : 'own server'}`);
            await save();
          }
          return send(res, 200, out());
        } catch {
          return send(res, 400, { error: 'Bad request.' });
        }
      }

      if (req.method === 'POST' && p === '/api/sources') {
        try {
          const bodyStr = req._body || (await body(req));
          const { direct, cdn } = JSON.parse(bodyStr || '{}');
          const d = toList(direct);
          const c = toList(cdn);
          const all = [...d, ...c];
          if (all.some((u) => !validUrl(u))) {
            return send(res, 400, { error: 'Each address must start with https:// and end with .m3u8.' });
          }
          if (d.length > 6 || c.length > 6) {
            return send(res, 400, { error: 'Six addresses at most per source.' });
          }
          state.sources = { direct: d, cdn: c };
          if (!state.sources[state.mode] || !state.sources[state.mode].length) {
            state.mode = state.sources.direct.length ? 'direct' : 'cdn';
          }
          note('Updated addresses');
          await save();
          return send(res, 200, out());
        } catch {
          return send(res, 400, { error: 'Bad request.' });
        }
      }
    }

    send(res, 404, { error: 'Not found' });
  } catch (e) {
    send(res, 400, { error: 'Bad request' });
  }
});

server.listen(PORT, () => {
  console.log(`Gaafu TV switch on :${PORT}`);
});

/* ---------- pages ---------- */
const css = `
:root{--canvas:#fdf8f5;--panel:#fff5f3;--ink:#3d080c;--soft:rgba(61,8,12,.62);--red:#d81a24;--line:#f1ddd8;--line2:#e8c8c1}
*{box-sizing:border-box}body{margin:0;background:var(--canvas);color:var(--ink);font:15px/22px "Space Grotesk",system-ui,sans-serif;padding:24px 20px}
main{max-width:560px;margin:0 auto}h1{font-size:26px;letter-spacing:-.02em;margin:0 0 4px}p{margin:0 0 16px;color:var(--soft)}
.card{background:#fff;border:1px solid var(--line);border-radius:8px;padding:20px;margin-bottom:16px}
label{display:block;font-weight:600;font-size:12px;letter-spacing:.08em;text-transform:uppercase;margin-bottom:6px}
input,textarea{width:100%;padding:10px 12px;border:1px solid var(--line2);border-radius:4px;font:inherit;color:var(--ink);margin-bottom:14px;resize:vertical}
input:focus,textarea:focus{outline:2px solid var(--red);outline-offset:0}
button{font:inherit;font-weight:600;letter-spacing:.04em;text-transform:uppercase;font-size:13px;border-radius:4px;padding:12px 18px;cursor:pointer;border:1.5px solid var(--ink);background:transparent;color:var(--ink)}
button.go{background:var(--red);border-color:var(--red);color:#fff}button:hover{border-color:var(--red)}
.seg{display:grid;grid-template-columns:1fr 1fr;gap:10px}.seg button{padding:20px 12px;text-align:center;line-height:1.3}
.seg button small{display:block;font-weight:500;letter-spacing:0;text-transform:none;font-size:13px;margin-top:4px;opacity:.8}
.seg button.on{background:var(--red);border-color:var(--red);color:#fff}
.msg{min-height:22px;margin:12px 0 0;font-weight:500}.err{color:#ba1a1a}ul{margin:0;padding:0;list-style:none}li{padding:8px 0;border-top:1px solid var(--line);font-size:14px}li:first-child{border-top:0}
li time{color:var(--soft);font-variant-numeric:tabular-nums;margin-right:8px}`;

const shell = (inner) => `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Gaafu TV Switch</title><style>${css}</style><body><main>${inner}</main></body></html>`;

function loginPage(msg = '') {
  return shell(
    `<h1>Gaafu TV</h1><p>Stream source switch</p><form class="card" method="post" action="/login" autocomplete="off"><label for="pw">Password</label><input id="pw" name="password" type="password" autocomplete="current-password" required autofocus><button class="go" type="submit">Sign in</button><p class="msg err">${msg.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</p></form>`
  );
}

function adminPage(csrf) {
  const csrfInput = `<input type="hidden" id="csrf" value="${csrf.replace(/"/g,'&quot;')}">`;
  return shell(`
<h1>Stream source</h1><p>Choose where viewers get the video from.</p>
${csrfInput}
<div class="card">
  <div class="seg" role="group" aria-label="Source">
    <button id="b-direct" type="button">Own server<small>Everyday</small></button>
    <button id="b-cdn" type="button">CDN<small>Big events</small></button>
  </div>
  <p class="msg" id="msg" role="status" aria-live="polite"></p>
  <p style="margin:8px 0 0;font-size:13px">People already watching move over by themselves within about two minutes. Switch to the CDN before the crowd arrives.</p>
</div>
<form class="card" id="src">
  <label for="d">Own servers (one address per line)</label><textarea id="d" rows="3" placeholder="https://a.gaafu.tv/hls/live.m3u8&#10;https://b.gaafu.tv/hls/live.m3u8"></textarea>
  <label for="c">CDN (one address per line)</label><textarea id="c" rows="2" placeholder="https://cdn.gaafu.tv/hls/live.m3u8"></textarea>
  <p style="font-size:13px;margin:0 0 14px">With more than one address, each viewer gets a random server and moves to the next if one fails.</p>
  <button type="submit">Save addresses</button>
</form>
<div class="card"><label>Recent changes</label><ul id="log"></ul></div>
<form method="post" action="/logout"><button type="submit">Sign out</button></form>
<script>
const $=id=>document.getElementById(id);
const say=(t,bad)=>{const m=$('msg');m.textContent=t;m.className='msg'+(bad?' err':'')};
const csrf=($('csrf')&&$('csrf').value)||'';
function paint(s){
  $('b-direct').className=s.mode==='direct'?'on':'';
  $('b-cdn').className=s.mode==='cdn'?'on':'';
  $('b-direct').setAttribute('aria-pressed',s.mode==='direct');
  $('b-cdn').setAttribute('aria-pressed',s.mode==='cdn');
  if(document.activeElement!==$('d'))$('d').value=(s.sources.direct||[]).join('\\n');
  if(document.activeElement!==$('c'))$('c').value=(s.sources.cdn||[]).join('\\n');
  const ul=$('log');ul.textContent='';
  (s.log||[]).slice(0,8).forEach(e=>{
    const li=document.createElement('li');
    const t=document.createElement('time');
    try{t.textContent=new Date(e.at).toLocaleString([], {dateStyle:'medium',timeStyle:'short'});}catch{t.textContent=e.at||''}
    li.append(t,document.createTextNode(' '+e.what));
    ul.append(li);
  });
  if(!s.log||!s.log.length){const li=document.createElement('li');li.textContent='Nothing yet';ul.append(li)}
}
async function call(path,data){
  const headers={'Content-Type':'application/json'};
  if(data){headers['X-CSRF-Token']=csrf;}
  const r=await fetch(path,{method:data?'POST':'GET',headers,body:data?JSON.stringify(Object.assign({csrf},data)):undefined,credentials:'same-origin'});
  const ct=r.headers.get('content-type')||'';
  const j=ct.includes('application/json')?await r.json().catch(()=>({})):await r.text().then(()=>({}));
  if(!r.ok)throw new Error(j.error||'Something went wrong.');
  return j;
}
async function setMode(mode){try{const s=await call('/api/mode',{mode});paint(s);say(mode==='cdn'?'Now serving from the CDN.':'Now serving from your own server.')}catch(e){say(e.message,true)}}
$('b-direct').onclick=()=>setMode('direct');$('b-cdn').onclick=()=>setMode('cdn');
$('src').onsubmit=async e=>{e.preventDefault();try{const s=await call('/api/sources',{direct:$('d').value,cdn:$('c').value});paint(s);say('Addresses saved.')}catch(x){say(x.message,true)}};
call('/api/state').then(paint).catch(()=>location.reload());
</script>`);
}
