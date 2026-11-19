/** The four ways text speaks in the shell (spec P10 §3). `VoiceCard` (chunk (c)) renders them. */
export type Voice = 'terminal' | 'corporate' | 'paper' | 'personal';

/** Who is speaking is declared here, in one table, never at the call sites that show the text. */
export type VoiceSource =
  | 'toast' | 'dm' | 'unit_note' | 'chronicle' | 'dossier' | 'commander_file'
  | 'oversight' | 'leash_verdict' | 'corporate_mail' | 'intake_form' | 'squad_vote' | 'her_call' | 'booking' | 'device_edit' | 'squad_secret' | 'frequency' | 'premonition' | 'handler' | 'warden_reveal' | 'warden_notice';

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
  // P9b: the VOTE panel is the oversight office's tally sheet
  squad_vote: 'corporate',
  // P9e: a soldier's own decision in the field reads as her, not as the system
  her_call: 'personal',
  // P9c: a soldier's booking of the commander's time and her edit of an outgoing message read as her
  booking: 'personal',
  device_edit: 'personal',
  // P9c: what the squad kept from the commander, found out, is a file entry
  squad_secret: 'paper',
  // P12: what the frequency caught and its toasts are the device's own readout
  frequency: 'terminal',
  // P12: the early warning is the device's readout too
  premonition: 'terminal',
  // P12: the rival corporation's handler writes like a corporation
  handler: 'corporate',
  // P13: the notice that names the warden is the corporation's
  warden_reveal: 'corporate',
  // P13: the warden's moves (warnings, punishments, the Leash, her panel) are the corporation's too
  warden_notice: 'corporate',
};
