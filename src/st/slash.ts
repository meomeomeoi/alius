const ZWSP = '​';

/**
 * Makes user text safe to be the argument of a slash command: pipes are escaped (a pipe would start the next command),
 * and `{{`/`}}` get an invisible separator so neither macro substitution nor ST's message-bias syntax reads them;
 * a leading `/` gets one too. Newlines and everything else are kept.
 */
export function escapeSlashText(s: string): string {
  let t = s.replace(/(\\*)\|/g, (_m, slashes: string) => `${slashes}${slashes}\\|`);
  t = t.replace(/\{\{/g, `{${ZWSP}{`).replace(/\}\}/g, `}${ZWSP}}`);
  if (t.startsWith('/')) t = ZWSP + t;
  return t;
}

/** Sends the text as the user and lets the group (or the single character) answer; resolves when the replies are done. */
export const sendCommand = (text: string): string => `/send ${escapeSlashText(text)} | /trigger await=true`;

/** Escapes a name or label used as a bare argument. */
export const slashArg = (s: string): string => escapeSlashText(s).replace(/\s+/g, ' ').trim();
