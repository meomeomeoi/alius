import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

// Bundles the headless balance harness and runs it with the given arguments: npm run sim -- --neutrality
const out = resolve('node_modules/.cache/alius/sim.mjs');
mkdirSync(resolve('node_modules/.cache/alius'), { recursive: true });
await build({
  entryPoints: ['src/sim/cli.ts'],
  outfile: out,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  logLevel: 'warning',
});
await import(pathToFileURL(out).href);
