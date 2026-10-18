// 모바일 에뮬레이션(터치) 스크린샷. 사용: node tools/shot_mobile.mjs <outprefix> <portrait|landscape> <대기초> [--touch=C@36+2.2x10,dpad:right@100:1.5] [--shots=60,90]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { serve } from './serve.mjs';

const arg = (n) => (process.argv.find((a) => a.startsWith(`--${n}=`)) || '').slice(n.length + 3);
const out = process.argv[2], mode = process.argv[3] || 'portrait', wait = +(process.argv[4] || 60);
const vp = mode === 'portrait' ? { width: 390, height: 844 } : { width: 844, height: 390 };
const exe = fs.readdirSync('/opt/pw-browsers').filter((d) => d.startsWith('chromium-')).map((d) => `/opt/pw-browsers/${d}/chrome-linux/chrome`).find((p) => fs.existsSync(p));
const srv = await serve(+process.env.PORT || 8124);
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: vp, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
const T0 = Date.now(); const now = () => (Date.now() - T0) / 1000;
page.on('console', (m) => { const t = m.text(); if (/wasi:|willReadFrequently|\[prof\]|\[gc\]/.test(t)) return; console.log(`[${now().toFixed(1)}s]`, t.slice(0, 300)); });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 500)));
await page.goto(`http://localhost:${process.env.PORT || 8124}/index.html?autostart&nosw`);

const events = [];
for (const s of arg('touch').split(',').filter(Boolean)) {
  const m = s.match(/^([\w:]+)@([\d.]+)(?:\+([\d.]+)x(\d+))?(?::([\d.]+))?$/);
  if (!m) continue;
  const [, target, t, step, n, dur] = m;
  for (let i = 0; i < (n ? +n : 1); i++) events.push({ target, t: +t + i * (+step || 0), dur: dur ? +dur * 1000 : 150 });
}
const shots = arg('shots').split(',').filter(Boolean).map(Number);
const tl = [...events.map((e) => ({ t: e.t, e })), ...shots.map((t) => ({ t, shot: t }))].sort((a, b) => a.t - b.t);

async function point(target) {
  return page.evaluate((target) => {
    if (target.startsWith('dpad:')) {
      const r = document.querySelector('#dpad').getBoundingClientRect(), d = target.slice(5);
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2, o = r.width * 0.38;
      return { x: cx + (d === 'right' ? o : d === 'left' ? -o : 0), y: cy + (d === 'down' ? o : d === 'up' ? -o : 0) };
    }
    const r = document.querySelector(`[data-key=${target}]`).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, target);
}
for (const it of tl) {
  const dt = it.t * 1000 - (Date.now() - T0);
  if (dt > 0) await page.waitForTimeout(dt);
  if (it.e) {
    const p = await point(it.e.target);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y, id: 1 }] });
    await page.waitForTimeout(it.e.dur);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else await page.screenshot({ path: `${out}_${mode}_${it.shot}.png` });
}
const rest = wait * 1000 - (Date.now() - T0);
if (rest > 0) await page.waitForTimeout(rest);
const fatal = await page.evaluate(() => { const f = document.getElementById('fatal'); return f && !f.hidden ? f.textContent : ''; });
if (fatal) console.log('[FATAL]\n' + fatal);
await page.screenshot({ path: `${out}_${mode}_end.png` });
await browser.close(); srv.close();
