import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { impunityOf } from '../../../src/engine/discipline/impunity';
import { accessCan, deviceAccess } from '../../../src/engine/personal/access';
import { decorOf, pinnedNotes, wallpaperUnit } from '../../../src/engine/personal/decor';
import { personalDayStep } from '../../../src/engine/personal/dayStep';
import { personalOf } from '../../../src/engine/personal/state';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { withBond } from '../../helpers/bonds';
import { campaign, ctxOf, errors, loadCore, ofType, run, setRecord, setRelation } from '../../helpers/discipline';
import '../../helpers/power';
import '../../../src/engine/actions/personal';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});

const [ANN, BEA] = ['unit_ann', 'unit_bea'];
type Lead = 'yielding' | 'balanced' | 'assertive' | 'dominant';

/** Puts her Impunity at exactly `n` (moves the stored record). */
function atImpunity(s: CampaignState, id: string, n: number): void {
  setRecord(s, id, 0);
  const at0 = impunityOf(s, reg, id)!.value;
  setRecord(s, id, n - at0);
  expect(impunityOf(s, reg, id)!.value).toBe(n);
}

/** A unit with an imported profile, a state, and Impunity pinned at 20 unless given. */
function unit(lead: Lead, stateId: string, impunity = 20, id = ANN, s = fresh()): CampaignState {
  withBond(s, id, { leadStyle: lead });
  setRelation(s, id, { stateId, affinity: 60, trust: 60 });
  atImpunity(s, id, impunity);
  return s;
}
function fresh(): CampaignState {
  const s = campaign(reg, 4);
  for (const u of s.squad) u.defects = [];
  return s;
}
const level = (s: CampaignState, id = ANN) => deviceAccess(s, reg, id);
const step = (s: CampaignState) => {
  const d = structuredClone(s);
  const events = personalDayStep(d, ctxOf(d, reg));
  return { state: d, events };
};

describe('device access derives from the table', () => {
  it('a balanced friend is 1, a balanced confidant 2, an assertive lover 3, a dominant lover 4', () => {
    expect(level(unit('balanced', 'friend'))).toBe(1);
    expect(level(unit('balanced', 'confidant'))).toBe(2);
    expect(level(unit('assertive', 'lover'))).toBe(3);
    expect(level(unit('dominant', 'lover'))).toBe(4);
  });

  it('a yielding unit, a unit with no imported bond and a stranger have none', () => {
    expect(level(unit('yielding', 'lover'))).toBe(0);
    expect(level(fresh())).toBe(0);
    expect(level(unit('dominant', 'stranger'))).toBe(0);
    expect(level(unit('dominant', 'lover'), 'nobody')).toBe(0);
  });

  it('Impunity 60 gives a balanced unit level 3; 75 needs a dominant one for level 4', () => {
    expect(level(unit('balanced', 'friend', 60))).toBe(3);
    expect(level(unit('balanced', 'friend', 59))).toBe(1);
    expect(level(unit('assertive', 'friend', 75))).toBe(3);
    expect(level(unit('dominant', 'friend', 74))).toBe(3);
    expect(level(unit('dominant', 'friend', 75))).toBe(4);
  });

  it('a level never grants a higher level\'s capability', () => {
    const caps = ['decor', 'notes', 'calendar', 'messages'] as const;
    const states: Array<[number, CampaignState]> = [
      [0, fresh()],
      [1, unit('balanced', 'friend')],
      [2, unit('balanced', 'confidant')],
      [3, unit('assertive', 'lover')],
      [4, unit('dominant', 'lover')],
    ];
    for (const [lvl, s] of states) {
      expect(level(s), `level ${lvl}`).toBe(lvl);
      caps.forEach((cap, i) => expect(accessCan(s, reg, ANN, cap), `${cap} at ${lvl}`).toBe(lvl >= i + 1));
    }
  });

  it('pressureGate booking needs level 3', () => {
    const s = unit('balanced', 'lover');
    expect(level(s)).toBe(2);
    expect(accessCan(s, reg, ANN, 'calendar')).toBe(false);
  });
});

describe('decor', () => {
  it('the day step places decor once with all three parts and one wallpaper owner (the highest Affinity)', () => {
    let s = unit('balanced', 'friend');
    s = unit('assertive', 'lover', 20, BEA, s);
    setRelation(s, ANN, { affinity: 50 });
    setRelation(s, BEA, { affinity: 80 });
    const a = step(s);
    expect(ofType(a.events, 'decor_placed').map((e) => e.unitId).sort()).toEqual([ANN, BEA]);
    expect(a.state.personal!.decor![ANN].parts).toEqual(['sticker', 'wallpaper', 'contact']);
    expect(a.state.personal!.decor![BEA].since).toBe(s.day);
    expect(a.state.personal!.decor![ANN].contactName).toContain('Ann');
    expect(wallpaperUnit(a.state)).toBe(BEA);
    // placed once: a second step changes nothing and emits no placement
    a.state.day += 1;
    const b = step(a.state);
    expect(ofType(b.events, 'decor_placed')).toEqual([]);
    expect(b.state.personal!.decor![ANN].since).toBe(s.day);
  });

  it('the day step draws no rng and creates nothing for a squad with no access', () => {
    const s = fresh();
    const r = step(s);
    expect(r.state.personal).toBeUndefined();
    expect(r.state.rng).toEqual(s.rng);
  });

  it('peeling a sticker applies decor_removed and it does not regrow for 7 days', () => {
    const s0 = unit('balanced', 'friend');
    const s = step(s0).state;
    const before = s.relations[ANN].affinity;
    const r = run(s, reg, { type: 'device/remove_decor', payload: { unitId: ANN, part: 'sticker' } });
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'decor_removed_by_commander')).toEqual([{ type: 'decor_removed_by_commander', unitId: ANN, part: 'sticker' }]);
    expect(r.state.relations[ANN].affinity).toBeLessThan(before);
    expect(r.state.relations[ANN].history.filter((h) => h.kind === 'event').at(-1)).toMatchObject({ type: 'decor_removed', severity: 'minor' });
    expect(decorOf(r.state, ANN)!.parts).toEqual(['wallpaper', 'contact']);
    expect(r.state.personal!.decor![ANN].removed).toEqual({ sticker: s.day });
    const regrow = TUNING.personal.decor.regrowDays;
    const early = structuredClone(r.state);
    early.day += regrow - 1;
    expect(decorOf(step(early).state, ANN)!.parts).not.toContain('sticker');
    const late = structuredClone(r.state);
    late.day += regrow;
    const back = step(late).state;
    expect(decorOf(back, ANN)!.parts).toContain('sticker');
    expect(back.personal!.decor![ANN].removed).toBeUndefined();
  });

  it('peeling a part that is not there, or an unknown unit or part, is refused and changes nothing', () => {
    const s = step(unit('balanced', 'friend')).state;
    const peeled = run(s, reg, { type: 'device/remove_decor', payload: { unitId: ANN, part: 'sticker' } }).state;
    for (const payload of [{ unitId: ANN, part: 'sticker' }, { unitId: ANN, part: 'tattoo' }, { unitId: 'nobody', part: 'sticker' }, { unitId: BEA, part: 'sticker' }]) {
      const r = run(peeled, reg, { type: 'device/remove_decor', payload });
      expect(errors(r.events), JSON.stringify(payload)).toHaveLength(1);
      expect(r.state).toEqual(peeled);
    }
  });

  it('access falling to 0 fades decor for 7 days, then it is gone; access coming back clears the fade', () => {
    const placed = step(unit('balanced', 'friend')).state;
    const fadeDays = TUNING.personal.decor.fadeDays;
    // a break-up: her state is no longer one with a path to level 1
    const broken = structuredClone(placed);
    setRelation(broken, ANN, { stateId: 'estranged' });
    expect(level(broken)).toBe(0);
    const faded = step(broken);
    expect(ofType(faded.events, 'decor_faded')).toEqual([{ type: 'decor_faded', unitId: ANN, until: broken.day + fadeDays }]);
    expect(faded.state.personal!.decor![ANN].fadedUntil).toBe(broken.day + fadeDays);
    expect(decorOf(faded.state, ANN)).not.toBeNull(); // still visible, as a faded mark
    // the fade does not restart on the next step
    const later = structuredClone(faded.state);
    later.day += fadeDays;
    expect(decorOf(step(later).state, ANN)).not.toBeNull();
    expect(step(later).state.personal!.decor![ANN].fadedUntil).toBe(broken.day + fadeDays);
    // one day after: gone
    later.day += 1;
    expect(decorOf(later, ANN)).toBeNull();
    expect(step(later).state.personal!.decor?.[ANN]).toBeUndefined();
    // access coming back inside the window clears the fade
    const back = structuredClone(faded.state);
    setRelation(back, ANN, { stateId: 'friend' });
    back.day += 2;
    const cleared = step(back).state;
    expect(cleared.personal!.decor![ANN].fadedUntil).toBeUndefined();
    expect(decorOf(cleared, ANN)).not.toBeNull();
  });
});

describe('notes', () => {
  const ruleOf = (unitId: string, status: 'active' | 'proposed', text: string, id: string) =>
    ({ id, unitId, templateId: 'daily_contact', text, status, day: 1, brokenCount: 0 }) as const;

  it('notes list her active rules and one authored line, the same all day', () => {
    const s = unit('balanced', 'confidant');
    s.bonds = { rules: [ruleOf(ANN, 'active', 'Tell me before you ride out.', 'r1'), ruleOf(ANN, 'proposed', 'Not yet agreed.', 'r2')] };
    const a = pinnedNotes(s, reg);
    expect(a).toHaveLength(1);
    expect(a[0].unitId).toBe(ANN);
    expect(a[0].lines[0]).toBe('Tell me before you ride out.');
    expect(a[0].lines).toHaveLength(2);
    expect(a[0].lines.join(' ')).not.toContain('Not yet agreed.');
    const authored = (reg.deviceAccessRules.get([...reg.deviceAccessRules.values()].find((e) => e.level === 2)!.id as string)!.notes as string[])
      .map((n) => n.replace('{name}', 'Ann'));
    expect(authored).toContain(a[0].lines[1]);
    expect(pinnedNotes(s, reg)).toEqual(a); // the same all day, nothing stored
    expect(s.personal).toBeUndefined();
  });

  it('a unit below level 2 has no note, and a squad with none lists nothing', () => {
    const s = unit('balanced', 'friend');
    s.bonds = { rules: [ruleOf(ANN, 'active', 'Tell me before you ride out.', 'r1')] };
    expect(level(s)).toBe(1);
    expect(pinnedNotes(s, reg)).toEqual([]);
    expect(pinnedNotes(fresh(), reg)).toEqual([]);
  });
});

describe('the personal state stays out of the way', () => {
  it('reading access never creates personal state', () => {
    const s = unit('dominant', 'lover');
    level(s);
    accessCan(s, reg, ANN, 'messages');
    expect(s.personal).toBeUndefined();
    expect(personalOf(s).seq).toBe(0);
  });
});
