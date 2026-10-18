// 헤드리스 Chromium 으로 게임을 열어 로그/스크린샷/FPS 를 수집한다.
// 사용: node tools/shot.mjs <outprefix> <대기초> [--keys=Enter@44,ArrowDown@50+0.5x10 ...] [--shots=60,80,100] [--hold=ArrowRight@70:2]
//   Key@t           : t초에 키를 짧게 누름
//   Key@t+stepxN    : t초부터 step초 간격으로 N번
//   Key@t:dur       : t초에 dur초 동안 누르고 있음
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { serve } from './serve.mjs';

const arg = (n) => (process.argv.find((a) => a.startsWith(`--${n}=`)) || '').slice(n.length + 3);
const out = process.argv[2] || 'shot';
const wait = +(process.argv[3] || 20);
const events = [];
for (const s of arg('keys').split(',').filter(Boolean)) {
  const m = s.match(/^(\w+)@([\d.]+)(?:\+([\d.]+)x(\d+))?(?::([\d.]+))?$/);
  if (!m) continue;
  const [, k, t, step, n, dur] = m;
  const count = n ? +n : 1;
  for (let i = 0; i < count; i++) events.push({ k, t: +t + i * (+step || 0), dur: dur ? +dur * 1000 : 120 });
}
events.sort((a, b) => a.t - b.t);
const jsEvals = arg('js').split(';;').filter(Boolean).map((e) => { const i = e.lastIndexOf('@'); return { t: +e.slice(i + 1), code: e.slice(0, i) }; });
const evals = arg('eval').split(';;').filter(Boolean).map((e) => { const i = e.lastIndexOf('@'); return { t: +e.slice(i + 1), code: e.slice(0, i) }; });
const throttle = arg('throttle').split('@');   // 예: --throttle=4@45  (45초부터 CPU 4배 느리게)
const shots = arg('shots').split(',').filter(Boolean).map(Number);
const exe = fs.readdirSync('/opt/pw-browsers').filter((d) => d.startsWith('chromium-')).map((d) => `/opt/pw-browsers/${d}/chrome-linux/chrome`).find((p) => fs.existsSync(p));
const srv = await serve(8123);
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 544, height: 416 } });
const T0 = Date.now();
const now = () => (Date.now() - T0) / 1000;
page.on('console', (m) => { const t = m.text(); if (/wasi:|willReadFrequently|404/.test(t)) return; console.log(`[${now().toFixed(1)}s]`, t.slice(0, 700)); });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 800)));
await page.goto('http://localhost:8123/index.html' + '?autostart&nosw' + (arg('q') ? '&' + arg('q') : ''));

if (throttle[0]) { const cdp = await page.context().newCDPSession(page); setTimeout(() => cdp.send('Emulation.setCPUThrottlingRate', { rate: +throttle[0] }), +(throttle[1] || 0) * 1000); }
const timeline = [...events.map((e) => ({ t: e.t, e })), ...shots.map((t) => ({ t, shot: t })), ...evals.map((e) => ({ t: e.t, ev: e.code })), ...jsEvals.map((e) => ({ t: e.t, js: e.code }))].sort((a, b) => a.t - b.t);
let lastFrames = 0, lastT = 0;
for (const it of timeline) {
  const dt = it.t * 1000 - (Date.now() - T0);
  if (dt > 0) await page.waitForTimeout(dt);
  if (it.js) { try { console.log(`[js ${it.t}s]`, JSON.stringify(await page.evaluate((c) => eval(c), it.js))); } catch (e) { console.log('[js error]', String(e).slice(0, 300)); } }
  else if (it.ev) { try { console.log(`[eval ${it.t}s]`, await page.evaluate((c) => globalThis.__rb(c), it.ev)); } catch (e) { console.log('[eval error]', String(e).slice(0, 300)); } }
  else if (it.e) { await page.keyboard.down(it.e.k); await page.waitForTimeout(it.e.dur); await page.keyboard.up(it.e.k); }
  else {
    const f = await page.evaluate(() => globalThis.__frames || 0);
    const fps = (f - lastFrames) / Math.max(0.001, now() - lastT);
    console.log(`[shot ${it.shot}s] frames=${f} fps≈${fps.toFixed(1)}`);
    lastFrames = f; lastT = now();
    await page.screenshot({ path: `${out}_${it.shot}.png` });
  }
}
const rest = wait * 1000 - (Date.now() - T0);
if (rest > 0) await page.waitForTimeout(rest);
const fatal = await page.evaluate(() => { const f = document.getElementById('fatal'); return f && !f.hidden ? f.textContent : ''; });
if (fatal) console.log('[FATAL]\n' + fatal);
await page.screenshot({ path: `${out}_end.png` });
await browser.close(); srv.close();
