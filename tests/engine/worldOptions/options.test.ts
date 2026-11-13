import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import {
  defaultWorldOptions, isNeutralChoice, validateWorldOptions, worldChoice, worldChoices, worldEffects,
} from '../../../src/engine/worldOptions';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, errors, loadCore, ofType, run } from '../../helpers/world';

let reg: Registries;
let base: CampaignState;
beforeAll(async () => {
  reg = await loadCore();
  base = campaign(reg, 2);
});

const withOptions = (options: Record<string, string> | undefined): CampaignState => {
  const s = structuredClone(base);
  if (options === undefined) delete s.world.options;
  else s.world.options = options;
  return s;
};

describe('reading world options', () => {
  it('an old save without options reads every default', () => {
    const s = withOptions(undefined);
    expect(s.world.options).toBeUndefined();
    const read = Object.fromEntries(worldChoices(s, reg).map(({ option, choice }) => [option.id, choice.id]));
    expect(read).toEqual({
      gender_norms: 'indifferent', offspec_stigma: 'tolerated', oversight: 'standard', bloom_horror: 'restrained', tone: 'grim', disposition: 'guarded',
    });
    expect(defaultWorldOptions(reg)).toEqual(read);
  });

  it('an unknown stored choice reads the default', () => {
    const s = withOptions({ tone: 'sunny', ghost_option: 'x' });
    expect(worldChoice(s, reg, 'tone')!.choice.id).toBe('grim');
    expect(worldChoice(s, reg, 'ghost_option')).toBeNull();
  });

  it('a stored choice is read', () => {
    const s = withOptions({ oversight: 'brutal' });
    expect(worldChoice(s, reg, 'oversight')!.choice.id).toBe('brutal');
    expect(worldChoice(s, reg, 'oversight')!.option.id).toBe('oversight');
  });

  it('worldChoices keeps the option order of the registry', () => {
    expect(worldChoices(base, reg).map((c) => c.option.id)).toEqual([...reg.worldOptions.keys()]);
  });

  it('worldEffects sums by type across options', () => {
    const s = withOptions({ oversight: 'brutal', offspec_stigma: 'hunted', gender_norms: 'corporate_machismo' });
    expect(worldEffects(s, reg, 'leash_weekly')).toEqual([{ type: 'leash_weekly', amount: -1 }]);
    expect(worldEffects(s, reg, 'enable_family')).toEqual([{ type: 'enable_family', family: 'purge_sweep' }]);
    expect(worldEffects(s, reg, 'scene_directive').length).toBeGreaterThanOrEqual(4); // gender, stigma, oversight, bloom_horror
    // a second option contributing the same type is collected too (registries may be patched by a pack)
    const patched: Registries = { ...reg, worldOptions: new Map(reg.worldOptions) };
    const tone = structuredClone(reg.worldOptions.get('tone')!) as unknown as { choices: Array<{ id: string; effects: unknown[] }> };
    tone.choices.find((c) => c.id === 'grim')!.effects.push({ type: 'leash_weekly', amount: 2 });
    patched.worldOptions.set('tone', tone as never);
    expect(worldEffects(s, patched, 'leash_weekly')).toEqual([{ type: 'leash_weekly', amount: -1 }, { type: 'leash_weekly', amount: 2 }]);
  });

  it('defaults carry no effect that changes a number', () => {
    for (const type of ['leash_weekly', 'terminate_approval', 'command_failure_mult', 'mission_reward_pct', 'expression_norm', 'enable_family'] as const) {
      expect(worldEffects(base, reg, type), type).toEqual([]);
    }
  });

  it('isNeutralChoice: no norm, family or reward effect', () => {
    const choice = (opt: string, id: string) => worldChoices(withOptions({ [opt]: id }), reg).find((c) => c.option.id === opt)!.choice;
    expect(isNeutralChoice(choice('gender_norms', 'indifferent'))).toBe(true);
    expect(isNeutralChoice(choice('gender_norms', 'inverted'))).toBe(false);
    expect(isNeutralChoice(choice('offspec_stigma', 'tolerated'))).toBe(true);
    expect(isNeutralChoice(choice('offspec_stigma', 'scorned'))).toBe(false);
    expect(isNeutralChoice(choice('offspec_stigma', 'hunted'))).toBe(false);
  });
});

describe('validateWorldOptions', () => {
  it('accepts a complete or partial valid map and nothing', () => {
    expect(validateWorldOptions(undefined, reg)).toEqual([]);
    expect(validateWorldOptions({ tone: 'bleak' }, reg)).toEqual([]);
    expect(validateWorldOptions(defaultWorldOptions(reg), reg)).toEqual([]);
  });
  it('names unknown options and choices', () => {
    expect(validateWorldOptions({ ghost: 'x' }, reg)).toEqual(['Unknown world option "ghost"']);
    expect(validateWorldOptions({ tone: 'sunny' }, reg)).toEqual(['Unknown choice "sunny" for world option "tone"']);
  });
});

describe('world/set_option', () => {
  it('set_option switches bloom_horror and emits world_option_changed', () => {
    const r = run(base, reg, { type: 'world/set_option', payload: { optionId: 'bloom_horror', choiceId: 'graphic' } });
    expect(errors(r.events)).toEqual([]);
    expect(worldChoice(r.state, reg, 'bloom_horror')!.choice.id).toBe('graphic');
    expect(ofType(r.events, 'world_option_changed')).toEqual([{ type: 'world_option_changed', optionId: 'bloom_horror', from: 'restrained', to: 'graphic' }]);
  });

  it('set_option refuses a locked option and changes nothing', () => {
    const r = run(base, reg, { type: 'world/set_option', payload: { optionId: 'disposition', choiceId: 'hazardous' } });
    expect(errors(r.events).map((e) => e.message)).toEqual(['World option "disposition" is locked after the campaign start.']);
    expect(r.state).toEqual(base);
  });

  it('set_option refuses unknown ids and changes nothing', () => {
    const a = run(base, reg, { type: 'world/set_option', payload: { optionId: 'ghost', choiceId: 'x' } });
    expect(errors(a.events)).toHaveLength(1);
    expect(a.state).toEqual(base);
    const b = run(base, reg, { type: 'world/set_option', payload: { optionId: 'bloom_horror', choiceId: 'ghost' } });
    expect(errors(b.events)).toHaveLength(1);
    expect(b.state).toEqual(base);
  });

  it('switching to the current choice emits nothing', () => {
    const r = run(base, reg, { type: 'world/set_option', payload: { optionId: 'bloom_horror', choiceId: 'restrained' } });
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'world_option_changed')).toEqual([]);
  });

  it('works on an old save without options', () => {
    const r = run(withOptions(undefined), reg, { type: 'world/set_option', payload: { optionId: 'bloom_horror', choiceId: 'graphic' } });
    expect(errors(r.events)).toEqual([]);
    expect(worldChoice(r.state, reg, 'bloom_horror')!.choice.id).toBe('graphic');
    expect(worldChoice(r.state, reg, 'tone')!.choice.id).toBe('grim');
  });
});
