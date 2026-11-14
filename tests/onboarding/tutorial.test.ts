// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createApp, type AliusApp } from '../../src/app';
import { loadPacks } from '../../src/content/loader';
import type { Registries } from '../../src/content/types';
import type { EngineEvent } from '../../src/engine/dispatch';
import { defaultFormation } from '../../src/engine/combat/stats';
import type { StartPayload } from '../../src/engine/combat/types';
import type { SetupResult } from '../../src/engine/setup';
import type { CampaignState } from '../../src/engine/state/types';
import { ContextBuilder } from '../../src/llm/context';
import { createOnboarding } from '../../src/onboarding/controller';
import { FakeStAdapter } from '../../src/st/fake';
import { payload } from '../helpers/expedition';
import { campaign, errors, loadCore, run } from '../helpers/world';
import { worldHarness } from '../helpers/worldApp';

let reg: Registries;
let content: Awaited<ReturnType<typeof loadPacks>>;
beforeAll(async () => {
  reg = await loadCore();
  content = await loadPacks(['content/core'], async (p) => JSON.parse(await readFile(p, 'utf8')));
  expect(content.errors).toEqual([]);
});
afterEach(() => {
  document.body.innerHTML = '';
});

/** A prologue campaign standing on the tutorial step with the patrol offered. */
function atTutorial(): CampaignState {
  const s = campaign(reg, 4, { onboarding: 'prologue' });
  s.onboarding!.stepId = 'first_words';
  s.onboarding!.spoken = s.squad.map((u) => u.id);
  return run(s, reg, { type: 'onboarding/complete_step', payload: { stepId: 'first_words' } }).state;
}

describe('the controller and the tutorial run', () => {
  function rig(initial: CampaignState) {
    const h = worldHarness(reg, initial);
    const openExpedition = vi.fn();
    const ob = createOnboarding({
      ...h.deps, context: new ContextBuilder(), refreshContext: vi.fn(), modal: vi.fn(async () => null) as never, resumeScene: vi.fn(),
      openExpedition, startScene: async () => true, endScene: async () => {},
    });
    const act = (type: string, payload?: unknown): EngineEvent[] => {
      const events = h.app().dispatch({ type, payload });
      ob.onEvents(events);
      return events;
    };
    return { h, ob, openExpedition, act };
  }

  it('launchTutorial opens the planner for the offered mission', () => {
    const r = rig(atTutorial());
    expect(r.ob.launchTutorial()).toBe(true);
    expect(r.openExpedition).toHaveBeenCalledWith(r.h.state().onboarding!.tutorialMissionId);
  });

  it('launchTutorial while the patrol is out shows the open run', () => {
    const s = atTutorial();
    const started = run(s, reg, { type: 'expedition/start', payload: payload(s, s.onboarding!.tutorialMissionId!) }).state;
    const r = rig(started);
    expect(r.ob.launchTutorial()).toBe(true);
    expect(r.openExpedition).toHaveBeenCalledWith();
  });

  it('launchTutorial toasts when the mission is gone', () => {
    const s = atTutorial();
    s.missions.offered = [];
    const r = rig(s);
    expect(r.ob.launchTutorial()).toBe(false);
    expect(r.h.toasts).toHaveLength(1);
    expect(r.openExpedition).not.toHaveBeenCalled();
  });

  it('launchTutorial does nothing on other steps', () => {
    const r = rig(campaign(reg, 4, { onboarding: 'prologue' }));
    expect(r.ob.launchTutorial()).toBe(false);
  });

  it('the expedition return completes the step (a retreat counts)', () => {
    const s = atTutorial();
    const started = run(s, reg, { type: 'expedition/start', payload: payload(s, s.onboarding!.tutorialMissionId!) }).state;
    const r = rig(started);
    const events = r.act('expedition/retreat', {});
    expect(errors(events)).toEqual([]);
    expect(events.some((e) => e.type === 'expedition_ended')).toBe(true);
    expect(r.h.state().onboarding).toMatchObject({ stepId: 'debrief', completed: expect.arrayContaining(['tutorial']) });
  });

  it('an ordinary expedition during the line-up does not complete anything', () => {
    const s = campaign(reg, 4, { onboarding: 'prologue' });
    const mission = { ...structuredClone(atTutorial().missions.offered[0]), templateId: 'tpl_sweep', id: 'm_ord', deadlineDay: 9, source: 'command' as const };
    s.missions.offered.push(mission);
    const started = run(s, reg, { type: 'expedition/start', payload: payload(s, 'm_ord') }).state;
    const r = rig(started);
    r.act('expedition/retreat', {});
    expect(r.h.state().onboarding!.stepId).toBe('lineup');
  });
});

describe('combats of the tutorial run (in the app)', () => {
  const ZERO = { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 0, corporate: 0, sacrifice: 0 };
  const unit = (name: string) => ({
    cardRef: `${name.toLowerCase()}.png`, displayName: name, roleId: 'assault',
    signature: { templateId: 'sig_last_stand', name: 'Litany', description: 'She reads names.' },
    defects: [{ id: 'threat_saturation', origin: 'Three tours.' }], values: { ...ZERO }, likes: ['tea'], dislikes: [], triggers: [],
    baseline: { trust: 20, affinity: 0, attraction: 0 },
  });
  const setup = (): SetupResult => ({
    commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny', units: [unit('Rhea'), unit('Mira')],
    onboarding: { prologueId: 'prologue_vesper', veteran: false },
  });

  async function boot(easyRetry: boolean) {
    const st = new FakeStAdapter({ chatId: 'solo', isGroup: false });
    st.settings = { easyRetry };
    st.characters = [{ avatar: 'rhea.png', name: 'Rhea' }, { avatar: 'mira.png', name: 'Mira' }];
    for (const [avatar, name] of [['rhea.png', 'Rhea'], ['mira.png', 'Mira']]) st.cards.set(avatar, { avatar, name, description: 'd', personality: 'p', scenario: '', creatorNotes: '' });
    const shell = {
      open: vi.fn(), close() {}, isOpen: () => true, showScreen() {}, showTab() {}, registerTab() {}, registerHub() {}, registerScreen() {}, setTabBadge() {},
      toast() {}, async modal() { return null; }, setPalette() {}, refresh: vi.fn(), destroy() {},
    };
    const app: AliusApp = createApp(st, { loadContent: async () => content, shellFactory: () => shell as never });
    await app.start();
    expect(await app.deployCampaign(setup(), 'new_group')).toBe(true);
    return { app, st };
  }
  const combat = (app: AliusApp): StartPayload => ({
    encounter: { enemies: [{ enemyId: 'husk', level: 1, affixes: [] }], danger: 1 },
    formation: defaultFormation(app.current().state!, content.registries, app.current().state!.roster.activeIds),
  });
  /** The prologue standing on the tutorial run: the patrol offered and started. */
  function toRun(app: AliusApp): void {
    const s = structuredClone(app.current().state!);
    s.onboarding!.stepId = 'first_words';
    s.onboarding!.spoken = s.squad.map((u) => u.id);
    app.replaceState(s);
    app.dispatch({ type: 'onboarding/complete_step', payload: { stepId: 'first_words' } });
    const id = app.current().state!.onboarding!.tutorialMissionId!;
    const now = app.current().state!;
    const ids = now.roster.activeIds;
    const events = app.dispatch({ type: 'expedition/start', payload: { missionId: id, unitIds: ids, formation: { front: ids.slice(0, 1), back: ids.slice(1) }, supplies: 2 } });
    expect(errors(events)).toEqual([]);
  }

  it('combats of a tutorial run allow retry with easyRetry off', async () => {
    const t = await boot(false);
    toRun(t.app);
    expect(t.app.startCombat(combat(t.app))).toBe(true);
    expect(t.app.current().state!.combat!.allowRetry).toBe(true);
  });

  it('a non-tutorial combat still follows the setting', async () => {
    const off = await boot(false);
    expect(off.app.startCombat(combat(off.app))).toBe(true);
    expect(off.app.current().state!.combat!.allowRetry).toBe(false);
    const on = await boot(true);
    expect(on.app.startCombat(combat(on.app))).toBe(true);
    expect(on.app.current().state!.combat!.allowRetry).toBe(true);
  });
});
