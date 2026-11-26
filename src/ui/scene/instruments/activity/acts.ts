/**
 * P10e-e Task 24: her activities' marks, sounds and ends (her_activity.html `ACTS`, as it is), the views (`VIEWS`) and the base by the hour
 * (`BASE_EVENTS`). The engine's half of `ACTS` (absorb, hear, light, unit, total, per, legs and what the activity brings) is `blockingActivities`
 * `frame` (R24); the marks, sounds and ends stay here, the instrument's data. Her self-talk (`ACTS[].self`) is the script's (the model's,
 * `activity_script`): the prototype's placeholders are not shipped. Nothing here is her line: the marks are sensory lines on the side of the
 * source (P17d), worded by the view.
 */
export interface Mark { w: number; sfx: string | null; g?: number; prog?: number; then?: string; legs?: 'shift'; len?: [number, number]; seen: string; heard: string }
export interface Act { label: string; marks: Mark[]; end: { sfx: string; seen: string; heard: string } }
export interface View { sight: boolean; label: string; note: string; her: [number, number]; herPan: number; door: [number, number]; doorPan: number; body: [number, number] }

/* ---------- the four views: what the commander perceives, and where things are heard from ---------- */
export const VIEWS: Record<string, View> = {
  her:   { sight: true,  label: 'her',   note: 'Beside her chair, eyes allowed up: the room, and her, lit by her lamp or her screen.',
           her: [0.5, 0.2], herPan: 0, door: [0.9, 0.42], doorPan: 0.85, body: [0.5, 0.64] },
  legs:  { sight: false, label: 'legs',  note: 'Under her desk: the desk around you, her legs before you, the room beyond. You hear her above.',
           her: [0.5, 0.1], herPan: 0, door: [0.86, 0.5], doorPan: 0.8, body: [0.5, 0.66] },
  floor: { sight: false, label: 'floor', note: 'Kneeling by her bunk, eyes down: the floor. She is above you, to the left.',
           her: [0.24, 0.14], herPan: -0.45, door: [0.9, 0.36], doorPan: 0.8, body: [0.5, 0.66] },
  footrest: { sight: false, label: 'footrest', note: 'On all fours, her feet resting on your back while she sits in her chair: the floor; she is above and out of view.',
           her: [0.5, 0.1], herPan: 0, door: [0.88, 0.4], doorPan: 0.8, body: [0.5, 0.66] },
  wall:  { sight: false, label: 'wall',  note: 'Facing the wall: hearing only. She is behind you; the door behind, to the left.',
           her: [0.5, 0.7], herPan: 0, door: [0.1, 0.5], doorPan: -0.8, body: [0.5, 0.56] },
};

/* ---------- her activities. Every mark has a `seen` and a `heard` wording (chosen by the view) and a sound; nothing is drawn. ---------- */
export const ACTS: Record<string, Act> = {
  reading_book: { label: 'reading a book',
    marks: [
      { w: 8, sfx: 'page', g: 0.55, prog: 1, seen: 'She turns a page.', heard: 'A page turns, above you.' },
      { w: 1, sfx: 'mug', g: 0.4, seen: 'She lifts her mug without looking, drinks, sets it back.', heard: 'A sip. The mug goes back down on the desk.' },
      { w: 1, sfx: 'creak', g: 0.35, legs: 'shift', seen: 'She settles deeper into her chair.', heard: 'Her chair creaks; she settles deeper.' },
      { w: 1, sfx: 'cloth', g: 0.35, seen: 'She tucks her hair back, still reading.', heard: 'A rustle of cloth; then only the pages again.' },
      { w: 0.6, sfx: 'page', g: 0.5, prog: 3, seen: 'She flicks back a few pages to check something.', heard: 'Several pages, quickly, backwards.' },
    ],
    end: { sfx: 'book_close', seen: 'She closes the book on a finger, then lets it shut.', heard: 'The book shuts.' } },
  reading_reports: { label: 'reading reports',
    marks: [
      { w: 6, sfx: 'sheet', g: 0.5, prog: 1, then: 'wood', seen: 'She lays another sheet on the pile.', heard: 'Paper on paper, above and to the left.' },
      { w: 2, sfx: 'pencil_write', g: 0.35, seen: 'She underlines something, hard.', heard: 'A pen, a short hard line.' },
      { w: 1, sfx: 'metal_click', g: 0.3, seen: 'She unclips a bundle.', heard: 'A clip snaps open.' },
      { w: 1, sfx: 'mug', g: 0.4, seen: 'She drinks, eyes still on the page.', heard: 'A sip; the mug goes down.' },
    ],
    end: { sfx: 'book_place', seen: 'She squares the pile and pushes it away.', heard: 'A pile knocked square on the desk, pushed away.' } },
  writing_report: { label: 'writing a report',
    marks: [
      { w: 6, sfx: 'typing', g: 0.38, len: [1.2, 3.2], prog: 1, seen: 'She types in a quick burst.', heard: 'Keys, a quick burst, then nothing.' },
      { w: 2, sfx: 'key', g: 0.4, seen: 'She deletes a word, key by key.', heard: 'One key, again and again: she deletes something.' },
      { w: 1, sfx: 'creak', g: 0.3, legs: 'shift', seen: 'She leans back to read what she wrote.', heard: 'The chair leans back. She reads it over.' },
    ],
    end: { sfx: 'key', seen: 'She sends it and leans back.', heard: 'One last key, decisive.' } },
  on_comms: { label: 'on comms (oversight)',
    marks: [
      { w: 2, sfx: 'key', g: 0.3, seen: 'She types a note while she listens.', heard: 'A few keys, quietly, while she listens.' },
      { w: 1, sfx: 'creak', g: 0.3, legs: 'shift', seen: 'She shifts the earpiece and her weight.', heard: 'Her chair, a small creak.' },
    ],
    end: { sfx: 'pda_ok', seen: 'She ends the call and pulls the earpiece out.', heard: 'A soft chime: the call is over.' } },
  chatting_on_pda: { label: 'chatting on her PDA',
    marks: [
      { w: 5, sfx: 'tapping', g: 0.3, prog: 1, seen: 'She thumbs out a message.', heard: 'Quick taps on glass.' },
      { w: 3, sfx: 'pda_msg', g: 0.25, seen: 'A message comes in; she smiles at it.', heard: 'A soft chime. A breath of a laugh.' },
      { w: 1, sfx: 'cloth', g: 0.3, seen: 'She curls up a little in her chair, still typing.', heard: 'Cloth; she curls up in the chair.' },
    ],
    end: { sfx: 'click', seen: 'She locks the screen and drops the PDA on the desk.', heard: 'The PDA, set down hard on the desk.' } },
  playing_cards: { label: 'cards with a friend',
    marks: [
      { w: 3, sfx: 'card_slide', g: 0.45, seen: 'She deals across the desk.', heard: 'Cards slide across the desk.' },
      { w: 3, sfx: 'card_place', g: 0.45, seen: 'She lays a card down with a snap.', heard: 'A card laid down, hard.' },
      { w: 1.5, sfx: 'chips', g: 0.4, seen: 'Chips change hands.', heard: 'Chips clatter.' },
      { w: 1, sfx: 'card_shuffle', g: 0.4, prog: 1, seen: 'She gathers the cards and shuffles.', heard: 'A long shuffle: a new hand.' },
    ],
    end: { sfx: 'card_fan', seen: 'She throws her cards in.', heard: 'Cards thrown in, the deck squared.' } },
  sleeping: { label: 'sleeping',
    marks: [
      { w: 3, sfx: 'cloth', g: 0.3, seen: 'She turns over in her sleep.', heard: 'Sheets; she turns over.' },
      { w: 2, sfx: 'creak', g: 0.25, seen: 'The bunk gives as she shifts.', heard: 'The bunk creaks under her.' },
      { w: 1, sfx: null, seen: 'She murmurs something, not to anyone.', heard: 'A murmur in her sleep; no words.' },
    ],
    end: { sfx: 'cloth', seen: 'She wakes and stretches.', heard: 'A long stretch, a yawn: she is awake.' } },
  music: { label: 'music (headphones)',
    marks: [
      { w: 3, sfx: null, prog: 1, seen: 'A track ends; she skips the next one.', heard: 'The tinny beat stops; another starts.' },
      { w: 2, sfx: 'cloth', g: 0.3, seen: 'She mouths the words with her eyes closed.', heard: 'She hums a bar, off key.' },
    ],
    end: { sfx: 'click', seen: 'She pulls the headphones down to her neck.', heard: 'The beat cuts off.' } },
  cleaning_weapon: { label: 'cleaning her weapon',
    marks: [
      { w: 3, sfx: 'metal_click', g: 0.45, prog: 1, seen: 'She strips another part and lays it out.', heard: 'Metal clicks apart.' },
      { w: 2, sfx: 'cloth', g: 0.4, seen: 'She runs the rag through.', heard: 'A rag, back and forth.' },
      { w: 1.5, sfx: 'metal_latch', g: 0.45, seen: 'She snaps a part back in place.', heard: 'A snap: something seated.' },
      { w: 1, sfx: 'metal_light', g: 0.35, seen: 'She sets the slide down on the desk.', heard: 'Metal set down on wood.' },
    ],
    end: { sfx: 'metal_latch', seen: 'She racks it once, satisfied.', heard: 'The slide racks once.' } },
  mending_clothes: { label: 'mending clothes',
    marks: [
      { w: 5, sfx: 'thread', g: 0.4, prog: 3, seen: 'She pulls the thread through, long.', heard: 'A thread drawn through cloth.' },
      { w: 1.5, sfx: 'snip', g: 0.5, seen: 'She snips a thread.', heard: 'Scissors: snip.' },
      { w: 1, sfx: 'cloth', g: 0.35, seen: 'She turns the shirt inside out.', heard: 'Cloth turned over.' },
    ],
    end: { sfx: 'snip', seen: 'She bites off the last thread and shakes the shirt out.', heard: 'A last snip; cloth shaken out.' } },
  drinking: { label: 'drinking',
    marks: [
      { w: 2, sfx: 'pour', g: 0.5, prog: 1, then: 'glass', seen: 'She pours another.', heard: 'Pouring, then the bottle set down.' },
      { w: 3, sfx: 'glass', g: 0.35, seen: 'She drinks and sets the glass down.', heard: 'A glass set down on the desk.' },
      { w: 1, sfx: 'creak', g: 0.35, legs: 'shift', seen: 'She stretches her legs out.', heard: 'Her chair, a long creak.' },
    ],
    end: { sfx: 'glass', seen: 'She turns the glass upside down.', heard: 'A glass turned over on the desk.' } },
  sketching: { label: 'sketching',
    marks: [
      { w: 5, sfx: 'pencil_write', g: 0.4, prog: 2, seen: 'Her pencil moves in long strokes.', heard: 'A pencil, long strokes.' },
      { w: 1.5, sfx: 'pencil_erase', g: 0.4, seen: 'She erases something, frowning.', heard: 'An eraser, impatient.' },
      { w: 1, sfx: 'sheet', g: 0.35, seen: 'She tears out a page and starts again.', heard: 'Paper torn out, balled up.' },
    ],
    end: { sfx: 'book_close', seen: 'She closes the sketchbook before you can see.', heard: 'A sketchbook snaps shut.' } },
};

/** A framed activity this module has no marks for (a content row added later): a quiet one, a page now and then. */
export const QUIET_ACT: Act = { label: 'her own work', marks: [{ w: 1, sfx: 'cloth', g: 0.3, seen: 'She shifts in her chair, busy.', heard: 'Cloth, above you.' }], end: { sfx: 'cloth', seen: 'She is done.', heard: 'She stops; she is done.' } };

/* ---------- the base by the hour (the clock nobody sees) ---------- */
export const BASE_EVENTS = [
  { at: 19 * 60, id: 'mess', sense: 'Far off, through the walls: the mess bell, then the noise of the squad at supper.' },
  { at: 19 * 60 + 35, id: 'dusk', sense: '' },
  { at: 20 * 60 + 40, id: 'mess_end', sense: 'The noise from the mess thins out and stops.' },
  { at: 21 * 60 + 10, id: 'patrol', sense: 'Boots in the corridor: the evening round, passing.' },
  { at: 22 * 60, id: 'lights_out', sense: 'A horn, far away: lights out. The generator drops to its night hum.' },
  { at: 23 * 60 + 20, id: 'patrol', sense: 'The night round: slower boots, a torch-click, gone.' },
  { at: 14 * 60, id: 'drill', sense: 'Outside: someone counting a drill, faint.' },
];

/* the recorded sounds (CC0, assets/sounds/ha) and their groups (her_activity.html `SAMPLE_URLS`, `GROUPS`) */
const HA = (k: string): string => `assets/sounds/ha/${k}.ogg`;
const FILES = [
  'page1', 'page2', 'page3', 'page4', 'page5', 'page6', 'book_open', 'book_close', 'book_place', 'sheet1', 'sheet2', 'sheet3', 'pencil_write', 'pencil_erase',
  'typing1', 'typing2', 'key1', 'key2', 'card_shuffle', 'card_slide1', 'card_slide2', 'card_place1', 'card_place2', 'card_fan', 'chips1', 'chips2',
  'cloth1', 'cloth2', 'cloth3', 'cloth4', 'creak1', 'creak2', 'creak3', 'door_open', 'door_close1', 'door_close2', 'step_c0', 'step_c1', 'step_c2', 'step_c3', 'step_c4',
  'step_w0', 'step_w1', 'step_w2', 'metal_click', 'metal_latch', 'belt', 'metal_light', 'glass1', 'glass2', 'mug1', 'mug2', 'wood1', 'wood2', 'knock', 'soft1', 'soft2',
  'bell', 'pda_ok', 'pda_msg', 'pda_call', 'click', 'lamp', 'rain', 'crowd', 'pour',
];
export const SAMPLE_URLS: Record<string, string> = { ...Object.fromEntries(FILES.map((k) => [k, HA(k)])), breath: 'assets/sounds/breath-in-out.mp3' };
/* sound groups: one id plays a random member */
export const GROUPS: Record<string, string[]> = {
  page: ['page1', 'page2', 'page3', 'page4', 'page5', 'page6'], sheet: ['sheet1', 'sheet2', 'sheet3'], typing: ['typing1', 'typing2'], key: ['key1', 'key2'],
  card_slide: ['card_slide1', 'card_slide2'], card_place: ['card_place1', 'card_place2'], chips: ['chips1', 'chips2'],
  cloth: ['cloth1', 'cloth2', 'cloth3', 'cloth4'], creak: ['creak1', 'creak2', 'creak3'], door_close: ['door_close1', 'door_close2'],
  step: ['step_c0', 'step_c1', 'step_c2', 'step_c3', 'step_c4'], step_w: ['step_w0', 'step_w1', 'step_w2'],
  glass: ['glass1', 'glass2'], mug: ['mug1', 'mug2'], wood: ['wood1', 'wood2'], soft: ['soft1', 'soft2'],
};
