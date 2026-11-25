/**
 * P10e-e kit: an instrument's own summary at the end of a run (UI only, R28: the model's sentence is the engine's `physics:end` directive,
 * built from `run.tally`). `hers` are her lines as she perceived the run, `mine` what the commander did, `ended` how it ended. It carries
 * only what she perceived (an uncaught cheat is never in it) and no hidden value.
 */
export interface Digest {
  physicsId: string;
  hers: string[];
  mine: string[];
  ended: string;
}
