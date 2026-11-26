/**
 * P10e-e Task 18: the vocabulary and the tables of scent (`docs/prototypes/saturation.html`, normative; `fidelity.json` checks each table
 * equal to the prototype's): the words of her scent, of the commander's stage, of her band and of her places (the variety is part of the
 * design), her places in her own words for her question, the pills' tags, her scent's colours, the strength of the air by contact, the band's
 * ambient fill, the body's pull by stage, her places by contact and her style's way with orders and her question. Data only: her lines are the
 * cue pool's and `cardVoice` `scent.*` (ruling Q), never these.
 */

/** Her style's way (saturation.html `STYLES`): her orders, her question's rule and what she does with a mouth breath. `ask` and `note` are the prototype's texts (her ask is read from `cardVoice` `scent.ask`). */
export interface StyleRow {
  every: [number, number];
  orders?: Record<string, number>;
  cycle?: string[];
  tour?: boolean;
  ask: string[];
  askEvery: [number, number];
  moves?: number;
  rule: string;
  mouth: string;
  note: string;
}

export const STAGE_PULL: Record<string, number> = { aversion: -0.7, enduring: -0.25, accustomed: 0, craving: 0.55, adoring: 0.95 };

export const SCENT: Record<string, string[]> = {
  sweat: ['salt', 'sweat', 'skin', 'damp heat', 'musk', 'a sharp tang', 'dried salt', 'her run', 'brine', 'body heat', 'warm damp', 'her effort'],
  leather: ['leather', 'boot polish', 'worn hide', 'oiled leather', 'tannin', 'laces', 'road dust', 'rubber', 'polish and skin', 'smoke-cured', 'saddle soap', 'old boots'],
  soap: ['soap', 'clean', 'lather', 'cotton', 'steam', 'lavender', 'linen', 'rain', 'warm water', 'white soap', 'a towel', 'fresh'],
  gunpowder: ['cordite', 'gun oil', 'metal', 'smoke', 'brass', 'sulphur', 'burnt', 'range dust', 'steel', 'solvent', 'spent casings', 'ozone'],
  perfume: ['perfume', 'violet', 'musk', 'powder', 'vanilla', 'sweet', 'amber', 'iris', 'rose', 'warm wood', 'a floral note', 'her neck'],
};

export const STAGE_W: Record<string, string[]> = {
  aversion: ['sharp', 'sour', 'too much', 'it stings', 'rank', 'choking', 'harsh', 'it hits the nose'],
  enduring: ['heavy', 'close', 'thick', 'it lingers', 'dense', 'stale', 'cloying', 'insistent'],
  accustomed: ['familiar', 'hers', 'known', 'steady', 'plain', 'her own', 'ordinary', 'recognisable'],
  craving: ['warm', 'deep', 'wanted', 'more', 'in the chest', 'sweet', 'good', 'comforting'],
  adoring: ['all hers', 'everything', 'precious', 'perfect', 'home', 'beloved', 'worth it', 'all of her'],
};

export const BAND_W: Record<string, string[]> = {
  faint: ['a trace', 'barely there', 'faint', 'a hint', 'soft'],
  noticeable: ['clear', 'present', 'noticeable', 'plain to tell'],
  strong: ['strong', 'thick', 'full', 'heavy-laden'],
  overwhelming: ['overwhelming', 'drowning', 'everywhere', 'suffocating', 'all of it'],
};

export const PLACE_W: Record<string, string[]> = {
  toes: ['her toes', 'between her toes'], ball: ['the ball of her foot', 'under her toes'], arch: ['her arch', 'the curve of her sole'], heel: ['her heel'],
  center: ['the middle of her', 'right against her', 'closest to her'], side: ['her hip', 'the curve of her'],
  hollow: ['her underarm', 'the hollow'], edge: ['her side', 'the edge of her arm'],
};

export const HER_PLACE: Record<string, string> = { toes: 'my toes', ball: 'the balls of my feet', arch: 'my arches', heel: 'my heels', center: 'my seat', side: 'my hips', hollow: 'my underarms', edge: 'my sides' };

export const TAG: Record<string, string> = { place: 'where', scent: 'scent', stage: 'feel', band: 'how strong', say: 'say it' };

export const STAGE_RANK: Record<string, number> = { aversion: 0, enduring: 1, accustomed: 2, craving: 3, adoring: 4 };

export const COLORS: Record<string, string> = { sweat: '255,198,164', leather: '236,176,128', soap: '214,232,255', gunpowder: '196,206,226', perfume: '228,178,255' };

export const BASE_I: Record<string, number> = { feet_on_face: 0.2, face_to_bottom: 0.35, smothered_armpit: 0.45 };

export const AMBIENT_MS: Record<string, number> = { faint: 0, noticeable: 9000, strong: 6000, overwhelming: 3500 };

export const ZONE_IDS: Record<string, string[]> = { feet_on_face: ['toes', 'ball', 'arch', 'heel'], face_to_bottom: ['center', 'side'], smothered_armpit: ['hollow', 'edge'] };

export const STYLES: Record<string, StyleRow> = {
  neutral:      { every: [3, 5], orders: { deeper: 3, gently: 1, here: 2, still: 1 }, ask: ['{p}. what do you smell?', 'tell me about {p}.'], askEvery: [24, 32],
                  rule: 'warm', mouth: 'mild', note: 'wants to hear it is not bad any more (familiar or better), or the place she named' },
  affectionate: { every: [5, 7], orders: { gently: 3, here: 1, deeper: 1 }, ask: ['{p}, love. how is it?', 'tell me about {p}. anything.'], askEvery: [26, 34],
                  rule: 'any', mouth: 'allowed', note: 'any answer is fine; she never punishes honesty; the mouth is allowed' },
  playful:      { every: [2, 4], orders: { here: 3, deeper: 2, still: 1 }, ask: ['be honest~ {p}: strong?', '{p}. how bad? tell me~'], askEvery: [20, 28], moves: 0.4,
                  rule: 'admit', mouth: 'tease', note: 'wants you to admit how strong it is; her mark sometimes moves once you get there' },
  cruel:        { every: [2, 3], orders: { deeper: 4, still: 2, here: 2 }, ask: ['{p}. tell me how bad it is. and what you want.', '{p}. how does it smell? and what do you want?'], askEvery: [20, 26],
                  rule: 'bad_and_want', mouth: 'punish', note: 'wants it said both ways: that it is bad, and that you want more' },
  ritual:       { every: [4, 4], cycle: ['here', 'deeper', 'still'], ask: ['{p}. where, and how strong?'], askEvery: [24, 24],
                  rule: 'place_and_band', mouth: 'permission', note: 'a fixed cycle (a place, deeper, still); wants the place she asked and the right strength' },
  clinical:     { every: [3, 3], tour: true, ask: ['report on {p}: intensity, and what you feel.'], askEvery: [22, 22],
                  rule: 'band_and_honest', mouth: 'noted', note: 'a tour of her places in order; wants the exact strength and your honest feeling' },
};
