import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import type { CampaignState } from '../../src/engine/state/types';
import { ContextBuilder } from '../../src/llm/context';
import { createDiscipline } from '../../src/discipline/controller';
import type { DisciplineDeps } from '../../src/discipline/deps';
import { nicknameDirective } from '../../src/discipline/directives';
import { campaign, loadCore } from '../helpers/loyalty';
import { worldHarness } from '../helpers/worldApp';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
const ANN = 'unit_ann';
const BEA = 'unit_bea';

function rig(participants: string[], tweak: (s: CampaignState) => void = () => {}) {
  const s = campaign(reg, 4);
  s.day = 20;
  s.commander.reputation = { active: [], pending: { id: 'iron_rule', queuedDay: 19 } };
  tweak(s);
  const h = worldHarness(reg, s, {});
  h.app().dispatch({ type: 'scene/start', payload: { locationId: 'mess_hall', participants, origin: 'event', startIndex: 0 } });
  const ctx = new ContextBuilder();
  const refresh = vi.fn();
  const deps: DisciplineDeps = { ...h.deps, context: ctx, refreshContext: refresh };
  return { h, ctx, discipline: createDiscipline(deps) };
}
const dirs = (r: ReturnType<typeof rig>) => r.ctx.build(r.h.state(), 5000).directives;

describe('nicknameDirective', () => {
  it('words the first time, for the next reply only', () => {
    expect(nicknameDirective('Ann', 'Iron Rule')).toEqual({
      id: 'nickname', expiresAfter: 'next_reply', text: 'Ann calls the commander "Iron Rule" for the first time.',
    });
  });
});

describe('the nickname moment in a scene', () => {
  it('a private scene introduces the pending nickname once, and the directive goes after her reply', () => {
    const r = rig([ANN]);
    r.discipline.onSceneOpened();
    expect(dirs(r)).toContain('Ann calls the commander "Iron Rule" for the first time.');
    const rep = r.h.state().commander.reputation!;
    expect(rep.pending).toBeUndefined();
    expect(rep.active.map((a) => a.id)).toEqual(['iron_rule']);
    r.ctx.onReplyReceived();
    expect(dirs(r)).not.toContain('for the first time');
    r.discipline.onSceneOpened(); // a refresh does not introduce it again
    expect(dirs(r)).not.toContain('for the first time');
  });

  it('a group scene introduces nothing and the nickname stays pending', () => {
    const r = rig([ANN, BEA]);
    r.discipline.onSceneOpened();
    expect(dirs(r)).not.toContain('for the first time');
    expect(r.h.state().commander.reputation!.pending?.id).toBe('iron_rule');
    expect(r.h.state().commander.reputation!.active).toEqual([]);
  });

  it('nothing pending, nothing said', () => {
    const r = rig([ANN], (s) => { s.commander.reputation = { active: [] }; });
    r.discipline.onSceneOpened();
    expect(dirs(r)).not.toContain('for the first time');
  });

  it('an active nickname with its own directive text keeps it for the scenes while active (reputation:<id>)', async () => {
    const withText = { ...reg, reputations: new Map(reg.reputations) } as Registries;
    withText.reputations.set('iron_rule', { ...reg.reputations.get('iron_rule')!, effects: { ...(reg.reputations.get('iron_rule')!.effects as object), directive: 'The squad treats punishments as routine.' } });
    const s = campaign(reg, 4);
    s.day = 20;
    s.commander.reputation = { active: [{ id: 'iron_rule', name: 'Iron Rule', sinceDay: 3 }] };
    const h = worldHarness(withText, s, {});
    h.app().dispatch({ type: 'scene/start', payload: { locationId: 'mess_hall', participants: [ANN], origin: 'event', startIndex: 0 } });
    const ctx = new ContextBuilder();
    const d = createDiscipline({ ...h.deps, context: ctx, refreshContext: vi.fn() });
    d.onSceneOpened();
    expect(ctx.build(h.state(), 5000).directives).toContain('The squad treats punishments as routine.');
    d.onSceneClosed();
    expect(ctx.build(h.state(), 5000).directives).toBe('');
  });

  it('closing the scene clears the nickname directive', () => {
    const r = rig([ANN]);
    r.discipline.onSceneOpened();
    r.discipline.onSceneClosed();
    expect(dirs(r)).toBe('');
  });
});
