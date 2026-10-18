// 노드에서 RGSS Ruby 레이어 + 실제 게임 스크립트를 돌리는 하네스 (렌더링/오디오는 스텁).
// Ruby 쪽 성능/메모리 문제를 브라우저 없이 빠르게 재현하기 위한 도구.
// 사용: node tools/node_harness.mjs [frames=3000] [--prof]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WASI, PreopenDirectory, File, Directory, OpenFile, ConsoleStdout } from '@bjorn3/browser_wasi_shim';
import { RubyVM } from '@ruby/wasm-wasi';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FRAMES = +(process.argv[2] || 3000);
const PROF = process.argv.includes('--prof');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'web/manifest.json'), 'utf8'));
const norm = (s) => s.replace(/\\/g, '/').normalize('NFC').toLowerCase();
const resolve = (p, exts = ['']) => { for (const e of exts) { const r = manifest.files[norm(p) + e]; if (r) return r; } return null; };

const bmSize = new Map(); let nextBm = 1, nextObj = 1;
const addBm = (w, h) => { bmSize.set(nextBm, [w, h]); return nextBm++; };
let frames = 0, mem;
const startT = Date.now();
globalThis.RGSS = {
  log: (s) => console.log(s), fatal: (s) => { console.log('FATAL', s); process.exit(1); }, gameEnded: () => { console.log('game ended'); process.exit(0); },
  readB64: (p) => { const r = resolve(p); return r ? fs.readFileSync(path.join(root, r)).toString('base64') : ''; },
  keyMask: () => (frames > 120 && frames % 40 < 3) ? 2 ** 13 : 0,   // 주기적으로 C(확인) 입력
  wasmMemKB: () => mem.buffer.byteLength / 1024,
  bmNew: (w, h) => addBm(w, h),
  bmLoad: (p) => {
    const r = resolve(p, ['', '.png']); if (!r) return -1;
    const d = fs.readFileSync(path.join(root, r)); return addBm(d.readUInt32BE(16), d.readUInt32BE(20));
  },
  bmW: (i) => bmSize.get(i)[0], bmH: (i) => bmSize.get(i)[1], bmDispose: (i) => bmSize.delete(i), bmCount: () => bmSize.size,
  bmBlt() {}, bmStretch() {}, bmFill() {}, bmClear() {}, bmClearRect() {}, bmGradient() {}, bmGet: () => 0, bmSet() {}, bmHue() {}, bmBlur() {}, bmRadial() {},
  bmText() {}, bmTextW: (s, n, size) => s.length * size * 0.6, bmGetRaw: () => '', bmSetRaw() {},
  objNew: () => nextObj++, objUpdate() {}, objDispose() {}, tmSetMap() {}, tmSetPass() {},
  gFreeze() {}, gTransBegin() {}, gTransStep() {}, gTransEnd() {}, gBrightness() {}, gSnap: () => addBm(544, 416),
  frameReset() {}, audioPlay() {}, audioStop() {}, audioFade() {},
  frame: () => {
    frames++;
    if (frames % 600 === 0) console.log(`[node] frames=${frames} mem=${(mem.buffer.byteLength / 1048576).toFixed(0)}MB t=${((Date.now() - startT) / 1000).toFixed(1)}s`);
    if (frames >= FRAMES) { console.log('done'); process.exit(0); }
    return Promise.resolve(1);
  },
};
globalThis.location = { search: PROF ? '?prof' : '' };

const enc = new TextEncoder();
const rgssDir = path.join(root, 'web/rgss');
const rb = fs.readdirSync(rgssDir).filter((f) => f.endsWith('.rb')).sort();
const dataFiles = new Map();
const savesDir = new Directory(new Map());
const module = await WebAssembly.compile(fs.readFileSync(path.join(root, 'web/ruby/ruby+stdlib.wasm')));
const fds = [
  new OpenFile(new File([])), ConsoleStdout.lineBuffered((m) => console.log('[ruby]', m)), ConsoleStdout.lineBuffered((m) => console.log('[err]', m)),
  new PreopenDirectory('/game', new Map([['Saves', savesDir]])),
  new PreopenDirectory('/exp', new Map(process.env.EXP ? [['exp.rb', new File(fs.readFileSync(process.env.EXP))]] : [])),
  new PreopenDirectory('/rgss', new Map(rb.map((n) => [n, new File(fs.readFileSync(path.join(rgssDir, n)))]))),
];
const wasi = new WASI(['ruby.exe'], (process.env.FIBER_SZ ? ['RUBY_FIBER_MACHINE_STACK_SIZE=' + process.env.FIBER_SZ] : []), fds);
const vm = new RubyVM();
const imports = { wasi_snapshot_preview1: wasi.wasiImport };
vm.addToImports(imports);
const instance = await WebAssembly.instantiate(module, imports);
await vm.setInstance(instance);
mem = instance.exports.memory;
wasi.initialize(instance);
vm.initialize(['ruby.exe', '-EUTF-8', '-e_=0']);
console.log('ruby ready', ((Date.now() - startT) / 1000).toFixed(1) + 's');
await vm.evalAsync("Dir['/rgss/*.rb'].sort.each { |f| load f }");
