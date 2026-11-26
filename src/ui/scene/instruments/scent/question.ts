/**
 * P10e-e Task 18: her question under scent (`docs/prototypes/saturation.html`: `askWords`, `sayables`, `buildPills`, `isCat`, `judge`,
 * `answerWords`, copied; types added). Rare, about a place she names and marks: the pills are the head's words (one per word) tagged where /
 * scent / feel / how strong, plus what she would like to hear (dashed "say it" pills: a lie the body may give away by a cough within two
 * breaths); two picked (pointerdown or keys 1–6), 12 s; her rule by style; what is said leaves the head. Her words are `cardVoice` (her ask
 * `scent.ask`, what her rule finds missing `scent.miss.*`, her verdict `scent.answer.*`); the verdict the engine records is `physics/answer`
 * (R20, `judged` / `answered`). The pills are discrete controls: each carries `analyzeNative('glossary:scent_answer')` (ruling K).
 */
import { analyzeNative } from '../../../analyze/mark';
import { clamp } from '../kit/math';
import { $, BEAT, G, judged, LINES, lift, Math, nameplace, performance, pick, press, randInt, S, say, scatter, setTimeout, ST, type HeadWord, type WordEl } from './scent';
import { BAND_W, HER_PLACE, PLACE_W, STAGE_RANK, STAGE_W, TAG } from './words';

/** A pill of her question: a word of the head, or one she would like to hear (`lie`), or "… nothing". */
export interface Pill { w: string; cat: string; el?: WordEl; lie?: boolean }

/** Her question's pills on the frame. */
export const wordEls: WordEl[] = [];

/* ---------- her question: name what is in the head; she wants it her way ---------- */
export function askWords() {
  if (!S.layers.words) return;
  const st = ST();
  const strongest = G.zones.slice().sort((a, b) => b.w - a.w)[0];
  const place = G.askPlace ?? (strongest || {} as { id?: string }).id!;
  // she names the place and marks it: the answer can be gathered there, if it is not in the head already
  let ti = -1; G.zones.forEach((z, i) => { if (z.id === place && (ti < 0 || z.w > G.zones[ti]!.w)) ti = i; });
  const line = (pick(LINES.ask) ?? '').replace('{p}', HER_PLACE[place] ?? 'it');
  const tp = ti >= 0 ? G.zones[ti]!.p : [0.55, 0.2];
  say(line, false, [clamp(tp[0]! + 0.05, 0.04, 0.7), clamp(tp[1]! - 0.1, 0.06, 0.8)]);
  G.order = { k: 'ask', until: G.clock + 12000, chosen: [], place, ti };
  buildPills();
}
/* what she would like to hear, offered beside the head's words: saying it is a lie the body may give away */
export function sayables(place: string) {
  const out: Array<[string, string]> = [], st = ST(), want = () => pick(STAGE_W[pick(['craving', 'adoring'])]!);
  const has = (p: string) => G.head.some((h) => h.cat.startsWith(p));
  switch (st.rule) {
    case 'warm': out.push([pick(STAGE_W.accustomed!), 'stage:accustomed']); break;
    case 'admit': out.push([pick(BAND_W.overwhelming!), 'band:overwhelming']); break;
    case 'bad_and_want': out.push([want(), 'stage:craving']); if (!has('stage:aversion')) out.push([pick(STAGE_W.aversion!), 'stage:aversion']); break;
    case 'place_and_band': { const b = pick(Object.keys(BAND_W)); out.push([pick(BAND_W[b]!), 'band:' + b]); if (!has('place:' + place)) out.push([pick(PLACE_W[place] ?? ['her']), 'place:' + place]); break; }
    case 'band_and_honest': { const b = pick(Object.keys(BAND_W)); out.push([pick(BAND_W[b]!), 'band:' + b]); break; }
  }
  return out.map(([w, cat]) => ({ w, cat, lie: true }));
}
export function buildPills() {
  const o = G.order; if (!o) return;
  for (const el of wordEls) el.remove(); wordEls.length = 0;
  const seen = new Set(), head: Pill[] = G.head.slice().reverse().filter((h) => !seen.has(h.w) && seen.add(h.w)).slice(0, 7).reverse(); // the same word twice is one answer
  if (!o.lies) o.lies = sayables(o.place!);
  const items: Pill[] = [...head, ...o.lies.filter((l) => !seen.has(l.w))];
  if (!items.length) items.push({ w: '… nothing', cat: 'none' });
  const cx = clamp(G.nose[0]!, 0.25, 0.75), cy = clamp(G.nose[1]!, 0.42, 0.72);
  items.forEach((h, i) => {
    const el = document.createElement('div') as unknown as WordEl; el.className = 'pw pick' + (h.lie ? ' lie' : '') + (o.chosen!.includes(h) ? ' chosen' : '');
    const kind = h.lie ? 'say' : h.cat.split(':')[0]!;
    el.innerHTML = `<span class="key">${i + 1}</span><span class="tag">${TAG[kind] ?? ''}</span>${h.w}`;
    for (const [k, v] of Object.entries(analyzeNative('glossary:scent_answer'))) el.setAttribute(k, v);
    const a = items.length === 1 ? -Math.PI / 2 : -Math.PI * 0.92 + (i / (items.length - 1)) * Math.PI * 0.84;
    el._p = [clamp(cx + Math.cos(a) * 0.22, 0.08, 0.92), clamp(cy + Math.sin(a) * 0.32 - 0.04, 0.1, 0.7)];
    el._choose = () => {
      const oo = G.order; if (!oo || oo.k !== 'ask' || oo.chosen!.includes(h)) return;
      el.classList.add('chosen'); oo.chosen!.push(h);
      if (oo.chosen!.length >= Math.min(2, items.length)) answerWords();
    };
    el.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); el._choose!(); });
    $('#words').appendChild(el); wordEls.push(el);
  });
}
const isCat = (h: Pill, p: string) => h.cat.startsWith(p);
/* her rule by style; what is missing comes back as her words, so the rule is learnt from her */
export function judge(chosen: Pill[], place: string): { ok: boolean; miss?: string } {
  const st = ST(), rank = (h: Pill) => STAGE_RANK[h.cat.split(':')[1]!]!;
  const want = (h: Pill) => (isCat(h, 'stage:') && rank(h) >= 3) || h.w === 'more';
  const bad = (h: Pill) => (isCat(h, 'stage:') && rank(h) === 0) || h.cat === 'band:strong' || h.cat === 'band:overwhelming';
  const placeOk = chosen.some((h) => h.cat === 'place:' + place);
  const anyBand = chosen.some((h) => isCat(h, 'band:')), bandOk = chosen.some((h) => h.cat === 'band:' + S.band);
  const honest = chosen.some((h) => h.cat === 'stage:' + S.stage);
  switch (st.rule) {
    case 'any': return { ok: chosen.some((h) => h.cat !== 'none') };
    case 'warm': return placeOk || chosen.some((h) => isCat(h, 'stage:') && rank(h) >= 2) ? { ok: true } : { ok: false, miss: pick(LINES.miss.warm!) };
    case 'admit': return chosen.some(bad) ? { ok: true } : { ok: false, miss: pick(LINES.miss.admit!) };
    case 'bad_and_want': return !chosen.some(bad) ? { ok: false, miss: pick(LINES.miss.bad!) } : !chosen.some(want) ? { ok: false, miss: pick(LINES.miss.want!) } : { ok: true };
    case 'place_and_band': return !placeOk ? { ok: false, miss: pick(LINES.miss.place!) } : !anyBand ? { ok: false, miss: pick(LINES.miss.strength!) } : !bandOk ? { ok: false, miss: pick(LINES.miss.band!) } : { ok: true };
    case 'band_and_honest': return !bandOk ? { ok: false, miss: anyBand ? pick(LINES.miss.intensity_wrong!) : pick(LINES.miss.intensity_missing!) } : !honest ? { ok: false, miss: pick(LINES.miss.honest!) } : { ok: true };
  }
  return { ok: false };
}
export function answerWords() {
  const o = G.order; if (!o) return;
  for (const el of wordEls) { el.remove(); } wordEls.length = 0;
  const empty = o.chosen!.every((h) => h.cat === 'none');
  // what is said is spent: those words leave the head
  for (const h of o.chosen!) { const i = G.head.indexOf(h as HeadWord); if (i >= 0) { G.head.splice(i, 1); h.el!._gone = performance.now(); h.el!._out = [0, -1]; } }
  // a word not from the head, or a feeling that is not the body's own, is a lie: the body may give it away in the next breaths
  const lie = o.chosen!.some((h) => h.lie || (isCat(h, 'stage:') && h.cat !== 'stage:' + S.stage));
  if (lie) { G.lie = 2; G.counts.lies! += 1; }
  G.order = null; G.nextOrderAt = G.clock + randInt(...ST().every) * BEAT; G.nextAskAt = G.clock + randInt(...ST().askEvery) * 1000;
  const sendThere = () => { const p = LINES.here[S.contact]!.find((x) => x[1] === o.place); if (p) setTimeout(() => G.phase === 'loop' && !G.order && nameplace(p[0], p[1]), 1100); };
  if (empty) { judged(false, false); G.counts.empty! += 1; say(pick(LINES.answer.empty)); press(); sendThere(); return; }
  const v = judge(o.chosen!, o.place!);
  judged(v.ok, lie);
  if (v.ok) { G.counts.answered! += 1; say(pick(LINES.answer.ok[S.style]!)); lift(); scatter(2); }
  else {
    G.counts.wrong! += 1; say(v.miss ?? pick(LINES.answer.bad[S.style]!));
    if (S.style !== 'affectionate') press();
    if (['cruel', 'ritual', 'playful'].includes(S.style)) sendThere();
  }
}
