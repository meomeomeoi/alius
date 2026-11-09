import { readFileSync, writeFileSync } from 'node:fs';
import { loadPacks } from '../content/loader';
import { formatReport, neutralityReport, runBatch } from './harness';

/** `npm run sim -- [--runs N] [--seed N] [--level N] [--danger N] [--defect id] [--neutrality] [--out path]` */
async function main(argv: string[]): Promise<void> {
  const opt = (name: string, fallback: string): string => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
  };
  const runs = Number(opt('runs', '2000'));
  const seed = Number(opt('seed', '1'));
  const level = Number(opt('level', '5'));
  const danger = Number(opt('danger', '2'));
  const out = argv.includes('--out') ? opt('out', '') : '';

  const { registries, errors } = await loadPacks(['content/core'], async (p) => JSON.parse(readFileSync(p, 'utf8')));
  if (errors.length > 0) throw new Error(`content errors: ${JSON.stringify(errors.slice(0, 3))}`);

  let text: string;
  if (argv.includes('--neutrality')) {
    text = formatReport(neutralityReport(registries, { runs, seed, level, danger }));
  } else {
    const defectId = argv.includes('--defect') ? opt('defect', '') : null;
    const r = runBatch(registries, { runs, seed, level, danger, defectId });
    text = [
      `${runs} combats, squad level ${level}, danger ${danger}${defectId ? `, defect ${defectId}` : ''}`,
      `win rate ${(r.winRate * 100).toFixed(1)} %, average ${r.avgRounds.toFixed(2)} rounds, end stress ${r.avgEndStress.toFixed(1)}`,
    ].join('\n') + '\n';
  }
  process.stdout.write(text);
  if (out) writeFileSync(out, text);
}

main(process.argv.slice(2)).catch((e) => {
  process.stderr.write(`${e instanceof Error ? e.stack : String(e)}\n`);
  process.exit(1);
});
