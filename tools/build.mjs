// web/js/main.js -> web/dist/main.js 번들, ruby.wasm 복사, 매니페스트 갱신
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

await build({
  entryPoints: [path.join(root, 'web/js/main.js')],
  outfile: path.join(root, 'web/dist/main.js'),
  bundle: true, format: 'iife', platform: 'browser', target: ['es2020'],
  minify: true, sourcemap: false, logLevel: 'info',
  define: { 'process.env.NODE_ENV': '"production"' },
  nodePaths: [path.join(here, 'node_modules')],
});

const wasm = path.join(here, 'node_modules/@ruby/3.3-wasm-wasi/dist/ruby+stdlib.wasm');
const dst = path.join(root, 'web/ruby/ruby+stdlib.wasm');
fs.mkdirSync(path.dirname(dst), { recursive: true });
if (!fs.existsSync(dst) || fs.statSync(dst).size !== fs.statSync(wasm).size) fs.copyFileSync(wasm, dst);

execFileSync('ruby', [path.join(here, 'gen_rpg.rb')], { stdio: 'inherit' });
execFileSync('node', [path.join(here, 'gen_manifest.mjs')], { stdio: 'inherit' });
