/** Coarse reading of a -3…+3 value axis: shown instead of the number unless "show raw values" is on. */
export function valueBand(v: number): 'LOW' | 'MID' | 'HIGH' {
  return v <= -2 ? 'LOW' : v >= 2 ? 'HIGH' : 'MID';
}
