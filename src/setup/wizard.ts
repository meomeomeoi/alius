import type { Entry, Registries } from '../content/types';
import { BODY_STATS, defaultCommanderSetup, poolSpent, traitBlockReason, validateCommanderSetup, type CommanderSetup } from '../engine/commander/profile';
import { commandStance, impunityBand, impunityOf, stanceEntry, type CommandStance } from '../engine/discipline';
import { SETUP_LIMITS, buildCampaign, validateSetup, type HeadStartDays, type SetupResult, type UnitSetup } from '../engine/setup';
import { prologueFor, stepsOf, type StepWithId } from '../engine/onboarding';
import { TUNING } from '../engine/tuning';
import { defectAllowedFor, validateBond } from '../engine/bonds';
import { keepLockedExpectations } from '../engine/dynamic/expectations';
import { keepLockedPractice, practiceEnabled } from '../engine/dynamic/profile';
import type { UnitDynamicSetup } from '../engine/dynamic/state';
import { FREQUENCIES, HOLDER_CAPS, MAY_HOLD, PACES, SENSITIVITIES, START_FRAMES, type Frequency, type HolderCap, type Pace, type StartFrame } from '../engine/dynamic/types';
import type { Bond, DevelopmentMode, LifeMode, SignatureInstance, Unit } from '../engine/state/types';
import { EXPLICIT_CATEGORY } from '../bonds/directives';
import { ALL_SECTIONS, type ImportSection } from '../llm/calls/profileImport';
import type { CharacterSummary } from '../st/adapter';
import type { BodyStat } from '../engine/state/types';
import { defaultWorldOptions } from '../engine/worldOptions';
import { DEATH_RULES, defaultDeathRule, type DeathRule } from '../engine/warden/state';
import type { CommanderImportOutcome } from './commander';
import type { ImportedProfile, ImportOutcome } from './profile';

/**
 * `commander` and `review` are the veteran intake's plain forms; `cold_open`, `intake`, `exam` and `file` are the in-world
 * steps of a prologue (P11). `file` is the dossier the commander signs to deploy.
 */
export type WizardStep = 'dossier' | 'world' | 'commander' | 'units' | 'calibration' | 'review' | 'cold_open' | 'intake' | 'exam' | 'file';
/** P11: `prologue` plays the in-world intake after calibration; `veteran` is the classic wizard (it only skips the wizard's in-world steps; the campaign still starts at the line-up). */
export type WizardMode = 'prologue' | 'veteran';

const STEPS_BY_MODE: Record<WizardMode, readonly WizardStep[]> = {
  prologue: ['dossier', 'world', 'units', 'calibration', 'cold_open', 'intake', 'exam', 'file'],
  veteran: ['dossier', 'world', 'commander', 'units', 'calibration', 'review'],
};
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

/** P13: the campaign mode the player picked at the MODE section. `warden.index` is the position in `units`. */
export interface CampaignModeDraft {
  kind: 'default' | 'leashswap';
  deathRule: DeathRule;
  warden: { by: 'player'; index: number } | { by: 'corporation' };
}

/** P15: what the DYNAMIC block of WORLD PARAMETERS holds for one chosen unit (`underway` only with a head start). */
export type UnitDynamicDraft = UnitDynamicSetup & { underway?: true };

/** P15: the DYNAMIC block of WORLD PARAMETERS; `units` is keyed by the card (`avatar`). Sent as `SetupResult.dynamic` only while a practice category is on. */
export interface DynamicDraft {
  holders: HolderCap;
  pace: Pace;
  frequency: Frequency;
  units: Record<string, UnitDynamicDraft>;
  /** The dynamic is already underway for every unit (only with a head start). */
  underway: boolean;
}

export interface WizardState {
  step: WizardStep;
  /** P11: `prologue` while the chosen start has one (the default), else `veteran`. */
  mode: WizardMode;
  commanderName: string;
  startId: string | null;
  crimeId: string | null;
  /** P7: the COMMANDER FILE step. */
  commander: CommanderSetup;
  commanderImport: CommanderImportState;
  /** P8: the world options (every option has a choice) and the preset they still equal, if any. */
  world: { options: Record<string, string>; preset: string | null };
  /** P9d: the content categories switched on (all off unless the old explicit-scenes switch carried `explicit_scenes` over). */
  content: { enabled: string[] };
  /** P13: LEASHSWAP or the default mode, its death rule and who holds the leash. */
  campaign: CampaignModeDraft;
  /** P11b: the head start (days the squad has known the commander) and the cards of the units who arrive today. */
  headStart: { days: HeadStartDays; newArrivals: string[] };
  /** P14b: the pace of character development (default normal); sent as `SetupResult.characterDevelopment`. */
  development: DevelopmentMode;
  /** P14c: how often her days off-screen bring something (default normal); sent as `SetupResult.lifeEvents`. */
  lifeEvents: LifeMode;
  /** P15: the DYNAMIC block (shown only while a practice category is on in CONTENT). */
  dynamic: DynamicDraft;
  units: UnitDraft[];
  calibrationIndex: number;
  target: 'new_group' | 'current_group';
  canBindCurrent: boolean;
}

export interface WizardDeps {
  registries: Registries;
  desireBondDefects: boolean;
  /** P9d: the old global "explicit scenes allowed" switch; when true `explicit_scenes` starts on in CONTENT. */
  explicitContent?: boolean;
  /** `world` is the wizard's current world options (P8), so a stance is read against the world the player chose. */
  importer: (avatar: string, sections: ImportSection[], world: Record<string, string>) => Promise<ImportOutcome>;
  /** P7: persona → commander. Absent = the prefill is manual. */
  commanderImporter?: () => Promise<CommanderImportOutcome>;
  /** P7: a number in [0, 1) for the random commander (default `Math.random`). */
  random?: () => number;
  /** P13: the combat difficulty a new campaign starts at (`story`, `normal` or `hard`; default `normal`): it sets the LEASHSWAP death rule's default. */
  difficulty?: string;
  onChange: (s: WizardState) => void;
}

export function difficultyHint(n: number): 'INTENDED' | 'HARD' | 'BRUTAL' | 'HELLISH' {
  return n >= 4 ? 'INTENDED' : n === 3 ? 'HARD' : n === 2 ? 'BRUTAL' : 'HELLISH';
}

/** Full registry lists for manual calibration (Desire/Bond defects only when enabled). */
export function manualOptions(
  registries: Registries, desireBondDefects: boolean,
  /** P9d: her bond, so a defect that needs a bond trait is listed only when she has it. */
  bond?: Bond | null,
): { roles: Entry[]; signatures: Entry[]; defects: Entry[] } {
  return {
    roles: [...registries.roles.values()],
    signatures: [...registries.signatures.values()],
    defects: [...registries.defects.values()].filter((d) => (desireBondDefects || d.category !== 'desire_bond') && defectAllowedFor(registries, d.id, bond ?? null)),
  };
}

type Choice = UnitDraft['choice'];
const emptyProfile = (): ImportedProfile => ({ roleCandidates: [], signatureCandidates: [], defectCandidates: [], notes: '' });
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Unique across wizards, so a late result can never match a different draft. */
let generationCounter = 0;

/** The stance a unit would start in if the campaign were built now (P9): shown while calibrating and in the review. */
export interface StartPreview {
  stance: CommandStance;
  stanceName: string;
  trust: number;
  impunity: number;
  band: string;
  /** P11b: the head start's days when it will still move these numbers (0 without one, or for a new arrival). */
  headStartDays: number;
}

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
      mode: this.deps.registries.prologues.size > 0 ? 'prologue' : 'veteran',
      commanderName: init.personaName.trim() || 'Commander',
      startId: null,
      crimeId: null,
      commander: defaultCommanderSetup(),
      commanderImport: { status: 'idle', reasons: {} },
      world: this.startingWorld(),
      content: { enabled: this.deps.explicitContent === true && this.deps.registries.contentCategories.has(EXPLICIT_CATEGORY) ? [EXPLICIT_CATEGORY] : [] },
      campaign: { kind: 'default', deathRule: defaultDeathRule(this.deps.difficulty ?? 'normal'), warden: { by: 'corporation' } },
      headStart: { days: 0, newArrivals: [] },
      development: 'normal',
      lifeEvents: 'normal',
      dynamic: { holders: TUNING.dynamic.defaults.holders, pace: TUNING.dynamic.defaults.pace, frequency: TUNING.dynamic.defaults.frequency, units: {}, underway: false },
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

  /** P9d: sets the content categories (unknown ids dropped, registry order). */
  setContent(enabled: string[]): void {
    const known = [...this.deps.registries.contentCategories.values()].sort((a, b) => Number(a.order) - Number(b.order)).map((c) => String(c.id));
    this.s.content = { enabled: known.filter((id) => enabled.includes(id)) };
    this.emit();
  }

  /** P13: the campaign mode (the default mode writes no `mode` into the setup). */
  setCampaignMode(kind: 'default' | 'leashswap'): void {
    if (kind !== 'default' && kind !== 'leashswap') return;
    this.s.campaign.kind = kind;
    this.emit();
  }

  /** P13: what happens when the commander dies; stored in the campaign and fixed from then on. */
  setDeathRule(rule: DeathRule): void {
    if (!DEATH_RULES.includes(rule)) return;
    this.s.campaign.deathRule = rule;
    this.emit();
  }

  /** P13: who holds the leash: a chosen unit (by her position in the squad) or the corporation's pick. An index outside the squad is ignored. */
  setWardenPick(pick: CampaignModeDraft['warden']): void {
    if (pick.by === 'player') {
      if (!Number.isInteger(pick.index) || pick.index < 0 || pick.index >= this.s.units.length) return;
      this.s.campaign.warden = { by: 'player', index: pick.index };
    } else this.s.campaign.warden = { by: 'corporation' };
    this.emit();
  }

  /** P11b: how long the squad has known the commander; 0 (arrival) clears the new arrivals. An unknown value is ignored. */
  setHeadStart(days: HeadStartDays): void {
    if (!(TUNING.headStart.days as readonly number[]).includes(days)) return;
    this.s.headStart = { days, newArrivals: days === 0 ? [] : this.s.headStart.newArrivals };
    if (days === 0) this.clearUnderway(); // P15: no head start, nothing to be underway in
    this.emit();
  }

  /** P15: whether the DYNAMIC block applies: a category the dynamic is about is switched on in CONTENT. */
  get dynamicAvailable(): boolean {
    return practiceEnabled(this.deps.registries, this.s.content.enabled);
  }

  private clearUnderway(): void {
    this.s.dynamic.underway = false;
    for (const d of Object.values(this.s.dynamic.units)) delete d.underway;
  }

  private seedCount(): number {
    return Object.values(this.s.dynamic.units).filter((d) => d.seeded === true).length;
  }

  /** P15: the global fields of the DYNAMIC block; an unknown value is ignored. Lowering holders below the seeds drops the last seeds. `underway` needs a head start. */
  setDynamic(patch: { holders?: HolderCap; pace?: Pace; frequency?: Frequency; underway?: boolean }): void {
    const d = this.s.dynamic;
    if (patch.holders !== undefined && (HOLDER_CAPS as readonly unknown[]).includes(patch.holders)) {
      d.holders = patch.holders;
      if (typeof d.holders === 'number') {
        let extra = this.seedCount() - d.holders;
        for (const avatar of [...Object.keys(d.units)].reverse()) {
          if (extra <= 0) break;
          if (d.units[avatar].seeded === true) {
            delete d.units[avatar].seeded;
            delete d.units[avatar].startFrame;
            if (Object.keys(d.units[avatar]).length === 0) delete d.units[avatar];
            extra -= 1;
          }
        }
      }
    }
    if (patch.pace !== undefined && (PACES as readonly unknown[]).includes(patch.pace)) d.pace = patch.pace;
    if (patch.frequency !== undefined && (FREQUENCIES as readonly unknown[]).includes(patch.frequency)) d.frequency = patch.frequency;
    if (typeof patch.underway === 'boolean') d.underway = patch.underway && this.s.headStart.days > 0;
    this.emit();
  }

  /**
   * P15: what the DYNAMIC block says about one chosen unit; a card that is not chosen, or an unknown value, is ignored. Seeding past the
   * number of holders is ignored; un-seeding drops the starting frame; `startFrame: null` clears it, and a frame needs a seed.
   */
  setDynamicUnit(avatar: string, patch: { mayHold?: UnitDynamicSetup['mayHold']; sensitivity?: UnitDynamicSetup['sensitivity']; seeded?: boolean; startFrame?: StartFrame | null; underway?: boolean }): void {
    if (!this.s.units.some((u) => u.avatar === avatar)) return;
    const d = this.s.dynamic;
    const unit: UnitDynamicDraft = { ...d.units[avatar] };
    if (patch.mayHold !== undefined && (MAY_HOLD as readonly unknown[]).includes(patch.mayHold)) { if (patch.mayHold === 'auto') delete unit.mayHold; else unit.mayHold = patch.mayHold; }
    if (patch.sensitivity !== undefined && (SENSITIVITIES as readonly unknown[]).includes(patch.sensitivity)) { if (patch.sensitivity === 'normal') delete unit.sensitivity; else unit.sensitivity = patch.sensitivity; }
    if (patch.seeded === true && unit.seeded !== true && (d.holders === 'any' || this.seedCount() < d.holders)) unit.seeded = true;
    if (patch.seeded === false) { delete unit.seeded; delete unit.startFrame; }
    if (patch.startFrame === null) delete unit.startFrame;
    else if (patch.startFrame !== undefined && (START_FRAMES as readonly unknown[]).includes(patch.startFrame) && unit.seeded === true) unit.startFrame = patch.startFrame;
    if (patch.underway === true && this.s.headStart.days > 0) unit.underway = true;
    if (patch.underway === false) delete unit.underway;
    if (Object.keys(unit).length === 0) delete d.units[avatar];
    else d.units[avatar] = unit;
    this.emit();
  }

  /** P14c: how often her days off-screen bring something; an unknown value is ignored. */
  setLifeEvents(mode: LifeMode): void {
    if (!(['off', 'rare', 'normal', 'often'] as const).includes(mode)) return;
    this.s.lifeEvents = mode;
    this.emit();
  }

  /** P14b: the pace of character development; an unknown value is ignored. */
  setDevelopment(mode: DevelopmentMode): void {
    if (!(['off', 'slow', 'normal'] as const).includes(mode)) return;
    this.s.development = mode;
    this.emit();
  }

  /** P11b: a chosen unit arrives today instead of having known the commander; nothing happens at arrival or for a card that is not chosen. */
  toggleNewArrival(avatar: string): void {
    const h = this.s.headStart;
    if (h.days === 0 || !this.s.units.some((u) => u.avatar === avatar)) return;
    h.newArrivals = h.newArrivals.includes(avatar) ? h.newArrivals.filter((a) => a !== avatar) : [...h.newArrivals, avatar];
    this.emit();
  }

  /** Whether Desire/Bond defects are allowed (needed by the manual lists in the UI). */
  get desireBondDefects(): boolean {
    return this.deps.desireBondDefects;
  }

  /** P12: the corporation of the chosen start (null before one is chosen); a special trait may need a rival to it. */
  get corporationId(): string | null {
    const start = this.s.startId ? this.deps.registries.starts.get(this.s.startId) : undefined;
    return start ? String(start.corporationId) : null;
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
    // a start with no prologue has nothing to play in fiction: the classic wizard it is
    if (prologueFor(this.deps.registries, id, this.promptMode()) === null) this.s.mode = 'veteran';
    this.emit();
  }

  /** The prologue entry of the chosen start, or null (no start yet, or the start has none). */
  private prologue() {
    return this.s.startId ? prologueFor(this.deps.registries, this.s.startId, this.promptMode()) : null;
  }

  /** P13: the prologue entry's mode follows the campaign mode. */
  private promptMode(): 'leashswap' | undefined {
    return this.s.campaign.kind === 'leashswap' ? 'leashswap' : undefined;
  }

  /**
   * Switches between the prologue and the veteran intake. Only on the dossier (the steps after it differ), and `prologue`
   * only when the chosen start has one. Every entered field is kept.
   */
  setMode(mode: WizardMode): void {
    if ((mode !== 'prologue' && mode !== 'veteran') || this.s.step !== 'dossier' || this.s.mode === mode) return;
    if (mode === 'prologue' && this.prologue() === null && this.s.startId !== null) return;
    if (mode === 'prologue' && this.deps.registries.prologues.size === 0) return;
    this.s.mode = mode;
    this.emit();
  }

  /** The steps of the current mode, in order (calibration is skipped by `next` and `back` when no unit was chosen). */
  stepsFor(): WizardStep[] {
    return [...STEPS_BY_MODE[this.s.mode]];
  }

  /** The prologue step behind the current in-world step: the cold open, the intake, the exam or the dossier. */
  prologueStep(): StepWithId | null {
    const entry = this.s.mode === 'prologue' ? this.prologue() : null;
    if (!entry) return null;
    const steps = stepsOf(entry);
    const has = (st: StepWithId, ...fields: string[]) => (st.fields ?? []).some((f) => fields.includes(f));
    switch (this.s.step) {
      case 'cold_open': return steps.find((st) => st.kind === 'paper_form' && (st.fields ?? []).length === 0) ?? null;
      case 'intake': return steps.find((st) => has(st, 'crime', 'name')) ?? null;
      case 'exam': return steps.find((st) => has(st, 'body', 'expression', 'seasoning', 'traits')) ?? null;
      case 'file': return steps.find((st) => st.kind === 'dossier') ?? null;
      default: return null;
    }
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
    const reg = this.deps.registries;
    // only the disposition and the squad-stance options are read into a unit's offset and stances
    const matters = Object.keys(after).some((id) => {
      if (after[id] === before[id]) return false;
      const option = reg.worldOptions.get(id);
      return option !== undefined && (option.squadStance === true
        || (option.choices as Array<{ effects: Array<{ type: string }> }>).some((c) => c.effects.some((e) => e.type === 'disposition')));
    });
    if (!matters) return;
    // a unit still being imported will land with an answer read against the old world: mark her too
    for (const u of this.s.units) if (u.status === 'ready' || u.status === 'manual' || u.status === 'loading') u.worldStale = true;
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
    const mine = { disposition: ++generationCounter, stances: ++generationCounter };
    this.sectionTokens.set(u, { ...this.sectionTokens.get(u), ...mine });
    delete u.worldStale;
    void this.run(u, ['disposition', 'stances'], (outcome) => {
      // each section keeps only the newest request: a later re-import or regenerate of it makes this answer stale
      const now = this.sectionTokens.get(u);
      const own = { disposition: now?.disposition === mine.disposition, stances: now?.stances === mine.stances };
      if (!own.disposition && !own.stances) return;
      if (outcome.kind === 'manual') {
        u.notice = outcome.reason;
        if (own.disposition && own.stances) u.worldStale = true; // nothing was refreshed
        return;
      }
      if (u.candidates === null) u.candidates = emptyProfile();
      if (own.disposition) {
        u.candidates.dispositionOffset = outcome.profile.dispositionOffset;
        this.preselect(u, outcome.profile, 'disposition');
      }
      if (own.stances) {
        u.candidates.worldStances = outcome.profile.worldStances;
        this.preselect(u, outcome.profile, 'stances');
      }
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
    return traitBlockReason(this.deps.registries, traits, id, { desireBondDefects: this.deps.desireBondDefects, corporationId: this.corporationId }) === null;
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
      this.s.headStart.newArrivals = this.s.headStart.newArrivals.filter((a) => a !== c.avatar);
      delete this.s.dynamic.units[c.avatar]; // P15: per-unit picks are keyed by card, so nothing else shifts
      const w = this.s.campaign.warden;
      if (w.by === 'player') this.s.campaign.warden = w.index === i ? { by: 'corporation' } : w.index > i ? { by: 'player', index: w.index - 1 } : w;
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
        // the prologue asks for the name and the crime in fiction (the intake), so only the start is chosen here
        if (this.s.mode === 'prologue') return this.s.startId ? { ok: true } : fail('Choose a starting point.');
        if (this.s.commanderName.trim() === '') return fail('Enter the commander\'s name.');
        if (!this.s.startId) return fail('Choose a starting point.');
        if (!this.s.crimeId) return fail('Choose the commander\'s crime.');
        return { ok: true };
      case 'intake':
        if (this.s.commanderName.trim() === '') return fail('Enter the commander\'s name.');
        if (!this.s.crimeId) return fail('Choose the commander\'s crime.');
        return { ok: true };
      case 'world':
      case 'cold_open':
        return { ok: true };
      case 'exam':
      case 'commander': {
        const errors = validateCommanderSetup(this.s.commander, this.deps.registries, { desireBondDefects: this.deps.desireBondDefects, corporationId: this.corporationId });
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
      case 'file':
      case 'review': {
        const busy = this.s.units.find((u) => u.regenerating.length > 0);
        if (busy) return fail(`${busy.displayName} is still regenerating.`);
        const { errors } = this.build();
        return errors.length === 0 ? { ok: true } : fail(errors[0]);
      }
    }
  }

  /** Where `next`/`back` go from here: the neighbour in the mode's order, jumping over calibration when no unit was chosen. */
  private neighbour(dir: 1 | -1): WizardStep | null {
    const order = STEPS_BY_MODE[this.s.mode];
    let i = order.indexOf(this.s.step) + dir;
    if (order[i] === 'calibration' && this.s.units.length === 0) i += dir;
    return order[i] ?? null;
  }

  next(): void {
    if (!this.canAdvance().ok) return;
    const to = this.neighbour(1);
    if (to === null) return;
    const from = this.s.step;
    if (from === 'commander' || from === 'exam') this.commanderToken++; // a prefill still running belongs to a screen the player left
    this.s.step = to;
    if (to === 'calibration') {
      this.s.calibrationIndex = 0;
      // every unit imports at once: the waits would otherwise add up as the player pages through
      for (let i = 0; i < this.s.units.length; i++) this.calibrate(i);
    }
    this.emit();
  }

  /** Goes back to an earlier step of the current mode (the dossier's EDIT links); forward only through `next`, which checks the step. */
  jumpTo(step: WizardStep): void {
    const order = STEPS_BY_MODE[this.s.mode];
    const to = order.indexOf(step);
    if (to < 0 || to >= order.indexOf(this.s.step)) return;
    if (this.s.step === 'commander' || this.s.step === 'exam') this.commanderToken++;
    this.s.step = step;
    this.emit();
  }

  back(): void {
    const to = this.neighbour(-1);
    if (to === null) return;
    if (this.s.step === 'commander' || this.s.step === 'exam') this.commanderToken++;
    this.s.step = to;
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
    // P9d: a defect that needs a bond trait goes when her bond no longer has it
    if (choice.bond !== undefined) u.choice.defects = u.choice.defects.filter((d) => defectAllowedFor(this.deps.registries, d.id, u.choice.bond ?? null));
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
    else if (section === 'bond') {
      c.bond = p.bond;
      c.bondReason = p.bondReason;
    } else if (section === 'development') {
      c.anchors = p.anchors;
      c.insight = p.insight;
    } else if (section === 'temperament') c.temperament = p.temperament;
    else if (section === 'hobbies') {
      c.hobbies = p.hobbies;
      c.aptitudes = p.aptitudes;
    } else if (section === 'opinions') c.opinions = p.opinions;
    else if (section === 'practice') c.practice = p.practice;
    else if (section === 'expectations') c.expectations = p.expectations;
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
      case 'bond':
        // P15: the bond section never touches the practice she already has in the choice
        if (p.bond) ch.bond = { ...structuredClone(p.bond), ...(ch.bond?.practice !== undefined && p.bond.practice === undefined ? { practice: ch.bond.practice } : {}) };
        break;
      case 'practice':
        if (p.practice) ch.bond = { ...(ch.bond ?? validateBond(undefined, this.deps.registries).bond), practice: keepLockedPractice(ch.bond?.practice, p.practice, ch.practiceLocks ?? []) };
        break;
      case 'expectations': {
        if (p.expectations) {
          const kept = keepLockedExpectations(ch.expectations, p.expectations, ch.expectationLocks ?? []);
          if (kept) ch.expectations = kept;
          else delete ch.expectations;
        }
        break;
      }
      case 'development':
        if (p.anchors) ch.anchors = [...p.anchors];
        if (p.insight) ch.insight = p.insight;
        break;
      case 'temperament':
        if (p.temperament) ch.temperament = { ...p.temperament };
        break;
      case 'hobbies':
        if (p.hobbies) ch.hobbies = [...p.hobbies];
        if (p.aptitudes) ch.aptitudes = { high: [...p.aptitudes.high], low: [...p.aptitudes.low] };
        break;
      case 'opinions':
        if (p.opinions) ch.opinions = structuredClone(p.opinions);
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
    const result: SetupResult = { commanderName: this.s.commanderName, startId, crimeId, units, commander: structuredClone(this.s.commander), world: { options: { ...this.s.world.options } }, content: { enabled: [...this.s.content.enabled] } };
    // P11: a start with a prologue always starts inside it; the veteran intake only marks the wizard steps as skipped
    const prologue = prologueFor(this.deps.registries, startId, this.promptMode());
    if (this.s.campaign.kind === 'leashswap') {
      const w = this.s.campaign.warden;
      // a pick that no longer points at a chosen unit falls back to the corporation (toggleUnit keeps it in step, this is the net)
      result.mode = { kind: 'leashswap', deathRule: this.s.campaign.deathRule, warden: w.by === 'player' && w.index < units.length ? { by: 'player', index: w.index } : { by: 'corporation' } };
    }
    result.characterDevelopment = this.s.development; // P14b: normal unless the player chose otherwise (SYS changes it later)
    result.lifeEvents = this.s.lifeEvents; // P14c: normal unless the player chose otherwise (SYS › World changes it later)
    if (this.s.headStart.days > 0) result.headStart = { days: this.s.headStart.days, newArrivals: this.s.headStart.newArrivals.filter((a) => units.some((u) => u.cardRef === a)) };
    if (this.dynamicAvailable) {
      // P15: only while a practice category is on; a pick for a card that is no longer chosen is dropped, and every entry keeps only the setup's fields
      const d = this.s.dynamic;
      const chosen = new Set(units.map((u) => u.cardRef));
      const entries = Object.entries(d.units).filter(([card]) => chosen.has(card));
      result.dynamic = {
        holders: d.holders, pace: d.pace, frequency: d.frequency,
        units: Object.fromEntries(entries.map(([card, { underway: _underway, ...setup }]) => [card, setup]).filter(([, setup]) => Object.keys(setup as object).length > 0)),
      };
      if (this.s.headStart.days > 0 && result.headStart !== undefined) {
        const some = entries.filter(([, e]) => e.underway === true).map(([card]) => card);
        if (d.underway) result.headStart.dynamicUnderway = true;
        else if (some.length > 0) result.headStart.dynamicUnderway = some;
      }
    }
    if (prologue) result.onboarding = { prologueId: prologue.id, veteran: this.s.mode === 'veteran' };
    const errors = validateSetup(result, this.deps.registries, { desireBondDefects: this.deps.desireBondDefects });
    return { result: errors.length === 0 ? result : null, errors };
  }

  /**
   * The command stance, Trust and Impunity a unit would have on day 1: the campaign is built as a throwaway with this unit
   * alone (so the world's disposition, her offset, her baseline Trust, the crime and the commander's presence all count)
   * and read through the engine. `null` until the start and the crime are chosen and while her draft is incomplete or
   * invalid. Changes nothing.
   */
  previewStart(index: number): StartPreview | null {
    const { startId, crimeId } = this.s;
    const u = this.s.units[index];
    if (!startId || !crimeId || !u) return null;
    const { roleId, signature, ...rest } = u.choice;
    if (!roleId || !signature) return null;
    const result: SetupResult = {
      commanderName: this.s.commanderName, startId, crimeId, commander: structuredClone(this.s.commander), world: { options: { ...this.s.world.options } },
      units: [{ cardRef: u.avatar, displayName: u.displayName, roleId, signature, ...structuredClone(rest) }],
    };
    const built = buildCampaign(result, this.deps.registries, { desireBondDefects: this.deps.desireBondDefects, seed: 1 });
    if (!built.ok) return null;
    const id = built.state.squad[0]?.id;
    if (id === undefined) return null;
    const stance = commandStance(built.state, this.deps.registries, id);
    const impunity = impunityOf(built.state, this.deps.registries, id);
    if (stance === null || impunity === null) return null;
    return {
      stance, stanceName: String(stanceEntry(this.deps.registries, stance)?.name ?? stance), trust: built.state.relations[id].trust,
      impunity: impunity.value, band: impunityBand(impunity.value),
      headStartDays: this.s.headStart.newArrivals.includes(u.avatar) ? 0 : this.s.headStart.days,
    };
  }

  /** The finished setup, or null unless `validateSetup` passes. */
  result(): SetupResult | null {
    return this.build().result;
  }
}
