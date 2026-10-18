// Web Audio 기반 BGM/BGS/ME/SE. 디코딩은 비동기이므로 재생 요청은 토큰으로 최신 요청만 유효하게 한다.
import { assets } from './assets.js';

let ctx = null;
const cache = new Map();          // url -> AudioBuffer (BGM/BGS/ME 는 용량이 크므로 최근 것만 보관)
const CACHE_LIMIT_SEC = 600;
const ch = {
  bgm: { src: null, gain: null, token: 0, name: '', vol: 1, pitch: 1 },
  bgs: { src: null, gain: null, token: 0, name: '', vol: 1, pitch: 1 },
  me: { src: null, gain: null, token: 0, name: '', vol: 1, pitch: 1 },
};
let meActive = false;

export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
}

async function decode(url) {
  if (cache.has(url)) { const b = cache.get(url); cache.delete(url); cache.set(url, b); return b; }
  const bytes = await assets.fetchBytes(url);
  const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const buf = await ctx.decodeAudioData(copy);
  cache.set(url, buf);
  let total = 0;
  for (const b of cache.values()) total += b.duration;
  for (const k of cache.keys()) { if (total <= CACHE_LIMIT_SEC) break; total -= cache.get(k).duration; cache.delete(k); }
  return buf;
}

function stopChannel(c) {
  c.token++;
  if (c.src) { try { c.src.stop(); } catch (e) {} c.src.disconnect(); c.src = null; }
}

function startSource(buf, loop, vol, pitch) {
  const src = ctx.createBufferSource();
  const gain = ctx.createGain();
  src.buffer = buf; src.loop = loop; src.playbackRate.value = pitch;
  gain.gain.value = vol;
  src.connect(gain).connect(ctx.destination);
  src.start();
  return { src, gain };
}

export async function audioPlay(kind, name, volume, pitch) {
  if (!ctx) return;
  const url = assets.resolveAudio(name);
  if (kind === 'se') {
    if (!url) return;
    try {
      const buf = await decode(url);
      const { src } = startSource(buf, false, volume / 100, pitch / 100);
      src.onended = () => src.disconnect();
    } catch (e) { console.warn('SE failed', name, e); }
    return;
  }
  const c = ch[kind];
  // 같은 곡이 이미 재생 중이면 다시 시작하지 않고 볼륨/피치만 조정한다 (RGSS 동작)
  if (kind !== 'me' && c.src && c.name === name) {
    c.vol = volume / 100; c.pitch = pitch / 100;
    c.gain.gain.value = (kind === 'bgm' && meActive) ? 0 : c.vol; c.src.playbackRate.value = c.pitch;
    return;
  }
  stopChannel(c);
  c.name = name; c.vol = volume / 100; c.pitch = pitch / 100;
  if (!url) return;
  const tok = c.token;
  try {
    const buf = await decode(url);
    if (tok !== c.token) return;
    const loop = kind !== 'me';
    const { src, gain } = startSource(buf, loop, (kind === 'bgm' && meActive) ? 0 : c.vol, c.pitch);
    if (kind !== 'se') console.log(`[audio] ${kind} ${name} ${buf.duration.toFixed(1)}s`);
    c.src = src; c.gain = gain;
    if (kind === 'me') {
      meActive = true;
      if (ch.bgm.gain) ch.bgm.gain.gain.value = 0;
      src.onended = () => {
        if (c.src !== src) return;
        c.src = null; meActive = false;
        if (ch.bgm.gain) ch.bgm.gain.gain.value = ch.bgm.vol;
      };
    }
  } catch (e) { console.warn('audio failed', name, e); }
}

export function audioStop(kind) {
  if (kind === 'se') return;
  const c = ch[kind];
  stopChannel(c);
  c.name = '';
  if (kind === 'me' && meActive) { meActive = false; if (ch.bgm.gain) ch.bgm.gain.gain.value = ch.bgm.vol; }
}

export function audioFade(kind, ms) {
  if (!ctx || kind === 'se') return;
  const c = ch[kind];
  if (!c.src) return;
  const src = c.src, gain = c.gain, tok = ++c.token;
  gain.gain.cancelScheduledValues(ctx.currentTime);
  gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0, ctx.currentTime + Math.max(0.01, ms / 1000));
  setTimeout(() => { if (c.src === src) { try { src.stop(); } catch (e) {} src.disconnect(); c.src = null; c.name = ''; } }, ms + 50);
}
