export type RngState = [number, number, number, number];

function splitmix32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t = t ^ (t >>> 15);
    t = Math.imul(t, 0x735a2d97);
    return (t ^ (t >>> 15)) >>> 0;
  };
}

/** Builds an sfc32 state from a seed; the first outputs are discarded to decorrelate similar seeds. */
export function seedRng(seed: number): RngState {
  const mix = splitmix32(seed);
  const state: RngState = [mix(), mix(), mix(), mix()];
  const rng = new Rng(state);
  for (let i = 0; i < 12; i++) rng.float();
  return rng.state;
}

/** sfc32 PRNG. The four-word state is plain data, so it serializes into campaign state. */
export class Rng {
  private s: RngState;

  constructor(state: RngState) {
    this.s = [state[0] >>> 0, state[1] >>> 0, state[2] >>> 0, state[3] >>> 0];
  }

  get state(): RngState {
    return [this.s[0], this.s[1], this.s[2], this.s[3]];
  }

  /** Rewinds the generator to a saved state (easy retry). */
  restore(state: RngState): void {
    this.s = [state[0] >>> 0, state[1] >>> 0, state[2] >>> 0, state[3] >>> 0];
  }

  private next(): number {
    let [a, b, c, d] = this.s;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    this.s = [a >>> 0, b >>> 0, c >>> 0, d >>> 0];
    return t >>> 0;
  }

  /** Uniform in [0, 1). */
  float(): number {
    return this.next() / 4294967296;
  }

  /** Uniform integer in [min, max], both inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.float() * (max - min + 1));
  }

  chance(p: number): boolean {
    return this.float() < p;
  }

  pick<T>(xs: readonly T[]): T {
    if (xs.length === 0) throw new Error('Rng.pick: empty array');
    return xs[this.int(0, xs.length - 1)];
  }
}
