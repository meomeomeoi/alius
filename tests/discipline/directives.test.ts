import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { commandStance, stanceEntry } from '../../src/engine/discipline';
import type { CampaignState } from '../../src/engine/state/types';
import { ContextBuilder } from '../../src/llm/context';
import { clearDisciplineDirectives, disciplineDirectives } from '../../src/discipline/context';
import { measureLabel, stanceDirective, stanceRefusalDirective, threatDirective } from '../../src/discipline/directives';
import { bandDirective } from '../../src/loyalty/directives';
import { campaign, loadCore, run, setRelation } from '../helpers/loyalty';
import { noPresence, withStance, type StanceName } from '../helpers/discipline';

let base: Registries;
let reg: Registries;
beforeAll(async () => {
  base = await loadCore();
  reg = noPresence(base);
});
const [ANN, BEA] = ['unit_ann', 'unit_bea'];
const LEAVING = 'She is close to leaving the unit: if pressed she says she is thinking of going.';
const entry = (stance: StanceName) => stanceEntry(reg, stance)!;
const sceneState = (over: (s: CampaignState) => void = () => {}, ids = [ANN]): CampaignState => {
  const s = campaign(reg, 4);
  over(s);
  const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: ids, origin: 'event', startIndex: 0 } });
  return r.state;
};
const texts = (b: ContextBuilder, s: CampaignState): string[] => b.build(s, 5000).directives.split('\n');

describe('the directive builders', () => {
  it('a stance directive is the registry text with her name and lasts for the scene', () => {
    const d = stanceDirective(ANN, 'Ann', entry('disciplined'), 'steady');
    expect(d).toEqual({
      id: `loyalty:${ANN}`, expiresAfter: 'scene',
      text: "Ann obeys the commander's orders and objects by the book: formally, once, on the record.",
    });
  });

  it('a breaking unit gets the leaving sentence after the stance text, a wavering one does not', () => {
    expect(stanceDirective(ANN, 'Ann', entry('fearful'), 'breaking').text).toBe(`${String(entry('fearful').directive).replaceAll('{name}', 'Ann')} ${LEAVING}`);
    expect(stanceDirective(ANN, 'Ann', entry('fearful'), 'wavering').text).not.toContain('leaving');
    expect(stanceDirective(ANN, 'Ann', entry('fearful'), 'steady').text).not.toContain('leaving');
  });

  it('a refusal directive fills {name} and {reason} and keeps the P6 id', () => {
    const d = stanceRefusalDirective(ANN, 'Ann', entry('open_defiance'), 'she despises the commander');
    expect(d.id).toBe(`refusal:${ANN}`);
    expect(d.expiresAfter).toBe('scene');
    expect(d.text).toBe("Ann REFUSES the commander's order this scene, openly and with contempt. Reason: she despises the commander. She will not comply under persuasion; only the Leash can force her.");
    expect(stanceRefusalDirective(ANN, 'Ann', entry('fearful'), 'anything').text).toBe(
      'Ann says she will carry out the order and does not mean it: she stalls and does it badly on purpose, and never admits it aloud.',
    );
  });

  it('a threat directive says whether she believes it, for one reply', () => {
    expect(threatDirective(ANN, 'Ann', 'Brig', true)).toEqual({
      id: `threat:${ANN}`, expiresAfter: 'next_reply', text: "Ann believes the commander's threat (Brig) will be carried out.",
    });
    expect(threatDirective(ANN, 'Ann', 'Brig', false).text).toBe("Ann does not believe the commander's threat (Brig) will be carried out, and it shows.");
  });

  it('measureLabel: the punishment label, The Leash, Consequences', () => {
    const withBrig: Registries = { ...reg, punishments: new Map([['brig', { id: 'brig', label: 'Brig', severity: 4 }]]) };
    expect(measureLabel(withBrig, 'brig')).toBe('Brig');
    expect(measureLabel(withBrig, 'leash')).toBe('The Leash');
    expect(measureLabel(withBrig, 'unspecified')).toBe('Consequences');
    expect(measureLabel(withBrig, 'gone')).toBe('Consequences');
  });
});

describe('disciplineDirectives', () => {
  it('the directive of a participant matches her quadrant', () => {
    for (const stance of ['disciplined', 'defiant_loyal', 'fearful', 'open_defiance'] as const) {
      const s = sceneState((x) => withStance(x, reg, ANN, stance));
      expect(commandStance(s, reg, ANN)).toBe(stance);
      const b = new ContextBuilder();
      disciplineDirectives(b, s, reg);
      expect(texts(b, s).join('\n'), stance).toContain(String(entry(stance).directive).replaceAll('{name}', 'Ann'));
    }
  });

  it('every present named unit gets one, and nobody else', () => {
    const s = sceneState((x) => { withStance(x, reg, ANN, 'disciplined'); withStance(x, reg, BEA, 'fearful'); }, [ANN, BEA]);
    const b = new ContextBuilder();
    disciplineDirectives(b, s, reg);
    const out = texts(b, s).join('\n');
    expect(out).toContain('Ann obeys');
    expect(out).toContain('Bea complies in silence');
    expect(out).not.toContain('Cat');
  });

  it('a stance change during a scene replaces the text on the next render', () => {
    const s = sceneState((x) => withStance(x, reg, ANN, 'disciplined'));
    const b = new ContextBuilder();
    disciplineDirectives(b, s, reg);
    expect(texts(b, s).join('\n')).toContain('Ann obeys');
    withStance(s, reg, ANN, 'open_defiance');
    disciplineDirectives(b, s, reg);
    const out = texts(b, s).join('\n');
    expect(out).toContain('Ann mocks the commander');
    expect(out).not.toContain('Ann obeys');
  });

  it('a wavering unit shows the stance text, not the P6 wavering text', () => {
    const s = sceneState((x) => { withStance(x, reg, ANN, 'disciplined'); setRelation(x, ANN, { band: 'wavering' }); });
    const b = new ContextBuilder();
    b.setDirective(bandDirective(ANN, 'Ann', 'wavering')!); // what P6 set when the scene opened
    disciplineDirectives(b, s, reg);
    const out = texts(b, s).join('\n');
    expect(out).toContain('Ann obeys');
    expect(out).not.toContain('openly doubts');
  });

  it('a breaking unit gets the stance text plus the leaving sentence', () => {
    const s = sceneState((x) => { withStance(x, reg, ANN, 'fearful'); setRelation(x, ANN, { band: 'breaking' }); });
    const b = new ContextBuilder();
    disciplineDirectives(b, s, reg);
    const out = texts(b, s).join('\n');
    expect(out).toContain('Ann complies in silence');
    expect(out).toContain(LEAVING);
    expect(out).not.toContain('cold and watchful');
  });

  it('a unit who left the scene loses hers; with no scene none is left', () => {
    const s = sceneState((x) => withStance(x, reg, BEA, 'fearful'), [ANN, BEA]);
    const b = new ContextBuilder();
    disciplineDirectives(b, s, reg);
    expect(texts(b, s).join('\n')).toContain('Bea complies');
    s.scene!.participants = [ANN];
    disciplineDirectives(b, s, reg);
    expect(texts(b, s).join('\n')).not.toContain('Bea complies');
    delete s.scene;
    disciplineDirectives(b, s, reg);
    expect(texts(b, s).join('\n')).not.toContain('Ann');
  });

  it('a pack without command stances leaves the P6 band directive alone', () => {
    const noStances: Registries = { ...reg, commandStances: new Map() };
    const s = sceneState((x) => setRelation(x, ANN, { band: 'wavering' }));
    const b = new ContextBuilder();
    b.setDirective(bandDirective(ANN, 'Ann', 'wavering')!);
    disciplineDirectives(b, s, noStances);
    expect(texts(b, s).join('\n')).toContain('openly doubts');
  });

  it('clearDisciplineDirectives drops the stance, threat and discipline directives and no other', () => {
    const s = sceneState();
    const b = new ContextBuilder();
    disciplineDirectives(b, s, reg);
    b.setDirective({ id: `threat:${ANN}`, text: 'THREAT', expiresAfter: 'next_reply' });
    b.setDirective({ id: `discipline:${ANN}`, text: 'DISCIPLINE', expiresAfter: 'next_reply' });
    b.setDirective({ id: 'world:x', text: 'WORLD', expiresAfter: 'manual' });
    b.setDirective({ id: `refusal:${ANN}`, text: 'REFUSAL', expiresAfter: 'scene' });
    clearDisciplineDirectives(b);
    const out = texts(b, s).join('\n');
    for (const gone of ['THREAT', 'DISCIPLINE', 'Ann ']) expect(out).not.toContain(gone);
    expect(out).toContain('WORLD');
    expect(out).toContain('REFUSAL');
  });

  it('none of the ids starts with world:, stance: or friction: (the world layer clears those)', () => {
    const s = sceneState((x) => withStance(x, reg, ANN, 'fearful'));
    const b = new ContextBuilder();
    disciplineDirectives(b, s, reg);
    for (const id of [`loyalty:${ANN}`, `refusal:${ANN}`, `threat:${ANN}`, `discipline:${ANN}`, 'nickname']) {
      expect(id).not.toMatch(/^(world|stance|friction):/);
    }
  });
});
