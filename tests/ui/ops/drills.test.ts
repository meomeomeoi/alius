// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/craft';
import type { CampaignState } from '../../../src/engine/state/types';
import { activityCard, type OpsTabCtx } from '../../../src/ui/ops/opsTab';
import { campaign, loadCore } from '../../helpers/world';
import { ANN, world } from '../../engine/craft/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
afterEach(() => { document.body.innerHTML = ''; });

const card = (s: CampaignState, onDo = vi.fn()) => {
  s.slot = 'morning';
  const el = activityCard(reg.activities.get('train')!, s, { registries: reg, onDo } as unknown as OpsTabCtx);
  document.body.append(el);
  return { el, onDo, btn: el.querySelector<HTMLButtonElement>('button[data-do]')!, focus: () => el.querySelector<HTMLSelectElement>('select[name="focus"]'), partner: () => el.querySelector<HTMLSelectElement>('select[name="partner-drill"]'), companion: el.querySelector<HTMLSelectElement>('select[name="companion"]')! };
};
const change = (el: HTMLSelectElement, value: string) => { el.value = value; el.dispatchEvent(new Event('change', { bubbles: true })); };
const values = (sel: HTMLSelectElement | null) => [...(sel?.querySelectorAll('option') ?? [])].map((o) => o.value);

describe('the drills in the OPS tab', () => {
  it('with a holder running the craft every drill is listed, and the select carries the drill gloss', () => {
    const c = card(world(reg, 'play'));
    expect(values(c.focus())).toEqual(expect.arrayContaining(['endurance_breath', 'endurance_weight', 'endurance_jaw', 'drill_stillness', 'drill_recitation', 'drill_rhythm', 'drill_posture']));
    expect(c.focus()!.getAttribute('data-analyze')).toBe('glossary:craft_drill');
    expect(c.focus()!.querySelector('[data-analyze]')).toBeNull(); // the select carries it: an option cannot be reached
  });

  it('with nobody running it only the three endurance drills of P15a are listed,', () => {
    const c = card(campaign(reg, 4));
    expect(values(c.focus())).toEqual(['units', 'commander', 'body_strength', 'body_endurance', 'body_reflexes', 'endurance_breath', 'endurance_weight', 'endurance_jaw']);
    expect(c.partner()).toBeNull();
  });

  it('picking a companion hides the focus and offers the drills that take a partner', () => {
    const c = card(world(reg, 'play'));
    change(c.companion, ANN);
    expect(c.focus()).toBeNull();
    expect(values(c.partner())).toEqual(['', 'endurance_breath', 'endurance_weight', 'drill_posture']);
    expect(c.partner()!.getAttribute('data-analyze')).toBe('glossary:craft_drill');
    c.btn.click();
    expect(c.onDo).toHaveBeenLastCalledWith({ activityId: 'train', companionId: ANN });
    change(c.partner()!, 'endurance_weight');
    c.btn.click();
    expect(c.onDo).toHaveBeenLastCalledWith({ activityId: 'train', companionId: ANN, focus: 'endurance_weight' });
  });

  it('with nobody running the craft a companion gets no drill to share (P2 as it was)', () => {
    const c = card(campaign(reg, 4));
    change(c.companion, 'unit_ann');
    expect(c.partner()).toBeNull();
    c.btn.click();
    expect(c.onDo).toHaveBeenLastCalledWith({ activityId: 'train', companionId: 'unit_ann' });
  });

  it('the button is off for a drill already done today', () => {
    const s = world(reg, 'play');
    s.commander.endurance = { breath: { xp: 15, level: 0, trainedDay: s.day } };
    const c = card(s);
    change(c.focus()!, 'endurance_breath');
    expect(c.btn.disabled).toBe(true);
    change(c.focus()!, 'drill_stillness');
    expect(c.btn.disabled).toBe(false);
  });
});
