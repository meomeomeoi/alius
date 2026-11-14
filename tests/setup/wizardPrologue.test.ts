import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { loadPacks } from '../../src/content/loader';
import type { Registries } from '../../src/content/types';
import { poolSpent, validateCommanderSetup } from '../../src/engine/commander/profile';
import { TUNING } from '../../src/engine/tuning';
import { Wizard } from '../../src/setup/wizard';
import type { ImportOutcome } from '../../src/setup/profile';

let reg: Registries;
beforeAll(async () => {
  const r = await loadPacks(['content/core'], async (p) => JSON.parse(await readFile(p, 'utf8')));
  expect(r.errors).toEqual([]);
  reg = r.registries;
});

const make = (registries: Registries = reg, persona = 'Vale') =>
  new Wizard(
    { registries, desireBondDefects: false, importer: vi.fn(async (): Promise<ImportOutcome> => ({ kind: 'manual', reason: 'test' })), onChange: () => {} },
    { personaName: persona, canBindCurrent: false },
  );

/** Walks to `step` with no units (so calibration is skipped), choosing a start and, when wanted, a crime. */
function walkTo(w: Wizard, step: string, opts: { crime?: boolean } = {}): void {
  w.setStart('start_vesper');
  if (opts.crime !== false) w.setCrime('mutiny');
  for (let i = 0; i < 12 && w.state.step !== step; i++) w.next();
  expect(w.state.step).toBe(step);
}

describe('mode', () => {
  it('default mode is prologue when the start has one', () => {
    const w = make();
    expect(w.state.mode).toBe('prologue');
    w.setStart('start_vesper');
    expect(w.state.mode).toBe('prologue');
  });

  it('start without prologue forces veteran', () => {
    const w = make({ ...reg, prologues: new Map() } as Registries);
    w.setStart('start_vesper');
    expect(w.state.mode).toBe('veteran');
    w.setMode('prologue');
    expect(w.state.mode).toBe('veteran');
  });

  it('setMode switches on the dossier and ignores unknown modes', () => {
    const w = make();
    w.setStart('start_vesper');
    w.setMode('veteran');
    expect(w.state.mode).toBe('veteran');
    w.setMode('prologue');
    expect(w.state.mode).toBe('prologue');
    w.setMode('nonsense' as never);
    expect(w.state.mode).toBe('prologue');
  });

  it('setMode is ignored away from the dossier step', () => {
    const w = make();
    walkTo(w, 'world');
    w.setMode('veteran');
    expect(w.state.mode).toBe('prologue');
  });

  it('switching mode on the dossier keeps every entered field', () => {
    const w = make();
    w.setCommanderName('Ash');
    w.setStart('start_kestrel');
    w.setCrime('purge');
    w.setBody('strength', 2);
    w.applyPreset('standard');
    w.toggleUnit({ avatar: 'a.png', name: 'Ann' });
    const before = structuredClone({ ...w.state, mode: undefined, step: undefined });
    w.setMode('veteran');
    w.setMode('prologue');
    w.setMode('veteran');
    expect(structuredClone({ ...w.state, mode: undefined, step: undefined })).toEqual(before);
    expect(w.state.commanderName).toBe('Ash');
    expect(w.state.crimeId).toBe('purge');
  });
});

describe('steps', () => {
  it('prologue order', () => {
    const w = make();
    expect(w.stepsFor()).toEqual(['dossier', 'world', 'units', 'calibration', 'cold_open', 'intake', 'exam', 'file']);
  });

  it('veteran order is today\'s six', () => {
    const w = make();
    w.setMode('veteran');
    expect(w.stepsFor()).toEqual(['dossier', 'world', 'commander', 'units', 'calibration', 'review']);
  });

  it('next walks the prologue order, skipping calibration when there are no units', () => {
    const w = make();
    w.setStart('start_vesper');
    w.setCrime('mutiny');
    const seen = [w.state.step];
    for (let i = 0; i < 6; i++) { w.next(); seen.push(w.state.step); }
    expect(seen).toEqual(['dossier', 'world', 'units', 'cold_open', 'intake', 'exam', 'file']);
  });

  it('next from units goes to calibration with units and starts the imports', () => {
    const w = make();
    w.setStart('start_vesper');
    w.toggleUnit({ avatar: 'a.png', name: 'Ann' });
    w.next(); // world
    w.next(); // units
    w.next();
    expect(w.state.step).toBe('calibration');
    expect(w.state.units[0].status).toBe('loading');
  });

  it('back from cold_open returns to calibration (or units when there are none)', () => {
    const w = make();
    w.setStart('start_vesper');
    w.toggleUnit({ avatar: 'a.png', name: 'Ann' });
    w.next(); w.next(); w.next(); // calibration
    w.state.units[0].status = 'ready';
    w.state.units[0].choice.roleId = 'assault';
    w.state.units[0].choice.signature = { templateId: 'sig_last_stand', name: 'x', description: 'y' };
    w.state.units[0].choice.defects = [{ id: 'echo_bleed', origin: 'o' }];
    w.next();
    expect(w.state.step).toBe('cold_open');
    w.back();
    expect(w.state.step).toBe('calibration');

    const none = make();
    none.setStart('start_vesper');
    none.next(); none.next(); none.next();
    expect(none.state.step).toBe('cold_open');
    none.back();
    expect(none.state.step).toBe('units');
  });

  it('back walks the prologue order to the dossier', () => {
    const w = make();
    walkTo(w, 'file');
    const seen = [w.state.step];
    for (let i = 0; i < 7; i++) { w.back(); seen.push(w.state.step); }
    expect(seen).toEqual(['file', 'exam', 'intake', 'cold_open', 'units', 'world', 'dossier', 'dossier']);
  });

  it('prologueStep names the entry step behind each fiction step', () => {
    const w = make();
    expect(w.prologueStep()).toBeNull(); // dossier of the wizard
    w.setStart('start_vesper');
    walkTo(w, 'cold_open');
    expect(w.prologueStep()?.kind).toBe('paper_form');
    expect(w.prologueStep()?.fields).toBeUndefined();
    expect(w.prologueStep()?.authoredText?.length).toBeGreaterThan(0);
    w.next();
    expect(w.prologueStep()?.fields).toEqual(['crime', 'name']);
    w.next();
    expect(w.prologueStep()?.fields).toEqual(['body', 'expression', 'seasoning', 'traits']);
    w.next();
    expect(w.prologueStep()?.kind).toBe('dossier');
  });

  it('prologueStep is the kestrel prologue for the kestrel start', () => {
    const w = make();
    w.setStart('start_kestrel');
    w.setCrime('mutiny');
    for (let i = 0; i < 3; i++) w.next();
    expect(w.state.step).toBe('cold_open');
    expect(w.prologueStep()?.authoredText?.join(' ')).toMatch(/Corridor K-12/);
  });

  it('prologueStep is null in veteran mode', () => {
    const w = make();
    w.setMode('veteran');
    expect(w.prologueStep()).toBeNull();
  });
});

describe('canAdvance', () => {
  it('dossier in prologue mode needs only the start', () => {
    const w = make();
    w.setCommanderName('');
    expect(w.canAdvance()).toEqual({ ok: false, reason: 'Choose a starting point.' });
    w.setStart('start_vesper');
    expect(w.canAdvance().ok).toBe(true);
    expect(w.state.crimeId).toBeNull();
  });

  it('dossier in veteran mode still needs name, start and crime', () => {
    const w = make();
    w.setMode('veteran');
    w.setCommanderName('');
    expect(w.canAdvance().reason).toBe('Enter the commander\'s name.');
    w.setCommanderName('Vale');
    expect(w.canAdvance().reason).toBe('Choose a starting point.');
    w.setStart('start_vesper');
    expect(w.canAdvance().reason).toBe('Choose the commander\'s crime.');
    w.setCrime('mutiny');
    expect(w.canAdvance().ok).toBe(true);
  });

  it('intake needs name and crime', () => {
    const w = make();
    walkTo(w, 'intake', { crime: false });
    w.setCommanderName('   ');
    expect(w.canAdvance()).toEqual({ ok: false, reason: 'Enter the commander\'s name.' });
    w.setCommanderName('Vale');
    expect(w.canAdvance()).toEqual({ ok: false, reason: 'Choose the commander\'s crime.' });
    w.setCrime('mutiny');
    expect(w.canAdvance().ok).toBe(true);
  });

  it('cold open is always ok', () => {
    const w = make();
    walkTo(w, 'cold_open', { crime: false });
    expect(w.canAdvance().ok).toBe(true);
  });

  it('exam uses validateCommanderSetup', () => {
    const w = make();
    walkTo(w, 'exam');
    expect(w.canAdvance().ok).toBe(true);
    // an over-spent pool cannot be set through the wizard...
    w.setBody('strength', 4);
    w.setBody('endurance', 4);
    w.setBody('reflexes', 4);
    expect(poolSpent(w.state.commander.body)).toBeLessThanOrEqual(TUNING.commander.pool);
    expect(w.state.commander.body.reflexes).toBeLessThan(4);
    // ...and canAdvance follows the validator for whatever is there
    w.state.commander.body = { strength: 4, endurance: 4, reflexes: 4 };
    const errors = validateCommanderSetup(w.state.commander, reg, { desireBondDefects: false });
    expect(errors.length).toBeGreaterThan(0);
    expect(w.canAdvance()).toEqual({ ok: false, reason: errors[0] });
  });

  it('file canAdvance equals the old review', () => {
    const w = make();
    walkTo(w, 'file');
    expect(w.canAdvance().ok).toBe(true);
    w.setCommanderName('');
    expect(w.canAdvance().ok).toBe(false);
    const v = make();
    v.setMode('veteran');
    v.setStart('start_vesper');
    v.setCrime('mutiny');
    for (let i = 0; i < 5; i++) v.next();
    expect(v.state.step).toBe('review');
    expect(v.canAdvance()).toEqual({ ok: true });
  });

  it('file is the last step: next does nothing', () => {
    const w = make();
    walkTo(w, 'file');
    w.next();
    expect(w.state.step).toBe('file');
  });
});

describe('result', () => {
  it('result().onboarding names the prologue of the start', () => {
    const w = make();
    walkTo(w, 'file');
    expect(w.result()?.onboarding).toEqual({ prologueId: 'prologue_vesper', veteran: false });
    const k = make();
    k.setStart('start_kestrel');
    k.setCrime('purge');
    for (let i = 0; i < 7; i++) k.next();
    expect(k.result()?.onboarding).toEqual({ prologueId: 'prologue_kestrel', veteran: false });
  });

  it('veteran result: onboarding.veteran true', () => {
    const w = make();
    w.setMode('veteran');
    w.setStart('start_vesper');
    w.setCrime('mutiny');
    expect(w.result()?.onboarding).toEqual({ prologueId: 'prologue_vesper', veteran: true });
  });

  it('a start without a prologue gives no onboarding', () => {
    const w = make({ ...reg, prologues: new Map() } as Registries);
    w.setStart('start_vesper');
    w.setCrime('mutiny');
    expect(w.result()).not.toBeNull();
    expect(w.result()).not.toHaveProperty('onboarding');
  });

  it('during calibration in prologue mode previewStart is null (no crime chosen yet)', () => {
    const w = make();
    w.setStart('start_vesper');
    w.toggleUnit({ avatar: 'a.png', name: 'Ann' });
    const u = w.state.units[0];
    u.choice.roleId = 'assault';
    u.choice.signature = { templateId: 'sig_last_stand', name: 'x', description: 'y' };
    u.choice.defects = [{ id: 'echo_bleed', origin: 'o' }];
    expect(w.previewStart(0)).toBeNull();
    w.setCrime('mutiny');
    expect(w.previewStart(0)).not.toBeNull();
  });
});
