import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { bondsDirectives, contentLine } from '../../src/bonds/directives';
import { setCategories } from '../../src/engine/bonds';
import type { CampaignState } from '../../src/engine/state/types';
import { ContextBuilder } from '../../src/llm/context';
import { sceneDirectives } from '../../src/scene/context';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { campaign, errors, loadCore, run } from '../helpers/world';
import { enable, withBond } from '../helpers/bonds';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
const [ANN, BEA] = ['unit_ann', 'unit_bea'];
const dirs = (b: ContextBuilder, s: CampaignState) => b.build(s, 5000).directives;
const labels = (ids: string[]) => ids.map((id) => String(reg.contentCategories.get(id)!.label));
const inScene = (participants = [ANN], tweak: (s: CampaignState) => void = () => {}): CampaignState => {
  const s = campaign(reg, 4);
  tweak(s);
  const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants, origin: 'event', startIndex: 0 } });
  expect(errors(r.events)).toEqual([]);
  return r.state;
};

describe('the content exclusion directive', () => {
  it('lists every disabled category label and fades out intimate moments while explicit_scenes is off', () => {
    const s = campaign(reg, 4);
    const b = new ContextBuilder();
    bondsDirectives(b, s, reg);
    const d = dirs(b, s);
    const everyLabel = labels([...reg.contentCategories.keys()]);
    expect(everyLabel).toHaveLength(9);
    for (const l of everyLabel) expect(d).toContain(l);
    expect(d).toContain('Content excluded from this story — never depict, imply or describe: ');
    expect(d).toContain('Fade out intimate moments.');
    expect(d).not.toContain('Explicit intimate scenes are allowed');
  });

  it('enabling a category removes it from the directive on the next applyContext', () => {
    const s = campaign(reg, 4);
    const b = new ContextBuilder();
    bondsDirectives(b, s, reg);
    expect(dirs(b, s)).toContain('Restraint');
    enable(s, 'restraint');
    bondsDirectives(b, s, reg);
    const d = dirs(b, s);
    expect(d).not.toContain('Restraint');
    expect(d).toContain('Humiliation');
  });

  it('explicit_scenes enabled says explicit scenes are allowed and does not fade out', () => {
    const s = enable(campaign(reg, 4), 'explicit_scenes');
    const b = new ContextBuilder();
    bondsDirectives(b, s, reg);
    const d = dirs(b, s);
    expect(d).toContain('Explicit intimate scenes are allowed when the story leads there.');
    expect(d).not.toContain('Fade out intimate moments.');
    expect(d).not.toContain('Explicit scenes'); // its label is not in the excluded list
  });

  it('with every category enabled only the explicit-scenes line remains; the exclusion sentence is gone', () => {
    const s = enable(campaign(reg, 4), ...reg.contentCategories.keys());
    expect(contentLine(s, reg)).toBe('Explicit intimate scenes are allowed when the story leads there.');
    const b = new ContextBuilder();
    bondsDirectives(b, s, reg);
    expect(dirs(b, s)).not.toContain('Content excluded');
  });

  it('with nothing excluded and explicit_scenes not enabled the line is empty and the directive is cleared', () => {
    const r = structuredClone(reg);
    r.contentCategories = new Map([...reg.contentCategories].filter(([id]) => id === 'restraint'));
    const s = enable(campaign(r, 4), 'restraint');
    expect(contentLine(s, r)).toBe('');
    const b = new ContextBuilder();
    b.setDirective({ id: 'content', text: 'stale', expiresAfter: 'manual' });
    bondsDirectives(b, s, r);
    expect(dirs(b, s)).toBe('');
  });

  it('is a manual directive: it survives a scene end and a reply, and goes away with the campaign', () => {
    const s = campaign(reg, 4);
    const b = new ContextBuilder();
    bondsDirectives(b, s, reg);
    b.onReplyReceived();
    b.clearMatching((d) => d.expiresAfter === 'scene');
    expect(dirs(b, s)).toContain('Content excluded');
    bondsDirectives(b, null, reg);
    expect(dirs(b, s)).toBe('');
  });

  it('a campaign that turned everything off through the action reads the same as a fresh one', () => {
    const s = campaign(reg, 4);
    setCategories(s, reg, []);
    expect(contentLine(s, reg)).toBe(contentLine(campaign(reg, 4), reg));
  });
});

describe('the own-limits directive', () => {
  it('holds even when the category is enabled, only for a present unit', () => {
    const s = inScene([ANN], (w) => {
      enable(w, 'restraint', 'humiliation');
      withBond(w, ANN, { ownLimits: { categories: ['restraint', 'humiliation'], note: 'Never in front of the squad.' } });
      withBond(w, BEA, { ownLimits: { categories: ['pain_rough'] } });
    });
    const b = new ContextBuilder();
    bondsDirectives(b, s, reg);
    const d = dirs(b, s);
    expect(d).toContain(`Ann will not take part in: ${labels(['humiliation', 'restraint']).join(', ')}. Never in front of the squad.`);
    expect(d).not.toContain('Bea will not');
  });

  it('a note alone still produces a line; a unit without limits produces none', () => {
    const s = inScene([ANN, BEA], (w) => {
      withBond(w, ANN, { ownLimits: { categories: [], note: 'Touch only when she asks.' } });
    });
    const b = new ContextBuilder();
    bondsDirectives(b, s, reg);
    const d = dirs(b, s);
    expect(d).toContain('Ann has a personal limit: Touch only when she asks.');
    expect(d).not.toContain('Bea');
  });

  it('is cleared when the scene ends or a unit leaves', () => {
    const open = inScene([ANN], (w) => withBond(w, ANN, { ownLimits: { categories: ['restraint'] } }));
    const b = new ContextBuilder();
    bondsDirectives(b, open, reg);
    expect(dirs(b, open)).toContain('Ann will not take part in');
    const closed = structuredClone(open);
    delete closed.scene;
    bondsDirectives(b, closed, reg);
    expect(dirs(b, closed)).not.toContain('Ann will not');
  });

  it('a grunt and a unit without a profile never get one', () => {
    const s = inScene([ANN]);
    const b = new ContextBuilder();
    bondsDirectives(b, s, reg);
    expect(dirs(b, s)).not.toContain('will not take part');
  });
});

describe('the retired explicit directive', () => {
  it('no explicit directive id is set any more', () => {
    const s = inScene([ANN]);
    const b = new ContextBuilder();
    sceneDirectives(b, s, { ...DEFAULT_SETTINGS, explicitContent: true });
    expect(dirs(b, s)).not.toContain('Explicit content');
    sceneDirectives(b, s, { ...DEFAULT_SETTINGS, explicitContent: false });
    expect(dirs(b, s)).not.toContain('Explicit content');
  });
});

describe('pronouns', () => {
  it('directive texts have no commander pronoun', () => {
    const COMMANDER = /\b(he|him|his|himself|he's)\b/i;
    const s = inScene([ANN, BEA], (w) => {
      enable(w, 'restraint');
      withBond(w, ANN, { ownLimits: { categories: ['restraint', 'pain_rough'], note: 'Not in public.' } });
      withBond(w, BEA, { ownLimits: { categories: [], note: 'Ask first.' } });
    });
    const b = new ContextBuilder();
    bondsDirectives(b, s, reg);
    const d = dirs(b, s);
    expect(d.length).toBeGreaterThan(100);
    expect(d).not.toMatch(COMMANDER);
    expect(contentLine(s, reg)).not.toMatch(COMMANDER);
  });
});

describe('the lead and boundary directives (Task 8)', () => {
  const sceneWithLead = (by: 'unit' | 'commander' | 'shared', extra: (s: CampaignState) => void = () => {}) => {
    const s = inScene([ANN]);
    s.scene!.lead = { by, unitId: ANN, score: 50 };
    extra(s);
    return s;
  };
  const read = (s: CampaignState) => {
    const b = new ContextBuilder();
    bondsDirectives(b, s, reg);
    return dirs(b, s);
  };

  it('the lead directive names who leads', () => {
    expect(read(sceneWithLead('unit'))).toContain('Ann leads this scene.');
    expect(read(sceneWithLead('commander'))).toContain('The commander leads this scene; Ann follows.');
    expect(read(sceneWithLead('shared'))).toContain('Ann and the commander share the lead.');
  });

  it('no lead, no directive; romance off removes it', () => {
    expect(read(inScene([ANN]))).not.toContain('leads this scene');
    expect(read(sceneWithLead('unit', (s) => { s.settings.intimacy = { romance: false, initiative: 'med' }; }))).not.toContain('leads this scene');
  });

  it('a stale lead directive is cleared when the scene ends', () => {
    const open = sceneWithLead('unit');
    const b = new ContextBuilder();
    bondsDirectives(b, open, reg);
    expect(dirs(b, open)).toContain('Ann leads this scene.');
    const closed = structuredClone(open);
    delete closed.scene;
    bondsDirectives(b, closed, reg);
    expect(dirs(b, closed)).not.toContain('leads this scene');
  });

  it('every boundary the commander set is a scene directive', () => {
    const d = read(sceneWithLead('shared', (s) => { s.scene!.limits = ['Nothing past the door.', 'No names.']; }));
    expect(d).toContain('In this scene, a boundary the commander set: Nothing past the door.');
    expect(d).toContain('In this scene, a boundary the commander set: No names.');
    expect(read(inScene([ANN]))).not.toContain('a boundary the commander set');
  });

  it('a boundary text is plain: control characters are gone', () => {
    const d = read(sceneWithLead('shared', (s) => { s.scene!.limits = ['a\u0007b\nc']; }));
    expect(d).toContain('a b c');
  });

  it('the lead texts have no commander pronoun', () => {
    for (const by of ['unit', 'commander', 'shared'] as const) expect(read(sceneWithLead(by))).not.toMatch(/\b(he|him|his|himself)\b/i);
  });
});

describe('the want directive (Task 9)', () => {
  const TEXT = 'Ann is restless and irritable with unmet want; it colors how she speaks to the commander.';
  const eligible = (want: number, participants = [ANN]) => inScene(participants, (s) => {
    s.relations[ANN].stateId = 'lover';
    withBond(s, ANN, { desire: 'medium' });
    s.relations[ANN].want = want;
  });
  const read = (s: CampaignState, b = new ContextBuilder()) => {
    bondsDirectives(b, s, reg);
    return dirs(b, s);
  };

  it('at 70 and more she is restless in the scene she is present in', () => {
    expect(read(eligible(70))).toContain(TEXT);
    expect(read(eligible(95))).toContain(TEXT);
    expect(read(eligible(69))).not.toContain(TEXT);
  });

  it('only while she is present, and only while Want runs for her', () => {
    expect(read(inScene([BEA], (s) => { s.relations[ANN].stateId = 'lover'; withBond(s, ANN, { desire: 'medium' }); s.relations[ANN].want = 90; }))).not.toContain('restless and irritable');
    const off = eligible(90);
    off.settings.intimacy = { romance: false, initiative: 'med' };
    expect(read(off)).not.toContain(TEXT);
  });

  it('is a manual directive that goes away when the band falls, without touching a next_reply directive of the same id', () => {
    const b = new ContextBuilder();
    expect(read(eligible(80), b)).toContain(TEXT);
    const calm = eligible(10);
    expect(read(calm, b)).not.toContain(TEXT);
    // the patience directive of a postponed demand (Task 10) shares the id and must survive a refresh
    b.setDirective({ id: `want:${ANN}`, expiresAfter: 'next_reply', text: 'Ann was asked to wait; she is trying to be patient.' });
    expect(read(calm, b)).toContain('trying to be patient');
  });

  it('has no commander pronoun', () => {
    expect(read(eligible(90))).not.toMatch(/\b(he|him|his|himself)\b/i);
  });
});
