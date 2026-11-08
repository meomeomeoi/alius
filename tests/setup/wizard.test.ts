import { describe, it, expect, beforeAll, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { loadPacks } from '../../src/content/loader';
import type { Registries } from '../../src/content/types';
import { ALL_SECTIONS, type ImportSection } from '../../src/llm/calls/profileImport';
import type { ImportOutcome, ImportedProfile } from '../../src/setup/profile';
import { Wizard, difficultyHint, manualOptions, type WizardState } from '../../src/setup/wizard';

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

function make(opts: { persona?: string; canBind?: boolean; desireBond?: boolean } = {}) {
  const pending: Array<ReturnType<typeof deferred<ImportOutcome>>> = [];
  const importer = vi.fn((_avatar: string, _sections: ImportSection[]) => {
    const d = deferred<ImportOutcome>();
    pending.push(d);
    return d.promise;
  });
  const changes: WizardState[] = [];
  const w = new Wizard(
    { registries: reg, desireBondDefects: opts.desireBond ?? false, importer, onChange: (s) => changes.push(structuredClone(s)) },
    { personaName: opts.persona ?? 'Vale', canBindCurrent: opts.canBind ?? false },
  );
  return { w, importer, pending, changes };
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
    expect(w.state.step).toBe('units');
    w.next();
    expect(w.state.step).toBe('review');
    w.back();
    expect(w.state.step).toBe('units');
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
    expect(importer).toHaveBeenCalledWith('ann.png', [...ALL_SECTIONS]);
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

  it('entering calibration starts the first unit import', () => {
    const { w, importer } = make();
    w.setStart('start_vesper');
    w.setCrime('mutiny');
    w.toggleUnit(card('ann'));
    w.next();
    w.next();
    expect(w.state.step).toBe('calibration');
    expect(importer).toHaveBeenCalledTimes(1);
    w.setCalibrationIndex(5);
    expect(w.state.calibrationIndex).toBe(0);
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
    expect(importer).toHaveBeenLastCalledWith('ann.png', ['signature']);
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

  it('regenerate ignores a stale result', async () => {
    const { w, pending } = await ready();
    w.regenerate(0, 'signature');
    w.regenerate(0, 'role');
    pending[1].resolve({
      kind: 'ok', dropped: [], missing: [],
      profile: { roleCandidates: [], signatureCandidates: [{ templateId: 'sig_frenzy', name: 'W', description: 'D' }], defectCandidates: [], notes: '' },
    });
    await flush();
    expect(w.state.units[0].choice.signature!.templateId).toBe('sig_last_stand');
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
