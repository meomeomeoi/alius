// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import { setRecord } from '../helpers/discipline';
import type { CampaignState } from '../../src/engine/state/types';
import { h } from '../../src/ui/dom';
import { drawDisciplineChips } from '../../src/ui/discipline/chips';
import { campaign, errors, loadCore, run } from '../helpers/world';
import '../../src/engine/actions/discipline';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
afterEach(() => {
  document.body.innerHTML = '';
});
const [ANN, BEA] = ['unit_ann', 'unit_bea'];
const ev = (type: string, over: Record<string, unknown> = {}) => ({
  type, actor: 'commander', targets: [ANN], severity: 'moderate', evidence: 'a quote', confidence: 0.9, measure: 'revoke_rations', ...over,
});
const inScene = (s: CampaignState, ids = [ANN]): CampaignState =>
  run(s, reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: ids, origin: 'event', startIndex: 0 } }).state;
const read = (s: CampaignState, events: unknown[], channel: 'scene' | 'dm' = 'scene', unit = ANN) => {
  const r = run(s, reg, { type: 'intents/apply', payload: channel === 'scene' ? { channel, intents: { events } } : { channel, unitId: unit, intents: { events } } });
  expect(errors(r.events)).toEqual([]);
  return r.state;
};
const draw = (state: CampaignState, pick: Parameters<typeof drawDisciplineChips>[3] = () => true, onUndo: (id: string) => void = () => {}) => {
  const host = h('div');
  document.body.append(host);
  drawDisciplineChips(host, state, reg, pick, onUndo);
  return { host, groups: [...host.querySelectorAll<HTMLElement>('.alius-chip-group')], undo: [...host.querySelectorAll<HTMLButtonElement>('button[data-undo]')] };
};

describe('DISCIPLINE LOGGED', () => {
  it('a dialogue punishment draws the label and an UNDO button', () => {
    const s = read(inScene(campaign(reg, 4)), [ev('commander_enforced')]);
    const { groups, undo } = draw(s);
    expect(groups).toHaveLength(1);
    const label = groups[0].querySelector<HTMLElement>('.alius-chip')!;
    expect(label.textContent).toBe('DISCIPLINE LOGGED — Rations revoked (Ann)');
    expect(label.getAttribute('data-analyze')).toBe('glossary:discipline_logged');
    expect(JSON.parse(label.getAttribute('data-analyze-ctx')!)).toEqual({ unitId: ANN });
    expect(undo).toHaveLength(1);
    expect(undo[0].textContent).toBe('[ UNDO — not what I meant ]');
    expect(undo[0].classList.contains('alius-tagchip')).toBe(true);
    expect(undo[0].dataset.undo).toBe(s.discipline!.applications[0].id);
  });

  it('a menu punishment draws no chip', () => {
    const s = run(campaign(reg, 4), reg, { type: 'discipline/punish', payload: { unitId: ANN, measure: 'revoke_rations' } }).state;
    expect(draw(s).groups).toEqual([]);
  });

  it('clicking UNDO calls onUndo with the id, and the chip is gone after the engine has undone it', () => {
    const s = read(inScene(campaign(reg, 4)), [ev('commander_enforced')]);
    const id = s.discipline!.applications[0].id;
    const onUndo = vi.fn();
    const { undo } = draw(s, () => true, onUndo);
    undo[0].click();
    expect(onUndo).toHaveBeenCalledWith(id);
    const undone = run(s, reg, { type: 'discipline/undo', payload: { id } }).state;
    expect(draw(undone).groups).toEqual([]);
  });

  it('chips are drawn from the state again after a reload (a JSON round trip)', () => {
    const s = read(inScene(campaign(reg, 4)), [ev('commander_enforced'), ev('threatened', { measure: 'brig' })]);
    const before = draw(s).host.textContent;
    const after = draw(JSON.parse(JSON.stringify(s)) as CampaignState).host.textContent;
    expect(after).toBe(before);
    expect(after).toContain('DISCIPLINE LOGGED');
    expect(after).toContain('THREAT REGISTERED');
  });

  it('UNDO is drawn only while the engine would accept it: not on a later day, not after the scene', () => {
    const s = read(inScene(campaign(reg, 4)), [ev('commander_enforced')]);
    expect(draw({ ...s, day: s.day + 1 }).undo).toEqual([]);
    const ended = run(s, reg, { type: 'scene/end' }).state;
    expect(draw(ended).undo).toEqual([]);
  });

  it('only chips of today are drawn for punishments (a thread does not collect last week)', () => {
    const s = read(inScene(campaign(reg, 4)), [ev('commander_enforced')]);
    expect(draw({ ...s, day: s.day + 1 }).groups).toEqual([]);
  });

  it('text is set as text, never as markup', () => {
    const s = read(inScene(campaign(reg, 4)), [ev('commander_enforced')]);
    s.squad[0].displayName = '<b>Ann</b>';
    const { host } = draw(s);
    expect(host.querySelector('b')).toBeNull();
    expect(host.textContent).toContain('(<b>Ann</b>)');
  });
});

describe('THREAT REGISTERED', () => {
  const threat = (record: number): CampaignState => read(inScene(setRecord(campaign(reg, 4), ANN, record)), [ev('threatened', { measure: 'brig' })]);

  it('a believed threat reads She believes it, an unbelieved one She doesn\'t buy it', () => {
    expect(draw(threat(-40)).groups[0].textContent).toContain('THREAT REGISTERED — Brig (Ann) · She believes it');
    expect(draw(threat(40)).groups[0].textContent).toContain("THREAT REGISTERED — Brig (Ann) · She doesn't buy it");
  });

  it('the label is analyzable as glossary:threat and the UNDO button carries the threat id', () => {
    const s = threat(0);
    const { groups, undo } = draw(s);
    expect(groups[0].querySelector('.alius-chip')!.getAttribute('data-analyze')).toBe('glossary:threat');
    expect(undo[0].dataset.undo).toBe(s.discipline!.threats[0].id);
  });

  it('an unspecified or lost measure reads Consequences', () => {
    const s = read(inScene(campaign(reg, 4)), [ev('threatened', { measure: 'unspecified' })]);
    expect(draw(s).groups[0].textContent).toContain('Consequences (Ann)');
  });

  it('a lapsed threat is gone', () => {
    const s = threat(0);
    s.discipline!.threats = [];
    expect(draw(s).groups).toEqual([]);
  });
});

describe('what a place draws', () => {
  it('the scene draws only chips of its participants and its own scene', () => {
    const s = read(inScene(campaign(reg, 4), [ANN, BEA]), [ev('commander_enforced'), ev('commander_enforced', { targets: [BEA], measure: 'verbal' })]);
    const ids = new Set(s.scene!.participants);
    const all = draw(s, (c) => c.channel === 'scene' && ids.has(c.unitId) && c.sceneId === s.scene!.id);
    expect(all.groups).toHaveLength(2);
    expect(draw(s, (c) => c.channel === 'scene' && c.unitId === BEA).groups).toHaveLength(1);
    expect(draw(s, (c) => c.channel === 'dm').groups).toEqual([]);
  });

  it('a COMMS thread draws only its unit\'s dm chips', () => {
    let s = read(campaign(reg, 4), [ev('commander_enforced')], 'dm', ANN);
    s = read(s, [ev('threatened', { targets: [BEA], measure: 'brig' })], 'dm', BEA);
    expect(draw(s, (c) => c.channel === 'dm' && c.unitId === ANN).groups).toHaveLength(1);
    expect(draw(s, (c) => c.channel === 'dm' && c.unitId === BEA).groups[0].textContent).toContain('THREAT REGISTERED');
  });

  it('an empty state draws nothing and clears the host', () => {
    const host = h('div', {}, 'old');
    drawDisciplineChips(host, campaign(reg, 4), reg, () => true, () => {});
    expect(host.textContent).toBe('');
  });
});
