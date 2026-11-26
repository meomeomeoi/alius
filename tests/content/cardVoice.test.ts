import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { CardVoiceSchema } from '../../src/content/schemas';
import { REGISTRY_NAMES, type Registries } from '../../src/content/types';
import { loadCore } from '../helpers/world';

/**
 * P10e-e Task 3 (R7): `content/core/cardVoice.json` is the approved `docs/content/card-voice.md` as data. The md is parsed
 * (backticked lines under each heading and bullet) and every item is mapped to its `{ kind, style }`; an item of §1, §2, §3 or
 * §5 that the map does not name fails, so a new line in the md is never silently left out of the registry.
 */

interface Item { sec: number; heading: string; label: string; lines: string[] }

/** The md's items: one per bullet (its label and its backticked lines, with the numbered lines under it) or per run of unindented numbered lines. */
function parseVoiceMd(md: string): Item[] {
  const items: Item[] = [];
  let sec = 0;
  let heading = '';
  let cur: Item | null = null;
  const ticks = (s: string): string[] => [...s.matchAll(/`([^`]+)`/g)].map((m) => m[1]!);
  for (const raw of md.split('\n')) {
    const h2 = /^## (\d+)\./.exec(raw);
    if (h2) { sec = Number(h2[1]); heading = ''; cur = null; continue; }
    if (raw.startsWith('## ')) { sec = 0; cur = null; continue; }
    const h3 = /^### (.+)$/.exec(raw);
    if (h3) { heading = h3[1]!.trim(); cur = null; continue; }
    if (!heading || ![1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12].includes(sec)) continue;
    const bullet = /^- (.*)$/.exec(raw);
    if (bullet) {
      const body = bullet[1]!;
      const m = /^\*\*(.+?):\*\*\s*(.*)$/.exec(body) ?? /^`([a-z_]+)`:\s*(.*)$/.exec(body) ?? /^([^`]*?):\s*(.*)$/.exec(body);
      cur = { sec, heading, label: m ? m[1]!.trim() : '', lines: ticks(m ? m[2]! : body) };
      items.push(cur);
      continue;
    }
    const top = /^\d+\. (.*)$/.exec(raw);
    if (top) {
      if (!cur || cur.label !== '' || cur.heading !== heading) { cur = { sec, heading, label: '', lines: [] }; items.push(cur); }
      cur.lines.push(...ticks(top[1]!));
      continue;
    }
    const sub = /^\s+\d+\. (.*)$/.exec(raw);
    if (sub && cur) cur.lines.push(...ticks(sub[1]!));
  }
  return items;
}

type Out = Array<[kind: string, lines: string[]]>;
const all = (kind: string) => (l: string[]): Out => [[kind, l]];
const SKIP = (): Out => [];

/** §1 and §3: heading › label → kinds (neutral). */
const NEUTRAL_MAP: Record<string, Record<string, (l: string[]) => Out>> = {
  'When (task)': { '': all('when') },
  'What it costs (task, `button_cost`)': {
    "the commander's time": all('cost'),
    'a hold with no end shown': all('costHold'),
    'a booking that would lapse': all('lapse'),
    'a hold with no end, bookings unknown': all('lapseHidden'),
    nothing: all('free'),
  },
  'Who will know (task accepted in words or signed)': {
    names: all('who'),
    'only her': all('onlyMe'),
    'the proof (added to the line)': (l) => [['proof.in_person', [l[1]!]], ['proof.witness', [l[2]!]], ['proof.report', [l[3]!]]],
  },
  'The weight (punishment; sealed task)': { '': all('weight'), "a punishment's name stands above it in her hand": all('punishLabel') }, // P10e-e Task 7 (ruling E): her line too
  'No length given (task or punishment with no duration, R16)': { '': all('noLength') },
  'Say it (task accepted in words; a signed task before it was said)': { '': all('sayIt') },
  'What a signed task closes / hands over': { closes: all('closes'), 'hands over': (l) => [['hands', [l[0]!]]] },
  'Talked over (punishment `negotiating`)': { '': all('talked') },
  'The sealed envelope (replaces `TUNING.practice.sealedLine`)': {
    '': all('sealed'),
    'with the weight (all but cruel and vindictive)': SKIP, // the §1 weight line again
    'affectionate, with the track': all('sealedTrack'),
  },
  Demonstration: {
    'before whom': (l) => [['demoWho', l.slice(0, 2)], ['demoWhoMore', [l[2]!]], ['demoNone', [l[3]!]]],
    'where and when': all('demoWhere'),
    'the scene did not open': all('demoAgain'),
  },
  'Her order about a soldier (take it instead)': { '': all('order') },
  'The ceremony': { 'the title': all('cerTitle'), 'a words step': (l) => [['cerWords', [l[0]!]], ['cerPosture', [l[1]!]], ['cerNumber', [l[2]!]]] },
  'Milestones (`dynamicMilestones[].text`, what she asks)': new Proxy({}, { get: (_t, id: string) => all(`static.milestone.${id}`) }),
  "Her claim (the card's words for each domain; the domain's `text` stays the description for the analysis tool)": new Proxy({}, {
    get: (_t, id: string) => (id === 'the submit claim (no domain)' ? all('static.claim.submit') : id === 'what she would hold (the grants list, under her words)' ? all('grants') : all(`static.claim.${id}`)),
  }),
  'Her return': new Proxy({}, { get: (_t, id: string) => all(`static.return.${id}`) }),
  'The moment (the situation, not her: one dim line of prose, not her hand)': { '': all('moment'), exposing: all('exposing') },
};
/** §7 (P10e-e Task 14, ruling Q): breath's lines by her style (breath.html `LINES`; neutral is the rows with no style; cold's are empty). */
const BREATH_KINDS = ['greedy', 'entry', 'now', 'hold', 'early', 'tap', 'low', 'good', 'poor', 'released', 'stop', 'wake', 'fake', 'again'];
/** §8 (P10e-e Task 16, ruling Q): weight's lines by her style (weight.html `LINES`); her first words by the contact (`weight.entry.<contact>`). */
const WEIGHT_KINDS = ['released', 'slip', 'caught', 'heavy', 'good', 'poor', 'fall', 'stop', 'longer', 'announce'];
/** §9 (P10e-e Task 18, ruling Q): scent's lines by her style (saturation.html `LINES`, `STYLES[].ask`, `judge`'s words); by the contact `scent.entry.<contact>` / `scent.here.<contact>`. */
const SCENT_KINDS = [
  'deeper', 'gently', 'still', 'moved', 'good', 'bad', 'away', 'cough', 'liar', 'caught', 'need', 'end', 'stop', 'lost.low', 'lost.high', 'mouth', 'answer.ok', 'answer.bad', 'answer.empty', 'ask',
  'miss.warm', 'miss.admit', 'miss.bad', 'miss.want', 'miss.place', 'miss.strength', 'miss.band', 'miss.intensity_wrong', 'miss.intensity_missing', 'miss.honest',
];
const SCENT_CONTACTS = ['feet_on_face', 'face_to_bottom', 'smothered_armpit'];
/** §10 (P10e-e Task 20, ruling Q): the jaw's lines by her style (jaw.html `LINES`; `ask` as `question|word`); by what holds the mouth open `jaw.entry.<contact>`. */
const JAW_KINDS = ['teeth', 'deeper', 'out', 'suck', 'wide', 'correct', 'restOk', 'restNo', 'ask', 'heard', 'lost', 'end', 'slack', 'stop'];
const JAW_CONTACTS = ['sole_to_mouth', 'ring_gag'];
/** §11 (P10e-e Task 24, ruling Q): her frame's lines by her style (her_activity.html `STYLES`); §12 (Task 24b): the throne's (throne.html `T_LINES`). */
const ACTIVITY_KINDS = ['name', 'noticed', 'correct', 'call', 'end', 'askReply', 'breach', 'silent', 'stop'];
const THRONE_KINDS = ['spill', 'skid', 'thank', 'thanked', 'noThanks'];
/** §6 (P10e-e Task 11): the slap's lines by her style. */
const SLAP_LABEL: Record<string, string> = { before: 'slap.before', feint: 'slap.feint', again: 'slap.again', none: 'slap.after.none', braced: 'slap.after.braced', flinched: 'slap.after.flinched' };
const STYLE_LABEL: Record<string, string> = { when: 'when', cost: 'cost', who: 'who', 'only her': 'onlyMe', weight: 'weight', right: 'call.right', wrong: 'call.wrong', slow: 'call.slow' };

/** Every md item as `kind|style` → lines; throws on an item the map does not name. */
function expected(md: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const put = (kind: string, style: string | undefined, lines: string[]): void => {
    const key = `${kind}|${style ?? ''}`;
    if (out.has(key)) throw new Error(`twice: ${key}`);
    out.set(key, lines);
  };
  for (const it of parseVoiceMd(md)) {
    if (it.sec === 11 || it.sec === 12) {
      const kinds = it.sec === 11 ? ACTIVITY_KINDS : THRONE_KINDS;
      if (!kinds.includes(it.label)) throw new Error(`unmapped ${it.sec === 11 ? 'activity' : 'throne'} item: ${it.heading} › ${it.label}`);
      put(`${it.sec === 11 ? 'activity' : 'throne'}.${it.label}`, it.heading === 'neutral' ? undefined : it.heading, it.lines);
      continue;
    }
    if (it.sec === 10) {
      if (it.heading === 'entry') { put(`jaw.entry.${it.label}`, undefined, it.lines); continue; }
      if (it.label.startsWith('entry.')) { put(`jaw.${it.label}`, it.heading, it.lines); continue; } // a style's own first words (cold: silent)
      if (!JAW_KINDS.includes(it.label)) throw new Error(`unmapped jaw item: ${it.heading} › ${it.label}`);
      put(`jaw.${it.label}`, it.heading === 'neutral' ? undefined : it.heading, it.lines);
      continue;
    }
    if (it.sec === 9) {
      if (it.heading === 'entry' || it.heading === 'here') { put(`scent.${it.heading}.${it.label}`, undefined, it.lines); continue; }
      if (/^(entry|here)\./.test(it.label)) { put(`scent.${it.label}`, it.heading, it.lines); continue; } // a style's own (cold: silent)
      if (!SCENT_KINDS.includes(it.label)) throw new Error(`unmapped scent item: ${it.heading} › ${it.label}`);
      put(`scent.${it.label}`, it.heading === 'neutral' ? undefined : it.heading, it.lines);
      continue;
    }
    if (it.sec === 8) {
      if (it.heading === 'entry') { put(`weight.entry.${it.label}`, undefined, it.lines); continue; }
      if (it.label.startsWith('entry.')) { put(`weight.${it.label}`, it.heading, it.lines); continue; } // a style's own first words (cold: silent)
      if (!WEIGHT_KINDS.includes(it.label)) throw new Error(`unmapped weight item: ${it.heading} › ${it.label}`);
      put(`weight.${it.label}`, it.heading === 'neutral' ? undefined : it.heading, it.lines);
      continue;
    }
    if (it.sec === 7) {
      if (!BREATH_KINDS.includes(it.label)) throw new Error(`unmapped breath item: ${it.heading} › ${it.label}`);
      put(`breath.${it.label}`, it.heading === 'neutral' ? undefined : it.heading, it.lines);
      continue;
    }
    if (it.sec === 6) {
      const kind = SLAP_LABEL[it.label];
      if (!kind) throw new Error(`unmapped slap item: ${it.heading} › ${it.label}`);
      put(kind, it.heading, it.lines);
      continue;
    }
    if (it.sec === 2 || (it.sec === 5 && !it.heading.startsWith('Neutral'))) {
      const kind = STYLE_LABEL[it.label];
      if (!kind) throw new Error(`unmapped style item: ${it.heading} › ${it.label}`);
      put(kind, it.heading, it.lines);
      continue;
    }
    if (it.sec === 5) {
      const kind = STYLE_LABEL[it.label];
      if (!kind) throw new Error(`unmapped call item: ${it.label}`);
      put(kind, undefined, it.lines);
      continue;
    }
    const f = NEUTRAL_MAP[it.heading]?.[it.label];
    if (!f) throw new Error(`unmapped item: ${it.heading} › ${it.label}`);
    for (const [kind, lines] of f(it.lines)) put(kind, undefined, lines);
  }
  return out;
}

/** The md writes every value in lower case; the registry capitalises one that opens a sentence (`{When}`), as cards.html does. */
const norm = (s: string): string => s.replace(/\{(\w+)\}/g, (_m, k: string) => `{${k.toLowerCase()}}`);

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

describe('cardVoice registry (P10e-e R7)', () => {
  it('is a registry with a schema', () => {
    expect(REGISTRY_NAMES).toContain('cardVoice');
    expect(CardVoiceSchema.safeParse({ id: 'when.cold', kind: 'when', style: 'cold', lines: ['{When}.'] }).success).toBe(true);
    expect(CardVoiceSchema.safeParse({ id: 'x', kind: 'nonsense', lines: ['a'] }).success).toBe(false);
    expect(CardVoiceSchema.safeParse({ id: 'x', kind: 'when', lines: [] }).success).toBe(false);
    expect(CardVoiceSchema.safeParse({ id: 'x', kind: 'static.milestone.first_yes', lines: ['a'] }).success).toBe(true);
    expect(CardVoiceSchema.safeParse({ id: 'x', kind: 'slap.after.braced', style: 'cruel', lines: ['a'] }).success).toBe(true);
    expect(CardVoiceSchema.safeParse({ id: 'x', kind: 'breath.now', style: 'cold', lines: [] }).success).toBe(true); // a silent style
    expect(CardVoiceSchema.safeParse({ id: 'x', kind: 'breath.now', lines: [] }).success).toBe(false); // the neutral row never
    expect(CardVoiceSchema.safeParse({ id: 'x', kind: 'slap.before', style: 'cold', lines: [] }).success).toBe(false);
  });

  it('cardVoice holds every line of card-voice.md', () => {
    const md = readFileSync('docs/content/card-voice.md', 'utf8');
    const want = expected(md);
    const got = new Map<string, string[]>();
    for (const e of reg.cardVoice.values()) got.set(`${String(e.kind)}|${(e.style as string | undefined) ?? ''}`, (e.lines as string[]).map(norm));
    expect([...got.keys()].sort()).toEqual([...want.keys()].sort());
    for (const [k, lines] of want) expect(got.get(k), k).toEqual(lines);
  });

  it('one entry per kind and style; every style is a practice style; static ids name real milestones and domains', () => {
    const seen = new Set<string>();
    for (const e of reg.cardVoice.values()) {
      const key = `${String(e.kind)}|${(e.style as string | undefined) ?? ''}`;
      expect(seen.has(key), key).toBe(false);
      seen.add(key);
      if (e.style !== undefined) expect(reg.practiceStyles.has(e.style as string), String(e.style)).toBe(true);
      const ms = /^static\.milestone\.(.+)$/.exec(String(e.kind));
      if (ms) expect(reg.dynamicMilestones.has(ms[1]!), ms[1]).toBe(true);
      const cl = /^static\.claim\.(.+)$/.exec(String(e.kind));
      if (cl && cl[1] !== 'submit') expect(reg.dynamicDomains.has(cl[1]!), cl[1]).toBe(true);
    }
  });

  it('breath\'s lines (ruling Q): every kind of breath.html for its six styles, cold silent, and no pronoun for the commander (lore §0)', () => {
    const rows = [...reg.cardVoice.values()].filter((e) => String(e.kind).startsWith('breath.'));
    for (const k of BREATH_KINDS) expect(rows.some((e) => e.kind === `breath.${k}`), k).toBe(true);
    expect(rows.filter((e) => e.style === 'cold').every((e) => (e.lines as string[]).length === 0)).toBe(true);
    expect(rows.filter((e) => e.style === 'cold')).toHaveLength(BREATH_KINDS.length);
    for (const e of rows) for (const l of e.lines as string[]) expect(l, String(e.id)).not.toMatch(/\b(he|him|his|himself|he's|she's the commander)\b/i);
  });

  it('weight\'s lines (ruling Q): every kind of weight.html for its six styles, her first words by a real weight contact, no pronoun for the commander', () => {
    const rows = [...reg.cardVoice.values()].filter((e) => String(e.kind).startsWith('weight.'));
    for (const k of WEIGHT_KINDS) expect(rows.some((e) => e.kind === `weight.${k}`), k).toBe(true);
    for (const style of ['affectionate', 'ritual', 'playful', 'clinical', 'cruel']) for (const k of WEIGHT_KINDS.filter((x) => x !== 'announce')) expect(rows.some((e) => e.kind === `weight.${k}` && e.style === style), `${k}@${style}`).toBe(true);
    expect(rows.find((e) => e.kind === 'weight.announce')).toMatchObject({ style: 'ritual', lines: ['shifting.', 'left.', 'right.'] }); // read by place: the word, her left, her right
    const entries = rows.filter((e) => String(e.kind).startsWith('weight.entry.'));
    expect(entries.filter((e) => e.style === undefined).map((e) => String(e.kind).slice('weight.entry.'.length)).sort()).toEqual(['boot_on_chest', 'footrest', 'human_chair', 'standing_on', 'straddled']);
    for (const e of entries) {
      const contact = reg.blockingContacts.get(String(e.kind).slice('weight.entry.'.length));
      expect(contact?.face, String(e.kind)).toBeDefined(); // a weight contact (it says which way the commander faces)
      expect(e.style === undefined || e.style === 'cold').toBe(true);
    }
    // Ruling R: cold is silent on every kind and every first word
    const cold = rows.filter((e) => e.style === 'cold');
    expect(cold).toHaveLength(WEIGHT_KINDS.length + 5);
    expect(cold.every((e) => (e.lines as string[]).length === 0)).toBe(true);
    expect(CardVoiceSchema.safeParse({ id: 'x', kind: 'weight.entry.human_chair', lines: ['a'] }).success).toBe(true);
    expect(CardVoiceSchema.safeParse({ id: 'x', kind: 'weight.entry.Human Chair', lines: ['a'] }).success).toBe(false);
    for (const e of rows) for (const l of e.lines as string[]) expect(l, String(e.id)).not.toMatch(/\b(he|him|his|himself|he's|she's the commander)\b/i);
  });

  it('scent\'s lines (ruling Q): every kind of saturation.html for its six styles, her first words and her places by a real contact, cold silent, no pronoun for the commander', async () => {
    const rows = [...reg.cardVoice.values()].filter((e) => String(e.kind).startsWith('scent.'));
    for (const k of SCENT_KINDS) expect(rows.some((e) => e.kind === `scent.${k}` && e.style === undefined), k).toBe(true);
    for (const style of ['affectionate', 'playful', 'cruel', 'ritual', 'clinical']) for (const k of ['mouth', 'answer.ok', 'answer.bad', 'ask']) expect(rows.some((e) => e.kind === `scent.${k}` && e.style === style), `${k}@${style}`).toBe(true);
    for (const c of SCENT_CONTACTS) {
      expect(reg.blockingContacts.get(c)?.physics, c).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'saturation' })]));
      for (const k of ['entry', 'here']) expect(rows.some((e) => e.kind === `scent.${k}.${c}` && e.style === undefined), `${k}.${c}`).toBe(true);
    }
    const cold = rows.filter((e) => e.style === 'cold');
    expect(cold).toHaveLength(SCENT_KINDS.length + 2 * SCENT_CONTACTS.length);
    expect(cold.every((e) => (e.lines as string[]).length === 0)).toBe(true);
    for (const e of rows) for (const l of e.lines as string[]) expect(l, String(e.id)).not.toMatch(/\b(he|him|his|himself|he's)\b/i);
    // the prototype's named places in order, and what its rule finds missing, word for word
    const src = readFileSync('docs/prototypes/saturation.html', 'utf8');
    const lines = src.slice(src.indexOf('const LINES = {'), src.indexOf('\n};', src.indexOf('const LINES = {')));
    for (const c of SCENT_CONTACTS) {
      const want = [...new RegExp(`${c}: \\[(.*?)\\]\\]`).exec(lines.slice(lines.indexOf('here:')))![1]!.matchAll(/\['([^']+)', '([a-z]+)'/g)].map((m) => m[1]);
      expect(rows.find((e) => e.kind === `scent.here.${c}` && e.style === undefined)?.lines, c).toEqual(want);
    }
    const judge = src.slice(src.indexOf('function judge('), src.indexOf('\nfunction answerWords'));
    const misses = [...judge.matchAll(/'([^']+)'/g)].map((m) => m[1]!).filter((t) => /[ .?~]/.test(t) && !t.includes(':') || /^intensity: /.test(t));
    const got = rows.filter((e) => String(e.kind).startsWith('scent.miss.') && e.style === undefined).flatMap((e) => e.lines as string[]);
    expect([...got].sort()).toEqual([...new Set(misses)].sort());
  });

  it('the jaw\'s lines (ruling Q): every kind of jaw.html for its eight styles, word for word; her first words by her toes and the ring; cold silent; no pronoun for the commander', () => {
    const rows = [...reg.cardVoice.values()].filter((e) => String(e.kind).startsWith('jaw.'));
    const src = readFileSync('docs/prototypes/jaw.html', 'utf8');
    const LINES = new Function(`${src.slice(src.indexOf('const LINES = {'), src.indexOf('/* ---------- settings'))}; return LINES;`)() as Record<string, Record<string, unknown>>;
    const row = (kind: string, style: string): string[] | undefined => (rows.find((e) => e.kind === kind && e.style === (style === 'neutral' ? undefined : style))?.lines as string[] | undefined);
    for (const [style, L] of Object.entries(LINES)) {
      for (const c of JAW_CONTACTS) expect(row(`jaw.entry.${c}`, style), `entry.${c}@${style}`).toEqual((L.entry as Record<string, string[]>)[c]);
      for (const k of JAW_KINDS.filter((x) => x !== 'stop' && x !== 'ask')) expect(row(`jaw.${k}`, style), `${k}@${style}`).toEqual(L[k]);
      // her question and the word she wants: `question|word` (no word: any answer)
      expect(row('jaw.ask', style)!.map((l) => l.split('|')).map(([q, w]) => [q, w ?? '']), `ask@${style}`).toEqual(L.ask);
      // finish's line after the stop word (one for every style in the prototype)
      expect(row('jaw.stop', style), `stop@${style}`).toEqual(['okay. it’s out. I’m here.']);
    }
    const cold = rows.filter((e) => e.style === 'cold');
    expect(cold).toHaveLength(JAW_KINDS.length + JAW_CONTACTS.length);
    expect(cold.every((e) => (e.lines as string[]).length === 0)).toBe(true);
    expect(reg.blockingContacts.get('sole_to_mouth')?.physics).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'jaw' })]));
    expect(reg.blockingItems.get('ring_gag')?.physics).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'jaw' })]));
    for (const e of rows) for (const l of e.lines as string[]) expect(l, String(e.id)).not.toMatch(/\b(he|him|his|himself|he's)\b/i);
  });

  it('a value that opens a sentence is capitalised (her name for a posture is kept as she says it)', () => {
    for (const e of reg.cardVoice.values()) {
      for (const line of e.lines as string[]) {
        for (const m of line.matchAll(/(^|[.?!~]\s+)\{(\w+)\}/g)) {
          if (m[2]!.toLowerCase() === 'posture') continue;
          if (m[2] === 'p' && String(e.kind) === 'scent.ask') continue; // her place in her own words: scent's hand writes in lower case (saturation.html)
          expect(m[2]![0], `${e.id}: ${line}`).toBe(m[2]![0]!.toUpperCase());
        }
      }
    }
  });
});
