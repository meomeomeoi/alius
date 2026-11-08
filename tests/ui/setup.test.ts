// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { loadPacks } from '../../src/content/loader';
import type { Registries } from '../../src/content/types';
import { createCampaign } from '../../src/engine/state/create';
import type { SetupResult } from '../../src/engine/setup';
import type { ImportOutcome, ImportedProfile } from '../../src/setup/profile';
import { Wizard } from '../../src/setup/wizard';
import { FakeStAdapter } from '../../src/st/fake';
import { h } from '../../src/ui/dom';
import { renderCalibration } from '../../src/ui/setup/calibration';
import { renderSetupScreen } from '../../src/ui/setup/setupScreen';
import { createShell } from '../../src/ui/shell/shell';

let reg: Registries;
beforeAll(async () => {
  const r = await loadPacks(['content/core'], async (p) => JSON.parse(await readFile(p, 'utf8')));
  expect(r.errors).toEqual([]);
  reg = r.registries;
});
afterEach(() => {
  document.body.innerHTML = '';
});

const PROFILE: ImportedProfile = {
  roleCandidates: [{ roleId: 'defender', reason: 'Protective.' }, { roleId: 'assault', reason: 'Aggressive.' }],
  values: { pragmatism: 0, autonomy: 0, ingroup: 2, mercy: 1, corporate: 0, sacrifice: 0 },
  likes: ['tea'], dislikes: [], triggers: [],
  signatureCandidates: [
    { templateId: 'sig_last_stand', name: 'Litany', description: 'She reads names.' },
    { templateId: 'sig_shared_pain', name: 'Carry It', description: 'She takes the blow.' },
    { templateId: 'sig_anchor_words', name: 'Count Me', description: 'Her voice.' },
  ],
  defectCandidates: [
    { defectId: 'threat_saturation', origin: 'Three tours.' },
    { defectId: 'pain_inversion', origin: 'Burned out.' },
    { defectId: 'echo_bleed', origin: 'Heard things.' },
  ],
  baseline: { trust: 12, affinity: 0, attraction: 0 },
  notes: 'A veteran.',
};
const OK: ImportOutcome = { kind: 'ok', profile: PROFILE, dropped: [], missing: [] };
const flush = () => new Promise((r) => setTimeout(r, 0));

function make(opts: { canBind?: boolean; outcome?: ImportOutcome; characters?: number } = {}) {
  const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
  st.characters = Array.from({ length: opts.characters ?? 5 }, (_, i) => ({ avatar: `c${i}.png`, name: `Char${i}` }));
  const importer = vi.fn(async (_a: string, _s: unknown): Promise<ImportOutcome> => opts.outcome ?? OK);
  const wizard = new Wizard(
    { registries: reg, desireBondDefects: false, importer: importer as never, onChange: () => {} },
    { personaName: 'Vale', canBindCurrent: opts.canBind ?? false },
  );
  const host = h('div', { id: 'host' });
  document.body.append(host);
  const onCancel = vi.fn();
  const onConfirm = vi.fn(async (_r: SetupResult, _t: 'new_group' | 'current_group') => {});
  const modal = vi.fn(async (_o: unknown): Promise<string | null> => 'discard');
  renderSetupScreen(host, { wizard, registries: reg, st, onCancel, onConfirm, modal: modal as never });
  return { st, wizard, host, importer, onCancel, onConfirm, modal };
}
type M = ReturnType<typeof make>;

const q = <T extends HTMLElement = HTMLElement>(m: { host: HTMLElement }, sel: string) => m.host.querySelector<T>(sel);
const qa = (m: { host: HTMLElement }, sel: string) => [...m.host.querySelectorAll<HTMLElement>(sel)];
const click = (el: HTMLElement | null) => {
  if (!el) throw new Error('element not found');
  el.click();
};
const action = (m: M, name: string) => q<HTMLButtonElement>(m, `button[data-action="${name}"]`)!;

function toUnits(m: M) {
  click(q(m, '.alius-start-card[data-id="start_vesper"]'));
  click(q(m, '.alius-crime-card[data-id="mutiny"]'));
  click(action(m, 'next'));
}
async function toCalibration(m: M, count = 1) {
  toUnits(m);
  for (let i = 0; i < count; i++) click(q(m, `input[data-avatar="c${i}.png"]`));
  click(action(m, 'next'));
  await flush();
}

describe('shell registerScreen', () => {
  it('shell renders a registered screen and showScreen switches to it', () => {
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    const state = createCampaign({ seed: 1, commanderName: 'V' });
    const shell = createShell({ st, getState: () => state, getLoad: () => ({ kind: 'ok', state, chatId: 'c' }) });
    shell.registerScreen('setup', (host) => host.append(h('p', { id: 'probe' }, 'hello')));
    shell.open();
    expect(document.getElementById('probe')).toBeNull();
    shell.showScreen('setup');
    expect(document.getElementById('probe')?.textContent).toBe('hello');
    // registering the current screen again re-renders it
    shell.registerScreen('setup', (host) => host.append(h('p', { id: 'probe2' }, 'again')));
    expect(document.getElementById('probe2')).not.toBeNull();
    expect(document.getElementById('probe')).toBeNull();
    shell.destroy();
  });
});

describe('setup screen', () => {
  it('shows the title and the four step labels', () => {
    const m = make();
    expect(m.host.textContent).toContain('CCP INTAKE FORM');
    for (const l of ['01 DOSSIER', '02 UNIT ASSIGNMENT', '03 PROFILE CALIBRATION', '04 REVIEW']) {
      expect(m.host.textContent).toContain(l);
    }
    expect(q(m, '[aria-current="step"]')!.textContent).toContain('01 DOSSIER');
  });

  it('dossier shows 2 starts and 6 crimes with Plea: GUILTY', () => {
    const m = make();
    expect(qa(m, '.alius-start-card')).toHaveLength(2);
    const crimes = qa(m, '.alius-crime-card');
    expect(crimes).toHaveLength(6);
    for (const c of crimes) expect(c.textContent).toContain('Plea: GUILTY');
    const mutiny = q(m, '.alius-crime-card[data-id="mutiny"]')!;
    expect(mutiny.textContent).toContain('PERK: Authority starts at rank 2.');
    expect(mutiny.textContent).toContain('FLAW:');
    expect(q(m, '.alius-start-card[data-id="start_vesper"]')!.textContent).toContain('Vesper Somatics');
    expect(q(m, '.alius-start-card[data-id="start_vesper"]')!.textContent).toContain('Seed Stock');
  });

  it('the commander name input defaults to the persona and edits the wizard', () => {
    const m = make();
    const input = q<HTMLInputElement>(m, 'input[data-key="name"]')!;
    expect(input.value).toBe('Vale');
    input.value = 'Rook';
    input.dispatchEvent(new Event('input'));
    expect(m.wizard.state.commanderName).toBe('Rook');
    expect(q<HTMLInputElement>(m, 'input[data-key="name"]')!.value).toBe('Rook'); // survived the re-render
  });

  it('Next is disabled until name, start and crime are chosen', () => {
    const m = make();
    expect(action(m, 'next').disabled).toBe(true);
    click(q(m, '.alius-start-card[data-id="start_vesper"]'));
    expect(action(m, 'next').disabled).toBe(true);
    expect(m.host.textContent).toContain('Choose the commander');
    click(q(m, '.alius-crime-card[data-id="mutiny"]'));
    expect(action(m, 'next').disabled).toBe(false);
    expect(q(m, '.alius-start-card[data-id="start_vesper"]')!.getAttribute('aria-pressed')).toBe('true');
  });

  it('selecting units updates the difficulty hint', () => {
    const m = make();
    toUnits(m);
    expect(m.host.textContent).toContain('Squad size 0/4 — HELLISH. No automatic compensation.');
    for (let i = 0; i < 3; i++) click(q(m, `input[data-avatar="c${i}.png"]`));
    expect(m.host.textContent).toContain('Squad size 3/4 — HARD. No automatic compensation.');
  });

  it('unit search filters the library', () => {
    const m = make();
    toUnits(m);
    const search = q<HTMLInputElement>(m, 'input[data-key="search"]')!;
    search.value = 'char3';
    search.dispatchEvent(new Event('input'));
    expect(qa(m, 'input[data-avatar]').map((e) => e.dataset.avatar)).toEqual(['c3.png']);
  });

  it('fifth card cannot be selected', () => {
    const m = make();
    toUnits(m);
    for (let i = 0; i < 4; i++) click(q(m, `input[data-avatar="c${i}.png"]`));
    expect(q<HTMLInputElement>(m, 'input[data-avatar="c4.png"]')!.disabled).toBe(true);
    expect(q<HTMLInputElement>(m, 'input[data-avatar="c0.png"]')!.disabled).toBe(false);
    expect(q<HTMLInputElement>(m, 'input[data-avatar="c0.png"]')!.checked).toBe(true);
  });

  it('calibration shows candidates and preselects the first role', async () => {
    const m = make();
    await toCalibration(m, 2);
    expect(m.host.textContent).toContain('1/2');
    expect(m.importer).toHaveBeenCalledTimes(1);
    expect(qa(m, '.alius-role-card').map((e) => e.dataset.id)).toEqual(['defender', 'assault']);
    expect(q(m, '.alius-role-card[data-id="defender"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(q(m, '.alius-role-card[data-id="defender"]')!.textContent).toContain('Protective.');
    expect(qa(m, '.alius-sig-card')).toHaveLength(3);
    expect(qa(m, '.alius-defect-card')).toHaveLength(3);
    expect(q(m, '.alius-defect-card[data-id="threat_saturation"]')!.textContent).toContain('Three tours.');
    expect(m.host.textContent).toContain('A veteran.');
    expect(action(m, 'next').disabled).toBe(true); // unit 2 not calibrated yet
    click(q(m, 'button[data-action="pager-next"]'));
    await flush();
    expect(m.importer).toHaveBeenCalledTimes(2);
    expect(m.host.textContent).toContain('2/2');
  });

  it('shows CALIBRATING… while loading', () => {
    const m = make();
    m.importer.mockImplementation(() => new Promise<ImportOutcome>(() => {}));
    toUnits(m);
    click(q(m, 'input[data-avatar="c0.png"]'));
    click(action(m, 'next'));
    expect(m.host.textContent).toContain('CALIBRATING…');
  });

  it('manual mode lists all six roles and shows the notice', async () => {
    const m = make({ outcome: { kind: 'manual', reason: 'card not found' } });
    await toCalibration(m);
    expect(qa(m, '.alius-role-card')).toHaveLength(6);
    expect(qa(m, '.alius-sig-card')).toHaveLength(12);
    expect(qa(m, '.alius-defect-card')).toHaveLength(14);
    expect(m.host.textContent).toContain('card not found');
    expect(q(m, 'button[data-regenerate]')).toBeNull();
  });

  it('manual signature starts as the template name and mechanic', async () => {
    const m = make({ outcome: { kind: 'manual', reason: 'x' } });
    await toCalibration(m);
    click(q(m, '.alius-sig-card[data-id="sig_frenzy"]'));
    expect(m.wizard.state.units[0].choice.signature).toEqual({
      templateId: 'sig_frenzy', name: 'Frenzy', description: reg.signatures.get('sig_frenzy')!.mechanic,
    });
  });

  it('Add second defect enables a second pick', async () => {
    const m = make();
    await toCalibration(m);
    click(q(m, '.alius-defect-card[data-id="pain_inversion"]'));
    expect(m.wizard.state.units[0].choice.defects.map((d) => d.id)).toEqual(['pain_inversion']); // replaced
    const toggle = q<HTMLInputElement>(m, 'input[data-action="second-defect"]')!;
    expect(m.host.textContent).toContain('Add second defect');
    toggle.click();
    click(q(m, '.alius-defect-card[data-id="echo_bleed"]'));
    expect(m.wizard.state.units[0].choice.defects.map((d) => d.id)).toEqual(['pain_inversion', 'echo_bleed']);
    q<HTMLInputElement>(m, 'input[data-action="second-defect"]')!.click();
    expect(m.wizard.state.units[0].choice.defects.map((d) => d.id)).toEqual(['pain_inversion']);
  });

  it('regenerate button calls the importer with that section only', async () => {
    const m = make();
    await toCalibration(m);
    click(q(m, 'button[data-regenerate="signature"]'));
    expect(m.importer).toHaveBeenLastCalledWith('c0.png', ['signature']);
    expect(m.host.textContent).toContain('[ REGENERATE ]');
    expect(m.host.textContent).toContain('[ MANUAL ]');
  });

  it('[ MANUAL ] switches the unit to manual lists', async () => {
    const m = make();
    await toCalibration(m);
    click(q(m, 'button[data-action="manual"]'));
    expect(m.wizard.state.units[0].status).toBe('manual');
    expect(qa(m, '.alius-role-card')).toHaveLength(6);
  });

  async function toReview(m: M) {
    await toCalibration(m);
    click(action(m, 'next'));
  }

  it('review shows the summary and Confirm deployment', async () => {
    const m = make();
    await toReview(m);
    expect(q(m, '[aria-current="step"]')!.textContent).toContain('04 REVIEW');
    const pre = q(m, 'pre.alius-review')!.textContent!;
    expect(pre).toContain('Vale');
    expect(pre).toContain('Vesper Somatics');
    expect(pre).toContain('Mutiny');
    expect(pre).toContain('Char0');
    expect(pre).toContain('Defender');
    expect(action(m, 'confirm').textContent).toBe('Confirm deployment');
    expect(action(m, 'confirm').disabled).toBe(false);
  });

  it('review shows target choice only when binding is possible', async () => {
    const a = make({ canBind: false });
    await toReview(a);
    expect(qa(a, 'input[name="target"]')).toHaveLength(0);
    document.body.innerHTML = '';
    const b = make({ canBind: true });
    await toReview(b);
    expect(qa(b, 'input[name="target"]')).toHaveLength(2);
    expect(b.host.textContent).toContain('Create a new group chat');
    expect(b.host.textContent).toContain('Use this group chat');
    qa(b, 'input[name="target"]')[1].click();
    expect(b.wizard.state.target).toBe('current_group');
  });

  it('confirm calls onConfirm with the SetupResult and the target', async () => {
    const m = make({ canBind: true });
    await toReview(m);
    qa(m, 'input[name="target"]')[1].click();
    click(action(m, 'confirm'));
    await flush();
    expect(m.onConfirm).toHaveBeenCalledTimes(1);
    const [result, target] = m.onConfirm.mock.calls[0];
    expect(target).toBe('current_group');
    expect(result).toMatchObject({
      commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny',
      units: [{ cardRef: 'c0.png', roleId: 'defender' }],
    });
  });

  it('confirm is disabled and explains why while the setup is invalid', async () => {
    const m = make();
    await toReview(m);
    m.wizard.update(0, { values: { ...PROFILE.values!, mercy: 9 } });
    expect(action(m, 'confirm').disabled).toBe(true);
    expect(q(m, '.alius-hint')!.textContent).toContain('mercy');
  });

  it('Back and Cancel work on every step; Cancel asks first', async () => {
    const m = make();
    expect(action(m, 'back').disabled).toBe(true);
    click(action(m, 'cancel'));
    await flush();
    expect(m.modal).toHaveBeenCalledTimes(1);
    expect((m.modal.mock.calls[0][0] as { title: string }).title).toBe('Discard intake form?');
    expect(m.onCancel).toHaveBeenCalledTimes(1);

    m.modal.mockResolvedValueOnce('keep');
    click(action(m, 'cancel'));
    await flush();
    expect(m.onCancel).toHaveBeenCalledTimes(1);

    toUnits(m);
    expect(action(m, 'back').disabled).toBe(false);
    click(action(m, 'back'));
    expect(m.wizard.state.step).toBe('dossier');
  });
});

describe('calibration view', () => {
  function view(over: { status?: 'ready' | 'manual'; sections?: Array<'role' | 'values' | 'tags' | 'signature' | 'defects' | 'baseline'> } = {}) {
    const wizard = new Wizard(
      { registries: reg, desireBondDefects: false, importer: async () => OK, onChange: () => {} },
      { personaName: 'V', canBindCurrent: false },
    );
    wizard.toggleUnit({ avatar: 'a.png', name: 'Ann' });
    if (over.status === 'manual') wizard.setManual(0);
    const draft = wizard.state.units[0];
    if (over.status !== 'manual') {
      draft.status = 'ready';
      draft.candidates = structuredClone(PROFILE);
    }
    const host = h('div');
    document.body.append(host);
    const onUpdate = vi.fn();
    const onRegenerate = vi.fn();
    const onManual = vi.fn();
    renderCalibration(host, {
      draft, registries: reg, desireBondDefects: false, sections: over.sections, onUpdate, onRegenerate, onManual,
    });
    return { host, onUpdate, onRegenerate, onManual, draft };
  }

  it('values sliders write integers', () => {
    const v = view();
    const sliders = [...v.host.querySelectorAll<HTMLInputElement>('input[type="range"][data-axis]')];
    expect(sliders.map((s) => s.dataset.axis)).toEqual(['pragmatism', 'autonomy', 'ingroup', 'mercy', 'corporate', 'sacrifice']);
    for (const s of sliders) {
      expect([s.min, s.max, s.step]).toEqual(['-3', '3', '1']);
      expect(s.labels?.length ?? 0).toBeGreaterThan(0);
    }
    const mercy = sliders.find((s) => s.dataset.axis === 'mercy')!;
    mercy.value = '-2';
    mercy.dispatchEvent(new Event('change'));
    expect(v.onUpdate).toHaveBeenCalledTimes(1);
    const patch = v.onUpdate.mock.calls[0][0];
    expect(patch.values.mercy).toBe(-2);
    expect(Number.isInteger(patch.values.mercy)).toBe(true);
    expect(patch.values.ingroup).toBe(0); // draft.choice values (not yet preselected in this bare draft)
  });

  it('baseline sliders use the setup bounds', () => {
    const v = view();
    const b = (k: string) => v.host.querySelector<HTMLInputElement>(`input[type="range"][data-baseline="${k}"]`)!;
    expect([b('trust').min, b('trust').max]).toEqual(['0', '40']);
    expect([b('affinity').min, b('affinity').max]).toEqual(['-20', '30']);
    expect([b('attraction').min, b('attraction').max]).toEqual(['0', '20']);
    b('affinity').value = '7';
    b('affinity').dispatchEvent(new Event('change'));
    expect(v.onUpdate.mock.calls[0][0].baseline.affinity).toBe(7);
  });

  it('tag input normalizes and enforces the cap', () => {
    const v = view({ status: 'manual' });
    const input = () => v.host.querySelector<HTMLInputElement>('input[data-tags="likes"]')!;
    input().value = '  Loud   MUSIC!! ';
    input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(v.onUpdate).toHaveBeenLastCalledWith({ likes: ['loud music'] });

    input().value = '!!!';
    input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(v.onUpdate).toHaveBeenCalledTimes(1);

    // at the cap (6 likes) nothing more is added
    const full = view({ status: 'manual' });
    full.draft.choice.likes = ['a', 'b', 'c', 'd', 'e', 'f'];
    document.body.innerHTML = '';
    const host = h('div');
    document.body.append(host);
    const onUpdate = vi.fn();
    renderCalibration(host, { draft: full.draft, registries: reg, desireBondDefects: false, onUpdate, onRegenerate: vi.fn(), onManual: vi.fn() });
    const i2 = host.querySelector<HTMLInputElement>('input[data-tags="likes"]')!;
    expect(i2.disabled).toBe(true);
    i2.value = 'g';
    i2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('tag chips can be removed', () => {
    const v = view({ status: 'manual' });
    v.draft.choice.likes = ['tea', 'rain'];
    document.body.innerHTML = '';
    const host = h('div');
    document.body.append(host);
    const onUpdate = vi.fn();
    renderCalibration(host, { draft: v.draft, registries: reg, desireBondDefects: false, onUpdate, onRegenerate: vi.fn(), onManual: vi.fn() });
    const chips = [...host.querySelectorAll<HTMLElement>('.alius-chip')];
    expect(chips.map((c) => c.textContent)).toEqual(['tea×', 'rain×']);
    host.querySelector<HTMLButtonElement>('button[aria-label="Remove tea"]')!.click();
    expect(onUpdate).toHaveBeenCalledWith({ likes: ['rain'] });
  });

  it('sections limits what is shown', () => {
    const v = view({ sections: ['values', 'tags'] });
    expect(v.host.querySelector('.alius-role-card')).toBeNull();
    expect(v.host.querySelector('.alius-defect-card')).toBeNull();
    expect(v.host.querySelector('input[data-baseline]')).toBeNull();
    expect(v.host.querySelector('input[data-axis]')).not.toBeNull();
    expect(v.host.querySelector('input[data-tags]')).not.toBeNull();
  });

  it('signature name and description are editable', () => {
    const v = view();
    v.draft.choice.signature = { templateId: 'sig_last_stand', name: 'Litany', description: 'She reads names.' };
    document.body.innerHTML = '';
    const host = h('div');
    document.body.append(host);
    const onUpdate = vi.fn();
    renderCalibration(host, { draft: v.draft, registries: reg, desireBondDefects: false, onUpdate, onRegenerate: vi.fn(), onManual: vi.fn() });
    const name = host.querySelector<HTMLInputElement>('input[data-key="sig-name"]')!;
    expect(name.value).toBe('Litany');
    expect(name.maxLength).toBe(40);
    name.value = 'New Name';
    name.dispatchEvent(new Event('input'));
    expect(onUpdate).toHaveBeenLastCalledWith({ signature: { templateId: 'sig_last_stand', name: 'New Name', description: 'She reads names.' } });
    expect(host.textContent).toContain('Template: Last Stand —');
  });

  it('an unknown role id renders UNKNOWN and does not throw', () => {
    const v = view();
    v.draft.choice.roleId = 'ghost';
    v.draft.candidates!.roleCandidates = [{ roleId: 'ghost', reason: 'x' }];
    document.body.innerHTML = '';
    const host = h('div');
    document.body.append(host);
    expect(() =>
      renderCalibration(host, { draft: v.draft, registries: reg, desireBondDefects: false, onUpdate: vi.fn(), onRegenerate: vi.fn(), onManual: vi.fn() }),
    ).not.toThrow();
    expect(host.textContent).toContain('UNKNOWN ghost');
  });
});
