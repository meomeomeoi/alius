import type { Entry, Registries } from '../../content/types';
import { SOCIAL_STATS, type SocialStat } from '../social';
import { VALUE_AXES, type CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { clockById } from '../world/state';
import type { WorldEffect } from '../world/types';
import type { Magnitude, Rejection } from './types';

/** What the model may say an effect is made of. Numbers are never part of it. */
export const EFFECT_KINDS = ['resource', 'unit_event', 'faction', 'clock', 'flag', 'stress', 'social_check'] as const;
export const MAGNITUDES = ['small', 'medium', 'large'] as const;

export interface MapCtx {
  state: CampaignState;
  reg: Registries;
  template: Entry;
  /** The thread the dilemma belongs to: the only namespace of dynamic flags it may set. */
  threadId?: string;
}

export type MappedEffect = WorldEffect | { check: { stat: SocialStat; rank: number } };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const slot = (m: Magnitude): 0 | 1 | 2 => (m === 'small' ? 0 : m === 'medium' ? 1 : 2);
const shape = (reason: string): Rejection => ({ rule: 'shape', reason });
const flagRule = (reason: string): Rejection => ({ rule: 6, reason });

/** Plain text of a model line: control characters out, whitespace collapsed, cut to `max` characters. Markup is kept as text. */
export function plainText(v: unknown, max: number): string {
  // whitespace of any kind becomes one space; what else is invisible or reorders text (control, zero-width, bidi) goes
  // eslint-disable-next-line no-control-regex
  const t = String(v).replace(/\s+/g, ' ').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '').replace(/ {2,}/g, ' ').trim();
  return t.slice(0, max).trim();
}

/**
 * Translates one effect of a generated dilemma into P5's world-effect vocabulary. Every number comes from
 * `TUNING.dilemma.magnitude`; whatever number the model wrote is ignored. A `social_check` is not an effect: it becomes
 * the option's `{ check }`. Anything unknown, a clock that is full or missing, a faction outside `corporations` and a
 * flag the template does not allow (rule 6) is a rejection. Never throws.
 */
export function toWorldEffect(raw: unknown, ctx: MapCtx): MappedEffect | Rejection {
  if (!isObj(raw)) return shape('An effect must be an object.');
  const { kind, target, direction, magnitude } = raw;
  if (!(EFFECT_KINDS as readonly unknown[]).includes(kind)) return shape(`Unknown effect kind "${String(kind)}".`);
  if (typeof target !== 'string' || target === '') return shape('An effect needs a target.');
  if (direction !== 1 && direction !== -1) return shape('An effect direction is 1 or -1.');
  if (!(MAGNITUDES as readonly unknown[]).includes(magnitude)) return shape(`Unknown magnitude "${String(magnitude)}".`);
  const m = TUNING.dilemma.magnitude;
  const i = slot(magnitude as Magnitude);

  switch (kind) {
    case 'resource': {
      if (target !== 'credits' && target !== 'supplies' && target !== 'plyx') return shape(`Unknown resource "${target}".`);
      return { type: 'resource', resource: target, amount: direction * m[target][i] };
    }
    case 'faction': {
      if (!ctx.reg.corporations.has(target)) return shape(`Unknown faction "${target}".`);
      return { type: 'faction', factionId: target, amount: direction * m.faction[i] };
    }
    case 'clock': {
      const clock = clockById(ctx.state, target);
      if (!clock) return shape(`Unknown clock "${target}".`);
      if (clock.filled >= clock.segments) return shape(`Clock "${target}" is full.`);
      return { type: 'clock', clockId: target, by: direction * m.clock[i] };
    }
    case 'stress':
      return { type: 'party_stress', amount: direction * m.stress[i] };
    case 'unit_event': {
      if (!(VALUE_AXES as readonly string[]).includes(target)) return shape(`Unknown value axis "${target}".`);
      return {
        type: 'unit_event', event: 'decision_aligned', severity: m.severity[i], targets: 'named',
        valueAxes: [{ axis: target as (typeof VALUE_AXES)[number], direction }],
      };
    }
    case 'social_check': {
      if (!(SOCIAL_STATS as readonly string[]).includes(target)) return shape(`Unknown social stat "${target}".`);
      return { check: { stat: target as SocialStat, rank: m.checkRank[i] } };
    }
    default: {
      // flag: a declared flag the template allows, or a dynamic flag in the dilemma's own thread
      if (target.startsWith('thread:')) {
        const threadId = ctx.threadId;
        if (threadId === undefined || !target.startsWith(`thread:${threadId}:`) || !/^thread:[^:]+:[a-z0-9_]+$/.test(target)) {
          return flagRule(`Flag "${target}" is not in this dilemma's thread.`);
        }
        const note = typeof raw.note === 'string' && plainText(raw.note, 120) !== '' ? plainText(raw.note, 120) : 'Set by a decision.';
        return { type: 'thread_flag', threadId, flagId: target, description: note };
      }
      const def = ctx.reg.flags.get(target);
      if (!def || (def.scope !== 'world' && def.scope !== 'commander')) return flagRule(`Flag "${target}" is not a declared story flag.`);
      const allowed = (ctx.template.allowedFlags as string[] | undefined) ?? [];
      if (!allowed.includes(target)) return flagRule(`Flag "${target}" is not allowed in this dilemma.`);
      return { type: 'flag', flagId: target };
    }
  }
}
