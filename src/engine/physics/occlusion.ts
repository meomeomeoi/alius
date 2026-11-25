/**
 * P10e-e Task 13: the shape of the dark over the commander's face while a breathing physics runs (spec §15, breath.html `SHAPES`): a contact
 * may carry `occlusion: { kind, side?, angle?, view? }`. `kind` is the shape (a contact without it gets the horizontal `slit`), `side` the side
 * a `lift`, a `slide` or a `wedge` comes from, `angle` the tilt in degrees (the `gap` between her soles), `view` what is seen behind the dark
 * (`ceiling` by default; `room` for a face pressed against her, the `slide`; `her_face` only where her face is really there). Read by field, never
 * by contact id. A leaf: types only. Also the view of a weight contact (`face`, `legs`: Tasks 15–16).
 */
import type { Entry } from '../../content/types';

export const OCCLUSION_KINDS = ['slit', 'gap', 'lift', 'slide', 'seat', 'squeeze', 'wedge'] as const;
export type OcclusionKind = (typeof OCCLUSION_KINDS)[number];
export const OCCLUSION_VIEWS = ['ceiling', 'room', 'her_face'] as const;
export type OcclusionView = (typeof OCCLUSION_VIEWS)[number];

export interface Occlusion { kind: OcclusionKind; side?: 'left' | 'right'; angle?: number; view: OcclusionView }

/** The prototype's view by kind when the contact names none (breath.html `VIEW_OF`: a `slide` sees the room, the rest the ceiling). */
const VIEW_OF: Partial<Record<OcclusionKind, OcclusionView>> = { slide: 'room' };

/** The occlusion of a contact (its `occlusion` field), or the slit and the ceiling. */
export function occlusionOf(contact: Entry | undefined): Occlusion {
  const o = contact?.occlusion as { kind?: string; side?: string; angle?: number; view?: string } | undefined;
  const kind = (OCCLUSION_KINDS as readonly string[]).includes(o?.kind ?? '') ? (o!.kind as OcclusionKind) : 'slit';
  const view = (OCCLUSION_VIEWS as readonly string[]).includes(o?.view ?? '') ? (o!.view as OcclusionView) : VIEW_OF[kind] ?? 'ceiling';
  return {
    kind,
    ...(o?.side === 'left' || o?.side === 'right' ? { side: o.side } : {}),
    ...(typeof o?.angle === 'number' && Number.isFinite(o.angle) ? { angle: o.angle } : {}),
    view,
  };
}

/**
 * P10e-e Task 15: the view of a weight contact (weight.html `CONTACTS[].face`): `up`, the commander on the back sees her and the ceiling; `down`,
 * the floor. Read by field (`face`), never by id; a contact without it faces the floor.
 */
export const CONTACT_FACES = ['up', 'down'] as const;
export type ContactFace = (typeof CONTACT_FACES)[number];
export function contactFaceOf(contact: Entry | undefined): ContactFace {
  return contact?.face === 'up' ? 'up' : 'down';
}

/**
 * P10e-e Task 16: her legs in the view of a face-down contact (weight.html: `human_chair`'s calves hang at the edges of the view, `legsHang`;
 * otherwise she is out of view and her tell is heard). Read by field (`legs: 'hang'`), never by id; absent = out of view.
 */
export const HER_LEGS = ['hang'] as const;
export function herLegsOf(contact: Entry | undefined): (typeof HER_LEGS)[number] | null {
  return contact?.legs === 'hang' ? 'hang' : null;
}
