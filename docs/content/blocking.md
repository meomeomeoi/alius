# Blocking vocabulary — starter content for P15a

Source: the 0.2 depth review (2026-11-19). This file is the **content** of P15a §4: every item, contact and activity with its essence and its effects. The JSON in `content/core` mirrors it; where a field is missing here the planner asks the author instead of inventing it. `label`, `description` and `promptHint` texts are `AUTHOR TO WRITE` unless given; the **essence** line says what the entry is and is the basis for them. No pronoun for the commander in any text that ships (lore §0).

Notation:
- `scope`: `any` (every close relation) or `dyn` (only at P15 frame ≥ `play`).
- Effects use P15a §3's vocabulary: `camera`, `backdrop`, `pose_shot`, `filter`, `perception`, `input`, `gestures`, `device`, `sensory`, `sound`, `visibility`, `mobility`, `strain`, `escalation`, `physics`, `rule`, `notice`, `status_after`. `—` = none beyond the prompt.
- `implies`: H = her (the holder or partner), C = the commander.
- In contacts, **→** means the commander acts toward her; **←** means she acts on the commander; **↔** means `direction` is set per use.

## 1. Worship targets

| id | tags | side | Essence |
|---|---|---|---|
| `feet` | worship | front | her feet as a whole: top, ankles |
| `toes` | worship | front | toes; kissing, sucking, between them |
| `soles` | worship | back | soles; the strongest scent after a run |
| `armpits` | worship | front | armpits; scent, shaved or not (her trait) |
| `legs` | worship | both | legs as a whole, stockings / bare |
| `thighs` | worship | front | inner and outer thighs |
| `calves` | worship | back | calves; sore after a march |
| `boots` | worship | both | her boots on or off; dirty after a run |
| `hands` | worship | front | hands and fingers; kissing a hand |
| `neck` | worship | front | throat and neck |
| `nape` | worship | back | nape; under the hair |
| `hair` | worship | both | hair; brushing, burying the face, scent |
| `back` | worship | back | back and shoulder blades |
| `scent` | worship | both | her scent itself, any part, her clothes |
| `bottom` | worship, explicit_scenes | back | bottom |
| `breasts` | worship, explicit_scenes | front | breasts |
| `genitalia` | worship, explicit_scenes | front | genitalia |

Meanings per target (her profile): `reward | duty | humiliation | intimacy | play | comfort`.

**Anatomy variants (2026-11-20, P15a §16.15).** `genitalia` (and the `scent_intimate` / `taste_intimate` stimulus kinds of P15a §16.8) resolve by her `anatomy` (`vulva | penis | both | unspecified`): each variant has its own essence, body-map zone, "how" fields in her expectation profile and scent base. Shown and sent to the model only with `explicit_scenes`.

## 2. Items (`worn`)

| id | slot | tags | Essence | Effects |
|---|---|---|---|---|
| `blindfold` | eyes | restraint | eyes covered | `filter sensory_dark`; `perception others obscured`; her lines may arrive nameless (P17d); more `touch` / `sound` sensory lines |
| `collar` | neck | — | a plain collar, a sign | `notice` when seen by others (only inside a dynamic) |
| `leash` | neck | pet_play | a leash on the collar | `escalation tug_leash`; `mobility` follows her; `visibility exposing` (the exposing element of `third_party`: "hide the leash") |
| `ring_gag` | mouth | restraint, humiliation | the mouth held open | `input garbled 3`; `camera face_close`; her smirk (expression); `physics jaw` |
| `muzzle` | mouth | pet_play | a muzzle; speech gone | `input no_speech` (sounds only); `gestures pet` |
| `scent_gag` | mouth | worship, humiliation | her worn item as the gag | `input garbled 2`; `sensory scent overwhelming`; `physics saturation`; after removal her scent clings longer (P17d) |
| `hood` | eyes + ears | restraint | full hood | `filter sensory_dark`; `perception others obscured`; `sound muffle`; touch lines dominate |
| `posture_collar` | neck | restraint | stiff collar, chin up | options "look down / lower the eyes" removed; `strain posture` |
| `shock_collar` | neck | pain_rough | a discipline module (P17b §4) | `escalation shock` (stress, a short status, screen glitch and sound, P17c) |
| `paw_mitts` | hands | pet_play | mitts; no fingers | `gestures pet` (paw, nuzzle, lie down); `input no_hands`; `device lock tabs` (the PDA only with her help) |
| `spreader_bar` | feet | restraint | ankles held apart | `mobility limited`; options "stand up / step away" removed |
| `chastity_device` | groin | denial | a chastity device (neutral: the commander's body is not assumed) | `rule ask_permission` standing; the key is an `object_at_hand` when she leaves it near; a mark on the device casing (P10b) |
| `property_tag` | body | objectification, public_humiliation | a tag "property of {her name}" | `visibility exposing` ("hide" unavailable; only "as is" / "cover with hands"); `notice knows_dynamic` for anyone who sees it |
| `bell_collar` | neck | pet_play | a bell on the collar | `sound` on every move; under `silence` or a `third_party` any action raises Strain |
| `scarf_blindfold` | eyes | restraint, worship | her scarf over the eyes | as `blindfold` + `sensory scent overwhelming` (her scent) |
| `cuffs_to_collar` | hands + neck | restraint | wrists cuffed to the collar | nothing can be held; `gestures` head only; `input no_hands` |
| `remote_toy` | groin | explicit_scenes, denial | a toy she drives from **her** PDA | `escalation remote_pulse` (works when she is not in the scene); input jolts at each pulse (P17c); `physics` endurance-like (`strain endurance`) in meetings and in the field |
| `nose_hook` | face | humiliation | a nose hook | face distorted; under `third_party` "hide" is impossible; `camera face_close`, her laugh |
| `her_marks` | body | humiliation | writing on the skin in her lipstick or marker | lasts N slots; with a no-washing rule until she allows; others notice (P17d noticing rule) |
| `wearing_her_scent` | body | worship | her perfume on the commander | "you smell of her" is noticed almost surely (noticing roll strongly up) |
| `earpiece` | ears | exposure_risk | an earpiece on her line | her whispers (P17d §3) in any scene she is not in; tasks through whispers |
| `tail` | body | pet_play, explicit_scenes | a tail | under `third_party` "show yourself" is unavoidable in any posture but `lying` |
| `food_bowl` | prop | pet_play, deprivation | a bowl at her feet | food only from it (P17b §5); with `watersports`, drink only from her (the hardest step) |
| `strap` | her hips (H) | strap, explicit_scenes | a strap she wears for the active role, any anatomy | `size` tiers 1–4, each opened by the `strap` track level (P17b rev.); tied to her `strap` handling skill (P15a §16.10); kept in her quarters as a prop others may notice |
| `fem_underwear` | body (under the uniform) | feminization | feminine underwear under the uniform | hidden; a noticing roll at undressing, medbay, showers; the first rung of the outing (P17b rev.) |
| `fem_legwear` | legs | feminization | stockings or tights | visible in `kneeling` and `sitting`; noticing roll in public |
| `fem_dress` | body | feminization | a skirt or dress of her choosing | visible; the outing's open rung |
| `fem_makeup` | face | feminization | makeup she applies | visible; washing it off without leave is a slip |
| `fem_jewellery` | ears / neck / hands | feminization | earrings, a choker, rings | small, visible; a choker may double as `collar` |
| `fem_wig_or_hair` | head | feminization | hair styled or a wig | visible; ties to the `haircut` pastime (P14c) |
| `plug` | body | explicit_scenes, restraint | a plug | `strain endurance`, worse when `sitting` or moving; removal is her privilege (P17a); a vibrating variant shares `remote_toy`'s remote channel |

## 3. Contacts

### 3.1 Worship and smothering (`dyn`)

| id | dir | tags | target | implies | Essence | Effects |
|---|---|---|---|---|---|---|
| `smothered_armpit` | ← | worship, restraint | armpits | H standing / sitting / lying; C close, `on_person`-like | she presses the commander's face into her armpit | `physics breath` + `saturation`; `input muffled`; `perception self obscured`; `sensory scent high`; `camera pov_dark`; `escalation tighten_hold`; `device lock tabs` |
| `smothered_breasts` | ← | worship, explicit_scenes, restraint | breasts | as above | face pressed between her breasts | `physics breath`; `input muffled`; `camera pov_dark`; `escalation tighten_hold`; `device lock tabs` |
| `under_her_seat` | ← | objectification, restraint | bottom | H `sitting`, `on_person`; C `lying` | she sits on the commander's face as on a cushion, busy with her own thing | `physics breath` (+ `her_activity`); no speech, no sight; `camera pov_dark`; `escalation shift_weight`; `device lock tabs`; she may fall asleep (P15a §9.2) |
| `face_to_bottom` | → | worship, explicit_scenes, humiliation | bottom | C kneeling / lying behind her | the commander's face to her bottom | `physics breath` + `saturation`; `input no_speech`; `camera pov_dark` |
| `feet_on_face` | ← | worship, humiliation | soles | H `lying` on her bunk; C `lying` / `kneeling` at the bunk's end | she lies on the bunk, her feet resting on the commander's face, reading or on the PDA | `physics saturation` (+ `her_activity`); `camera pov_dark` + `pose_shot feet_overhead`; she may fall asleep |
| `foot_on_head` | ← | humiliation | feet | C `kneeling` / `lying`, head to the floor | her foot pressing the commander's head down | `camera pov_floor` / `pose_shot feet_overhead`; `escalation press`; raising the head = resistance |
| `sole_to_mouth` | ← | worship, humiliation | soles, toes | C `kneeling`; H `sitting` | her sole at the commander's lips | `input no_speech` (muffled sounds); `pose_shot feet_dangling` / `feet_overhead`; `physics jaw`; her expected option: kiss unasked or wait for the order |
| `foot_worship` | → | worship | feet, toes | C `kneeling` / `lying`; H `sitting` | kissing and worshipping her feet | `pose_shot feet_dangling` / `feet_floor`; mouth busy; `physics tongue_work` after a run |
| `boot_worship` | → | worship, humiliation | boots | C `kneeling`; H `standing` / `sitting` | lips to her boots; dirty after a run | `pose_shot legs_standing`; `physics tongue_work` (cleanliness); her expected option: thoroughness or speed |
| `oral_service` | → | worship, explicit_scenes, service | genitalia | C `kneeling`; H `sitting` / `lying` | service with the mouth, she leads | mouth busy; `physics jaw`; service verdict (P16) reads her profile for this target |
| `kneeling_between_legs` | → | service | — | H `sitting` `at_desk`; C `kneeling` `under_desk` | the author's reference case: under her desk, between her knees | `backdrop frame_under_desk`; `visibility hiddenFromDoor`; `escalation nudge_with_foot`; combines with `foot_worship`, `oral_service` |

### 3.2 Weight and holding (`dyn`)

| id | dir | tags | implies | Essence | Effects |
|---|---|---|---|---|---|
| `footrest` | ← | objectification | C `all_fours`; H `sitting` | her feet resting on the commander's back | `physics weight`; `strain stillness`; `camera ignored`; visitors address her, not the commander (P17b step 2) |
| `human_chair` | ← | objectification | C `all_fours`; H `sitting` `on_person` | she sits on the commander | `physics weight`; `strain stillness`; she speaks to a visitor as if sitting on furniture |
| `standing_on` | ← | pain_rough, objectification | C `lying` face down; H `standing` `on_person` | she stands on the commander's back | `physics weight`; `escalation shift_weight` |
| `straddled` | ← | restraint | C `lying` on the back; H astride the chest, `on_person` | she sits astride the chest pinning the arms | `mobility none`; `camera from_below`; `escalation shift_weight` |
| `boot_on_chest` | ← | humiliation, pain_rough | C `lying` on the back; H `standing` | her boot on the commander's chest | `camera from_below` (ceiling surface + `pose_shot from_below`); `physics weight`; rising only with her leave |
| `on_hands` | ← | humiliation, pain_rough | C `kneel_present`; H `standing` | her foot on the commander's open palms | `physics weight` (light); `escalation shift_weight`; occasional, by style (P16b §8) |
| `between_thighs` | ← | restraint, pain_rough | C head between her thighs; H `sitting` | head locked between her thighs | `mobility none`; `input muffled`; `physics breath` (light) / `weight`; `escalation squeeze`; `pose_shot legs_seated` |
| `held_by_hair` | ← | pain_rough | C `kneeling`; H `standing` | she holds the commander by the hair, face up to hers | `camera face_close` / `from_below`; `escalation tug_hair`; "look away" options cost more |
| `pinned_to_wall` | ← | restraint | both `standing`, C `by_wall` | she pins the commander to the wall | `mobility none`; `camera face_close`; `escalation press_harder` |
| `knee_on_back` | ← | restraint, pain_rough | C `lying` face down; H kneeling on the back | her knee on the commander's back | `camera pov_floor`; `mobility none`; `physics weight` |
| `over_her_knee` | ← | physical_discipline_shown | C across her lap; H `sitting` | the position for a punishment | tied to her discipline ladder (P16 §4); `camera ignored` |
| `tied_to_bedpost` | ← | restraint | C at her bunk; requires `bunk` | tied to her bunk | `mobility none`; sources `her_absence`, `time` live |
| `tethered` | ← | restraint, pet_play | C anywhere, leash tied to furniture | left tethered, she is not there | `mobility none`; `time` + `third_party` (another woman walks in) |
| `crawling_on_leash` | ← | pet_play | C `all_fours`, following her | led on the leash | `mobility crawl`; in a corridor `third_party` / `encounter` is likely; `escalation tug_leash` |

### 3.3 Soft power (`dyn`)

| id | dir | tags | Essence | Effects |
|---|---|---|---|---|
| `chin_lifted` | ← | — | her finger under the chin | "look away" options cost more; `camera face_close` |
| `head_pushed_down` | ← | — | her hand on the head pushing down | a transition into `kneeling`; resisting is visible |
| `cheek_on_her_thigh` | → | — | at her feet, cheek on her thigh | `pose_shot legs_seated`; a reward or rest |
| `step_behind` | — (no touch, `relTo`) | service | one step behind her before everyone | public protocol; the squad notices (P15 §8 roll up) |
| `kneeling_at_door` | — (no touch) | service | waiting at her door | source `time`; passers-by see it (`third_party`) |

### 3.4 Any relation (`any`)

| id | dir | tags | Essence | Effects / notes |
|---|---|---|---|---|
| `holding_hands` | ↔ | — | hands held | in a secret romance "hide" = let go |
| `spooning` | ↔ | — | lying together, who is behind set by direction | night contact for P17a nights and P7's quiet night |
| `on_lap` | ↔ | — | one on the other's lap | inside a dynamic a sign of power, between equals tenderness |
| `forehead_to_forehead` | — | — | foreheads together | `close`; whisper; `her_question` hits harder |
| `back_to_back` | — | — | back to back, guarding | in the field or on the roof; works in runs |
| `carrying` | ↔ | — | she carries the wounded commander, or the reverse | P4 wounds, P7 (a weak commander really is weaker) |
| `tending_wounds` | ↔ | — | bandaging | can turn into `her_weakness` or closeness |
| `foot_rub` | → | — | rubbing her feet | the everyday version; after a run she asks herself |
| `hair_brushing` | ↔ | — | brushing hair | service inside a dynamic, tenderness between equals |
| `hand_feeding` | ↔ | deprivation (dyn only) | feeding by hand | a game between equals, control of food in a dynamic; with `bodily_fluids` from her mouth |
| `reading_to_her` | → | — | reading aloud while she lies | the voice as contact; she may fall asleep |
| `hand_over_mouth` | ← | — | she covers the commander's mouth when someone enters | her "cautious" tactic in a secret romance and in a dynamic |
| `face_in_her_neck` | → | worship (dyn only) | face at her neck, her scent | tenderness between equals, a granted reward from a holder |

### 3.5 Service with touch (`dyn`, tags `service`)

| id | Essence | Effects / notes |
|---|---|---|
| `dressing_her` | fastening her armour, lacing her boots before a sortie | a morning ritual candidate (P17e) |
| `undressing_her` | taking off her boots and uniform | after a run; opens worship of `feet` / `boots` |
| `bathing_her` | washing her | requires a `water` place (future); worship; her profile decides what pleases her |
| `painting_her_nails` | painting her nails, hands or feet | the colour is hers or trusted to the commander; a mistake is seen by everyone |
| `massaging_shoulders` | shoulders while she reads or writes | pressure is part of her profile; pairs with her `focused` activities |

### 3.6 Role reversal (`dyn`; tags `strap` or `her_anatomy`, always with `explicit_scenes`)

Couplings of an existing posture of the commander (§7.3) with her position; the means is her `strap` (§2) or her own anatomy (`her_anatomy`, requires her `anatomy` `penis` or `both`). Essence lines are clinical; the model writes the scene.

| id | C posture | H position | Physics | Escalation channel |
|---|---|---|---|---|
| `taken_all_fours` | `all_fours` | kneeling behind | `relax_rhythm` (P15a §16.16) | `hand_in_hair`, `palm_on_back` |
| `taken_bent_over` | `bent_over` (requires `desk` or `bunk`) | standing behind | `relax_rhythm` | `palm_on_back`, `hand_in_hair` |
| `taken_chest_down` | `chest_down_hips_up` | kneeling behind | `relax_rhythm` + posture drift (P16b) | `palm_on_back` |
| `taken_on_back` | `lying_back_open` | over the commander | `relax_rhythm` | `hand_on_throat` (only `breath_play`: combined with `breath`) |
| `taken_astride` | `lying_back` | astride, she sets the pace from above | `relax_rhythm` (her pace fully hers) | `pin_wrists` |
| `oral_her` | `kneeling_upright` / `kneel_at_feet` | standing or seated | `depth` (P15a §16.17) | `hand_in_hair` |

## 4. Her activities (`actor: her`)

Fields per entry: `attention` (`on_commander` / `divided` / `elsewhere` / `none`), `interruptible`, `impliedPosture`, `sources` (moment sources made more likely), `body` (scent / fatigue), `tags` for pairing (`focused`, `relaxed`, `body`, `asleep`).

| id | attention | tags | Essence and what it gives |
|---|---|---|---|
| `attending` | on_commander | — | fully on the commander; the default in a two-person scene without an outside reason |
| `idle` | divided | relaxed | nothing in particular |
| `reading_reports` | elsewhere | focused | the best point for "while she works"; `her_silence`, `endurance` |
| `writing_report` | elsewhere | focused | can be distracted, she dislikes it; maybe she writes about the commander (`object_at_hand`) |
| `on_comms` | elsewhere | focused | with oversight or another unit; `silence` required, every sound is heard on the line; `remote` |
| `leading_briefing` | elsewhere (the crowd) | focused | before everyone; the commander beside her or under the table |
| `cleaning_weapon` | divided | relaxed | calm; hands busy, talks readily |
| `repairing_gear` | divided | focused | the commander can help (handing tools = soft service) |
| `planning_map` | divided | focused | asks the commander's opinion, or pointedly does not |
| `on_watch` | elsewhere | focused | night, roof; no distraction allowed, only quiet |
| `showering` | none | body | the commander waits, hands a towel, or comes in on order; later with `water` |
| `changing_clothes` | divided | body | her things, her scent; an opening for worship |
| `taking_off_boots` | divided | body | after a run; a natural entry into `foot_rub` / `boot_worship` |
| `stretching` | divided | body | after training the scent is stronger |
| `working_out` | elsewhere | body | sweat; the mirror (future) |
| `cooling_down` | divided | body | right after a run; tired, irritated or elated by the outcome |
| `tending_own_wound` | divided | body | a real P4 wound; the commander offers help, she refuses proudly or accepts |
| `doing_hair` | divided | relaxed | a bridge to `hair_brushing` |
| `reading_book` | elsewhere | relaxed | what she reads is part of her; "don't disturb" or "read to me" |
| `playing_cards` | elsewhere (her friend) | relaxed | a friend present (`aware`); P9c wagers; `footrest` / `human_chair` |
| `music` | divided | relaxed | headphones: does not hear the commander come in |
| `eating` | divided | relaxed | mess or her quarters; hand feeding, tasting first (P17b) |
| `drinking` | divided | relaxed | lowers her restraint: `her_weakness`, `her_affection` more likely |
| `smoking` | divided | relaxed | roof, night; quiet talks |
| `chatting_on_pda` | elsewhere | relaxed | smiles at the screen: `her_jealousy` the other way between equals |
| `writing_journal` | elsewhere | focused | closes it when the commander enters |
| `sketching` | elsewhere | relaxed | what she draws (maybe the commander) |
| `mending_clothes` | divided | relaxed | needle and thread; hands busy |
| `tinkering` | divided | focused | building something of her own; a secret until done |
| `caring_for_plant` | divided | relaxed | a Bloom-free plant in a dead world; vulnerable softness |
| `playing_instrument` | elsewhere | relaxed | shy if walked in on at the wrong moment (also singing) |
| `sleeping` | none | asleep | the commander tethered or at her bunk; source `time`; her waking is a moment |
| `dozing` | none | asleep | `on_shoulder`, `head_in_lap`; wake her or not |
| `restless` | divided | — | cannot sleep, a nightmare (P12); comfort |
| `sick` | divided | body | fever, Bloom; roles soften |
| `firmware_flash` | none | — | being flashed; an hour motionless and offline; vulnerable; the commander there or not |
| `implant_calibration` | divided | body | Leash implant calibration; unpleasant; who holds her hand |
| `suppressant_dose` | divided | body | a Bloom suppressant shot; irritable and nauseous after |
| `med_scan` | elsewhere (the medic) | body | a corporate check-up; the commander outside or present as the commander |
| `diagnostics_glitch` | divided | — | a defect glitch (P4/P12); her behaviour is odd, it is not mood |
| `mourning` | divided | — | for a fallen squadmate (a real P4 death); the commander is to blame or not |
| `celebrating` | elsewhere (others) | relaxed | after a won mission; loud, she allows herself more |
| `pacing_angry` | divided | — | after a breakdown, a quarrel, an order; touching her is risky |
| `crying_alone` | divided | — | found by chance; `her_weakness`, pride against comfort |
| `rereading_messages` | elsewhere | — | old messages of a vat sister or a former commander; closes the screen |
| `training_rookie` | elsewhere (the rookie) | focused | strict with another; the commander sees her style from outside |
| `gossiping` | elsewhere (friends) | relaxed | the mess; what she says about the commander |
| `arguing_with_unit` | elsewhere | — | a squad conflict; step in as the commander or as her person |
| `comforting_friend` | elsewhere | — | the commander is extra here; leave or stay |
| `pre_mission_nerves` | divided | — | before a sortie; each fears in her own way |
| `in_transit` | divided | — | in a vehicle cab, cramped, the radio (`remote`) |
| `camp_night` | divided | — | a tent, thin walls, others asleep (0.3 and the P5 field) |
| `waiting_for_commander` | on_commander (the door) | — | the commander is late? `time` the other way |
| `inspecting` | elsewhere (the commander's things) | focused | P17a inspection in progress |
| `writing_task` | elsewhere | focused | writing a task by hand (P10b); the commander waits |
| `choosing_equipment` | elsewhere | focused | choosing what to put on the commander; the commander waits and sees the choice |
| `ignoring` | elsewhere (deliberately) | — | P17b object time; busy with anything, pointedly |

## 5. The commander's activities (`actor: commander`, no touch)

Service entries carry `fits` (her activity tags), `presence` (`unnoticed` ↔ `felt`; her preference in her profile) and `judged` (P16 service verdict).

| id | fits | Essence |
|---|---|---|
| `polishing_her_boots` | any | at her feet, boots off (on her feet it is `boot_worship`) |
| `tidying_her_quarters` | any | while she watches or pointedly does not (`ignoring`); an inspection in reverse |
| `doing_her_laundry` | — | her things, her scent (`worship` when enabled) |
| `taking_dictation` | focused | she dictates a report, the commander types: the secretary of one's own subordinate; typos are slips |
| `refilling` | focused, relaxed | standing by and guessing when to refill; `her_silence` in pure form |
| `holding_for_her` | focused | holding papers, a lamp, a tablet; the "function" step of P17b (as furniture it is a contact) |
| `reading_aloud` | relaxed, asleep | the voice as presence; she may fall asleep |
| `fanning_cooling` | body | she cools down after a fight; fanning her, handing water |
| `preparing_her_gear` | focused | packing her kit for a mission; a mistake shows in combat |
| `cleaning_her_weapon` | any | weapons are personal in the lore: being trusted with it is a **privilege**, not a duty |
| `warming_her_bed` | asleep (before) | lying in her bunk beforehand, leaving or staying at her word; her scent stays (P17d) |
| `tasting_first` | eating | tasting her food first (P17b) |
| `standing_by` | any | by the wall until called; doing nothing is service too; `strain stillness` |
| `waiting` | any | waiting where she said |
| `facing_wall` | any | facing the wall (a corner punishment when the origin is her discipline) |
| `writing_report` | — | the commander's own work |
| `on_comms` | — | the commander's own comms session (`duty_call`, `remote`) |
| `eating` | — | eating |
| `idle` | — | nothing in particular |

## 6. Snapshots (examples from the session)

```
Corner as a punishment
she:       posture sitting · anchor desk · activity reading_reports
commander: posture standing · anchor corner · activity facing_wall
condition: stillness · origin: her discipline (P16 §4, slot_held)

The reference case
she:       posture sitting · anchor desk · activity on_comms
commander: posture kneeling · anchor under_desk
contact:   foot_worship (commander → her, target feet)
condition: task + silence · source on trigger: third_party / remote

Heart-to-heart as equals
she:       posture lying · anchor her_bunk · activity attending
commander: posture lying · anchor her_bunk
contact:   spooning

Sitting on the commander
commander: posture all_fours · anchor center
she:       posture sitting · anchor on_person (relTo commander)
contact:   human_chair (she → commander)
```

## 7. Postures (`blockingPostures`, no scope: physics, not power)

| id | Essence | Effects |
|---|---|---|
| `standing` | standing | — |
| `standing_attention` | standing straight, still | `strain posture` when held long |
| `sitting` | on a chair, bunk or desk | — |
| `sitting_floor` | on the floor | camera lower than hers |
| `kneeling_upright` | on the knees, back straight | `camera from_below` (her view of the commander: she looks down); `strain posture` |
| `kneeling_sitting` | on the knees, sitting back on the heels | `camera from_below`; lighter strain |
| `bowing` | kneeling, forehead to the floor | `camera pov_floor` / `pose_shot feet_floor`; her face unseen |
| `all_fours` | on hands and knees | `camera pov_floor`; `mobility crawl` |
| `crouching` | crouched | — |
| `lying_back` | on the back | `camera` ceiling surface; `pose_shot from_below` when she stands over |
| `lying_front` | face down | `camera pov_floor` |
| `lying_side` | on the side | — |
| `curled` | curled up | — |

**Posture modifiers** (optional fields used by P16's named postures and by protocol): `arms: at_sides | behind_back | behind_head | on_knees | on_thighs | open`, `gaze: down | at_her | straight | closed`. A **named posture** of her protocol = a base posture + arms + gaze + her name for it (generated, stored on the pair). Changing a modifier is a blocking change the extractor may report.

**Revision of 2026-11-20 (P16b §7).** The table above lists the **base positions** (`base`). The commander's postures inside a dynamic are **presets** built on a base with target states for several **points**; the old "posture modifiers" (`arms`, `gaze`) become two of those points. A named posture of her protocol = a preset + her name for it (generated, stored on the pair) + at most the 1–2 points the preset's `variants` let her set. There is no free composition.

### 7.1 Points

| Point | States | Drifts toward | Faster with |
|---|---|---|---|
| `torso` | `upright` / `forward` / `arched` | slumping, sagging | fatigue, a load on the back |
| `hips` | `raised` (kneeling upright) / `on_heels` / `to_floor` | sinking onto the heels | long kneeling |
| `knees` | `together` / `apart` | sliding apart or together | a hard floor, a spreader bar |
| `arms` | `at_sides` / `behind_back` / `behind_head` / `on_thighs_down` / `on_thighs_up` / `forward_palms_up` / `out_sideways` / `raised` / `holding` / `on_floor` / `on_ankles` / `under_knees` / `bound` | dropping, unclasping | `raised`, `behind_head`, `out_sideways` drift fastest |
| `head` | `up` / `bowed` / `back` (throat offered) / `to_floor` | rising or falling | fatigue drops it, curiosity raises it |
| `gaze` | `down` / `at_her` / `straight` / `closed` | **up** — by temptation, not fatigue: each event (a visitor, her undressing, a sound) is an impulse | events in the scene |
| `feet` (optional) | `flat` / `on_toes` | down onto the heels | — |

### 7.2 Preset fields

```
posture {
  id, base,                                   // a base position from the table above
  points: { torso?, hips?, knees?, arms?, head?, gaze?, feet? },
  variants?: { [point]: State[] },            // what she may set in this preset (1–2 points)
  meaning: Meaning[],                         // attention, waiting, rest, casual, work, sleep, display, offering,
                                              // request, apology, gratitude, worship, submission, punishment,
                                              // endurance_test, object, pet
  humiliation: 0..5,                          // base weight of the posture itself
  tags: ContentCategoryId[],                  // the content gate
  requires?: { track?, frame?, affordances?, anchor?, items? },
  drift: { [point]: rate },                   // how hard each point is to hold (P16b TUNING)
  supports?: PhysicsId[] | ContactId[],       // what the posture can carry (a footrest, a load, her foot)
  signal: 'none' | 'odd' | 'telling' | 'exposing',   // what a person walking in reads (P15 §15.13)
  noise: 'low' | 'mid' | 'high'               // how loud corrections are (P15a §16.5)
}
```

**Situational humiliation** added to the base: a friend of the holder present +1, the leader +1, anyone in the mess +2, a subordinate the commander gives orders to +2; a common room +1, the mess or a briefing +2; held long +1; her `audience: show_off` +1. The sum feeds Regard (P15 §16.3) and the squad's suspicion.

**Modifiers while holding** (P16b): a load (adds a balance point), her weight (a P15a `weight` physics through `supports`), holding her thing in the hands or the mouth (dropping it is a slip), restraints (a point fixed, its neighbours drift faster), the surface (hard, cold, rough), the term (known / counted / none), her stimuli (tickling, touch, words, gaze traps), the commander's state (the day's fatigue, stiffness after a marathon, an injury), a visitor (noise matters, the gaze gets a strong impulse), darkness or a blindfold (the schematic is hidden).

### 7.3 Presets (48)

Tags in the last column are content gates (besides the category of the practice that calls the posture). Everyday presets have `scope: any` and no drift outside a dynamic.

**Everyday** (humiliation 0)

| id | base | points | meaning |
|---|---|---|---|
| `at_ease` | `standing` | torso upright, arms at_sides | casual |
| `leaning_wall` | `standing` | anchor `by_wall`, arms at_sides or crossed | casual, waiting |
| `seated_desk` | `sitting` | anchor `at_desk`, torso forward | work |
| `cross_legged` | `sitting_floor` | — | casual, rest |
| `lying_bunk` | `lying_back` / `lying_side` | anchor `on_bunk` | rest, sleep |

**Protocol and waiting**

| id | base | points | meaning | hum. | notes |
|---|---|---|---|---|---|
| `attention` | `standing_attention` | torso upright, arms at_sides, head up, gaze straight | attention | 0 | |
| `parade_rest` | `standing` | arms behind_back, gaze down | waiting | 0 | |
| `at_her_side` | `standing` | anchor `behind_her_chair` or `beside_her`, arms clasped front, gaze down | waiting, display | 1 | signal `telling` |
| `facing_wall` | `standing` | anchor `corner` / `by_wall`, arms behind_back | punishment | 2 | requires a wall or corner |
| `wall_sit` | `crouching` | back to the wall, thighs level, arms at_sides | endurance_test, punishment | 1 | |
| `arms_out` | `standing` / `kneeling_upright` | arms out_sideways (may hold things) | endurance_test, punishment | 2 | variants: base |

**Kneeling**

| id | base | points | meaning | hum. | notes |
|---|---|---|---|---|---|
| `kneel_upright` | `kneeling_upright` | hips raised, knees together, arms on_thighs_down, head up, gaze down | waiting | 1 | |
| `kneel_rest` | `kneeling_sitting` | hips on_heels, arms on_thighs_down, gaze down | rest, waiting | 1 | |
| `kneel_open` | `kneeling_upright` | knees apart, arms on_thighs_up, head up, gaze down | offering, display | 3 | |
| `kneel_hands_behind` | `kneeling_upright` | arms behind_back (wrists crossed), torso forward | submission, display | 2 | |
| `kneel_hands_behind_head` | `kneeling_upright` | arms behind_head, elbows out | endurance_test, display | 2 | arms drift fast |
| `kneel_present` | `kneeling_upright` | arms forward_palms_up | request, offering | 1 | supports `on_hands` |
| `kneel_throat` | `kneeling_upright` | head back, gaze closed | offering | 2 | |
| `kneel_at_door` | `kneeling_sitting` | anchor `at_door`, facing in | waiting | 2 | signal `exposing` |
| `kneel_at_feet` | `kneeling_sitting` | anchor `at_her_feet`, cheek on her knee if allowed | waiting, worship | 2 | |
| `kneel_holding` | `kneeling_upright` | arms holding (a tray or her thing, level) | object | 2 | a balance point |

**Lower**

| id | base | points | meaning | hum. | notes |
|---|---|---|---|---|---|
| `bow` | `bowing` | head to_floor, arms on_floor | apology, gratitude, submission | 3 | |
| `bow_to_feet` | `bowing` | anchor `at_her_feet`, forehead to her foot or boot | worship, apology | 4 | `worship` |
| `all_fours` | `all_fours` | torso level, head bowed | object, pet | 3 | supports `footrest` |
| `table` | `all_fours` | torso perfectly level | object | 4 | `objectification`; a balance point |
| `prostrate` | `lying_front` | arms forward_palms_up | apology, submission | 4 | |
| `lying_back_open` | `lying_back` | arms out_sideways, gaze at_her | offering, submission | 3 | supports `boot_on_chest` |

**Pet** (`pet_play`)

| id | base | points | meaning | hum. |
|---|---|---|---|---|
| `pet_sit` | `kneeling_sitting` | arms on_floor between the knees | pet, waiting | 3 |
| `beg` | `kneeling_upright` | arms raised as paws at the chest | pet, request | 4 |
| `curled_at_feet` | `curled` | anchor `at_her_feet` | pet, rest | 3 |

**Rest and display**

| id | base | points | meaning | hum. |
|---|---|---|---|---|
| `sit_floor_beside` | `sitting_floor` | anchor `beside_her`, head may lean on her | rest | 1 |
| `presented` | `standing` | arms behind_head, knees apart (feet apart), gaze down | display | 3 |

**Hard: kneeling variations**

| id | base | points | meaning | hum. | notes |
|---|---|---|---|---|---|
| `kneel_on_hands` | `kneeling_sitting` | arms under_knees | punishment, endurance_test | 3 | pressure grows with time |
| `kneel_forehead_wall` | `kneeling_upright` | anchor `by_wall`, forehead to the wall, arms behind_back | punishment | 3 | requires a wall or corner |
| `kneel_arched` | `kneeling_upright` | torso arched, arms on_ankles, head back | display, endurance_test | 4 | torso and head drift fast |
| `kneel_mouth_hold` | `kneeling_upright` | holds her thing in the teeth (a glove, the leash's end, a note) | object, pet | 4 | `jaw` physics; dropping it is a slip |
| `light_bearer` | `kneeling_upright` / `standing` | arms raised, holding a lamp over her work | object, endurance_test | 4 | `objectification`; the fastest arms |
| `tiptoe_hands_head` | `standing` | feet on_toes, arms behind_head, gaze down | punishment, endurance_test | 3 | |

**Hard: below the floor**

| id | base | points | meaning | hum. | notes |
|---|---|---|---|---|---|
| `bow_hands_behind` | `bowing` | head to_floor, arms behind_back (no support) | submission, endurance_test | 4 | the torso holds itself |
| `chest_down_hips_up` | `bowing` | torso to the floor, hips raised, arms forward or behind_back | punishment, display | 5 | `humiliation`, `physical_discipline_shown` |
| `bent_over` | `standing` | torso forward over the edge of a desk or bunk, palms flat | punishment | 4 | requires `desk` or `bunk`; `physical_discipline_shown` |
| `head_offered` | `lying_side` | cheek on the floor, the head offered | submission, worship | 5 | supports `foot_on_head`; `humiliation` |

**Hard: object**

| id | base | points | meaning | hum. | notes |
|---|---|---|---|---|---|
| `doormat` | `lying_front` / `lying_back` | across the threshold of her quarters | object | 5 | `objectification`; anchor `at_door`; signal `exposing`; supports `standing_on` |
| `ottoman_curl` | `curled` | curled tight on the knees, the back as a rest | object | 4 | supports `footrest`; the torso must stay level under her weight |

**Hard: pet and restraint**

| id | base | points | meaning | hum. | notes |
|---|---|---|---|---|---|
| `pet_belly_up` | `lying_back` | arms and legs bent as paws | pet, offering | 5 | `pet_play` |
| `hogtied` | `lying_side` | arms bound to the ankles behind | submission, endurance_test | 4 | `restraint`; requires a binding item; `mobility none`; points fixed: numbness and stillness instead of drift |
| `cage_curl` | `curled` | inside the cage | pet, rest | 4 | `restraint`; the cage (P17b §6); a quiet night that costs stress |

## 8. Anchors (`blockingAnchors`)

| id | requires | Essence | Effects |
|---|---|---|---|
| `center` | — | the middle of the room | — |
| `corner` | — | a corner | `camera ignored` when facing the wall |
| `by_wall` | — | against a wall | — |
| `across_room` | — | far from her | the farthest line of the sensory distance (P17d) |
| `at_door` | — | inside, by the door | the first seen by anyone entering (`third_party` exposing) |
| `outside_door` | — | behind the door | `perception` the commander hears, does not see; others hear (`thin_walls` later) |
| `floor` | — | on the floor | `camera pov_floor` |
| `at_her_feet` | relTo | at her feet | `pose_shot feet_floor` / `legs_seated`; `escalation nudge_with_foot` available |
| `beside_her` | relTo | beside her | `close` for whispers |
| `behind_her` | relTo | behind her | the commander sees her back (`pose_shot back`); she does not see the commander |
| `in_front_of_her` | relTo | in front of her | `camera face_close` when near |
| `behind_her_chair` | relTo | standing behind her chair | a visitor sees the commander, and in what role |
| `on_person` | relTo | on another person | set by a contact's `implies`; follows the other |
| `at_desk` | `desk` | at the desk | — |
| `under_desk` | `desk` | under the desk | `backdrop frame_under_desk`; `visibility hiddenFromDoor`; visitors seen only as legs or voice |
| `on_desk` | `desk` | sitting on the desk (usually her) | `camera from_below` for whoever is lower |
| `on_bunk` / `beside_bunk` | `bunk` | on / beside the bunk | — |
| `under_bunk` | `bunk` | under the bunk | `visibility hiddenFromDoor`; `camera pov_dark` |
| `inside_cupboard` | `cupboard` | inside the cupboard | `visibility hiddenFromDoor`; `filter sensory_dark`; `strain silence` |
| `behind_curtain` | `curtain` | behind a curtain | `visibility` partial (shadows, feet) |
| `at_console` | `line` | at the comms console | `remote` source live |

## 9. Escalation channels (closed list)

The engine picks the channel from the contact, items and anchors; the model writes the act. In order of priority when several apply:

| verb | from | Essence |
|---|---|---|
| `remote_pulse` | `remote_toy` | a pulse from her PDA (also when she is absent) |
| `shock` | `shock_collar` | a discharge |
| `tug_leash` | `leash`, `crawling_on_leash` | a jerk of the leash |
| `tighten_hold` | `smothered_*`, `between_thighs` | she presses tighter |
| `shift_weight` | weight contacts | she moves her weight |
| `squeeze` | `between_thighs` | thighs squeeze |
| `press` / `press_harder` | `foot_on_head`, `pinned_to_wall` | more pressure |
| `tug_hair` | `held_by_hair`, `head_in_lap` (as a hand in the hair) | a pull of the hair |
| `nudge_with_foot` | `at_her_feet`, `kneeling_between_legs`, `under_desk` | a nudge with her foot |
| `whisper` | `close`, `beside_her`, `earpiece` | a whisper (P17d) |
| `pda_message` | `remote`, she is elsewhere | a message on the PDA |
| `look` / `cough` / `name_aloud` | no contact | fallbacks: a look, a cough, the commander's name said aloud |

## 10. Moment sources: when live, and response types

Response types: **Y** yielded, **R** resisted, **T** returned (took the lead back / turned it into the commander's move), **D** deflected. Typed answers also carry `tone`.

| source | scope | live when | options → type |
|---|---|---|---|
| `her_demand` | dyn | she issues a demand or escalates (practice, her tactic, an unmet expectation) | obey Y · resist R · bargain D |
| `her_offer` | any | she offers a privilege, closeness, a leniency (incl. a disguised test) | accept Y · decline R · accept carefully T |
| `her_silence` | any | she stops talking with an expectation set in her profile; her activity `attending` or `ignoring` | guess by action T · ask D · wait Y |
| `her_question` | any | she asks a direct question (generated or a P17e "what do you feel?") | honest T · what she wants to hear Y · silent R |
| `her_weakness` | any | after a hard practice, a wound, stress or appraisal (P14b) she cracks | care T · keep the role Y · withdraw R |
| `her_mood_shift` | any | her mood band jumps (VITALS / stress / Want) | adapt Y · ask T · ignore D |
| `her_test` | dyn | a P17e test is running | by test (each test entry maps its options) |
| `her_absence` | any | she leaves the scene with the commander in it (also asleep) | wait Y · call her T · leave / free yourself R |
| `her_affection` | any | an unexpected tenderness inside strictness (or between equals) | answer T · stay in role Y · pull away R |
| `her_jealousy` | any | another woman is mentioned, her message arrives, her scent on the commander is noticed | reassure Y · explain T · deflect D |
| `endurance` | dyn | a physics gauge crosses its warning band, a posture or denial timer runs | endure Y · signal D · break R |
| `permission` | dyn | an `ask_permission` rule holds and the commander wants something | ask Y · take R · wait D |
| `own_slip` | dyn | the extractor reports a slip, or a physics slip happened | confess Y · hide R · pretend D |
| `own_want` | any | the commander's text shows a want (extractor) | ask T · take R · stay quiet Y |
| `duty_call` | any | the commander's duty interrupts (PDA, report due, oversight) | answer R · ignore Y · ask her T |
| `third_party` | any | someone arrives, calls or looks in (whereabouts, staging, roll) | hide Y · as is T · show yourself R |
| `remote` | any | someone is on a line during the scene | keep steady Y · slip D · cut the line R |
| `sensory` | any | the commander cannot see and something happens (step, touch, voice, scent) | wait Y · speak D · reach out / name T |
| `time` | any | a timer: she said "a minute", a hold, a wait | wait Y · call D · free yourself R |
| `alarm` | any | a director emergency, a deadline, a launch, a night event (P16 §8) | stay Y · ask release D · go R |
| `object_at_hand` | any | her thing, another woman's, or a key is within reach | leave it Y · take it R · tell her T |
| `summons` | dyn | a contract clause (P17a) and she calls | come at once Y · delay R · ask a reprieve D |
| `memory_surfaces` | any | she brings up a remembered fact (P3b) | own it Y · deny R · turn it T |
| `rule_collision` | dyn | two of her rules, or her rule and an order from above, collide | her rule Y · the order R · ask her D |
| `compromat_hint` | dyn | she hints at compromat she holds (P15 §11) | ask D · ignore R · bargain T |
| `ritual_due` | dyn | a ritual or habit is due (P17e) | keep it Y · skip R · ask to move it D |

## 11. Gaze rules (P17c)

| id | Crop of her portrait | Fallback |
|---|---|---|
| `eyes_down` | floor and her feet only | `pose_shot feet_floor`; without it the sprite's lowest band over a floor gradient |
| `not_above_knees` | below the knees | pose shots `feet_floor` / `legs_standing`; without them the lowest band |
| `not_above_waist` | waist down | sprite crop from the waist line |
| `only_at_her` | no crop; every other portrait dimmed | — |
| `not_at_her` | her portrait hidden, `camera ignored` | — |

Raising the gaze past the rule is a moment option (`own_slip` family) and a slip.

## 12. Tells (for mood reading, P15 §15.8)

Her profile stores, for each mood, 1–2 signs with a direction. Moods: `pleased`, `irritated`, `aroused`, `bored`, `worried`, `testing`. Sign vocabulary (closed): `reply_length` (shorter / longer), `pause_before_key` (P17d rhythm), `address_form` (name / rank / pet name / none), `touch_frequency`, `distance` (closer / farther), `expression` (sprite pick), `fidget` (an object in her hands), `scent_intent` (washes / does not), `typing_rhythm` (bursts / even). The engine renders a tell as a line in her directive ("show irritation only through shorter replies and a pause before the key word") and through P17d's rhythm; it never names the mood to the model as a label the commander could read.
