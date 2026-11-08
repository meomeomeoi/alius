import type { Entry, Registries } from '../content/types';
import { SETUP_LIMITS, normalizeTag } from '../engine/setup';
import type { Unit } from '../engine/state/types';
import type { ImportSection, ProfileImportInput } from '../llm/calls/profileImport';
import { callLlm } from '../llm/orchestrator';
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

export function buildImportInput(
  card: CardInfo, registries: Registries, settings: AliusSettings, sections: ImportSection[],
): ProfileImportInput {
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  return {
    card,
    sections: [...sections],
    roles: [...registries.roles.values()].map((r) => ({ id: r.id, summary: str(r.summary) })),
    signatures: [...registries.signatures.values()].map((s) => ({ id: s.id, fits: str(s.fits) })),
    defects: [...registries.defects.values()]
      .filter((d) => settings.desireBondDefects || d.category !== 'desire_bond')
      .map((d) => ({ id: d.id, lore: str(d.lore) })),
  };
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
  notes: string;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const cap = (v: unknown, max: number, fallback = ''): string =>
  typeof v === 'string' ? v.trim().slice(0, max) : fallback;
const num = (v: unknown, lo: number, hi: number, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : fallback;

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
  ctx: { registries: Registries; desireBondDefects: boolean; sections: ImportSection[] },
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

  if (want('defects')) {
    profile.defectCandidates = pick(src.defectCandidates, 'defects', 'defectId', 3,
      (id) => {
        const d = ctx.registries.defects.get(id);
        return !!d && (ctx.desireBondDefects || d.category !== 'desire_bond');
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

/** Card → candidates. Any failure becomes `manual`; never throws. */
export async function importProfile(
  avatar: string,
  sections: ImportSection[],
  deps: { st: StAdapter; settings: AliusSettings; registries: Registries },
): Promise<ImportOutcome> {
  const { st, settings, registries } = deps;
  try {
    const loaded = await st.loadCharacterCard(avatar);
    if (!loaded) return { kind: 'manual', reason: 'card not found' };
    const input = buildImportInput(truncateCard(loaded, CARD_INPUT_TOKENS), registries, settings, sections);
    const ctx = { registries, desireBondDefects: settings.desireBondDefects, sections };

    type Attempt = { ok: true; value: ReturnType<typeof sanitizeProfile> } | { ok: false; reason: string };
    const attempt = async (): Promise<Attempt> => {
      const r = await callLlm<unknown>('profile_import', input, { st, settings });
      if (!r.ok) return { ok: false, reason: r.detail || r.reason };
      return { ok: true, value: sanitizeProfile(r.value, ctx) };
    };
    const critical = (m: ImportSection[]) => m.filter((s) => s === 'role' || s === 'defects');

    let res = await attempt();
    if (res.ok && critical(res.value.missing).length > 0) res = await attempt();
    if (!res.ok) return { kind: 'manual', reason: res.reason };
    const stillMissing = critical(res.value.missing);
    if (stillMissing.length > 0) {
      return { kind: 'manual', reason: `no usable ${stillMissing.join(' / ')} in the model's answer` };
    }
    return { kind: 'ok', ...res.value };
  } catch (e) {
    return { kind: 'manual', reason: e instanceof Error ? e.message : String(e) };
  }
}
