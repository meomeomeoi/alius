// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import '../../../src/engine/actions/dynamic';
import type { AnalyzeEnv } from '../../../src/analysis/model';
import { registerCoreProviders } from '../../../src/analysis/providers/core';
import type { Registries } from '../../../src/content/types';
import type { EngineEvent } from '../../../src/engine/dispatch';
import { heldBy } from '../../../src/engine/dynamic/view';
import { blankDynamic, newDynamicCampaign } from '../../../src/engine/dynamic/state';
import type { Frame } from '../../../src/engine/dynamic/types';
import type { CampaignState } from '../../../src/engine/state/types';
import type { SceneController } from '../../../src/scene/sceneController';
import { DEFAULT_SETTINGS } from '../../../src/settings';
import { FakeStAdapter } from '../../../src/st/fake';
import { renderCmdrCard } from '../../../src/ui/commander/cmdrCard';
import { h } from '../../../src/ui/dom';
import { dynamicNotices } from '../../../src/ui/dynamic/notices';
import { tonightItems } from '../../../src/ui/hub/model';
import { renderSceneScreen } from '../../../src/ui/scene/sceneScreen';
import { createToasts } from '../../../src/ui/shell/toast';
import { VOICE_OF } from '../../../src/ui/voice/sources';
import { unitAccent } from '../../../src/ui/voice/voiceCard';
import { campaign, loadCore, run } from '../../helpers/world';
import { markedWithout, unreachable, unresolved } from '../../helpers/analyzeCoverage';
import { plainDraft } from '../../../src/content/draft';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
});
afterEach(() => { document.body.innerHTML = ''; });

const [ANN, BEA] = ['unit_ann', 'unit_bea'];
const unitOf = (s: CampaignState, id: string) => s.squad.find((u) => u.id === id)!;
const practice = () => ({
  leadStyle: 'dominant' as const, attachment: 'steady' as const, desire: 'low' as const, caretaker: false, ownLimits: { categories: [] }, publicity: 'known' as const,
  practice: { categories: { restraint: { as: 'enjoys' as const, witness: 'indifferent' as const } }, style: { primary: 'cold' as const }, audience: 'indifferent' as const, inclination: 'curious' as const, fairness: 'fair' as const, hintStyle: 'offers' as const, drive: 'moderate' as const },
});
const env = (s: CampaignState): AnalyzeEnv => ({ state: s, registries: reg, settings: { ...DEFAULT_SETTINGS } }) as unknown as AnalyzeEnv;

/** Ann holds at `frame` (the device); Bea holds at `play`. */
function world(frame: Frame = 'role'): CampaignState {
  const s = campaign(reg, 3);
  unitOf(s, ANN).bond = practice();
  unitOf(s, BEA).bond = practice();
  s.content = { enabled: ['restraint'] };
  s.dynamic = newDynamicCampaign(7, { holders: 'any', pace: 'normal', frequency: 'normal', units: {} });
  s.relations[ANN].dynamic = { ...blankDynamic(s.day), frame, hold: 62, domains: [{ id: 'device', since: 1 }] };
  s.relations[BEA].dynamic = { ...blankDynamic(s.day), frame: 'play', hold: 45 };
  return s;
}
const off = (s: CampaignState): CampaignState => {
  s.content = { enabled: [] };
  return s;
};

describe('the CMDR card', () => {
  const card = (s: CampaignState): HTMLElement => {
    const host = h('div');
    document.body.append(host);
    renderCmdrCard(host, { state: s, registries: reg, raw: false });
    return host;
  };

  it('the CMDR card lists each holder and her domains', () => {
    const s = world();
    expect(heldBy(s, reg)).toEqual([{ unitId: ANN, domains: ['device'] }, { unitId: BEA, domains: [] }]);
    const host = card(s);
    const ann = host.querySelector<HTMLElement>(`[data-held-by="${ANN}"]`)!;
    expect(ann.textContent).toContain('Held by Ann');
    expect(ann.textContent).toContain('THE DEVICE');
    expect(host.querySelector(`[data-held-by="${BEA}"]`)!.textContent).toBe('Held by Bea');
    expect(host.querySelector(`[data-held-by="${ANN}"]`)!.textContent).not.toMatch(/\d/); // no frame, no hold, no number
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, env(s))).toEqual([]);
    expect(unreachable(host)).toEqual([]);
    expect([...host.querySelectorAll(`[data-held-by="${ANN}"] [data-analyze]`)].map((e) => e.getAttribute('data-analyze'))).toEqual(expect.arrayContaining(['glossary:dynamic', 'dynamicDomains:device']));
  });

  it('a woman at equal holds nothing, and nothing renders while off', () => {
    const s = world();
    s.relations[BEA].dynamic!.frame = 'equal';
    expect(heldBy(s, reg).map((h2) => h2.unitId)).toEqual([ANN]);
    expect(card(off(world())).querySelector('[data-held-by]')).toBeNull();
    expect(heldBy(off(world()), reg)).toEqual([]);
  });
});

describe('the scene header chip', () => {
  function scene(s: CampaignState, over: { hidden?: boolean } = {}) {
    const started = run(s, reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: [ANN, BEA], origin: 'event', startIndex: 0 } }).state;
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    const controller = { send: vi.fn(), propose: vi.fn(), answer: vi.fn(), end: vi.fn(async () => {}), edit: vi.fn(), stop: vi.fn(), onEdited: vi.fn(), transcript: () => [], onSwipe: vi.fn(), replyPending: () => false } as unknown as SceneController;
    const host = h('div');
    document.body.append(host);
    renderSceneScreen(host, { controller, getState: () => started, registries: reg, st, settings: () => ({ ...DEFAULT_SETTINGS, typingSpeed: 0, dynamicHidden: over.hidden === true }), onEnded: vi.fn() });
    return { host, state: started };
  }

  it('the frame chip is beside the lead chip with data-analyze glossary:frame', () => {
    const { host, state } = scene(world('role'));
    const lead = host.querySelector('.alius-lead-host')!;
    const ann = lead.querySelector<HTMLElement>(`[data-frame-chip="${ANN}"]`)!;
    expect(ann).not.toBeNull();
    expect(ann.getAttribute('data-analyze')).toBe('glossary:frame');
    expect(ann.textContent).toContain('ANN');
    expect(ann.textContent).toContain('ROLE');
    expect(lead.querySelector(`[data-frame-chip="${BEA}"]`)!.textContent).toContain('PLAY'); // at play: from play on
    expect(markedWithout(lead as HTMLElement)).toEqual([]);
    expect(unresolved(lead as HTMLElement, env(state))).toEqual([]);
    expect(unreachable(lead as HTMLElement)).toEqual([]);
  });

  it('a woman at equal has no chip, and in immersive mode the frame is not named', () => {
    const s = world('equal');
    s.relations[BEA].dynamic!.frame = 'equal';
    expect(scene(s).host.querySelector('[data-frame-chip]')).toBeNull();
    document.body.innerHTML = '';
    expect(scene(world('role'), { hidden: true }).host.querySelector('[data-frame-chip]')).toBeNull();
  });

  it('nothing renders while off', () => {
    expect(scene(off(world('role'))).host.querySelector('[data-frame-chip]')).toBeNull();
  });
});

describe('notices', () => {
  const notices = (events: EngineEvent[], s = world(), hidden = false) => dynamicNotices(events, s, reg, { hidden });

  it('a frame that moved is her notice: her voice, her accent, the milestone\'s words, a cut-in', () => {
    const [n] = notices([{ type: 'frame_changed', unitId: ANN, from: 'equal', to: 'play', milestoneId: 'first_yes' }]);
    expect(n.voice).toBe(VOICE_OF.dynamic);
    expect(n.accent).toBe(unitAccent(ANN));
    expect(n.title).toBe('Ann');
    expect(n.text).toBe(plainDraft(String(reg.dynamicMilestones.get('first_yes')!.text)).replaceAll('{name}', 'Ann'));
    expect(n.cutIn).toEqual({ kind: 'dynamic', text: 'PLAY' });
    expect(notices([{ type: 'frame_changed', unitId: ANN, from: 'equal', to: 'play', milestoneId: 'first_yes' }], world(), true)[0].cutIn).toEqual({ kind: 'dynamic', text: 'ANN' }); // the frame's name only while the numbers are shown
  });

  it('notices use VOICE_OF.dynamic and her accent', () => {
    const s = world();
    const events: EngineEvent[] = [
      { type: 'aftermath_started', unitId: ANN, id: 'da1', kind: 'grief' },
      { type: 'domain_lost', unitId: ANN, domainId: 'device', reason: 'band' },
      { type: 'sworn', unitId: ANN, day: 3 },
      { type: 'leash_blocked', unitId: BEA, holderId: ANN, kind: 'compel' },
      { type: 'compromat_revealed', unitId: ANN, factId: 'fr1' },
      { type: 'compromat_told', unitId: ANN, factId: 'fr1', audience: 'squad' },
    ];
    const out = notices(events, s);
    expect(out).toHaveLength(events.length);
    for (const n of out) {
      expect(n.voice).toBe(VOICE_OF.dynamic);
      expect(n.accent).toBe(unitAccent(ANN));
      expect(n.title).toBe('Ann');
      expect(n.text.length).toBeGreaterThan(0);
    }
  });

  it('the aftermath starts with a cut-in naming her and the words of its first stage; no kind, no number', () => {
    const [n] = notices([{ type: 'aftermath_started', unitId: ANN, id: 'da1', kind: 'grief' }]);
    expect(n.text).toBe(plainDraft((reg.aftermaths.get('grief')!.stages as Array<{ notice: string }>)[0].notice));
    expect(n.cutIn).toEqual({ kind: 'dynamic', text: 'ANN' });
    expect(`${n.title} ${n.text} ${n.cutIn!.text}`).not.toMatch(/grief|\d/i);
  });

  it('a domain lost by the exit says nothing of its own (the exit already did); the others name the domain', () => {
    expect(notices([{ type: 'domain_lost', unitId: ANN, domainId: 'device', reason: 'exit' }])).toEqual([]);
    const [n] = notices([{ type: 'domain_lost', unitId: ANN, domainId: 'device', reason: 'contest' }]);
    expect(n.text).toContain('The device');
  });

  it('the compromat notices name no fact', () => {
    const [told] = notices([{ type: 'compromat_told', unitId: ANN, factId: 'fr1', audience: 'outside' }]);
    expect(told.text).toContain('outside');
    expect(JSON.stringify(notices([{ type: 'compromat_revealed', unitId: ANN, factId: 'fr_secret' }]))).not.toContain('fr_secret');
  });

  it('oversight speaks in the corporation\'s voice, the transfer threat with a cut-in', () => {
    const [n] = notices([{ type: 'oversight_inquiry', stage: 'transfer_threat', unitId: ANN }]);
    expect(n.voice).toBe(VOICE_OF.warden_notice);
    expect(n.accent).toBeUndefined();
    expect(n.cutIn).toEqual({ kind: 'warden', text: 'OVERSIGHT' });
  });

  it('events of nothing, and nothing at all while off', () => {
    expect(notices([{ type: 'hold_changed', unitId: ANN }])).toEqual([]);
    expect(dynamicNotices([{ type: 'sworn', unitId: ANN, day: 3 }], off(world()), reg)).toEqual([]);
  });

  it('a toast carries her accent', () => {
    const host = h('div');
    document.body.append(host);
    const toasts = createToasts(host);
    toasts.show('info', 'x', { voice: VOICE_OF.dynamic, title: 'Ann', accent: unitAccent(ANN) });
    const el = host.querySelector<HTMLElement>('.alius-toast')!;
    expect(el.getAttribute('data-voice')).toBe('personal');
    expect(el.style.getPropertyValue('--toast-accent')).toBe(unitAccent(ANN));
    toasts.dispose();
  });
});

describe('the hub: Tonight', () => {
  it('a running aftermath stage puts her notice on the list, before the generation line', () => {
    const s = world();
    s.relations[ANN].dynamic!.aftermath = { id: 'da1', kind: 'grief', stage: 0, untilDay: s.day + 5 };
    const item = tonightItems(s, reg).find((i) => i.kind === 'dynamic')!;
    expect(item.unitId).toBe(ANN);
    expect(item.text).toContain('Ann');
    expect(item.text).toContain(String((reg.aftermaths.get('grief')!.stages as Array<{ notice: string }>)[0].notice));
    expect(item.analyze).toBe('glossary:aftermath');
    s.relations[ANN].dynamic!.aftermath!.stage = 1;
    expect(tonightItems(s, reg).find((i) => i.kind === 'dynamic')!.text).toContain(String((reg.aftermaths.get('grief')!.stages as Array<{ notice: string }>)[1].notice));
  });

  it('oversight\'s threat to move a holder is a line too', () => {
    const s = world();
    s.dynamic!.oversight = { blocked: [], threat: { unitId: ANN, untilDay: s.day + 4 } };
    const item = tonightItems(s, reg).find((i) => i.kind === 'dynamic')!;
    expect(item.text).toContain('Ann');
    expect(item.analyze).toBe('glossary:oversight_inquiry');
    expect(item.text).not.toMatch(/\d/);
  });

  it('nothing while off', () => {
    const s = world();
    s.relations[ANN].dynamic!.aftermath = { id: 'da1', kind: 'grief', stage: 0, untilDay: s.day + 5 };
    expect(tonightItems(off(s), reg).some((i) => i.kind === 'dynamic')).toBe(false);
  });
});
