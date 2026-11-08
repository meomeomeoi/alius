// SillyTavern modules that are not exposed through getContext().
// Imported as `st:<module>`; scripts/build.mjs rewrites them to relative external imports.
declare module 'st:group-chats' {
  export function editGroup(id: string, immediately: boolean, reload?: boolean): Promise<void>;
  export function openGroupById(id: string): Promise<boolean | void>;
}
declare module 'st:world-info' {
  export const newWorldInfoEntryTemplate: Record<string, unknown>;
}
