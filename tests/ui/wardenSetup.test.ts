// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { loadPacks } from '../../src/content/loader';
import type { Registries } from '../../src/content/types';
import type { ImportOutcome, ImportedProfile } from '../../src/setup/profile';
import { Wizard } from '../../src/setup/wizard';
import { h } from '../../src/ui/dom';
import { renderModeSection, renderWardenPick } from '../../src/ui/warden/modeSection';
import { renderWorldParams } from '../../src/ui/setup/worldParams';

let reg: Registries;
beforeAll(async () => {
  const r = await loadPacks(['content/core'], async (p) => JSON.parse(await readFile(p, 'utf8')));
  expect(r.errors).toEqual([]);
  reg = r.registries;
});
afterEach(() => { document.body.innerHTML = ''; });

const PROFILE: ImportedProfile = {
  roleCandidates: [{ roleId: 'defender', reason: 'Protective.' }],
  values: { pragmatism: 0, autonomy: 0, ingroup: 2, mercy: 1, corporate: 0, sacrifice: 0 },
  likes: [], dislikes: [], triggers: [],
  signatureCandidates: [{ templateId: 'sig_last_stand', name: 'Litany', description: 'She reads names.' }],
  defectCandidates: [{ defectId: 'echo_bleed', origin: 'Heard things.' }],
  baseline: { trust: 12, affinity: 0, attraction: 0 }, notes: '',
};
const OK: ImportOutcome = { kind: 'ok', profile: PROFILE, dropped: [], missing: [] };
const flush = () => new Promise((r) => setTimeout(r, 0));

function make(difficulty?: string) {
  const wizard = new Wizard(
    { registries: reg, desireBondDefects: false, importer: vi.fn(async () => OK) as never, onChange: () => {}, ...(difficulty ? { difficulty } : {}) },
    { personaName: 'Vale', canBindCurrent: false },
  );
  wizard.setMode('veteran');
  const host = h('div');
  document.body.append(host);
  const draw = () => { host.replaceChildren(); renderModeSection(host, wizard); renderWardenPick(host, wizard); };
  wizard.subscribe(draw);
  draw();
  return { wizard, host };
}
const addUnits = async (wizard: Wizard, n: number) => {
  for (let i = 0; i < n; i++) wizard.toggleUnit({ avatar: `c${i}.png`, name: `Char${i}` } as never);
  await flush();
};
const mode = (host: HTMLElement, kind: string) => host.querySelector<HTMLElement>(`.alius-mode-choice[data-id="${kind}"]`)!;
const rule = (host: HTMLElement, r: string) => host.querySelector<HTMLElement>(`.alius-death-rule[data-id="${r}"]`)!;

describe('the MODE section', () => {
  it('switches to LEASHSWAP and shows the death rule, everything with data-analyze', () => {
    const { wizard, host } = make();
    expect(host.querySelector('.alius-death-rule')).toBeNull(); // default mode: no death rule shown
    mode(host, 'leashswap').click();
    expect(wizard.state.campaign.kind).toBe('leashswap');
    expect(host.querySelectorAll('.alius-death-rule')).toHaveLength(2);
    for (const el of host.querySelectorAll('.alius-mode-choice, .alius-death-rule')) expect(el.getAttribute('data-analyze'), el.className).toBeTruthy();
    rule(host, 'campaign_end').click();
    expect(wizard.state.campaign.deathRule).toBe('campaign_end');
    mode(host, 'default').click();
    expect(wizard.state.campaign.kind).toBe('default');
  });

  it('the death rule default follows difficulty (story → REWIND DAY, hard → CAMPAIGN END)', () => {
    const story = make('story');
    story.wizard.setCampaignMode('leashswap');
    expect(rule(story.host, 'rewind_day').getAttribute('aria-pressed')).toBe('true');
    expect(story.host.textContent).toContain('REWIND DAY');
    document.body.innerHTML = '';
    const hard = make('hard');
    hard.wizard.setCampaignMode('leashswap');
    expect(rule(hard.host, 'campaign_end').getAttribute('aria-pressed')).toBe('true');
    expect(hard.host.textContent).toContain('CAMPAIGN END');
    expect(make().wizard.state.campaign.deathRule).toBe('rewind_day'); // no difficulty given: normal
  });

  it('has no pronoun for the commander in any text it shows', () => {
    const { wizard, host } = make();
    wizard.setCampaignMode('leashswap');
    expect(host.textContent).not.toMatch(/\b(he|him|his)\b/i);
  });

  it('is part of the WORLD PARAMETERS step', () => {
    const { wizard } = make();
    const world = h('div');
    document.body.append(world);
    renderWorldParams(world, { wizard, registries: reg });
    expect(world.querySelector('.alius-mode-choice[data-id="leashswap"]')).not.toBeNull();
  });
});

describe('the warden pick (UNITS step)', () => {
  it('offers the chosen units and CORPORATE ASSIGNMENT, only in LEASHSWAP', async () => {
    const { wizard, host } = make();
    await addUnits(wizard, 2);
    expect(host.querySelector('.alius-warden-pick')).toBeNull();
    wizard.setCampaignMode('leashswap');
    const sel = host.querySelector<HTMLSelectElement>('.alius-warden-pick select')!;
    expect([...sel.options].map((o) => o.textContent)).toEqual(['CORPORATE ASSIGNMENT', 'Char0', 'Char1']);
    expect(sel.value).toBe('corporation'); // the default
    expect(host.querySelector('.alius-warden-pick')!.getAttribute('data-analyze')).toBeTruthy();
    sel.value = 'player:1';
    sel.dispatchEvent(new Event('change'));
    expect(wizard.state.campaign.warden).toEqual({ by: 'player', index: 1 });
  });

  it('a pick that points at a removed unit falls back to the corporation; one behind it shifts', async () => {
    const { wizard } = make();
    await addUnits(wizard, 3);
    wizard.setCampaignMode('leashswap');
    wizard.setWardenPick({ by: 'player', index: 2 });
    wizard.toggleUnit({ avatar: 'c0.png', name: 'Char0' } as never); // remove the first: she moves up
    expect(wizard.state.campaign.warden).toEqual({ by: 'player', index: 1 });
    wizard.toggleUnit({ avatar: 'c2.png', name: 'Char2' } as never); // remove her
    expect(wizard.state.campaign.warden).toEqual({ by: 'corporation' });
  });
});

describe('result()', () => {
  async function ready(): Promise<Wizard> {
    const { wizard } = make();
    wizard.setStart('start_vesper');
    wizard.setCrime('mutiny');
    await addUnits(wizard, 2);
    for (let i = 0; i < 2; i++) wizard.update(i, { roleId: 'defender', signature: { templateId: 'sig_last_stand', name: 'Litany', description: 'She reads names.' }, defects: [{ id: 'echo_bleed', origin: 'x' }] } as never);
    return wizard;
  }

  it('carries mode', async () => {
    const wizard = await ready();
    wizard.setCampaignMode('leashswap');
    wizard.setDeathRule('campaign_end');
    wizard.setWardenPick({ by: 'player', index: 1 });
    expect(wizard.result()?.mode).toEqual({ kind: 'leashswap', deathRule: 'campaign_end', warden: { by: 'player', index: 1 } });
    expect(wizard.result()?.onboarding?.prologueId).toBe('prologue_vesper_leashswap');
  });

  it('the default mode writes no mode', async () => {
    const wizard = await ready();
    expect(wizard.result()).not.toBeNull();
    expect(wizard.result()?.mode).toBeUndefined();
    expect(wizard.result()?.onboarding?.prologueId).toBe('prologue_vesper');
  });
});
