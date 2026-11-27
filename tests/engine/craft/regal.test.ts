import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/bonds';
import '../../../src/engine/actions/craft';
import '../../../src/engine/actions/dynamic';
import '../../../src/engine/actions/personal';
import '../../../src/engine/actions/practice';
import { proposeRuleHashed } from '../../../src/engine/bonds/rules';
import { applyCraftIntent, craftIntentInput, resetPraiseHooks } from '../../../src/engine/craft/intents';
import { givePraise, installPraiseHooks, praiseDayStep, praiseOpen } from '../../../src/engine/craft/programmes/regal';
import { registerFrameReader, resetBlockingHooks } from '../../../src/engine/blocking';
import { dynamicOf } from '../../../src/engine/dynamic/state';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { craftDirectives } from '../../../src/craft/directives';
import { ctxOf, loadCore } from '../../helpers/world';
import { ANN, unitOf, withService, world } from './world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
afterEach(() => { resetBlockingHooks(); resetPraiseHooks(); installPraiseHooks(); });

type Ev = { type: string; [k: string]: unknown };

/** Ann holds at `frame`, her style is `style`, she may set rules about the commander (the `others` domain), and a daily-praise rule of hers is active (yesterday's). */
function regal(style = 'regal', frame: 'play' | 'role' | 'rule' = 'role', withRule = true): CampaignState {
  registerFrameReader(() => frame);
  const s = withService(world(reg, frame));
  s.relations[ANN].stateId = 'lover';
  unitOf(s, ANN).bond!.practice!.style = { primary: style as 'regal' };
  dynamicOf(s, ANN)!.domains = [{ id: 'others', since: s.day }] as never;
  if (withRule) s.bonds = { rules: [{ id: 'r1', unitId: ANN, templateId: 'daily_praise', text: 'Praise me.', status: 'active', day: s.day - 2, brokenCount: 0 }] };
  return s;
}
const praise = (s: CampaignState, text: string): Ev[] => givePraise(s, ctxOf(s, reg), ANN, text) as Ev[];
const log = (s: CampaignState) => s.relations[ANN].craft?.praise ?? [];

describe('who is offered the rule', () => {
  /** Every template a hash over the pool can propose to her (the roll walked from 0 to 1). */
  function offered(s: CampaignState): string[] {
    const ids = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const c = structuredClone(s);
      for (const e of proposeRuleHashed(c, reg, ANN, i / 40, { practice: true })) if (e.type === 'rule_proposed') ids.add(c.bonds!.rules.find((r) => r.id === e.ruleId)!.templateId);
    }
    return [...ids];
  }
  it('a regal holder at role (or beyond) may be asked to be praised', () => {
    expect(offered(regal('regal', 'role', false))).toContain('daily_praise');
    expect(offered(regal('regal', 'rule', false))).toContain('daily_praise');
  });
  it('not at play, not for another style, and a secondary style counts', () => {
    expect(offered(regal('regal', 'play', false))).not.toContain('daily_praise');
    expect(offered(regal('cold', 'role', false))).not.toContain('daily_praise');
    const s = regal('cold', 'role', false);
    unitOf(s, ANN).bond!.practice!.style = { primary: 'cold', secondary: 'regal' };
    expect(offered(s)).toContain('daily_praise');
  });
});

describe('the daily praise', () => {
  it('is open only for a live regal holder who has the rule active', () => {
    expect(praiseOpen(regal(), reg, ANN)).toBe(true);
    expect(praiseOpen(regal('cold'), reg, ANN)).toBe(false);
    expect(praiseOpen(regal('regal', 'role', false), reg, ANN)).toBe(false);
    const s = regal();
    s.bonds!.rules[0]!.status = 'proposed';
    expect(praiseOpen(s, reg, ANN)).toBe(false);
  });

  it('a fresh one counts once a day, is kept (at most 160 characters) and raises Regard, doubled for regal', () => {
    const s = regal();
    const before = s.relations[ANN].regard ?? 50;
    const events = praise(s, `You carry the whole squad on your word. ${'x'.repeat(300)}`);
    expect(events.filter((e) => e.type === 'praise_given')).toEqual([{ type: 'praise_given', unitId: ANN, holderId: ANN }]);
    const rise = events.find((e) => e.type === 'regard_changed' && e.cause === 'value')!;
    expect(rise).toMatchObject({ unitId: ANN, from: before, to: before + TUNING.craft.praise.regard * TUNING.regard.regal.mult });
    expect(log(s)).toHaveLength(1);
    expect(log(s)[0]!.text.length).toBeLessThanOrEqual(160);
    expect(log(s)[0]!.words).toContain('squad');
    expect(praise(s, 'A completely different line about the lamps.')).toEqual([]); // once a day
    expect(log(s)).toHaveLength(1);
  });

  it('a repeat is a slip: praise_missed and her offence; it is not logged and does not rise Regard', () => {
    const s = regal();
    praise(s, 'You carry the whole squad on your word today');
    s.day += 1;
    s.relations[ANN].regard = 60;
    const events = praise(s, 'You carry the whole squad on your word');
    expect(events.find((e) => e.type === 'praise_given')).toBeUndefined();
    expect(events.find((e) => e.type === 'praise_missed')).toMatchObject({ unitId: ANN, holderId: ANN, reason: 'repeat' });
    expect(s.relations[ANN].regard).toBe(60);
    expect(log(s)).toHaveLength(1);
    expect(s.practices!.offences[ANN]).toContain(s.day);
    // a fresh one later the same day still counts
    expect(praise(s, 'The lamps in the yard burn brighter when you walk past').some((e) => e.type === 'praise_given')).toBe(true);
  });

  it('a near text just under the line is fresh, just over it a repeat (> 0.7 of the words)', () => {
    const s = regal();
    praise(s, 'one two three four five six seven eight nine ten');
    s.day += 1;
    // 7 of 10 shared + 0 extra: 7/10 = 0.7 is not over the line
    expect(praise(s, 'one two three four five six seven').some((e) => e.type === 'praise_given')).toBe(true);
    s.day += 1;
    expect(praise(s, 'one two three four five six seven eight').some((e) => e.type === 'praise_missed')).toBe(true); // 8 of 10 over the earlier ten
  });

  it('only the last 30 are kept, and an old one no longer makes a repeat', () => {
    const s = regal();
    praise(s, 'alpha beta gamma delta');
    for (let i = 0; i < TUNING.craft.praise.keep; i++) {
      s.day += 1;
      praise(s, `line number ${i} about thing${i} and other${i}`);
    }
    expect(log(s)).toHaveLength(TUNING.craft.praise.keep);
    s.day += 1;
    expect(praise(s, 'alpha beta gamma delta').some((e) => e.type === 'praise_given')).toBe(true);
  });

  it('a day with no fresh praise is a slip at the day step; one with it is not; a repeat is not told twice', () => {
    const s = regal();
    const missed = praiseDayStep(s, ctxOf(s, reg)) as Ev[];
    expect(missed.filter((e) => e.type === 'praise_missed')).toEqual([{ type: 'praise_missed', unitId: ANN, holderId: ANN, reason: 'missed' }]);
    expect(s.practices!.offences[ANN]).toContain(s.day);
    const ok = regal();
    praise(ok, 'You turned a bad morning into a good day');
    expect(praiseDayStep(ok, ctxOf(ok, reg))).toEqual([]);
    const repeated = regal();
    praise(repeated, 'You turned a bad morning into a good day');
    repeated.day += 1;
    praise(repeated, 'You turned a bad morning into a good day');
    expect((praiseDayStep(repeated, ctxOf(repeated, reg)) as Ev[]).some((e) => e.type === 'praise_missed')).toBe(false);
  });

  it('the day the rule is proposed is not judged, and a rule that is not active is not either', () => {
    const s = regal();
    s.bonds!.rules[0]!.day = s.day;
    expect(praiseDayStep(s, ctxOf(s, reg))).toEqual([]);
    const p = regal();
    p.bonds!.rules[0]!.status = 'negotiating';
    expect(praiseDayStep(p, ctxOf(p, reg))).toEqual([]);
  });

  it('nothing for another style or a holder with no rule: no write, no event', () => {
    for (const s of [regal('cold'), regal('regal', 'role', false)]) {
      expect(praise(s, 'You carry the squad')).toEqual([]);
      expect(praiseDayStep(s, ctxOf(s, reg))).toEqual([]);
      expect(s.relations[ANN].craft).toBeUndefined();
    }
  });

  it('the text never reaches an event, a directive or a prompt', () => {
    const s = regal();
    const sentinel = 'zzquorum sentinel praise words';
    const events = praise(s, sentinel);
    expect(JSON.stringify(events)).not.toContain('zzquorum');
    expect(JSON.stringify(craftDirectives(s, reg, [ANN]))).not.toContain('zzquorum');
    expect(JSON.stringify(craftIntentInput(s, reg, [ANN], 'scene'))).not.toContain('zzquorum');
    expect(log(s)[0]!.text).toContain('zzquorum'); // it is kept, for P17g, and nowhere else
  });
});

describe('through the intent', () => {
  it('praise_given is offered while she takes praise, and the commander\'s own words reach the log', () => {
    const s = regal();
    s.scene = { id: 's1', locationId: 'quarters_commander', participants: [ANN], exchanges: 0, startIndex: 0 } as never;
    expect(craftIntentInput(s, reg, [ANN], 'scene').craft?.praise).toEqual([ANN]);
    const d = structuredClone(s);
    const out = applyCraftIntent(d, ctxOf(d, reg), ANN, { type: 'praise_given', actor: 'commander', targets: [ANN] } as never, { said: 'You are the reason the yard stands' });
    expect(out.some((e) => e.type === 'praise_given')).toBe(true);
    expect(d.relations[ANN].craft!.praise).toHaveLength(1);
    expect(applyCraftIntent(structuredClone(s), ctxOf(s, reg), ANN, { type: 'praise_given' } as never, {})).toEqual([]); // no words, nothing
  });
  it('is not offered for a woman who does not take it', () => {
    expect(craftIntentInput(regal('cold'), reg, [ANN], 'scene')).toEqual({});
  });
});
