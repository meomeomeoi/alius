// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AnalyzeEnv } from '../../src/analysis/model';
import { registerCoreProviders } from '../../src/analysis/providers/core';
import type { Registries } from '../../src/content/types';
import { openDemand } from '../../src/engine/discipline/demands';
import { Rng } from '../../src/engine/rng';
import type { CampaignState } from '../../src/engine/state/types';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { drawDemandChips } from '../../src/ui/discipline/chips';
import { h } from '../../src/ui/dom';
import { renderSceneScreen } from '../../src/ui/scene/sceneScreen';
import { renderCommsTab } from '../../src/ui/comms/commsTab';
import { FakeStAdapter } from '../../src/st/fake';
import type { SceneController } from '../../src/scene/sceneController';
import { campaign, loadCore, run } from '../helpers/world';
import { markedWithout, unreachable, unresolved } from '../helpers/analyzeCoverage';
import '../../src/engine/actions/discipline';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
});
afterEach(() => {
  document.body.innerHTML = '';
});
const ANN = 'unit_ann';
const BEA = 'unit_bea';
const only = (id: string): Registries => ({ ...reg, demandTemplates: new Map([[id, reg.demandTemplates.get(id)!]]) });

/** A campaign with one open demand of `tpl` for `unit`. */
function withDemand(tpl = 'double_ration', opts: { owed?: boolean; unit?: string; mutate?: (s: CampaignState) => void } = {}): CampaignState {
  const s = campaign(reg, 4);
  s.day = 20;
  s.resources = { credits: 100, supplies: 10, plyx: 0 };
  opts.mutate?.(s);
  const r = openDemand(s, { registries: only(tpl), rng: new Rng(s.rng) }, opts.unit ?? ANN, { owed: opts.owed })!;
  const demand = s.discipline!.demands.find((d) => d.id === r.demand.id)!;
  demand.status = 'open';
  return s;
}
const draw = (s: CampaignState, pick: Parameters<typeof drawDemandChips>[3] = () => true, on: Partial<Parameters<typeof drawDemandChips>[4]> = {}) => {
  const handlers = { grant: vi.fn(), refuse: vi.fn(), talk: vi.fn(), ...on };
  const host = h('div');
  document.body.append(host);
  drawDemandChips(host, s, reg, pick, handlers as never);
  return { host, handlers, btn: (kind: string) => host.querySelector<HTMLButtonElement>(`button[data-demand-answer="${kind}"]`) };
};

describe('demand chips', () => {
  it('the label, the three buttons and an analyzable address', () => {
    const s = withDemand();
    const { host, btn } = draw(s);
    const label = host.querySelector<HTMLElement>('.alius-chip[data-demand]')!;
    expect(label.textContent).toBe(`ANN DEMANDS: ${s.discipline!.demands[0].text}`);
    expect(label.getAttribute('data-analyze')).toBe('demandTemplates:double_ration');
    expect(JSON.parse(label.getAttribute('data-analyze-ctx')!)).toEqual({ unitId: ANN });
    expect(['grant', 'refuse', 'talk'].map((k) => btn(k)?.textContent)).toEqual(['[GRANT]', '[REFUSE]', '[TALK]']);
    expect(host.querySelector('[data-owed]')).toBeNull();
    const env: AnalyzeEnv = { registries: reg, state: s, settings: DEFAULT_SETTINGS };
    expect(unresolved(host, env)).toEqual([]);
    expect(markedWithout(host)).toEqual([]);
    expect(unreachable(host)).toEqual([]);
  });

  it('an owed demand carries the OWED mark', () => {
    const { host } = draw(withDemand('double_ration', { owed: true }));
    const mark = host.querySelector<HTMLElement>('.alius-chip[data-owed]')!;
    expect(mark.textContent).toBe('OWED');
    expect(mark.getAttribute('data-analyze')).toBe('glossary:owed_demand');
  });

  it('the buttons call their handlers with the demand id', () => {
    const s = withDemand();
    const id = s.discipline!.demands[0].id;
    const { btn, handlers } = draw(s);
    btn('grant')!.click();
    btn('refuse')!.click();
    btn('talk')!.click();
    expect(handlers.grant).toHaveBeenCalledWith(id);
    expect(handlers.refuse).toHaveBeenCalledWith(id);
    expect(handlers.talk).toHaveBeenCalledWith(id);
  });

  it('[GRANT] is soft-disabled with the reason and inert when the cost cannot be paid', () => {
    const s = withDemand('double_ration', { mutate: (x) => { x.resources.supplies = 1; } });
    const { btn, handlers } = draw(s);
    expect(btn('grant')!.getAttribute('aria-disabled')).toBe('true');
    expect(btn('grant')!.getAttribute('title')).toBe('Not enough supplies (needs 2).');
    btn('grant')!.click();
    expect(handlers.grant).not.toHaveBeenCalled();
    btn('refuse')!.click();
    expect(handlers.refuse).toHaveBeenCalled(); // she can still be refused
  });

  it('[TALK] is absent inside a scene (no talk handler)', () => {
    const { btn } = draw(withDemand(), () => true, { talk: undefined });
    expect(btn('talk')).toBeNull();
    expect(btn('grant')).not.toBeNull();
  });

  it('an undelivered demand is not shown yet; a delivered one is, after a reload too', () => {
    const s = withDemand();
    s.discipline!.demands[0].status = 'undelivered';
    expect(draw(s).host.querySelector('[data-demand]')).toBeNull();
    s.discipline!.demands[0].status = 'open';
    const again = draw(JSON.parse(JSON.stringify(s)) as CampaignState);
    expect(again.host.querySelector('[data-demand]')).not.toBeNull();
  });

  it('the pick chooses whose demands are drawn', () => {
    const s = withDemand();
    expect(draw(s, (c) => c.unitId === BEA).host.querySelector('[data-demand]')).toBeNull();
  });

  it('text is set as text, never as markup', () => {
    const s = withDemand();
    s.discipline!.demands[0].text = '<img src=x onerror=1>';
    const { host } = draw(s);
    expect(host.querySelector('img')).toBeNull();
    expect(host.textContent).toContain('<img src=x onerror=1>');
  });
});

describe('where the chips are drawn', () => {
  it('the scene draws the demands of its participants, without TALK', () => {
    const s = run(withDemand(), reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: [ANN], origin: 'event', startIndex: 0 } }).state;
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    const controller = { send: vi.fn(), propose: vi.fn(), answer: vi.fn(), end: vi.fn(async () => {}), edit: vi.fn(), stop: vi.fn(), onEdited: vi.fn(), transcript: () => [], onSwipe: vi.fn() } as unknown as SceneController;
    const onGrantDemand = vi.fn();
    const host = h('div');
    document.body.append(host);
    renderSceneScreen(host, { controller, getState: () => s, registries: reg, st, settings: () => ({ ...DEFAULT_SETTINGS, typingSpeed: 0 }), onEnded: vi.fn(), onAnswerDemand: onGrantDemand });
    expect(host.querySelector('.alius-chip[data-demand]')).not.toBeNull();
    expect(host.querySelector('button[data-demand-answer="talk"]')).toBeNull();
    host.querySelector<HTMLButtonElement>('button[data-demand-answer="refuse"]')!.click();
    expect(onGrantDemand).toHaveBeenCalledWith(s.discipline!.demands[0].id, 'refuse');
  });

  it("the unit's COMMS thread draws its demand with TALK, another thread does not", () => {
    const s = withDemand();
    const onAnswerDemand = vi.fn();
    const onTalkDemand = vi.fn();
    const host = h('div');
    document.body.append(host);
    renderCommsTab(host, { getState: () => s, registries: reg, onSend: vi.fn(), onRead: vi.fn(), onAnswer: vi.fn(), onAnswerDemand, onTalkDemand });
    host.querySelector<HTMLElement>(`button[data-unit="${ANN}"]`)!.click();
    expect(host.querySelector('.alius-thread .alius-chip[data-demand]')).not.toBeNull();
    host.querySelector<HTMLButtonElement>('button[data-demand-answer="talk"]')!.click();
    expect(onTalkDemand).toHaveBeenCalledWith(s.discipline!.demands[0].id);
    host.querySelector<HTMLElement>(`button[data-unit="${BEA}"]`)!.click();
    expect(host.querySelector('.alius-thread [data-demand]')).toBeNull();
  });
});

describe('desire demand chips (P9d)', () => {
  it('read SATISFY / POSTPONE / TALK with data-analyze and call the same handlers', () => {
    const s = withDemand('double_ration');
    s.discipline!.demands[0].templateId = 'want_tonight';
    const d = draw(s);
    expect(['grant', 'refuse', 'talk'].map((k) => d.btn(k)!.textContent)).toEqual(['[SATISFY]', '[POSTPONE]', '[TALK]']);
    for (const k of ['grant', 'refuse', 'talk']) expect(d.btn(k)!.getAttribute('data-analyze'), k).toBe('glossary:want');
    d.btn('grant')!.click();
    d.btn('refuse')!.click();
    expect(d.handlers.grant).toHaveBeenCalledTimes(1);
    expect(d.handlers.refuse).toHaveBeenCalledTimes(1);
  });

  it('an ordinary demand keeps GRANT / REFUSE', () => {
    const d = draw(withDemand('double_ration'));
    expect([d.btn('grant')!.textContent, d.btn('refuse')!.textContent]).toEqual(['[GRANT]', '[REFUSE]']);
  });
});
