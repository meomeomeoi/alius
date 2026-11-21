import type { Entry, Registries } from '../content/types';
import { SETUP_LIMITS, normalizeTag } from '../engine/setup';
import { TUNING } from '../engine/tuning';
import { contentAllowed, defectAllowedFor, validateBond } from '../engine/bonds';
import { validateExpectations, type ExpectationProfile } from '../engine/dynamic/expectations';
import { practiceCategories, validatePractice } from '../engine/dynamic/profile';
import type { Practice } from '../engine/dynamic/types';
import { anchorKey } from '../engine/development/axes';
import { RESYNC_SECTIONS, type ResyncSection } from '../engine/actions/squad';
import { TEMPERAMENT_DEFAULTS, TEMPERAMENT_VALUES } from '../engine/life/state';
import type { OpinionTopicEntry } from '../engine/life/types';
import type { Bond, Insight, Temperament, Unit, WorldStance } from '../engine/state/types';
import { isNeutralChoice, worldChoices, worldDispositionLevel } from '../engine/worldOptions';
import { PRACTICE_SECTIONS, type ImportSection, type ProfileImportInput } from '../llm/calls/profileImport';
import { describeFailure } from '../llm/describe';
import type { Envelope } from '../llm/envelope';
import { estTokens } from '../llm/text';
import type { AliusSettings } from '../settings';
import type { CardInfo, StAdapter } from '../st/adapter';

export const CARD_INPUT_TOKENS = 2500;
const CUT_MARK = '…[truncated]';
const CHARS_PER_TOKEN = 3.6;

type CardField = 'description' | 'personality' | 'scenario' | 'creatorNotes';
const CARD_FIELDS: CardField[] = ['description', 'personality', 'scenario', 'creatorNotes'];

/**
 * Water-filling over the four text fields: each non-empty field gets an equal share of the budget,
 * and what a short field does not use goes to the fields that are still over budget.
 */
export function truncateCard(card: CardInfo, maxTokens: number): CardInfo {
  const fields = CARD_FIELDS.filter((f) => card[f] !== '').sort((a, b) => estTokens(card[a]) - estTokens(card[b]));
  const out: CardInfo = { ...card };
  let remaining = maxTokens;
  fields.forEach((f, i) => {
    const share = remaining / (fields.length - i);
    const cost = estTokens(card[f]);
    if (cost <= share) {
      remaining -= cost;
      return;
    }
    const maxChars = Math.floor(share * CHARS_PER_TOKEN);
    out[f] = card[f].slice(0, Math.max(0, maxChars - CUT_MARK.length)) + CUT_MARK;
    remaining -= share;
  });
  return out;
}

/** The ids of the squad-stance options whose choice in `world` is not neutral (the options a stance is asked for). */
export function stanceOptionIds(registries: Registries, world: Record<string, string> | undefined): string[] {
  if (!world) return [];
  return worldChoices({ world: { options: world } }, registries)
    .filter(({ option, choice }) => option.squadStance === true && !isNeutralChoice(choice))
    .map(({ option }) => option.id);
}

/** What the import prompt says about the world: the soldiers' disposition level and the options a stance is asked for. */
export function worldImportInfo(registries: Registries, world: Record<string, string>): NonNullable<ProfileImportInput['world']> {
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const level = worldDispositionLevel({ world: { options: world } }, registries);
  const picked = worldChoices({ world: { options: world } }, registries);
  return {
    disposition: { name: str(level.name), description: str(level.description) },
    options: picked
      .filter(({ option, choice }) => option.squadStance === true && !isNeutralChoice(choice))
      .map(({ option, choice }) => ({ id: option.id, label: str(option.label), choice: str(choice.label), description: str(choice.description) })),
  };
}

export function buildImportInput(
  card: CardInfo, registries: Registries, settings: AliusSettings, sections: ImportSection[], world?: Record<string, string>,
  /** P9d: her bond when the `bond` section is not being imported (a re-sync of the defects alone). */
  bond?: Bond | null,
  /** P15: the content categories switched on; the two sections of the dynamic are asked for only while one of them is a practice category. */
  content?: readonly string[],
): ProfileImportInput {
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const info = world ? worldImportInfo(registries, world) : undefined;
  const enabledPractice = practiceCategories(registries).filter((c) => (content ?? []).includes(c));
  const holder = { content: { enabled: [...(content ?? [])] } };
  // the world sections are asked for only when the caller knows a world, and stances only when some norm is not neutral
  const asked = sections
    .filter((s) => (s !== 'disposition' && s !== 'stances') || (info !== undefined && (s === 'disposition' || info.options.length > 0)))
    .filter((s) => !(PRACTICE_SECTIONS as readonly ImportSection[]).includes(s) || enabledPractice.length > 0);
  return {
    card,
    sections: asked,
    ...(info ? { world: info } : {}),
    roles: [...registries.roles.values()].map((r) => ({ id: r.id, summary: str(r.summary) })),
    signatures: [...registries.signatures.values()].map((s) => ({ id: s.id, fits: str(s.fits) })),
    defects: [...registries.defects.values()]
      .filter((d) => settings.desireBondDefects || d.category !== 'desire_bond')
      // a defect that needs a bond trait is offered while the bond is imported with it, or when she already has the trait
      .filter((d) => sections.includes('bond') || defectAllowedFor(registries, d.id, bond ?? null))
      .map((d) => ({ id: d.id, lore: str(d.lore) })),
    tastes: [...registries.tastes.values()].map((t) => ({ id: t.id, description: str(t.description) })),
    ...(sections.includes('bond')
      ? { categories: [...registries.contentCategories.values()].sort((a, b) => Number(a.order) - Number(b.order)).map((c) => ({ id: String(c.id), label: str(c.label) })) }
      : {}),
    ...(sections.includes('development') ? { development: { axes: developmentAxisKeys(registries) } } : {}),
    ...(sections.includes('hobbies') ? { hobbies: [...registries.hobbies.values()].map((h) => ({ id: h.id, description: str(h.description) })) } : {}),
    ...(sections.includes('opinions')
      ? { topics: [...registries.opinionTopics.values()].map((t) => ({ id: t.id, positions: (t.positions as Array<{ id: string }>).map((p) => p.id) })) }
      : {}),
    ...(asked.includes('practice') ? { practice: { categories: enabledPractice } } : {}),
    ...(asked.includes('expectations')
      ? {
        expectations: {
          targets: [...registries.worshipTargets.values()].filter((t) => contentAllowed(holder, registries, t)).map((t) => t.id),
          sources: [...registries.momentSources.values()].filter((t) => contentAllowed(holder, registries, t)).map((t) => t.id),
        },
      }
      : {}),
  };
}

/**
 * The sections a re-sync offers: every section of `RESYNC_SECTIONS`, the stances only while some norm of the world is not neutral, and
 * (P15) the practice and the expectations only while a practice category is switched on (`content` = the categories that are on).
 */
export function resyncSectionsOffered(registries: Registries, world: Record<string, string> | undefined, content?: readonly string[]): ResyncSection[] {
  const dynamic = practiceCategories(registries).some((c) => (content ?? []).includes(c));
  return RESYNC_SECTIONS.filter((s) => (s !== 'stances' || stanceOptionIds(registries, world).length > 0) && (dynamic || !(PRACTICE_SECTIONS as readonly string[]).includes(s)));
}

/** P14b: the axis keys an anchor may name: the registry's value and bond axes, and `taste:<id>` for each taste (the wildcards are not keys). */
export function developmentAxisKeys(registries: Registries): string[] {
  const fixed = [...registries.developmentAxes.keys()].filter((k) => !k.endsWith(':.any'));
  return [...fixed, ...[...registries.tastes.keys()].map((t) => `taste:${t}`)];
}

export interface ImportedProfile {
  roleCandidates: Array<{ roleId: string; reason: string }>;
  values?: Unit['values'];
  likes?: string[];
  dislikes?: string[];
  triggers?: string[];
  signatureCandidates: Array<{ templateId: string; name: string; description: string }>;
  defectCandidates: Array<{ defectId: string; origin: string }>;
  baseline?: { trust: number; affinity: number; attraction: number };
  /** P7: up to 3 ids of registry `tastes`. */
  commanderTastes?: string[];
  /** P8: how far she sits from the world's disposition level, with the card's reason. */
  dispositionOffset?: { offset: number; reason: string };
  /** P8: her stance toward each non-neutral squad-stance option. */
  worldStances?: Record<string, WorldStance>;
  /** P9d: her bond profile (per-field modest defaults when the card or the model gave nothing usable) and why. */
  bond?: Bond;
  bondReason?: string;
  /** P14b: the axes her card states strongly (at most 4, validated) and how well she reads people. */
  anchors?: string[];
  insight?: Insight;
  /** P14c: how she carries herself (every field a known word), up to 3 hobbies, her aptitudes (2 or 3 in each list, none in both) and up to 12 views. */
  temperament?: Temperament;
  hobbies?: string[];
  aptitudes?: { high: string[]; low: string[] };
  opinions?: Record<string, { position: string; text?: string }>;
  /** P15: what she practises, her style pair and her inclination (read field by field), and what she expects and wants to see. */
  practice?: Practice;
  expectations?: ExpectationProfile;
  notes: string;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const cap = (v: unknown, max: number, fallback = ''): string =>
  typeof v === 'string' ? v.trim().slice(0, max) : fallback;
const num = (v: unknown, lo: number, hi: number, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : fallback;

const STANCE_REASON_MAX = 160;
const STANCE_WORDS: readonly string[] = ['shares', 'indifferent', 'opposes'];
const SECTION_LABEL = { role: 'role', signature: 'signature', defects: 'defects' } as const;
const VALUE_KEYS = ['pragmatism', 'autonomy', 'ingroup', 'mercy', 'corporate', 'sacrifice'] as const;

function tagList(v: unknown, max: number): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: string[] = [];
  for (const raw of v) {
    const t = normalizeTag(raw);
    if (t !== null && !out.includes(t)) out.push(t);
    if (out.length === max) break;
  }
  return out;
}

/** Turns whatever the model returned into registry-checked candidates. Never throws. */
export function sanitizeProfile(
  raw: unknown,
  ctx: {
    registries: Registries; desireBondDefects: boolean; sections: ImportSection[]; world?: Record<string, string>;
    /** P9d: her current bond, read by a defects-only import (the imported bond wins when the bond section is asked for). */
    bond?: Bond | null;
    /** P15: the content categories switched on (a worship target of a closed category is dropped from the expectations). */
    content?: readonly string[];
  },
): { profile: ImportedProfile; dropped: string[]; missing: ImportSection[] } {
  const src = isObj(raw) ? raw : {};
  const want = (s: ImportSection) => ctx.sections.includes(s);
  const dropped: string[] = [];
  const missing: ImportSection[] = [];
  const profile: ImportedProfile = { roleCandidates: [], signatureCandidates: [], defectCandidates: [], notes: cap(src.notes, 300) };

  /** Keeps entries whose id passes `accept`, drops and lists the rest and duplicates. */
  const pick = <T>(
    list: unknown, section: keyof typeof SECTION_LABEL, idKey: string, max: number,
    accept: (id: string) => boolean, make: (id: string, item: Record<string, unknown>) => T,
  ): T[] => {
    const out: T[] = [];
    const seen = new Set<string>();
    for (const item of Array.isArray(list) ? list : []) {
      const id = isObj(item) && typeof item[idKey] === 'string' ? (item[idKey] as string) : null;
      if (id === null) {
        dropped.push(`${SECTION_LABEL[section]}:(invalid)`);
        continue;
      }
      if (!accept(id) || seen.has(id)) {
        dropped.push(`${SECTION_LABEL[section]}:${id}`);
        continue;
      }
      seen.add(id);
      if (out.length < max) out.push(make(id, item as Record<string, unknown>));
    }
    return out;
  };

  if (want('role')) {
    profile.roleCandidates = pick(src.roleCandidates, 'role', 'roleId', 2,
      (id) => ctx.registries.roles.has(id), (roleId, it) => ({ roleId, reason: cap(it.reason, 200) }));
    if (profile.roleCandidates.length === 0) missing.push('role');
  }

  if (want('signature')) {
    profile.signatureCandidates = pick(src.signatureCandidates, 'signature', 'templateId', 3,
      (id) => ctx.registries.signatures.has(id),
      (templateId, it) => {
        const tpl = ctx.registries.signatures.get(templateId) as Entry;
        return {
          templateId,
          name: cap(it.name, 40, String(tpl.name)) || String(tpl.name),
          description: cap(it.description, 240, String(tpl.mechanic)) || String(tpl.mechanic),
        };
      });
    if (profile.signatureCandidates.length === 0) missing.push('signature');
  }

  // the bond is read before the defects: a defect that needs a bond trait is judged against it
  let bond: Bond | null = ctx.bond ?? null;
  if (want('bond')) {
    const read = validateBond(src.bond, ctx.registries);
    profile.bond = read.bond;
    bond = read.bond;
    const reason = cap(isObj(src.bond) ? src.bond.reason : undefined, TUNING.bonds.limits.noteMax);
    if (reason !== '') profile.bondReason = reason;
    for (const issue of read.issues) if (/unknown content category/.test(issue)) dropped.push(`bond:${issue.match(/"([^"]*)"/)?.[1] ?? '(invalid)'}`);
    // nothing usable (not an object, or no field could be read): the modest defaults stand and the section counts as missing
    if (read.valid.length === 0) missing.push('bond');
    if (!isObj(src.bond)) delete profile.bond;
  }

  if (want('defects')) {
    profile.defectCandidates = pick(src.defectCandidates, 'defects', 'defectId', 3,
      (id) => {
        const d = ctx.registries.defects.get(id);
        return !!d && (ctx.desireBondDefects || d.category !== 'desire_bond') && defectAllowedFor(ctx.registries, id, bond);
      },
      (defectId, it) => ({ defectId, origin: cap(it.origin, 300) }));
    if (profile.defectCandidates.length === 0) missing.push('defects');
  }

  if (want('values')) {
    if (isObj(src.values)) {
      const v = src.values;
      profile.values = Object.fromEntries(VALUE_KEYS.map((k) => [k, num(v[k], -3, 3, 0)])) as Unit['values'];
    } else missing.push('values');
  }

  if (want('tags')) {
    const likes = tagList(src.likes, SETUP_LIMITS.likes);
    const dislikes = tagList(src.dislikes, SETUP_LIMITS.dislikes);
    const triggers = tagList(src.triggers, SETUP_LIMITS.triggers);
    if (likes) profile.likes = likes;
    if (dislikes) profile.dislikes = dislikes;
    if (triggers) profile.triggers = triggers;
    if (!likes && !dislikes && !triggers) missing.push('tags');
  }

  if (want('tastes')) {
    // a taste list is optional by nature: an empty or missing one is a valid answer
    const out: string[] = [];
    for (const raw of Array.isArray(src.commanderTastes) ? src.commanderTastes : []) {
      if (typeof raw !== 'string' || !ctx.registries.tastes.has(raw) || out.includes(raw)) {
        dropped.push(`tastes:${typeof raw === 'string' ? raw : '(invalid)'}`);
        continue;
      }
      if (out.length < TUNING.commander.maxTastes) out.push(raw);
    }
    profile.commanderTastes = out;
  }

  if (want('disposition') && isObj(src.dispositionOffset) && typeof src.dispositionOffset.offset === 'number' && Number.isFinite(src.dispositionOffset.offset)) {
    // optional by nature: a card that says nothing is offset 0, so a missing answer is never "missing"
    profile.dispositionOffset = { offset: num(src.dispositionOffset.offset, -2, 2, 0), reason: cap(src.dispositionOffset.reason, STANCE_REASON_MAX) };
  }

  if (want('stances')) {
    const ids = stanceOptionIds(ctx.registries, ctx.world);
    if (ids.length > 0) {
      const given = isObj(src.worldStances) ? src.worldStances : {};
      for (const key of Object.keys(given)) if (!ids.includes(key)) dropped.push(`stances:${key}`);
      const out: Record<string, WorldStance> = {};
      for (const id of ids) {
        const e = given[id];
        const stance = isObj(e) && typeof e.stance === 'string' && STANCE_WORDS.includes(e.stance) ? (e.stance as WorldStance['stance']) : null;
        // a missing or unreadable stance is indifferent (a silent card does not share the world's norm)
        out[id] = stance === null ? { stance: 'indifferent', strength: 1, reason: '' }
          : { stance, strength: (e as Record<string, unknown>).strength === 2 ? 2 : 1, reason: cap((e as Record<string, unknown>).reason, STANCE_REASON_MAX) };
      }
      profile.worldStances = out;
    }
  }

  if (want('development')) {
    // optional by nature: a card that is not firm anywhere has no anchors, and a missing insight is mid; never "missing"
    const dev = isObj(src.development) ? src.development : {};
    const anchors: string[] = [];
    for (const raw of Array.isArray(dev.anchors) ? dev.anchors : []) {
      const key = anchorKey(ctx.registries, raw);
      if (key === null) {
        dropped.push(`development:${typeof raw === 'string' ? raw : '(invalid)'}`);
        continue;
      }
      if (!anchors.includes(key) && anchors.length < TUNING.development.anchorsMax) anchors.push(key);
    }
    profile.anchors = anchors;
    profile.insight = dev.insight === 'low' || dev.insight === 'high' ? dev.insight : 'mid';
  }

  // P14c: all three are optional by nature (a card that says nothing leaves them out); none is ever "missing"
  if (want('temperament') && isObj(src.temperament)) {
    const given = src.temperament;
    const t: Temperament = { ...TEMPERAMENT_DEFAULTS };
    for (const field of Object.keys(TEMPERAMENT_VALUES) as Array<keyof Temperament>) {
      const word = given[field];
      if (typeof word === 'string' && TEMPERAMENT_VALUES[field].includes(word)) (t[field] as string) = word;
      else dropped.push(`temperament:${field}`);
    }
    profile.temperament = t;
  }

  if (want('hobbies')) {
    const hobby = (raw: unknown, where: string): string | null => {
      if (typeof raw === 'string' && ctx.registries.hobbies.has(raw)) return raw;
      dropped.push(`${where}:${typeof raw === 'string' ? raw : '(invalid)'}`);
      return null;
    };
    const list = (raw: unknown, where: string, max: number): string[] => {
      const out: string[] = [];
      for (const item of Array.isArray(raw) ? raw : []) {
        const id = hobby(item, where);
        if (id === null) continue;
        if (out.includes(id) || out.length >= max) dropped.push(`${where}:${id}`);
        else out.push(id);
      }
      return out;
    };
    profile.hobbies = list(src.hobbies, 'hobbies', TUNING.life.maxActive);
    if (isObj(src.aptitudes)) {
      const high = list(src.aptitudes.high, 'aptitudes', 3);
      const low = list(src.aptitudes.low, 'aptitudes', 3);
      // a hobby in both lists is the model contradicting itself: it is in neither
      const both = high.filter((h) => low.includes(h));
      for (const h of both) dropped.push(`aptitudes:${h}`);
      const apt = { high: high.filter((h) => !both.includes(h)), low: low.filter((h) => !both.includes(h)) };
      // two or three in each list is what the prompt asks for; less than that is not an answer
      if (apt.high.length >= 2 && apt.low.length >= 2) profile.aptitudes = apt;
      else if (apt.high.length + apt.low.length > 0) dropped.push('aptitudes:(too few)');
    }
  }

  if (want('opinions')) {
    const out: Record<string, { position: string; text?: string }> = {};
    const max = TUNING.life.opinion.importMax;
    for (const item of Array.isArray(src.opinions) ? src.opinions : []) {
      const topicId = isObj(item) && typeof item.topic === 'string' ? item.topic : null;
      const topic = topicId === null ? undefined : (ctx.registries.opinionTopics.get(topicId) as OpinionTopicEntry | undefined);
      const position = isObj(item) && typeof item.position === 'string' ? item.position : null;
      if (topicId === null || !topic || !topic.positions.some((p) => p.id === position) || topicId in out || Object.keys(out).length >= max) {
        dropped.push(`opinions:${topicId ?? '(invalid)'}`);
        continue;
      }
      const text = cap((item as Record<string, unknown>).text, TUNING.life.opinion.textMax);
      out[topicId] = { position: position as string, ...(text !== '' ? { text } : {}) };
    }
    profile.opinions = out;
  }

  // P15: neither is ever critical; a card that says nothing leaves them out and they count as missing (the review keeps what the player has)
  if (want('practice')) {
    const read = validatePractice(src.practice, ctx.registries);
    for (const id of read.dropped) dropped.push(id);
    if (read.practice !== undefined) profile.practice = read.practice;
    else missing.push('practice');
  }

  if (want('expectations')) {
    const read = validateExpectations(src.expectations, ctx.registries, { state: { content: { enabled: [...(ctx.content ?? [])] } } });
    for (const id of read.dropped) dropped.push(id);
    if (read.expectations !== undefined) profile.expectations = read.expectations;
    else missing.push('expectations');
  }

  if (want('baseline')) {
    if (isObj(src.emotionalBaseline)) {
      const b = src.emotionalBaseline;
      const lim = SETUP_LIMITS.baseline;
      profile.baseline = {
        trust: num(b.trust, lim.trust[0], lim.trust[1], 20),
        affinity: num(b.affinity, lim.affinity[0], lim.affinity[1], 0),
        attraction: num(b.attraction, lim.attraction[0], lim.attraction[1], 0),
      };
    } else missing.push('baseline');
  }

  return { profile, dropped, missing };
}

export type ImportOutcome =
  | { kind: 'ok'; profile: ImportedProfile; dropped: string[]; missing: ImportSection[] }
  | { kind: 'manual'; reason: string };

type Sanitized = ReturnType<typeof sanitizeProfile>;
/** The imports in flight, by site key (`<avatar>:<sections>`): the site's `build` rebuilds nothing, it reads what `importProfile` prepared. */
const inFlight = new Map<string, { input: ReturnType<typeof buildImportInput>; ctx: Parameters<typeof sanitizeProfile>[1] }>();
const CRITICAL: ImportSection[] = ['role', 'defects'];
const criticalOf = (m: ImportSection[]): ImportSection[] => m.filter((s) => CRITICAL.includes(s));
const noUsable = (m: ImportSection[]): string => `no usable ${criticalOf(m).join(' / ')} in the model's answer`;

/** Card → candidates. Any failure becomes `manual`; never throws. */
export async function importProfile(
  avatar: string,
  sections: ImportSection[],
  deps: {
    st: StAdapter; settings: AliusSettings; registries: Registries; /** P14: the envelope the call runs through (no record: there is no campaign yet, the wizard shows the reason). */ generations: Envelope; /** P8: the world's choices; absent = the world sections are not asked for. */ world?: Record<string, string>;
    /** P9d: her current bond, for a defects-only re-sync. */
    bond?: Bond | null;
    /** P15: the content categories switched on; the practice and expectations sections are asked for only while one of them is a practice category. */
    content?: readonly string[];
  },
): Promise<ImportOutcome> {
  const { st, settings, registries } = deps;
  try {
    const loaded = await st.loadCharacterCard(avatar);
    if (!loaded) return { kind: 'manual', reason: 'card not found' };
    const input = buildImportInput(truncateCard(loaded, CARD_INPUT_TOKENS), registries, settings, sections, deps.world, deps.bond, deps.content);
    const ctx = { registries, desireBondDefects: settings.desireBondDefects, sections: input.sections, world: deps.world, bond: deps.bond, content: deps.content };
    // P15: the two sections ask for room (+300 and +400 tokens of the budget); a call without them sends the budget it always did
    const extra = (input.sections.includes('practice') ? 300 : 0) + (input.sections.includes('expectations') ? 400 : 0);
    const budgetMult = extra > 0 ? 1 + extra / settings.budgets.profile_import : undefined;

    // the `setup.profile_import` site: the sanitized candidates. A critical section the answer lacks is a rejected answer: it is asked
    // again within the automatic retries (the second try the wizard always made), then the import goes to the manual form
    const key = `${avatar}:${input.sections.join(',')}`;
    inFlight.set(key, { input, ctx });
    deps.generations.bind<ReturnType<typeof buildImportInput>, Sanitized>('setup.profile_import', {
      build: (k) => inFlight.get(k)?.input ?? { expired: 'The import was dropped.' },
      parse: (raw, _input) => sanitizeProfile(raw, inFlight.get(key)?.ctx ?? ctx),
      apply: (_k, value) => (criticalOf(value.missing).length > 0 ? { rejected: noUsable(value.missing) } : 'ok'),
    });
    let out: Awaited<ReturnType<Envelope['generate']>>;
    try {
      out = await deps.generations.generate<Sanitized>('setup.profile_import', key, { noRecord: true, ...(budgetMult !== undefined ? { budgetMult } : {}) });
    } finally {
      inFlight.delete(key);
    }
    if (out.kind === 'applied') return { kind: 'ok', ...(out.value as Sanitized) };
    if (out.kind === 'failed') {
      // a critical section the answer lacked keeps its own words; every other failure says what happened to the call
      return { kind: 'manual', reason: out.detail.startsWith('no usable ') ? out.detail : describeFailure({ label: 'Profile import', reason: out.reason, budget: undefined, timeoutMs: settings.llmTimeoutMs }) };
    }
    return { kind: 'manual', reason: 'The import was dropped.' };
  } catch (e) {
    return { kind: 'manual', reason: e instanceof Error ? e.message : String(e) };
  }
}
