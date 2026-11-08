import type { ProfileInfo } from './adapter';

/**
 * Connection profiles usable for mechanic calls. Settings of a disabled Connection Manager
 * persist, so a disabled extension or a missing request service must yield no profiles —
 * otherwise a stale selection would make mechanic calls fail instead of falling back.
 */
export function connectionProfiles(
  extensionSettings: Record<string, any> | undefined,
  requestServiceAvailable: boolean,
): ProfileInfo[] {
  if (!requestServiceAvailable) return [];
  const disabled = extensionSettings?.disabledExtensions;
  if (Array.isArray(disabled) && disabled.includes('connection-manager')) return [];
  const profiles = extensionSettings?.connectionManager?.profiles;
  if (!Array.isArray(profiles)) return [];
  return profiles.map((p: Record<string, any>) => ({
    id: String(p.id),
    name: String(p.name ?? p.id),
    api: String(p.api ?? ''),
    model: String(p.model ?? ''),
  }));
}
