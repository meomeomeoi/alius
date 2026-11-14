import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { eligibleTemplates } from '../../../src/engine/dilemma/flow';
import { Rng, seedRng } from '../../../src/engine/rng';
import { buildCampaign } from '../../../src/engine/setup';
import type { CampaignState, WorldStance } from '../../../src/engine/state/types';
import { buildDigest, fallbackOutput } from '../../../src/engine/world/director';
import { applyWorldEffects } from '../../../src/engine/world/effects';
import { eventPool } from '../../../src/engine/world/expedition';
import { advanceClock } from '../../../src/engine/world/clocks';
import { checkOffer, offerMission, runDeadlines } from '../../../src/engine/world/missions';
import { clockById } from '../../../src/engine/world/state';
import { activeFamilies, familyEnabled } from '../../../src/engine/worldOptions';
import { campaign, ctxOf, errors, loadCore, run, unitSetup } from '../../helpers/world';

let reg: Registries;
let base: CampaignState;
beforeAll(async () => {
  reg = await loadCore();
  base = campaign(reg, 2);
});

const HUNTED = { offspec_stigma: 'hunted' };
const worldOf = (options: Record<string, string>): CampaignState => {
  const s = structuredClone(base);
  s.world.options = { ...(s.world.options ?? {}), ...options };
  return s;
};
const built = (options: Record<string, string>): CampaignState => {
  const r = buildCampaign({ commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny', units: [unitSetup('Ann')], world: { options } }, reg, { desireBondDefects: false, seed: 11 });
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.state;
};
const FAMILY = ['purge_sweep'];

describe('family helpers', () => {
  it('familyEnabled: no family is always on; a family needs a choice that enables it', () => {
    expect(familyEnabled(worldOf({}), reg, {})).toBe(true);
    expect(familyEnabled(worldOf({}), reg, { family: 'purge_sweep' })).toBe(false);
    expect(familyEnabled(worldOf(HUNTED), reg, { family: 'purge_sweep' })).toBe(true);
    expect(familyEnabled(worldOf({ offspec_stigma: 'scorned' }), reg, { family: 'purge_sweep' })).toBe(false);
    expect(familyEnabled(worldOf(HUNTED), reg, { family: 'other' })).toBe(false);
  });
  it('activeFamilies lists the enabled families once', () => {
    expect(activeFamilies(worldOf({}), reg)).toEqual([]);
    expect(activeFamilies(worldOf(HUNTED), reg)).toEqual(FAMILY);
  });
  it('the core family is all in place', () => {
    for (const [registry, id] of [['clocks', 'purge_sweep'], ['dilemmaTemplates', 'dil_purge_census'], ['dilemmaTemplates', 'dil_purge_shelter'],
      ['dilemmaTemplates', 'evt_purge_checkpoint'], ['missionTemplates', 'tpl_purge_extraction']] as const) {
      expect(reg[registry].get(id)?.family, `${registry}:${id}`).toBe('purge_sweep');
    }
  });
});

describe('the purge family under the options', () => {
  it('the purge clock is seeded only under hunted', () => {
    expect(built({}).world.clocks.map((c) => c.id)).not.toContain('purge_sweep');
    expect(built({ offspec_stigma: 'scorned' }).world.clocks.map((c) => c.id)).not.toContain('purge_sweep');
    const hunted = built(HUNTED);
    expect(clockById(hunted, 'purge_sweep')).toMatchObject({ segments: 6, filled: 0, visibleToPlayer: true });
  });

  it('an old save seeded by world/seed reads the options too', () => {
    const s = worldOf(HUNTED);
    s.world.clocks = [];
    delete s.world.seeded;
    const r = run(s, reg, { type: 'world/seed', payload: {} });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.world.clocks.map((c) => c.id)).toContain('purge_sweep');
  });

  it('family templates are not drawn by the director, pacing or the event pool under tolerated', () => {
    const s = worldOf({});
    // mission board: refused offers, no fallback offer, not in the digest
    expect(checkOffer(s, reg, { templateId: 'tpl_purge_extraction', regionId: 'quarantine_d7', source: 'command' })).toMatch(/family/);
    for (let seed = 1; seed <= 40; seed++) {
      const out = fallbackOutput(s, reg, new Rng(seedRng(seed)));
      expect(out.missionOffers.map((o) => o.templateId), `seed ${seed}`).not.toContain('tpl_purge_extraction');
    }
    expect(buildDigest(s, reg).templates.map((t) => t.id)).not.toContain('tpl_purge_extraction');
    // pacing and requests: the dilemma pool
    expect(eligibleTemplates(s, reg, ['base', 'director']).map((t) => t.id)).not.toContain('dil_purge_census');
    expect(eligibleTemplates(s, reg, ['base', 'director']).map((t) => t.id)).not.toContain('dil_purge_shelter');
    // the expedition event pool
    for (const region of reg.regions.keys()) expect(eventPool(s, reg, region).map((t) => t.id)).not.toContain('evt_purge_checkpoint');
  });

  it('under hunted the family is drawn', () => {
    const s = worldOf(HUNTED);
    expect(checkOffer(s, reg, { templateId: 'tpl_purge_extraction', regionId: 'quarantine_d7', source: 'command' })).toBeNull();
    expect(buildDigest(s, reg).templates.map((t) => t.id)).toContain('tpl_purge_extraction');
    expect(eligibleTemplates(s, reg, ['base', 'director']).map((t) => t.id)).toEqual(expect.arrayContaining(['dil_purge_census', 'dil_purge_shelter']));
    expect([...reg.regions.keys()].some((region) => eventPool(s, reg, region).some((t) => t.id === 'evt_purge_checkpoint'))).toBe(true);
    const offered = Array.from({ length: 80 }, (_, i) => fallbackOutput(s, reg, new Rng(seedRng(i + 1))).missionOffers.map((o) => o.templateId)).flat();
    expect(offered).toContain('tpl_purge_extraction');
  });

  it('a clock effect can still not offer a family mission under tolerated', () => {
    const s = worldOf({});
    const out = applyWorldEffects(s, ctxOf(s, reg), [{ type: 'offer_mission', templateId: 'tpl_purge_extraction', source: 'command' }], { kind: 'event', id: 't' });
    expect(out).toEqual([]);
    expect(s.missions.offered.some((m) => m.templateId === 'tpl_purge_extraction')).toBe(false);
  });
});

describe('stigma_news', () => {
  const stances = (s: WorldStance | undefined) => (s ? { offspec_stigma: s } : undefined);
  it('stigma_news stresses a shares unit more than an indifferent one', () => {
    const s = worldOf(HUNTED);
    s.squad[0].worldStances = stances({ stance: 'shares', strength: 2, reason: '' });
    s.squad[1].stress = 5;
    const ev = applyWorldEffects(s, ctxOf(s, reg), [{ type: 'stigma_news', amount: 10 }], { kind: 'event', id: 't' });
    expect(s.squad[0].stress).toBe(20); // ×(1 + 0.5·2)
    expect(s.squad[1].stress).toBe(15); // indifferent: ×1
    expect(ev.filter((e) => e.type === 'stress_changed')).toHaveLength(2);
  });

  it('strength 1 shares ×1.5, opposes ×1, clamped to 100, the dead and the gone are spared', () => {
    const s = worldOf(HUNTED);
    s.squad[0].worldStances = stances({ stance: 'shares', strength: 1, reason: '' });
    s.squad[1].worldStances = stances({ stance: 'opposes', strength: 2, reason: '' });
    s.squad[0].stress = 95;
    s.squad.push({ ...structuredClone(s.squad[1]), id: 'unit_dead', status: 'dead', stress: 0 });
    s.relations.unit_dead = structuredClone(s.relations[s.squad[1].id]);
    applyWorldEffects(s, ctxOf(s, reg), [{ type: 'stigma_news', amount: 10 }], { kind: 'event', id: 't' });
    expect(s.squad[0].stress).toBe(100);
    expect(s.squad[1].stress).toBe(10);
    expect(s.squad.find((u) => u.id === 'unit_dead')!.stress).toBe(0);
  });

  it('with a neutral stigma there are no stances: everyone takes the plain amount', () => {
    const s = worldOf({});
    s.squad[0].worldStances = stances({ stance: 'shares', strength: 2, reason: '' });
    applyWorldEffects(s, ctxOf(s, reg), [{ type: 'stigma_news', amount: 10 }], { kind: 'event', id: 't' });
    expect(s.squad[0].stress).toBe(10);
  });

  it('the purge clock filling brings the news and costs the own corporation', () => {
    const s = built(HUNTED);
    const own = s.commander.corporationId!;
    const before = s.world.factions[own];
    advanceClock(s, ctxOf(s, reg), 'purge_sweep', 2, 'test');
    advanceClock(s, ctxOf(s, reg), 'purge_sweep', 2, 'test');
    const events = advanceClock(s, ctxOf(s, reg), 'purge_sweep', 2, 'test');
    expect(events.some((e) => e.type === 'clock_filled')).toBe(true);
    expect(s.squad[0].stress).toBeGreaterThanOrEqual(10);
    expect(s.world.factions[own]).toBe(before - 5);
  });
});

describe('a disabled family left in a save', () => {
  it('a family clock in a save survives with the family off', () => {
    const s = built(HUNTED);
    s.world.options = { ...s.world.options, offspec_stigma: 'tolerated' }; // as if a pack override removed the family
    expect(clockById(s, 'purge_sweep')).toBeDefined();
    expect(buildDigest(s, reg).clocks.map((c) => c.id)).toContain('purge_sweep'); // it keeps running and the model sees it
    expect(() => advanceClock(s, ctxOf(s, reg), 'purge_sweep', 1, 'test')).not.toThrow();
    expect(clockById(s, 'purge_sweep')!.filled).toBe(1);
    // an already offered family mission is not re-checked, and its deadline step does not crash
    const draft = structuredClone(built(HUNTED));
    const o = offerMission(draft, ctxOf(draft, reg), { templateId: 'tpl_purge_extraction', regionId: 'quarantine_d7', source: 'command' });
    expect(o.mission).not.toBeNull();
    draft.world.options = { ...draft.world.options, offspec_stigma: 'tolerated' };
    expect(draft.missions.offered).toHaveLength(1);
    draft.day = o.mission!.deadlineDay!;
    expect(() => runDeadlines(draft, ctxOf(draft, reg))).not.toThrow();
    expect(draft.missions.completed.at(-1)!.status).toBe('failed');
  });

  it('a second offer of the family template is refused once the family is off', () => {
    const draft = built({});
    expect(offerMission(draft, ctxOf(draft, reg), { templateId: 'tpl_purge_extraction', regionId: 'quarantine_d7', source: 'command' }).mission).toBeNull();
  });
});

describe('the digest carries the world', () => {
  it('world hints carry the tone choice\'s director_hint', () => {
    const grim = buildDigest(worldOf({}), reg).world;
    expect(grim.families).toEqual([]);
    expect(grim.hints).toHaveLength(1);
    expect(grim.hints[0]).toBe((reg.worldOptions.get('tone')!.choices as Array<{ id: string; effects: Array<{ text?: string }> }>).find((c) => c.id === 'grim')!.effects[0].text);
    const bleak = buildDigest(worldOf({ tone: 'bleak', ...HUNTED }), reg).world;
    expect(bleak.hints[0]).toMatch(/rare/i);
    expect(bleak.families).toEqual(FAMILY);
  });
  it('the hints carry no pronoun for the commander', () => {
    for (const tone of ['grim_hope', 'grim', 'bleak']) expect(JSON.stringify(buildDigest(worldOf({ tone }), reg).world)).not.toMatch(/\b(he|him|his)\b/i);
  });
});
