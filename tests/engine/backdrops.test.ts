import { beforeAll, describe, expect, it } from 'vitest';
import { REGISTRY_NAMES, type Entry, type Registries } from '../../src/content/types';
import { BackdropSchema, DESCRIBED_REGISTRIES, LocationSchema, QuartersStyleSchema, RESERVED_EVENT_TYPES } from '../../src/content/schemas';
import { quartersOf, roomHash, sceneBackdrop, slotLight } from '../../src/engine/backdrops';
import { fnv1a } from '../../src/engine/hub';
import type { CampaignState } from '../../src/engine/state/types';
import '../../src/engine/actions/immersion';
import { campaign, errors, loadCore, ofType, run, stubExpedition } from '../helpers/world';

let core: Registries;
let reg: Registries;
const ANN = 'unit_ann';

const style = (id: string): Entry => ({ id, name: id, summary: `the ${id} room`, description: `A ${id} room.`, background: `art/${id}.webp` });
const STYLES = ['alpha', 'beta', 'gamma'].map(style);

beforeAll(async () => {
  core = await loadCore();
  const locations = new Map(core.locations);
  locations.set('test_out', { id: 'test_out', name: 'Out', summary: 's', ascii: ['x'], background: 'art/out_day.webp', backgroundEvening: 'art/out_eve.webp', backgroundNight: 'art/out_night.webp' });
  locations.set('test_in', { id: 'test_in', name: 'In', summary: 's', ascii: ['x'], background: 'art/in.webp' });
  locations.set('test_bare', { id: 'test_bare', name: 'Bare', summary: 's', ascii: ['x'] });
  locations.set('test_mine', { id: 'test_mine', name: 'Mine', summary: 's', ascii: ['x'], perUnit: true, background: 'art/in.webp' });
  reg = { ...core, locations, quartersStyles: new Map(STYLES.map((e) => [String(e.id), e])) } as Registries;
});

const at = (slot: CampaignState['slot']): CampaignState => ({ ...campaign(core, 4), slot });

describe('registries', () => {
  it('quartersStyles is a described registry, backdrops a hidden one', () => {
    expect(REGISTRY_NAMES).toContain('quartersStyles');
    expect(REGISTRY_NAMES).toContain('backdrops');
    expect(DESCRIBED_REGISTRIES).toContain('quartersStyles');
    expect(DESCRIBED_REGISTRIES).not.toContain('backdrops' as never);
  });

  it('schemas: the new location fields, a style, the backdrop kinds', () => {
    expect(LocationSchema.safeParse({ id: 'l', name: 'L', summary: 's', ascii: ['x'], background: 'a', backgroundEvening: 'b', backgroundNight: 'c', floor: 'wood', ceiling: 'sky' }).success).toBe(true);
    expect(QuartersStyleSchema.safeParse(style('alpha')).success).toBe(true);
    expect(QuartersStyleSchema.safeParse({ ...style('alpha'), floor: 'wood', ceiling: 'room_1' }).success).toBe(true);
    expect(QuartersStyleSchema.safeParse({ id: 'x', name: 'X', description: 'd', background: 'b' }).success).toBe(false);
    expect(BackdropSchema.safeParse({ id: 'f', kind: 'surface', file: 'f.webp', surface: 'floor', finish: 'wood' }).success).toBe(true);
    expect(BackdropSchema.safeParse({ id: 's', kind: 'surface', file: 's.webp', surface: 'ceiling', finish: 'sky', slots: ['night'] }).success).toBe(true);
    expect(BackdropSchema.safeParse({ id: 'f', kind: 'surface', file: 'f.webp' }).success).toBe(false);
    expect(BackdropSchema.safeParse({ id: 'c', kind: 'frame', file: 'c.webp' }).success).toBe(true);
    expect(BackdropSchema.safeParse({ id: 'p', kind: 'place', file: 'p.webp' }).success).toBe(true);
    expect(BackdropSchema.safeParse({ id: 'p', kind: 'poster', file: 'p.webp' }).success).toBe(false);
  });

  it('quarters_set is a reserved event type', () => {
    expect(RESERVED_EVENT_TYPES).toContain('quarters_set');
  });
});

describe('quartersOf', () => {
  it('the default is stable by unit id, in registry order, with nothing stored', () => {
    const s = campaign(core, 4);
    for (const u of s.squad) {
      expect(u.quarters).toBeUndefined();
      expect(quartersOf(s, reg, u.id)!.id).toBe(STYLES[roomHash(u.id) % STYLES.length].id);
    }
  });

  it('review fix: the default room does not follow her hand (the hashes are salted apart)', async () => {
    const { handOf } = await import('../../src/engine/hand');
    const s = campaign(core, 4);
    for (let i = 0; i < 40; i++) s.squad.push({ ...structuredClone(s.squad[0]), id: `unit_h${i}` });
    const coreStyles = [...core.quartersStyles.keys()];
    const parity = s.squad.map((u) => [[...core.handFonts.keys()].indexOf(String(handOf(s, core, u.id)!.id)) % 2, coreStyles.indexOf(String(quartersOf(s, core, u.id)!.id)) % 2]);
    expect(parity.some(([a, b]) => a !== b)).toBe(true);
    expect(parity.some(([a, b]) => a === b)).toBe(true);
  });

  it('a stored style wins; one the pack lost falls back to the hash', () => {
    const s = campaign(core, 4);
    s.squad[0].quarters = 'gamma';
    expect(quartersOf(s, reg, ANN)!.id).toBe('gamma');
    s.squad[0].quarters = 'gone';
    expect(quartersOf(s, reg, ANN)!.id).toBe(STYLES[roomHash(ANN) % STYLES.length].id);
  });

  it('null for a grunt, an unknown unit and an empty registry', () => {
    const s = campaign(core, 4);
    s.squad[1].kind = 'grunt';
    expect(quartersOf(s, reg, s.squad[1].id)).toBeNull();
    expect(quartersOf(s, reg, 'nobody')).toBeNull();
    expect(quartersOf(s, { ...reg, quartersStyles: new Map() } as Registries, ANN)).toBeNull();
  });
});

describe('sceneBackdrop', () => {
  it('maps the slot to the location files; a file chosen for its slot is slot-specific', () => {
    expect(sceneBackdrop(at('morning'), reg, 'test_out', null)).toEqual([{ file: 'art/out_day.webp', slotted: false }]);
    expect(sceneBackdrop(at('afternoon'), reg, 'test_out', null)).toEqual([{ file: 'art/out_day.webp', slotted: false }]);
    expect(sceneBackdrop(at('evening'), reg, 'test_out', null)).toEqual([{ file: 'art/out_eve.webp', slotted: true }, { file: 'art/out_day.webp', slotted: false }]);
    expect(sceneBackdrop(at('night'), reg, 'test_out', null)).toEqual([{ file: 'art/out_night.webp', slotted: true }, { file: 'art/out_day.webp', slotted: false }]);
    expect(sceneBackdrop(at('night'), reg, 'test_in', null)).toEqual([{ file: 'art/in.webp', slotted: false }]);
  });

  it('nothing declared, or an unknown location: no candidates', () => {
    expect(sceneBackdrop(at('morning'), reg, 'test_bare', null)).toEqual([]);
    expect(sceneBackdrop(at('morning'), reg, 'nowhere', null)).toEqual([]);
  });

  it('a perUnit location puts the owner\'s style first, then its own files, without duplicates', () => {
    const s = at('evening');
    s.squad[0].quarters = 'beta';
    expect(sceneBackdrop(s, reg, 'test_mine', ANN)).toEqual([{ file: 'art/beta.webp', slotted: false }, { file: 'art/in.webp', slotted: false }]);
    expect(sceneBackdrop(s, reg, 'test_mine', null)).toEqual([{ file: 'art/in.webp', slotted: false }]);
    s.squad[0].quarters = 'alpha';
    const dup = { ...reg, quartersStyles: new Map([['alpha', { ...style('alpha'), background: 'art/in.webp' }]]) } as Registries;
    expect(sceneBackdrop(s, dup, 'test_mine', ANN)).toEqual([{ file: 'art/in.webp', slotted: false }]);
  });

  it('an owner\'s style is not used outside a perUnit location', () => {
    expect(sceneBackdrop(at('morning'), reg, 'test_in', ANN)).toEqual([{ file: 'art/in.webp', slotted: false }]);
  });

  it('slotLight', () => {
    expect([slotLight('morning'), slotLight('afternoon'), slotLight('evening'), slotLight('night')]).toEqual(['day', 'day', 'evening', 'night']);
  });
});

describe('squad/set_quarters', () => {
  const set = (s: CampaignState, payload: unknown) => run(s, reg, { type: 'squad/set_quarters', payload });

  it('stores the style and emits quarters_set; no rng', () => {
    const s = campaign(core, 4);
    const r = set(s, { unitId: ANN, styleId: 'beta' });
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'quarters_set')).toEqual([{ type: 'quarters_set', unitId: ANN, styleId: 'beta' }]);
    expect(r.state.squad[0].quarters).toBe('beta');
    expect(quartersOf(r.state, reg, ANN)!.id).toBe('beta');
    expect(r.state.rng).toEqual(s.rng);
  });

  it('rejects an unknown style, a grunt, an unknown unit and a bad payload, changing nothing', () => {
    const s = campaign(core, 4);
    const bad = set(s, { unitId: ANN, styleId: 'palace' });
    expect(errors(bad.events)).toHaveLength(1);
    expect(bad.state).toEqual(s);
    s.squad[2].kind = 'grunt';
    expect(errors(set(s, { unitId: s.squad[2].id, styleId: 'beta' }).events)).toHaveLength(1);
    expect(errors(set(s, { unitId: 'nobody', styleId: 'beta' }).events)).toHaveLength(1);
    expect(errors(set(s, {}).events)).toHaveLength(1);
  });

  it('is allowed while the squad is out', () => {
    const s = campaign(core, 4);
    s.expedition = stubExpedition(s);
    const r = set(s, { unitId: ANN, styleId: 'gamma' });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.squad[0].quarters).toBe('gamma');
  });
});
