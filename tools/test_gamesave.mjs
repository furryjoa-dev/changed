// 게임 자체의 저장/불러오기 UI 를 끝까지 테스트: (인트로 건너뛰고) 저장 화면 -> 저장 -> 새로고침 -> 타이틀 CONTINUE -> 불러오기
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { serve } from './serve.mjs';
const out = process.argv[2] || 'gs';
const exe = fs.readdirSync('/opt/pw-browsers').filter((d) => d.startsWith('chromium-')).map((d) => `/opt/pw-browsers/${d}/chrome-linux/chrome`).find((p) => fs.existsSync(p));
const srv = await serve(8127);
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 544, height: 416 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
page.on('console', (m) => { const t = m.text(); if (/FATAL|Error|error/.test(t) && !/willRead/.test(t)) console.log('[console]', t.slice(0, 300)); });
const url = 'http://localhost:8127/index.html?autostart&nosw&prof';
const frames = () => page.evaluate(() => globalThis.__frames || 0);
const waitFrames = async (n) => { const f0 = await frames(); await page.waitForFunction((t) => globalThis.__frames > t, f0 + n, { timeout: 120000 }); };
const key = async (k, hold = 120) => { await page.keyboard.down(k); await page.waitForTimeout(hold); await page.keyboard.up(k); await page.waitForTimeout(250); };
const rb = (c) => page.evaluate((c) => globalThis.__rb(c), c);
const ready = () => page.waitForFunction(() => typeof globalThis.__rb === 'function' && globalThis.__frames > 40, null, { timeout: 150000 });

await page.goto(url); await ready();
await waitFrames(30); await key('Enter');              // 타이틀: START
await page.waitForTimeout(8000);
console.log('A scene:', await rb('$scene.class.to_s'));
await rb('$game_map.interpreter.clear; $game_message.clear; $game_message.visible = false; $game_map.screen.clear; $game_map.screen.start_tone_change(Tone.new(0,0,0,0),1); $game_map.screen.pictures.each { |p| p.erase if p }; nil');
await rb('$game_player.reserve_transfer(1, 8, 6, 2); nil'); await page.waitForTimeout(4000);
await rb('$scene = Scene_File.new(true, false, false); nil'); await page.waitForTimeout(3000);
console.log('B scene:', await rb('$scene.class.to_s'));
await page.screenshot({ path: `${out}_1_savescreen.png` });
await key('Enter'); await page.waitForTimeout(3000);   // 슬롯 선택 -> 저장
console.log('C after save, scene:', await rb('$scene.class.to_s'), '| files:', await rb("Dir['Saves/*'].inspect"));
await page.screenshot({ path: `${out}_2_aftersave.png` });
await page.waitForTimeout(2500);                          // IndexedDB 반영 대기
await page.reload(); await ready(); await waitFrames(30);
await page.screenshot({ path: `${out}_3_title.png` });
console.log('D after reload scene:', await rb('$scene.class.to_s'), '| files:', await rb("Dir['Saves/*'].inspect"));
await key('Enter'); await page.waitForTimeout(3500);   // CONTINUE (세이브가 있으면 커서가 이미 CONTINUE)
console.log('E scene:', await rb('$scene.class.to_s'));
await page.screenshot({ path: `${out}_4_loadscreen.png` });
await key('Enter'); await page.waitForTimeout(12000);    // 불러오기 (페이드 포함)
console.log('F scene:', await rb('$scene.class.to_s'), '| map:', await rb('$game_map.map_id.to_s'));
await page.screenshot({ path: `${out}_5_loaded.png` });
await browser.close(); srv.close();
