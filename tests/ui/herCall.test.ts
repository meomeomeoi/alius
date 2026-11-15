// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { HerCallSpec } from '../../src/content/schemas';
import type { Registries } from '../../src/content/types';
import { rollHerCall } from '../../src/engine/power/herCall';
import { Rng, seedRng } from '../../src/engine/rng';
import type { CampaignState } from '../../src/engine/state/types';
import { ableParty } from '../../src/engine/world/expedition';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { h } from '../../src/ui/dom';
import { renderExpeditionScreen } from '../../src/ui/expedition/expeditionScreen';
import { renderHerCallCard } from '../../src/ui/expedition/herCallCard';
import { renderMissionBoard } from '../../src/ui/ops/missionBoard';
import { herCallChip } from '../../src/ui/power/chips';
import { VOICE_OF } from '../../src/ui/voice/sources';
import type { ExpeditionController } from '../../src/world/expeditionController';
import { withBond } from '../helpers/bonds';
import { depart, withMission } from '../helpers/expedition';
import { campaign, loadCore, run } from '../helpers/loyalty';
import '../helpers/power';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
afterEach(() => {
  document.body.innerHTML = '';
});

const [ANN] = ['unit_ann'];
const T = 'evt_hc_route';
const spec = (): HerCallSpec => reg.dilemmaTemplates.get(T)!.herCall as HerCallSpec;

/** A run whose node n0_0 pins a her-call event; Ann (assertive) acts and it turns out `outcome`. Returns the state at the notice. */
function atNotice(outcome: 'good' | 'bad', o: { source?: 'command' | 'side' } = {}): CampaignState {
  const base = campaign(reg, 4);
  for (const u of base.squad) {
    u.defects = [];
    withBond(base, u.id, { leadStyle: u.id === ANN ? 'assertive' : 'yielding' });
  }
  const { state, mission } = withMission(reg, base, o.source ? { source: o.source } : {});
  const s = structuredClone(depart(reg, state, mission.id));
  s.expedition!.map.nodes.n0_0.type = 'event';
  s.expedition!.map.nodes.n0_0.eventId = T;
  for (let seed = 1; seed < 5000; seed++) {
    s.rng = seedRng(seed);
    const call = rollHerCall(s, reg, new Rng(s.rng), spec(), ableParty(s));
    if (call?.outcome === outcome) break;
  }
  return run(s, reg, { type: 'expedition/move', payload: { nodeId: 'n0_0' } }).state;
}

function fakeController() {
  const c = {
    plan: vi.fn(), planning: vi.fn(() => null), cancelPlan: vi.fn(), launch: vi.fn(() => true), move: vi.fn(), choose: vi.fn(), treat: vi.fn(),
    setFormation: vi.fn(), fight: vi.fn(() => true), afterCombat: vi.fn(), retreat: vi.fn(), return: vi.fn(), requestRecap: vi.fn(async () => {}),
    acknowledge: vi.fn(), ackHerCall: vi.fn(), debrief: vi.fn(async () => true),
  };
  return c as typeof c & ExpeditionController;
}
function mount(state: CampaignState) {
  const controller = fakeController();
  const host = h('div');
  document.body.append(host);
  renderExpeditionScreen(host, { getState: () => state, registries: reg, settings: () => DEFAULT_SETTINGS, controller, onClose: vi.fn() });
  return { host, controller };
}
const buttons = (host: ParentNode) => [...host.querySelectorAll('button')].map((b) => b.textContent);

describe('the notice card', () => {
  it('renders from state alone and has no option buttons', () => {
    const s = atNotice('good');
    const card = renderHerCallCard(s, reg, vi.fn())!;
    expect(card).not.toBeNull();
    expect(card.getAttribute('data-voice')).toBe(VOICE_OF.her_call);
    expect(VOICE_OF.her_call).toBe('personal');
    expect(card.textContent).toContain(String((reg.dilemmaTemplates.get(T)!.fixed as { title: string }).title));
    expect(card.textContent).toContain(`Ann took the decision herself: ${spec().outcomes.find((o) => o.id === 'good')!.text}`);
    expect(buttons(card)).toEqual(['[ ACKNOWLEDGE ]']);
    expect(card.querySelector('[data-option]')).toBeNull();
    // the same on the run view after a reload: only the state is needed
    const m = mount(structuredClone(s));
    expect(m.host.querySelector('[data-her-call]')).not.toBeNull();
    expect(m.host.querySelector('[data-option]')).toBeNull();
    expect(buttons(m.host)).toContain('[ ACKNOWLEDGE ]');
    expect(m.host.textContent).not.toContain('AUTHOR TO WRITE'); // the commander's version of the situation is not shown
  });

  it('no card without a her-call pending', () => {
    const s = atNotice('good');
    delete (s.expedition!.pending as { herCall?: unknown }).herCall;
    expect(renderHerCallCard(s, reg, vi.fn())).toBeNull();
    delete s.expedition!.pending;
    expect(renderHerCallCard(s, reg, vi.fn())).toBeNull();
    expect(renderHerCallCard(campaign(reg, 4), reg, vi.fn())).toBeNull();
  });

  it('ACKNOWLEDGE calls the controller', () => {
    const m = mount(atNotice('bad'));
    const b = [...m.host.querySelectorAll('button')].find((x) => x.textContent === '[ ACKNOWLEDGE ]') as HTMLButtonElement;
    b.click();
    expect(m.controller.ackHerCall).toHaveBeenCalledTimes(1);
    expect(m.controller.acknowledge).not.toHaveBeenCalled(); // that one is the report's
    const onAck = vi.fn();
    (renderHerCallCard(atNotice('good'), reg, onAck)!.querySelector('button') as HTMLButtonElement).click();
    expect(onAck).toHaveBeenCalledTimes(1);
  });

  it('a bad marked call shows the oversight line; a good one does not', () => {
    const LINE = 'Oversight will want a name if this run fails.';
    expect(renderHerCallCard(atNotice('bad'), reg, vi.fn())!.textContent).toContain(LINE);
    expect(renderHerCallCard(atNotice('good'), reg, vi.fn())!.textContent).not.toContain(LINE);
    // a bad call on a side run is not marked: no line
    const side = atNotice('bad', { source: 'side' });
    expect(renderHerCallCard(side, reg, vi.fn())!.textContent).not.toContain(LINE);
  });

  it('the card and its button carry data-analyze', () => {
    const s = atNotice('bad');
    const card = renderHerCallCard(s, reg, vi.fn())!;
    expect(card.getAttribute('data-analyze')).toBe('glossary:her_call');
    expect(JSON.parse(card.getAttribute('data-analyze-ctx')!)).toEqual({ unitId: ANN, nodeId: 'n0_0', missionId: s.expedition!.missionId });
    expect(card.querySelector('button')!.getAttribute('data-analyze')).toBe('glossary:her_call');
  });
});

describe('the ON HER CALL chip', () => {
  it('herCallChip reads the mark: her name, never for a vote mark or no mark', () => {
    const s = atNotice('bad');
    const mission = s.missions.active.find((m) => m.id === s.expedition!.missionId)!;
    const chip = herCallChip(s, mission)!;
    expect(chip.textContent).toBe('ON HER CALL: Ann');
    expect(chip.getAttribute('data-analyze')).toBe('glossary:her_call');
    expect(JSON.parse(chip.getAttribute('data-analyze-ctx')!)).toEqual({ unitId: ANN, missionId: mission.id });
    expect(chip.classList.contains('alius-chip')).toBe(true);
    expect(herCallChip(s, { ...mission, decidedBy: { voteId: 'v1', unitId: ANN } })).toBeNull();
    expect(herCallChip(s, { ...mission, decidedBy: { source: 'vote', voteId: 'v1', unitId: ANN } })).toBeNull();
    const none = { ...mission };
    delete none.decidedBy;
    expect(herCallChip(s, none)).toBeNull();
  });

  it('shows on the run view and on the OPS mission card while the mark stands, never for a vote mark', () => {
    const s = atNotice('bad');
    expect(mount(s).host.querySelector('.alius-chip[data-analyze="glossary:her_call"]')?.textContent).toBe('ON HER CALL: Ann');
    // a good call leaves no mark: no chip on the run view
    expect(mount(atNotice('good')).host.querySelector('.alius-chip[data-analyze="glossary:her_call"]')).toBeNull();
    // a retreat leaves the marked mission on the board with its chip
    const back = run(s, reg, { type: 'expedition/retreat', payload: {} }).state;
    const board = h('div');
    renderMissionBoard(board, back, { registries: reg });
    const card = board.querySelector(`[data-mission-card="${back.missions.offered[0].id}"]`)!;
    expect(card.textContent).toContain('ON HER CALL: Ann');
    expect(card.querySelector('.alius-chip[data-analyze="glossary:her_call"]')).not.toBeNull();
    // a vote's mark shows nothing
    const voted = structuredClone(back);
    voted.missions.offered[0].decidedBy = { voteId: 'v1', unitId: ANN, witnessIds: [] };
    const board2 = h('div');
    renderMissionBoard(board2, voted, { registries: reg });
    expect(board2.textContent).not.toContain('ON HER CALL');
  });
});
