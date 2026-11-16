import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import type { EngineCtx } from '../../../src/engine/dispatch';
import { personalDayStep } from '../../../src/engine/personal/dayStep';
import { addSecret, discoverSecret, rollSceneDiscovery, SECRET_NIGHT_KIND } from '../../../src/engine/personal/secrets';
import { personalOf } from '../../../src/engine/personal/state';
import type { CampaignState, SquadSecret } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { ANN, BEA, CAT, ctxFrom, errors, loadCore, ofType, plain, run, seeded, setRelation, withStance } from '../../helpers/personal';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});

/** A rng that records every chance asked and answers by `answer` (nothing else of the rng is needed by the routes). */
function fake(answer: (p: number) => boolean) {
  const asked: number[] = [];
  const rng = { chance: (p: number) => { asked.push(p); return answer(p); } };
  return { ctx: { registries: reg, rng } as unknown as EngineCtx, asked };
}

/** A kept secret known by Ann and Bea. */
function kept(s: CampaignState, knownBy = [ANN, BEA]): SquadSecret {
  addSecret(s, reg, { kindId: 'hidden_injury', knownBy, subjectId: ANN, vars: { name: 'Ann' } });
  return personalOf(s).secrets!.at(-1)!;
}

const state = (o: { stance?: 'disciplined' | 'fearful' | 'open_defiance'; insight?: number } = {}): CampaignState => {
  const s = plain(reg);
  s.commander.socialStats.insight = o.insight ?? 2;
  if (o.stance) for (const id of [ANN, BEA]) withStance(s, reg, id, o.stance);
  return s;
};

describe('insight at the end of a scene', () => {
  it('a low-Trust knower gives one draw at 0.08 × Insight; a high-Trust one draws nothing (acceptance 5)', () => {
    for (const insight of [1, 3, 5]) {
      const s = state({ stance: 'fearful', insight });
      kept(s);
      const { ctx, asked } = fake(() => false);
      expect(rollSceneDiscovery(s, ctx, [ANN])).toEqual([]);
      expect(asked).toEqual([TUNING.personal.secret.insightBase * insight]);
    }
    const calm = state({ stance: 'disciplined' });
    kept(calm);
    const { ctx, asked } = fake(() => false);
    rollSceneDiscovery(calm, ctx, [ANN, BEA]);
    expect(asked).toEqual([]);
  });

  it('the chance is capped at 0.4 and a hit finds the secret with route insight', () => {
    const s = state({ stance: 'fearful', insight: 5 });
    const x = kept(s);
    const { ctx, asked } = fake(() => true);
    const events = rollSceneDiscovery(s, ctx, [BEA]);
    expect(asked).toEqual([Math.min(TUNING.personal.secret.insightCap, 0.4)]);
    expect(ofType(events, 'secret_found')).toEqual([expect.objectContaining({ secretId: x.id, route: 'insight' })]);
    expect(personalOf(s).secrets![0]).toMatchObject({ status: 'found', foundRoute: 'insight', foundDay: s.day });
  });

  it('a knower who is not in the scene gives no draw', () => {
    const s = state({ stance: 'fearful' });
    kept(s);
    const { ctx, asked } = fake(() => true);
    expect(rollSceneDiscovery(s, ctx, [CAT])).toEqual([]);
    expect(asked).toEqual([]);
  });
});

describe('a slip', () => {
  it('an open_defiance knower lets it slip at 0.25 (acceptance 5)', () => {
    const s = state({ stance: 'open_defiance' });
    const x = kept(s);
    const { ctx, asked } = fake((p) => p === TUNING.personal.secret.slipChance);
    const events = rollSceneDiscovery(s, ctx, [ANN]);
    expect(asked).toEqual([TUNING.personal.secret.insightBase * 2, 0.25]);
    expect(ofType(events, 'secret_found')).toEqual([expect.objectContaining({ secretId: x.id, route: 'slip' })]);
  });

  it('a resentful relationship state lets it slip even with high Trust', () => {
    const s = state({ stance: 'disciplined' });
    setRelation(s, ANN, { stateId: 'resentful' });
    expect(reg.relationshipStates.get('resentful')!.secretSlip).toBe(true);
    kept(s);
    const { ctx, asked } = fake(() => false);
    rollSceneDiscovery(s, ctx, [ANN]);
    expect(asked).toEqual([0.25]);
  });

  it('a calm knower does not slip', () => {
    const s = state({ stance: 'disciplined' });
    kept(s);
    const { ctx, asked } = fake(() => true);
    expect(rollSceneDiscovery(s, ctx, [ANN, BEA])).toEqual([]);
    expect(asked).toEqual([]);
  });
});

describe('a night talk', () => {
  /** Ann is fond (Affinity 60, Trust 50) and knows a secret. */
  const fond = (): CampaignState => {
    const s = state();
    setRelation(s, ANN, { affinity: 60, trust: 50 });
    setRelation(s, BEA, { affinity: 0, trust: 30 });
    kept(s, [ANN, BEA]);
    return s;
  };
  const queue = (s: CampaignState) => s.calendar.nightEventsQueue.filter((e) => e.kind === SECRET_NIGHT_KIND);

  it('a fond knower queues a confession at 0.1; opening the door finds the secret (acceptance 5)', () => {
    let hit: CampaignState | null = null;
    for (let seed = 1; seed < 200 && hit === null; seed++) {
      const d = seeded(fond(), seed);
      personalDayStep(d, ctxFrom(d, reg));
      if (queue(d).length > 0) hit = d;
    }
    expect(hit).not.toBeNull();
    const entry = queue(hit!)[0];
    expect(entry).toMatchObject({ unitId: ANN, kind: SECRET_NIGHT_KIND, ignore: { event: 'dismissed', severity: 'minor' } });
    expect(entry.framing).toContain('Ann');
    expect(personalOf(hit!).secrets![0].status).toBe('kept');

    hit!.slot = 'night';
    hit!.calendar.nightEvent = entry;
    const r = run(hit!, reg, { type: 'night/open', payload: {} });
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'secret_found')).toEqual([expect.objectContaining({ route: 'night' })]);
    expect(personalOf(r.state).secrets![0]).toMatchObject({ status: 'found', foundRoute: 'night' });
  });

  it('the chance is 0.1 and nobody who is not fond draws', () => {
    const s = fond();
    const { ctx, asked } = fake(() => false);
    personalDayStep(s, { ...ctx, rng: Object.assign(ctx.rng, { int: () => 0 }) } as EngineCtx);
    expect(asked).toEqual([TUNING.personal.secret.nightChance]);
    const cold = state();
    setRelation(cold, ANN, { affinity: 59, trust: 50 });
    setRelation(cold, BEA, { affinity: 60, trust: 49 });
    kept(cold);
    const none = fake(() => false);
    personalDayStep(cold, none.ctx);
    expect(none.asked).toEqual([]);
  });

  it('opening a door whose secret was found meanwhile finds nothing more, and ignoring it keeps the secret', () => {
    const s = fond();
    s.slot = 'night';
    s.calendar.nightEvent = { id: 'n1', unitId: ANN, kind: SECRET_NIGHT_KIND, priority: 50, framing: 'k', ignore: { event: 'dismissed', severity: 'minor' }, expiresDay: 99 };
    personalOf(s).secrets![0].status = 'found';
    const r = run(s, reg, { type: 'night/open', payload: {} });
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'secret_found')).toEqual([]);
    const ig = fond();
    ig.slot = 'night';
    ig.calendar.nightEvent = { id: 'n1', unitId: ANN, kind: SECRET_NIGHT_KIND, priority: 50, framing: 'k', ignore: { event: 'dismissed', severity: 'minor' }, expiresDay: 99 };
    const out = run(ig, reg, { type: 'night/ignore', payload: {} });
    expect(errors(out.events)).toEqual([]);
    expect(personalOf(out.state).secrets![0].status).toBe('kept');
  });
});

describe('the scene end', () => {
  const sceneEnd = (s: CampaignState) => {
    const started = run(s, reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: [ANN], origin: 'event', startIndex: 0 } });
    expect(errors(started.events)).toEqual([]);
    return run(started.state, reg, { type: 'scene/end', payload: {} });
  };

  it('scene/end rolls the routes, and a scene with no knower draws nothing', () => {
    const base = state({ stance: 'fearful' });
    kept(base, [ANN, BEA]);
    let found: ReturnType<typeof sceneEnd> | null = null;
    for (let seed = 1; seed < 100 && found === null; seed++) {
      const r = sceneEnd(seeded(base, seed));
      if (ofType(r.events, 'secret_found').length > 0) found = r;
    }
    expect(found).not.toBeNull();
    expect(personalOf(found!.state).secrets![0].status).toBe('found');

    const none = state({ stance: 'fearful' });
    kept(none, [BEA, CAT]);
    const r = sceneEnd(none);
    expect(ofType(r.events, 'secret_found')).toEqual([]);
    // the scene itself draws too: the same scene with no secret at all leaves the rng where this one does
    const bare = state({ stance: 'fearful' });
    expect(JSON.stringify(sceneEnd(bare).state.rng)).toBe(JSON.stringify(r.state.rng));
  });
});

describe('found once', () => {
  it('a found secret is not found twice; frequency is exported and works when called', () => {
    const s = state();
    const x = kept(s);
    const ctx = ctxFrom(s, reg);
    const first = discoverSecret(s, ctx, x.id, 'frequency');
    expect(ofType(first, 'secret_found')).toEqual([expect.objectContaining({ secretId: x.id, route: 'frequency' })]);
    expect(personalOf(s).secrets![0]).toMatchObject({ status: 'found', foundRoute: 'frequency' });
    expect(discoverSecret(s, ctx, x.id, 'insight')).toEqual([]);
    expect(personalOf(s).secrets![0].foundRoute).toBe('frequency');
    expect(discoverSecret(s, ctx, 'nope', 'slip')).toEqual([]);
  });

  it('the event never carries the text', () => {
    const s = state();
    const x = kept(s);
    expect(JSON.stringify(discoverSecret(s, ctxFrom(s, reg), x.id, 'slip'))).not.toContain(x.text);
  });
});
