// 세이브 영속화 테스트: Ruby 에서 Saves/ 에 파일을 쓰고, 새로고침 후에도 남아있는지 확인
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { serve } from './serve.mjs';
const exe = fs.readdirSync('/opt/pw-browsers').filter((d) => d.startsWith('chromium-')).map((d) => `/opt/pw-browsers/${d}/chrome-linux/chrome`).find((p) => fs.existsSync(p));
const srv = await serve(8125);
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const ctx = await browser.newContext();
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
const url = 'http://localhost:8125/index.html?autostart&nosw&prof';
const ready = async () => { await page.waitForFunction(() => typeof globalThis.__rb === 'function' && globalThis.__frames > 30, null, { timeout: 120000 }); };
await page.goto(url); await ready();
console.log('write:', await page.evaluate(() => __rb(`
  data = Marshal.dump({ 'hello' => '세이브 테스트', 'n' => (1..1000).to_a })
  File.open('Saves/Save1.rvdata', 'wb') { |f| f.write(data) }
  "wrote #{data.bytesize} bytes, entries=#{Dir['Saves/*'].inspect}"`)));
await page.waitForTimeout(3000);
await page.reload(); await ready();
console.log('after reload:', await page.evaluate(() => __rb(`
  if File.exist?('Saves/Save1.rvdata')
    h = Marshal.load(File.binread('Saves/Save1.rvdata'))
    "restored: #{h['hello'].force_encoding('UTF-8')} #{h['n'].size} entries=#{Dir['Saves/*'].inspect}"
  else "MISSING" end`)));
await browser.close(); srv.close();
