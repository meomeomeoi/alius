/** What the player reads about a failed generation (P14): `<label>: <why>.`. Pure text; the label is the site's generic one. */
export interface FailureView {
  label: string;
  /** A `FailReason` or `expired`. */
  reason: string;
  /** The tokens the last attempt sent (for "cut off at <n> tokens"). */
  budget?: number;
  timeoutMs?: number;
  expiredWhy?: string;
}

const WHY: Record<string, (v: FailureView) => string> = {
  refused: () => 'the model refused',
  truncated: (v) => (v.budget !== undefined && v.budget > 0 ? `the answer was cut off at ${v.budget} tokens` : 'the answer was cut off'),
  timeout: (v) => (v.timeoutMs !== undefined ? `no answer within ${Math.round(v.timeoutMs / 1000)} s` : 'no answer in time'),
  network: () => 'the connection failed',
  invalid_output: () => 'the answer did not fit the form',
  empty: () => 'nothing came back',
  no_profile: () => 'no mechanic profile is selected',
  expired: (v) => (v.expiredWhy ?? 'it can no longer be retried').replace(/\.+\s*$/, ''),
};

export function describeFailure(v: FailureView & { detail?: string }): string {
  const why = (WHY[v.reason] ?? (() => 'it failed'))(v);
  return `${v.label}: ${why}.`;
}
