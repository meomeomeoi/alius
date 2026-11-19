import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { dispatch } from '../../src/engine/dispatch';
import { buildCampaign } from '../../src/engine/setup';
import type { CampaignState, Unit } from '../../src/engine/state/types';
import { EXPECTATION_KINDS, fallbackAgenda, learnExpectation, normalizeAgenda, wardenOf } from '../../src/engine/warden';
import { loadCore, unitSetup } from '../helpers/world';
import '../../src/engine/actions/warden';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const ZERO = { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 0, corporate: 0, sacrifice: 0 };
const build = (values: Partial<Unit['values']> = {}): CampaignState => {
  const r = buildCampaign({
    commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny', units: [unitSetup('Ann', { values: { ...ZERO, ...values } }), unitSetup('Bea')],
    mode: { kind: 'leashswap', deathRule: 'rewind_day', warden: { by: 'player', index: 0 } },
  }, reg, { desireBondDefects: false, seed: 5 });
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.state;
};
const sum = (xs: Array<{ weight: number }>): number => Math.round(xs.reduce((n, x) => n + x.weight, 0) * 100) / 100;

describe('the registry', () => {
  it('has one entry per non-personal kind, with a label and a description', () => {
    const kinds = [...reg.wardenExpectations.values()].map((e) => e.kind);
    expect(kinds.sort()).toEqual(EXPECTATION_KINDS.filter((k) => k !== 'personal').sort());
    for (const e of reg.wardenExpectations.values()) {
      expect(String(e.label).length).toBeGreaterThan(0);
      expect(String(e.description).length).toBeGreaterThan(0);
      expect(['low', 'medium', 'high']).toContain(e.weight);
    }
  });
});

describe('fallbackAgenda', () => {
  it('picks by values and normalizes to 1', () => {
    const s = build({ mercy: 3, ingroup: 2 });
    const list = fallbackAgenda(s, reg, s.squad[0].id);
    expect(list.slice(0, 2).map((x) => x.kind)).toEqual(['no_civilian_harm', 'protect_squad']);
    expect(list.length).toBeGreaterThanOrEqual(3);
    expect(list.length).toBeLessThanOrEqual(5);
    expect(sum(list)).toBe(1);
    expect(list.filter((x) => x.known)).toHaveLength(1);
    expect(list.every((x) => x.source === 'values' || x.source === 'corporate')).toBe(true);
    expect(new Set(list.map((x) => x.id)).size).toBe(list.length);
  });

  it('the known one is the heaviest', () => {
    const s = build({ mercy: 3, ingroup: 2 });
    const list = fallbackAgenda(s, reg, s.squad[0].id);
    const heaviest = Math.max(...list.map((x) => x.weight));
    expect(list.find((x) => x.known)!.weight).toBe(heaviest);
  });

  it('obey_oversight joins a unit whose corporate value is 1 or more', () => {
    const s = build({ mercy: 3, ingroup: 3, corporate: 1 });
    const list = fallbackAgenda(s, reg, s.squad[0].id);
    expect(list.map((x) => x.kind)).toContain('obey_oversight');
    const none = build({ mercy: 3, ingroup: 3 });
    expect(fallbackAgenda(none, reg, none.squad[0].id).map((x) => x.kind)).not.toContain('obey_oversight');
  });

  it('is written into the state at seeding, so the campaign is playable with no model', () => {
    const s = build({ mercy: 3, ingroup: 2 });
    const w = wardenOf(s)!;
    expect(w.agenda).toBe('fallback');
    expect(w.expectations).toEqual(fallbackAgenda(s, reg, w.unitId));
  });

  it('draws nothing', () => {
    const s = build({ mercy: 1 });
    const before = structuredClone(s.rng);
    fallbackAgenda(s, reg, s.squad[0].id);
    expect(s.rng).toEqual(before);
  });
});

describe('normalizeAgenda', () => {
  const item = (kind: string, weight = 'medium', extra: Record<string, unknown> = {}) => ({ kind, weight, source: 'values', ...extra });

  it('keeps a valid answer, normalized, the first by weight known', () => {
    const out = normalizeAgenda([item('protect_squad', 'high'), item('meet_quota', 'medium'), item('keep_me_close', 'low')], reg)!;
    expect(out.map((x) => x.kind)).toEqual(['protect_squad', 'meet_quota', 'keep_me_close']);
    expect(sum(out)).toBe(1);
    expect(out[0].weight).toBeGreaterThan(out[1].weight);
    expect(out.filter((x) => x.known).map((x) => x.kind)).toEqual(['protect_squad']);
  });

  it('drops unknown kinds and duplicates, caps personal at 2', () => {
    const out = normalizeAgenda([
      item('protect_squad', 'high'), item('protect_squad', 'low'), item('fly_to_the_moon'), item('meet_quota'),
      item('personal', 'medium', { text: 'Never leave a window open.' }), item('personal', 'low', { text: 'Tea at six.' }), item('personal', 'low', { text: 'A third one.' }),
    ], reg)!;
    expect(out.map((x) => x.kind)).toEqual(['protect_squad', 'meet_quota', 'personal', 'personal']);
    expect(out.filter((x) => x.kind === 'personal').map((x) => x.text)).toEqual(['Never leave a window open.', 'Tea at six.']);
  });

  it('refuses fewer than 3 and keeps at most 5', () => {
    expect(normalizeAgenda([item('protect_squad'), item('meet_quota')], reg)).toBeNull();
    expect(normalizeAgenda([item('protect_squad'), item('meet_quota'), item('nonsense')], reg)).toBeNull();
    const six = normalizeAgenda(EXPECTATION_KINDS.filter((k) => k !== 'personal').map((k) => item(k)).concat(item('personal', 'low', { text: 'x' })), reg)!;
    expect(six).toHaveLength(5);
  });

  it('a personal item needs text of at most 80 characters, and never gives the commander a pronoun', () => {
    const base = [item('protect_squad', 'high'), item('meet_quota'), item('keep_me_close')];
    expect(normalizeAgenda([...base, item('personal', 'low')], reg)!).toHaveLength(3); // no text: dropped
    expect(normalizeAgenda([...base, item('personal', 'low', { text: 'x'.repeat(81) })], reg)!).toHaveLength(3);
    expect(normalizeAgenda([...base, item('personal', 'low', { text: 'She wants him to stay in sight.' })], reg)!).toHaveLength(3);
    expect(normalizeAgenda([...base, item('personal', 'low', { text: 'The commander stays in sight.' })], reg)!).toHaveLength(4);
    expect(normalizeAgenda([...base, item('personal', 'low', { text: 'Be back by day 5.' })], reg)!).toHaveLength(4); // digits are fine in text; weights are the model's enum only
  });

  it('a weight that is not low, medium or high drops the item; a source that is unknown becomes card', () => {
    const out = normalizeAgenda([item('protect_squad', '0.7'), item('meet_quota'), item('keep_me_close', 'high', { source: 'dreams' }), item('obey_oversight')], reg)!;
    expect(out.map((x) => x.kind)).toEqual(['meet_quota', 'keep_me_close', 'obey_oversight']);
    expect(out.find((x) => x.kind === 'keep_me_close')!.source).toBe('card');
  });

  it('refuses a non-list', () => {
    expect(normalizeAgenda(undefined as never, reg)).toBeNull();
    expect(normalizeAgenda('nope' as never, reg)).toBeNull();
  });
});

describe('warden/agenda', () => {
  const good = (s: CampaignState) => ({ expectations: normalizeAgenda([
    { kind: 'meet_quota', weight: 'high', source: 'corporate' }, { kind: 'keep_me_close', weight: 'medium' }, { kind: 'protect_squad', weight: 'low' },
  ], reg)!, unitId: s.squad[0].id });
  const run = (s: CampaignState, payload: unknown) => dispatch(s, { type: 'warden/agenda', payload }, reg);
  const refused = (r: ReturnType<typeof run>) => r.events.find((e) => e.type === 'error');

  it("the model's agenda replaces the fallback once", () => {
    const s = build({ mercy: 3 });
    const a = run(s, good(s));
    expect(refused(a)).toBeUndefined();
    expect(wardenOf(a.state)!.agenda).toBe('model');
    expect(wardenOf(a.state)!.expectations.map((x) => x.kind)).toEqual(['meet_quota', 'keep_me_close', 'protect_squad']);
    expect(a.events.map((e) => e.type)).toContain('warden_agenda_set');
    const again = run(a.state, good(s));
    expect(refused(again)?.message).toBe('The agenda is already in play.');
    expect(again.state).toEqual(a.state);
  });

  it('is refused after an override has fired', () => {
    const s = build();
    wardenOf(s)!.overrideFired = true;
    expect(refused(run(s, good(s)))?.message).toBe('The agenda is already in play.');
  });

  it('is refused outside the mode and when the list is malformed', () => {
    const s = build();
    const plain = structuredClone(s);
    delete plain.leashswap;
    expect(refused(run(plain, good(s)))).toBeDefined();
    expect(refused(run(s, { expectations: [] }))).toBeDefined();
    expect(refused(run(s, { expectations: good(s).expectations.slice(0, 2) }))).toBeDefined();
    const bad = good(s).expectations.map((x) => ({ ...x }));
    bad[0].kind = 'nonsense' as never;
    expect(refused(run(s, { expectations: bad }))).toBeDefined();
    const heavy = good(s).expectations.map((x) => ({ ...x, weight: 0.9 }));
    expect(refused(run(s, { expectations: heavy }))).toBeDefined();
  });

  it('the engine, not the answer, decides which one is known', () => {
    const s = build();
    const list = good(s).expectations.map((x) => ({ ...x, known: true }));
    const a = run(s, { expectations: list });
    expect(wardenOf(a.state)!.expectations.filter((x) => x.known)).toHaveLength(1);
  });
});

describe('learnExpectation', () => {
  it('makes it known and says so once; an event carries only the id', () => {
    const s = build({ mercy: 3, ingroup: 2 });
    const w = wardenOf(s)!;
    const hidden = w.expectations.find((x) => !x.known)!;
    const ev = learnExpectation(s, hidden.id);
    expect(ev).toEqual([{ type: 'expectation_learned', expectationId: hidden.id }]);
    expect(wardenOf(s)!.expectations.find((x) => x.id === hidden.id)!.known).toBe(true);
    expect(learnExpectation(s, hidden.id)).toEqual([]);
    expect(learnExpectation(s, 'nope')).toEqual([]);
  });
});
