import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { applyEventToUnit } from '../../../src/engine/relations/effects';
import type { EventIntent } from '../../../src/engine/relations/intents';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, loadCore } from '../../helpers/world';

let base: Registries;
beforeAll(async () => {
  base = await loadCore();
});
const ANN = 'unit_ann';

/** The registries with one defect that carries eventStress. */
function reg(eventStress: Record<string, number>, extra: Record<string, unknown> = {}): Registries {
  const r = structuredClone(base);
  r.defects.set('stressy', { ...structuredClone(r.defects.get('echo_bleed')!), id: 'stressy', eventStress, ...extra });
  return r;
}
function state(r: Registries, flags: string[] = [], stress = 20): CampaignState {
  const s = campaign(r, 4);
  const u = s.squad.find((x) => x.id === ANN)!;
  u.defects = [{ id: 'stressy' }];
  u.stress = stress;
  s.relations[ANN].flags.push(...flags);
  return s;
}
const ev = (type: string, over: Partial<EventIntent> = {}): EventIntent => ({ type: type as never, actor: 'commander', targets: [ANN], severity: 'minor', evidence: 'x', confidence: 1, ...over });
const stressAfter = (r: Registries, s: CampaignState, e: EventIntent): number => {
  const d = structuredClone(s);
  applyEventToUnit(d, r, ANN, e);
  return d.squad.find((x) => x.id === ANN)!.stress;
};
/** What the same event does to a unit without the defect (the event's own table row). */
const plain = (r: Registries, e: EventIntent, stress = 20): number => {
  const s = state(r, [], stress);
  s.squad.find((x) => x.id === ANN)!.defects = [];
  return stressAfter(r, s, e);
};

describe('defect eventStress (P9d)', () => {
  it('adds stress when the event lands on her, on top of the table row', () => {
    const r = reg({ threatened: 3 });
    const e = ev('threatened', { measure: 'unspecified' });
    expect(stressAfter(r, state(r), e)).toBe(plain(r, e) + 3);
  });

  it('a negative value relieves stress', () => {
    const r = reg({ followed_lead: -3 });
    expect(stressAfter(r, state(r), ev('followed_lead'))).toBe(plain(r, ev('followed_lead')) - 3);
  });

  it('an event type not listed, or a unit without the field, adds nothing', () => {
    const r = reg({ threatened: 3 });
    expect(stressAfter(r, state(r), ev('praised'))).toBe(plain(r, ev('praised')));
    const none = state(reg({}));
    expect(stressAfter(reg({}), none, ev('threatened', { measure: 'unspecified' }))).toBe(plain(reg({}), ev('threatened', { measure: 'unspecified' })));
  });

  it('is clamped to 0..100', () => {
    const r = reg({ followed_lead: -50, threatened: 50 });
    expect(stressAfter(r, state(r, [], 10), ev('followed_lead'))).toBe(0);
    expect(stressAfter(r, state(r, [], 95), ev('threatened', { measure: 'unspecified' }))).toBe(100);
  });

  it('several defects add up', () => {
    const r = reg({ threatened: 3 });
    r.defects.set('second', { ...structuredClone(r.defects.get('echo_bleed')!), id: 'second', eventStress: { threatened: 2 } });
    const s = state(r);
    s.squad.find((x) => x.id === ANN)!.defects = [{ id: 'stressy' }, { id: 'second' }];
    expect(stressAfter(r, s, ev('threatened', { measure: 'unspecified' }))).toBe(plain(r, ev('threatened', { measure: 'unspecified' })) + 5);
  });

  it('co_command halves the positive values of the defect that names the flag, and leaves the negative ones', () => {
    const r = reg({ threatened: 4, followed_lead: -3 }, { embraceFlag: 'co_command' });
    const threat = ev('threatened', { measure: 'unspecified' });
    expect(stressAfter(r, state(r, ['co_command']), threat)).toBe(plain(r, threat) + 2);
    expect(stressAfter(r, state(r, []), threat)).toBe(plain(r, threat) + 4);
    expect(stressAfter(r, state(r, ['co_command']), ev('followed_lead'))).toBe(plain(r, ev('followed_lead')) - 3);
    // another flag does not halve
    expect(stressAfter(r, state(r, ['something_else']), threat)).toBe(plain(r, threat) + 4);
  });

  it('an event dropped by the confidence floor adds nothing', () => {
    const r = reg({ threatened: 4 });
    const low = ev('threatened', { measure: 'unspecified', confidence: 0.01 });
    expect(stressAfter(r, state(r), low)).toBe(20);
  });
});

describe('defect eventStress and a scaled event (review fix)', () => {
  it('follows the event scale: a witness-scaled event of zero adds nothing', () => {
    const r = reg({ threatened: 4 });
    const d = structuredClone(state(r));
    const before = d.squad.find((x) => x.id === ANN)!.stress;
    applyEventToUnit(d, r, ANN, ev('threatened', { measure: 'unspecified' }), { scale: 0 });
    expect(d.squad.find((x) => x.id === ANN)!.stress).toBe(before);
  });
});

