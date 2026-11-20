import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { loadCore } from '../helpers/world';

/** Width and height of a WebP file, read from its header (VP8, VP8L or VP8X). */
export function webpSize(file: string): { w: number; h: number; alpha: boolean } {
  const b = readFileSync(file);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') throw new Error(`${file} is not a WebP`);
  const chunk = b.toString('ascii', 12, 16);
  if (chunk === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3), alpha: (b[20] & 0x10) !== 0 };
  if (chunk === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1, alpha: ((bits >> 28) & 1) === 1 };
  }
  if (chunk === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff, alpha: false };
  throw new Error(`${file}: unknown WebP chunk ${chunk}`);
}

const DIR = 'content/core/art/backdrops';
let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});

/** Every file a registry names (extension-relative), with whether it must be an opaque 3072×1280 image. */
function named(): Array<{ file: string; opaque: boolean; from: string }> {
  const out: Array<{ file: string; opaque: boolean; from: string }> = [];
  for (const l of reg.locations.values()) {
    for (const k of ['background', 'backgroundEvening', 'backgroundNight'] as const) {
      if (typeof l[k] === 'string') out.push({ file: String(l[k]), opaque: true, from: `locations:${String(l.id)}.${k}` });
    }
  }
  for (const s of reg.quartersStyles.values()) out.push({ file: String(s.background), opaque: true, from: `quartersStyles:${String(s.id)}` });
  for (const b of reg.backdrops.values()) out.push({ file: String(b.file), opaque: b.kind !== 'frame', from: `backdrops:${String(b.id)}` });
  return out;
}

describe('P10c backdrop assets', () => {
  it('every file a registry names exists, under the backdrops folder, as WebP', () => {
    const all = named();
    expect(all.length).toBeGreaterThanOrEqual(45);
    for (const n of all) {
      expect(n.file.startsWith(`${DIR}/`), n.from).toBe(true);
      expect(n.file.endsWith('.webp'), n.from).toBe(true);
      expect(existsSync(n.file), `${n.from}: ${n.file}`).toBe(true);
    }
  });

  it('every file in the backdrops folder is named by an entry', () => {
    const files = new Set(named().map((n) => n.file));
    for (const f of readdirSync(DIR)) expect(files.has(`${DIR}/${f}`), f).toBe(true);
  });

  it('opaque backdrops are 3072×1280 without alpha; frames keep their alpha', () => {
    for (const n of named()) {
      const size = webpSize(n.file);
      if (n.opaque) expect([size.w, size.h, size.alpha], n.from).toEqual([3072, 1280, false]);
      else expect(size.alpha, n.from).toBe(true);
    }
  });

  it('every finish a location or a style declares has a surface', () => {
    const finishes = (surface: 'floor' | 'ceiling'): Set<string> =>
      new Set([...reg.backdrops.values()].filter((b) => b.kind === 'surface' && b.surface === surface).map((b) => String(b.finish)));
    const floors = finishes('floor');
    const ceilings = finishes('ceiling');
    for (const e of [...reg.locations.values(), ...reg.quartersStyles.values()]) {
      if (e.floor !== undefined) expect(floors.has(String(e.floor)), `${String(e.id)} floor ${String(e.floor)}`).toBe(true);
      if (e.ceiling !== undefined) expect(ceilings.has(String(e.ceiling)), `${String(e.id)} ceiling ${String(e.ceiling)}`).toBe(true);
    }
  });

  it('fourteen room styles; every location but the per-unit one has a day background; the incoming folder is gone', () => {
    expect(reg.quartersStyles.size).toBe(14);
    const noArt = new Set(['laundry']); // P14c: a place with no art yet; the scene ends at the ASCII stage
    for (const l of reg.locations.values()) {
      if (l.perUnit === true || noArt.has(String(l.id))) expect(l.background, String(l.id)).toBeUndefined();
      else expect(typeof l.background, String(l.id)).toBe('string');
    }
    expect(existsSync('content/core/art/incoming')).toBe(false);
  });
});
