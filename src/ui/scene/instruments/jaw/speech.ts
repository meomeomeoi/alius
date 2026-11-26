/**
 * P10e-e Task 20: speech through the opening (`docs/prototypes/jaw.html` `speak`, normative; `jaw/fidelity.json` checks it). Each letter is
 * spoken through the opening at the moment it is typed: the lips fail first (above 0.3), then the tongue's tip (0.5), then its back (0.86);
 * `e` and `i` go flat wide open (0.75); from fatigue 70 a letter may double. Pure but for the doubling's chance, which is this module's
 * xorshift (`Math.random` here: seeded by the jaw for the scene and the run; never the engine's rng).
 */
import { TUNING } from '../../../../engine/tuning';

/** The prototype's `DEGRADE_AT` (the engine's `jaw.degradeAt`): from here the letters smear and double. */
export const DEGRADE_AT = TUNING.physics.jaw.degradeAt;
/* speech: which sounds survive an opening (lips first, then the tongue's tip, then the back of the tongue) */
export const LABIAL = 'bpmfvw', DENTAL = 'tdnszcjxlr', VELAR = 'kgq';
export const OPEN_LIPS = 0.3, OPEN_TIP = 0.5, OPEN_BACK = 0.86, OPEN_VOWEL = 0.75;

/** No rng: the prototype's `Math.random` is a xorshift, seeded by the scene and the run (`reseed`); the jaw shares it. */
let seed = 2463534242;
function rnd01(): number {
  seed ^= seed << 13; seed >>>= 0;
  seed ^= seed >>> 17;
  seed ^= seed << 5; seed >>>= 0;
  return seed / 4294967296;
}
/** Sets the seed of the module's `Math.random` (0 is never a seed). */
export function reseed(n: number): void {
  seed = n >>> 0 || 2463534242;
}
// eslint-disable-next-line @typescript-eslint/naming-convention
export const Math: typeof globalThis.Math = Object.create(globalThis.Math, { random: { value: rnd01 } });

/* ---------- speech through the opening ---------- */
/* one letter through an opening `o` (0 shut, 1 wide): lips fail first, then the tongue's tip, then the back of the tongue; wide vowels go flat */
export function speak(ch: string, o: number, f: number) {
  const c = ch.toLowerCase(), up = ch !== c;
  let out = ch;
  if (!/[a-z]/.test(c)) return { out: ch, lost: false };
  if (LABIAL.includes(c) && o > OPEN_LIPS) out = 'h';
  else if (DENTAL.includes(c) && o > OPEN_TIP) out = c === 'l' || c === 'r' ? 'a' : c === 'n' ? 'ng' : 'h';
  else if (VELAR.includes(c) && o > OPEN_BACK) out = 'gh';
  else if ('ei'.includes(c) && o > OPEN_VOWEL) out = 'a';
  // a tired jaw smears: a letter doubles now and then
  if (f > DEGRADE_AT && Math.random() < (f - DEGRADE_AT) / 60) out += out.slice(-1);
  if (up) out = out[0]!.toUpperCase() + out.slice(1);
  return { out, lost: out.toLowerCase() !== c };
}

/** The prototype's `__speak` hook (its tests' own): a word through an opening, letter by letter. */
export const speakWord = (s: string, o: number, f = 0): string => [...s].map((c) => speak(c, o, f).out).join('');
