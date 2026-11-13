import type { Entry, Registries } from '../content/types';
import { activeRosterUnits, isLiving } from './economy';
import type { Rng } from './rng';
import { applyFirstImpression } from './commander/presence';
import { applyDispositionStart } from './worldOptions';
import { crimeEffectsOf, crimeKnownByDefault, initialRelation, startingTrustAdjust } from './setup';
import { VALUE_AXES, type CampaignState, type Relation, type Unit } from './state/types';
import { TUNING } from './tuning';

/** Rules for a generated grunt name and bio (`squad/set_flavor` and the flavor call's sanitizer). */
export const GENERATED_NAME = /^(?=.*[A-Za-z])[A-Za-z0-9 '-]{1,24}$/;
export const GRUNT_BIO_MAX = 120;

const INNER = 11;
const fit = (s: string): string => {
  const left = Math.floor((INNER - s.length) / 2);
  return (' '.repeat(left) + s + ' '.repeat(INNER)).slice(0, INNER);
};

// Glyph tables for the portrait. Every entry is plain ASCII and at most 11 characters wide.
const HEADGEAR = ['.-"""""-.', '/=======\\', '(#######)', '/^^^^^^^\\', '.:::::::.', '_________', ';;;;;;;;;', '/\\/\\/\\/\\/\\'];
const EYES = ['( o   o )', '( -   - )', '( O   O )', '( >   < )', '( .   . )', '( @   @ )', '[ #   # ]', '( x   o )'];
const NOSES = ['    |    ', '    ^    ', '    L    ', '   .-.   ', '    ,    ', '   \\_/   '];
const MOUTHS = ['\\___/', '-----', '=====', '___', '/---\\', '~~~~~', '...', '|||||'];
const CHINS = ['\\_______/', ' \\_____/ ', '  \\___/  ', '  `---`  ', '  |___|  '];
/** One optional mark replaces a single character: [row, column, glyph]. */
const MARKS: Array<[number, number, string] | null> = [null, null, [1, 1, '/'], [2, 3, ','], [1, 9, '*'], [3, 2, '#']];

/** A 7-line, 13-column ASCII face: frame, headgear, eyes, nose, mouth, chin, frame. */
export function generatePortrait(rng: Rng): string {
  const rows = [
    fit(rng.pick(HEADGEAR)), fit(rng.pick(EYES)), fit(rng.pick(NOSES)), fit(rng.pick(MOUTHS)), fit(rng.pick(CHINS)),
  ];
  const mark = rng.pick(MARKS);
  if (mark) {
    const [row, col, glyph] = mark;
    rows[row] = rows[row].slice(0, col) + glyph + rows[row].slice(col + 1);
  }
  const frame = `+${'-'.repeat(INNER)}+`;
  return [frame, ...rows.map((r) => `|${r}|`), frame].join('\n');
}

/** `K-117` style: a letter and three digits, retried until it is not in `taken`. */
export function generateDesignation(rng: Rng, taken: ReadonlySet<string>): string {
  for (let i = 0; i < 10_000; i++) {
    const letter = String.fromCharCode(65 + rng.int(0, 25));
    const d = `${letter}-${rng.int(100, 999)}`;
    if (!taken.has(d)) return d;
  }
  throw new Error('No free grunt designation left');
}

const idFor = (designation: string): string => `grunt_${designation.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;

/** Generates one grunt; pure given the registries, the state and the rng. Does not touch the state. */
export function generateGrunt(state: CampaignState, reg: Registries, rng: Rng): Unit {
  const role = rng.pick([...reg.roles.values()]);
  const allowDesire = state.settings.desireBondDefects === true;
  const defect = rng.pick([...reg.defects.values()].filter((d) => allowDesire || d.category !== 'desire_bond'));
  const sig = rng.pick([...reg.signatures.values()]);

  const taken = new Set<string>();
  for (const u of state.squad) {
    if (u.designation) taken.add(u.designation);
    taken.add(u.id);
  }
  let designation = generateDesignation(rng, taken);
  while (taken.has(idFor(designation))) designation = generateDesignation(rng, new Set([...taken, designation]));

  const living = state.squad.filter(isLiving);
  const average = living.length === 0 ? 1 : living.reduce((n, u) => n + u.level, 0) / living.length;
  const stats = role.baseStats as Unit['baseStats'];

  return {
    id: idFor(designation),
    kind: 'grunt',
    displayName: designation,
    designation,
    asciiPortrait: generatePortrait(rng),
    roleId: role.id,
    level: Math.max(1, Math.round(average) - 1),
    xp: 0,
    skillPoints: 0,
    unlockedNodes: [],
    signatureSkill: { templateId: sig.id, name: String(sig.name), description: String(sig.mechanic) },
    baseStats: { ...stats },
    currentHp: stats.hp,
    stress: 0,
    defects: [{ id: defect.id, lite: true }],
    values: Object.fromEntries(VALUE_AXES.map((a) => [a, 0])) as Unit['values'],
    likes: [],
    dislikes: [],
    triggers: [],
    equipment: {},
    injuries: [],
    status: activeRosterUnits(state).length < TUNING.rosterActiveMax ? 'active' : 'reserve',
  };
}

/** Trust only: the base, plus what the commander's crime does to a unit with neutral values. */
export function gruntRelation(state: CampaignState, reg: Registries, grunt: Pick<Unit, 'kind' | 'commanderTastes'>): Relation {
  const crime = reg.crimes.get(state.commander.crimeId ?? '') as Entry | undefined;
  const start = reg.starts.get(state.world.startId ?? '') as Entry | undefined;
  const effects = crime ? crimeEffectsOf(crime) : [];
  const neutral = Object.fromEntries(VALUE_AXES.map((a) => [a, 0])) as Unit['values'];
  let trust = TUNING.recruit.baseTrust + startingTrustAdjust(effects, neutral);
  if (effects.some((fx) => fx.type === 'grunt_starting_trust')) trust += TUNING.recruit.gruntCrimeBonus;
  const rel = initialRelation({ trust, affinity: 0, attraction: 0, knowsCrime: crime ? crimeKnownByDefault(crime, start) : false, since: state.day });
  applyDispositionStart(state, reg, grunt, rel); // P8: the world level, before the first impression
  applyFirstImpression(state, reg, grunt, rel); // a grunt has no tastes: only the presence moves her Trust
  return rel;
}
