// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../../src/content/types';
import type { CampaignState } from '../../../src/engine/state/types';
import { getSettings, updateSettings } from '../../../src/settings';
import { FakeStAdapter } from '../../../src/st/fake';
import { h } from '../../../src/ui/dom';
import { createArtSlots, MANIFEST_KEYS } from '../../../src/ui/scene/art';
import { loadStageFolders, type StageFolder } from '../../../src/ui/stage/load';
import { renderStageSection, type StageCtx } from '../../../src/ui/stage/section';
import { SLOT_INFO, SLOT_KEYS, slotState } from '../../../src/ui/stage/slots';
import { campaign, loadCore } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
afterEach(() => { document.body.innerHTML = ''; });

const json = (v: unknown) => new Blob([JSON.stringify(v)], { type: 'application/json' });
const img = () => new Blob(['x'], { type: 'image/png' });
const flush = () => new Promise((r) => setTimeout(r, 0));

async function setup(state: CampaignState | null, fill?: (st: FakeStAdapter) => void) {
  const st = new FakeStAdapter({ chatId: 'c1', isGroup: true, groupId: 'g' });
  fill?.(st);
  let current = state;
  let folders = new Map<string, StageFolder>();
  const units = (current?.squad ?? []).map((u) => ({ id: u.id, cardRef: u.cardRef }));
  folders = await loadStageFolders(st, units);
  const opened: string[] = [];
  const ctx: StageCtx = {
    st, getState: () => current, getRegistries: () => reg,
    art: () => createArtSlots(null, (p) => p, (id) => current?.squad.find((u) => u.id === id)?.cardRef ?? null, folders),
    folders: () => folders,
    openSheet: (id) => opened.push(id),
    settings: () => getSettings(st),
    refresh: async () => {}, toast: vi.fn(), modal: async () => null,
  };
  const host = h('div');
  document.body.append(host);
  renderStageSection(host, ctx);
  await flush();
  return { st, ctx, host, opened, set: (s: CampaignState | null) => { current = s; } };
}

describe('SYS › STAGE: her list and every slot (P10e-f)', () => {
  it('lists each living named woman with her sprites found or missing and n / 11, n / 12 with the explicit slot', async () => {
    const s = campaign(reg, 3);
    s.squad[2].status = 'dead';
    const [ann, bea] = s.squad;
    const { host, st, ctx } = await setup(s, (st) => {
      st.sprites.set(`${ann.cardRef}:neutral`, '/a/neutral.png');
      st.stageFiles.set(ann.cardRef!, new Map(Object.entries({ 'over.png': img(), 'over_explicit.png': img(), 'face_close.webp': img() })));
    });
    const rows = [...host.querySelectorAll<HTMLElement>('.alius-stage-woman')];
    expect(rows.map((r) => r.dataset.unit)).toEqual([ann.id, bea.id]); // the dead one is not listed
    expect(rows[0].querySelector('.alius-stage-sprites')!.textContent).toContain('found');
    expect(rows[1].querySelector('.alius-stage-sprites')!.textContent).toContain('missing');
    expect(rows[0].querySelector('.alius-stage-filled')!.textContent).toBe('2 / 11');
    expect(rows[1].querySelector('.alius-stage-filled')!.textContent).toBe('0 / 11');
    updateSettings(st, { showExplicitSlots: true });
    renderStageSection(host, ctx);
    await flush();
    expect(host.querySelector<HTMLElement>(`.alius-stage-woman[data-unit="${ann.id}"] .alius-stage-filled`)!.textContent).toBe('3 / 12');
  });

  it('the table has one row per woman and one column per slot key, each cell its state word and marked', async () => {
    const s = campaign(reg, 2);
    const ann = s.squad[0];
    const { host } = await setup(s, (st) => {
      st.stageFiles.set(ann.cardRef!, new Map(Object.entries({
        'over.png': img(), 'over.fit.json': json({ fit: { height: 1, x: 0.5, sink: 0.02 } }),
        'sole_close.png': img(), 'sole_close.fit.json': json({ fit: { height: 0.6 }, zones: { toes: [0.5, 0.2] } }),
        'shoe_close.boots.png': img(), 'shoe_close.boots.fit.json': json({ feet: 'two' }),
        'face_close.png': img(),
      })));
    });
    const body = [...host.querySelectorAll('tbody tr')];
    expect(body).toHaveLength(2);
    const keys = SLOT_KEYS.filter((k) => k !== 'over_explicit');
    expect([...host.querySelectorAll<HTMLElement>('thead th[data-slot]')].map((t) => t.dataset.slot)).toEqual(keys);
    const cell = (k: string) => body[0].querySelector<HTMLElement>(`td[data-slot="${k}"]`)!;
    expect(cell('over').textContent).toBe('fitted');
    expect(cell('sole_close').textContent).toBe('zoned');
    expect(cell('shoe_close.boots').textContent).toBe('fitted'); // feet said: fitted
    expect(cell('face_close').textContent).toBe('picture');
    expect(cell('feet_floor').textContent).toBe('—');
    for (const td of host.querySelectorAll('td')) expect(td.getAttribute('data-analyze')).toBe('glossary:stage_slot_state');
    expect(body[1].querySelectorAll('td')).toHaveLength(keys.length);
  });

  it('over_explicit is listed only with the setting on, and the toggle redraws', async () => {
    const s = campaign(reg, 1);
    const { host, st } = await setup(s);
    expect(host.querySelector('[data-slot="over_explicit"]')).toBeNull();
    const toggle = host.querySelector<HTMLInputElement>('input[name="showExplicitSlots"]')!;
    expect(toggle.closest('[data-analyze]')!.getAttribute('data-analyze')).toBe('setting:showExplicitSlots');
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));
    expect(getSettings(st).showExplicitSlots).toBe(true);
    expect(host.querySelector('th[data-slot="over_explicit"]')).not.toBeNull();
  });

  it('with no campaign open the section says so and draws no table', async () => {
    const { host } = await setup(null);
    expect(host.textContent).toContain('No campaign is open');
    expect(host.querySelector('table')).toBeNull();
  });

  it('a chat switch while the section is drawn redraws it for the new squad', async () => {
    const first = campaign(reg, 2);
    const { host, st, set } = await setup(first);
    expect(host.querySelectorAll('.alius-stage-woman')).toHaveLength(2);
    const next = campaign(reg, 3);
    next.squad[2].displayName = 'Zed';
    set(next);
    st.switchChat({ chatId: 'c2', isGroup: true, groupId: 'g2' });
    await flush();
    expect(host.querySelectorAll('.alius-stage-woman')).toHaveLength(3);
    expect(host.textContent).toContain('Zed');
  });

  it('opens her page from her name', async () => {
    const s = campaign(reg, 1);
    const { host, opened } = await setup(s);
    host.querySelector<HTMLButtonElement>('.alius-stage-woman button')!.click();
    expect(opened).toEqual([s.squad[0].id]);
  });

  it('slotState: a pair from art.json and a single file of her folder', () => {
    const manifest = { 'vex.png': { 'legs_astride.left': { file: 'l.png' }, 'legs_astride.right': { file: 'r.png' } } };
    const art = createArtSlots(manifest, (p) => p, () => 'vex.png');
    expect(slotState(undefined, art, 'u', 'legs_astride.left')).toBe('picture');
    expect(slotState(undefined, art, 'u', 'legs_astride')).toBe('none');
    expect([...SLOT_KEYS].sort()).toEqual([...MANIFEST_KEYS].sort());
    expect(Object.keys(SLOT_INFO)).toEqual([...SLOT_KEYS]);
  });
});
