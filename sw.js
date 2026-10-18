// 서비스 워커: 오프라인 실행 + 재방문 로딩 속도.
//  - 앱 셸(html/js/css/rb/manifest)은 네트워크 우선 (업데이트가 바로 반영되고, 오프라인이면 캐시 사용)
//  - 큰 에셋(wasm/그래픽/오디오/데이터/폰트)은 캐시 우선. 에셋을 바꿨다면 ASSET_VERSION 을 올릴 것.
const SHELL = 'changed-shell-v1';
const ASSET_VERSION = 'v1';
const ASSETS = 'changed-assets-' + ASSET_VERSION;
const SHELL_FILES = ['./', 'index.html', 'web/style.css', 'web/dist/main.js', 'web/manifest.json', 'web/app.webmanifest',
  'web/rgss/00_core.rb', 'web/rgss/05_rpg_classes.rb', 'web/rgss/06_rpg_methods.rb', 'web/rgss/10_gfx.rb', 'web/rgss/20_input_audio.rb', 'web/rgss/90_boot.rb'];

const isShell = (p) => /\.(html|css|rb|webmanifest)$/.test(p) || p.endsWith('/') || p.endsWith('/web/dist/main.js') || p.endsWith('/web/manifest.json');

const BIG_PRECACHE = ['web/ruby/ruby+stdlib.wasm', 'web/manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    await (await caches.open(SHELL)).addAll(SHELL_FILES);
    // wasm 은 크지만 첫 방문에서 같이 받아 두면 이후 오프라인/재방문이 즉시 시작된다 (실패해도 설치는 계속)
    try { await (await caches.open(ASSETS)).addAll(BIG_PRECACHE); } catch (err) { /* 용량/네트워크 문제는 무시 */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== SHELL && k !== ASSETS) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.searchParams.has('nosw')) return;
  e.respondWith(isShell(url.pathname) ? networkFirst(req) : cacheFirst(req));
});

async function networkFirst(req) {
  const cache = await caches.open(SHELL);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone()).catch(() => {});
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.status === 200) cache.put(req, res.clone()).catch(() => {}); // 용량 초과 등은 무시
  return res;
}
