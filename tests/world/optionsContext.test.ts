import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { TUNING } from '../../src/engine/tuning';
import type { CampaignState, WorldStance } from '../../src/engine/state/types';
import { ContextBuilder } from '../../src/llm/context';
import { estTokens } from '../../src/llm/text';
import { clearWorldDirectives, registerWorldOptionsContext, worldDirectives, worldSettingsLine } from '../../src/world/optionsContext';
import { campaign, errors, loadCore, run } from '../helpers/world';

let reg: Registries;
let base: CampaignState;
const [ANN, BEA] = ['unit_ann', 'unit_bea'];
beforeAll(async () => {
  reg = await loadCore();
  base = campaign(reg, 3);
});

const shares = (strength: 1 | 2 = 1): WorldStance => ({ stance: 'shares', strength, reason: 'r' });
const opposes = (strength: 1 | 2 = 1): WorldStance => ({ stance: 'opposes', strength, reason: 'r' });
const MACHISMO = { gender_norms: 'corporate_machismo' };
function world(options: Record<string, string> = {}, o: { present?: string[]; stances?: Record<string, Record<string, WorldStance>>; day?: number } = {}): CampaignState {
  const s = structuredClone(base);
  s.world.options = { ...(s.world.options ?? {}), ...options };
  for (const [id, st] of Object.entries(o.stances ?? {})) s.squad.find((u) => u.id === id)!.worldStances = st;
  if (o.day !== undefined) s.day = o.day;
  if (o.present) s.scene = { participants: o.present, mode: o.present.length > 1 ? 'group' : 'private', locationId: 'mess_hall', exchanges: 0 } as never;
  return s;
}
function builderFor(): ContextBuilder {
  const b = new ContextBuilder();
  registerWorldOptionsContext(b, { registries: () => reg });
  return b;
}
const dirs = (b: ContextBuilder, s: CampaignState): string[] => b.build(s, 5000).directives.split('\n').slice(1);

describe('the WORLD SETTINGS block', () => {
  it('the block lists the current lore lines in option order and fits 120 tokens', () => {
    const s = world();
    const line = worldSettingsLine(s, reg);
    const lore = (opt: string, choice: string) => (reg.worldOptions.get(opt)!.choices as Array<{ id: string; lore: string }>).find((c) => c.id === choice)!.lore;
    const expected = ['gender_norms:indifferent', 'offspec_stigma:tolerated', 'oversight:standard', 'bloom_horror:restrained', 'tone:grim', 'disposition:guarded']
      .map((x) => lore(...(x.split(':') as [string, string])));
    expect(line).toBe(`World settings: ${expected.join(' ')}`);
    expect(estTokens(line)).toBeLessThanOrEqual(TUNING.disposition.worldBlockTokens);
    const brutal = worldSettingsLine(world({ ...MACHISMO, offspec_stigma: 'hunted', oversight: 'brutal', bloom_horror: 'graphic', tone: 'bleak', disposition: 'hazardous' }), reg);
    expect(estTokens(brutal)).toBeLessThanOrEqual(TUNING.disposition.worldBlockTokens);
    expect(brutal.indexOf(lore('gender_norms', 'corporate_machismo'))).toBeGreaterThan(0);
    expect(brutal.indexOf(lore('gender_norms', 'corporate_machismo'))).toBeLessThan(brutal.indexOf(lore('disposition', 'hazardous')));
  });

  it('every combination of choices fits the token cap (the longest line of each option)', () => {
    const longest = [...reg.worldOptions.values()].map((o) => (o.choices as Array<{ lore: string }>).reduce((a, c) => (c.lore.length > a.length ? c.lore : a), ''));
    expect(estTokens(`World settings: ${longest.join(' ')}`)).toBeLessThanOrEqual(TUNING.disposition.worldBlockTokens);
  });

  it('a block that would be longer is cut at whole lines inside the cap', () => {
    const r: Registries = { ...reg, worldOptions: new Map(reg.worldOptions) };
    const tone = structuredClone(reg.worldOptions.get('tone')!) as unknown as { choices: Array<{ id: string; lore: string }> };
    tone.choices.find((c) => c.id === 'grim')!.lore = 'x'.repeat(480);
    r.worldOptions.set('tone', tone as never);
    const line = worldSettingsLine(world(), r);
    expect(estTokens(line)).toBeLessThanOrEqual(TUNING.disposition.worldBlockTokens);
    expect(line).not.toContain('xxx'); // the over-long line is dropped whole, not sliced mid-word
    expect(line.startsWith('World settings: ')).toBe(true);
  });

  it('it renders outside a scene, as the provider world_settings after the header', () => {
    const b = builderFor();
    const s = world();
    expect(s.scene).toBeUndefined();
    const { block } = b.build(s, 5000);
    expect(block).toContain('World settings: ');
    expect(block.indexOf('[ALIUS] Day')).toBeLessThan(block.indexOf('World settings: '));
  });

  it('lore lines carry no pronoun for the commander', () => {
    for (const pick of [{}, { ...MACHISMO, offspec_stigma: 'hunted', tone: 'bleak', disposition: 'hazardous' }]) {
      expect(worldSettingsLine(world(pick), reg)).not.toMatch(/\b(he|him|his)\b/i);
    }
  });
});

describe('world directives', () => {
  it('the defaults carry only the Bloom presentation directive', () => {
    const b = builderFor();
    worldDirectives(b, world(), reg);
    expect(dirs(b, world())).toHaveLength(1);
    expect(dirs(b, world())[0]).toMatch(/without gore/);
  });

  it('switching bloom_horror replaces its directive', () => {
    const b = builderFor();
    let s = world();
    worldDirectives(b, s, reg);
    expect(b.build(s, 5000).directives).toMatch(/without gore/);
    const r = run(s, reg, { type: 'world/set_option', payload: { optionId: 'bloom_horror', choiceId: 'graphic' } });
    expect(errors(r.events)).toEqual([]);
    s = r.state;
    worldDirectives(b, s, reg);
    const text = b.build(s, 5000);
    expect(text.directives).toMatch(/unflinching physical detail/);
    expect(text.directives).not.toMatch(/without gore/);
    expect(dirs(b, s)).toHaveLength(1);
    expect(text.block).toContain('graphic, unflinching detail'); // the lore line changed too
  });

  it('the world directives of the other options appear with their choices', () => {
    const b = builderFor();
    const s = world({ ...MACHISMO, offspec_stigma: 'hunted', oversight: 'brutal' });
    worldDirectives(b, s, reg);
    const d = b.build(s, 5000).directives;
    expect(d).toMatch(/soft or feminine bearing/);
    expect(d).toMatch(/sweeps/);
    expect(d).toMatch(/curt and threatening/);
  });

  it('a shares unit\'s early directive disappears after w(d) ≤ 0.5', () => {
    const at = (day: number) => {
      const s = world(MACHISMO, { present: [ANN], stances: { [ANN]: { gender_norms: shares() } }, day });
      const b = builderFor();
      worldDirectives(b, s, reg);
      return b.build(s, 5000).directives;
    };
    // metDay 1, τ = 7: w = exp(−d/7); 0.5 is crossed between d = 4 (0.565) and d = 5 (0.490)
    expect(at(1)).toContain('Ann half-believes');
    expect(at(5)).toContain('Ann half-believes');
    expect(at(6)).not.toContain('half-believes');
    expect(at(30)).not.toContain('half-believes');
  });

  it('a directive that is not "early" stays: the stigma stance speaks at any time', () => {
    const s = world({ offspec_stigma: 'scorned' }, { present: [ANN], stances: { [ANN]: { offspec_stigma: shares(2) } }, day: 40 });
    const b = builderFor();
    worldDirectives(b, s, reg);
    expect(b.build(s, 5000).directives).toContain('Ann has taken the world\'s contempt');
  });

  it('only units present get a stance directive', () => {
    const s = world(MACHISMO, { present: [BEA], stances: { [ANN]: { gender_norms: shares() } } });
    const b = builderFor();
    worldDirectives(b, s, reg);
    expect(b.build(s, 5000).directives).not.toContain('Ann');
  });

  it('friction appears only with a shares and an opposes unit present', () => {
    const both = world(MACHISMO, { present: [ANN, BEA], stances: { [ANN]: { gender_norms: shares() }, [BEA]: { gender_norms: opposes() } } });
    const onlyShares = world(MACHISMO, { present: [ANN, BEA], stances: { [ANN]: { gender_norms: shares() } } });
    const onlyOpposes = world(MACHISMO, { present: [ANN, BEA], stances: { [BEA]: { gender_norms: opposes() } } });
    const alone = world(MACHISMO, { present: [ANN], stances: { [ANN]: { gender_norms: shares() }, [BEA]: { gender_norms: opposes() } } });
    const text = (s: CampaignState) => { const b = builderFor(); worldDirectives(b, s, reg); return b.build(s, 5000).directives; };
    expect(text(both)).toMatch(/clash with those who reject them/);
    expect(text(onlyShares)).not.toMatch(/clash/);
    expect(text(onlyOpposes)).not.toMatch(/clash/);
    expect(text(alone)).not.toMatch(/clash/);
  });

  it('a stance under a neutral choice gives no directive', () => {
    const s = world({}, { present: [ANN], stances: { [ANN]: { gender_norms: shares(2), offspec_stigma: shares(2) } } });
    const b = builderFor();
    worldDirectives(b, s, reg);
    expect(b.build(s, 5000).directives).not.toContain('Ann');
  });

  it('refreshing clears its own directives first and leaves the others alone', () => {
    const b = builderFor();
    b.setDirective({ id: 'explicit', text: 'Explicit content: not allowed.', expiresAfter: 'scene' });
    const s1 = world(MACHISMO, { present: [ANN], stances: { [ANN]: { gender_norms: shares() } } });
    worldDirectives(b, s1, reg);
    expect(b.build(s1, 5000).directives).toContain('Ann half-believes');
    const s2 = world({}, { present: [ANN] });
    worldDirectives(b, s2, reg);
    const d = b.build(s2, 5000).directives;
    expect(d).not.toContain('Ann half-believes');
    expect(d).not.toContain('soft or feminine bearing');
    expect(d).toContain('Explicit content: not allowed.');
    clearWorldDirectives(b);
    expect(b.build(s2, 5000).directives).toBe('- Explicit content: not allowed.'.replace(/^/, '[ALIUS DIRECTIVES — hard constraints, follow them]\n'));
  });

  it('no directive text contains he/him/his', () => {
    const everything = { ...MACHISMO, offspec_stigma: 'hunted', oversight: 'brutal', bloom_horror: 'graphic', tone: 'bleak', disposition: 'hazardous' };
    for (const options of [everything, { gender_norms: 'inverted', offspec_stigma: 'scorned', oversight: 'lenient' }]) {
      for (const stances of [{ gender_norms: shares(2), offspec_stigma: shares(2) }, { gender_norms: opposes(2), offspec_stigma: opposes(2) }]) {
        const s = world(options, { present: [ANN, BEA], stances: { [ANN]: stances, [BEA]: { gender_norms: stances.gender_norms.stance === 'shares' ? opposes() : shares() } } });
        const b = builderFor();
        worldDirectives(b, s, reg);
        const text = b.build(s, 5000).directives;
        expect(text.length).toBeGreaterThan(100);
        expect(text).not.toMatch(/\b(he|him|his|himself)\b/i);
      }
    }
  });
});
