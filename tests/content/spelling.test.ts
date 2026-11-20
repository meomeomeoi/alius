import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * House style for every text the player or the main model reads in `content/core`: US spelling, PLYX in capitals and
 * the Leash with a capital L. Ids, keys, `[[link]]` targets and `{tokens}` keep their own spelling (`rival_favoured`,
 * `semantic_colours`, `plyx`, `leash_compel`).
 */

const DIR = 'content/core';

/** Every string value (never a key) of every content file, with where it sits. */
function strings(): Array<{ where: string; text: string }> {
  const out: Array<{ where: string; text: string }> = [];
  const walk = (v: unknown, where: string): void => {
    if (typeof v === 'string') out.push({ where, text: v });
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${where}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${where}.${k}`);
  };
  for (const file of readdirSync(DIR).filter((f) => f.endsWith('.json'))) walk(JSON.parse(readFileSync(join(DIR, file), 'utf8')), file);
  return out;
}

/** A whole value that is an id, a type, a key or a path, not prose. */
const ID_LIKE = /^[a-z0-9_\-:./]*$/;

/** The prose of a value: link targets, `{tokens}` and id-shaped words (with `_`, `:`, `/` or `.` inside) are dropped. */
const prose = (text: string): string => text
  .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1')
  .replace(/\[\[[^\]]*\]\]/g, ' ')
  .replace(/\{[^}]*\}/g, ' ')
  .replace(/[A-Za-z0-9]*[_:/.][A-Za-z0-9_:/.]*[A-Za-z0-9_]/g, ' ');

/** British spellings (whole words, any case). "towards", "afterwards" and "dialogue" are fine in US English too. */
const BRITISH_WORDS = [
  // -our
  'colour(s|ed|ing|ful|less)?', 'favour(s|ed|ing|able|ite|ites|itism)?', 'armour(s|ed|y)?', 'behaviour(s|al)?',
  'honour(s|ed|ing|able)?', 'labour(s|ed|ing|er|ers)?', 'humour(s|ed)?', 'rumour(s|ed)?', 'vigour', 'valour', 'odour(s)?',
  'harbour(s|ed)?', 'neighbour(s|hood|ing)?', 'flavour(s|ed)?', 'endeavour(s|ed)?', 'saviour', 'tumour(s)?', 'clamour',
  'splendour', 'rancour', 'candour', 'fervour', 'ardour', 'parlour', 'vapour(s)?', 'demeanour', 'savour(s|ed|ing)?',
  // -re
  'centre(s|d)?', 'metre(s)?', 'litre(s)?', 'fibre(s)?', 'theatre(s)?', 'calibre', 'sombre', 'spectre(s)?', 'sabre(s)?',
  'meagre', 'lustre', 'manoeuvre(s|d)?',
  // -ce / -se
  'defence(s|less)?', 'offence(s)?', 'licence(s|d)?', 'pretence', 'practis(e|es|ed|ing)', 'analys(e|ed|ing)', 'paralys(e|ed|ing)',
  // -ll-
  'travell(ed|ing|er|ers)', 'cancell(ed|ing)', 'labell(ed|ing)', 'modell(ed|ing)', 'fuell(ed|ing)', 'signall(ed|ing)',
  'levell(ed|ing)', 'channell(ed|ing)', 'counsellor(s)?', 'barrell(ed|ing)', 'diall(ed|ing)', 'quarrell(ed|ing)',
  'marvell(ed|ing)', 'totall(ed|ing)', 'jewellery', 'enrol(s|ment)?', 'fulfil(s|ment)?', 'skilful', 'wilful', 'instalment(s)?',
  // -ise / -isation
  '(organ|recogn|real|apolog|minim|maxim|priorit|emphas|critic|summar|author|util|final|stabil|neutral|sanit|memor|categor|optim|custom|random|normal|visual|mobil|steril|scrutin|sympath|jeopard|penal|terror|traumat|brutal|fantas|patron|immobil|marginal|personal|rational|standard|symbol|vandal|vocal|demoral|dehuman|desensit|destabil|mesmer|ostrac|euthan|cauter|special|character|agon|energ|colon|harmon|legal|local|synchron|central|capital|civil|hospital|ideal|weapon|militar|monopol|polar|subsid|tantal|theor|stigmat)is(e|es|ed|ing|ation|ations)',
  // others
  'judgement(s)?', 'programme(s)?', 'catalogue(s|d)?', 'grey(s|ed|ing|ish|er|est)?', 'cosy', 'sceptic(s|al|ism)?',
  'mould(s|ed|ing|y)?', 'aluminium', 'tyre(s)?', 'kerb', 'storey(s)?', 'cheque(s)?', 'ageing', 'artefact(s)?',
  'aeroplane(s)?', 'anaesthe\\w*', 'haemo\\w*', 'oesophag\\w*', 'foetus', 'paediatric\\w*', 'diarrhoea', 'whilst', 'amongst',
];
const BRITISH_RE = new RegExp(`\\b(${BRITISH_WORDS.join('|')})\\b`, 'gi');

/** Lowercase "leash" that is allowed because it is a literal leash (pet play, a dog), not the implant. Exact values. */
const LITERAL_LEASH: string[] = [];

describe('content spelling and house style', () => {
  const all = strings();

  it('reads every content file (the scan is not empty)', () => {
    expect(all.length).toBeGreaterThan(1000);
  });

  it('uses US spelling (color, favor, labor, judgment, canceled, gray…)', () => {
    const bad = all.flatMap(({ where, text }) => [...prose(text).matchAll(BRITISH_RE)].map((m) => `${where}: "${m[0]}"`));
    expect(bad).toEqual([]);
  });

  it('writes PLYX in capitals (the id plyx stays lowercase)', () => {
    const bad = all.filter(({ text }) => !ID_LIKE.test(text) && /\bplyx\b/i.test(prose(text).replace(/\bPLYX\b/g, '')))
      .map(({ where, text }) => `${where}: ${text}`);
    expect(bad).toEqual([]);
  });

  it('writes the Leash with a capital L (ids such as leash and leash_compel stay lowercase)', () => {
    const bad = all.filter(({ text }) => !ID_LIKE.test(text) && !LITERAL_LEASH.includes(text) && /\bleash(es|ed|ing)?\b/.test(prose(text)))
      .map(({ where, text }) => `${where}: ${text}`);
    expect(bad).toEqual([]);
  });

  it('the checks catch what they are for', () => {
    expect('The ring colour, a grey locker, cancelled, favoured, organised'.match(BRITISH_RE)).toHaveLength(5);
    expect('[[semantic_colours|Semantic colors]] rival_favoured {plyx}'.match(BRITISH_RE)).toBeNull();
    expect(prose('[[semantic_colours|Semantic colors]] rival_favoured {plyx} [[plyx]]').match(BRITISH_RE)).toBeNull();
    expect(/\bplyx\b/i.test(prose('pays 5 plyx'))).toBe(true);
    expect(/\bplyx\b/i.test(prose('glossary:plyx [[plyx|PLYX]] plyx_ring {plyx}').replace(/\bPLYX\b/g, ''))).toBe(false);
    expect(/\bleash(es|ed|ing)?\b/.test(prose('holds the leash'))).toBe(true);
    expect(/\bleash(es|ed|ing)?\b/.test(prose('holds the Leash; leash_compel, glossary:leash, LEASHSWAP'))).toBe(false);
  });
});
