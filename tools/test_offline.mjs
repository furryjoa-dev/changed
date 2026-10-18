// 서비스 워커 오프라인 테스트: 한 번 로드 -> 캐시 채움 -> 네트워크 차단 -> 새로고침해도 게임이 뜨는지
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { serve } from './serve.mjs';
const exe = fs.readdirSync('/opt/pw-browsers').filter((d) => d.startsWith('chromium-')).map((d) => `/opt/pw-browsers/${d}/chrome-linux/chrome`).find((p) => fs.existsSync(p));
const srv = await serve(8126);
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 544, height: 416 } });
const page = await ctx.newPage();
page.on('requestfailed', (r) => console.log('[reqfailed]', r.url().slice(0, 120), r.failure()?.errorText));
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
page.on('console', (m) => { const t = m.text(); if (/error|fail|Fatal/i.test(t) && !/willRead|404/.test(t)) console.log('[console]', t.slice(0, 200)); });
const running = () => page.waitForFunction(() => globalThis.__frames > 60, null, { timeout: 90000 });
const t0 = Date.now(); const T = () => ((Date.now() - t0) / 1000).toFixed(0) + 's';
await page.goto('http://localhost:8126/index.html?autostart'); await running();
console.log(T(), 'first load running; controller =', await page.evaluate(() => !!navigator.serviceWorker.controller));
await page.waitForTimeout(70000);   // 백그라운드 prefetch 로 캐시 채우는 시간
const keys = await page.evaluate(async () => { const o = {}; for (const k of await caches.keys()) o[k] = (await (await caches.open(k)).keys()).length; return o; });
console.log(T(), 'controller:', await page.evaluate(() => !!navigator.serviceWorker.controller), 'caches:', JSON.stringify(keys));
await ctx.setOffline(true);
await page.reload();
await page.waitForTimeout(20000);
console.log(T(), 'status:', await page.evaluate(() => document.getElementById('status')?.textContent + ' | frames=' + globalThis.__frames + ' | fatal=' + document.getElementById('fatal')?.textContent?.slice(0,200)));
await running();
console.log(T(), 'OFFLINE reload running; frames =', await page.evaluate(() => globalThis.__frames));
await page.screenshot({ path: process.argv[2] || 'offline.png' });
await browser.close(); srv.close();
