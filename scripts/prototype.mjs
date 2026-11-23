// P10e chunk (e): builds a reference prototype from docs/prototypes/<name>.html into one self-contained page.
//   npm run proto -- breath                      (the layout fixture's placeholder sprite)
//   npm run proto -- breath --sprite ~/her.webp  (any local sprite; it is inlined into the output, never into the repo)
// `%%ASSET:<path from the repo root>%%` becomes a data URL of that file, `%%SPRITE%%` the sprite. A file URL cannot load fonts,
// so everything is inlined. The page goes to .superpowers/prototypes/<name>.html (ignored by git).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const name = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--sprite');
const si = args.indexOf('--sprite');
const sprite = si >= 0 ? resolve(args[si + 1] ?? '') : resolve(root, 'tests/fixtures/layout/sprite.svg');
if (!name) { console.error('usage: npm run proto -- <name> [--sprite <file>]'); process.exit(1); }
const src = resolve(root, 'docs/prototypes', `${name}.html`);
if (!existsSync(src)) { console.error(`no prototype ${src}`); process.exit(1); }
if (!existsSync(sprite)) { console.error(`no sprite ${sprite}`); process.exit(1); }

const MIME = { '.woff2': 'font/woff2', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const dataUrl = (file) => `data:${MIME[extname(file).toLowerCase()] ?? 'application/octet-stream'};base64,${readFileSync(file).toString('base64')}`;

let html = readFileSync(src, 'utf8');
html = html.replace(/%%ASSET:([^%]+)%%/g, (_, p) => {
  const file = resolve(root, p);
  if (!file.startsWith(root) || !existsSync(file)) throw new Error(`missing asset ${p}`);
  return dataUrl(file);
});
html = html.replaceAll('%%SPRITE%%', dataUrl(sprite));
const outDir = resolve(root, '.superpowers/prototypes');
mkdirSync(outDir, { recursive: true });
const out = resolve(outDir, `${name}.html`);
writeFileSync(out, html);
console.log(out);
