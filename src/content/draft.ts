/**
 * The draft marker. A text an author still has to write starts with `AUTHOR TO WRITE:` in the content and in the source (authors search for it),
 * but the marker is for authors only: no player and no model ever reads it. Everything that turns a draft text into something a player or the model
 * reads (a directive, a toast, a card, a fact written from a memory rule) goes through `plainDraft`. A leaf: it imports nothing, so the engine and the UI
 * may both use it.
 */

/** The marker as authors write it. */
export const DRAFT_MARKER = 'AUTHOR TO WRITE:';

const HAS_MARKER = /AUTHOR TO WRITE:/i;
const MARKER = /\s*AUTHOR TO WRITE:\s*/gi;

/**
 * The text without the draft marker (case-insensitive, with the whitespace around it): a leading marker goes, and so does one that a composed text carries
 * inside it (a registry hint put after a template's own words). A text without the marker comes back untouched.
 */
export function plainDraft(text: string): string {
  return HAS_MARKER.test(text) ? text.replace(MARKER, ' ').trim() : text;
}
