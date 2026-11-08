const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** Sprite folder name: an Expressions override for the avatar if one exists, else the character's name. */
export function spriteFolder(avatar: string, name: string, overrides: unknown): string {
  if (!Array.isArray(overrides)) return name;
  const key = avatar.replace(/\.[^.]+$/, '');
  const hit = overrides.find((o) => isObj(o) && o.name === key && typeof o.path === 'string' && o.path !== '');
  return hit ? (hit as { path: string }).path : name;
}

/** The first sprite path with the given label, or null for anything malformed. */
export function pickSprite(list: unknown, label: string): string | null {
  if (!Array.isArray(list)) return null;
  for (const item of list) {
    if (isObj(item) && item.label === label && typeof item.path === 'string') return item.path;
  }
  return null;
}
