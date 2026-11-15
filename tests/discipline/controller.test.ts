import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import type { EngineEvent } from '../../src/engine/dispatch';
import type { CampaignState } from '../../src/engine/state/types';
import { ContextBuilder } from '../../src/llm/context';
import { createDiscipline } from '../../src/discipline/controller';
import type { DisciplineDeps } from '../../src/discipline/deps';
import { campaign, loadCore } from '../helpers/loyalty';
import { setRecord } from '../helpers/discipline';
import { withOptions } from '../helpers/power';
import { worldHarness, type WorldHarness } from '../helpers/worldApp';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
const ANN = 'unit_ann';

interface Rig { h: WorldHarness; ctx: ContextBuilder; refresh: ReturnType<typeof vi.fn>; discipline: ReturnType<typeof createDiscipline> }
function rig(tweak: (s: CampaignState) => void = () => {}, debug = false): Rig {
  const s = campaign(reg, 4);
  s.day = 3;
  tweak(s);
  const h = worldHarness(reg, s, { debug });
  h.app().dispatch({ type: 'scene/start', payload: { locationId: 'mess_hall', participants: [ANN], origin: 'event', startIndex: 0 } });
  const ctx = new ContextBuilder();
  const refresh = vi.fn();
  const deps: DisciplineDeps = { ...h.deps, context: ctx, refreshContext: refresh };
  return { h, ctx, refresh, discipline: createDiscipline(deps) };
}
const dirs = (r: Rig) => r.ctx.build(r.h.state(), 5000).directives;
const threaten = (r: Rig, measure = 'unspecified'): EngineEvent[] => r.h.app().dispatch({
  type: 'intents/apply',
  payload: { channel: 'scene', intents: { events: [{ type: 'threatened', actor: 'commander', targets: [ANN], severity: 'moderate', evidence: 'or else', confidence: 0.9, measure }] } },
});

describe('threat directives', () => {
  it('a believed and an unbelieved threat give the two texts', () => {
    const cowed = rig((s) => setRecord(s, ANN, -40));
    cowed.discipline.onEvents(threaten(cowed));
    expect(dirs(cowed)).toContain("Ann believes the commander's threat (Consequences) will be carried out.");
    expect(cowed.refresh).toHaveBeenCalled();
    const bold = rig((s) => setRecord(s, ANN, 40));
    bold.discipline.onEvents(threaten(bold));
    expect(dirs(bold)).toContain("Ann does not believe the commander's threat (Consequences) will be carried out, and it shows.");
  });

  it('a threat read from a DM sets no scene directive', () => {
    const r = rig();
    r.discipline.onEvents([{ type: 'threat_registered', threatId: 'th1', unitId: ANN, measure: 'brig', believed: true, channel: 'dm' }]);
    expect(dirs(r)).toBe('');
    expect(r.refresh).not.toHaveBeenCalled();
  });

  it('the directive lasts for one reply', () => {
    const r = rig();
    r.discipline.onEvents(threaten(r, 'leash'));
    expect(dirs(r)).toContain('(The Leash)');
    r.ctx.onReplyReceived();
    expect(dirs(r)).not.toContain('threat');
  });

  it('events without a threat change nothing and do not refresh', () => {
    const r = rig();
    r.discipline.onEvents([{ type: 'scene_exchange' }, { type: 'relation_changed' }]);
    expect(r.refresh).not.toHaveBeenCalled();
    expect(dirs(r)).toBe('');
  });
});

describe('toasts', () => {
  it('a lapsed threat tells the player the squad saw the commander back down', () => {
    const r = rig();
    r.discipline.onEvents([{ type: 'threat_lapsed', threatId: 'th1', unitId: ANN, measure: 'unspecified' }]);
    expect(r.h.toasts).toEqual([{ kind: 'info', text: 'A threat lapsed: Ann saw the commander back down.' }]);
  });

  it('covert sabotage is only mentioned in debug mode', () => {
    const quiet = rig();
    quiet.discipline.onEvents([{ type: 'covert_sabotage', kind: 'supplies' }]);
    expect(quiet.h.toasts).toEqual([]);
    const loud = rig(() => {}, true);
    loud.discipline.onEvents([{ type: 'covert_sabotage', kind: 'supplies' }]);
    expect(loud.h.toasts).toHaveLength(1);
    expect(loud.h.toasts[0].text).toContain('supplies');
  });
});

describe('scene lifecycle', () => {
  it('opening a scene sets the stance directives; closing clears them and the threat one', () => {
    const r = rig();
    r.discipline.onSceneOpened();
    expect(dirs(r)).toContain('Ann complies in silence'); // a fresh unit: Trust 20, Impunity 43 → fearful
    r.discipline.onEvents(threaten(r));
    r.discipline.onSceneClosed();
    expect(dirs(r)).toBe('');
    expect(r.refresh).toHaveBeenCalled();
  });

  it('no open scene: opening sets nothing', () => {
    const s = campaign(reg, 4);
    const h = worldHarness(reg, s);
    const ctx = new ContextBuilder();
    const d = createDiscipline({ ...h.deps, context: ctx, refreshContext: vi.fn() });
    d.onSceneOpened();
    expect(ctx.build(h.state(), 5000).directives).toBe('');
  });
});

describe('punish and undo (P9)', () => {
  const BEA = 'unit_bea';
  it('a menu punishment in a scene sets the reply directive for her next reply', () => {
    const r = rig();
    expect(r.discipline.punish(ANN, 'brig', 2)).toBe(true);
    expect(dirs(r)).toContain('The commander has imposed Brig on Ann. React in character; stance: Fearful.');
    expect(r.refresh).toHaveBeenCalled();
    expect(r.h.state().discipline!.applications[0]).toMatchObject({ source: 'menu', channel: 'scene' });
    r.ctx.onReplyReceived();
    expect(dirs(r)).not.toContain('imposed');
  });

  it('the directive names the stance she is in after the punishment', () => {
    const r = rig((s) => { s.relations[ANN].trust = 60; setRecord(s, ANN, 20); }); // trusting and bold
    r.discipline.punish(ANN, 'verbal');
    expect(dirs(r)).toMatch(/stance: (Disciplined|Defiant-loyal|Indifferent)\./);
  });

  it('outside a scene it sets none and toasts', () => {
    const r = rig();
    expect(r.discipline.punish(BEA, 'revoke_rations')).toBe(true);
    expect(dirs(r)).toBe('');
    expect(r.h.toasts).toEqual([{ kind: 'info', text: 'The commander imposed Rations revoked on Bea.' }]);
    expect(r.h.state().discipline!.applications[0].channel).toBe('pda');
  });

  it('a punishment the engine refuses toasts the reason and changes nothing', () => {
    const r = rig();
    expect(r.discipline.punish(ANN, 'verbal')).toBe(true);
    const before = r.h.state();
    expect(r.discipline.punish(ANN, 'verbal')).toBe(false);
    expect(r.h.state()).toBe(before);
    expect(r.h.toasts.at(-1)).toEqual({ kind: 'error', text: 'Ann was already given Reprimand today.' });
    expect(r.discipline.punish(ANN, 'guillotine')).toBe(false);
  });

  it('undo reverts a dialogue punishment, clears the directive and says so', () => {
    const r = rig();
    r.h.app().dispatch({ type: 'intents/apply', payload: { channel: 'scene', messageRef: 'chat:3', intents: { events: [{ type: 'commander_enforced', actor: 'commander', targets: [ANN], severity: 'moderate', evidence: 'x', confidence: 0.9, measure: 'revoke_rations' }] } } });
    const app = r.h.state().discipline!.applications[0];
    r.ctx.setDirective({ id: `discipline:${ANN}`, text: 'PUNISH TEXT', expiresAfter: 'next_reply' });
    r.ctx.setDirective({ id: `threat:${ANN}`, text: 'THREAT TEXT', expiresAfter: 'next_reply' });
    expect(r.discipline.undo(app.id)).toBe(true);
    expect(r.h.state().discipline).toBeUndefined();
    expect(dirs(r)).not.toContain('PUNISH TEXT');
    expect(r.h.toasts.at(-1)).toEqual({ kind: 'info', text: 'Undone.' });
  });

  it('undoing a threat also drops its directive', () => {
    const r = rig();
    r.discipline.onEvents(threaten(r, 'brig'));
    const id = r.h.state().discipline!.threats[0].id;
    expect(dirs(r)).toContain('threat');
    expect(r.discipline.undo(id)).toBe(true);
    expect(dirs(r)).not.toContain('(Brig)');
    expect(r.h.state().discipline?.threats ?? []).toEqual([]);
  });

  it('an undo the engine refuses toasts the reason', () => {
    const r = rig();
    r.discipline.punish(ANN, 'verbal'); // a menu punishment
    expect(r.discipline.undo(r.h.state().discipline!.applications[0].id)).toBe(false);
    expect(r.h.toasts.at(-1)).toEqual({ kind: 'error', text: 'Only a punishment read from dialogue can be undone.' });
    expect(r.discipline.undo('ap999')).toBe(false);
  });
});


describe('a menu punishment under squad votes (P9b)', () => {
  it('a gated measure goes to requestVote, the toast of the vote is not an error, and the directive follows once it ran', async () => {
    const asked: unknown[] = [];
    const s = rig((st) => { withOptions(st, { voting: 'on' }); });
    const deps: DisciplineDeps = {
      ...s.h.deps, context: s.ctx, refreshContext: s.refresh,
      requestVote: async (a) => { asked.push(a); s.h.app().dispatch({ type: 'vote/open', payload: { kind: 'punish', subject: ANN } }); s.h.app().dispatch({ type: 'vote/overrule', payload: { voteId: 'v1', means: 'order' } }); return s.h.app().dispatch({ ...a, payload: { ...(a.payload as object), voteId: 'v1' } }).some((e) => e.type === 'error') ? 'cancelled' : 'ran'; },
    };
    const discipline = createDiscipline(deps);
    expect(discipline.punish(ANN, 'verbal')).toBe(false); // not yet: the vote decides
    await new Promise((r) => setTimeout(r, 0));
    expect(s.h.toasts.filter((t) => t.kind === 'error')).toEqual([]);
    expect(asked).toEqual([{ type: 'discipline/punish', payload: { unitId: ANN, measure: 'verbal' } }]);
    expect(s.h.state().discipline!.applications.map((a) => a.measure)).toEqual(['verbal']);
    expect(dirs(s)).toContain('The commander has imposed');
  });

  it('without requestVote the refusal is toasted', () => {
    const s = rig((st) => { withOptions(st, { voting: 'on' }); });
    expect(s.discipline.punish(ANN, 'verbal')).toBe(false);
    expect(s.h.toasts.at(-1)).toMatchObject({ kind: 'error' });
  });
});
