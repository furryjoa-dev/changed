// 에셋 접근: RGSS 는 파일을 동기로 읽으므로 캐시에 없으면 동기 XHR 로 가져온다.
// 부팅 후 백그라운드 prefetch 로 캐시를 채워 두면 게임 중 동기 로딩 지연이 거의 없다.
const norm = (s) => s.replace(/\\/g, '/').normalize('NFC').toLowerCase();

export const assets = {
  files: {},
  audio: {},
  cache: new Map(),
  base: '',

  async init(base) {
    this.base = base;
    const m = await (await fetch(base + 'web/manifest.json')).json();
    this.files = m.files;
    this.audio = m.audio;
  },

  url(rel) {
    return this.base + rel.split('/').map(encodeURIComponent).join('/');
  },

  // RGSS 경로(확장자 생략 가능, 대소문자 무시) -> 저장소 상대 경로
  resolve(path, exts = ['']) {
    const n = norm(path);
    for (const e of exts) {
      const r = this.files[n + e];
      if (r) return r;
    }
    return null;
  },

  resolveAudio(path) {
    const n = norm(path).replace(/\.[^./]+$/, '');
    return this.audio[n] || null;
  },

  bytesSync(rel) {
    const hit = this.cache.get(rel);
    if (hit) return hit;
    const x = new XMLHttpRequest();
    x.open('GET', this.url(rel), false);
    x.overrideMimeType('text/plain; charset=x-user-defined');
    x.send(null);
    if (x.status !== 200 && x.status !== 0) return null;
    const s = x.responseText;
    const u = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255;
    this.cache.set(rel, u);
    return u;
  },

  async fetchBytes(rel) {
    const hit = this.cache.get(rel);
    if (hit) return hit;
    const r = await fetch(this.url(rel));
    if (!r.ok) throw new Error('fetch failed: ' + rel);
    const u = new Uint8Array(await r.arrayBuffer());
    this.cache.set(rel, u);
    return u;
  },

  async prefetch(list, concurrency = 6, onProgress = () => {}) {
    let i = 0, done = 0;
    const worker = async () => {
      while (i < list.length) {
        const rel = list[i++];
        try { await this.fetchBytes(rel); } catch (e) { /* 개별 실패는 무시: 필요할 때 동기 로딩 */ }
        onProgress(++done, list.length);
      }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));
  },
};
