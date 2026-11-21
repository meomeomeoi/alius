// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildPanelModel, type AnalyzeEnv } from '../../src/analysis/model';
import { resetKnowledgeRules } from '../../src/analysis/knowledge';
import { registerCoreProviders } from '../../src/analysis/providers/core';
import { stagingInput } from '../../src/blocking/input';
import type { Registries } from '../../src/content/types';
import { REGISTRY_NAMES } from '../../src/content/types';
import { COMMANDER, blockingLive, registerFrameReader, resetBlockingHooks, setBlocking } from '../../src/engine/blocking';
import { blockingVocabulary } from '../../src/engine/blocking/vocabulary';
import { registerExpectation, resetExpectations } from '../../src/engine/moments/answer';
import { fireMoment } from '../../src/engine/moments/fire';
import { liveSources } from '../../src/engine/moments/live';
import type { PhysicsRun } from '../../src/engine/physics/state';
import type { CampaignState } from '../../src/engine/state/types';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { parseSubject } from '../../src/analysis/subject';
import { h } from '../../src/ui/dom';
import { renderBlockingStrip } from '../../src/ui/scene/blockingStrip';
import { renderMomentCard } from '../../src/ui/scene/momentCard';
import { renderPhysicsPanel, type PhysicsPanelStaging } from '../../src/ui/scene/physicsPanel';
import { allReadings, leaks } from '../helpers/analyze';
import { unresolved } from '../helpers/analyzeCoverage';
import { enable } from '../helpers/bonds';
import { campaign, errors, loadCore, run, setRelation } from '../helpers/loyalty';
import '../../src/engine/actions/blocking';
import '../../src/engine/actions/moments';
import '../../src/engine/actions/physics';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
});
afterEach(() => {
  document.body.innerHTML = '';
  resetBlockingHooks();
  resetExpectations();
  resetKnowledgeRules();
});

const ANN = 'unit_ann';
const ON = ['worship', 'restraint', 'service', 'objectification', 'humiliation'];
const env = (state: CampaignState | null, showRawValues = false): AnalyzeEnv => ({ registries: reg, state, settings: { ...DEFAULT_SETTINGS, showRawValues } });

/** What the hidden parts of a scene hold: her plan and her skills are what a reading must never show. */
interface Hidden { widths: [number, number]; skill: number; shift: number; expected: string }
const SENTINEL = { widths: [731, 913] as [number, number], skill: 4, shift: 0.4217, text: 'SENTINEL-KEEPS-P15A' };

/** A live hold (a breath contact), an open moment that keeps one of her facts and a worn item, with her hidden parts set from `h`. */
function scene(hid: Hidden, fire = true): CampaignState {
  registerFrameReader(() => 'play');
  const s = campaign(reg, 4);
  setRelation(s, ANN, { stateId: 'confidant' });
  enable(s, ...ON);
  const st = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } }).state;
  st.memory.facts.push({ id: 'fact_keeps', about: [ANN], text: SENTINEL.text, tags: ['life', 'untold', 'wrote_journal'], importance: 3, day: 1, knownBy: [ANN], hiddenFromCommander: true });
  setBlocking(st, { registries: reg }, { person: COMMANDER, field: 'worn', value: 'hood' }, { at: 2, source: 'chip' });
  setBlocking(st, { registries: reg }, { person: ANN, field: 'contact', value: 'smothered_armpit', with: COMMANDER }, { at: 3, source: 'chip' });
  const r = run(st, reg, { type: 'physics/next_segment', payload: { runId: 'p1' } });
  expect(errors(r.events)).toEqual([]);
  const out = r.state;
  const phys = out.scene!.physics as PhysicsRun;
  phys.segment.plan = { beats: [
    { opening: { widthMs: hid.widths[0] }, attention: 'watching' }, { opening: { widthMs: hid.widths[1], false: true }, attention: 'busy' },
    { attention: 'glancing' }, { attention: 'watching' },
  ] };
  phys.rhythmShift = hid.shift;
  out.relations[ANN]!.herSkill = { seal: hid.skill, weight: hid.skill, reading: hid.skill, swing: hid.skill, rhythm: hid.skill, practice: { seal: 3.77 } };
  if (fire) fireMoment(out, { registries: reg }, 'memory_surfaces', ANN); // brings up her oldest kept fact (and so tells it)
  registerExpectation(() => ({ key: hid.expected, strength: 3 }));
  return out;
}

const noStaging = (): PhysicsPanelStaging => ({
  input: () => undefined, endSegment: () => [], stopWord: () => [], skip: () => [], stimulus: () => [], act: () => [], finishCounted: () => [], cue: (k) => `[${k}]`, beat: () => 0,
});

/** The whole scene screen of P15a as a host: the strip, the moment card and the physics panel. */
function screen(state: CampaignState): HTMLElement {
  const host = h('div');
  document.body.append(host);
  const strip = h('div'), card = h('div'), panel = h('div');
  host.append(strip, card, panel);
  renderBlockingStrip(strip, { state, registries: reg, onStage: vi.fn() });
  renderMomentCard(card, { state, registries: reg, chips: 'chips', onStage: vi.fn() });
  renderPhysicsPanel(panel, { state, registries: reg, settings: DEFAULT_SETTINGS, staging: noStaging(), onTap: vi.fn() });
  return host;
}

/** Everything a panel of the screen would say: title, text, effects and reading of each element, and the screen's own text. */
function readEverything(state: CampaignState, raw = false): string {
  const host = screen(state);
  const out: string[] = [host.textContent ?? ''];
  for (const el of host.querySelectorAll('[data-analyze]')) {
    const subject = parseSubject(el.getAttribute('data-analyze') ?? '', el.getAttribute('data-analyze-ctx'));
    if (!subject) continue;
    const m = buildPanelModel(subject, env(state, raw));
    out.push(m.title, m.text ?? '', m.long ?? '', ...m.effects, ...m.see, ...(m.reading?.lines ?? []));
  }
  out.push(allReadings(env(state, raw), ANN));
  host.remove();
  return out.join('\n');
}

describe('P15a hidden state never reaches a reading', () => {
  it('the scene is live and shows what it should, so the checks below are not vacuous', () => {
    const s = scene({ widths: SENTINEL.widths, skill: SENTINEL.skill, shift: SENTINEL.shift, expected: '1' });
    expect(blockingLive(s, reg)).toBe(true);
    expect(s.scene!.moments!.open!.sourceId).toBe('memory_surfaces');
    const text = readEverything(s);
    expect(text).toContain('Smothered'); // the contact chip
    expect(text).toContain('[ BREATHE ]'); // the physics panel
    expect(text).toContain('Your endurance for this'); // the commander's own level, in words
  });

  it('no reading shows her expected option, her skills, her rhythm, a segment plan\'s openings or her attention (differential and sentinels)', () => {
    const a = scene({ widths: SENTINEL.widths, skill: SENTINEL.skill, shift: SENTINEL.shift, expected: '1' });
    const textA = readEverything(a);
    resetExpectations();
    const b = scene({ widths: [100, 200], skill: 0, shift: 0, expected: '0' });
    const textB = readEverything(b);
    // nothing of hers changes a word of any reading, with raw values off or on
    expect(textA).toBe(textB);
    for (const raw of [false, true]) {
      const text = readEverything(a, raw);
      expect(leaks(text, { numbers: [...SENTINEL.widths, 3.77, SENTINEL.shift], texts: [] }), `raw ${raw}`).toEqual([]);
    }
  });

  it('a kept fact that has not surfaced is read by no panel, while the moment that will bring it up is live', () => {
    const s = scene({ widths: SENTINEL.widths, skill: 0, shift: 0, expected: '0' }, false);
    expect(s.memory.facts.find((f) => f.id === 'fact_keeps')!.hiddenFromCommander).toBe(true);
    expect(liveSources(s, reg).map((l) => l.sourceId)).toContain('memory_surfaces');
    const text = [readEverything(s, false), readEverything(s, true)].join('\n');
    expect(leaks(text, { numbers: [], texts: [SENTINEL.text] })).toEqual([]);
  });
});

describe('a gated entry is absent from every list', () => {
  const idsIn = (s: CampaignState): { vocab: string[]; staging: string; live: string[]; chips: string[] } => {
    const v = blockingVocabulary(s, reg);
    const host = h('div');
    document.body.append(host);
    renderBlockingStrip(host, { state: s, registries: reg, onStage: vi.fn() });
    const chips = [...host.querySelectorAll('[data-analyze]')].map((e) => e.getAttribute('data-analyze')!);
    host.remove();
    return {
      vocab: [...v.posture, ...v.anchor, ...v.contact, ...v.item, ...v.activity].map((e) => e.id),
      staging: JSON.stringify(stagingInput(s, reg, [ANN]).staging ?? {}),
      live: liveSources(s, reg).map((l) => l.sourceId),
      chips,
    };
  };

  function plain(on: string[], frame: 'equal' | 'play'): CampaignState {
    resetBlockingHooks(); // readers stack and the first answer wins
    registerFrameReader(() => frame);
    const s = campaign(reg, 4);
    setRelation(s, ANN, { stateId: 'confidant' });
    enable(s, ...on);
    const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
    expect(errors(r.events)).toEqual([]);
    return r.state;
  }

  it('a disabled category removes its entries from the vocabulary, the extractor\'s input and the strip\'s menu', () => {
    const off = idsIn(plain([], 'play'));
    const on = idsIn(plain(['restraint', 'worship', 'objectification', 'humiliation', 'service'], 'play'));
    const gated = ['ring_gag', 'hood', 'foot_worship'];
    for (const id of gated) {
      expect(on.vocab, id).toContain(id);
      expect(off.vocab, id).not.toContain(id);
      expect(off.staging, id).not.toContain(`"${id}"`);
      expect(off.chips.join(' '), id).not.toContain(`:${id}`);
    }
    expect(on.chips.join(' ')).toContain('blockingItems:hood');
  });

  it('a dynamic entry at frame equal is absent everywhere, and present at play', () => {
    const all = [...reg.contentCategories.keys()];
    const equal = idsIn(plain(all, 'equal'));
    const play = idsIn(plain(all, 'play'));
    const dynamic = [...reg.blockingItems.values(), ...reg.blockingContacts.values(), ...reg.blockingActivities.values()].filter((e) => e.scope === 'dynamic').map((e) => e.id);
    expect(dynamic.length).toBeGreaterThan(0);
    for (const id of dynamic) expect(equal.vocab, id).not.toContain(id);
    expect(dynamic.some((id) => play.vocab.includes(id))).toBe(true);
    const dynamicSources = [...reg.momentSources.values()].filter((e) => e.scope === 'dynamic').map((e) => e.id);
    expect(dynamicSources.length).toBeGreaterThan(0);
    for (const id of dynamicSources) {
      expect(equal.live, id).not.toContain(id);
      expect(equal.staging, id).not.toContain(`"${id}"`);
    }
  });
});

describe('every scene element added by P15a resolves', () => {
  it('every entry of the twelve registries that the player can see has a panel', () => {
    const ids = ['worshipTargets', 'blockingPostures', 'blockingAnchors', 'blockingContacts', 'blockingItems', 'blockingActivities', 'momentSources',
      'contactPhysics', 'stimulusKinds', 'commanderConditions'] as const;
    for (const name of ids) expect(REGISTRY_NAMES, name).toContain(name);
    const host = h('div');
    for (const name of ids) {
      expect(reg[name].size, name).toBeGreaterThan(0);
      for (const id of reg[name].keys()) {
        const a = h('span', { 'data-analyze': `${name}:${id}` });
        host.append(a);
      }
    }
    expect(unresolved(host, env(campaign(reg, 4)))).toEqual([]);
  });

  it('the strip, the card and the panel of one scene resolve together, with a hold, a moment and a worn item at once', () => {
    const s = scene({ widths: SENTINEL.widths, skill: 2, shift: 0, expected: '2' });
    const host = screen(s);
    expect(host.querySelectorAll('[data-analyze]').length).toBeGreaterThan(8);
    expect(unresolved(host, env(s))).toEqual([]);
  });
});
