import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/development';
import '../../../src/engine/actions/discipline';
import '../../../src/engine/actions/scene';
import { readingFor } from '../../../src/engine/development/appraisal';
import { developmentOf } from '../../../src/engine/development/state';
import { TUNING } from '../../../src/engine/tuning';
import { validateIntents, type EventIntent } from '../../../src/engine/relations/intents';
import type { CampaignState } from '../../../src/engine/state/types';
import { applyEventToUnit } from '../../../src/engine/relations/effects';
import { getCallType } from '../../../src/llm/callTypes';
import '../../../src/llm/calls/all';
import { INTENT_SNAPSHOT_INPUT } from '../../development/intentSnapshotInput';
import { campaign, errors, loadCore, ofType, run } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const ANN = 'unit_ann', BEA = 'unit_bea', CAT = 'unit_cat';
const on = (s: CampaignState, mode: 'normal' | 'slow' = 'normal'): CampaignState => { s.settings.characterDevelopment = mode; return s; };
const intent = (type: string, actor: string, targets: string[], over: Partial<EventIntent> = {}): EventIntent =>
  ({ type, actor, targets, severity: 'moderate', evidence: 'x', confidence: 1, ...over }) as EventIntent;
const apply = (s: CampaignState, ev: EventIntent, channel: 'scene' | 'dm' = 'scene') => {
  if (channel === 'scene' && !s.scene) {
    const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: [ANN, BEA, CAT], origin: 'event', startIndex: 0 } });
    if (errors(r.events).length > 0) throw new Error(JSON.stringify(errors(r.events)));
    s = r.state;
  }
  return run(s, reg, { type: 'intents/apply', payload: channel === 'scene' ? { channel: 'scene', intents: { events: [ev] } } : { channel: 'dm', unitId: ev.targets[0] ?? ev.actor, intents: { events: [ev] } } });
};
const pending = (s: CampaignState, id: string) => developmentOf(s.squad.find((u) => u.id === id)!).pending;

describe('recording appraisals', () => {
  it('off records nothing', () => {
    const r = apply(campaign(reg, 4), intent('insulted', 'commander', [ANN]));
    for (const u of r.state.squad) expect(u.development).toBeUndefined();
    expect(ofType(r.events, 'appraisal_recorded')).toEqual([]);
  });

  it('subject and actor', () => {
    const s = on(campaign(reg, 4));
    const r = apply(s, intent('praised', 'commander', [ANN]));
    const [a] = pending(r.state, ANN);
    expect(a).toMatchObject({ kind: 'praised', role: 'subject', target: 'her', subject: ANN, wanted: 'yes', initiator: 'actor', harm: 'none', outcome: 'good' });
    expect(a.id).toBe('ap0');
    expect(ofType(r.events, 'appraisal_recorded')).toContainEqual({ type: 'appraisal_recorded', unitId: ANN, appraisalId: 'ap0', role: 'subject' });
    // an act of her own, read by the model
    const reading = { wanted: 'yes', initiator: 'actor', harm: 'none', outcome: 'good' } as const;
    const r2 = apply(on(campaign(reg, 4)), intent('shared_secret', BEA, [], { reading }));
    expect(pending(r2.state, BEA)[0]).toMatchObject({ kind: 'shared_secret', role: 'actor', target: 'commander', subject: 'commander' });
  });

  it('witnesses read it from the side', () => {
    const r = apply(on(campaign(reg, 4)), intent('commander_enforced', 'commander', [ANN], { measure: 'verbal' }));
    expect(pending(r.state, ANN)[0]).toMatchObject({ role: 'subject', subject: ANN });
    for (const w of [BEA, CAT]) expect(pending(r.state, w)[0]).toMatchObject({ role: 'witness', target: `unit:${ANN}`, subject: ANN, kind: 'commander_enforced' });
    // a witness of a unit's own act reads it with the commander as target
    const reading = { wanted: 'no', initiator: 'actor', harm: 'minor', outcome: 'bad' } as const;
    const r2 = apply(on(campaign(reg, 4)), intent('defied', ANN, [], { reading }));
    expect(pending(r2.state, BEA)[0]).toMatchObject({ role: 'witness', target: 'commander', subject: 'commander' });
  });

  it('a dm has no witnesses', () => {
    const s = on(campaign(reg, 4));
    const r = apply(s, intent('insulted', 'commander', [ANN]), 'dm');
    expect(pending(r.state, ANN)).toHaveLength(1);
    expect(r.state.squad.filter((u) => u.id !== ANN).every((u) => u.development === undefined)).toBe(true);
  });

  it("the model's reading wins over the registry", () => {
    const reading = { wanted: 'yes', initiator: 'target', harm: 'none', outcome: 'good' } as const;
    const r = apply(on(campaign(reg, 4)), intent('commander_enforced', 'commander', [ANN], { measure: 'verbal', reading }));
    expect(pending(r.state, ANN)[0]).toMatchObject({ wanted: 'yes', initiator: 'target', outcome: 'good' });
    expect(readingFor(reg, intent('commander_enforced', 'commander', [ANN]))).toEqual({ wanted: 'no', initiator: 'actor', harm: 'minor', outcome: 'bad' });
  });

  it('an engine event without a reading row records nothing', () => {
    const s = on(campaign(reg, 4));
    expect(reg.eventDeltas.get('mocked_defect')?.appraisal).toBeUndefined();
    const r = apply(s, intent('mocked_defect', 'commander', [ANN]));
    expect(pending(r.state, ANN)).toEqual([]);
  });

  it('a partial reading is dropped by validateIntents, a complete one is kept', () => {
    const ctx = { participants: [ANN, BEA], squad: [{ id: ANN }, { id: BEA }] };
    const e = (reading: unknown) => ({ events: [{ type: 'praised', actor: 'commander', targets: [ANN], severity: 'minor', evidence: 'x', confidence: 1, reading }] });
    expect(validateIntents(e({ wanted: 'yes', initiator: 'actor', harm: 'none', outcome: 'good' }), ctx).events[0].reading).toEqual({ wanted: 'yes', initiator: 'actor', harm: 'none', outcome: 'good' });
    expect(validateIntents(e({ wanted: 'yes', initiator: 'actor', harm: 'none' }), ctx).events[0].reading).toBeUndefined();
    expect(validateIntents(e({ wanted: 'maybe', initiator: 'actor', harm: 'none', outcome: 'good' }), ctx).events[0].reading).toBeUndefined();
    expect(validateIntents(e('yes'), ctx).events).toHaveLength(1);
  });

  it('pending is capped, the oldest dropped', () => {
    const s = on(campaign(reg, 4));
    for (let i = 0; i < 30; i++) {
      const draft = structuredClone(s);
      void draft;
    }
    let cur = s;
    for (let i = 0; i < 30; i++) cur = apply(cur, intent('praised', 'commander', [ANN]), 'dm').state;
    const list = pending(cur, ANN);
    expect(list).toHaveLength(TUNING.development.pendingMax);
    expect(list[0].id).toBe('ap6');
    expect(list.at(-1)!.id).toBe('ap29');
  });

  it('grunts never appraise', () => {
    const s = on(campaign(reg, 2));
    s.squad.push({ ...structuredClone(s.squad[0]), id: 'grunt_k_117', kind: 'grunt', displayName: 'Mara', designation: 'K-117', cardRef: undefined });
    s.relations.grunt_k_117 = structuredClone(s.relations[ANN]);
    const draft = structuredClone(s);
    const events = applyEventToUnit(draft, reg, 'grunt_k_117', intent('praised', 'commander', ['grunt_k_117']));
    expect(ofType(events, 'appraisal_recorded')).toEqual([]);
    expect(draft.squad.find((u) => u.id === 'grunt_k_117')!.development).toBeUndefined();
  });

  it('a dead unit never appraises', () => {
    const started = run(on(campaign(reg, 4)), reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: [ANN, BEA, CAT], origin: 'event', startIndex: 0 } }).state;
    started.squad.find((u) => u.id === CAT)!.status = 'dead';
    const r = apply(started, intent('commander_enforced', 'commander', [ANN], { measure: 'verbal' }));
    expect(r.state.squad.find((u) => u.id === CAT)!.development).toBeUndefined();
    expect(pending(r.state, BEA)).toHaveLength(1);
  });

  it('an activity with a companion records her reading', () => {
    const s = on(campaign(reg, 4));
    const r = run(s, reg, { type: 'activity/do', payload: { activityId: 'talk', companionId: ANN } });
    expect(errors(r.events)).toEqual([]);
    expect(pending(r.state, ANN)[0]).toMatchObject({ kind: 'activity:talk', role: 'subject', target: 'her', wanted: 'yes', outcome: 'good' });
    const off = run(campaign(reg, 4), reg, { type: 'activity/do', payload: { activityId: 'talk', companionId: ANN } });
    expect(off.state.squad.find((u) => u.id === ANN)!.development).toBeUndefined();
  });

  it('undo removes appraisals', () => {
    const s = on(campaign(reg, 4));
    const p = apply(s, intent('commander_enforced', 'commander', [ANN], { measure: 'verbal' }));
    expect(pending(p.state, ANN)).toHaveLength(1);
    const id = p.state.discipline!.applications[0].id;
    const u = run(p.state, reg, { type: 'discipline/undo', payload: { id } });
    expect(errors(u.events)).toEqual([]);
    expect(pending(u.state, ANN)).toEqual([]);
    expect(developmentOf(p.state.squad.find((x) => x.id === ANN)!).acc).toEqual({ 'value:autonomy': 0.25, 'value:ingroup': 0.25 }); // what it pushed (a verbal punishment is minor: half) ...
    expect(developmentOf(u.state.squad.find((x) => x.id === ANN)!).acc).toEqual({}); // ... UNDO takes back out
    // the others only watched; what they saw stays seen
    expect(pending(u.state, BEA)).toHaveLength(1);
  });
});

describe('the intent prompt', () => {
  const ct = () => getCallType('intent_extract')!;
  const pinned = readFileSync('tests/fixtures/intent_extract/prompt_without_reading.txt', 'utf8');

  it('is unchanged without reading', () => {
    expect(`${ct().system(INTENT_SNAPSHOT_INPUT)}\n=====\n${ct().prompt(INTENT_SNAPSHOT_INPUT)}\n`).toBe(pinned);
  });

  it('asks for a reading only when told to', () => {
    const asked = ct().system({ ...INTENT_SNAPSHOT_INPUT, reading: true }) as string;
    expect(asked).toContain('"reading"');
    expect(asked).toContain('wanted');
    expect(pinned).not.toContain('"reading"');
    expect(asked).not.toMatch(/\b(he|him|his)\b/i);
  });
});

describe('the scene controller asks for a reading only while development is on', () => {
  const sent = async (mode?: 'normal') => {
    const { harness, intentJson, praised, reply, ANN: A } = await import('../../helpers/sceneHarness');
    const h = harness(reg, { tweak: (s) => { if (mode) s.settings.characterDevelopment = mode; } });
    expect(await h.controller.start({ locationId: 'mess_hall', participants: [A], origin: 'event' })).toBe(true);
    h.st.groupReplies = [[reply('Ann', 'Thanks, commander.')]];
    h.st.mainReplies = [intentJson([praised()])];
    await h.controller.send('Good work today.');
    return h.st.calls.find((c) => (c.system ?? '').includes('rules referee'))!;
  };

  it('off sends the old prompt, normal asks', async () => {
    expect((await sent()).system).not.toContain('"reading"');
    expect((await sent('normal')).system).toContain('"reading"');
  });
});
