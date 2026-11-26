/**
 * P10e-e Task 22 (R26): her hour's script, one call per phase of her frame through `app.generations` (site `physics.script`, quiet). The
 * output is validated to the README's shape; a failed call leaves her placeholder lines.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createStaging, type StagingController } from '../../src/blocking/controller';
import type { Registries } from '../../src/content/types';
import type { Action } from '../../src/engine/dispatch';
import { COMMANDER, registerFrameReader, resetBlockingHooks } from '../../src/engine/blocking';
import { resetPhysicsHooks } from '../../src/engine/physics/style';
import { getCallType } from '../../src/llm/callTypes';
import '../../src/llm/calls/all';
import { sanitizeScript, type ActivityScriptInput } from '../../src/llm/calls/activityScript';
import { generationSite } from '../../src/llm/sites';
import { ANN, harness, type Harness } from '../helpers/sceneHarness';
import { loadCore } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
afterEach(() => {
  resetBlockingHooks();
  resetPhysicsHooks();
});

const CUES = JSON.stringify({ cues: { watch: ['She looks down.', 'Her eyes find you.', 'A look.'] } });
const IN = { seconds: 90, listeners: [{ id: 'oversight', name: 'Oversight', knows: 'none' as const }] };

describe('the site and the call type', () => {
  it('is declared: a quiet scene site, not rerollable, the mechanic profile', () => {
    expect(generationSite('physics.script')).toMatchObject({ callType: 'activity_script', surface: 'scene', reroll: 'none', record: 'quiet' });
    expect(generationSite('physics.script')!.label(null, '')).toBe('Her hour');
    expect(getCallType('activity_script')).toMatchObject({ profile: 'mechanic', json: true });
  });

  it('the prompt never carries her presence, and asks for no pronoun of the commander', () => {
    const input: ActivityScriptInput = { unitId: ANN, name: 'Ann', card: 'x', activity: 'Reading reports', phase: 2, seconds: 90, hours: 'unknown', style: 'cold', known: ['Node four held.'], listeners: [] };
    const ct = getCallType('activity_script')!;
    const text = `${ct.system(input) as string}\n${ct.prompt(input) as string}`;
    expect(text).not.toMatch(/presence|glancing|\buse\b step/i);
    expect(text).toContain('never use a pronoun for the commander');
    expect(ct.prompt(input)).toContain('Node four held.');
  });
});

describe('sanitizeScript', () => {
  it('keeps the shape, sorts by at and clamps at to the phase', () => {
    const out = sanitizeScript({ lines: [
      { at: 200, who: 'her', to: 'self', text: 'three wounded. three.', covers: true },
      { at: -4, who: 'her', to: 'commander', text: 'still with me down there?', covers: true, ask: true },
      { at: 12, who: 'other', to: 'other', text: 'Unit status, please.', covers: false },
    ] }, IN)!;
    expect(out.map((l) => l.at)).toEqual([0, 12, 90]);
    expect(out[0]).toEqual({ at: 0, who: 'her', to: 'commander', text: 'still with me down there?', covers: true, ask: true });
    expect(out[1]).toEqual({ at: 12, who: 'other', to: 'other', text: 'Unit status, please.', covers: false });
  });

  it('drops a line with a pronoun for the commander', () => {
    const out = sanitizeScript({ lines: [
      { at: 1, who: 'her', to: 'self', text: 'he fidgets again.', covers: true },
      { at: 2, who: 'her', to: 'self', text: 'of course she did.', covers: true }, // another woman: kept
      { at: 3, who: 'her', to: 'other', text: 'she is under my desk.', about: true, covers: true }, // about the commander: dropped
    ] }, IN)!;
    expect(out.map((l) => l.text)).toEqual(['of course she did.']);
  });

  it('a mention is kept only to a listener of the phase; an unknown body cue or decision is dropped, the line stays', () => {
    const out = sanitizeScript({ lines: [
      { at: 5, who: 'her', to: 'other', text: '', mention: { to: 'oversight', plain: 'I have my feet up on something comfortable.', veiled: 'long day. go on.' }, covers: true },
      { at: 6, who: 'her', to: 'other', text: 'go on.', mention: { to: 'nobody', plain: 'x', veiled: 'y' }, covers: true },
      { at: 7, who: 'her', to: 'self', text: 'mm.', body: 'dance', decision: { kind: 'promotion' }, covers: true },
    ] }, IN)!;
    expect(out[0]!.mention).toEqual({ to: 'oversight', plain: 'I have my feet up on something comfortable.', veiled: 'long day. go on.' });
    expect(out[1]).not.toHaveProperty('mention');
    expect(out[2]).toEqual({ at: 7, who: 'her', to: 'self', text: 'mm.', covers: true });
  });

  it('is null for anything without usable lines', () => {
    expect(sanitizeScript('nonsense', IN)).toBeNull();
    expect(sanitizeScript({ lines: [{ at: 1, who: 'x', to: 'self', text: 'a' }] }, IN)).toBeNull();
  });
});

describe('the controller asks at each phase boundary', () => {
  async function world(replies: string[]): Promise<{ h: Harness; staging: StagingController }> {
    registerFrameReader(() => 'play');
    const h = harness(reg, { settings: {}, tweak: (s) => { s.relations[ANN]!.stateId = 'confidant'; s.content = { enabled: ['worship', 'service'] }; } });
    expect(await h.controller.start({ locationId: 'quarters_commander', participants: [ANN], origin: 'event' })).toBe(true);
    h.st.mainReplies = [CUES, ...replies]; // the frame's start asks for her cue pool first, then the script
    const staging = createStaging({
      app: { dispatch: (a: Action) => h.dispatch(a), current: () => ({ state: h.state() }), context: h.context, refreshContext: () => {} } as never,
      registries: () => reg, settings: () => h.settings, generations: h.generations,
      scene: { replyPending: () => false, end: async () => {} }, now: () => 1_000_000, toast: () => {},
    });
    staging.onEvents(h.controller.stage({ type: 'blocking/set', payload: { person: ANN, field: 'activity', value: 'reading_reports' } }));
    staging.onEvents(h.controller.stage({ type: 'blocking/set', payload: { person: COMMANDER, field: 'anchor', value: 'beside_her', relTo: ANN } }));
    expect(h.state().scene!.physics?.sourceKind).toBe('activity');
    return { h, staging };
  }
  const scriptCalls = (h: Harness) => h.st.calls.filter((c) => (c.system ?? '').startsWith('You write the script of one stretch'));

  it('the frame\'s first phase asks once; the validated script is kept for the phase', async () => {
    const answer = JSON.stringify({ lines: [{ at: 3, who: 'her', to: 'self', text: 'who signs these.', covers: true }] });
    const { h, staging } = await world([answer]);
    await staging.idle();
    expect(scriptCalls(h)).toHaveLength(1);
    expect(staging.script()).toEqual([{ at: 3, who: 'her', to: 'self', text: 'who signs these.', covers: true }]);
    expect(staging.script(2)).toBeNull();
  });

  it('a failed call leaves no script (her placeholder lines play); a chat switch drops the scripts', async () => {
    const { staging } = await world(['nonsense']);
    await staging.idle();
    expect(staging.script()).toBeNull();
    resetBlockingHooks();
    const ok = await world([JSON.stringify({ lines: [{ at: 3, who: 'her', to: 'self', text: 'mm.', covers: true }] })]);
    await ok.staging.idle();
    expect(ok.staging.script()).not.toBeNull();
    ok.staging.reset();
    ok.staging.resume();
    expect(ok.staging.script()).toBeNull();
  });
});
