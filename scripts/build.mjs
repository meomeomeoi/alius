import { build } from 'esbuild';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const stExternals = {
  name: 'st-externals',
  setup(b) {
    b.onResolve({ filter: /^st:/ }, (args) => ({
      path: '../../../../' + args.path.slice(3) + '.js',
      external: true,
    }));
  },
};

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  format: 'esm',
  target: 'es2022',
  plugins: [stExternals],
  logLevel: 'warning',
});

const css = readdirSync('css')
  .filter((f) => f.endsWith('.css'))
  .sort()
  .map((f) => readFileSync(`css/${f}`, 'utf8'))
  .join('\n');
writeFileSync('style.css', css);
