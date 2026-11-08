import type { Entry, Registries } from '../content/types';
import { SETUP_LIMITS, validateSetup, type SetupResult, type UnitSetup } from '../engine/setup';
import type { SignatureInstance, Unit } from '../engine/state/types';
import { ALL_SECTIONS, type ImportSection } from '../llm/calls/profileImport';
import type { CharacterSummary } from '../st/adapter';
import type { ImportedProfile, ImportOutcome } from './profile';

export type WizardStep = 'dossier' | 'units' | 'calibration' | 'review';
export type CalibrationStatus = 'idle' | 'loading' | 'ready' | 'manual';

export interface UnitDraft {
  avatar: string;
  displayName: string;
  status: CalibrationStatus;
  /** e.g. the reason a unit fell back to manual calibration. */
  notice?: string;
  /** null in manual mode. */
  candidates: ImportedProfile | null;
  choice: Omit<UnitSetup, 'cardRef' | 'displayName' | 'roleId' | 'signature'> & {
    roleId: string | null;
    signature: SignatureInstance | null;
  };
  secondDefect: boolean;
  /** Sections whose "regenerate" import is still running. */
  regenerating: ImportSection[];
  /** Bumps on every (re)import; results carrying an older number are ignored. */
  generation: number;
}

export interface WizardState {
  step: WizardStep;
  commanderName: string;
  startId: string | null;
  crimeId: string | null;
  units: UnitDraft[];
  calibrationIndex: number;
  target: 'new_group' | 'current_group';
  canBindCurrent: boolean;
}

export interface WizardDeps {
  registries: Registries;
  desireBondDefects: boolean;
  importer: (avatar: string, sections: ImportSection[]) => Promise<ImportOutcome>;
  onChange: (s: WizardState) => void;
}

export function difficultyHint(n: number): 'INTENDED' | 'HARD' | 'BRUTAL' | 'HELLISH' {
  return n >= 4 ? 'INTENDED' : n === 3 ? 'HARD' : n === 2 ? 'BRUTAL' : 'HELLISH';
}

/** Full registry lists for manual calibration (Desire/Bond defects only when enabled). */
export function manualOptions(
  registries: Registries, desireBondDefects: boolean,
): { roles: Entry[]; signatures: Entry[]; defects: Entry[] } {
  return {
    roles: [...registries.roles.values()],
    signatures: [...registries.signatures.values()],
    defects: [...registries.defects.values()].filter((d) => desireBondDefects || d.category !== 'desire_bond'),
  };
}

type Choice = UnitDraft['choice'];
const emptyProfile = (): ImportedProfile => ({ roleCandidates: [], signatureCandidates: [], defectCandidates: [], notes: '' });
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Unique across wizards, so a late result can never match a different draft. */
let generationCounter = 0;

export class Wizard {
  private s: WizardState;
  private disposed = false;
  private listeners = new Set<(s: WizardState) => void>();
  /** Latest "regenerate" request per unit and section; an older result for the same section is dropped. */
  private sectionTokens = new Map<UnitDraft, Partial<Record<ImportSection, number>>>();

  constructor(private deps: WizardDeps, init: { personaName: string; canBindCurrent: boolean }) {
    this.s = {
      step: 'dossier',
      commanderName: init.personaName.trim() || 'Commander',
      startId: null,
      crimeId: null,
      units: [],
      calibrationIndex: 0,
      target: 'new_group',
      canBindCurrent: init.canBindCurrent,
    };
  }

  /** Whether Desire/Bond defects are allowed (needed by the manual lists in the UI). */
  get desireBondDefects(): boolean {
    return this.deps.desireBondDefects;
  }

  get state(): WizardState {
    return this.s;
  }

  /** Stops late import results from touching (or re-rendering) this wizard. */
  dispose(): void {
    this.disposed = true;
  }

  /** Extra change listener (the screen re-renders from it). Returns the unsubscribe function. */
  subscribe(fn: (s: WizardState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Notifies listeners without changing anything (the screen re-renders after a deployment attempt ends). */
  refresh(): void {
    this.emit();
  }

  private emit(): void {
    if (this.disposed) return;
    this.deps.onChange(this.s);
    for (const fn of [...this.listeners]) fn(this.s);
  }

  // --- dossier
  setCommanderName(name: string): void {
    this.s.commanderName = name;
    this.emit();
  }

  setStart(id: string): void {
    if (!this.deps.registries.starts.has(id)) return;
    this.s.startId = id;
    this.emit();
  }

  setCrime(id: string): void {
    if (!this.deps.registries.crimes.has(id)) return;
    this.s.crimeId = id;
    this.emit();
  }

  setTarget(t: 'new_group' | 'current_group'): void {
    if (t === 'current_group' && !this.s.canBindCurrent) return;
    this.s.target = t;
    this.emit();
  }

  // --- units
  toggleUnit(c: CharacterSummary): void {
    const i = this.s.units.findIndex((u) => u.avatar === c.avatar);
    if (i >= 0) {
      this.s.units.splice(i, 1);
      this.s.calibrationIndex = Math.min(this.s.calibrationIndex, Math.max(0, this.s.units.length - 1));
    } else if (this.s.units.length < SETUP_LIMITS.maxUnits) {
      this.s.units.push({
        avatar: c.avatar,
        displayName: c.name,
        status: 'idle',
        candidates: null,
        choice: {
          roleId: null,
          signature: null,
          defects: [],
          values: { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 0, corporate: 0, sacrifice: 0 },
          likes: [],
          dislikes: [],
          triggers: [],
          baseline: { trust: 20, affinity: 0, attraction: 0 },
        },
        secondDefect: false,
        regenerating: [],
        generation: ++generationCounter,
      });
    }
    this.emit();
  }

  // --- navigation
  canAdvance(): { ok: boolean; reason?: string } {
    const fail = (reason: string) => ({ ok: false, reason });
    switch (this.s.step) {
      case 'dossier':
        if (this.s.commanderName.trim() === '') return fail('Enter the commander\'s name.');
        if (!this.s.startId) return fail('Choose a starting point.');
        if (!this.s.crimeId) return fail('Choose the commander\'s crime.');
        return { ok: true };
      case 'units':
        return { ok: true };
      case 'calibration': {
        for (const u of this.s.units) {
          if (u.regenerating.length > 0) return fail(`${u.displayName} is still regenerating.`);
          if (u.status === 'idle' || u.status === 'loading') return fail(`${u.displayName} is not calibrated yet.`);
          if (!u.choice.roleId) return fail(`${u.displayName}: choose a role.`);
          if (!u.choice.signature) return fail(`${u.displayName}: choose a signature skill.`);
          if (u.choice.defects.length < 1) return fail(`${u.displayName}: choose at least one defect.`);
        }
        return { ok: true };
      }
      case 'review': {
        const busy = this.s.units.find((u) => u.regenerating.length > 0);
        if (busy) return fail(`${busy.displayName} is still regenerating.`);
        const { errors } = this.build();
        return errors.length === 0 ? { ok: true } : fail(errors[0]);
      }
    }
  }

  next(): void {
    if (!this.canAdvance().ok) return;
    if (this.s.step === 'dossier') this.s.step = 'units';
    else if (this.s.step === 'units') {
      if (this.s.units.length === 0) this.s.step = 'review';
      else {
        this.s.step = 'calibration';
        this.s.calibrationIndex = 0;
        // every unit imports at once: the waits would otherwise add up as the player pages through
        for (let i = 0; i < this.s.units.length; i++) this.calibrate(i);
      }
    } else if (this.s.step === 'calibration') this.s.step = 'review';
    this.emit();
  }

  back(): void {
    if (this.s.step === 'units') this.s.step = 'dossier';
    else if (this.s.step === 'calibration') this.s.step = 'units';
    else if (this.s.step === 'review') this.s.step = this.s.units.length === 0 ? 'units' : 'calibration';
    this.emit();
  }

  /** Pager inside the calibration step; also starts that unit's import if it has not run yet. */
  setCalibrationIndex(i: number): void {
    if (i < 0 || i >= this.s.units.length) return;
    this.s.calibrationIndex = i;
    this.calibrate(i);
    this.emit();
  }

  // --- calibration
  calibrate(index: number): void {
    const u = this.s.units[index];
    if (!u || u.status !== 'idle') return;
    u.status = 'loading';
    u.generation = ++generationCounter;
    this.emit();
    void this.run(u, [...ALL_SECTIONS], (outcome) => this.applyFull(u, outcome));
  }

  regenerate(index: number, section: ImportSection): void {
    const u = this.s.units[index];
    if (!u || (u.status !== 'ready' && u.status !== 'manual')) return;
    const token = ++generationCounter;
    this.sectionTokens.set(u, { ...this.sectionTokens.get(u), [section]: token });
    if (!u.regenerating.includes(section)) u.regenerating.push(section);
    this.emit();
    void this.run(u, [section], (outcome) => this.applySection(u, section, outcome), { section, token });
  }

  setManual(index: number): void {
    const u = this.s.units[index];
    if (!u) return;
    u.generation = ++generationCounter;
    u.regenerating = [];
    u.status = 'manual';
    u.candidates = null;
    u.notice = 'Manual calibration selected.';
    this.emit();
  }

  update(index: number, patch: Partial<Choice> & { secondDefect?: boolean }): void {
    const u = this.s.units[index];
    if (!u) return;
    const { secondDefect, ...choice } = patch;
    Object.assign(u.choice, choice);
    if (secondDefect !== undefined) u.secondDefect = secondDefect;
    if (!u.secondDefect) u.choice.defects = u.choice.defects.slice(0, 1);
    u.choice.defects = u.choice.defects.slice(0, SETUP_LIMITS.maxDefects);
    this.emit();
  }

  /** Runs one import; the result is applied only if the draft still exists with the same generation. */
  private async run(
    u: UnitDraft, sections: ImportSection[], apply: (o: ImportOutcome) => void,
    track?: { section: ImportSection; token: number },
  ): Promise<void> {
    const gen = u.generation;
    let outcome: ImportOutcome;
    try {
      outcome = await this.deps.importer(u.avatar, sections);
    } catch (e) {
      outcome = { kind: 'manual', reason: errText(e) };
    }
    if (this.disposed || !this.s.units.includes(u) || u.generation !== gen) return;
    if (track) {
      if (this.sectionTokens.get(u)?.[track.section] !== track.token) return; // a newer request for this section is running
      u.regenerating = u.regenerating.filter((s) => s !== track.section);
    }
    apply(outcome);
    this.emit();
  }

  private applyFull(u: UnitDraft, outcome: ImportOutcome): void {
    if (outcome.kind === 'manual') {
      u.status = 'manual';
      u.notice = outcome.reason;
      u.candidates = null;
      return;
    }
    const p = outcome.profile;
    u.status = 'ready';
    u.notice = undefined;
    u.candidates = structuredClone(p);
    for (const section of ALL_SECTIONS) this.preselect(u, p, section);
  }

  private applySection(u: UnitDraft, section: ImportSection, outcome: ImportOutcome): void {
    if (outcome.kind === 'manual') {
      u.notice = outcome.reason;
      return;
    }
    if (outcome.missing.includes(section)) return; // nothing usable: keep what the player has
    if (u.candidates === null) u.candidates = emptyProfile();
    u.status = 'ready';
    u.notice = undefined;
    const p = outcome.profile;
    const c = u.candidates;
    if (section === 'role') c.roleCandidates = p.roleCandidates;
    else if (section === 'signature') c.signatureCandidates = p.signatureCandidates;
    else if (section === 'defects') c.defectCandidates = p.defectCandidates;
    else if (section === 'values') c.values = p.values;
    else if (section === 'baseline') c.baseline = p.baseline;
    else {
      c.likes = p.likes;
      c.dislikes = p.dislikes;
      c.triggers = p.triggers;
    }
    this.preselect(u, p, section);
  }

  /** Copies the first candidate (or the suggested numbers and tags) of one section into the player's choice. */
  private preselect(u: UnitDraft, p: ImportedProfile, section: ImportSection): void {
    const ch = u.choice;
    switch (section) {
      case 'role':
        if (p.roleCandidates[0]) ch.roleId = p.roleCandidates[0].roleId;
        break;
      case 'signature': {
        const s = p.signatureCandidates[0];
        if (s) ch.signature = { templateId: s.templateId, name: s.name, description: s.description };
        break;
      }
      case 'defects': {
        const d = p.defectCandidates;
        if (d[0]) {
          const picked = [d[0]];
          if (u.secondDefect && d[1]) picked.push(d[1]);
          ch.defects = picked.map((x) => ({ id: x.defectId, origin: x.origin }));
        }
        break;
      }
      case 'values':
        if (p.values) ch.values = { ...p.values } as Unit['values'];
        break;
      case 'tags':
        if (p.likes) ch.likes = [...p.likes];
        if (p.dislikes) ch.dislikes = [...p.dislikes];
        if (p.triggers) ch.triggers = [...p.triggers];
        break;
      case 'baseline':
        if (p.baseline) ch.baseline = { ...p.baseline };
        break;
    }
  }

  // --- result
  private build(): { result: SetupResult | null; errors: string[] } {
    const { startId, crimeId } = this.s;
    if (!startId || !crimeId) return { result: null, errors: ['Choose a starting point and a crime.'] };
    const units: UnitSetup[] = [];
    for (const u of this.s.units) {
      const { roleId, signature, ...rest } = u.choice;
      if (!roleId || !signature) return { result: null, errors: [`${u.displayName}: calibration is incomplete.`] };
      units.push({ cardRef: u.avatar, displayName: u.displayName, roleId, signature, ...structuredClone(rest) });
    }
    const result: SetupResult = { commanderName: this.s.commanderName, startId, crimeId, units };
    const errors = validateSetup(result, this.deps.registries, { desireBondDefects: this.deps.desireBondDefects });
    return { result: errors.length === 0 ? result : null, errors };
  }

  /** The finished setup, or null unless `validateSetup` passes. */
  result(): SetupResult | null {
    return this.build().result;
  }
}
