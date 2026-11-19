import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { removeFromService } from '../../src/engine/leash/use';
import { startDesertion, talkDown } from '../../src/engine/loyalty/desertion';
import { validateIntents } from '../../src/engine/relations/intents';
import { Rng } from '../../src/engine/rng';
import { actOnWarning, preemptBonus } from '../../src/engine/special/paranoia/accusations';
import { openPremonition, warnedInput } from '../../src/engine/special/paranoia/premonitions';
import { commanderStress } from '../../src/engine/special/commanderStress';
import type { PremonitionAbout } from '../../src/engine/special/state';
import type { CampaignState } from '../../src/engine/state/types';
import type { IntentExtractInput } from '../../src/llm/calls/intentExtract';
import { extractIntents } from '../helpers/calls';
import { getSettings } from '../../src/settings';
import { FakeStAdapter } from '../../src/st/fake';
import { loadCore, run } from '../helpers/world';
import { ANN, BEA, reseed, specialCampaign } from '../helpers/special';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const ctxOf = (s: CampaignState) => ({ registries: reg, rng: new Rng(s.rng) });
const withPm = (about: PremonitionAbout, real: boolean, unit = ANN): CampaignState => {
  const s = specialCampaign(reg, 'bloom_paranoia');
  for (const id of [ANN, BEA]) s.relations[id].trust = 60;
  const p = s.special!.paranoia!;
  p.seq = 1;
  p.premonitions.push({ id: 'pm1', unitId: unit, about, day: s.day, expiresDay: s.day + 3, real });
  return s;
};
const hist = (s: CampaignState, id: string, type: string) => s.relations[id].history.filter((h) => h.type === type);

describe('acting on a false alarm', () => {
  it('accused → false_accusation at extreme, commander stress +5, the warning closed', () => {
    const s = withPm('mutiny', false);
    const trust = s.relations[ANN].trust;
    const events = actOnWarning(s, ctxOf(s), ANN, 'accused');
    expect(hist(s, ANN, 'false_accusation')).toMatchObject([{ severity: 'extreme' }]);
    expect(s.relations[ANN].trust).toBeLessThan(trust - 5);
    expect(commanderStress(s)).toBe(5);
    expect(openPremonition(s, ANN)).toBeUndefined();
    expect(s.special!.paranoia!.premonitions[0].acted).toBe('false');
    expect(events[0]).toEqual({ type: 'premonition_acted', unitId: ANN, act: 'accused' });
  });

  it('punishing her adds coerced at extreme on top of the punishment', () => {
    const s = withPm('doubt', false);
    const r = run(s, reg, { type: 'discipline/punish', payload: { unitId: ANN, measure: 'verbal' } });
    expect(r.events.filter((e) => e.type === 'error')).toEqual([]);
    expect(hist(r.state, ANN, 'coerced')).toMatchObject([{ severity: 'extreme' }]);
    expect(hist(r.state, ANN, 'commander_enforced').length).toBe(1);
    expect(r.events.find((e) => e.type === 'premonition_acted')).toMatchObject({ act: 'punished' });
  });

  it('taking her off the roster counts as removing her; a bench measure too', () => {
    const s = withPm('doubt', false);
    const keep = s.roster.activeIds.filter((id) => id !== ANN);
    const r = run(s, reg, { type: 'roster/set_active', payload: { activeIds: keep } });
    expect(r.events.find((e) => e.type === 'premonition_acted')).toMatchObject({ unitId: ANN, act: 'removed' });
    expect(hist(r.state, ANN, 'coerced')).toHaveLength(1);
    const b = run(withPm('doubt', false), reg, { type: 'discipline/punish', payload: { unitId: ANN, measure: 'bench' } });
    expect(b.events.find((e) => e.type === 'premonition_acted')).toMatchObject({ act: 'removed' });
  });

  it('through the intent pipeline: an accusation of a warned unit lands', () => {
    const s = withPm('mutiny', false);
    const open = run(s, reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: [ANN], origin: 'event', startIndex: 0 } }).state;
    const r = run(open, reg, { type: 'intents/apply', payload: { channel: 'scene', intents: { events: [{ type: 'accused', actor: 'commander', targets: [ANN], severity: 'moderate', evidence: 'you are planning something', confidence: 0.9 }] } } });
    expect(hist(r.state, ANN, 'accused')).toHaveLength(1);
    expect(hist(r.state, ANN, 'false_accusation')).toHaveLength(1);
  });
});

describe('acting on a real warning', () => {
  it('doubt preempts: the talk-down is 0.15 easier and her next check waits', () => {
    const chance = (real: boolean): number => {
      const s = withPm('doubt', real);
      s.squad.find((u) => u.id === ANN)!.stress = 0;
      s.relations[ANN].trust = 20;
      actOnWarning(s, ctxOf(s), ANN, 'accused');
      startDesertion(s, ANN, 'night');
      return talkDown(s, ctxOf(s), 'empathy').find((e) => e.type === 'loyalty_talk_down')!.chance as number;
    };
    const base = chance(false);
    const eased = chance(true);
    expect(eased - base).toBeCloseTo(0.15, 6);
    const s = withPm('doubt', true);
    actOnWarning(s, ctxOf(s), ANN, 'leash');
    expect(s.disloyalty!.units[ANN].nextCheckDay).toBeGreaterThanOrEqual(s.day + 3);
    expect(preemptBonus(s, ANN)).toBe(0.15);
    expect(preemptBonus(s, BEA)).toBe(0);
    s.day += 6;
    expect(preemptBonus(s, ANN)).toBe(0);
  });

  it('mutiny: a hit seed clears her mutiny signs, a miss keeps them', () => {
    let cleared = false;
    let kept = false;
    for (let seed = 1; seed < 100 && !(cleared && kept); seed++) {
      const s = reseed(withPm('mutiny', true), seed);
      s.disloyalty = { units: { [ANN]: { signs: [{ day: 1, about: 'mutiny', kind: 'dm', signId: 'x' }, { day: 1, about: 'doubt', kind: 'dm', signId: 'y' }], attempts: 0 } } };
      actOnWarning(s, ctxOf(s), ANN, 'accused');
      const about = s.disloyalty.units[ANN].signs.map((x) => x.about);
      if (about.includes('mutiny')) kept = true;
      else { cleared = true; expect(about).toEqual(['doubt']); }
    }
    expect(cleared && kept).toBe(true);
  });

  it('defiance: her record falls by 6', () => {
    const s = withPm('defiance', true);
    s.relations[ANN].impunityRecord = 10;
    actOnWarning(s, ctxOf(s), ANN, 'punished');
    expect(s.relations[ANN].impunityRecord).toBe(4);
    expect(commanderStress(s)).toBe(0);
    expect(hist(s, ANN, 'coerced')).toEqual([]);
  });

  it('a Leash suppress on an open desertion counts as acting on it', () => {
    const s = withPm('desertion', true);
    startDesertion(s, ANN, 'night');
    const r = run(s, reg, { type: 'leash/suppress', payload: { unitId: ANN } });
    expect(r.events.filter((e) => e.type === 'error')).toEqual([]);
    expect(r.events.find((e) => e.type === 'premonition_acted')).toMatchObject({ act: 'leash' });
    expect(r.state.special!.paranoia!.premonitions[0].acted).toBe('preempted');
  });
});

describe('no open warning, no extra effect', () => {
  it('a punishment without one is exactly today\'s, whatever the trait', () => {
    const a = specialCampaign(reg, 'bloom_paranoia');
    const b = specialCampaign(reg);
    const act = { type: 'discipline/punish', payload: { unitId: ANN, measure: 'verbal' } };
    const ra = run(a, reg, act);
    const rb = run(b, reg, act);
    expect(ra.state.relations).toEqual(rb.state.relations);
    expect(ra.events.map((e) => e.type)).toEqual(rb.events.map((e) => e.type));
    expect(ra.state.commander.stress).toBeUndefined();
  });

  it('a closed or expired warning does not count', () => {
    const s = withPm('doubt', false);
    s.special!.paranoia!.premonitions[0].expiresDay = s.day - 1;
    expect(actOnWarning(s, ctxOf(s), ANN, 'accused')).toEqual([]);
  });
});

describe('what the model is offered', () => {
  const raw = (over: Record<string, unknown> = {}) => ({ events: [{ type: 'accused', actor: 'commander', targets: [ANN], severity: 'minor', evidence: 'you are planning this', confidence: 0.9, ...over }] });
  const squad = [{ id: ANN }, { id: BEA }];

  it('accused is offered only with warned units, and only about them', () => {
    expect(validateIntents(raw(), { participants: [ANN], squad }).events).toEqual([]);
    expect(validateIntents(raw(), { participants: [ANN], squad, warned: [] }).events).toEqual([]);
    expect(validateIntents(raw(), { participants: [ANN, BEA], squad, warned: [BEA] }).events).toEqual([]);
    expect(validateIntents(raw(), { participants: [ANN], squad, warned: [ANN] }).events).toHaveLength(1);
  });

  it('the prompt lists warned units without saying anything about truth; with none it is as it was', async () => {
    const unit = { id: ANN, name: 'Ann', values: {}, likes: [], dislikes: [], triggers: [], stateId: 'comrade', defectIds: [] };
    const input = (over: Partial<IntentExtractInput> = {}): IntentExtractInput => ({
      commanderName: 'Vale', channel: 'scene', exchange: [{ speaker: 'Vale', text: 'I know.' }], units: [unit], openPromises: [], romance: false, measures: ['verbal'], ...over,
    });
    const call = async (i: IntentExtractInput) => {
      const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
      st.mainReplies = ['{}'];
      await extractIntents(i, { st, settings: getSettings(st) });
      return st.calls[0] as { system: string; prompt: string };
    };
    const none = await call(input());
    expect(none.system).not.toContain('"accused"');
    expect(none.prompt).not.toContain('WARNED');
    expect((await call(input({ warned: [] }))).system).toEqual(none.system);
    const some = await call(input({ warned: [ANN] }));
    expect(some.system).toContain('"accused"');
    expect(some.prompt).toContain(`WARNED (units the commander has been warned about): ${ANN}`);
    expect(some.prompt).not.toMatch(/\b(real|false|true)\b/i);
  });

  it('warnedInput is empty without an open warning', () => {
    expect(warnedInput(specialCampaign(reg, 'bloom_paranoia'), [ANN])).toEqual({});
    expect(warnedInput(withPm('doubt', false), [ANN, BEA])).toEqual({ warned: [ANN] });
    expect(warnedInput(specialCampaign(reg), [ANN])).toEqual({});
  });
});

describe('what the event says', () => {
  it('premonition_acted carries no truth: the same keys whether the warning was real or not', () => {
    const real = actOnWarning(withPm('doubt', true), ctxOf(withPm('doubt', true)), ANN, 'accused')[0];
    const fake = actOnWarning(withPm('doubt', false), ctxOf(withPm('doubt', false)), ANN, 'accused')[0];
    expect(real).toEqual(fake);
    expect(Object.keys(real).sort()).toEqual(['act', 'type', 'unitId']);
  });
});

describe('a unit who leaves service', () => {
  it('a terminated unit leaves no paranoia record', () => {
    const s = withPm('doubt', true);
    actOnWarning(s, ctxOf(s), ANN, 'accused'); // leaves a preempt entry
    s.special!.paranoia!.premonitions.push({ id: 'pm2', unitId: ANN, about: 'mutiny', day: s.day, expiresDay: s.day + 3, real: false });
    removeFromService(s, ANN, 'terminated');
    const p = s.special!.paranoia!;
    expect(p.premonitions.filter((x) => x.unitId === ANN)).toEqual([]);
    expect((p.preempt ?? []).filter((x) => x.unitId === ANN)).toEqual([]);
  });
});
