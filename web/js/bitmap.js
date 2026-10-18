import UPNG from 'upng-js';
import { assets } from './assets.js';

export const bitmaps = new Map();
globalThis.__bitmaps = bitmaps;
let nextBm = 1;
let tick = 0;

function mkCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// 파일에서 읽은 비트맵은 수정되기 전(dirty=false)에는 언제든 메모리에서 내렸다가 다시 디코딩할 수 있다.
class Bm {
  constructor(id, canvas, rel) {
    this.id = id; this.w = canvas.width; this.h = canvas.height;
    this._c = canvas; this._x = null;
    this.rel = rel || null; this.dirty = !rel; this.last = tick;
  }
  get canvas() { this.last = tick; if (!this._c) this.restore(); return this._c; }
  get ctx() { this.last = tick; if (!this._c) this.restore(); return this._x || (this._x = this._c.getContext('2d')); }
  restore() { this._c = decodePng(this.rel); this._x = null; }
  evict() { if (this._c) { this._c.width = 0; this._c = null; this._x = null; } }
}

export function addBitmap(canvas, rel) {
  const id = nextBm++;
  bitmaps.set(id, new Bm(id, canvas, rel));
  return id;
}

export const getBm = (id) => bitmaps.get(id);
export const bmCount = () => bitmaps.size;
export const bmMemMB = () => { let n = 0; for (const b of bitmaps.values()) if (b._c) n += b.w * b.h * 4; return Math.round(n / 1048576); };

const LOW_MEM = matchMedia('(pointer: coarse)').matches || (navigator.deviceMemory && navigator.deviceMemory <= 4);
const BUDGET_MB = Number(new URLSearchParams(location.search).get('bmbudget')) || (LOW_MEM ? 160 : 480);

export function bmTick(n) {
  tick = n;
  if (n % 60 !== 0) return;
  let total = 0; const cand = [];
  for (const b of bitmaps.values()) {
    if (!b._c) continue;
    total += b.w * b.h * 4;
    if (b.rel && !b.dirty && n - b.last > 180) cand.push(b);
  }
  if (total <= BUDGET_MB * 1048576) return;
  cand.sort((a, b) => a.last - b.last);
  let freed = 0;
  for (const b of cand) {
    if (total <= BUDGET_MB * 1048576 * 0.75) break;
    total -= b.w * b.h * 4;
    b.evict();
    freed++;
  }
  if (freed) console.log(`[bm] evicted ${freed} bitmaps, resident=${(total / 1048576).toFixed(0)}MB`);
}

export function bmNew(w, h) { return addBitmap(mkCanvas(w, h)); }

const IMG_EXTS = ['', '.png', '.jpg', '.jpeg', '.bmp'];

function decodePng(rel) {
  const bytes = assets.bytesSync(rel);
  if (!bytes) throw new Error('missing asset ' + rel);
  const ab = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
    ? bytes.buffer : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const img = UPNG.decode(ab);
  const rgba = new Uint8ClampedArray(UPNG.toRGBA8(img)[0]);
  const c = mkCanvas(img.width, img.height);
  c.getContext('2d').putImageData(new ImageData(rgba, img.width, img.height), 0, 0);
  return c;
}

export function bmLoad(path) {
  const rel = assets.resolve(path, IMG_EXTS);
  if (!rel) return -1;
  try { return addBitmap(decodePng(rel), rel); } catch (e) { console.error('image load failed', rel, e); return -1; }
}

export function bmDispose(id) {
  const b = bitmaps.get(id);
  if (!b) return;
  b.evict(); // 메모리 즉시 반환
  bitmaps.delete(id);
}

export const bmW = (id) => bitmaps.get(id).w;
export const bmH = (id) => bitmaps.get(id).h;

export function bmBlt(id, x, y, src, sx, sy, sw, sh, opacity) {
  const d = bitmaps.get(id), s = bitmaps.get(src);
  if (d) d.dirty = true;
  if (!d || !s || sw <= 0 || sh <= 0) return;
  const c = d.ctx;
  c.globalAlpha = Math.max(0, Math.min(255, opacity)) / 255;
  c.drawImage(s.canvas, sx, sy, sw, sh, x, y, sw, sh);
  c.globalAlpha = 1;
}

export function bmStretch(id, dx, dy, dw, dh, src, sx, sy, sw, sh, opacity) {
  const d = bitmaps.get(id), s = bitmaps.get(src);
  if (d) d.dirty = true;
  if (!d || !s || sw <= 0 || sh <= 0 || dw === 0 || dh === 0) return;
  const c = d.ctx;
  c.globalAlpha = Math.max(0, Math.min(255, opacity)) / 255;
  c.drawImage(s.canvas, sx, sy, sw, sh, dx, dy, dw, dh);
  c.globalAlpha = 1;
}

const rgba = (r, g, b, a) => `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a / 255})`;

export function bmFill(id, x, y, w, h, r, g, b, a) {
  const d = bitmaps.get(id);
  if (d) d.dirty = true;
  if (!d) return;
  d.ctx.clearRect(x, y, w, h);          // RGSS fill_rect 는 덮어쓰기
  if (a > 0) { d.ctx.fillStyle = rgba(r, g, b, a); d.ctx.fillRect(x, y, w, h); }
}

export function bmClear(id) { const d = bitmaps.get(id); if (d) d.dirty = true; if (d) d.ctx.clearRect(0, 0, d.w, d.h); }
export function bmClearRect(id, x, y, w, h) { const d = bitmaps.get(id); if (d) d.dirty = true; if (d) d.ctx.clearRect(x, y, w, h); }

export function bmGradient(id, x, y, w, h, r1, g1, b1, a1, r2, g2, b2, a2, vertical) {
  const d = bitmaps.get(id);
  if (d) d.dirty = true;
  if (!d) return;
  const g = vertical ? d.ctx.createLinearGradient(0, y, 0, y + h) : d.ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, rgba(r1, g1, b1, a1));
  g.addColorStop(1, rgba(r2, g2, b2, a2));
  d.ctx.clearRect(x, y, w, h);
  d.ctx.fillStyle = g;
  d.ctx.fillRect(x, y, w, h);
}

export function bmGet(id, x, y) {
  const d = bitmaps.get(id);
  if (!d || x < 0 || y < 0 || x >= d.w || y >= d.h) return 0;
  const p = d.ctx.getImageData(x, y, 1, 1).data;
  return p[0] * 16777216 + p[1] * 65536 + p[2] * 256 + p[3];
}

export function bmSet(id, x, y, r, g, b, a) {
  const d = bitmaps.get(id);
  if (d) d.dirty = true;
  if (!d) return;
  const im = d.ctx.createImageData(1, 1);
  im.data.set([r, g, b, a]);
  d.ctx.putImageData(im, x, y);
}

function rgb2hsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return [h, mx ? d / mx : 0, mx];
}
function hsv2rgb(h, s, v) {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0]; else if (h < 120) [r, g, b] = [x, c, 0]; else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c]; else if (h < 300) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

export function bmHue(id, hue) {
  const d = bitmaps.get(id);
  if (d) d.dirty = true;
  if (!d || ((hue % 360) + 360) % 360 === 0) return;
  const im = d.ctx.getImageData(0, 0, d.w, d.h), p = im.data;
  for (let i = 0; i < p.length; i += 4) {
    if (!p[i + 3]) continue;
    const [h, s, v] = rgb2hsv(p[i], p[i + 1], p[i + 2]);
    const [r, g, b] = hsv2rgb((h + hue + 360) % 360, s, v);
    p[i] = r; p[i + 1] = g; p[i + 2] = b;
  }
  d.ctx.putImageData(im, 0, 0);
}

export function bmBlur(id) {
  const d = bitmaps.get(id);
  if (d) d.dirty = true;
  if (!d) return;
  const t = mkCanvas(d.w, d.h), tc = t.getContext('2d');
  tc.drawImage(d.canvas, 0, 0);
  d.ctx.clearRect(0, 0, d.w, d.h);
  d.ctx.globalAlpha = 0.5;
  for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) d.ctx.drawImage(t, ox, oy);
  d.ctx.globalAlpha = 1;
  d.ctx.drawImage(t, 0, 0);
}

export function bmRadial(id, angle, division) { bmBlur(id); }

export function bmGetRaw(id) {
  const d = bitmaps.get(id);
  const data = d.ctx.getImageData(0, 0, d.w, d.h).data;
  let s = '';
  for (let i = 0; i < data.length; i += 0x8000) s += String.fromCharCode.apply(null, data.subarray(i, i + 0x8000));
  return btoa(s);
}

export function bmSetRaw(id, b64) {
  const d = bitmaps.get(id);
  if (d) d.dirty = true;
  const s = atob(b64);
  const u = new Uint8ClampedArray(d.w * d.h * 4);
  for (let i = 0; i < u.length && i < s.length; i++) u[i] = s.charCodeAt(i);
  d.ctx.putImageData(new ImageData(u, d.w, d.h), 0, 0);
}

// ---- 텍스트
const fontCache = new Map();
function cssFamily(names) {
  let f = fontCache.get(names);
  if (!f) {
    f = names.split('|').filter(Boolean).map((n) => `"${n.replace(/"/g, '')}"`).join(', ') + ', "Noto Sans CJK KR", "Malgun Gothic", sans-serif';
    fontCache.set(names, f);
  }
  return f;
}
const measureCtx = mkCanvas(1, 1).getContext('2d');
function setFont(c, names, size, bold, italic) {
  c.font = `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${size}px ${cssFamily(names)}`;
}

export function bmTextW(str, names, size, bold, italic) {
  setFont(measureCtx, names, size, bold, italic);
  return measureCtx.measureText(str).width;
}

export function bmText(id, x, y, w, h, str, align, names, size, bold, italic, r, g, b, a) {
  const d = bitmaps.get(id);
  if (d) d.dirty = true;
  if (!d || !str) return;
  const c = d.ctx;
  setFont(c, names, size, bold, italic);
  let tw = c.measureText(str).width;
  let sx = 1;
  if (w > 0 && tw > w) { sx = w / tw; }   // RGSS 는 폭이 넘치면 글자를 가로로 압축
  const dw = tw * sx;
  let px = x;
  if (align === 1) px = x + (w - dw) / 2; else if (align === 2) px = x + w - dw;
  c.save();
  c.fillStyle = rgba(r, g, b, a);
  c.textBaseline = 'middle';
  c.translate(px, y + h / 2 + 1);
  c.scale(sx, 1);
  c.fillText(str, 0, 0);
  c.restore();
}
