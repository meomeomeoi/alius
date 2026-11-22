/**
 * P10e §5: the input line is a gauge surface for the mini-games. It can narrow, tremble, carry a pulse that runs along its top
 * edge and a highlighted window. This module is the surface and its API only: what each mini-game shows on it is decided
 * in the mini-games session. CSS reads the variables (css/62-stage.css); every value is clamped to 0…1.
 */
export interface InputGauge {
  /** 0 = full width, 1 = narrowed the most. */
  narrow(f: number): void;
  /** 0 = still, 1…3 = an ever stronger tremor (a still offset under reduced motion). */
  tremble(level: 0 | 1 | 2 | 3): void;
  /** A pulse at this fraction of the top edge; null removes it. */
  pulse(at: number | null): void;
  /** A highlighted window from…to along the line. */
  window(from: number, to: number): void;
  /** Back to a plain line. */
  clear(): void;
}

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));
const VARS = ['--alius-gauge-narrow', '--alius-gauge-pulse', '--alius-gauge-from', '--alius-gauge-to'] as const;

export function inputGauge(host: HTMLElement): InputGauge {
  const set = (name: string, n: number): void => {
    if (Number.isFinite(n)) host.style.setProperty(name, String(clamp01(n)));
    else host.style.removeProperty(name);
  };
  return {
    narrow: (f) => set('--alius-gauge-narrow', f),
    tremble(level) {
      if (level >= 1) host.dataset.tremble = String(Math.min(3, Math.round(level)));
      else delete host.dataset.tremble;
    },
    pulse(at) {
      if (at === null) host.style.removeProperty('--alius-gauge-pulse');
      else set('--alius-gauge-pulse', at);
    },
    window(from, to) {
      set('--alius-gauge-from', from);
      set('--alius-gauge-to', to);
    },
    clear() {
      for (const v of VARS) host.style.removeProperty(v);
      delete host.dataset.tremble;
    },
  };
}
