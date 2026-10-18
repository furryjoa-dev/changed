// RGSS2 표시 객체 렌더러 (Canvas 2D)
import { bitmaps, addBitmap, getBm, bmMemMB, bmTick } from './bitmap.js';

export const W = 544, H = 416;
const FRAME_MS = 1000 / 60;

const objs = new Map();
let nextObj = 1, seq = 1;
let frameNo = 0;

function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// ------------------------------------------------------------------ 객체 생성/갱신
const DEFAULTS = {
  sprite: () => ({ vis: 1, bmp: 0, sx: 0, sy: 0, sw: 0, sh: 0, x: 0, y: 0, z: 0, ox: 0, oy: 0, zx: 1, zy: 1, angle: 0, mirror: 0, bushD: 0, bushO: 128, opacity: 255, blend: 0, color: [0, 0, 0, 0], tone: [0, 0, 0, 0], flash: [0, 0, 0, 0], fhide: 0 }),
  viewport: () => ({ vis: 1, x: 0, y: 0, w: W, h: H, z: 0, ox: 0, oy: 0, color: [0, 0, 0, 0], tone: [0, 0, 0, 0], flash: [0, 0, 0, 0], fhide: 0 }),
  plane: () => ({ vis: 1, bmp: 0, z: 0, ox: 0, oy: 0, zx: 1, zy: 1, opacity: 255, blend: 0, color: [0, 0, 0, 0], tone: [0, 0, 0, 0] }),
  window: () => ({ vis: 1, x: 0, y: 0, w: 0, h: 0, z: 100, ox: 0, oy: 0, skin: 0, contents: 0, cur: [0, 0, 0, 0], active: 1, arrows: 1, pause: 0, pad: 16, padB: 16, opacity: 255, backOp: 255, contOp: 255, open: 255 }),
  tilemap: () => ({ vis: 1, bmps: new Array(9).fill(0), ox: 0, oy: 0, anim: 0, z: 0, map: null, mw: 0, mh: 0, md: 0, pass: null, mapVer: 0 }),
};

const DECODE = {
  sprite(o, s) {
    o.vis = s[0]; o.bmp = s[1]; o.sx = s[2]; o.sy = s[3]; o.sw = s[4]; o.sh = s[5];
    o.x = s[6]; o.y = s[7]; o.z = s[8]; o.ox = s[9]; o.oy = s[10]; o.zx = s[11]; o.zy = s[12];
    o.angle = s[13]; o.mirror = s[14]; o.bushD = s[15]; o.bushO = s[16]; o.opacity = s[17]; o.blend = s[18];
    o.color = s.slice(19, 23); o.tone = s.slice(23, 27); o.flash = s.slice(27, 31); o.fhide = s[31]; o.vp = s[32];
  },
  viewport(o, s) {
    o.vis = s[0]; o.x = s[1]; o.y = s[2]; o.w = s[3]; o.h = s[4]; o.z = s[5]; o.ox = s[6]; o.oy = s[7];
    o.color = s.slice(8, 12); o.tone = s.slice(12, 16); o.flash = s.slice(16, 20); o.fhide = s[20];
  },
  plane(o, s) {
    o.vis = s[0]; o.bmp = s[1]; o.z = s[2]; o.ox = s[3]; o.oy = s[4]; o.zx = s[5]; o.zy = s[6];
    o.opacity = s[7]; o.blend = s[8]; o.color = s.slice(9, 13); o.tone = s.slice(13, 17); o.vp = s[17];
  },
  window(o, s) {
    o.vis = s[0]; o.x = s[1]; o.y = s[2]; o.w = s[3]; o.h = s[4]; o.z = s[5]; o.ox = s[6]; o.oy = s[7];
    o.skin = s[8]; o.contents = s[9]; o.cur = s.slice(10, 14); o.active = s[14]; o.arrows = s[15]; o.pause = s[16];
    o.pad = s[17]; o.padB = s[18]; o.opacity = s[19]; o.backOp = s[20]; o.contOp = s[21]; o.open = s[22]; o.vp = s[23];
  },
  tilemap(o, s) {
    o.vis = s[0]; o.bmps = s.slice(1, 10); o.ox = s[10]; o.oy = s[11]; o.anim = s[12]; o.vp = s[13];
  },
};

export function objNew(kind, vp) {
  const o = DEFAULTS[kind]();
  o.id = nextObj++; o.seq = seq++; o.kind = kind; o.vp = vp || 0;
  objs.set(o.id, o);
  return o.id;
}
export function objUpdate(id, json) { const o = objs.get(id); if (o) DECODE[o.kind](o, JSON.parse(json)); }
export function objDispose(id) { objs.delete(id); }

export function tmSetMap(id, b64, mw, mh, md) {
  const o = objs.get(id); if (!o) return;
  const s = atob(b64), u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  o.map = new Int16Array(u.buffer); o.mw = mw; o.mh = mh; o.md = md; o.mapVer++;
}
export function tmSetPass(id, b64) {
  const o = objs.get(id); if (!o) return;
  const s = atob(b64), u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  o.pass = new Int16Array(u.buffer);
}

// ------------------------------------------------------------------ 색조/색 효과
const scratchA = mk(W, H), scratchB = mk(W, H);
const scratchAx = scratchA.getContext('2d', { willReadFrequently: true });

function fxActive(color, tone, flash) {
  return (color && color[3] > 0) || (tone && (tone[0] || tone[1] || tone[2] || tone[3])) || (flash && flash[3] > 0);
}

function applyFx(ctx, w, h, color, tone, flash) {
  const im = ctx.getImageData(0, 0, w, h), p = im.data;
  const [tr, tg, tb, gray] = tone || [0, 0, 0, 0];
  const gs = gray / 255;
  const layers = [];
  if (color && color[3] > 0) layers.push(color);
  if (flash && flash[3] > 0) layers.push(flash);
  for (let i = 0; i < p.length; i += 4) {
    if (!p[i + 3]) continue;
    let r = p[i], g = p[i + 1], b = p[i + 2];
    if (gs) { const l = 0.299 * r + 0.587 * g + 0.114 * b; r += (l - r) * gs; g += (l - g) * gs; b += (l - b) * gs; }
    r += tr; g += tg; b += tb;
    for (const c of layers) { const a = c[3] / 255; r += (c[0] - r) * a; g += (c[1] - g) * a; b += (c[2] - b) * a; }
    p[i] = r < 0 ? 0 : r > 255 ? 255 : r;
    p[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
    p[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
  }
  ctx.putImageData(im, 0, 0);
}

const BLEND = ['source-over', 'lighter', 'difference'];

// ------------------------------------------------------------------ 스프라이트
function drawSprite(ctx, o, offx, offy) {
  const bm = bitmaps.get(o.bmp);
  if (!bm || o.sw <= 0 || o.sh <= 0 || o.opacity <= 0) return;
  if (o.fhide) return;
  let sx = o.sx, sy = o.sy, sw = o.sw, sh = o.sh;
  if (sx < 0) { sw += sx; sx = 0; }
  if (sy < 0) { sh += sy; sy = 0; }
  if (sx + sw > bm.w) sw = bm.w - sx;
  if (sy + sh > bm.h) sh = bm.h - sy;
  if (sw <= 0 || sh <= 0) return;

  let src = bm.canvas, ssx = sx, ssy = sy;
  if (fxActive(o.color, o.tone, o.flash)) {
    // 색/색조가 있는 스프라이트는 임시 캔버스에서 효과를 적용
    if (scratchB.width < sw || scratchB.height < sh) { scratchB.width = Math.max(scratchB.width, sw); scratchB.height = Math.max(scratchB.height, sh); }
    const sc = scratchB.getContext('2d', { willReadFrequently: true });
    sc.clearRect(0, 0, scratchB.width, scratchB.height);
    sc.drawImage(bm.canvas, sx, sy, sw, sh, 0, 0, sw, sh);
    applyFx(sc, sw, sh, o.color, o.tone, o.flash);
    src = scratchB; ssx = 0; ssy = 0;
  }

  ctx.save();
  ctx.translate(Math.round(offx + o.x), Math.round(offy + o.y));
  if (o.angle) ctx.rotate(-o.angle * Math.PI / 180);
  const zx = o.zx * (o.mirror ? -1 : 1);
  if (zx !== 1 || o.zy !== 1) ctx.scale(zx, o.zy);
  ctx.globalCompositeOperation = BLEND[o.blend] || 'source-over';
  const a = o.opacity / 255;
  if (o.bushD > 0 && o.bushD < sh) {
    ctx.globalAlpha = a;
    ctx.drawImage(src, ssx, ssy, sw, sh - o.bushD, -o.ox, -o.oy, sw, sh - o.bushD);
    ctx.globalAlpha = a * (o.bushO / 255);
    ctx.drawImage(src, ssx, ssy + sh - o.bushD, sw, o.bushD, -o.ox, -o.oy + sh - o.bushD, sw, o.bushD);
  } else {
    ctx.globalAlpha = a;
    ctx.drawImage(src, ssx, ssy, sw, sh, -o.ox, -o.oy, sw, sh);
  }
  ctx.restore();
}

// ------------------------------------------------------------------ 플레인
function drawPlane(ctx, o, offx, offy, vw, vh) {
  const bm = bitmaps.get(o.bmp);
  if (!bm || o.opacity <= 0 || !bm.w || !bm.h) return;
  ctx.save();
  ctx.globalAlpha = o.opacity / 255;
  ctx.globalCompositeOperation = BLEND[o.blend] || 'source-over';
  ctx.translate(offx, offy);
  ctx.scale(o.zx, o.zy);
  ctx.translate(-o.ox, -o.oy);
  ctx.fillStyle = ctx.createPattern(bm.canvas, 'repeat');
  ctx.fillRect(o.ox, o.oy, vw / o.zx + 1, vh / o.zy + 1);
  ctx.restore();
}

// ------------------------------------------------------------------ 윈도우 (VX 윈도우스킨 128x128)
function tile(ctx, img, sx, sy, sw, sh, dx, dy, dw, dh) {
  ctx.save();
  ctx.beginPath(); ctx.rect(dx, dy, dw, dh); ctx.clip();
  for (let y = dy; y < dy + dh; y += sh) for (let x = dx; x < dx + dw; x += sw) ctx.drawImage(img, sx, sy, sw, sh, x, y, sw, sh);
  ctx.restore();
}

function drawWindow(ctx, o, offx, offy) {
  const skin = bitmaps.get(o.skin);
  let w = o.w, h = o.h * o.open / 255;
  if (w <= 0 || h <= 0) return;
  const x = offx + o.x, y = offy + o.y + (o.h - h) / 2;
  const img = skin ? skin.canvas : null;
  const op = o.opacity / 255;
  if (img && skin.w >= 128) {
    // 배경 (늘림) + 줄무늬(타일)
    ctx.globalAlpha = op * (o.backOp / 255);
    if (w > 4 && h > 4) {
      ctx.drawImage(img, 0, 0, 64, 64, x + 2, y + 2, w - 4, h - 4);
      tile(ctx, img, 0, 64, 64, 64, x + 2, y + 2, w - 4, h - 4);
    }
    // 프레임
    ctx.globalAlpha = op;
    if (w >= 32 && h >= 32) {
      ctx.drawImage(img, 64, 0, 16, 16, x, y, 16, 16);
      ctx.drawImage(img, 112, 0, 16, 16, x + w - 16, y, 16, 16);
      ctx.drawImage(img, 64, 48, 16, 16, x, y + h - 16, 16, 16);
      ctx.drawImage(img, 112, 48, 16, 16, x + w - 16, y + h - 16, 16, 16);
      tile(ctx, img, 80, 0, 32, 16, x + 16, y, w - 32, 16);
      tile(ctx, img, 80, 48, 32, 16, x + 16, y + h - 16, w - 32, 16);
      tile(ctx, img, 64, 16, 16, 32, x, y + 16, 16, h - 32);
      tile(ctx, img, 112, 16, 16, 32, x + w - 16, y + 16, 16, h - 32);
    }
  }
  ctx.globalAlpha = 1;
  if (o.open < 255) return;

  const cx = x + o.pad, cy = y + o.pad, cw = w - o.pad * 2, ch = h - o.pad - o.padB;
  if (cw > 0 && ch > 0) {
    ctx.save();
    ctx.beginPath(); ctx.rect(cx, cy, cw, ch); ctx.clip();
    const cb = bitmaps.get(o.contents);
    // 커서
    const [rx, ry, rw, rh] = o.cur;
    if (img && rw > 0 && rh > 0) {
      const a = o.active ? 0.6 + 0.4 * Math.cos(frameNo * Math.PI / 20) : 1;
      ctx.globalAlpha = a * op;
      const dx = cx + rx - o.ox, dy = cy + ry - o.oy;
      const m = 8;
      if (rw >= 2 * m && rh >= 2 * m) {
        ctx.drawImage(img, 64, 64, m, m, dx, dy, m, m);
        ctx.drawImage(img, 64 + 32 - m, 64, m, m, dx + rw - m, dy, m, m);
        ctx.drawImage(img, 64, 64 + 32 - m, m, m, dx, dy + rh - m, m, m);
        ctx.drawImage(img, 64 + 32 - m, 64 + 32 - m, m, m, dx + rw - m, dy + rh - m, m, m);
        ctx.drawImage(img, 64 + m, 64, 32 - 2 * m, m, dx + m, dy, rw - 2 * m, m);
        ctx.drawImage(img, 64 + m, 64 + 32 - m, 32 - 2 * m, m, dx + m, dy + rh - m, rw - 2 * m, m);
        ctx.drawImage(img, 64, 64 + m, m, 32 - 2 * m, dx, dy + m, m, rh - 2 * m);
        ctx.drawImage(img, 64 + 32 - m, 64 + m, m, 32 - 2 * m, dx + rw - m, dy + m, m, rh - 2 * m);
        ctx.drawImage(img, 64 + m, 64 + m, 32 - 2 * m, 32 - 2 * m, dx + m, dy + m, rw - 2 * m, rh - 2 * m);
      }
      ctx.globalAlpha = 1;
    }
    if (cb) {
      ctx.globalAlpha = o.contOp / 255;
      ctx.drawImage(cb.canvas, cx - o.ox, cy - o.oy);
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    if (img && o.arrows) {
      const cbw = cb ? cb.w : 0, cbh = cb ? cb.h : 0;
      if (o.oy > 0) ctx.drawImage(img, 89, 16, 14, 10, x + w / 2 - 7, y + 4, 14, 10);
      if (cbh - o.oy > ch) ctx.drawImage(img, 89, 38, 14, 10, x + w / 2 - 7, y + h - 14, 14, 10);
      if (o.ox > 0) ctx.drawImage(img, 80, 25, 10, 14, x + 4, y + h / 2 - 7, 10, 14);
      if (cbw - o.ox > cw) ctx.drawImage(img, 102, 25, 10, 14, x + w - 14, y + h / 2 - 7, 10, 14);
    }
    if (img && o.pause) {
      const f = Math.floor(frameNo / 16) % 4;
      ctx.drawImage(img, 96 + (f % 2) * 16, 64 + (f >> 1) * 16, 16, 16, x + w / 2 - 8, y + h - 18, 16, 16);
    }
  }
}

// ------------------------------------------------------------------ 타일맵 (VX/Ace 타일 ID 레이아웃)
// XP 오토타일 테이블(48종)을 VX 4x6 쿼터 레이아웃으로 변환해서 사용
const XP_TABLE = [[27,28,33,34],[5,28,33,34],[27,6,33,34],[5,6,33,34],[27,28,33,12],[5,28,33,12],[27,6,33,12],[5,6,33,12],
  [27,28,11,34],[5,28,11,34],[27,6,11,34],[5,6,11,34],[27,28,11,12],[5,28,11,12],[27,6,11,12],[5,6,11,12],
  [25,26,31,32],[25,6,31,32],[25,26,31,12],[25,6,31,12],[15,16,21,22],[15,16,21,12],[15,16,11,22],[15,16,11,12],
  [29,30,35,36],[29,30,11,36],[5,30,35,36],[5,30,11,36],[39,40,45,46],[5,40,45,46],[39,6,45,46],[5,6,45,46],
  [25,30,31,36],[15,16,45,46],[13,14,19,20],[13,14,19,12],[17,18,23,24],[17,18,11,24],[41,42,47,48],[5,42,47,48],
  [37,38,43,44],[37,6,43,44],[13,18,19,24],[13,14,43,44],[37,42,43,48],[17,18,47,48],[13,18,43,48],[1,2,7,8]];
const COL_MAP = [0, 1, 1, 2, 2, 3], ROW_MAP = [0, 1, 2, 3, 3, 4, 4, 5];
const FLOOR_TABLE = XP_TABLE.map((e) => e.map((n) => [COL_MAP[(n - 1) % 6], ROW_MAP[Math.floor((n - 1) / 6)]]));
const WATERFALL_TABLE = [[[2, 0], [1, 0], [2, 1], [1, 1]], [[0, 0], [1, 0], [0, 1], [1, 1]], [[2, 0], [3, 0], [2, 1], [3, 1]], [[0, 0], [3, 0], [0, 1], [3, 1]]];
const WALL_TABLE = [
  [[2,2],[1,2],[2,1],[1,1]],[[0,2],[1,2],[0,1],[1,1]],[[2,0],[1,0],[2,1],[1,1]],[[0,0],[1,0],[0,1],[1,1]],
  [[2,2],[3,2],[2,1],[3,1]],[[0,2],[3,2],[0,1],[3,1]],[[2,0],[3,0],[2,1],[3,1]],[[0,0],[3,0],[0,1],[3,1]],
  [[2,2],[1,2],[2,3],[1,3]],[[0,2],[1,2],[0,3],[1,3]],[[2,0],[1,0],[2,3],[1,3]],[[0,0],[1,0],[0,3],[1,3]],
  [[2,2],[3,2],[2,3],[3,3]],[[0,2],[3,2],[0,3],[3,3]],[[2,0],[3,0],[2,3],[3,3]],[[0,0],[3,0],[0,3],[3,3]]];
const WATER_FRAMES = [0, 1, 2, 1];

function drawAutotile(c, o, bmps, id, dx, dy) {
  const kind = Math.floor((id - 2048) / 48), shape = (id - 2048) % 48;
  const tx = kind % 8, ty = Math.floor(kind / 8);
  let set, bx, by, table = FLOOR_TABLE;
  const wf = WATER_FRAMES[o.anim % 4];
  if (id < 2816) {
    set = 0;
    if (kind === 0) { bx = wf * 2; by = 0; }
    else if (kind === 1) { bx = wf * 2; by = 3; }
    else if (kind === 2) { bx = 6; by = 0; }
    else if (kind === 3) { bx = 6; by = 3; }
    else {
      bx = Math.floor(tx / 4) * 8;
      by = ty * 6 + (Math.floor(tx / 2) % 2) * 3;
      if (kind % 2 === 0) bx += wf * 2;
      else { bx += 6; table = WATERFALL_TABLE; by += o.anim % 3; }
    }
  } else if (id < 4352) { set = 1; bx = tx * 2; by = (ty - 2) * 3; }
  else if (id < 5888) { set = 2; bx = tx * 2; by = (ty - 6) * 2; table = WALL_TABLE; }
  else { set = 3; bx = tx * 2; by = Math.floor((ty - 10) * 2.5 + (ty % 2 === 1 ? 0.5 : 0)); if (ty % 2 === 1) table = WALL_TABLE; }
  const src = bitmaps.get(bmps[set]);
  const q = table[shape % table.length];
  if (!src || !q) return;
  for (let i = 0; i < 4; i++) {
    const sx = (bx * 2 + q[i][0]) * 16, sy = (by * 2 + q[i][1]) * 16;
    if (sx + 16 > src.w || sy + 16 > src.h || sx < 0 || sy < 0) continue;
    c.drawImage(src.canvas, sx, sy, 16, 16, dx + (i % 2) * 16, dy + (i >> 1) * 16, 16, 16);
  }
}

function drawTile(c, o, id, dx, dy) {
  if (id <= 0) return;
  if (id >= 2048) { drawAutotile(c, o, o.bmps, id, dx, dy); return; }
  let set, sx, sy;
  if (id < 1024) { set = 5 + (id >> 8); sx = (((id >> 7) & 1) * 8 + (id & 7)) * 32; sy = (((id & 255) >> 3) & 15) * 32; }
  else if (id >= 1536 && id < 1664) { set = 4; sx = (id % 8) * 32; sy = ((id >> 3) % 16) * 32; }
  else return;
  const src = bitmaps.get(o.bmps[set]);
  if (!src || sx + 32 > src.w || sy + 32 > src.h) return;
  c.drawImage(src.canvas, sx, sy, 32, 32, dx, dy, 32, 32);
}

// 타일맵 한 pass(0: 일반, 1: ☆ 우선순위) 를 캐시 캔버스에 그리고 스크롤 오프셋만 반영해서 출력
function drawTilemap(ctx, o, offx, offy, vw, vh, pass) {
  if (!o.map || !o.pass) return;
  const tw = Math.ceil(vw / 32) + 1, th = Math.ceil(vh / 32) + 1;
  const tx0 = Math.floor(o.ox / 32), ty0 = Math.floor(o.oy / 32);
  const key = tx0 + ',' + ty0 + ',' + o.anim + ',' + o.mapVer + ',' + o.bmps.join('.') + ',' + tw + ',' + th;
  const cache = o['cache' + pass] || (o['cache' + pass] = { canvas: mk(1, 1), key: '', any: false });
  if (cache.key !== key) {
    if (cache.canvas.width !== tw * 32 || cache.canvas.height !== th * 32) { cache.canvas.width = tw * 32; cache.canvas.height = th * 32; }
    const c = cache.canvas.getContext('2d');
    c.clearRect(0, 0, cache.canvas.width, cache.canvas.height);
    let any = false;
    const { mw, mh, md, map, pass: pa } = o;
    for (let z = 0; z < md; z++) {
      for (let j = 0; j < th; j++) {
        const my = (((ty0 + j) % mh) + mh) % mh;
        for (let i = 0; i < tw; i++) {
          const mx = (((tx0 + i) % mw) + mw) % mw;
          const id = map[mx + my * mw + z * mw * mh];
          if (id <= 0) continue;
          const star = ((pa[id] || 0) & 0x10) ? 1 : 0;
          if (star !== pass) continue;
          drawTile(c, o, id, i * 32, j * 32);
          any = true;
        }
      }
    }
    cache.key = key; cache.any = any;
  }
  if (!cache.any) return;
  ctx.drawImage(cache.canvas, offx - (o.ox - tx0 * 32), offy - (o.oy - ty0 * 32));
}

// ------------------------------------------------------------------ 씬 합성
function cmp(a, b) {
  if (a.z !== b.z) return a.z - b.z;
  if (a.kind === 'sprite' && b.kind === 'sprite' && a.y !== b.y) return a.y - b.y;
  return a.seq - b.seq;
}

// 렌더 항목: 타일맵은 두 항목(일반 z=0, ☆ z=150)으로 확장
function itemsFor(vpId) {
  const list = [];
  for (const o of objs.values()) {
    if (o.kind === 'viewport') { if (vpId === 0) list.push(o); continue; }
    if ((o.vp || 0) !== vpId) continue;
    if (o.kind === 'tilemap') {
      if (!o.vis) continue;
      list.push({ kind: 'tilemap', o, z: 0, y: 0, seq: o.seq, pass: 0 });
      list.push({ kind: 'tilemap', o, z: 150, y: 0, seq: o.seq, pass: 1 });
    } else if (o.vis) list.push(o);
  }
  return list.sort(cmp);
}

function drawItem(ctx, it, offx, offy, vw, vh) {
  switch (it.kind) {
    case 'sprite': drawSprite(ctx, it, offx, offy); break;
    case 'plane': drawPlane(ctx, it, offx, offy, vw, vh); break;
    case 'window': drawWindow(ctx, it, offx, offy); break;
    case 'tilemap': drawTilemap(ctx, it.o, offx, offy, vw, vh, it.pass); break;
  }
}

function drawViewport(ctx, v) {
  if (!v.vis || v.w <= 0 || v.h <= 0) return;
  if (v.fhide) return;
  const items = itemsFor(v.id);
  const t = v.tone;
  if (t && (t[0] || t[1] || t[2] || t[3])) {
    // 색조는 뷰포트 안의 내용물에만 적용
    if (scratchA.width < v.w || scratchA.height < v.h) { scratchA.width = Math.max(scratchA.width, v.w); scratchA.height = Math.max(scratchA.height, v.h); }
    scratchAx.clearRect(0, 0, scratchA.width, scratchA.height);
    for (const it of items) drawItem(scratchAx, it, -v.ox, -v.oy, v.w, v.h);
    applyFx(scratchAx, v.w, v.h, null, t, null);
    ctx.drawImage(scratchA, 0, 0, v.w, v.h, v.x, v.y, v.w, v.h);
  } else {
    ctx.save();
    ctx.beginPath(); ctx.rect(v.x, v.y, v.w, v.h); ctx.clip();
    for (const it of items) drawItem(ctx, it, v.x - v.ox, v.y - v.oy, v.w, v.h);
    ctx.restore();
  }
  // color / flash 는 내용물이 없어도 뷰포트 영역 전체를 덮는 오버레이 (화면 플래시/페이드에 쓰임)
  for (const c of [v.color, v.flash]) {
    if (!c || c[3] <= 0) continue;
    ctx.save();
    ctx.globalAlpha = Math.min(1, c[3] / 255);
    ctx.fillStyle = `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
    ctx.fillRect(v.x, v.y, v.w, v.h);
    ctx.restore();
  }
}

const sceneCanvas = mk(W, H), sceneCtx = sceneCanvas.getContext('2d');
const frozenCanvas = mk(W, H), frozenCtx = frozenCanvas.getContext('2d');
let screenCtx = null;
let frozen = false, trans = null, brightness = 255;

export function initScreen(canvas) {
  canvas.width = W; canvas.height = H;
  screenCtx = canvas.getContext('2d');
}

function renderScene() {
  sceneCtx.clearRect(0, 0, W, H);
  sceneCtx.fillStyle = '#000';
  sceneCtx.fillRect(0, 0, W, H);
  for (const it of itemsFor(0)) {
    if (it.kind === 'viewport') drawViewport(sceneCtx, it);
    else drawItem(sceneCtx, it, 0, 0, W, H);
  }
}

function present() {
  const c = screenCtx;
  if (!c) return;
  if (trans) {
    renderScene();
    const p = trans.p;
    c.globalAlpha = 1;
    if (!trans.map) {
      c.drawImage(frozenCanvas, 0, 0);
      c.globalAlpha = p;
      c.drawImage(sceneCanvas, 0, 0);
      c.globalAlpha = 1;
    } else {
      const a = frozenCtx.getImageData(0, 0, W, H), b = sceneCtx.getImageData(0, 0, W, H);
      const m = trans.mapData, v = trans.vague;
      const out = a.data, bd = b.data;
      for (let i = 0; i < out.length; i += 4) {
        const t = (p * (255 + v) - (255 - m[i >> 2])) / v;
        const k = t <= 0 ? 0 : t >= 1 ? 1 : t;
        out[i] += (bd[i] - out[i]) * k; out[i + 1] += (bd[i + 1] - out[i + 1]) * k; out[i + 2] += (bd[i + 2] - out[i + 2]) * k;
      }
      c.putImageData(a, 0, 0);
    }
  } else if (frozen) {
    c.drawImage(frozenCanvas, 0, 0);
  } else {
    renderScene();
    c.drawImage(sceneCanvas, 0, 0);
  }
  if (brightness < 255) {
    c.fillStyle = `rgba(0,0,0,${(255 - brightness) / 255})`;
    c.fillRect(0, 0, W, H);
  }
}

export function gFreeze() { renderScene(); frozenCtx.clearRect(0, 0, W, H); frozenCtx.drawImage(sceneCanvas, 0, 0); frozen = true; }
export function gTransBegin(bmpId, vague) {
  trans = { p: 0, vague: Math.max(1, vague || 1), map: null, mapData: null };
  const b = bitmaps.get(bmpId);
  if (b) {
    const t = mk(W, H), tc = t.getContext('2d', { willReadFrequently: true });
    tc.drawImage(b.canvas, 0, 0, b.w, b.h, 0, 0, W, H);
    const d = tc.getImageData(0, 0, W, H).data, m = new Uint8Array(W * H);
    for (let i = 0; i < m.length; i++) m[i] = d[i * 4]; // 밝기 맵(R 채널)
    trans.map = true; trans.mapData = m;
  }
}
export function gTransStep(p) { if (trans) trans.p = p; }
export function gTransEnd() { trans = null; frozen = false; }
export function gBrightness(v) { brightness = v; }
export function gSnap() {
  renderScene();
  const c = mk(W, H); c.getContext('2d').drawImage(sceneCanvas, 0, 0);
  return addBitmap(c);
}

// ------------------------------------------------------------------ 프레임 페이싱 (RGSS2: 60fps)
let nextTime = 0;
export function frameReset() { nextTime = performance.now(); }

const prof = { n: 0, ruby: 0, render: 0, wait: 0, last: 0 };
globalThis.__prof = prof;
export function frame() {
  frameNo++;
  bmTick(frameNo);
  globalThis.__frames = frameNo;
  const t0 = performance.now();
  if (prof.last) prof.ruby += t0 - prof.last;     // 직전 프레임 이후 Ruby 가 쓴 시간
  present();
  const t1 = performance.now();
  prof.render += t1 - t0;
  return new Promise((resolve) => {
    const step = () => {
      const now = performance.now();
      if (now + 3 >= nextTime) {
        nextTime += FRAME_MS;
        if (now - nextTime > FRAME_MS * 3) nextTime = now + FRAME_MS; // 탭 비활성/지연 후 따라잡기 방지
        prof.wait += now - t1;
        prof.last = now;
        if (++prof.n % 300 === 0) {
          const mem = globalThis.__wasmMem ? (globalThis.__wasmMem.buffer.byteLength / 1048576).toFixed(0) : '?';
          console.log(`[prof] frames=${prof.n} ruby=${(prof.ruby / 300).toFixed(1)}ms render=${(prof.render / 300).toFixed(1)}ms wait=${(prof.wait / 300).toFixed(1)}ms wasmMem=${mem}MB bitmapMem=${bmMemMB()}MB bitmaps=${bitmaps.size}`);
          prof.ruby = prof.render = prof.wait = 0;
        }
        resolve(1);
      } else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}
