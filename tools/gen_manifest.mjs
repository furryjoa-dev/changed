// 게임 에셋 목록(web/manifest.json) 생성. 경로는 소문자+NFC 로 정규화해 대소문자 무시 조회를 지원한다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const norm = (p) => p.normalize('NFC').toLowerCase();
const files = {};   // 정규화 경로 -> 실제 URL 경로 (Graphics, Data, Fonts)
const audio = {};   // 정규화 경로(확장자 없음) -> URL (ogg 우선)
const sizes = {};

function walk(dir, fn) {
  for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.posix.join(dir, e.name);
    if (e.isDirectory()) walk(rel, fn); else fn(rel);
  }
}
for (const d of ['Graphics', 'Data', 'Fonts']) {
  walk(d, (rel) => { files[norm(rel)] = rel.normalize('NFC') === rel ? rel : rel; sizes[rel] = fs.statSync(path.join(root, rel)).size; });
}
const rank = { ogg: 3, mp3: 2, wav: 1 };
const best = {};
const consider = (rel, url) => {
  const ext = rel.split('.').pop().toLowerCase();
  if (!rank[ext]) return;
  const key = norm(rel.replace(/\.[^.]+$/, ''));
  if (!best[key] || rank[ext] > best[key].r) best[key] = { r: rank[ext], url };
};
walk('Audio', (rel) => {
  if (rel.toLowerCase().endsWith('.wav')) {
    const conv = 'web/audio/' + rel.slice('Audio/'.length).replace(/\.wav$/i, '.ogg');
    if (fs.existsSync(path.join(root, conv))) { consider(rel.replace(/\.wav$/i, '.ogg'), conv); sizes[conv] = fs.statSync(path.join(root, conv)).size; return; }
  }
  consider(rel, rel); sizes[rel] = fs.statSync(path.join(root, rel)).size;
});
for (const [k, v] of Object.entries(best)) audio[k] = v.url;

fs.writeFileSync(path.join(root, 'web/manifest.json'), JSON.stringify({ files, audio }));
const total = (o) => Object.values(o).reduce((a, b) => a + b, 0);
console.log('files', Object.keys(files).length, 'audio', Object.keys(audio).length);
