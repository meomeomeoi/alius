import { beforeAll, describe, expect, it } from 'vitest';
import { REGISTRY_NAMES, type Registries } from '../../src/content/types';
import { DESCRIBED_REGISTRIES, RESERVED_EVENT_TYPES } from '../../src/content/schemas';
import { handFamily, handOf, handScale } from '../../src/engine/hand';
import { fnv1a } from '../../src/engine/hub';
import type { CampaignState } from '../../src/engine/state/types';
import '../../src/engine/actions/immersion';
import '../../src/engine/actions/squad';
import { campaign, errors, loadCore, ofType, run } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
const ANN = 'unit_ann';
const ids = (): string[] => [...reg.handFonts.keys()];

describe('registry handFonts', () => {
  it('is a registry, described: the six of P10b in their old order, the six strict print hands, then the rest alphabetically (P10e-e, R10)', () => {
    expect(REGISTRY_NAMES).toContain('handFonts');
    expect(DESCRIBED_REGISTRIES).toContain('handFonts');
    const families = [...reg.handFonts.values()].map((e) => String(e.family));
    expect(families).toHaveLength(48);
    expect(families.slice(0, 6)).toEqual(['Caveat', 'Indie Flower', 'Patrick Hand', 'Shadows Into Light', 'Kalam', 'Nanum Pen Script']);
    expect(families.slice(6, 12)).toEqual(['Klee One', 'Playpen Sans', 'Neucha', 'Gaegu', 'Pangolin', 'Edu SA Beginner']);
    const rest = families.slice(12);
    expect(rest).toEqual([...rest].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())));
    for (const e of reg.handFonts.values()) {
      expect(String(e.name).length, String(e.id)).toBeGreaterThan(0);
      expect(String(e.description), String(e.id)).not.toMatch(/AUTHOR TO WRITE/);
    }
  });
});

describe('handScale (P10e-e: the measured size factor)', () => {
  const byFamily = (f: string) => [...reg.handFonts.values()].find((e) => e.family === f)!;
  it('is 1 for Caveat (the reference) and for no hand', () => {
    expect(handScale(byFamily('Caveat'))).toBe(1);
    expect(handScale(null)).toBe(1);
  });
  it('every entry has a measured scale in [0.6, 1.7]', () => {
    for (const e of reg.handFonts.values()) {
      expect(typeof e.scale, String(e.id)).toBe('number');
      expect(handScale(e), String(e.id)).toBeGreaterThanOrEqual(0.6);
      expect(handScale(e), String(e.id)).toBeLessThanOrEqual(1.7);
    }
  });
  it('a narrow hand is scaled up and a wide one down', () => {
    // The brief named Amatic SC as the narrow one; the prototype's measureHands gives it 0.83 (its small capitals are tall), so the
    // measured narrow hand is Just Another Hand. The rule wins (the values are what `cards.html` computes in Chromium).
    expect(handScale(byFamily('Just Another Hand'))).toBeGreaterThan(1);
    expect(handScale(byFamily('Rock Salt'))).toBeLessThan(1);
    expect(handScale(byFamily('Amatic SC'))).toBe(0.83);
  });
  it('the measured factors stay in the clamp of the rule (0.7–1.6) and are rounded to 0.01', () => {
    for (const e of reg.handFonts.values()) {
      expect(handScale(e), String(e.id)).toBeGreaterThanOrEqual(0.7);
      expect(handScale(e), String(e.id)).toBeLessThanOrEqual(1.6);
      expect(Math.round(handScale(e) * 100) / 100, String(e.id)).toBe(handScale(e));
    }
  });
});

describe('handOf', () => {
  it('the default hand is stable by unit id and needs no stored field', () => {
    const s = campaign(reg, 4);
    const n = reg.handFonts.size;
    for (const u of s.squad) {
      expect(u.hand).toBeUndefined();
      expect(handOf(s, reg, u.id)!.id).toBe(ids()[fnv1a(u.id) % n]);
      expect(handOf(s, reg, u.id)!.id).toBe(handOf(structuredClone(s), reg, u.id)!.id);
    }
    expect(s.squad.every((u) => u.hand === undefined)).toBe(true);
  });

  it('with no chosen hand it is fnv1a(unitId) % 48 in registry order (R10: an old save may get a new hand once)', () => {
    const s = campaign(reg, 4);
    expect(reg.handFonts.size).toBe(48);
    for (const u of s.squad) expect(handOf(s, reg, u.id)!.id).toBe(ids()[fnv1a(u.id) % 48]);
  });

  it('the four named units do not all share one hand', () => {
    const s = campaign(reg, 4);
    expect(new Set(s.squad.map((u) => handOf(s, reg, u.id)!.id)).size).toBeGreaterThan(1);
  });

  it('unit.hand wins when it names an entry; a hand the pack lost falls back to the hash', () => {
    const s = campaign(reg, 4);
    s.squad[0].hand = 'kalam';
    expect(handOf(s, reg, ANN)!.id).toBe('kalam');
    s.squad[0].hand = 'no_such_hand';
    expect(handOf(s, reg, ANN)!.id).toBe(ids()[fnv1a(ANN) % reg.handFonts.size]);
  });

  it('null for a grunt and for a unit that does not exist; the family is read through handFamily', () => {
    const s = campaign(reg, 4);
    s.squad[1].kind = 'grunt';
    expect(handOf(s, reg, s.squad[1].id)).toBeNull();
    expect(handOf(s, reg, 'nobody')).toBeNull();
    expect(handFamily(handOf(s, reg, ANN)!)).toBe(String(handOf(s, reg, ANN)!.family));
  });

  it('an empty registry gives null, not a crash', () => {
    const empty = { ...reg, handFonts: new Map() } as Registries;
    expect(handOf(campaign(reg, 4), empty, ANN)).toBeNull();
  });
});

describe('squad/set_hand', () => {
  const set = (s: CampaignState, payload: unknown) => run(s, reg, { type: 'squad/set_hand', payload });

  it('stores the hand, reads it back and emits hand_set', () => {
    const r = set(campaign(reg, 4), { unitId: ANN, handId: 'shadows_into_light' });
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'hand_set')).toEqual([{ type: 'hand_set', unitId: ANN, handId: 'shadows_into_light' }]);
    expect(r.state.squad[0].hand).toBe('shadows_into_light');
    expect(handOf(r.state, reg, ANN)!.id).toBe('shadows_into_light');
  });

  it('an unknown hand and a grunt are rejected and change nothing', () => {
    const s = campaign(reg, 4);
    const bad = set(s, { unitId: ANN, handId: 'comic_sans' });
    expect(errors(bad.events)).toHaveLength(1);
    expect(bad.state).toEqual(s);
    s.squad[2].kind = 'grunt';
    const grunt = set(s, { unitId: s.squad[2].id, handId: 'kalam' });
    expect(errors(grunt.events)).toHaveLength(1);
    expect(errors(set(s, { unitId: 'nobody', handId: 'kalam' }).events)).toHaveLength(1);
    expect(errors(set(s, {}).events)).toHaveLength(1);
  });

  it('draws no rng, and re-sync keeps the hand', () => {
    const s = campaign(reg, 4);
    const r = set(s, { unitId: ANN, handId: 'kalam' });
    expect(r.state.rng).toEqual(s.rng);
    const synced = run(r.state, reg, { type: 'squad/resync', payload: { unitId: ANN, patch: { likes: ['tea'] } } });
    expect(errors(synced.events)).toEqual([]);
    expect(synced.state.squad[0].hand).toBe('kalam');
  });

  it('hand_set is a reserved event type', () => {
    expect(RESERVED_EVENT_TYPES).toContain('hand_set');
  });
});
