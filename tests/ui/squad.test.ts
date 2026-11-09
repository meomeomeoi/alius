// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { loadPacks } from '../../src/content/loader';
import type { Registries } from '../../src/content/types';
import { buildCampaign, type UnitSetup } from '../../src/engine/setup';
import type { CampaignState } from '../../src/engine/state/types';
import { getSettings } from '../../src/settings';
import { FakeStAdapter } from '../../src/st/fake';
import type { LoadResult } from '../../src/st/persistence';
import { h } from '../../src/ui/dom';
import { valueBand } from '../../src/ui/squad/bands';
import { renderSquadTab } from '../../src/ui/squad/squadTab';

let reg: Registries;
beforeAll(async () => {
  const r = await loadPacks(['content/core'], async (p) => JSON.parse(await readFile(p, 'utf8')));
  expect(r.errors).toEqual([]);
  reg = r.registries;
});
afterEach(() => {
  document.body.innerHTML = '';
});

const ZERO = { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 0, corporate: 0, sacrifice: 0 };
const unit = (over: Partial<UnitSetup> = {}): UnitSetup => ({
  cardRef: 'rhea.png', displayName: 'Rhea', roleId: 'assault',
  signature: { templateId: 'sig_last_stand', name: 'Litany of the Lost', description: 'She reads names aloud.' },
  defects: [{ id: 'threat_saturation', origin: 'Three tours on the Ashway.' }],
  values: { ...ZERO, mercy: 2, autonomy: -3, ingroup: 1 }, likes: [], dislikes: [], triggers: [],
  baseline: { trust: 20, affinity: 0, attraction: 0 }, ...over,
});
function campaign(units: UnitSetup[] = [unit()]): CampaignState {
  const r = buildCampaign({ commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny', units }, reg, { desireBondDefects: false, seed: 1 });
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.state;
}

function render(opts: {
  state?: CampaignState | null; load?: LoadResult; raw?: boolean; st?: FakeStAdapter; registries?: Registries;
  onNewCampaign?: () => void;
} = {}) {
  const st = opts.st ?? new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
  const state = opts.state === undefined ? campaign() : opts.state;
  const load: LoadResult = opts.load ?? (state ? { kind: 'ok', state, chatId: 'c' } : { kind: 'none' });
  const settings = { ...getSettings(st), showRawValues: opts.raw ?? false };
  const host = h('div');
  document.body.append(host);
  const onNewCampaign = opts.onNewCampaign ?? vi.fn();
  renderSquadTab(host, {
    st, getState: () => state, getLoad: () => load, registries: opts.registries ?? reg, settings: () => settings, onNewCampaign,
  });
  return { host, st, onNewCampaign };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('valueBand', () => {
  it('thresholds', () => {
    expect([-3, -2, -1, 0, 1, 2, 3].map(valueBand)).toEqual(['LOW', 'LOW', 'MID', 'MID', 'MID', 'HIGH', 'HIGH']);
  });
});

describe('SQUAD tab', () => {
  it('no campaign shows NEW CAMPAIGN which calls onNewCampaign', () => {
    const { host, onNewCampaign } = render({ state: null });
    expect(host.textContent).toContain('NO ACTIVE CAMPAIGN IN THIS CHAT');
    const btn = host.querySelector<HTMLButtonElement>('button')!;
    expect(btn.textContent).toBe('[ NEW CAMPAIGN ]');
    btn.click();
    expect(onNewCampaign).toHaveBeenCalledTimes(1);
  });

  it('readonly shows reason and no button', () => {
    const { host } = render({ state: null, load: { kind: 'readonly', reason: 'state version 9 is newer than supported', chatId: 'c' } });
    expect(host.textContent).toContain('state version 9 is newer than supported');
    expect(host.querySelector('button')).toBeNull();
  });

  it('campaign with 0 units shows NO UNITS ASSIGNED', () => {
    const { host } = render({ state: campaign([]) });
    expect(host.textContent).toContain('NO UNITS ASSIGNED');
  });

  it('unit shows role, level, stats line and signature template', () => {
    const { host } = render();
    const t = host.textContent!;
    expect(t).toContain('Rhea');
    expect(t).toContain('Assault');
    expect(t).toContain('LVL 1');
    expect(t).toContain('HP 110 · ATK 24 · DEF 12 · SPD 14 · CRIT 10%');
    expect(t).toContain('Litany of the Lost');
    expect(t).toContain('She reads names aloud.');
    expect(t).toContain(`Template: Last Stand — ${reg.signatures.get('sig_last_stand')!.mechanic}`);
    expect(t).toContain('STANDARD ISSUE');
  });

  it('equipment line lists items once a slot is filled', () => {
    const s = campaign();
    s.inventory.push({ uid: 'it_1', itemId: 'item_blade', rarity: 'refined', upgrade: 2, affixes: [] });
    s.squad[0].equipment = { weapon: 'it_1' };
    const { host } = render({ state: s });
    expect(host.textContent).toContain('WEAPON: Standard Blade [refined] +2');
    expect(host.textContent).toContain('UPPER: STANDARD ISSUE');
    expect(host.textContent).not.toContain('PENDING');
  });

  it('defect shows full text and origin', () => {
    const { host } = render();
    const t = host.textContent!;
    const d = reg.defects.get('threat_saturation')!;
    const bd = d.breakdown as { name: string; text: string };
    const arc = d.arc as { cure: string; manage: string; embrace: string };
    for (const part of [
      String(d.name), String(d.category), 'Three tours on the Ashway.', String(d.lore), String(d.upside), String(d.downside),
      bd.name, bd.text, String(d.social), arc.cure, arc.manage, arc.embrace,
    ]) {
      expect(t, part).toContain(part);
    }
  });

  it('values show bands by default and raw numbers with showRawValues', () => {
    const bands = render().host.textContent!;
    expect(bands).toContain('MERCY: HIGH');
    expect(bands).toContain('AUTONOMY: LOW');
    expect(bands).toContain('INGROUP: MID');
    expect(bands).toContain('PRAGMATISM: MID');
    expect(bands).not.toContain('MERCY: +2');
    document.body.innerHTML = '';
    const raw = render({ raw: true }).host.textContent!;
    expect(raw).toContain('MERCY: +2');
    expect(raw).toContain('AUTONOMY: -3');
    expect(raw).toContain('PRAGMATISM: 0');
    expect(raw).not.toContain('MERCY: HIGH');
  });

  it('relationship axes are shown as bands, never as numbers (P3 replaced the P1 "hidden" rule)', () => {
    const t = render().host.querySelector('.alius-relation')!.textContent!;
    expect(t).toMatch(/TRUST \w+ · AFFINITY \w+ · ATTRACTION \w+/);
    expect(t).not.toMatch(/\d/);
  });

  it('sprite falls back to avatar when no neutral sprite', async () => {
    const { host, st } = render();
    const img = host.querySelector<HTMLImageElement>('img')!;
    expect(img.alt).toBe('Rhea');
    await flush();
    expect(img.getAttribute('src')).toBe(st.getAvatarUrl('rhea.png'));
  });

  it('uses the neutral sprite when there is one', async () => {
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    st.sprites.set('rhea.png:neutral', '/sprites/rhea/neutral.png');
    const { host } = render({ st });
    await flush();
    expect(host.querySelector('img')!.getAttribute('src')).toBe('/sprites/rhea/neutral.png');
  });

  it('a sprite that fails to load falls back to the avatar', async () => {
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    st.sprites.set('rhea.png:neutral', '/broken.png');
    const { host } = render({ st });
    await flush();
    const img = host.querySelector('img')!;
    img.dispatchEvent(new Event('error'));
    expect(img.getAttribute('src')).toBe(st.getAvatarUrl('rhea.png'));
    img.dispatchEvent(new Event('error')); // no loop
    expect(img.getAttribute('src')).toBe(st.getAvatarUrl('rhea.png'));
  });

  it('a unit without a card has no image', () => {
    const s = campaign();
    delete s.squad[0].cardRef;
    expect(render({ state: s }).host.querySelector('img')).toBeNull();
  });

  it('unknown role id renders UNKNOWN and does not throw', () => {
    const s = campaign();
    s.squad[0].roleId = 'ghost_role';
    s.squad[0].defects = [{ id: 'ghost_defect', origin: 'o' }];
    s.squad[0].signatureSkill = { templateId: 'sig_ghost', name: 'N', description: 'D' };
    let host!: HTMLElement;
    expect(() => (host = render({ state: s }).host)).not.toThrow();
    expect(host.textContent).toContain('UNKNOWN ghost_role');
    expect(host.textContent).toContain('UNKNOWN ghost_defect');
    expect(host.textContent).toContain('Template: UNKNOWN sig_ghost');
  });

  it('renders every unit', () => {
    const { host } = render({ state: campaign([unit(), unit({ cardRef: 'kay.png', displayName: 'Kay', roleId: 'medic' })]) });
    expect(host.querySelectorAll('.alius-unit')).toHaveLength(2);
    expect(host.textContent).toContain('Medic');
  });
});

describe('re-sync button', () => {
  function withResync(editLock: boolean) {
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    const state = campaign([unit(), unit({ cardRef: 'kay.png', displayName: 'Kay' })]);
    const settings = { ...getSettings(st), editLock };
    const host = h('div');
    document.body.append(host);
    const onResync = vi.fn();
    renderSquadTab(host, {
      st, getState: () => state, getLoad: () => ({ kind: 'ok', state, chatId: 'c' }), registries: reg,
      settings: () => settings, onNewCampaign: () => {}, onResync,
    });
    return { host, onResync };
  }

  it('resync button hidden while editLock is on', () => {
    expect(withResync(true).host.textContent).not.toContain('RE-SYNC');
  });

  it('resync button shown per unit when the lock is off and calls onResync with the unit id', () => {
    const { host, onResync } = withResync(false);
    const buttons = [...host.querySelectorAll<HTMLButtonElement>('button')].filter((b) => b.textContent === '[ RE-SYNC FROM CARD ]');
    expect(buttons).toHaveLength(2);
    buttons[1].click();
    expect(onResync).toHaveBeenCalledWith('unit_kay');
  });

  it('no button without a handler', () => {
    const { host } = render();
    expect(host.textContent).not.toContain('RE-SYNC');
  });
});

describe('sprite cache', () => {
  it('a found sprite is fetched once and shown immediately on later refreshes', async () => {
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    st.sprites.set('rhea.png:neutral', '/sprites/rhea/neutral.png');
    const spy = vi.spyOn(st, 'getSpriteUrl');
    render({ st });
    await flush();
    document.body.innerHTML = '';
    const second = render({ st });
    expect(second.host.querySelector('img')!.getAttribute('src')).toBe('/sprites/rhea/neutral.png'); // no flash of the avatar
    await flush();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('a missing sprite is not re-requested on every refresh', async () => {
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    const spy = vi.spyOn(st, 'getSpriteUrl');
    for (let i = 0; i < 3; i++) {
      document.body.innerHTML = '';
      render({ st });
      await flush();
    }
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('grunt unit block', () => {
  const grunt = (): CampaignState => {
    const s = campaign();
    s.squad.push({
      ...structuredClone(s.squad[0]), id: 'grunt_k_117', kind: 'grunt', displayName: 'Mara', designation: 'K-117',
      asciiPortrait: '+-----+\n| o o |\n+-----+', bio: 'Counts exits.', cardRef: undefined,
      defects: [{ id: 'echo_bleed', lite: true }],
    });
    return s;
  };

  it('shows the ASCII portrait, designation, bio and the lite defect', () => {
    const { host } = render({ state: grunt() });
    const block = [...host.querySelectorAll<HTMLElement>('article.alius-unit')].find((a) => a.textContent!.includes('K-117'))!;
    expect(block.querySelector('pre.alius-ascii')!.textContent).toContain('| o o |');
    expect(block.textContent).toContain('Mara');
    expect(block.textContent).toContain('K-117');
    expect(block.textContent).toContain('Counts exits.');
    expect(block.textContent).toContain(String(reg.defects.get('echo_bleed')!.name));
    expect(block.querySelector('img')).toBeNull();
  });

  it('has no signature section and no re-sync button', () => {
    const s = grunt();
    const { host } = render({ state: s });
    const st = new FakeStAdapter();
    st.settings.editLock = false;
    const block = [...host.querySelectorAll<HTMLElement>('article.alius-unit')].find((a) => a.textContent!.includes('K-117'))!;
    expect(block.textContent).not.toContain('SIGNATURE');
    expect(block.querySelector('[data-resync]')).toBeNull();
    expect(block.textContent).toContain('GRUNT');
  });

  it('a named unit still shows its signature', () => {
    const { host } = render({ state: grunt() });
    const named = [...host.querySelectorAll<HTMLElement>('article.alius-unit')].find((a) => a.textContent!.includes('Rhea'))!;
    expect(named.textContent).toContain('SIGNATURE');
  });
});

describe('relationship line', () => {
  it('named unit shows state and bands', () => {
    const s = campaign();
    Object.assign(s.relations[s.squad[0].id], { stateId: 'friend', trust: 51, affinity: 33, attraction: 12 });
    const { host } = render({ state: s });
    const line = host.querySelector('.alius-relation')!.textContent!;
    expect(line).toContain('FRIEND');
    expect(line).toContain('TRUST SOLID');
    expect(line).toContain('AFFINITY WARM');
    expect(line).toContain('ATTRACTION FAINT');
    expect(line).not.toMatch(/\b(51|33|12)\b/);
  });

  it('raw values appear with showRawValues; attraction is hidden when romance is off', () => {
    const s = campaign();
    Object.assign(s.relations[s.squad[0].id], { trust: 51, affinity: 33, attraction: 12 });
    expect(render({ state: s, raw: true }).host.querySelector('.alius-relation')!.textContent).toContain('TRUST SOLID (51)');
    s.settings.intimacy = { romance: false, initiative: 'med' };
    expect(render({ state: s }).host.querySelector('.alius-relation')!.textContent).not.toContain('ATTRACTION');
  });

  it('a grunt shows trust only', () => {
    const s = campaign();
    s.squad[0].kind = 'grunt';
    const line = render({ state: s }).host.querySelector('.alius-relation')!.textContent!;
    expect(line).toContain('TRUST');
    expect(line).not.toContain('AFFINITY');
  });
});

describe('P4 progression views', () => {
  const view = (state: CampaignState, over: Partial<Parameters<typeof renderSquadTab>[1]> = {}) => {
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    const settings = { ...getSettings(st), showRawValues: false };
    const host = h('div');
    document.body.append(host);
    const calls = { onUnlock: vi.fn(), onRespec: vi.fn(), onSetLoadout: vi.fn(), onEquip: vi.fn(), onUnequip: vi.fn() };
    renderSquadTab(host, {
      st, getState: () => state, getLoad: () => ({ kind: 'ok', state, chatId: 'c' }), registries: reg, settings: () => settings,
      onNewCampaign: vi.fn(), ...calls, ...over,
    });
    return { host, calls };
  };

  it('shows level, xp and points', () => {
    const s = campaign();
    s.squad[0].level = 3;
    s.squad[0].xp = 42;
    s.squad[0].skillPoints = 2;
    const { host } = view(s);
    expect(host.textContent).toContain('LVL 3');
    expect(host.textContent).toContain('XP 42/100 · SKILL POINTS 2');
    expect(host.textContent).toContain('HP 122'); // level growth applies to the shown stats
  });

  it('STANDARD ISSUE replaces PENDING', () => {
    const { host } = view(campaign());
    expect(host.textContent).toContain('WEAPON: STANDARD ISSUE');
    expect(host.textContent).not.toContain('PENDING');
  });

  it('tree marks owned/available/locked', () => {
    const s = campaign();
    s.squad[0].skillPoints = 5;
    s.squad[0].unlockedNodes = ['as_b1_t1'];
    const { host } = view(s);
    const node = (id: string) => host.querySelector<HTMLElement>(`[data-node="${id}"]`)!;
    expect(node('as_b1_t1').dataset.state).toBe('owned');
    expect(node('as_b1_t1').textContent).toContain('[■] Breach Charge');
    expect(node('as_b1_t2').dataset.state).toBe('available');
    expect(node('as_b1_t2').textContent).toContain('[□]');
    expect(node('as_b1_t3').dataset.state).toBe('locked');
    expect(node('as_b1_t3').textContent).toContain('[·]');
    expect(node('as_ult').dataset.state).toBe('locked');
    expect(host.querySelectorAll('.alius-tree-node')).toHaveLength(16);
    expect(host.querySelector('.alius-tree-head')!.textContent).toBe('BREACH');
    expect(node('as_b1_t3').title).toContain('previous node');
  });

  it('unlock click calls onUnlock only for an affordable available node', () => {
    const s = campaign();
    s.squad[0].skillPoints = 2;
    const { host, calls } = view(s);
    host.querySelector<HTMLElement>('[data-node="as_b1_t1"]')!.click();
    expect(calls.onUnlock).toHaveBeenCalledWith('unit_rhea', 'as_b1_t1');
    host.querySelector<HTMLElement>('[data-node="as_b1_t2"]')!.click(); // locked
    s.squad[0].skillPoints = 0;
    const poor = view(s);
    poor.host.querySelector<HTMLElement>('[data-node="as_b1_t1"]')!.click();
    expect(poor.calls.onUnlock).not.toHaveBeenCalled();
  });

  it('loadout limit enforced in the editor', () => {
    const s = campaign();
    s.squad[0].unlockedNodes = ['as_b1_t1', 'as_b2_t1', 'as_b3_t1'];
    const { host, calls } = view(s);
    const boxes = [...host.querySelectorAll<HTMLInputElement>('.alius-loadout input[type="checkbox"]')];
    expect(boxes.map((b) => b.dataset.skill)).toEqual(['as_strike', 'as_burst', 'as_breach_charge', 'as_finisher', 'as_blood_rush']);
    expect(boxes.map((b) => b.checked)).toEqual([true, true, false, false, false]);
    expect(boxes.every((b) => !b.disabled)).toBe(true);
    boxes[2].checked = true;
    boxes[2].dispatchEvent(new Event('change'));
    boxes[3].checked = true;
    boxes[3].dispatchEvent(new Event('change'));
    expect(calls.onSetLoadout).toHaveBeenLastCalledWith('unit_rhea', ['as_strike', 'as_burst', 'as_breach_charge', 'as_finisher']);
    expect(boxes[4].disabled).toBe(true); // four is the limit
    expect(boxes[0].disabled).toBe(false);
    expect(host.textContent).toContain('LOADOUT 2/4');
  });

  it('illegal item is flagged NOT CERTIFIED, an unknown one UNKNOWN', () => {
    const s = campaign();
    s.inventory.push({ uid: 'it_1', itemId: 'item_precision_rifle', rarity: 'standard', upgrade: 0, affixes: [] });
    s.squad[0].equipment = { weapon: 'it_1', upper: 'it_ghost' };
    const { host } = view(s);
    expect(host.querySelector('[data-slot="weapon"]')!.textContent).toContain('NOT CERTIFIED: Precision Rifle');
    expect(host.querySelector('[data-slot="upper"]')!.textContent).toContain('UNKNOWN');
  });

  it('equip picker lists only legal items and calls the handlers', () => {
    const s = campaign();
    s.inventory.push(
      { uid: 'it_1', itemId: 'item_blade', rarity: 'standard', upgrade: 0, affixes: [] },
      { uid: 'it_2', itemId: 'item_precision_rifle', rarity: 'standard', upgrade: 0, affixes: [] },
    );
    const { host, calls } = view(s);
    const sel = host.querySelector<HTMLSelectElement>('select[data-equip="weapon"]')!;
    expect([...sel.options].map((o) => o.value)).toEqual(['', 'it_1']);
    sel.value = 'it_1';
    sel.dispatchEvent(new Event('change'));
    expect(calls.onEquip).toHaveBeenCalledWith('unit_rhea', 'it_1');
    s.squad[0].equipment = { weapon: 'it_1' };
    const worn = view(s);
    const sel2 = worn.host.querySelector<HTMLSelectElement>('select[data-equip="weapon"]')!;
    sel2.value = '';
    sel2.dispatchEvent(new Event('change'));
    expect(worn.calls.onUnequip).toHaveBeenCalledWith('unit_rhea', 'weapon');
  });

  it('respec button shows the cost and is disabled without nodes or funds', () => {
    const s = campaign();
    s.squad[0].level = 4;
    s.squad[0].unlockedNodes = ['as_b1_t1'];
    s.resources.credits = 100;
    s.resources.plyx = 100;
    const { host, calls } = view(s);
    const btn = host.querySelector<HTMLButtonElement>('[data-respec]')!;
    expect(btn.textContent).toBe('[RESPEC — 40 CR / 20 PLYX]');
    expect(btn.disabled).toBe(false);
    btn.click();
    expect(calls.onRespec).toHaveBeenCalledWith('unit_rhea');
    s.resources.plyx = 5;
    expect(view(s).host.querySelector<HTMLButtonElement>('[data-respec]')!.disabled).toBe(true);
    s.squad[0].unlockedNodes = [];
    s.resources.plyx = 100;
    expect(view(s).host.querySelector<HTMLButtonElement>('[data-respec]')!.disabled).toBe(true);
  });

  it('a breakdown is marked', () => {
    const s = campaign();
    s.squad[0].breakdown = { defectId: 'threat_saturation', day: 1 };
    expect(view(s).host.textContent).toContain('BREAKDOWN: Hostile Read');
  });
});
