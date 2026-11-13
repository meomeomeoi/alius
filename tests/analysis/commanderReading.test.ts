import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { entryEffects, summarizeTraitEffect } from '../../src/analysis/effects';
import { buildPanelModel, type AnalyzeEnv } from '../../src/analysis/model';
import { registerCommanderProviders } from '../../src/analysis/providers/commander';
import { registerCoreProviders } from '../../src/analysis/providers/core';
import { resetKnowledgeRules } from '../../src/analysis/knowledge';
import { parseSubject } from '../../src/analysis/subject';
import type { TraitEffect } from '../../src/content/schemas';
import type { Registries } from '../../src/content/types';
import type { CampaignState } from '../../src/engine/state/types';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { campaign, loadCore } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
  registerCommanderProviders();
});
afterEach(() => resetKnowledgeRules());

const env = (state: CampaignState | null, raw = false): AnalyzeEnv => ({ registries: reg, state, settings: { ...DEFAULT_SETTINGS, showRawValues: raw } });
const panel = (address: string, state: CampaignState | null, raw = false, ctx?: Record<string, unknown>) =>
  buildPanelModel(parseSubject(address, ctx ? JSON.stringify(ctx) : null)!, env(state, raw));
const reading = (address: string, state: CampaignState, raw = false, ctx?: Record<string, unknown>): string =>
  (panel(address, state, raw, ctx).reading?.lines ?? []).join('\n');

function world(): CampaignState {
  const s = campaign(reg, 3);
  s.commander.body = { strength: 4, endurance: 3, reflexes: 2 };
  s.commander.bodyXp = { strength: 20, endurance: 0, reflexes: 0 };
  s.commander.archetype = 'average';
  return s;
}

describe('body readings', () => {
  it('the body reading shows the descriptor and hides XP with raw values off', () => {
    const text = reading('glossary:body_strength', world());
    expect(text).toContain('Strong');
    expect(text).toMatch(/Training: (early|halfway|close)/);
    expect(text).not.toMatch(/\d/);
  });

  it('with raw values the value and the training progress are numbers', () => {
    const text = reading('glossary:body_strength', world(), true);
    expect(text).toContain('Strong (4)');
    expect(text).toMatch(/Training: 20\/\d+/);
  });

  it('training words follow the progress to the next step', () => {
    const at = (xp: number): string => {
      const s = world();
      s.commander.body!.strength = 3; // a step from 3 costs 100
      s.commander.bodyXp!.strength = xp;
      return reading('glossary:body_strength', s);
    };
    expect(at(10)).toContain('Training: early');
    expect(at(50)).toContain('Training: halfway');
    expect(at(90)).toContain('Training: close');
  });

  it('a stat at the top has nothing more to train', () => {
    const s = world();
    s.commander.body!.reflexes = 5;
    expect(reading('glossary:body_reflexes', s)).toMatch(/nothing more to train|top/i);
  });

  it('says where each stat is used, in words', () => {
    const s = world();
    expect(reading('glossary:body_endurance', s)).toMatch(/Crisis HP/);
    expect(reading('glossary:body_endurance', s)).toMatch(/exhaust/i);
    expect(reading('glossary:body_reflexes', s)).toMatch(/dodge/i);
    expect(reading('glossary:body_strength', s)).toMatch(/talk-down|physical/i);
    expect(reading('glossary:body_endurance', s)).not.toMatch(/\d/);
  });

  it('with raw values the Crisis numbers appear', () => {
    const s = world();
    expect(reading('glossary:body_endurance', s, true)).toContain('Crisis HP: 50');
    expect(reading('glossary:body_reflexes', s, true)).toContain('Dodge chance: 12%');
  });

  it('a commander from an older save reads the defaults', () => {
    const s = campaign(reg, 1);
    for (const k of ['body', 'bodyXp', 'archetype'] as const) delete s.commander[k];
    expect(reading('glossary:body_strength', s)).toContain('Average');
  });

  it('with no campaign the panel still opens and says why there is no reading', () => {
    const p = panel('glossary:body_strength', null);
    expect(p.missing).toBe(false);
    expect(p.reading?.lines).toEqual(['No campaign loaded.']);
  });
});

describe('archetype reading', () => {
  it('the archetype reading names the presence action', () => {
    const text = reading('glossary:archetype', world());
    expect(text).toContain('Build: average');
    expect(text).toContain('Presence action: [[presence_steady_voice|Steady Voice]]');
  });

  it('each build gets its own action and image notes', () => {
    const frail = world();
    frail.commander.body = { strength: 1, endurance: 1, reflexes: 1 };
    const text = reading('glossary:archetype', frail);
    expect(text).toContain('[[presence_unnoticed|Unnoticed]]');
    expect(text).toContain('[[eventDeltas:coerced|coerced]]');
    const strong = world();
    strong.commander.body = { strength: 4, endurance: 4, reflexes: 4 };
    const t2 = reading('glossary:archetype', strong);
    expect(t2).toContain('[[presence_rally|Rally]]');
    expect(t2).toContain('[[eventDeltas:comforted|comforted]]');
    expect(reading('glossary:archetype', world())).not.toMatch(/Out of character/);
  });

  it('has no digits with raw values off', () => {
    expect(reading('glossary:archetype', world())).not.toMatch(/\d/);
  });
});

describe('presence reading', () => {
  const unitId = 'unit_ann';
  const at = (day: number, raw = false): string => {
    const s = world();
    s.day = day;
    s.relations[unitId].metDay = 1;
    return reading('glossary:presence', s, raw, { unitId });
  };

  it('says whether the first impression is fresh, fading or faded, with no numbers', () => {
    expect(at(1)).toContain('First impression: fresh');
    expect(at(8)).toContain('First impression: fading'); // w ≈ 0.37
    expect(at(40)).toContain('First impression: faded');
    for (const day of [1, 8, 40]) expect(at(day)).not.toMatch(/\d/);
  });

  it('with raw values the weight is a percentage', () => {
    expect(at(1, true)).toMatch(/First impression: fresh \(100%\)/);
    expect(at(8, true)).toMatch(/\(37%\)/);
  });

  it('lists the unit\'s matched tastes by name', () => {
    const s = world();
    s.squad[0].commanderTastes = ['respects_strength', 'drawn_to_older'];
    s.commander.body = { strength: 4, endurance: 4, reflexes: 4 };
    const text = reading('glossary:presence', s, false, { unitId });
    expect(text).toContain('[[tastes:respects_strength|Respects strength]]');
    expect(text).not.toContain('drawn_to_older'); // not matched: seasoning 3
  });

  it('without a unit it explains presence in general', () => {
    const text = reading('glossary:presence', world());
    expect(text).toMatch(/build|experience/i);
    expect(text).not.toMatch(/\d/);
  });
});

describe('trait and taste effect lines', () => {
  const lines = (registry: 'commanderTraits' | 'tastes', id: string) => entryEffects(registry, reg[registry].get(id)!, reg);

  it('trait effect lines for old_wound read Seasoning +1, Trust gains +15% for the first 14 days, Crisis HP −10', () => {
    expect(lines('commanderTraits', 'old_wound')).toEqual(['Seasoning +1 at start', 'Trust gains +15% for the first 14 days', 'Crisis HP −10']);
  });

  it('every core trait has at least one line and none falls back to a bare type name', () => {
    for (const t of reg.commanderTraits.values()) {
      const l = lines('commanderTraits', String(t.id));
      expect(l.length, String(t.id)).toBe((t.effects as unknown[]).length);
      for (const line of l) expect(line, String(t.id)).not.toMatch(/^[a-z_]+$/);
    }
  });

  it('spot checks of the vocabulary', () => {
    const s = (e: Record<string, unknown>) => summarizeTraitEffect(e as unknown as TraitEffect, reg);
    expect(s({ type: 'social_rank', stat: 'empathy', rank: 2 })).toBe('Empathy rank 2 at start');
    expect(s({ type: 'starting_trust', amount: -10, ifValue: { axis: 'corporate', sign: '-' } })).toBe('Starting Trust −10 with units whose corporate value is below zero');
    expect(s({ type: 'leash_weekly', amount: 1 })).toBe('+1 Leash authorization a week');
    expect(s({ type: 'social_growth', stat: 'cunning', mult: 1.5 })).toBe('Cunning grows ×1.5 faster');
    expect(s({ type: 'body_growth', mult: 0.7 })).toBe('Body training XP ×0.7');
    expect(s({ type: 'terminate_approval', amount: -0.1 })).toBe('Termination approval −10%');
    expect(s({ type: 'requisition_price', pct: -15 })).toBe('Requisition price −15%');
    expect(s({ type: 'activity_cost', activityId: 'medbay', resource: 'supplies', amount: 1 })).toBe('[[activities:medbay]] costs +1 supplies');
    expect(s({ type: 'relation_event_mult', event: 'lied_detected', mult: 1.5, ifTrigger: 'lies' })).toBe('[[eventDeltas:lied_detected]] lands ×1.5 with units that have the trigger "lies"');
    expect(s({ type: 'night_slot' })).toBe('The Night is always yours: a quiet night when nobody knocks');
    expect(s({ type: 'no_romance' })).toBe('No romance in this campaign');
    expect(s({ type: 'unlock_state', stateId: 'sworn' })).toBe('Unlocks [[relationshipStates:sworn]]');
    expect(s({ type: 'platonic_threshold', states: ['confidant', 'kindred'], pct: 15 })).toBe('[[relationshipStates:confidant]], [[relationshipStates:kindred]] need 15% less to reach');
  });

  it('taste lines list offsets and multipliers', () => {
    expect(lines('tastes', 'respects_strength')).toEqual(['Trust +8', 'Presence ×1.5']);
    expect(lines('tastes', 'wary_of_brutes')).toEqual(['Trust −8', 'Image consistency ×1.5']);
    expect(lines('tastes', 'indifferent_to_looks')).toEqual(['Presence ×0']);
    expect(lines('tastes', 'drawn_to_older')).toEqual(['Attraction +8']);
  });

  it('a trait panel shows the description and the effect lines', () => {
    const p = panel('commanderTraits:old_wound', null);
    expect(p.missing).toBe(false);
    expect(p.text).toContain('hurt before');
    expect(p.effects).toHaveLength(3);
  });

  it('unknown effect content never throws', () => {
    expect(entryEffects('commanderTraits', { id: 'x', effects: [{ type: 'mystery' }, null, 5] } as never, reg)).toEqual(expect.any(Array));
    expect(summarizeTraitEffect({ type: 'mystery' } as never, reg)).toBe('mystery');
  });
});
