import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { ContextBuilder } from '../../src/llm/context';
import { clearSceneDirectives, registerSceneContext, sceneDirectives } from '../../src/scene/context';
import { DEFAULT_SETTINGS, type AliusSettings } from '../../src/settings';
import type { CampaignState } from '../../src/engine/state/types';
import { campaign, errors, loadCore, run } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
const [ANN, BEA] = ['unit_ann', 'unit_bea'];
let settings: AliusSettings = { ...DEFAULT_SETTINGS };
const builder = () => {
  settings = { ...DEFAULT_SETTINGS };
  const b = new ContextBuilder();
  registerSceneContext(b, { registries: () => reg, settings: () => settings });
  return b;
};
const inScene = (participants = [ANN], tweak: (s: CampaignState) => void = () => {}): CampaignState => {
  const s = campaign(reg, 4);
  s.day = 12;
  s.slot = 'evening';
  tweak(s);
  const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants, origin: 'event', startIndex: 0 } });
  expect(errors(r.events)).toEqual([]);
  return r.state;
};
const fact = (s: CampaignState, text: string, knownBy: string[], over: Record<string, unknown> = {}) =>
  s.memory.facts.push({ id: `f${s.memory.facts.length + 1}`, about: [ANN], text, tags: [], importance: 3, day: 12, knownBy, ...over } as never);
const block = (b: ContextBuilder, s: CampaignState, cap = 5000) => b.build(s, cap).block;

describe('scene context', () => {
  it('no scene → only the P0 header', () => {
    const b = builder();
    expect(block(b, campaign(reg, 4))).toBe('[ALIUS CONTEXT]\n[ALIUS] Day 1, Morning.');
  });
  it('header names location, slot, participants and mode', () => {
    const b = builder();
    expect(block(b, inScene([ANN, BEA]))).toContain('Scene: Mess hall, Day 12 Evening. Present: Ann, Bea. Group.');
    expect(block(b, inScene([ANN]))).toContain('Scene: Mess hall, Day 12 Evening. Present: Ann. Private.');
  });
  it('a per-unit location is named after the unit', () => {
    const b = builder();
    const s = campaign(reg, 4);
    const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_unit', participants: [BEA], origin: 'event', startIndex: 0 } });
    expect(block(b, r.state)).toContain("Scene: Bea's quarters,");
  });
  it('units show state, hint, bands and defects, never raw numbers by default', () => {
    const b = builder();
    const s = inScene([ANN], (w) => {
      Object.assign(w.relations[ANN], { stateId: 'friend', trust: 51, affinity: 33, attraction: 12 });
      w.squad.find((u) => u.id === ANN)!.stress = 60;
      w.squad.find((u) => u.id === ANN)!.defects = [{ id: 'hunger_loop' }];
    });
    const out = block(b, s);
    const line = out.split('\n').find((l) => l.startsWith('Ann — '))!;
    expect(line).toContain('state Friend');
    expect(line).toContain(String(reg.relationshipStates.get('friend')!.promptHint));
    expect(line).toContain('trust solid, affinity warm, attraction faint; stress strained');
    expect(line).toContain(`defect ${String(reg.defects.get('hunger_loop')!.name)}: ${String(reg.defects.get('hunger_loop')!.social)}`);
    expect(line).not.toMatch(/\b(51|33|12)\b/);
  });
  it('raw numbers appear with showRawValues', () => {
    const b = builder();
    const s = inScene([ANN], (w) => { Object.assign(w.relations[ANN], { trust: 51, affinity: 33, attraction: 12 }); });
    settings = { ...settings, showRawValues: true };
    const line = block(b, s).split('\n').find((l) => l.startsWith('Ann — '))!;
    expect(line).toContain('trust solid (51)');
    expect(line).toContain('affinity warm (33)');
  });
  it('attraction is left out when romance is off', () => {
    const b = builder();
    const s = inScene([ANN], (w) => { w.settings.intimacy = { romance: false, initiative: 'med' }; });
    expect(block(b, s)).not.toContain('attraction');
  });
  it('crime is shown only to units who know it', () => {
    const b = builder();
    const s = inScene([ANN, BEA], (w) => {
      w.relations[ANN].flags = ['knows_crime'];
      w.relations[BEA].flags = [];
    });
    const out = block(b, s);
    const crime = String(reg.crimes.get('mutiny')!.name);
    expect(out).toContain(`Crime: ${crime}`);
    expect(out).toMatch(/known to Ann/);
    expect(out).toContain('Crime: unknown to Bea.');
    const none = block(b, inScene([ANN, BEA], (w) => { w.relations[ANN].flags = []; w.relations[BEA].flags = []; }));
    expect(none).not.toContain(crime);
    expect(none).toContain('Crime: unknown to Ann, Bea.');
  });
  it('the commander line lists notable social ranks and the corporation', () => {
    const b = builder();
    const s = inScene([ANN], (w) => { w.commander.socialStats = { authority: 4, insight: 1, empathy: 3, cunning: 2 }; });
    const out = block(b, s);
    expect(out).toContain('Commander: Vale');
    expect(out).toContain('authority 4');
    expect(out).toContain('empathy 3');
    expect(out).not.toContain('cunning 2');
  });
  it('a fact known only by A never appears in a scene with B, nor with A and B together', () => {
    const b = builder();
    const mk = (parts: string[]) => inScene(parts, (w) => fact(w, 'Ann hides a scar from everyone.', [ANN]));
    expect(block(b, mk([BEA]))).not.toContain('hides a scar');
    expect(block(b, mk([ANN, BEA]))).not.toContain('hides a scar');
  });
  it('a fact known by A appears in A\'s private scene; public facts appear for everyone', () => {
    const b = builder();
    const s = inScene([ANN], (w) => fact(w, 'Ann hides a scar from everyone.', [ANN]));
    expect(block(b, s)).toContain('hides a scar');
    const pub = inScene([BEA], (w) => fact(w, 'The north gate is rusted shut.', ['*'], { about: ['world'] }));
    expect(block(b, pub)).toContain('rusted shut');
  });
  it('facts are ranked by overlap with the participants and their tags', () => {
    const b = builder();
    const s = inScene([ANN], (w) => {
      w.squad.find((u) => u.id === ANN)!.likes = ['tea'];
      for (let i = 0; i < 10; i++) fact(w, `unrelated fact ${i}`, ['*'], { about: ['world'], importance: 1 });
      fact(w, 'Ann loves tea at night.', ['*'], { tags: ['tea'], importance: 1 });
    });
    const out = block(b, s);
    expect(out).toContain('Ann loves tea at night.');
    expect(out.split('\n').filter((l) => l.startsWith('- ')).length).toBeLessThanOrEqual(6 + 1);
  });
  it('open promises involving the participants are listed', () => {
    const b = builder();
    const s = inScene([ANN], (w) => {
      w.memory.promises = [
        { id: 'p1', by: 'commander', to: ANN, text: 'bring her medicine', status: 'open', day: 10 },
        { id: 'p2', by: 'commander', to: BEA, text: 'fix the radio', status: 'open', day: 10 },
        { id: 'p3', by: 'commander', to: ANN, text: 'old news', status: 'kept', day: 9 },
      ];
    });
    const out = block(b, s);
    expect(out).toContain('bring her medicine');
    expect(out).not.toContain('fix the radio');
    expect(out).not.toContain('old news');
  });
  it('the block respects contextTokenCap (lower priorities dropped first)', () => {
    const b = builder();
    const s = inScene([ANN], (w) => {
      fact(w, 'A low priority fact about Ann.', ['*']);
      w.memory.promises = [{ id: 'p1', by: 'commander', to: ANN, text: 'a promise', status: 'open', day: 10 }];
    });
    const full = block(b, s, 5000);
    expect(full).toContain('low priority fact');
    expect(full).toContain('a promise');
    const small = block(b, s, 120);
    expect(small).toContain('Scene: Mess hall');
    expect(small).not.toContain('low priority fact');
    expect(small).not.toContain('a promise');
  });
});

describe('scene directives', () => {
  it('explicit directive follows the setting', () => {
    const b = builder();
    const s = inScene();
    sceneDirectives(b, s, { ...settings, explicitContent: true });
    expect(b.build(s, 1000).directives).toContain('Explicit content: allowed.');
    sceneDirectives(b, s, { ...settings, explicitContent: false });
    const d = b.build(s, 1000).directives;
    expect(d).toContain('Explicit content: not allowed; fade out intimate moments.');
    expect(d).not.toContain('Explicit content: allowed.');
  });
  it('romance off adds its own directive; clear removes both', () => {
    const b = builder();
    const s = inScene([ANN], (w) => { w.settings.intimacy = { romance: false, initiative: 'med' }; });
    sceneDirectives(b, s, settings);
    expect(b.build(s, 1000).directives).toMatch(/Romance is disabled/);
    clearSceneDirectives(b);
    expect(b.build(s, 1000).directives).toBe('');
    sceneDirectives(b, inScene(), settings);
    expect(b.build(s, 1000).directives).not.toMatch(/Romance is disabled/);
  });
});
