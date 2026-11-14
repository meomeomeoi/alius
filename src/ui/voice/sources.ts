/** The four ways text speaks in the shell (spec P10 §3). `VoiceCard` (chunk (c)) renders them. */
export type Voice = 'terminal' | 'corporate' | 'paper' | 'personal';

/** Who is speaking is declared here, in one table, never at the call sites that show the text. */
export type VoiceSource =
  | 'toast' | 'dm' | 'unit_note' | 'chronicle' | 'dossier' | 'commander_file'
  | 'oversight' | 'leash_verdict' | 'corporate_mail' | 'intake_form';

export const VOICE_OF: Record<VoiceSource, Voice> = {
  toast: 'terminal',
  dm: 'personal',
  unit_note: 'personal',
  chronicle: 'paper',
  dossier: 'paper',
  commander_file: 'paper',
  oversight: 'corporate',
  leash_verdict: 'corporate',
  corporate_mail: 'corporate',
  // P11
  intake_form: 'paper',
};
