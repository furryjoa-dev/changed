// 헤드리스 Chromium 으로 게임을 열어 로그/스크린샷을 수집한다.
// 사용: node tools/shot.mjs <out.png> [대기초] [--keys=Enter@5,ArrowDown@8 ...]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { serve } from './serve.mjs';

const out = process.argv[2] || 'shot.png';
const wait = +(process.argv[3] || 20);
const keys = (process.argv.find((a) => a.startsWith('--keys=')) || '').slice(7).split(',').filter(Boolean)
  .map((s) => { const [k, t] = s.split('@'); return { k, t: +t }; });
const exe = fs.readdirSync('/opt/pw-browsers').filter((d) => d.startsWith('chromium-')).map((d) => `/opt/pw-browsers/${d}/chrome-linux/chrome`).find((p) => fs.existsSync(p));
const srv = await serve(8123);
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 544, height: 416 } });
const T0 = Date.now();
page.on('console', (m) => console.log(`[${((Date.now() - T0) / 1000).toFixed(1)}s]`, m.text().slice(0, 600)));
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 800)));
await page.goto('http://localhost:8123/index.html');
const t0 = Date.now();
for (const { k, t } of keys.sort((a, b) => a.t - b.t)) {
  const dt = t * 1000 - (Date.now() - t0);
  if (dt > 0) await page.waitForTimeout(dt);
  await page.keyboard.down(k); await page.waitForTimeout(120); await page.keyboard.up(k);
}
const rest = wait * 1000 - (Date.now() - t0);
if (rest > 0) await page.waitForTimeout(rest);
const fatal = await page.evaluate(() => { const f = document.getElementById('fatal'); return f && !f.hidden ? f.textContent : ''; });
if (fatal) console.log('[FATAL]\n' + fatal);
await page.screenshot({ path: out });
await browser.close(); srv.close();
