import { beforeAll, describe, expect, it } from 'vitest';
import { REGISTRY_NAMES, type Registries } from '../../src/content/types';
import { DESCRIBED_REGISTRIES, RESERVED_EVENT_TYPES } from '../../src/content/schemas';
import { handFamily, handOf } from '../../src/engine/hand';
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
  it('is a registry, described, with the six bundled hands in order', () => {
    expect(REGISTRY_NAMES).toContain('handFonts');
    expect(DESCRIBED_REGISTRIES).toContain('handFonts');
    expect([...reg.handFonts.values()].map((e) => e.family)).toEqual(['Caveat', 'Indie Flower', 'Patrick Hand', 'Shadows Into Light', 'Kalam', 'Nanum Pen Script']);
    for (const e of reg.handFonts.values()) expect(String(e.name).length, String(e.id)).toBeGreaterThan(0);
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
