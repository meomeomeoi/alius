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
    if (!heading || ![1, 2, 3, 5, 6, 7].includes(sec)) continue;
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

  it('a value that opens a sentence is capitalised (her name for a posture is kept as she says it)', () => {
    for (const e of reg.cardVoice.values()) {
      for (const line of e.lines as string[]) {
        for (const m of line.matchAll(/(^|[.?!~]\s+)\{(\w+)\}/g)) {
          if (m[2]!.toLowerCase() === 'posture') continue;
          expect(m[2]![0], `${e.id}: ${line}`).toBe(m[2]![0]!.toUpperCase());
        }
      }
    }
  });
});
