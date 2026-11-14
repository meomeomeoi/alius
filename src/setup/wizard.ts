import type { Entry, Registries } from '../content/types';
import { BODY_STATS, defaultCommanderSetup, poolSpent, traitBlockReason, validateCommanderSetup, type CommanderSetup } from '../engine/commander/profile';
import { SETUP_LIMITS, validateSetup, type SetupResult, type UnitSetup } from '../engine/setup';
import { TUNING } from '../engine/tuning';
import type { SignatureInstance, Unit } from '../engine/state/types';
import { ALL_SECTIONS, type ImportSection } from '../llm/calls/profileImport';
import type { CharacterSummary } from '../st/adapter';
import type { BodyStat } from '../engine/state/types';
import { defaultWorldOptions } from '../engine/worldOptions';
import type { CommanderImportOutcome } from './commander';
import type { ImportedProfile, ImportOutcome } from './profile';

export type WizardStep = 'dossier' | 'world' | 'commander' | 'units' | 'calibration' | 'review';
export type CalibrationStatus = 'idle' | 'loading' | 'ready' | 'manual';

export interface UnitDraft {
  avatar: string;
  displayName: string;
  status: CalibrationStatus;
  /** e.g. the reason a unit fell back to manual calibration. */
  notice?: string;
  /** null in manual mode. */
  candidates: ImportedProfile | null;
  choice: Omit<UnitSetup, 'cardRef' | 'displayName' | 'roleId' | 'signature' | 'tastes'> & {
    roleId: string | null;
    signature: SignatureInstance | null;
    /** P7: how this unit reads the commander (ids of registry `tastes`, at most 3). */
    tastes: string[];
  };
  secondDefect: boolean;
  /** Sections whose "regenerate" import is still running. */
  regenerating: ImportSection[];
  /** Bumps on every (re)import; results carrying an older number are ignored. */
  generation: number;
  /** P8: the world changed after this unit was calibrated, so her offset and stances may be out of date (a re-import is offered). */
  worldStale?: true;
}

export interface CommanderImportState {
  status: 'idle' | 'loading' | 'ready' | 'manual';
  notice?: string;
  /** Why the model picked each trait, by trait id. */
  reasons: Record<string, string>;
  /** The model's note for the player and the persona it read (status `ready`). */
  notes?: string;
  source?: string;
}

export interface WizardState {
  step: WizardStep;
  commanderName: string;
  startId: string | null;
  crimeId: string | null;
  /** P7: the COMMANDER FILE step. */
  commander: CommanderSetup;
  commanderImport: CommanderImportState;
  /** P8: the world options (every option has a choice) and the preset they still equal, if any. */
  world: { options: Record<string, string>; preset: string | null };
  units: UnitDraft[];
  calibrationIndex: number;
  target: 'new_group' | 'current_group';
  canBindCurrent: boolean;
}

export interface WizardDeps {
  registries: Registries;
  desireBondDefects: boolean;
  /** `world` is the wizard's current world options (P8), so a stance is read against the world the player chose. */
  importer: (avatar: string, sections: ImportSection[], world: Record<string, string>) => Promise<ImportOutcome>;
  /** P7: persona → commander. Absent = the prefill is manual. */
  commanderImporter?: () => Promise<CommanderImportOutcome>;
  /** P7: a number in [0, 1) for the random commander (default `Math.random`). */
  random?: () => number;
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
  /** Bumps whenever a commander prefill is started or becomes stale; a result carrying an older number is ignored. */
  private commanderToken = 0;

  constructor(private deps: WizardDeps, init: { personaName: string; canBindCurrent: boolean }) {
    this.s = {
      step: 'dossier',
      commanderName: init.personaName.trim() || 'Commander',
      startId: null,
      crimeId: null,
      commander: defaultCommanderSetup(),
      commanderImport: { status: 'idle', reasons: {} },
      world: this.startingWorld(),
      units: [],
      calibrationIndex: 0,
      target: 'new_group',
      canBindCurrent: init.canBindCurrent,
    };
  }

  /** The Standard preset when the content has one, else every option's default. */
  private startingWorld(): WizardState['world'] {
    const reg = this.deps.registries;
    const standard = reg.worldPresets.get('standard');
    if (standard) return { options: { ...defaultWorldOptions(reg), ...(standard.choices as Record<string, string>) }, preset: 'standard' };
    return { options: defaultWorldOptions(reg), preset: null };
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

  // --- world (P8)
  private presetOf(options: Record<string, string>): string | null {
    for (const p of this.deps.registries.worldPresets.values()) {
      const c = p.choices as Record<string, string>;
      if (Object.keys(options).length === Object.keys(c).length && Object.entries(c).every(([k, v]) => options[k] === v)) return String(p.id);
    }
    return null;
  }

  /** A calibrated unit's offset and stances were read against the old world: offer a re-import. */
  private worldChanged(before: Record<string, string>): void {
    const after = this.s.world.options;
    if (Object.keys(after).every((k) => after[k] === before[k])) return;
    for (const u of this.s.units) if (u.status === 'ready' || u.status === 'manual') u.worldStale = true;
  }

  /** Sets every option from a preset of the registry (an unknown id changes nothing). */
  applyPreset(id: string): void {
    const preset = this.deps.registries.worldPresets.get(id);
    if (!preset) return;
    const before = { ...this.s.world.options };
    this.s.world = { options: { ...defaultWorldOptions(this.deps.registries), ...(preset.choices as Record<string, string>) }, preset: id };
    this.worldChanged(before);
    this.emit();
  }

  /** Sets one option's choice; the preset mark follows (null unless the options still equal one). Unknown ids are ignored. */
  setWorldOption(optionId: string, choiceId: string): void {
    const option = this.deps.registries.worldOptions.get(optionId);
    if (!option || !(option.choices as Array<{ id: string }>).some((c) => c.id === choiceId)) return;
    const before = { ...this.s.world.options };
    const options = { ...before, [optionId]: choiceId };
    this.s.world = { options, preset: this.presetOf(options) };
    this.worldChanged(before);
    this.emit();
  }

  /** "What this changes": the description of every choice that is not its option's default, never a number. */
  worldSummary(): string[] {
    const out: string[] = [];
    for (const option of this.deps.registries.worldOptions.values()) {
      const chosen = this.s.world.options[option.id] ?? String(option.default);
      if (chosen === option.default) continue;
      const choice = (option.choices as Array<{ id: string; description: string }>).find((c) => c.id === chosen);
      if (choice) out.push(choice.description);
    }
    return out;
  }

  /** Re-imports the offset and stances of one unit against the current world and clears her stale mark. */
  refreshWorldSections(index: number): void {
    const u = this.s.units[index];
    if (!u || (u.status !== 'ready' && u.status !== 'manual')) return;
    for (const section of ['disposition', 'stances'] as const) {
      const token = ++generationCounter;
      this.sectionTokens.set(u, { ...this.sectionTokens.get(u), [section]: token });
    }
    delete u.worldStale;
    void this.run(u, ['disposition', 'stances'], (outcome) => {
      if (outcome.kind === 'manual') {
        u.notice = outcome.reason;
        u.worldStale = true; // nothing was refreshed
        return;
      }
      if (u.candidates === null) u.candidates = emptyProfile();
      u.candidates.dispositionOffset = outcome.profile.dispositionOffset;
      u.candidates.worldStances = outcome.profile.worldStances;
      this.preselect(u, outcome.profile, 'disposition');
      this.preselect(u, outcome.profile, 'stances');
    });
  }

  // --- commander file (P7)
  /** Moves one body stat; a value that breaks the cap of 4, the pool of 7 or the floor of 1 is ignored. */
  setBody(stat: BodyStat, value: number): void {
    if (!BODY_STATS.includes(stat) || !Number.isInteger(value) || value < 1 || value > TUNING.commander.creationMax) return;
    const next = { ...this.s.commander.body, [stat]: value };
    if (poolSpent(next) > TUNING.commander.pool) return;
    this.s.commander.body = next;
    this.emit();
  }

  setExpression(n: number): void {
    if (!Number.isInteger(n) || n < 1 || n > 5) return;
    this.s.commander.expression = n;
    this.emit();
  }

  setSeasoning(n: number): void {
    if (!Number.isInteger(n) || n < 1 || n > 5) return;
    this.s.commander.seasoning = n;
    this.emit();
  }

  /** Picks or drops a trait: at most 2 regular and 1 special, no exclusive pair, no trait the settings do not allow. */
  toggleTrait(id: string): void {
    const t = this.deps.registries.commanderTraits.get(id);
    if (!t) return;
    const traits = this.s.commander.traits;
    if (traits.regular.includes(id)) traits.regular.splice(traits.regular.indexOf(id), 1);
    else if (traits.special === id) delete traits.special;
    else if (this.traitAllowed(id)) {
      if (t.kind === 'special') traits.special = id;
      else traits.regular.push(id);
    } else return;
    this.emit();
  }

  private traitAllowed(id: string, traits = this.s.commander.traits): boolean {
    return traitBlockReason(this.deps.registries, traits, id, { desireBondDefects: this.deps.desireBondDefects }) === null;
  }

  /** Asks the mechanic model for a commander from the persona text; a late answer after the player moved on is dropped. */
  prefillFromPersona(): void {
    const token = ++this.commanderToken;
    this.s.commanderImport = { status: 'loading', reasons: {} };
    this.emit();
    void (async () => {
      let outcome: CommanderImportOutcome;
      try {
        outcome = this.deps.commanderImporter ? await this.deps.commanderImporter() : { kind: 'manual', reason: 'no importer' };
      } catch (e) {
        outcome = { kind: 'manual', reason: errText(e) };
      }
      if (this.disposed || token !== this.commanderToken) return;
      if (outcome.kind === 'ok') {
        // the model never proposes a special trait: the one the player already chose stays
        const special = this.s.commander.traits.special;
        this.s.commander = structuredClone(outcome.result.setup);
        if (special !== undefined) this.s.commander.traits.special = special;
        this.s.commanderImport = {
          status: 'ready', reasons: { ...outcome.result.reasons },
          ...(outcome.result.notes !== '' ? { notes: outcome.result.notes } : {}),
          ...(outcome.result.personaName !== '' ? { source: outcome.result.personaName } : {}),
        };
      } else {
        this.s.commanderImport = { status: 'manual', notice: outcome.reason, reasons: {} };
      }
      this.emit();
    })();
  }

  /** A valid random commander (never a special trait). */
  randomCommander(): void {
    this.commanderToken++; // drops a prefill still running
    const rnd = this.deps.random ?? Math.random;
    const c = defaultCommanderSetup();
    c.body = { strength: 1, endurance: 1, reflexes: 1 };
    for (let spend = Math.floor(rnd() * (TUNING.commander.pool + 1)); spend > 0; spend--) {
      const open = BODY_STATS.filter((k) => c.body[k] < TUNING.commander.creationMax);
      c.body[open[Math.floor(rnd() * open.length)]] += 1;
    }
    c.expression = 1 + Math.floor(rnd() * 5);
    c.seasoning = 1 + Math.floor(rnd() * 5);
    const pool = [...this.deps.registries.commanderTraits.values()].filter((t) => t.kind === 'regular').map((t) => String(t.id));
    for (let want = Math.floor(rnd() * (TUNING.commander.maxRegular + 1)); want > 0 && pool.length > 0; want--) {
      const id = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
      if (this.traitAllowed(id, c.traits)) c.traits.regular.push(id);
    }
    this.s.commander = c;
    this.s.commanderImport = { status: 'idle', reasons: {} };
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
          tastes: [],
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
      case 'world':
        return { ok: true };
      case 'commander': {
        const errors = validateCommanderSetup(this.s.commander, this.deps.registries, { desireBondDefects: this.deps.desireBondDefects });
        return errors.length === 0 ? { ok: true } : fail(errors[0]);
      }
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
    if (this.s.step === 'dossier') this.s.step = 'world';
    else if (this.s.step === 'world') this.s.step = 'commander';
    else if (this.s.step === 'commander') {
      this.commanderToken++; // a prefill still running belongs to a screen the player left
      this.s.step = 'units';
    } else if (this.s.step === 'units') {
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
    if (this.s.step === 'world') this.s.step = 'dossier';
    else if (this.s.step === 'commander') {
      this.commanderToken++;
      this.s.step = 'world';
    } else if (this.s.step === 'units') this.s.step = 'commander';
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
      outcome = await this.deps.importer(u.avatar, sections, { ...this.s.world.options });
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
    else if (section === 'tastes') c.commanderTastes = p.commanderTastes;
    else if (section === 'disposition') c.dispositionOffset = p.dispositionOffset;
    else if (section === 'stances') c.worldStances = p.worldStances;
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
      case 'tastes':
        if (p.commanderTastes) ch.tastes = [...p.commanderTastes];
        break;
      case 'disposition':
        if (p.dispositionOffset) {
          ch.dispositionOffset = p.dispositionOffset.offset;
          ch.dispositionReason = p.dispositionOffset.reason;
        }
        break;
      case 'stances':
        if (p.worldStances) ch.worldStances = structuredClone(p.worldStances);
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
    const result: SetupResult = { commanderName: this.s.commanderName, startId, crimeId, units, commander: structuredClone(this.s.commander), world: { options: { ...this.s.world.options } } };
    const errors = validateSetup(result, this.deps.registries, { desireBondDefects: this.deps.desireBondDefects });
    return { result: errors.length === 0 ? result : null, errors };
  }

  /** The finished setup, or null unless `validateSetup` passes. */
  result(): SetupResult | null {
    return this.build().result;
  }
}
