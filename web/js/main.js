// 부팅: ruby.wasm + RGSS 호환 런타임을 올리고 게임을 시작한다.
import { WASI, PreopenDirectory, File, Directory, OpenFile, ConsoleStdout } from '@bjorn3/browser_wasi_shim';
import { RubyVM } from '@ruby/wasm-wasi';
import { assets } from './assets.js';
import * as bm from './bitmap.js';
import * as disp from './display.js';
import { initInput, initTouchControls, keyMask } from './input.js';
import { audioPlay, audioStop, audioFade, unlockAudio } from './audio.js';

const $ = (s) => document.querySelector(s);
const enc = new TextEncoder();
const params = new URLSearchParams(location.search);
const BASE = new URL('.', document.baseURI).href;

// ------------------------------------------------------------ UI 보조
const t0 = performance.now();
const mark = (l) => console.log(`[boot +${((performance.now() - t0) / 1000).toFixed(2)}s] ${l}`);
function setStatus(text, pct) {
  const el = $('#status'); if (el) el.textContent = text;
  const bar = $('#bar'); if (bar && pct != null) bar.style.width = Math.round(pct * 100) + '%';
}
function showFatal(msg) {
  console.error(msg);
  const el = $('#fatal');
  if (el) { el.textContent = msg; el.hidden = false; }
  $('#boot')?.classList.add('hidden');
}

// ------------------------------------------------------------ 세이브 영속화 (IndexedDB)
const DB = 'changed-web-saves';
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('files');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
const idbAll = (db) => new Promise((res, rej) => {
  const out = [];
  const q = db.transaction('files').objectStore('files').openCursor();
  q.onsuccess = () => { const c = q.result; if (c) { out.push([c.key, c.value]); c.continue(); } else res(out); };
  q.onerror = () => rej(q.error);
});
const idbPut = (db, k, v) => new Promise((res, rej) => { const t = db.transaction('files', 'readwrite'); t.objectStore('files').put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); });
const idbDel = (db, k) => new Promise((res, rej) => { const t = db.transaction('files', 'readwrite'); t.objectStore('files').delete(k); t.oncomplete = res; t.onerror = () => rej(t.error); });

async function setupSaves(savesDir) {
  let db = null;
  try { db = await idb(); } catch (e) { console.warn('IndexedDB unavailable: saves are session-only', e); return; }
  for (const [k, v] of await idbAll(db)) savesDir.contents.set(k, new File(v));
  const seen = new Map(); // 이름 -> [data 참조, 길이]
  for (const [k, f] of savesDir.contents) seen.set(k, [f.data, f.data.length]);
  setInterval(() => {
    for (const [name, f] of savesDir.contents) {
      const s = seen.get(name);
      if (!(f instanceof File)) continue;
      if (!s || s[0] !== f.data || s[1] !== f.data.length) { seen.set(name, [f.data, f.data.length]); idbPut(db, name, f.data.slice()).catch(console.error); }
    }
    for (const name of [...seen.keys()]) if (!savesDir.contents.has(name)) { seen.delete(name); idbDel(db, name).catch(console.error); }
  }, 1000);
}

// ------------------------------------------------------------ 브리지 (Ruby $js)
function b64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}

let gameEndedResolve;
const gameEnded = new Promise((r) => (gameEndedResolve = r));

const RGSS = {
  log: (s) => console.log(s),
  fatal: (s) => showFatal(s),
  gameEnded: () => gameEndedResolve(),
  readB64: (path) => {
    const rel = assets.resolve(path);
    if (!rel) return '';
    const u = assets.bytesSync(rel);
    return u ? b64(u) : '';
  },
  keyMask,
  wasmMemKB: () => (globalThis.__wasmMem ? globalThis.__wasmMem.buffer.byteLength / 1024 : 0),
  ...Object.fromEntries(Object.entries(bm).filter(([k]) => /^bm[A-Z]/.test(k))),
  objNew: disp.objNew, objUpdate: disp.objUpdate, objDispose: disp.objDispose,
  tmSetMap: disp.tmSetMap, tmSetPass: disp.tmSetPass,
  gFreeze: disp.gFreeze, gTransEnd: disp.gTransEnd, gTransStep: disp.gTransStep,
  gBrightness: disp.gBrightness, gSnap: disp.gSnap,
  frame: disp.frame, frameReset: disp.frameReset,
  audioPlay, audioStop, audioFade,
};
let transMapBm = -1;
RGSS.gTransBegin = (filename, vague) => {
  transMapBm = filename ? bm.bmLoad(filename) : -1;
  disp.gTransBegin(transMapBm, vague);
};
{
  const end = RGSS.gTransEnd;
  RGSS.gTransEnd = () => { end(); if (transMapBm >= 0) { bm.bmDispose(transMapBm); transMapBm = -1; } };
}
globalThis.RGSS = RGSS;

// ------------------------------------------------------------ 부팅
async function fetchWithProgress(url, label) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${label} 로드 실패 (${r.status})`);
  const total = +r.headers.get('content-length') || 0;
  const reader = r.body.getReader();
  const chunks = []; let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); got += value.length;
    setStatus(`${label} ${(got / 1048576).toFixed(1)}MB` + (total ? ` / ${(total / 1048576).toFixed(1)}MB` : ''), total ? got / total : null);
  }
  const out = new Uint8Array(got); let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

async function loadFont() {
  const rel = assets.resolve('Fonts/Unifont.ttf');
  if (!rel) return;
  try {
    const f = new FontFace('Unifont', `url(${assets.url(rel)})`);
    await f.load();
    document.fonts.add(f);
  } catch (e) { console.warn('font load failed', e); }
}

async function main() {
  disp.initScreen($('#screen'));
  initInput(unlockAudio);
  const touch = $('#touch');
  if (touch) initTouchControls(touch);

  setStatus('에셋 목록 불러오는 중…', 0);
  await assets.init(BASE);

  const RB = ['00_core.rb', '05_rpg_classes.rb', '06_rpg_methods.rb', '10_gfx.rb', '20_input_audio.rb', '90_boot.rb'];
  const [wasmBytes, rbTexts] = await Promise.all([
    fetchWithProgress(BASE + 'web/ruby/ruby+stdlib.wasm', 'Ruby 런타임'),
    Promise.all(RB.map(async (n) => [n, await (await fetch(BASE + 'web/rgss/' + n + '?v=' + (params.get('v') || ''))).text()])),
    loadFont(),
  ]).then((r) => [r[0], r[1]]);

  mark('assets+wasm fetched');
  setStatus('런타임 컴파일 중…', 1);
  const module = await WebAssembly.compile(wasmBytes);
  mark('wasm compiled');

  // 핵심 데이터 선로딩 후 나머지는 백그라운드에서
  setStatus('게임 데이터 불러오는 중…', 0);
  const allFiles = Object.values(assets.files);
  const core = allFiles.filter((f) => /^Data\//.test(f) || /^Graphics\/System\//.test(f));
  await assets.prefetch(core, 6, (d, t) => setStatus(`게임 데이터 ${d}/${t}`, d / t));

  mark('core data prefetched');
  const savesDir = new Directory(new Map());
  await setupSaves(savesDir);
  const fds = [
    new OpenFile(new File([])),
    ConsoleStdout.lineBuffered((m) => console.log('[ruby]', m)),
    ConsoleStdout.lineBuffered((m) => console.warn('[ruby:err]', m)),
    new PreopenDirectory('/game', new Map([['Saves', savesDir]])),
    new PreopenDirectory('/rgss', new Map(rbTexts.map(([n, t]) => [n, new File(enc.encode(t))]))),
  ];
  const wasi = new WASI(['ruby.exe'], ['RUBY_FIBER_MACHINE_STACK_SIZE=2097152'], fds);
  const vm = new RubyVM();
  const imports = { wasi_snapshot_preview1: wasi.wasiImport };
  vm.addToImports(imports);
  const instance = await WebAssembly.instantiate(module, imports);
  await vm.setInstance(instance);
  globalThis.__wasmMem = instance.exports.memory;
  wasi.initialize(instance);
  mark('wasm instantiated');
  vm.initialize(['ruby.exe', '--disable-gems', '-EUTF-8', '-e_=0']);
  mark('ruby initialized');

  setStatus('준비 완료', 1);
  // 브라우저는 사용자 입력 전에는 소리를 낼 수 없으므로 시작 화면에서 입력을 한 번 받는다
  await new Promise((resolve) => {
    const start = $('#start'), btn = $('#startBtn');
    start.hidden = false;
    $('#boot')?.classList.add('hidden');
    const go = () => {
      removeEventListener('keydown', onKey); start.hidden = true; unlockAudio();
      if (matchMedia('(pointer: coarse)').matches && !document.fullscreenElement && document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().then(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch(() => {});
      }
      resolve();
    };
    const onKey = (e) => { if (e.code === 'Enter' || e.code === 'Space') go(); };
    btn.addEventListener('click', go, { once: true });
    addEventListener('keydown', onKey);
    if (params.has('autostart')) go();
  });

  // 나머지 에셋은 게임이 도는 동안 백그라운드로 내려받는다
  const rest = allFiles.filter((f) => !core.includes(f) && !/\.ttf$/i.test(f));
  const warm = Object.values(assets.audio).filter((u, i, a) => a.indexOf(u) === i);
  setTimeout(() => assets.prefetch(rest.concat(warm), 3, undefined, false), 3000);

  if (params.has('prof')) globalThis.__rb = (code) => vm.eval(code).toString();
  mark('starting game');
  try {
    await vm.evalAsync("Dir['/rgss/*.rb'].sort.each { |f| load f }");
  } catch (e) {
    showFatal(String(e && e.message || e));
    return;
  }
  await gameEnded;
}

main().catch((e) => showFatal(String(e && e.stack || e)));
