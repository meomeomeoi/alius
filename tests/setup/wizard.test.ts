import { describe, it, expect, beforeAll, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { loadPacks } from '../../src/content/loader';
import type { Registries } from '../../src/content/types';
import { ALL_SECTIONS, type ImportSection } from '../../src/llm/calls/profileImport';
import type { ImportOutcome, ImportedProfile } from '../../src/setup/profile';
import { Wizard, difficultyHint, manualOptions, type WizardState } from '../../src/setup/wizard';
import type { CommanderImportOutcome } from '../../src/setup/commander';
import { validateCommanderSetup } from '../../src/engine/commander/profile';

let reg: Registries;
beforeAll(async () => {
  const r = await loadPacks(['content/core'], async (p) => JSON.parse(await readFile(p, 'utf8')));
  expect(r.errors).toEqual([]);
  reg = r.registries;
});

const PROFILE: ImportedProfile = {
  roleCandidates: [{ roleId: 'defender', reason: 'r1' }, { roleId: 'assault', reason: 'r2' }],
  values: { pragmatism: -1, autonomy: 1, ingroup: 3, mercy: 1, corporate: -2, sacrifice: 2 },
  likes: ['tea'], dislikes: ['noise'], triggers: ['fire'],
  signatureCandidates: [
    { templateId: 'sig_last_stand', name: 'Litany', description: 'She reads names.' },
    { templateId: 'sig_shared_pain', name: 'Carry It', description: 'She takes the blow.' },
  ],
  defectCandidates: [{ defectId: 'threat_saturation', origin: 'Three tours.' }, { defectId: 'pain_inversion', origin: 'Burned out.' }],
  baseline: { trust: 12, affinity: 3, attraction: 1 },
  notes: 'n',
};
const OK: ImportOutcome = { kind: 'ok', profile: PROFILE, dropped: [], missing: [] };

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

function make(opts: { persona?: string; canBind?: boolean; desireBond?: boolean; random?: () => number } = {}) {
  const pending: Array<ReturnType<typeof deferred<ImportOutcome>>> = [];
  const importer = vi.fn((_avatar: string, _sections: ImportSection[], _world: Record<string, string>) => {
    const d = deferred<ImportOutcome>();
    pending.push(d);
    return d.promise;
  });
  const pendingCommander: Array<ReturnType<typeof deferred<CommanderImportOutcome>>> = [];
  const commanderImporter = vi.fn(() => {
    const d = deferred<CommanderImportOutcome>();
    pendingCommander.push(d);
    return d.promise;
  });
  const changes: WizardState[] = [];
  const w = new Wizard(
    { registries: reg, desireBondDefects: opts.desireBond ?? false, importer, commanderImporter, random: opts.random, onChange: (s) => changes.push(structuredClone(s)) },
    { personaName: opts.persona ?? 'Vale', canBindCurrent: opts.canBind ?? false },
  );
  return { w, importer, pending, pendingCommander, commanderImporter, changes };
}
const card = (n: string) => ({ avatar: `${n}.png`, name: n[0].toUpperCase() + n.slice(1) });
const flush = () => new Promise((r) => setTimeout(r, 0));

/** A wizard with one calibrated unit (status ready) at index 0. */
async function ready() {
  const m = make();
  m.w.toggleUnit(card('ann'));
  m.w.calibrate(0);
  m.pending[0].resolve(OK);
  await flush();
  return m;
}

describe('difficultyHint', () => {
  it('difficulty hints 4/3/2/1/0', () => {
    expect([4, 3, 2, 1, 0].map(difficultyHint)).toEqual(['INTENDED', 'HARD', 'BRUTAL', 'HELLISH', 'HELLISH']);
  });
});

describe('Wizard', () => {
  it('default commander name comes from persona, falls back to Commander', () => {
    expect(make({ persona: 'Vale' }).w.state.commanderName).toBe('Vale');
    expect(make({ persona: '  ' }).w.state.commanderName).toBe('Commander');
    expect(make().w.state).toMatchObject({ step: 'dossier', startId: null, crimeId: null, units: [], target: 'new_group', canBindCurrent: false });
  });

  it('dossier needs name, start and crime', () => {
    const { w } = make();
    expect(w.canAdvance().ok).toBe(false);
    w.setStart('start_vesper');
    expect(w.canAdvance().ok).toBe(false);
    w.setCrime('mutiny');
    expect(w.canAdvance()).toEqual({ ok: true });
    w.setCommanderName('   ');
    expect(w.canAdvance().ok).toBe(false);
    w.setCommanderName('Vale');
    w.setStart('start_nope');
    expect(w.state.startId).toBe('start_vesper');
  });

  it('cannot select a fifth unit, and toggling again deselects', () => {
    const { w } = make();
    for (const n of ['a', 'b', 'c', 'd', 'e']) w.toggleUnit(card(n));
    expect(w.state.units.map((u) => u.avatar)).toEqual(['a.png', 'b.png', 'c.png', 'd.png']);
    w.toggleUnit(card('b'));
    expect(w.state.units.map((u) => u.avatar)).toEqual(['a.png', 'c.png', 'd.png']);
  });

  it('new unit draft has the documented defaults', () => {
    const { w } = make();
    w.toggleUnit(card('ann'));
    expect(w.state.units[0]).toMatchObject({
      avatar: 'ann.png', displayName: 'Ann', status: 'idle', candidates: null, secondDefect: false,
      choice: {
        roleId: null, signature: null, defects: [], likes: [], dislikes: [], triggers: [],
        values: { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 0, corporate: 0, sacrifice: 0 },
        baseline: { trust: 20, affinity: 0, attraction: 0 },
      },
    });
  });

  it('zero units skips calibration to review', () => {
    const { w } = make();
    w.setStart('start_vesper');
    w.setCrime('mutiny');
    w.next();
    expect(w.state.step).toBe('world');
    w.next();
    expect(w.state.step).toBe('commander');
    w.next();
    expect(w.state.step).toBe('units');
    w.next();
    expect(w.state.step).toBe('review');
    w.back();
    expect(w.state.step).toBe('units');
    w.back();
    expect(w.state.step).toBe('commander');
    w.back();
    expect(w.state.step).toBe('world');
    w.back();
    expect(w.state.step).toBe('dossier');
    w.back();
    expect(w.state.step).toBe('dossier');
  });

  it('next does nothing while canAdvance is false', () => {
    const { w } = make();
    w.next();
    expect(w.state.step).toBe('dossier');
  });

  it('calibrate starts one import and preselects first candidates', async () => {
    const { w, importer, pending } = make();
    w.toggleUnit(card('ann'));
    w.calibrate(0);
    w.calibrate(0);
    expect(w.state.units[0].status).toBe('loading');
    expect(importer).toHaveBeenCalledTimes(1);
    expect(importer).toHaveBeenCalledWith('ann.png', [...ALL_SECTIONS], expect.objectContaining({ disposition: 'guarded' })); // P8: the importer is given the world
    pending[0].resolve(OK);
    await flush();
    const u = w.state.units[0];
    expect(u.status).toBe('ready');
    expect(u.candidates).toEqual(PROFILE);
    expect(u.choice).toMatchObject({
      roleId: 'defender',
      signature: { templateId: 'sig_last_stand', name: 'Litany', description: 'She reads names.' },
      defects: [{ id: 'threat_saturation', origin: 'Three tours.' }],
      values: PROFILE.values, likes: ['tea'], dislikes: ['noise'], triggers: ['fire'],
      baseline: { trust: 12, affinity: 3, attraction: 1 },
    });
    w.calibrate(0);
    expect(importer).toHaveBeenCalledTimes(1);
  });

  it('entering calibration starts every unit import at once, not one per page', () => {
    const { w, importer } = make();
    w.setStart('start_vesper');
    w.setCrime('mutiny');
    w.toggleUnit(card('ann'));
    w.toggleUnit(card('bea'));
    w.next();
    w.next();
    w.next();
    w.next();
    expect(w.state.step).toBe('calibration');
    expect(importer.mock.calls.map((c) => c[0])).toEqual(['ann.png', 'bea.png']);
    expect(w.state.units.map((u) => u.status)).toEqual(['loading', 'loading']);
    w.setCalibrationIndex(1);
    expect(importer).toHaveBeenCalledTimes(2); // paging does not import again
    w.setCalibrationIndex(5);
    expect(w.state.calibrationIndex).toBe(1);
  });

  it('stale import result is ignored after the unit is removed', async () => {
    const { w, pending } = make();
    w.toggleUnit(card('ann'));
    w.calibrate(0);
    w.toggleUnit(card('ann')); // removed
    w.toggleUnit(card('ann')); // same card selected again: a new draft
    pending[0].resolve(OK);
    await flush();
    expect(w.state.units).toHaveLength(1);
    expect(w.state.units[0].status).toBe('idle');
    expect(w.state.units[0].candidates).toBeNull();
  });

  it('result of a disposed wizard is ignored', async () => {
    const { w, pending, changes } = make();
    w.toggleUnit(card('ann'));
    w.calibrate(0);
    const before = changes.length;
    w.dispose();
    pending[0].resolve(OK);
    await flush();
    expect(w.state.units[0].status).toBe('loading');
    expect(changes).toHaveLength(before);
  });

  it('manual outcome sets manual status and notice', async () => {
    const { w, pending } = make();
    w.toggleUnit(card('ann'));
    w.calibrate(0);
    pending[0].resolve({ kind: 'manual', reason: 'network down' });
    await flush();
    expect(w.state.units[0]).toMatchObject({ status: 'manual', notice: 'network down', candidates: null });
  });

  it('unit with missing card is manual', async () => {
    const { w, pending } = make();
    w.toggleUnit({ avatar: 'gone.png', name: 'Gone' });
    w.calibrate(0);
    pending[0].resolve({ kind: 'manual', reason: 'card not found' });
    await flush();
    expect(w.state.units[0]).toMatchObject({ status: 'manual', notice: 'card not found', displayName: 'Gone', avatar: 'gone.png' });
  });

  it('a throwing importer becomes manual', async () => {
    const m = make();
    m.importer.mockImplementationOnce(() => Promise.reject(new Error('kaboom')));
    m.w.toggleUnit(card('ann'));
    m.w.calibrate(0);
    await flush();
    expect(m.w.state.units[0]).toMatchObject({ status: 'manual', notice: 'kaboom' });
  });

  it('setManual switches to manual and drops a pending import', async () => {
    const { w, pending } = make();
    w.toggleUnit(card('ann'));
    w.calibrate(0);
    w.setManual(0);
    pending[0].resolve(OK);
    await flush();
    expect(w.state.units[0]).toMatchObject({ status: 'manual', candidates: null });
    expect(w.state.units[0].choice.roleId).toBeNull();
  });

  it('regenerate signature keeps the chosen role and values', async () => {
    const { w, importer, pending } = await ready();
    w.update(0, { roleId: 'sniper', values: { ...PROFILE.values!, mercy: -2 } });
    w.regenerate(0, 'signature');
    expect(importer).toHaveBeenLastCalledWith('ann.png', ['signature'], expect.objectContaining({ disposition: 'guarded' }));
    pending[1].resolve({
      kind: 'ok', dropped: [], missing: [],
      profile: { roleCandidates: [], signatureCandidates: [{ templateId: 'sig_frenzy', name: 'Wild', description: 'Hits.' }], defectCandidates: [], notes: '' },
    });
    await flush();
    const u = w.state.units[0];
    expect(u.choice.roleId).toBe('sniper');
    expect(u.choice.values.mercy).toBe(-2);
    expect(u.choice.signature).toEqual({ templateId: 'sig_frenzy', name: 'Wild', description: 'Hits.' });
    expect(u.candidates!.signatureCandidates).toHaveLength(1);
    expect(u.candidates!.roleCandidates).toHaveLength(2); // other sections untouched
    expect(u.choice.defects).toEqual([{ id: 'threat_saturation', origin: 'Three tours.' }]);
  });

  it('regenerate that finds nothing keeps the current choice', async () => {
    const { w, pending } = await ready();
    w.regenerate(0, 'role');
    pending[1].resolve({ kind: 'ok', dropped: [], missing: ['role'], profile: { roleCandidates: [], signatureCandidates: [], defectCandidates: [], notes: '' } });
    await flush();
    expect(w.state.units[0].choice.roleId).toBe('defender');
    expect(w.state.units[0].candidates!.roleCandidates).toHaveLength(2);
  });

  const sigOutcome = (id: string): ImportOutcome => ({
    kind: 'ok', dropped: [], missing: [],
    profile: { roleCandidates: [], signatureCandidates: [{ templateId: id, name: 'W', description: 'D' }], defectCandidates: [], notes: '' },
  });
  const roleOutcome = (id: string): ImportOutcome => ({
    kind: 'ok', dropped: [], missing: [],
    profile: { roleCandidates: [{ roleId: id, reason: 'r' }], signatureCandidates: [], defectCandidates: [], notes: '' },
  });

  it('a newer regenerate of the same section wins over an older, late result', async () => {
    const { w, pending } = await ready();
    w.regenerate(0, 'signature');
    w.regenerate(0, 'signature');
    pending[1].resolve(sigOutcome('sig_frenzy')); // the first, now stale
    await flush();
    expect(w.state.units[0].choice.signature!.templateId).toBe('sig_last_stand');
    expect(w.state.units[0].regenerating).toEqual(['signature']); // the second is still running
    pending[2].resolve(sigOutcome('sig_mock'));
    await flush();
    expect(w.state.units[0].choice.signature!.templateId).toBe('sig_mock');
    expect(w.state.units[0].regenerating).toEqual([]);
  });

  it('regenerating two different sections applies both, in any order', async () => {
    const { w, pending } = await ready();
    w.regenerate(0, 'signature');
    w.regenerate(0, 'role');
    expect(w.state.units[0].regenerating).toEqual(['signature', 'role']);
    pending[2].resolve(roleOutcome('sniper'));
    await flush();
    pending[1].resolve(sigOutcome('sig_frenzy'));
    await flush();
    expect(w.state.units[0].choice.roleId).toBe('sniper');
    expect(w.state.units[0].choice.signature!.templateId).toBe('sig_frenzy');
    expect(w.state.units[0].regenerating).toEqual([]);
  });

  it('a regenerate in flight blocks advancing, and setManual cancels it', async () => {
    const m = make();
    m.w.setStart('start_vesper');
    m.w.setCrime('mutiny');
    m.w.toggleUnit(card('ann'));
    m.w.next();
    m.w.next();
    m.w.next();
    m.w.next();
    m.pending[0].resolve(OK);
    await flush();
    expect(m.w.canAdvance()).toEqual({ ok: true });
    m.w.regenerate(0, 'signature');
    expect(m.w.canAdvance().ok).toBe(false);
    expect(m.w.canAdvance().reason).toMatch(/regenerat/i);
    m.w.setManual(0);
    expect(m.w.state.units[0].regenerating).toEqual([]);
    m.pending[1].resolve(sigOutcome('sig_frenzy')); // late, ignored
    await flush();
    expect(m.w.state.units[0].choice.signature!.templateId).toBe('sig_last_stand');
  });

  it('second defect toggle off removes the second defect', async () => {
    const { w } = await ready();
    w.update(0, { secondDefect: true, defects: [{ id: 'threat_saturation', origin: 'a' }, { id: 'pain_inversion', origin: 'b' }] });
    expect(w.state.units[0].choice.defects).toHaveLength(2);
    w.update(0, { secondDefect: false });
    expect(w.state.units[0].choice.defects).toEqual([{ id: 'threat_saturation', origin: 'a' }]);
    expect(w.state.units[0].secondDefect).toBe(false);
  });

  it('calibration cannot advance without a defect', async () => {
    const m = make();
    m.w.setStart('start_vesper');
    m.w.setCrime('mutiny');
    m.w.toggleUnit(card('ann'));
    m.w.next();
    m.w.next();
    m.w.next();
    m.w.next();
    expect(m.w.canAdvance().ok).toBe(false); // still loading
    m.w.setManual(0);
    m.w.update(0, { roleId: 'assault', signature: { templateId: 'sig_frenzy', name: 'W', description: 'D' } });
    expect(m.w.canAdvance().ok).toBe(false);
    expect(m.w.canAdvance().reason).toMatch(/defect/i);
    m.w.update(0, { defects: [{ id: 'echo_bleed', origin: 'o' }] });
    expect(m.w.canAdvance()).toEqual({ ok: true });
  });

  it('result is null when validateSetup fails and a SetupResult otherwise', async () => {
    const { w } = await ready();
    w.setStart('start_vesper');
    w.setCrime('mutiny');
    expect(w.result()).toMatchObject({
      commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny',
      units: [{
        cardRef: 'ann.png', displayName: 'Ann', roleId: 'defender',
        signature: { templateId: 'sig_last_stand' }, defects: [{ id: 'threat_saturation' }],
        baseline: { trust: 12, affinity: 3, attraction: 1 },
      }],
    });
    w.update(0, { values: { ...PROFILE.values!, mercy: 9 } });
    expect(w.result()).toBeNull();
    w.update(0, { values: PROFILE.values! });
    w.update(0, { roleId: null });
    expect(w.result()).toBeNull();
  });

  it('review needs a valid setup, and a desire_bond defect is refused while the setting is off', async () => {
    const { w } = await ready();
    w.setStart('start_vesper');
    w.setCrime('mutiny');
    w.update(0, { defects: [{ id: 'imprint_hunger', origin: 'o' }] });
    expect(w.result()).toBeNull();
    w.update(0, { defects: [{ id: 'echo_bleed', origin: 'o' }] });
    expect(w.result()).not.toBeNull();
  });

  it('target can only be the current group when binding is possible', () => {
    const a = make({ canBind: false });
    a.w.setTarget('current_group');
    expect(a.w.state.target).toBe('new_group');
    const b = make({ canBind: true });
    b.w.setTarget('current_group');
    expect(b.w.state.target).toBe('current_group');
  });

  it('subscribe notifies listeners until they unsubscribe', () => {
    const { w } = make();
    const seen: string[] = [];
    const off = w.subscribe((s) => seen.push(s.commanderName));
    w.setCommanderName('A');
    off();
    w.setCommanderName('B');
    expect(seen).toEqual(['A']);
  });

  it('every change notifies onChange', () => {
    const { w, changes } = make();
    w.setCommanderName('X');
    w.toggleUnit(card('ann'));
    expect(changes.length).toBeGreaterThanOrEqual(2);
    expect(changes.at(-1)!.units).toHaveLength(1);
  });
});

describe('manualOptions', () => {
  it('desire_bond defects are not offered in manual lists when disabled', () => {
    const off = manualOptions(reg, false);
    const on = manualOptions(reg, true);
    expect(off.roles).toHaveLength(6);
    expect(off.signatures).toHaveLength(12);
    expect(off.defects).toHaveLength(14);
    expect(off.defects.some((d) => d.category === 'desire_bond')).toBe(false);
    expect(on.defects).toHaveLength(18);
  });
});

// ---------------------------------------------------------------------------------------------
// P7: the COMMANDER FILE step and unit tastes

const IMPORTED_COMMANDER: CommanderImportOutcome = {
  kind: 'ok',
  result: {
    personaName: 'Mara Vale',
    setup: { body: { strength: 4, endurance: 3, reflexes: 2 }, expression: 2, seasoning: 4, traits: { regular: ['old_wound'] } },
    reasons: { old_wound: 'A limp from an old fight.' },
    notes: 'ok',
  },
};
/** mulberry32: a small seedable generator for the random commander. */
const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const toCommander = () => {
  const m = make();
  m.w.setStart('start_vesper');
  m.w.setCrime('mutiny');
  m.w.next();
  m.w.next(); // dossier → world → commander
  expect(m.w.state.step).toBe('commander');
  return m;
};

describe('Wizard: commander file (P7)', () => {
  it('starts with the defaults and an idle import', () => {
    const { w } = make();
    expect(w.state.commander).toEqual({ body: { strength: 3, endurance: 3, reflexes: 2 }, expression: 3, seasoning: 3, traits: { regular: [] } });
    expect(w.state.commanderImport).toEqual({ status: 'idle', reasons: {} });
  });

  it('dossier → world → commander → units', () => {
    const { w } = toCommander();
    expect(w.canAdvance()).toEqual({ ok: true });
    w.next();
    expect(w.state.step).toBe('units');
  });

  it('setBody refuses a 5 and an 8th point, a 0 and a non-integer', () => {
    const { w } = make();
    w.setBody('reflexes', 5);
    expect(w.state.commander.body.reflexes).toBe(2);
    w.setBody('strength', 4);
    w.setBody('endurance', 4);
    expect(w.state.commander.body).toEqual({ strength: 4, endurance: 4, reflexes: 2 }); // spends exactly 7
    w.setBody('reflexes', 3); // the 8th point
    expect(w.state.commander.body.reflexes).toBe(2);
    w.setBody('endurance', 0);
    w.setBody('endurance', 2.5);
    expect(w.state.commander.body.endurance).toBe(4);
    w.setBody('endurance', 1); // lowering is always fine
    w.setBody('reflexes', 3);
    expect(w.state.commander.body).toEqual({ strength: 4, endurance: 1, reflexes: 3 });
  });

  it('expression and seasoning take 1–5 only', () => {
    const { w } = make();
    w.setExpression(5);
    w.setSeasoning(1);
    expect([w.state.commander.expression, w.state.commander.seasoning]).toEqual([5, 1]);
    w.setExpression(6);
    w.setExpression(0);
    w.setSeasoning(2.5);
    expect([w.state.commander.expression, w.state.commander.seasoning]).toEqual([5, 1]);
  });

  it('toggling a third regular trait is ignored', () => {
    const { w } = make();
    w.toggleTrait('insomniac');
    w.toggleTrait('old_wound');
    w.toggleTrait('bookish');
    expect(w.state.commander.traits.regular).toEqual(['insomniac', 'old_wound']);
    w.toggleTrait('insomniac'); // toggles off
    w.toggleTrait('bookish');
    expect(w.state.commander.traits.regular).toEqual(['old_wound', 'bookish']);
  });

  it('an exclusive pair, an unknown id and a setting-gated trait are refused', () => {
    const { w } = make();
    w.toggleTrait('corporate_polish');
    w.toggleTrait('street_raised');
    w.toggleTrait('no_such_trait');
    expect(w.state.commander.traits.regular).toEqual(['corporate_polish']);
    const gated = new Wizard(
      { registries: { ...reg, commanderTraits: new Map([...reg.commanderTraits, ['bond', { id: 'bond', kind: 'regular', requiresSettings: { desireBondDefects: true }, effects: [] } as never]]) }, desireBondDefects: false, importer: vi.fn(), onChange: () => {} },
      { personaName: 'V', canBindCurrent: false },
    );
    gated.toggleTrait('bond');
    expect(gated.state.commander.traits.regular).toEqual([]);
  });

  it('the special trait: one at a time, toggled off by the same click, never a regular', () => {
    const { w } = make();
    w.toggleTrait('vow_of_distance');
    expect(w.state.commander.traits).toEqual({ regular: [], special: 'vow_of_distance' });
    w.toggleTrait('insomniac');
    expect(w.state.commander.traits).toEqual({ regular: ['insomniac'], special: 'vow_of_distance' });
    w.toggleTrait('vow_of_distance');
    expect(w.state.commander.traits).toEqual({ regular: ['insomniac'] });
  });

  it('canAdvance(commander) is the creation validator', () => {
    const { w } = toCommander();
    w.state.commander.body = { strength: 4, endurance: 4, reflexes: 4 }; // 9 points: only reachable by hand
    expect(w.canAdvance().ok).toBe(false);
    expect(w.canAdvance().reason).toMatch(/pool/);
    w.next();
    expect(w.state.step).toBe('commander');
  });

  it('prefill applies the sanitized import and keeps reasons', async () => {
    const { w, pendingCommander, commanderImporter } = make();
    w.prefillFromPersona();
    expect(w.state.commanderImport.status).toBe('loading');
    expect(commanderImporter).toHaveBeenCalledTimes(1);
    pendingCommander[0].resolve(IMPORTED_COMMANDER);
    await flush();
    expect(w.state.commander).toEqual({ body: { strength: 4, endurance: 3, reflexes: 2 }, expression: 2, seasoning: 4, traits: { regular: ['old_wound'] } });
    expect(w.state.commanderImport).toMatchObject({ status: 'ready', reasons: { old_wound: 'A limp from an old fight.' }, notes: 'ok', source: 'Mara Vale' });
  });

  it('a prefill keeps the special trait the player already chose', async () => {
    const { w, pendingCommander } = make();
    w.toggleTrait('vow_of_distance');
    w.prefillFromPersona();
    pendingCommander[0].resolve(IMPORTED_COMMANDER);
    await flush();
    expect(w.state.commander.traits).toEqual({ regular: ['old_wound'], special: 'vow_of_distance' });
    // and an excluded special is not forced in: the import never carries one, so nothing to clash with
    expect(validateCommanderSetup(w.state.commander, reg, { desireBondDefects: false })).toEqual([]);
  });

  it('a manual outcome keeps what the player has and says why', async () => {
    const { w, pendingCommander } = make();
    w.setBody('strength', 4);
    w.prefillFromPersona();
    pendingCommander[0].resolve({ kind: 'manual', reason: 'the persona has no description' });
    await flush();
    expect(w.state.commander.body.strength).toBe(4);
    expect(w.state.commanderImport).toMatchObject({ status: 'manual', notice: 'the persona has no description' });
  });

  it('a throwing importer becomes manual', async () => {
    const { w, commanderImporter, pendingCommander } = make();
    commanderImporter.mockImplementationOnce(() => Promise.reject(new Error('boom')));
    w.prefillFromPersona();
    await flush();
    expect(w.state.commanderImport).toMatchObject({ status: 'manual', notice: 'boom' });
    expect(pendingCommander).toHaveLength(0);
  });

  it('a late prefill after back/next is ignored', async () => {
    const { w, pendingCommander } = toCommander();
    w.prefillFromPersona();
    w.next(); // leaves the step
    w.back();
    pendingCommander[0].resolve(IMPORTED_COMMANDER);
    await flush();
    expect(w.state.commander.body).toEqual({ strength: 3, endurance: 3, reflexes: 2 });
    expect(w.state.commanderImport.status).not.toBe('ready');
  });

  it('only the newest prefill counts, and a disposed wizard ignores the result', async () => {
    const a = make();
    a.w.prefillFromPersona();
    a.w.prefillFromPersona();
    a.pendingCommander[1].resolve(IMPORTED_COMMANDER);
    a.pendingCommander[0].resolve({ kind: 'manual', reason: 'old' });
    await flush();
    expect(a.w.state.commanderImport.status).toBe('ready');
    const b = make();
    b.w.prefillFromPersona();
    b.w.dispose();
    b.pendingCommander[0].resolve(IMPORTED_COMMANDER);
    await flush();
    expect(b.w.state.commander.seasoning).toBe(3);
  });

  it('without an importer the prefill is manual', async () => {
    const w = new Wizard({ registries: reg, desireBondDefects: false, importer: vi.fn(), onChange: () => {} }, { personaName: 'V', canBindCurrent: false });
    w.prefillFromPersona();
    await flush();
    expect(w.state.commanderImport.status).toBe('manual');
  });

  it('randomCommander is valid for 200 seeds', () => {
    const seen = { traits: new Set<number>(), spent: new Set<number>() };
    for (let seed = 1; seed <= 200; seed++) {
      const { w } = make({ random: rng(seed) });
      w.randomCommander();
      const c = w.state.commander;
      expect(validateCommanderSetup(c, reg, { desireBondDefects: false }), `seed ${seed}`).toEqual([]);
      expect(c.traits.special).toBeUndefined();
      seen.traits.add(c.traits.regular.length);
      seen.spent.add(c.body.strength + c.body.endurance + c.body.reflexes - 3);
    }
    expect([...seen.traits].sort()).toEqual([0, 1, 2]);
    expect(seen.spent.size).toBeGreaterThan(3);
  });

  it('randomCommander drops a stale prefill and resets the import status', async () => {
    const { w, pendingCommander } = make({ random: rng(5) });
    w.prefillFromPersona();
    w.randomCommander();
    expect(w.state.commanderImport.status).toBe('idle');
    pendingCommander[0].resolve(IMPORTED_COMMANDER);
    await flush();
    expect(w.state.commanderImport.status).toBe('idle');
  });
});

describe('Wizard: result carries the commander and unit tastes (P7)', () => {
  it('the result has the commander and every unit\'s tastes', async () => {
    const m = await ready();
    m.w.setStart('start_vesper');
    m.w.setCrime('mutiny');
    m.w.setBody('strength', 4);
    m.w.toggleTrait('bookish');
    m.w.update(0, { tastes: ['respects_strength', 'drawn_to_older'] });
    const r = m.w.result()!;
    expect(r.commander).toEqual({ body: { strength: 4, endurance: 3, reflexes: 2 }, expression: 3, seasoning: 3, traits: { regular: ['bookish'] } });
    expect(r.units[0].tastes).toEqual(['respects_strength', 'drawn_to_older']);
  });

  it('a new unit draft has no tastes; the import preselects its suggestions', async () => {
    const m = make();
    m.w.toggleUnit(card('ann'));
    expect(m.w.state.units[0].choice.tastes).toEqual([]);
    m.w.calibrate(0);
    m.pending[0].resolve({ kind: 'ok', profile: { ...PROFILE, commanderTastes: ['wary_of_brutes'] }, dropped: [], missing: [] });
    await flush();
    expect(m.w.state.units[0].choice.tastes).toEqual(['wary_of_brutes']);
  });

  it('a tastes regenerate replaces only the tastes', async () => {
    const m = await ready();
    m.w.update(0, { roleId: 'assault' });
    m.w.regenerate(0, 'tastes');
    m.pending[1].resolve({ kind: 'ok', profile: { ...PROFILE, commanderTastes: ['protective_of_frail'] }, dropped: [], missing: [] });
    await flush();
    expect(m.w.state.units[0].choice.tastes).toEqual(['protective_of_frail']);
    expect(m.w.state.units[0].choice.roleId).toBe('assault');
  });

  it('more than three tastes make the review step fail', async () => {
    const m = await ready();
    m.w.setStart('start_vesper');
    m.w.setCrime('mutiny');
    m.w.update(0, { tastes: ['respects_strength', 'wary_of_brutes', 'protective_of_frail', 'drawn_to_older'] });
    expect(m.w.result()).toBeNull();
  });
});

describe('the world step and presets (P8)', () => {
  const dossier = (w: Wizard) => { w.setStart('start_vesper'); w.setCrime('mutiny'); };
  const STANDARD = { gender_norms: 'indifferent', offspec_stigma: 'tolerated', oversight: 'standard', bloom_horror: 'restrained', tone: 'grim', disposition: 'guarded' };
  const BRUTAL = { gender_norms: 'corporate_machismo', offspec_stigma: 'hunted', oversight: 'brutal', bloom_horror: 'graphic', tone: 'bleak', disposition: 'hazardous' };

  it('the order is dossier, world, commander, units, calibration, review; the world starts as Standard', () => {
    const { w } = make();
    expect(w.state.world).toEqual({ options: STANDARD, preset: 'standard' });
    dossier(w);
    const seen: string[] = [w.state.step];
    for (let i = 0; i < 2; i++) { w.next(); seen.push(w.state.step); }
    expect(seen).toEqual(['dossier', 'world', 'commander']);
    w.back();
    expect(w.state.step).toBe('world');
    w.back();
    expect(w.state.step).toBe('dossier');
  });

  it('presets set every option', () => {
    const { w } = make();
    w.applyPreset('brutal');
    expect(w.state.world).toEqual({ options: BRUTAL, preset: 'brutal' });
    w.applyPreset('gentle');
    expect(w.state.world.options).toEqual({ gender_norms: 'indifferent', offspec_stigma: 'tolerated', oversight: 'lenient', bloom_horror: 'restrained', tone: 'grim_hope', disposition: 'kind' });
    w.applyPreset('ghost');
    expect(w.state.world.preset).toBe('gentle'); // an unknown preset changes nothing
  });

  it('manual changes after a preset persist across back/next', () => {
    const { w } = make();
    dossier(w);
    w.applyPreset('brutal');
    w.setWorldOption('oversight', 'lenient');
    expect(w.state.world.preset).toBeNull();
    w.next(); w.next();
    expect(w.state.step).toBe('commander');
    w.back(); w.back();
    expect(w.state.step).toBe('dossier');
    w.next();
    expect(w.state.world.options).toEqual({ ...BRUTAL, oversight: 'lenient' });
    expect(w.state.world.preset).toBeNull();
  });

  it('a manual change that lands on a preset selects it again; unknown ids are ignored', () => {
    const { w } = make();
    w.setWorldOption('disposition', 'hazardous');
    expect(w.state.world.preset).toBeNull();
    w.setWorldOption('disposition', 'guarded');
    expect(w.state.world.preset).toBe('standard');
    const before = structuredClone(w.state.world);
    w.setWorldOption('ghost', 'x');
    w.setWorldOption('tone', 'sunny');
    expect(w.state.world).toEqual(before);
  });

  it('the summary has one description per non-default choice and no digits', () => {
    const { w } = make();
    expect(w.worldSummary()).toEqual([]);
    w.applyPreset('brutal');
    const lines = w.worldSummary();
    expect(lines).toHaveLength(6);
    for (const line of lines) expect(line).not.toMatch(/\d/);
    const desc = (opt: string, choice: string) => String((reg.worldOptions.get(opt)!.choices as Array<{ id: string; description: string }>).find((c) => c.id === choice)!.description);
    expect(lines[0]).toBe(desc('gender_norms', 'corporate_machismo'));
    w.setWorldOption('tone', 'grim');
    expect(w.worldSummary()).toHaveLength(5);
  });

  it('the importer gets the world', async () => {
    const { w, importer, pending } = make();
    dossier(w);
    w.applyPreset('brutal');
    w.toggleUnit(card('rhea'));
    w.calibrate(0);
    expect(importer).toHaveBeenCalledTimes(1);
    expect(importer.mock.calls[0][2]).toEqual(BRUTAL);
    pending[0].resolve(OK);
    await flush();
  });

  it('changing the world after calibration marks stances stale (re-import offered)', async () => {
    const { w, importer, pending } = make();
    dossier(w);
    w.toggleUnit(card('rhea'));
    w.calibrate(0);
    pending[0].resolve(OK);
    await flush();
    expect(w.state.units[0].worldStale).toBeUndefined();
    w.applyPreset('brutal');
    expect(w.state.units[0].worldStale).toBe(true);
    // the same world again does not mark anything
    const { w: w2 } = make();
    w2.toggleUnit(card('mira'));
    w2.applyPreset('standard');
    expect(w2.state.units[0].worldStale).toBeUndefined();
    // the re-import asks for the world sections only and clears the mark
    w.refreshWorldSections(0);
    expect(importer).toHaveBeenCalledTimes(2);
    expect(importer.mock.calls[1][1]).toEqual(['disposition', 'stances']);
    expect(importer.mock.calls[1][2]).toEqual(BRUTAL);
    pending[1].resolve({ kind: 'ok', profile: { ...PROFILE, dispositionOffset: { offset: 1, reason: 'Hard.' }, worldStances: { gender_norms: { stance: 'shares', strength: 1, reason: 'r' } } }, dropped: [], missing: [] });
    await flush();
    expect(w.state.units[0].worldStale).toBeUndefined();
    expect(w.state.units[0].choice.dispositionOffset).toBe(1);
    expect(w.state.units[0].choice.worldStances).toEqual({ gender_norms: { stance: 'shares', strength: 1, reason: 'r' } });
  });

  it('build carries the world, offsets and stances', async () => {
    const { w, pending } = make();
    dossier(w);
    w.applyPreset('brutal');
    w.toggleUnit(card('rhea'));
    w.calibrate(0);
    pending[0].resolve({ kind: 'ok', profile: { ...PROFILE, dispositionOffset: { offset: -1, reason: 'Eager.' }, worldStances: { offspec_stigma: { stance: 'opposes', strength: 2, reason: 'No.' } } }, dropped: [], missing: [] });
    await flush();
    w.update(0, { worldStances: { offspec_stigma: { stance: 'shares', strength: 1, reason: 'Edited.' } } });
    const r = w.result()!;
    expect(r.world).toEqual({ options: BRUTAL });
    expect(r.units[0]).toMatchObject({ dispositionOffset: -1, dispositionReason: 'Eager.', worldStances: { offspec_stigma: { stance: 'shares', strength: 1, reason: 'Edited.' } } });
  });
});
