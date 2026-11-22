// @vitest-environment jsdom
import { readFile } from 'node:fs/promises';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp, type AliusApp } from '../src/app';
import { loadPacks } from '../src/content/loader';
import { blankDynamic, newDynamicCampaign } from '../src/engine/dynamic/state';
import { startHold } from '../src/engine/practice/hold';
import type { SetupResult } from '../src/engine/setup';
import type { CampaignState } from '../src/engine/state/types';
import { offerMission } from '../src/engine/world/missions';
import { Rng } from '../src/engine/rng';
import { FakeStAdapter } from '../src/st/fake';
import type { ModalOpts } from '../src/ui/shell/modal';
import type { ShellDeps } from '../src/ui/shell/shell';
import { holderBond } from './engine/practice/world';

const SOLO = { chatId: 'solo', isGroup: false };
const ZERO = { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 0, corporate: 0, sacrifice: 0 };

let content: Awaited<ReturnType<typeof loadPacks>>;
beforeAll(async () => {
  content = await loadPacks(['content/core'], async (p) => JSON.parse(await readFile(p, 'utf8')));
  expect(content.errors).toEqual([]);
});
afterEach(() => { document.body.innerHTML = ''; });

const unit = (name: string, roleId = 'assault') => ({
  cardRef: `${name.toLowerCase()}.png`, displayName: name, roleId,
  signature: { templateId: 'sig_last_stand', name: 'Litany', description: 'She reads names.' },
  defects: [{ id: 'threat_saturation', origin: 'Three tours.' }],
  values: { ...ZERO }, likes: ['tea'], dislikes: [], triggers: [],
  baseline: { trust: 20, affinity: 0, attraction: 0 },
});
const setupResult = (): SetupResult => ({ commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny', units: [unit('Rhea'), unit('Mira', 'defender'), unit('Tess'), unit('Nell')] });

async function boot(style: 'possessive' | 'affectionate', mercy: number) {
  const st = new FakeStAdapter(SOLO);
  st.characters = ['rhea', 'mira', 'tess', 'nell'].map((n) => ({ avatar: `${n}.png`, name: n[0].toUpperCase() + n.slice(1) }));
  for (const c of st.characters) st.cards.set(c.avatar, { avatar: c.avatar, name: c.name, description: 'd', personality: 'p', scenario: '', creatorNotes: '' });
  const toasts: Array<{ kind: string; text: string }> = [];
  const modals: ModalOpts[] = [];
  let shellDeps: ShellDeps | undefined;
  const screens: string[] = [];
  const shell = {
    open: vi.fn(), close() {}, closeModal: vi.fn(), isOpen: () => true, showScreen(id: string) { screens.push(id); }, showTab() {}, registerTab() {}, registerHub() {}, registerScreen() {}, setTabLocked() {}, setTabBadge() {},
    toast(kind: string, text: string) { toasts.push({ kind, text }); },
    async modal(o: ModalOpts) { modals.push(o); return null; },
    setPalette() {}, refresh: vi.fn(), destroy() {},
  };
  const app: AliusApp = createApp(st, { loadContent: async () => content, shellFactory: (d) => { shellDeps = d; return shell as never; } });
  await app.start();
  expect(await app.deployCampaign(setupResult(), 'new_group')).toBe(true);
  // Rhea holds the commander in her quarters (the dynamic on, a role frame, a profile that practises restraint) and a mission waits
  const s: CampaignState = structuredClone(app.current().state!);
  const rhea = s.squad[0];
  const bond = holderBond(['public_humiliation']);
  bond.practice.style = { primary: style } as never;
  rhea.bond = bond as never;
  rhea.values = { ...ZERO, mercy };
  s.content = { enabled: ['restraint', 'public_humiliation'] };
  s.dynamic = newDynamicCampaign(7, { holders: 'any', pace: 'normal', frequency: 'normal', units: {} });
  s.relations[rhea.id].dynamic = { ...blankDynamic(s.day), frame: 'role', hold: 70 };
  s.slot = 'morning';
  const mission = offerMission(s, { registries: content.registries, rng: new Rng(s.rng) }, { templateId: 'tpl_recover', regionId: 'quarantine_d7', source: 'command' }).mission!;
  startHold(s, { registries: content.registries }, rhea.id, 2);
  app.replaceState(s);
  toasts.length = 0;
  const launch = () => {
    const ids = app.current().state!.roster.activeIds.filter((id) => id !== rhea.id).slice(0, 2);
    return { type: 'expedition/start', payload: { missionId: mission.id, unitIds: ids, formation: { front: ids.slice(0, 1), back: ids.slice(1) }, supplies: 1 } };
  };
  return { app, st, toasts, modals, screens, shellDeps: () => shellDeps!, launch, rhea: rhea.id };
}

describe('a launch while the commander is held (P16)', () => {
  it('the holder\'s keep: the refusal raises her alarm, shows the card in a modal and is not toasted', async () => {
    const t = await boot('possessive', 0);
    const events = t.app.dispatch(t.launch());
    expect(events.find((e) => e.type === 'error')).toMatchObject({ code: 'held_alarm', handled: true });
    expect(events.filter((e) => e.type === 'hold_alarm')).toMatchObject([{ kind: 'launch', answer: 'keep' }]);
    expect(t.app.current().state!.practices!.alarm).toMatchObject({ kind: 'launch', answer: 'keep' });
    expect(t.app.current().state!.expedition).toBeUndefined();
    expect(t.modals.map((m) => m.title)).toEqual(['ALARM']);
    expect(t.toasts).toEqual([]);
  });

  it('SEND THE SQUAD on the card opens the planner without the commander; DEFY ends the hold and lets the launch that was refused go on', async () => {
    const t = await boot('possessive', 0);
    t.app.dispatch(t.launch());
    const card = (): HTMLElement => (t.modals.at(-1)!.body as HTMLElement);
    t.screens.length = 0;
    (card().querySelector('[data-alarm-send]') as HTMLElement).click();
    expect(t.screens).toContain('expedition');
    expect(t.app.current().state!.practices!.alarm).toMatchObject({ answer: 'keep' }); // the alarm stands while the planner is open
    t.modals.length = 0;
    t.app.dispatch(t.launch()); // refused again: the alarm is open already, its card comes back
    expect(t.modals.map((m) => m.title)).toEqual(['ALARM']);
    (card().querySelector('[data-alarm-answer="defy"]') as HTMLElement).click();
    expect(t.app.current().state!.practices!.held).toBeUndefined();
    expect(t.app.current().state!.expedition).toBeDefined();
    expect(t.toasts.filter((x) => x.kind === 'error')).toEqual([]);
  });

  it('her release lets the launch go on at once, in the same dispatch, with no card', async () => {
    const t = await boot('affectionate', 3);
    const events = t.app.dispatch(t.launch());
    expect(events.some((e) => e.type === 'error')).toBe(false);
    expect(events.map((e) => e.type)).toEqual(expect.arrayContaining(['hold_alarm', 'hold_released', 'expedition_started']));
    expect(t.app.current().state!.expedition).toBeDefined();
    expect(t.app.current().state!.practices!.held).toBeUndefined();
    expect(t.modals).toEqual([]);
  });

  it('the HELD strip draws into the shell while the commander is held, and not after', async () => {
    const t = await boot('possessive', 0);
    const host = document.createElement('div');
    t.shellDeps().held!(host);
    expect(host.querySelector('[data-held-strip]')).not.toBeNull();
    expect(host.querySelector('[data-ask-release]')).not.toBeNull();
    expect(t.shellDeps().sensory!()).toBe(false);
    const s = structuredClone(t.app.current().state!);
    delete s.practices!.held;
    t.app.replaceState(s);
    t.shellDeps().held!(host);
    expect(host.children).toHaveLength(0);
  });

  it('ASK TO BE LET GO goes through the practice controller; the engine answers by her style', async () => {
    const t = await boot('affectionate', 0);
    const host = document.createElement('div');
    t.shellDeps().held!(host);
    (host.querySelector('[data-ask-release]') as HTMLElement).click();
    expect(t.app.current().state!.practices!.held).toBeUndefined(); // affectionate at favour 0 lets go
  });
});

describe('a duty that comes while the commander is held shows its card (review I1)', () => {
  const dueToday = (t: Awaited<ReturnType<typeof boot>>): void => {
    const s = structuredClone(t.app.current().state!);
    s.missions.offered.forEach((m) => { m.deadlineDay = s.day; });
    t.app.replaceState(s);
  };
  const tick = () => new Promise<void>((r) => setTimeout(r, 0));

  it('END SLOT with a mission due opens the ALARM card when she keeps the commander', async () => {
    const t = await boot('possessive', 0);
    dueToday(t);
    t.modals.length = 0;
    const events = t.app.dispatch({ type: 'calendar/consume_slot', payload: { slots: 1 } });
    await tick();
    expect(events.filter((e) => e.type === 'hold_alarm')).toMatchObject([{ kind: 'deadline', answer: 'keep' }]);
    expect(t.app.current().state!.practices!.alarm).toMatchObject({ kind: 'deadline', answer: 'keep' });
    expect(t.modals.map((m) => m.title)).toEqual(['ALARM']);
    expect((t.modals[0].body as HTMLElement).querySelector('[data-alarm-answer="accept"]')).not.toBeNull();
  });

  it('a release she makes at once is told, not silent', async () => {
    const t = await boot('affectionate', 3);
    dueToday(t);
    t.toasts.length = 0;
    t.modals.length = 0;
    t.app.dispatch({ type: 'calendar/consume_slot', payload: { slots: 1 } });
    await tick();
    expect(t.app.current().state!.practices!.held).toBeUndefined();
    expect(t.toasts.length + t.modals.length).toBeGreaterThan(0);
  });

  it('the strip offers ANSWER HER while a kept alarm is open and reopens the card', async () => {
    const t = await boot('possessive', 0);
    dueToday(t);
    t.app.dispatch({ type: 'calendar/consume_slot', payload: { slots: 1 } });
    await tick();
    t.modals.length = 0;
    const host = document.createElement('div');
    t.shellDeps().held!(host);
    const chip = host.querySelector('[data-held-answer]') as HTMLElement;
    expect(chip).not.toBeNull();
    chip.click();
    expect(t.modals.map((m) => m.title)).toEqual(['ALARM']);
  });

  it('a reload with a kept alarm open reopens the card', async () => {
    const t = await boot('possessive', 0);
    dueToday(t);
    t.app.dispatch({ type: 'calendar/consume_slot', payload: { slots: 1 } });
    await tick();
    t.modals.length = 0;
    t.app.replaceState(t.app.current().state!); // flushes the save
    await tick();
    t.st.emit('chat_changed'); // the chat is opened again: the load runs the same follow-up as any reload
    await tick();
    expect(t.app.current().state!.practices!.alarm).toMatchObject({ kind: 'deadline', answer: 'keep' });
    expect(t.modals.map((m) => m.title)).toContain('ALARM');
  });
});
