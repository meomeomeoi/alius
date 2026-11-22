# P15a — Scene Blocking, Moments and Contact Physics

**Status: implemented** (plan: `docs/plans/2026-11-21-p15a-scene-blocking-moments.md`; automated tests pass, the in-SillyTavern checklist `docs/MANUAL_TEST_P15a.md` still has to be run by hand). Where this draft and the code differ, the code wins: see **Implemented as** at the end. §16.15–§16.20 were **not** built (user ruling, 2026-11-21: they go to P17b). Release 0.2 (post-release), **the first package of the dynamic** (after P14c, before P15). **Depends on:** P3 (scenes, participants, intents, the scene controller), P3b (memory rules), P7 (commander body, quiet night, non-body routes), P9c (sparring, device access, bookings), P9d (bond profile, content categories, `contentAllowed`, lead), P10 (hub, whereabouts, voices, portraits, `visualFlags`, sound), P10b (VITALS, handwriting, device marks), P14 (generation envelope), P7a. **Read:** overview; this file; P15–P17e (the packages built on it); the **Implemented as** of P3, P3b, P9c, P9d, P10 and P10b; `docs/content/lore.md` (§0); `docs/content/blocking.md` (the vocabulary).

**Analysis tool (P7a):** every new stat, chip, option and card carries `data-analyze`, has a glossary entry or registry `description`, and live values get a provider that reads through `Knowledge`. **P14:** every generation registers a site. **Lore §0:** no pronoun for the commander in any registry text, `promptHint`, directive or label (`tests/content/pronouns.test.ts`).

Origin: the 0.2 depth review (design session 2026-11-19). The flags that P16–P17d each kept for themselves (`held.sensory`, gag, cage, collar, object time, obscured perception, camera and pose shot choice) become **one model of the scene**: who is where, in what posture, touching whom, wearing what, doing what. On top of it run **moments** (points of tension with an explicit choice) and **contact physics** (gauges, her rhythm, the commander's skill). The model still writes every line of the scene; this package gives the text interactivity, continuity and control without limiting it.

**Order note.** P15a comes first but reads things P15 defines (frame, the expectation profile, the commander's position, style rules). Until P15 lands: `scope: dynamic` entries are off (no relation has a frame ≥ `play`), her expected option comes from a neutral default per source, and moments do not move position axes. P15 plugs into the hooks named in the last section; nothing here changes when it does.

## Goal

- **Continuity.** The main model forgets that the commander is gagged, tied or under the desk. A `[BLOCKING]` block every turn fixes that.
- **Interactivity.** At live points of tension the commander gets a choice whose meaning the engine owns and whose words the model writes.
- **One hub for the senses and the interface.** Camera, backdrops, pose shots, input limits, gestures, the device, sensory lines and sound read the blocking and the moment, never their own flags.
- **General, not only for holders.** The mechanism serves every close relation (P3 romance, P9d bonds, equals); the vocabulary is split by `scope` so that power-laden entries appear only inside a dynamic (P15).
- **Data, not code.** Every posture, anchor, contact, item, activity and moment source is a registry entry; a new one is a JSON row.

## 1. Content categories added

`contentCategories` gains, all off by default (descriptions `AUTHOR TO WRITE`):

| id | Covers | Notes |
|---|---|---|
| `worship` | worship of her body: feet, armpits, legs, boots, hands, neck, hair, scent (and `bottom`, `breasts`, `genitalia` with `explicit_scenes`) | targets in §1.1 |
| `breath_play` | smothering taken to the edge and past it (the blackout, §9.5) | ordinary smothering in `worship` stops at her limit or the signal |
| `bodily_fluids` | sweat, spit | uses in P17b, P17d and the physics |
| `watersports` | urine | **requires** `bodily_fluids` (the toggle is disabled until it is on); uses in P17b |

Each category is a separate toggle in WORLD PARAMETERS › CONTENT. A unit's `bond.ownLimits` and disabled categories win as everywhere (`contentAllowed`).

### 1.1 Worship targets

Registry `worshipTargets`: `{ id, tags, side: 'front' | 'back' | 'both', zone: { x, y, r } per side (body-map coordinates, §P15 body map), description }`. Draft: `feet`, `toes`, `soles`, `armpits`, `legs`, `thighs`, `calves`, `boots`, `hands`, `neck`, `nape`, `hair`, `back`, `scent`, `bottom` (+`explicit_scenes`), `breasts` (+`explicit_scenes`), `genitalia` (+`explicit_scenes`). A target with a disabled tag is absent from the profile, the prompt and the body map.

**Meaning of worship** (per woman, per target, in her expectation profile, P15): `reward | duty | humiliation | intimacy | play | comfort`. The same act is a reward to earn for one woman, a morning duty for another, a humiliation before her friends for a third, closeness for a fourth, a game for a fifth, and soothing after a fight for a sixth. Systems read the meaning: `reward` goes through P17a privileges, `duty` through protocol and habits (P17e), `humiliation` through demonstrations (P16 §5), `comfort` through her weakness moments.

## 2. The blocking

Per person present in a scene (`scene.blocking[personId]`, the commander included):

```
Blocking {
  posture:   PostureId                     // the body: standing, sitting, kneeling, lying, all_fours, crouching, …
  anchor:    { id: AnchorId, relTo?: personId }
  contact?:  { id: ContactId, with: personId, direction: 'from' | 'to' }   // who touches whom
  worn:      { [slot: WornSlot]: ItemId }  // eyes, mouth, ears, face, hands, feet, neck, body, groin
  activity:  ActivityId                    // what this person is busy with, without touching the other
  intimacy:  'none' | 'close' | 'intimate' | 'explicit'
  note?:     string                        // free text the engine never reads
}
```

**Rules (author rulings of the session):**

- **One question per field.** `posture` — how the body is; `anchor` — where in the room; `contact` — **who touches whom** (directly or through an object such as a leash), in either direction; `worn` — what is on; `activity` — what the person is busy with **without touching** the other. **If the act touches her, it is a contact; if not, an activity.**
- **Meaning is not stored.** "Punished in the corner", "protocol", "a game" come from the practice, the condition and the frame (P15–P17), never from a field. The same corner is a punishment, waiting, or "stand there until I finish".
- **A value earns its place.** A value exists only if some system reads it differently (input, visuals, visibility, Strain, prompt, physics). Anything else is free text in `note`.
- **The act itself stays free text.** `intimacy` is coarse; the engine never enumerates sexual acts. Contacts and items frame (and gate) what is happening; the model writes it.
- **Postures are physics, not power.** Kneeling to bandage her leg is kneeling. Postures have no `scope`; the power meaning comes from the frame and the moment source.
- **Her `activity` defaults to `attending`** (fully on the commander) in a two-person scene with no outside reason. A side activity (reading reports, on comms) exists only when the engine sets it: the slot activity (P2), whereabouts (P10), a practice (P16), a staging (P17). Nobody reads reports in the middle of a heart-to-heart unless the scene was set up that way.

### 2.1 Anchors

- **General** (any room, no affordance needed): `center`, `corner`, `by_wall`, `across_room`, `at_door`, `outside_door` (heard, not seen), `floor`.
- **Relative** (`relTo` a person, no affordance needed): `at_her_feet`, `beside_her`, `behind_her`, `in_front_of_her`, `behind_her_chair`, `on_person` (one person on another: the anchor follows the other wherever they are; the contact says how).
- **Furniture-bound** (require the affordance on the place; 0.2 uses only the affordances already declared in P17 §2): `desk` → `at_desk`, `under_desk`, `on_desk`; `bunk` → `on_bunk`, `under_bunk`, `beside_bunk`; `cupboard` → `inside_cupboard`; `curtain` → `behind_curtain`; `line` → `at_console`.
- More affordances and places (shower block, storage, laundry, briefing room, corridor, `thin_walls`, `loud`, `dark`, `water`, `mirror`, `cramped`, `table_under`, `straps`, `window`, `her_things`, `shared`) are **future work** (overview §10), together with the backdrop generation work.

### 2.2 Contacts imply

A contact declares what it implies for both sides so the fields never contradict each other:

```json
"implies": {
  "holder":  { "posture": "sitting", "anchor": "on_person" },
  "subject": { "posture": "all_fours" }
}
```

Setting `human_chair` sets both postures and anchors; removing the contact returns her to her previous anchor or `beside_her`. Every weight-bearing contact (`human_chair`, `footrest`, `standing_on`, `straddled`, `under_her_seat`, `feet_on_face`, `on_lap`) declares `implies`. A contact with `direction` (`on_lap`, `carrying`, `tending_wounds`, `hair_brushing`) works both ways.

## 3. Vocabularies as data

Registries `blockingPostures`, `blockingAnchors`, `blockingContacts`, `blockingItems`, `blockingActivities`, `momentSources`, `contactPhysics`. Common entry shape:

```
{
  id, scope: 'any' | 'dynamic',          // dynamic = only at P15 frame ≥ play
  tags: ContentCategoryId[],             // the content gate
  label, description,                    // AUTHOR TO WRITE where marked
  promptHint,                            // no pronoun for the commander
  requires?: { affordances?, slots?, posture? },
  implies?, slot? (items), actor?: 'her' | 'commander' (activities),
  target?: WorshipTargetId (worship contacts), physics?: PhysicsId,
  effects: Effect[]
}
```

**Effects** are a closed vocabulary (a new type is a code change; a new entry never is). Draft:

| Effect type | Read by | Example |
|---|---|---|
| `camera { mode }` | P17c CSS camera | `from_below`, `face_close`, `ignored`, `pov_floor`, `pov_dark` |
| `backdrop { id }`, `pose_shot { kind }` | P17c art slots | `frame_under_desk`, `feet_overhead` |
| `filter { kind }` | P17c light | `sensory_dark`, `alarm` |
| `perception { self?, others? }` | the obscured layer (P17 §8) | blindfold: everyone `obscured` |
| `input { limit, strength? }` | the input layer (P17c) | `muffled`, `garbled`, `no_speech`, `gestures_only`, `no_hands`, `action_only` |
| `gestures { variant }` | the gesture menu | `pet` (paw, nuzzle, lie down) |
| `device { lock }` | the shell | `tabs` (only the scene chat) |
| `sensory { kind, intensity }` | P17d sensory layer | scent / touch / sound / temp |
| `sound { muffle \| id }` | P10 sound | bell on every move |
| `visibility { hiddenFromDoor?, exposing? }` | moments (`third_party`), suspicion | `under_desk` hidden; `property_tag` exposing |
| `mobility { level }` | allowed transitions, options | `none`, `limited`, `crawl` |
| `strain { condition, rate }` | P17 Strain | `stillness`, `silence`, `endurance` |
| `escalation { verb }` | her escalation channel (§7) | `nudge_with_foot`, `tug_leash`, `tighten_hold` |
| `physics { id }` | contact physics (§9) | `breath`, `weight` |
| `rule { template }` | P9d/P16 rules | `ask_permission` while the item is worn |
| `notice { kind }` | P15 §8 squad knowledge | `knows_dynamic` for whoever sees it |
| `status_after { id, slots }` | P7 statuses | stiffness, dizziness, marks |

Code reads entries by field and effect type, never by id (P10 rule). Visual effects (`camera`, `backdrop`, `pose_shot`, `filter`) are **hints**: a missing file falls back along P17c's chains (down to no sprite at all), and no entry, moment or physics is ever withheld or fails because its art is absent.

## 4. Starter content (`content/core`, texts `AUTHOR TO WRITE` where not given)

**The full content — essence and effects of every worship target, item, contact, activity, posture and anchor, the escalation channels, when each moment source is live and how its options map to response types, gaze rules and tells — is `docs/content/blocking.md`. Read it before writing the plan; the JSON mirrors it, and nothing there is a placeholder to invent.** The lists below are the index.

All of it lives in `content/core` (author ruling): descriptions are neutral and clinical, scene prose is written by the model. Tags gate everything; with the categories off, none of it exists.

**Items** (slot · tags): `blindfold` (eyes · restraint), `collar` (neck · —), `leash` (neck · pet_play), `ring_gag` (mouth · restraint, humiliation), `muzzle` (mouth · pet_play), `scent_gag` (mouth · worship, humiliation), `hood` (eyes+ears · restraint), `posture_collar` (neck · restraint), `shock_collar` (neck · pain_rough), `paw_mitts` (hands · pet_play), `spreader_bar` (feet · restraint), `chastity_device` (groin · denial; neutral name, the commander's body is not assumed), `property_tag` (body · objectification, public_humiliation), `bell_collar` (neck · pet_play), `scarf_blindfold` (eyes · restraint, worship), `cuffs_to_collar` (hands+neck · restraint), `remote_toy` (groin · explicit_scenes, denial; driven from her PDA, §P17c), `nose_hook` (face · humiliation), `her_marks` (body · humiliation), `wearing_her_scent` (body · worship), `earpiece` (ears · exposure_risk), `tail` (body · pet_play, explicit_scenes), `food_bowl` (prop · pet_play, deprivation), `plug` (body · explicit_scenes, restraint).

Effects per item as drafted in the session, e.g. `ring_gag`: `input garbled 3`, `camera face_close`; `bell_collar`: `sound` on every move, `strain silence +` for any action; `hood`: `filter sensory_dark`, `perception others obscured`, `sound muffle`, more touch lines; `posture_collar`: options "look down" removed, `strain posture`; `paw_mitts`: `gestures pet`, `device lock tabs`; `spreader_bar`: `mobility limited`, "stand up" / "step away" removed; `chastity_device`: `rule ask_permission` standing, the key is an `object_at_hand` when left nearby; `property_tag`: `visibility exposing` ("hide" unavailable, only "as is" / "cover with hands"), `notice knows_dynamic`; `remote_toy`: `escalation remote_pulse` (works when she is not in the scene), `physics endurance`; `plug`: `strain endurance` worse when sitting or moving, removal is her privilege (P17a).

**Contacts** (scope · tags; `→` = commander toward her):
- worship and smothering: `smothered_armpit` (dynamic · worship, restraint; target armpits), `smothered_breasts` (dynamic · worship, explicit_scenes, restraint), `under_her_seat` (dynamic · objectification, restraint), `face_to_bottom` (dynamic · worship, explicit_scenes, humiliation), `feet_on_face` (dynamic · worship, humiliation), `foot_on_head` (dynamic · humiliation), `sole_to_mouth` (dynamic · worship, humiliation), `foot_worship` → (dynamic · worship), `boot_worship` → (dynamic · worship, humiliation), `oral_service` → (dynamic · worship, explicit_scenes, service), `kneeling_between_legs` (dynamic · service; `under_desk`, escalation `nudge_with_foot`);
- weight and holding: `footrest`, `human_chair`, `standing_on` (pain_rough, objectification), `straddled`, `boot_on_chest`, `between_thighs`, `held_by_hair`, `pinned_to_wall`, `knee_on_back`, `over_her_knee` (physical_discipline_shown), `tied_to_bedpost` (requires `bunk`), `tethered`, `crawling_on_leash` (pet_play);
- soft power (dynamic): `chin_lifted`, `head_pushed_down`, `cheek_on_her_thigh`, `step_behind` (no touch; public protocol), `kneeling_at_door`;
- any relation: `holding_hands`, `spooning`, `on_lap`, `forehead_to_forehead`, `back_to_back`, `carrying`, `tending_wounds`, `foot_rub`, `hair_brushing`, `hand_feeding` (deprivation inside a dynamic), `reading_to_her`, `hand_over_mouth`, `face_in_her_neck` (worship inside a dynamic);
- service with touch (dynamic · service): `dressing_her`, `undressing_her`, `bathing_her` (worship), `painting_her_nails`, `massaging_shoulders`.

**Her activities** (`actor: her`; each: `attention: on_commander | divided | elsewhere | none`, `interruptible`, `impliedPosture`, `sources` weights, `body`, `expression`, `requires`), groups and draft ids:
- default: `attending`, `idle`;
- duty: `reading_reports`, `writing_report`, `on_comms`, `leading_briefing`, `cleaning_weapon`, `repairing_gear`, `planning_map`, `on_watch`;
- body: `showering`, `changing_clothes`, `taking_off_boots`, `stretching`, `working_out`, `cooling_down`, `tending_own_wound`, `doing_hair`;
- leisure: `reading_book`, `playing_cards`, `music`, `eating`, `drinking`, `smoking`, `chatting_on_pda`, `writing_journal`, `sketching`, `mending_clothes`, `tinkering`, `caring_for_plant`, `playing_instrument`;
- rest: `sleeping`, `dozing`, `restless`, `sick`;
- construct (lore): `firmware_flash`, `implant_calibration`, `suppressant_dose`, `med_scan`, `diagnostics_glitch`;
- after events: `mourning`, `celebrating`, `pacing_angry`, `crying_alone`, `rereading_messages`;
- with others: `training_rookie`, `gossiping`, `arguing_with_unit`, `comforting_friend`;
- waiting and field: `pre_mission_nerves`, `in_transit`, `camp_night`;
- inside a dynamic: `waiting_for_commander`, `inspecting`, `writing_task`, `choosing_equipment`, `ignoring`.

**The commander's activities** (`actor: commander`, no touch): service — `polishing_her_boots`, `tidying_her_quarters`, `doing_her_laundry`, `taking_dictation`, `refilling`, `holding_for_her`, `reading_aloud`, `preparing_her_gear`, `cleaning_her_weapon` (a privilege, not a duty: weapons are personal in the lore), `warming_her_bed`, `tasting_first`, `standing_by`, `waiting`, `facing_wall`; non-service — `writing_report`, `on_comms`, `eating`, `idle`. Service activities carry `fits` (her activity tags they pair with: `focused`, `relaxed`, `body`, `asleep`), `presence` (unnoticed ↔ felt; her preference is in her expectation profile) and `judged` (P16 `service_rated` against her profile).

## 5. Who changes the blocking

1. **The engine**: a staging preset (P17), a practice (P16), a contact's `implies`, a physics outcome, a moment answer.
2. **The player's chips** ("kneel", "crawl back", "stand"), checked against allowed transitions (a tied commander does not stand; `mobility none` removes movement).
3. **The extractor**: `intent_extract` reports `blocking_change { personId, field, value, confidence }` in the closed vocabulary only; the engine validates (tags, scope, requires, mobility) and ignores low confidence (`TUNING.blocking.minConfidence`).

- **Prompt:** a compact `[BLOCKING]` block every turn, built from labels and `promptHint`s (`Rhea: sitting at desk, on comms. The commander: kneeling under the desk, hands bound, gagged.`). Group `scene`; no pronoun for the commander.
- **Snapshots:** the blocking and the moment state are stored **per message id**; a swipe, an edit or a delete rolls them back to the snapshot before that message.
- **Reset on chat switch** (P11 rule: scene ids repeat across campaigns).

## 6. Moments

A **moment** is a point of tension inside a scene where the commander gets an explicit choice. A third person is **one** source of tension among many; a moment works as well in a two-person scene.

### 6.1 Sources

Registry `momentSources`: `{ id, scope, tags?, frame: [OptionKind, OptionKind, OptionKind], live: Condition, description }`. Draft (≈25):

| Group | Sources (scope) | Frame |
|---|---|---|
| from her | `her_demand` (dynamic) | obey / resist / bargain |
| | `her_offer` (any) | accept / decline / accept carefully |
| | `her_silence` (any) | guess by action / ask / wait |
| | `her_question` (any) | honest / what she wants to hear / silent |
| | `her_weakness` (any) | care / keep the role / withdraw |
| | `her_mood_shift` (any) | adapt / ask / ignore |
| | `her_test` (dynamic) | (by test, P17e) |
| | `her_absence` (any) | wait / call her / leave |
| | `her_affection` (any) | answer / stay in role / pull away |
| | `her_jealousy` (any) | reassure / explain / deflect |
| from the commander | `endurance` (dynamic) | endure / signal / break |
| | `permission` (dynamic) | ask / take / wait |
| | `own_slip` (dynamic) | confess / hide / pretend |
| | `own_want` (any) | ask / take / stay quiet |
| | `duty_call` (any) | answer / ignore / ask her |
| from the surroundings | `third_party` (any) | hide / as is / show yourself |
| | `remote` (any) | keep steady / slip / cut the line |
| | `sensory` (any) | wait / speak / reach out (name, when a scent or voice is known) |
| | `time` (any) | wait / call / free yourself |
| | `alarm` (any) | stay / ask release / go |
| | `object_at_hand` (any) | leave it / take it / tell her |
| | `summons` (dynamic; P17a contract clause) | come at once / delay / ask a reprieve |
| from history | `memory_surfaces` (any) | own it / deny / turn it |
| | `rule_collision` (dynamic) | her rule / the order / ask her |
| | `compromat_hint` (dynamic) | ask / ignore / bargain |
| | `ritual_due` (dynamic) | keep it / skip / ask to move it |

Power-laden sources (`her_demand`, `her_test`, `permission`, `endurance`, `own_slip`, `summons`, `rule_collision`, `compromat_hint`, `ritual_due`) run only at P15 frame ≥ `play`. For equals, `third_party` serves the **secret romance** (P3's concealed state): lovers hiding from the squad, someone walks in.

### 6.2 Options

- Every option is tagged with a **response type** (`yielded | resisted | returned | deflected`) and the extractor's **tone** (`sincere | ironic | transactional | flat`) when typed. Moments are **explicit probes**: they move the axes of the commander's position (P15) and her reading of it.
- **Labels** are written by the model in context: `intent_extract`, already running after her reply, returns `choiceLabels` for the live frame. The engine never reads them (P16 rule). Fallback: the frame's generic words (`AUTHOR TO WRITE`). Labels arrive with the extraction, so the generic words show first.
- **Additions from affordances and presence** (a few, additive): `lock` → "ask her to lock the door"; she is present and visible → "ask her with a look"; an ally present → "look at your friend".
- **Free text always remains**; the extractor maps it to an option (`moment_answer { option, confidence }`).
- **Exposing element** (for `third_party`, `remote`): the blocking value with `visibility exposing` or the anchor that gives the commander away (leash, kneeling, under the desk, gag) is named in the directive so the labels fit it ("hide the leash under the jacket").

### 6.3 When a moment fires

- The engine sees that a source became live (a blocking change, a timer, her stress / Want, an extracted event, whereabouts bringing someone to the door) and fires it with a cooldown. The model may hint `moment_ripe { source }`; the engine decides.
- **Frequency** (SYS setting): rare / normal / often; default about one moment per 4–6 exchanges while a source is live. A separate setting for scenes at `intimacy: explicit`, default "rarer", so moments do not interrupt.
- **Chips by default.** An **immersive mode** (setting) hides the chips: free text only, the extractor maps it.
- Between moments the scene is free play.

## 7. Her answer

Computed the same way for every source:
- the **gap** between the option chosen and the option she expected (her expectation profile, P15);
- her **style pair** with the three combination rules (P15: secondary-style surfacing conditions, scene phases, numbers blend while preferences come from the profile);
- her **reading** of the commander's position (P15);
- the **escalation channel** derived from the contact (`escalation` effect): foot (`at_her_feet`, `kneeling_between_legs`), leash tug (`leashed`), hand in the hair (`head_in_lap`, `held_by_hair`), whisper (`close`, P17d), a pulse (`remote_toy`), a message on the PDA (`remote`), otherwise a look, a cough, a name said aloud. The engine picks the channel; the model writes the act.

The author's reference case: she is on comms at her desk, the commander under it at her feet (`foot_worship`), a visitor walks in (`third_party`): hide / as is / show yourself. An assertive holder whose commander stops and stays still nudges with her foot (`escalation nudge_with_foot`). Nothing of it is authored as a scene.

## 8. Output channels

Each blocking value and each source declares effects per channel; each system reads its channel by field:

| Channel | From the blocking | From the moment |
|---|---|---|
| visual | `kneeling` → camera from below; `under_desk` → desk frame, others seen only as legs or voice; `blindfold` → near-black screen, portraits hidden | `alarm` → red filter; `third_party` → visitor slides in from the door side; `her_weakness` → another expression |
| input | gag → garbled; `hands_bound` → hand gestures gone; speech rule → choice from her permitted lines (P16) | `endurance` → countdown (if real stillness is on); `her_question` → sometimes dictation |
| device | leash → a mark on the casing; contacts with busy hands or covered face → **PDA unavailable** (§10) | `her_absence` → a visible clock; `duty_call` → the PDA beeps and cannot be answered without her leave |
| senses (P17d) | blindfold → more and stronger sensory lines | `third_party` → the visitor's scent an exchange before she enters |
| sound | muffling | knock, steps |
| prompt | `[BLOCKING]`, POV directive | the source directive, her tactic |
| state | — | hold, favour, tracks, compromat, secrets, publicity, position axes, her reading |
| memory | — | outcomes worth remembering (§13) |
| body | a long posture → a status | a slip → her discipline, a screen glitch |

## 9. Contact physics

A **template** for contacts that have a physical gauge. Registry `contactPhysics`: `{ id, gauge, rhythm, skill, signal, limitPref, visual, interaction, chains? }`.

1. **Gauge** — what drains or fills (air, strength, saturation, cleanliness, her activity's progress, jaw fatigue). It is the physical state of the contact, like Strain, not a meter of the commander's feelings (revised ruling E, P15 §16.1; the commander's bodily responses are §16.8).
2. **Her rhythm** — by style: `cold` even, `playful` fakes the windows, `cruel` shortens them, `obsessive` irregular, `ritual` measured; numbers blend primary/secondary (P15).
3. **The commander's skill** — grows (§9.3).
4. **Signal in the fiction** and her attitude to it (§9.4).
5. **Her preferred limit** — `holdsUntil: signal | limit | blackout` from her expectation profile.
6. **Visual and interaction** — one of five interaction types.

### 9.1 Instances

| Physics | Contacts | Gauge | Visual | Interaction |
|---|---|---|---|---|
| `breath` | `smothered_*`, `under_her_seat`, `face_to_bottom`, `between_thighs` | air | vignette closes, outside sounds go dull, input narrows | **timing**: catch the window of her rhythm ("breathe") |
| `weight` | `standing_on`, `human_chair`, `footrest`, `straddled`, `boot_on_chest` | strength | light screen tremor that grows | **hold**: keep a key or button down steadily; she shifts her weight; letting go = a slip |
| `saturation` | `smothered_armpit`, `feet_on_face`, `scent_gag`, after a run | saturation | sensory lines crowd each other out | **decision**: "breathe through the mouth" lowers it, but she notices (an insult when her meaning is `intimacy`) |
| `tongue_work` | `boot_worship`, `foot_worship` | cleanliness (a result) | progress of the cleaning, her check at the end | **order**: choose the next part; matching her order from the body map raises the verdict |
| `her_activity` | any furniture contact | her activity's progress | pages of the report, the comms session's time | **passive**: moments only; endure until she finishes |
| `jaw` | `sole_to_mouth`, `ring_gag`, `oral_service` | fatigue | input degrades, letters smear | **gesture**: ask for a rest |
| `gulp` | (`watersports`, P17b) | keeping up | flow pacing | **timing** of swallows |

- **Chains:** a slip in one physics opens the next with no authored text: spilling in `gulp` → `tongue_work` on the floor with her check; slipping in `weight` → the hold lasts longer.
- Each **interaction type** can be switched off in settings (then only text and moment options remain). A **real-time variant** (the gauge runs in real time; tapping out = holding a key) is a setting, default off, like P17c's real stillness.
- `tongue_work` after a run **lowers her sweat layer** in the scent model (P17d): the gauge of cleanliness and her scent are one state.

### 9.2 During a hold

- **She falls asleep** like this (`under_her_seat`, `feet_on_face`, her activity turns `sleeping`): the length is unknown; waking her is a moment (`her_absence`-like frame: wait / wake her / slip out).
- **She "forgets"** to let go (extends the hold) by style and Impunity (P16 §8 "forgot" generalised).
- **She talks or ignores**: during the hold she talks to the commander, to someone on comms, or is busy with her own thing; each changes the moments.

### 9.3 The commander's endurance

A **skill of the commander's body**, common to all holders (P7 "weakness is a playstyle": a weaker commander really endures less). P16b §2 makes it one of the commander's disciplines (`endurance:<physics>`). It grows from: experience (each hold endured gives xp per physics); **training at base** (breath drills and similar as a slot activity in the training room, alone or with someone); **the player's mastery** in the moment (a caught window returns more air; a good streak gives xp faster). Skill raises the gauge's capacity; it never removes her rhythm.

### 9.4 Two signals

- **The tap** is a signal **inside the fiction**: her profile decides what she does with it (`holdsUntil`). A `blackout` holder ignores it.
- **The stop word** (P17 §7) is the **player's** signal outside the fiction: it **always** ends the hold and the scene element, whatever her profile.

So the fiction may be hard and the player always has a way out.

### 9.5 Blackout (`breath_play` only)

The scene cuts, the screen goes dark, time moves on, a **wake-up card** (where the commander came to, her first line), a `dizzy` status for the rest of the day, and what came after (care, coldness, mockery) by her style. Without `breath_play` the hold always ends at her limit or at the tap.

## 10. The device during contacts

Contacts with busy hands or a covered face (`effects: device { lock: 'tabs' }`) make the PDA unavailable: tabs locked, only the scene chat, a line on the screen ("the device is out of reach"). No occlusion graphics (author ruling).

## 11. Local content packs

- `CONTENT_ROOTS` (`src/index.ts`) gains an optional second root `content/local`, listed in `.gitignore` (only that folder; `dist/` and `style.css` stay committed). A missing pack is not an error.
- **Merge rule:** a later pack adds entries and overrides earlier ones by `id`; errors go to the SYS debug panel as now.
- `docs/CONTENT.md` gains a section on local packs.
- All the starter content of §4 ships in `content/core` (author ruling).

## 12. Generation (P14) and rerolls

- Sites: `moment.labels` (inside `intent_extract`), `profile.expectations` (P15, at import), any later generation here.
- **A reroll changes the text, not the engine's decision.** Which moment fired, its source, her reaction and every physics roll are decided by the engine from the seed; swiping regenerates narration only. A swipe or edit rolls the blocking and moment snapshot back (§5).

## 13. Memory check (CLAUDE.md rule)

- `moment_answered` with a source tagged `remember` (draft: `her_weakness`, `her_question` when the answer was a lie, `own_slip` confessed or hidden, `third_party` exposed, `memory_surfaces`) → a `memoryRules` entry: audience = present units, `spread` none (the squad hears through P15 §8 only), importance by source; `hiddenFromCommander` false.
- `physics_outcome` with `blackout` or a broken limit → a `memoryRules` entry, audience the pair, importance high.
- Blocking changes, labels, gauges: pure bookkeeping, not remembered.
- Journal: new relation events get `eventDeltas[].journal`; no chronicle line without an `audience`; the `[BLOCKING]` block is a `scene` provider, not `memory`.

## 14. Directives, intents, events, actions

- Directives (derived each refresh, never stored): `blocking:scene`, `blocking:pov` (narrate only what the commander perceives when obscured), `moment:<sourceId>` (the tension and the exposing element), `physics:<id>` (her rhythm and what she expects). Keep away from the prefixes P9, P9b, P9c, P9d, P9e, P11, P12, P13 reserve. No pronoun for the commander.
- Intents: `blocking_change`, `moment_answer`, `moment_ripe`, `choiceLabels` (payload), `tone` on answers.
- Events: `blocking_changed`, `moment_fired`, `moment_answered`, `physics_started`, `physics_signal`, `physics_slip`, `physics_outcome`, `blackout`, `endurance_gained`.
- Actions: `blocking/set` (chips, validated), `moment/answer`, `physics/input` (timing, hold, order), `physics/signal`, `scene/stop_word`.

## 15. Settings

SYS › Scene: moment frequency (rare / normal / often), moment frequency at `explicit`, moments as chips / immersive (no chips), interaction types on/off per type, real-time physics (off). WORLD PARAMETERS › CONTENT: the four new categories (`watersports` requires `bodily_fluids`).

## TUNING draft (design session 2026-11-19)

Draft balance values agreed with the author; the plan copies them into `TUNING` (`moments`, `physics`, `scent`, `remoteToy`). Scales 0–100; a day is 4 slots (P2); an **exchange** is a player line plus her reply; a **beat** is one interaction step of a physics (≈ 1.5 s in the real-time variant).

**`TUNING.moments`**

| | rare | normal | often |
|---|---|---|---|
| chance per exchange while a source is live | 0.10 | 0.20 | 0.35 |
| minimum exchanges between moments | 6 | 4 | 2 |
| maximum moments per scene | 2 | 4 | 6 |

- At `intimacy: explicit` the chance is ×0.5 (its own setting). One source at most once per 8 exchanges.
- Extractor confidence: `blocking_change` 0.6, `moment_answer` 0.55. Option labels ≤ 40 chars.
- Her reaction to the gap (expectation strength 1–3): matched → favour +2; partial → 0; opposite → favour −3 and an escalation chance of 0.5 × strength.

**`TUNING.physics`**

| physics | gauge | per beat | her move |
|---|---|---|---|
| `breath` | air 100 | −14 | a window every 2–4 beats: caught +30, missed +8 (`cruel` +4) |
| `weight` | strength 100 | −8 | shifts weight every 3–5 beats: −15…−25 when the hold is uneven |
| `saturation` | 0 → 100 | +10 × scent band (0.5 / 1 / 1.5 / 2) | "breathe through the mouth" −20, she notices with 0.6 |
| `tongue_work` | dirt 100 after a run | right order −15, wrong −8 | her check at dirt ≤ 10 |
| `jaw` | 0 → 100 | +8 | from 70 the input degrades further; rest by style |
| `gulp` | 4–8 swallows | a window per swallow | a miss = a spill → `tongue_work` with dirt 60 |

- **Breath window width by style** (real time, ms; author ruling: narrow on purpose, a cruel window is meant to be hard to catch): `affectionate` 700, `cold` 550 (even, predictable), `ritual` 500 (strictly counted), `clinical` 500 (every 3rd–4th window "measures": half width), `possessive` 450, `playful` 450 (35 % of windows are false: open and shut at once), `cruel` 250, `obsessive` random 200–700. Blend of the style pair 0.65 / 0.35, reversed in the phase the secondary leads.
- **Turn-based mode:** a window lasts one beat and is given away only by a faint sensory line; for `cruel`, 40 % of windows come with no cue.
- `holdsUntil`: `signal` releases at a tap or at air ≤ 15; `limit` ignores the first tap and releases at ≤ 5; `blackout` ignores taps and at 0 the blackout happens (without `breath_play` it acts as `limit`).
- Blackout: time moves 1 slot; status `dizzy` for the rest of the day (commander checks −1, stress +5).
- She falls asleep during a hold: 0.08 per beat, only at night or when her activity was rest; sleeps 1–3 exchanges.
- She "forgets" to let go: 0.10, `cruel` +0.15, +0.002 per Impunity point above 50.
- **Endurance skill** per physics, levels 0–5, each +10 % capacity; it **never widens the windows** (her rhythm stays hers). XP: a hold endured +10; each caught window after three in a row +2; training in a slot +15 (once a day). Thresholds 30 / 80 / 150 / 250 / 400.

**`TUNING.scent`** (read by P17d; listed here because the physics uses it)

- Base per body part (0–3, profile overrides): feet and soles 2, armpits 1.5, the rest 0.5–1.
- Hygiene: fastidious ×0.6, normal ×1, careless ×1.4.
- Situation: after a run ×2 for 1 slot then ×1.5; after training ×1.5; +0.15 per slot since the last wash (cap +1); a shower resets.
- Intention (did not wash on purpose): ×1.5 for 1–3 days.
- Bands: `faint` < 1, `noticeable` 1–2, `strong` 2–3.5, `overwhelming` ≥ 3.5.
- Clinging on the commander: `close` 1 slot, `intimate` 2, smothering or `explicit` 3; `wearing_her_scent` until washed.
- Noticing roll: 0.15 × band (0.3 / 1 / 1.8 / 2.5) × closeness (passing 0.5, talking 1, close 1.8) × her perceptiveness (0.7–1.3), cap 0.9. A room's scent drops a band after 1 slot and is gone after 3.
- A scent is **learned** after 3 close scenes or once she names it herself.

**Other**

| what | value |
|---|---|
| `her_marks` | 2 slots; under a no-washing rule until she allows, at most 3 days |
| remote toy (P17c) | pulse chance per exchange: `playful` 0.4, `cruel` 0.35, `cold` 0.2, others 0.25; 2–4 characters jolted; others notice: 0.2 per jolted message |

## 16. Revision of 2026-11-20 (design session)

Added after the 2026-11-20 design session (the player who mostly accepts: weight comes from execution and cost, not from refusing). Where it conflicts with §1–§15 and the 2026-11-19 TUNING draft, this section wins. The commander's disciplines, postures, training and records are **P16b**; the revised ruling E is P15 §16.1; temperament (`talkativeness`, `volatility`, `humor`) is P14c §1.

### 16.1 Timing belongs to the engine (the latency rule)

The physics is a real-time layer; the model answers in one second or in a minute, never predictably. So the real-time layer **never waits for the model**, and the model always works at boundaries:

- **The cue pool.** When a physics starts, one mechanic call (P14 site `physics.cues`, budget 250) returns her lines per cue kind in her voice: `window_open`, `window_false`, `shift`, `press`, `lift`, `count`, `warning`, 3–5 each. Fallback: the authored registry `physicsCues` (`AUTHOR TO WRITE`). The engine fires them **locally**, at the moment it decided, as short lines in the scene frame (and the sensory layer of P17d). Cue honesty follows her style: `cold` honest and even; `ritual` and `drill` count; `playful` sends false cues (`window_false`); `cruel` gives none or a trap; `clinical` changes the cue language to test whether the commander learns; `regal` announces; `vindictive` sparse.
- **Segments.** Sending a message (or, in silent use, the start of the physics) starts a **segment** of fixed length (`TUNING.physics.segment`, 20–40 s by physics; turn-based: a fixed number of beats). The generation runs behind it. A reply that arrives inside the segment is shown at once (read under load: fair, because the segment's length does not depend on the model). A reply that arrives after the segment ended finds the body **held in a neutral state** (no drain, no windows; a P17d §6 "she takes her time" line) until it does. Latency never changes the difficulty.
- **The engine decides, the model narrates, the next segment applies.** At each segment boundary the engine decides her next move (press harder, lift, change rhythm, fall asleep, let go) and writes it into `physics:<id>` together with a **segment summary** (windows missed, a gasp, a slip, noise). The reply narrates what happened and what she does; the change takes effect in the next segment.
- **Silent use.** When she does not talk (her `talkativeness` is `silent`, or her activity occupies her), segments run back to back on the cue pool and the model is called only at the phase boundaries of a marathon (§16.3) or at the end.

### 16.2 Every word costs the body (split attention)

While a physics runs, typing occupies the hands: while the scene input has focus and keys are typed, the maintenance inputs (the hold key, window taps, posture corrections of P16b) lapse; drift and drain go on. The player chooses: answer short, type between windows, answer with a moment chip (one click, generic), or stay silent. Turn-based: a message consumes beats in proportion to its length (`TUNING.physics.charsPerBeat`).

It applies only when there is talk: she asks something or the commander has something to say (`own_want`). It is an occasional extra challenge, not a layer of every hold: many holders use the commander in silence (§16.1). Style: `cruel` asks questions that need long answers exactly under load; `affectionate` asks only yes / no; `clinical` tests how many words the commander can manage; `drill` demands a full report.

### 16.3 The marathon (long holds)

For holds of an hour of fiction time or more (a footrest through her evening, a night under her arm, "until I decide"):

- **Phases.** 2–8 active phases of a few segments each, each anchored to a fiction time and carrying an event from the live sources: her check, a comms call, a visitor (always possible), her provocation, she falls asleep, a cramp, an itch, a sound at the door.
- **Skips are not empty.** Between phases the fiction time passes and is resolved: the player picks a strategy for the stretch (endure / spare strength / cheat, §16.4 / ask for rest) and the engine resolves it with draws on the commander's skills (P16b) into a summary ("the second hour: the legs went numb at forty minutes; one shift of weight; she did not notice").
- **Attrition.** Body resources (strength, air, focus, stiffness) drain by fiction time less endurance; each phase starts weaker than the last, so the sixth hour is heavier under the hands, not in words.
- **Visible time.** A fiction clock in the scene frame ("17:40 … 19:15 … 21:30"), her activity's progress (pages of the report), the slot light (P10c), the base's sounds by slot (P17d).
- **Calendar.** The hold consumes every slot it spans (P2): the honest price in free time. Unknown duration (P16 §R.9) hides the end, so the resources cannot be planned, only held.
- **After.** Status `stiff` for the next slot (P7 statuses), her verdict, a record in fiction time (P16b §4).
- **Setting** `marathonPace` (SYS › Scene): short 1–2, **normal 3–4 (default)**, long 5–6 real minutes per fiction hour. Pure difficulty, nothing rewards it: records and consequences counted in fiction time are identical at every setting.

### 16.4 Her gaze: endure honestly or cheat

Her attention cycles between watching and busy, by style and by her activity's `attention` (P15a §4): `clinical` watches almost always; `cold` rarely but suddenly; `playful` pretends to look away; `affectionate` looks away on purpose to give a rest and is hurt if the rest is not taken. The player reads it from signs only (her lines, the rhythm of her replies, the camera), never from a meter.

While she does not watch, **relief inputs** are open: shift the weight, lower the arms, breathe through the mouth, ease the posture, breathe through a gap (§16.7). Each restores a resource and makes noise (§16.5). **Caught** (a hashed draw on her attention band and her `reading` skill, §16.10) is a `physics_cheat` slip, worse than weakness: her reading of the motive moves away from `her` (P15 §16.4), Regard falls (P15 §16.3), her discipline follows (P16). Cheating pays most when a hard phase lies ahead.

### 16.5 Noise: the body gives the commander away

Every slip of the body makes a sound: a missed window, a loud breath; a weight slip, a creak; a posture correction, a rustle; a missed swallow or a reflex, a cough. Loudness = the slip × (1 − the commander's stillness skill, P16b). With an unaware other present, noise feeds P17 Strain and that person's suspicion; with nobody, it is her reaction alone. Her staging tactics work with it (P17 §6): composed covers it with her voice, `cruel` makes noise unavoidable and watches, cautious locks the door.

### 16.6 Combined physics

Two physics at once, by rule rather than by authored combos: each physics declares its input and its gauge; when two run, the inputs merge and conflicts become decisions: holding the breath steadies the weight; breathing through the mouth lowers saturation but she notices; a posture correction is noise and can cost a window. Her escalation by track level **adds a second physics** to the first instead of a new mini-game. Style: `cruel` and `clinical` combine often, `affectionate` almost never, `ritual` and `drill` by rule ("while you hold, you recite"). Drafts: weight + breath (she sits on the face), saturation + `tongue_work` (a sweaty foot), posture + stillness (tickling in a posture), breath + kisses ("a kiss for a breath", P17b rev. 2026-11-20).

### 16.7 Smothering by seal

`contactPhysics.breath` gains `seal: tight | firm | leaky` and `pressure` per contact (hand over the mouth, thighs, her seat, armpit, breasts, feet, a palm with the nose pinched). `leaky` lets a share of air through each beat; breathing through a gap is a relief input (§16.4). Her mood and style move seal and pressure inside the contact's range; her `seal` skill (§16.10) tightens it.

### 16.8 The body layer: tolerance, reflex, trajectory, the language of perception

The revised ruling E (P15 §16.1): the engine tracks the commander's **bodily** responses and a record of **deeds**; thoughts and feelings are the player's.

**Stimulus kinds** (registry `stimulusKinds`, `AUTHOR TO WRITE`): `sweat_exertion`, `sweat_heat`, `sweat_fear`, `sweat_stale`, `scent_feet`, `scent_armpit`, `scent_body`, `scent_worn` (her worn items), `taste_salt`, `taste_skin`, `taste_dirt` (boots, the region's dirt), `taste_polish`.

**1. The body (engine).** Per kind, on the commander: `Commander.stimuli[kind] { tolerance, reflex, exposure, lastDay }`.
- **Tolerance** is the saturation capacity; **reflex** is the threshold where the body protests (cough, watering eyes, a gag).
- Exposure raises tolerance and pushes the reflex back. Habituation has a second side: **faint stops registering** — sensory lines at `faint` fade as tolerance grows ("the faint scent no longer reaches you"); to feel, it takes more.
- Absence (her cold shoulder, a long run, separate quarters) lets tolerance slip back slowly and sensitivity return: the first meeting after a separation hits harder.
- A reflex shows in the interface (the screen swims, the input stutters), makes noise (§16.5), and she notices.

**2. The choice (player).** In every contact with a stimulus the player answers one way:

| Way | What it is | Risk |
|---|---|---|
| avoid | breathe through the mouth, turn the face | she notices; an insult when her worship meaning is `intimacy` |
| quick sniff | a test | — |
| **deep inhale** | worship | the reflex, when the stimulus is above tolerance |
| nuzzle | press the face in; continuous | `saturation` runs |
| on her order | "smell it" | refusing is a slip |
| in secret | her worn item while she does not look | caught: `cruel` delights, most despise it (Regard); a cheat in reverse, a secret indulgence |
| taste | lick | the kisses-and-tongue category (§16.9) |

**Deep inhale as a mini-game.** Hold a key to inhale; an intensity bar rises; release inside the green zone, set by the stimulus band and tolerance. Overshoot = the reflex (cough, slip, noise); release early = shallow (she is displeased if she expected worship). Tolerance widens the zone and moves it up; at `reading` ≥ 3 she presses the face in on the inhale.

**3. The trajectory (record of deeds).** The share of avoiding vs seeking per stimulus kind over time gives a stage: `aversion → enduring → accustomed → craving → adoring` (a deed statistic like the position axes of P15 §15.2, with the same hysteresis). It feeds her reading of the motive (`process` vs `her`), her reactions (`cruel` likes craving and not adoring; `affectionate` is glad of adoring; `ritual` values enduring), and the conditioned reactions (P17d rev. 2026-11-20) from `craving` on.

**4. The language of perception (instead of thoughts).** The sensory lines and the `physics:` directive carry the stage: aversion "sharp, sour, hits the nose"; accustomed "familiar, hers"; adoring "warm, thick, hers"; after a separation "like the first time". The model narrates perception, never the commander's feelings or thoughts.

**Consequences:** at `craving` the commander more often carries her scent (unless washed): squad suspicion (P15 §15.13); deprivation brings "something is missing" lines and commander stress (P12); her reactions follow her worship meaning.

### 16.9 Kisses and the tongue (a category of acts)

Separate from inhaling: a direct act of the mouth with its own body side.
- **Body:** taste tolerance and reflex (§16.8 taste kinds); the `jaw` physics; a `dryness` gauge for long licking.
- **Kinds:** a kiss (a discrete act: protocol, greeting, thanks after a punishment); counted kisses ("a hundred", a ritual; a miscount starts again); a long pressed kiss (devotion: stillness); licking (continuous: `tongue_work` and the tempo mini-game of P16b); as a pet (`pet_play`, a quick rhythm); taking in the mouth (toes, fingers: `jaw`).
- **Mini-game:** mostly one — **tempo and pressure** against her "how" (P15 §15.3); single kisses are acts with her reaction, no mini-game.
- **Trajectory** per taste kind (salt can grow familiar long before the dirt of a sole). **Language of perception** by taste: "salty, bitter, want to spit" toward "her taste".
- **Meaning** follows her worship meaning (`duty` protocol, `humiliation`, `intimacy`). Gate: `worship` (+ `explicit_scenes` for the targets that need it).

### 16.10 Her skills

The commander learns her, and she learns the commander. Per pair: `Relation.dynamic.herSkill { seal, weight, reading, swing, rhythm }` (0–5), growing with practice on this commander:
- `seal` — how tightly she presses in a smother;
- `weight` — where to put her weight so it is heavier;
- `reading` — she learns the commander's tells: at 3+ she knows the beat before a tap (`affectionate` lets go just before it; `cruel` holds just past it);
- `swing` — a slap's accuracy and marks, and feints in the slap QTE (P16 §R.3);
- `rhythm` — her window patterns grow more varied.

Her style decides how she uses them. The player sees them only through their effects and her lines ("I'm getting better at this"). Difficulty thus rises inside the fiction at a pace set by her style.

### 16.11 Her personal rhythm

Each holder's windows follow a **personal pattern** (`fnv1a(<seed>|<unitId>|rhythm)`) on top of her style; knowing it is a pair skill of the commander (P16b `rhythm` mastery per pair): with another woman it has to be learned again. Changing the pattern is a punishment or a test.

### 16.12 New styles in the physics

P15 §16.6 adds `drill`, `regal`, `vindictive`. Rhythm: `drill` even and counted; `regal` slow, she takes her time; `vindictive` sparse and long. Breath window widths (ms, real time): `drill` 500, `regal` 600, `vindictive` 300 (blend 0.65 / 0.35 as before).

### 16.13 Settings, events, sites, memory check

- Settings: `marathonPace` (§16.3); the interaction-type toggles of §15 grow by `inhale`, `tempo`, `posture`, `qte` (P16b); switched off, only text and moment options remain.
- Events: `physics_segment`, `physics_cheat`, `physics_caught`, `marathon_phase`, `marathon_done`, `reflex`, `stimulus_stage_changed`, `her_skill_gained`. Sites: `physics.cues`.
- Memory check: `physics_caught` → a `memoryRules` entry (audience: the pair; importance mid; spread none); `stimulus_stage_changed` into `craving` or `adoring` while she was present → a `memoryRules` entry (audience: the pair; importance mid); `marathon_done` → the record fact of P16b §4 (written there); segments, summaries, cues, gauges: bookkeeping.

### 16.14 TUNING draft (2026-11-20)

| what | value |
|---|---|
| segment length | breath 20 s, weight 30, saturation 30, `tongue_work` 40, `jaw` 30, posture 30; turn-based 4 beats |
| typing under load | maintenance lapses while keys are typed; turn-based 1 beat per 40 characters |
| marathon | phases: 2 per 2 h, up to 8; skip draws by skill: endure 0.5 + 0.1 × level, spare +0.2 next phase, cheat as §16.4 |
| caught cheating | her attention: watching 0.6, glancing 0.25, busy 0.08; × (1 + 0.1 × `reading`) |
| relief | shift weight +15 strength, lower arms +10, mouth-breath −20 saturation, a gap +5 air per beat (`leaky`) |
| seal | air per beat through `leaky` +4, `firm` +1, `tight` 0; `seal` skill shifts one step every 2 levels |
| stimuli | tolerance +2 per session of exposure, −1 per 7 days apart (floor: half of the best); reflex at tolerance × 1.2; `faint` lines fade from tolerance 40 |
| trajectory | moving average 0.15 per contact; stage boundaries at seek share 0.2 / 0.4 / 0.6 / 0.8; hysteresis 3 updates |
| her skills | +1 level per 8 practices of that kind with the commander, cap 5; `drill`, `clinical` ×1.5, `affectionate` ×0.7 |

### 16.15 Anatomy

- **Soldiers:** `Unit.anatomy: 'vulva' | 'penis' | 'both' | 'unspecified'` (default `unspecified`), proposed by `profile_import` from the card, editable in the wizard and the dossier while the edit lock allows. Whatever the value, she is a woman and is written "she / her" (lore §0).
- **The commander:** `Commander.anatomy` (same values, default `unspecified`: the game assumes nothing) and, when `strap` or `her_anatomy` (P17b rev.) is enabled, `Commander.experience.receiving: 'none' | 'some' | 'used_to'` (default `none`) in the COMMANDER FILE. Experience sets the starting tolerance and the starting stage of the trajectory for receiving (§16.8).
- **Where it is read** (by field, only with `explicit_scenes`): the variants of the `genitalia` worship target and its body-map zone (`docs/content/blocking.md` §1), the stimulus kinds `scent_intimate` and `taste_intimate` (§16.8), the role-reversal contacts (`blocking.md` §3.6: `her_anatomy` requires `penis` or `both`), `bodily_fluids` descriptions, and one line in her prompt block so that the model writes her body correctly. Without `explicit_scenes` the field reaches no prompt, label or reading.

### 16.16 Relax in rhythm (the role-reversal physics)

`contactPhysics.relax_rhythm`: gauge **tension** (0 → 100), her beats as the rhythm, the interaction **hold "relax" on her beat, release and breathe between**. A hit lowers tension; a miss, or staying clenched outside a beat, raises it.

**She sets two parameters** at each segment boundary (§16.1), from her style, her **mood**, her skill, the scene's phase and her escalation:

| Tempo | Beat interval | Window |
|---|---|---|
| slow | 1.4 s | 700 ms |
| even | 1.0 s | 500 ms |
| fast | 0.6 s | 250 ms |
| erratic | 0.4–1.5 s at random | 300 ms; cues only from her lines |

| Force | Tension per miss | Jolts |
|---|---|---|
| soft | ×0.6 | none |
| firm | ×1 | rare |
| rough | ×1.6 | often: heavy beats without a cue that must be held longer |

**Her mood** is the third multiplier (mood from her state: Want, stress, the day, the commander's last answers; read by the player only through signs, P15 §15.8):

| Mood | Tempo | Force | Windows |
|---|---|---|---|
| tender | −1 step | softer | ×1.2 |
| calm | — | — | ×1 |
| playful | false tempo changes | — | ×1 |
| bored | erratic, sudden pauses | — | ×1 |
| aroused (`her_anatomy`) | erratic toward the peak | +1 | ×0.9 |
| irritated | +1 | +1 | ×0.75 |
| angry | erratic | rough | ×0.6, jolts ×2 |

Rough + erratic + angry gives windows near 150 ms: meant to be nearly impossible.

**The scene expects failure.** Each combination has an **expected miss share** (`TUNING`: about 10 % at soft-slow-calm, 50–60 % at rough-erratic-angry).
- Her verdict is judged **against the expectation**: in an angry session, holding on to the end is a good result; accuracy is not asked.
- Tension has **breaking stages** instead of one end: a cry (noise, §16.5), a tap (her `holdsUntil` decides, here about intensity, not air), a posture break (P16b). Each is a reaction of hers; the scene goes on.
- For `cruel` and `vindictive` in an angry mood the commander's breaking is the point: their satisfaction rises with the breaks, not with the holding.

**Style tendencies:** `affectionate` slow and soft, even toward the peak; `cold` even and firm; `ritual` even, counting aloud; `drill` even, raising the tempo in steps (a norm); `playful` falsely slow, then suddenly fast; `clinical` raises tempo and force step by step to find the limit; `cruel` rough and erratic; `vindictive` rough and even; `regal` slow, drawing it out; `possessive` firm and long; `obsessive` erratic.

**Her own anatomy** (`her_anatomy`): she has her own arousal; toward her peak she holds the rhythm worse (`playful`, `affectionate` go erratic), and the difficulty jumps: it happens to her, she did not plan it.

**The commander can:** ask "slower" or "gentler" (a moment option, or typed begging, P17b §10): her answer by style, favour and `holdsUntil`; ask "harder": moves her reading of the motive toward `process` and Regard by her style (P15 §16.3–§16.4); the stop word always ends it.

**Growth:** tolerance (§16.8, starting from the commander's `experience`) lowers tension per miss; her `reading` skill senses the limit: `cruel` presses exactly there, `affectionate` eases.

**The quota.** She may set a number of beats ("a hundred") or a time; the commander counts aloud (typed in rhythm, P16 §R.2); a miscount restarts it. Under "no duration" (P16 §R.9) the quota is hidden. Long quotas run as a marathon (§16.3).

**Under a blindfold** the visible beat indicator is gone; the cues are **text and interface only**: sensory lines of touch (P17d: "her palm settles on the small of the back", "she shifts her weight"), a neutral synthesized metronome click or pulse (no file, like P10b's knock; never a body sound), and a pulse of the vignette.

**Combined** (§16.6) with a posture (`chest_down_hips_up`: points drift, P16b), her weight on the back, a hand in the hair as the escalation channel, a hand on the throat (only `breath_play`: breath and rhythm at once). Misses are heard (noise, §16.5: a staging's risk). When she talks, typing under load (§16.2). After: status `sore` for slots by force and duration, visible in the commander's gait (a squad sign, P15 §15.13); aftercare by style.

### 16.17 Depth

`contactPhysics.depth` for oral contact with her anatomy or her `strap`: keep the depth marker inside the band she sets while breathing in the windows; she sets band and pace, her hand guides.
- Gauges: **reflex** (rises when depth is above tolerance: the same reflex as taste and scent, §16.8), **air**, **jaw** fatigue.
- **The hold.** She holds at depth on a count; air and reflex run together; she releases on her count; a tap follows her `holdsUntil`; her worship meaning says what it is to her (duty, humiliation, intimacy).
- **Eyes up.** `regal` (and others by profile) demands the commander look at her: the gaze point must stay **on her** (P16b gaze, reversed).
- **No wiping** (`bodily_fluids`): a rule until she allows, like her sweat (P17d rev.).
- After: a kiss of thanks; the taste trajectory (`taste_intimate`).
- Style: `cruel` holds at depth, `affectionate` praises and releases, `clinical` measures, `regal` demands eye contact.
- Training is P16b's discipline `depth`.

### 16.18 Her edge

The reversed form of "stop on her word" (P16b mini-games): the commander keeps **her** at the edge as long as she orders, reading her tells (her expectation profile); she must not go over and must not be let down. With `volatility: moody` her tells are unreliable. She goes over → her displeasure or her delight, by style; held to her order → favour and per-pair mastery. Works with any anatomy.

### 16.19 Intimate stimulus kinds

`stimulusKinds` gain `scent_intimate` and `taste_intimate` (anatomy variants, §16.15; only with `explicit_scenes`): tolerance, reflex, the trajectory and the language of perception as every kind (§16.8); her hygiene, situation and intention terms apply (stronger after training: the sweat link of P17d rev.); "deep inhale" is a choice here too.

### 16.20 TUNING additions (2026-11-20, part 2)

| what | value |
|---|---|
| expected miss share | soft-slow-calm 0.10; even-firm-calm 0.25; fast-firm-irritated 0.40; rough-erratic-angry 0.55 |
| breaking stages (tension) | 70 a cry, 85 a tap, 95 a posture break; tension −15 after a stage |
| tolerance for receiving | start: `none` 0, `some` 30, `used_to` 60; +3 per session, −1 per 10 days apart (floor half of the best) |
| `sore` | slots = 1 + force (soft 0, firm 1, rough 2) + 1 per fiction hour |
| depth | reflex at depth > tolerance band: +12 per beat; air −10 per beat at depth; hold count 3–10 by style and skill |
| her edge | window 400 ms (`steady`), 250 ms with false tells 30 % (`moody`) |

## Acceptance criteria

1. With none of the new or gated categories enabled and no close relation present, nothing here runs and every seeded test stays byte-identical (no new RNG draw unless a moment or physics is live).
2. The blocking holds one question per field; contacts set their `implies`; invalid transitions are refused; the extractor's changes validate against the vocabulary.
3. Every vocabulary entry is data; a new contact or item added as JSON works in every channel with no code change; code reads fields and effect types, never ids.
4. `[BLOCKING]` reaches the prompt each turn; swipe/edit/delete roll back to the snapshot; chat switch resets.
5. Moments fire from live sources with cooldown and the frequency setting; options carry response types; labels come from the model with a fallback; free text maps to an option; immersive mode hides the chips.
6. Her answer uses the gap, the style rules, her reading and the escalation channel from the contact.
7. Physics: every instance runs with its gauge, rhythm, interaction and chains; the commander's skill grows by the three routes; the tap follows her profile; the stop word always ends it; blackout only with `breath_play`.
8. The PDA locks during contacts that declare it.
9. `content/local` loads when present, is ignored when absent, and overrides by id.
10. `scope: dynamic` entries never appear below P15 frame `play`; disabled categories never reach a prompt, a label or a chip.
11. Every new element carries `data-analyze`; every generation goes through P14; the memory verdicts of §13 are implemented.
12. (§16, 2026-11-20) The real-time layer never waits for the model: cues fire locally from the pool, segments have a fixed length, a late reply holds the body neutral, and a seeded test with a slow and a fast fake model gives the same physics outcome. Typing under load lapses maintenance only when there is talk. Marathons run in phases with resolved skips, attrition, a visible clock and the calendar cost, at every `marathonPace` with the same fiction-time results. Cheating, noise, combined physics, seal, the stimulus body layer (tolerance, reflex, choices, deep inhale, trajectory, the language of perception), kisses and the tongue, her skills and her personal rhythm work as specified, each interaction type can be switched off, and the model never receives a line that states the commander's feelings.
13. (§16.15–§16.20) `anatomy` and the commander's `experience` import, edit and are read by field only with `explicit_scenes`; relax-in-rhythm runs with tempo, force and mood, expected miss shares, breaking stages, the quota and the blindfold cues (interface only, no body sounds, nothing loaded from the network); depth and her edge run as specified; the intimate stimulus kinds join the body layer.

## Open decisions (author)

- Every `description`, `promptHint` and fallback frame word. Numbers: drafts agreed in the **TUNING draft** section above; they are balance values, refit after play.
- Which sprites and pose shots to generate for the contacts (to be discussed after the docs; ST's 28 knee-length emotions exist now).

## Interfaces to be provided to P15–P17e

`blockingOf(scene, personId)`, `setBlocking` (validated), `effectsOf(blocking, channel)`, `liveSources`, `fireMoment`, `answerMoment`, `startPhysics` / `physicsInput` / `physicsSignal`, `commanderSkill(physicsId)`, the `[BLOCKING]` provider, snapshots per message id, `worshipTargets`, the local-pack loader.

## Interfaces already provided by P14c (implemented — use, do not rebuild)

- **Temperament:** `temperamentOf(state, unitId)` gives `talkativeness` (the silent use of §16.1) and `volatility` (how often `her_mood_shift` is live); never read `Unit.temperament` directly (`tests/life/temperamentReaders.test.ts`).
- **Practice:** hobby practice today comes from her derived whereabouts (`whereaboutAt`, the hobby's `locations`). `hobbies[].activityIds` is stored and validated for you: count a slot whose blocking activity is in it as practice (`practise` in `src/engine/life/hobbies.ts`, the day step's `practiceSlots`), and keep the whereabouts reading working for a soldier who has no blocking.
- **Quiet meetings:** `pastimes[].momentSources` is stored and has no reader: quiet meetings use only general sources (`her_affection`, `her_question`, `her_weakness`, `memory_surfaces`, `her_mood_shift`), never a `scope: dynamic` source. `herActivity` / `commanderActivity` are words in the `life:pastime:<unitId>` directive today; the pair activities of §16 replace that line. `SceneRecord.pastime { id, unitId }` says a scene is a quiet meeting.
- **`memory_surfaces`:** a `keeps` life event is a fact about her with `hiddenFromCommander`, the tags `life` and `untold` and the event id, that nothing reveals in P14c. Surface it with `revealFact(draft, factId)` (`src/engine/life/facts.ts`); `retrieveFacts` skips the tag `untold`, so no prompt reads it before.
- **Bookkeeping you may read:** `LifeState.busy` (who was with the commander in which slot, `day × 4 + slot index`), `LifeUnit.firsts`, `LifeUnit.meetingDay`, `Commander.hobbySkill`.
- Keep new directive ids away from `life:`; no rng draw (`lifeChance` / `lifeHash` hash a key with the salt); read life content by field, never by id. Details: P14c **Implemented as**.

## Interfaces already provided by P10d (implemented — use, do not rebuild)

- **The plan** (`planRooms`, `src/engine/basePlan.ts`): every place on two floors and the roof, with doors. **Affordances live on plan rooms** (`affordances`: `desk`, `bunk`, `lock`, `line`, `curtain`, `cupboard`, `crowd`, `exposed`, `window`, `water`, `mirror` in the core data); read them there, not on `hubRooms` / `locations`. A new place (shower block, briefing room, corridor) already exists as a closed plan room: give it a hub room and it opens.
- **Space:** `neighbours(reg, id, 'door')` (one step through a door, an opening or a staircase; `outside` for a door to nowhere), `neighbours(reg, id, 'wall')` (what the next room hears), `route(reg, from, to)` (rooms, length, floors) for visitors, summons and footsteps. The outside is per floor: an upper floor's exterior door (the fire stair, the kitchen roof) is a dead end, never a way down.
- **Persons:** `roomOfPerson(state, reg, here, 'commander')` is where the commander is drawn (the commander's cabin today): a hold, a claimed night or the cage add a derived reason there. **P15 added the commander marker** (`renderCommanderMarker`, drawn by `planView.ts` only while the commander is out of her own cabin, glossary `commander_marker`): a new reason to move her is only a derived reason inside `roomOfPerson` (P15's is `second_place`: a holder's booked evening puts her in the holder's cabin); the marker needs no change.
- **Marks:** `registerPlanMarks(provider)` draws a tint, a chip or a prop on a plan room (her territory, a forbidden room, a locked door, the place of a staging); kinds are free strings read by CSS (`data-marks`).

## Interfaces already provided by P14 (implemented — use, do not rebuild)

- **Every model call goes through the envelope** (`app.generations`, `src/llm/envelope.ts`): `generate(siteId, key, opts?)`, `retry`, `reroll`, `rerollState`, `drop`, `useFallback`. `callLlm` is imported by that module alone (`tests/architecture.test.ts`).
- **A package that adds a call type or a flavor kind registers its site in the same change:** a `SiteDecl` in `src/llm/sites.ts` (`id` like `<area>.<what>`, `callType`, `surface`, `reroll` mode, `record` mode, generic `label`, glossary id) and the handlers bound by the owning controller (`envelope.bind`: `build` rebuilds the input from the state, `apply` runs the same engine action as before, `fallback`, `committed` / `undo` for the reroll mode). `tests/llm/siteRegistry.test.ts` fails for a call type or flavor kind without a site; the architecture test refuses a direct `callLlm`.
- **A failure** is `refused`, `truncated`, `timeout`, `network`, `invalid_output`, `empty` or `no_profile`; the envelope writes a record (`CampaignState.generations`, at most 20, no prompt, no model text, `detail` never the model's words) unless the site's record mode is `none` or the reason is `no_profile`. Add the chip with `drawGenerationChips(host, ctx.generation, state, surface, filter)` and REROLL with `drawSiteReroll`; a screen draws neither without `generation` in its context. Labels are generic: never put a hidden value in one.
- **The engine decides:** a retried or rerolled value goes through the same sanitizer and the same action as the first one; none of the new actions draws from the rng, so a new site must not either (a seeded test that moves stops and reports).

## Implemented as

Six chunks: (a) the vocabulary as data (13 categories, 12 registries, local packs); (b) the blocking in the scene (state, gate, snapshots, `[BLOCKING]`, the extractor's `staging`, the device, the strip); (c) moments (live sources, the pass, her answer, the card, memory rules); (d) contact physics (runs, segments, her moves, cues, the panel, endurance); (e) physics depth (gaze, combined, marathon, the stimulus layer, mouth acts); (f) coverage, the unaffected guard and docs. Automated tests at the end: **569 files, 8715 tests, all passing** (baseline before P15a: 533 files, 8166 tests). §16.15–§16.20 are **not built** and go to P17b.

### The rulings (copied from the plan)

- **R1 — what is built now and what waits (user).** §1–§15 and §16.1–§16.14 are built behind stand-ins. Her style pair, `holdsUntil`, her expected option, worship meanings, position axes and the frame are hooks with neutral defaults (style `neutral`, `holdsUntil: 'signal'`, her expected option the `returned` option else `yielded`, frame `equal`); **P15** registers the readers. `scope: dynamic` entries and sources are stored, validated and never offered while the frame is `equal`. No favour comes from a moment's gap (P16). The channels `camera`, `backdrop`, `pose_shot`, `filter`, `input`, `gestures`, `sensory`, `strain`, `rule` and `notice` are validated data read through `effectsOf(…, channel)`; only the readers of R5 exist. The 13 base postures only (P16b has the 48 presets). Gaze rules, tells, the tempo mini-game, stillness, rhythm mastery, records in fiction time, the obscured presence layer, the scent model beyond base × hygiene × situation, the moment sources that need P15/P16/P17 triggers and the cost of a cheat or a slip in Regard are all left to those packages (their specs say so: **Interfaces already provided by P15a**).
- **R2 — when the blocking is live.** `blockingLive(state, reg)`: a scene is open and a present named, living soldier has `bondTierOf(...) !== null` (`close` or `romantic`), or a reader registered with `registerBlockingGate(fn)` says yes (none until P15). Grunts never make it live. `frameOf(state, unitId)` is `'equal'` until `registerFrameReader(fn)`; the first reader that answers wins and readers stack (a test that changes the frame calls `resetBlockingHooks()` first). `entryAllowed` is the one filter: the content gate (`contentAllowed`, her own limits) and the frame (`scope: 'dynamic'` needs `play`).
- **R3 — content categories (user).** `contentCategories` has 13 new ids, all off by default: `worship`, `breath_play`, `bodily_fluids`, `watersports` (P15a), `service`, `denial`, `exposure_risk` (P15 / P16), `pet_play`, `objectification`, `deprivation`, `strap`, `her_anatomy`, `feminization` (P17b). `requires?: string[]` on a category: `watersports` needs `bodily_fluids`. `setCategories` closes `requires` to a fixpoint (`withRequirements`) and lists every change in `content_changed`; the toggle of a category whose requirement is off is `aria-disabled` with "needs <label>". P17b's `coercion` is not added.
- **R4 — registries.** Twelve: `worshipTargets`, `blockingPostures`, `blockingAnchors`, `blockingContacts`, `blockingItems`, `blockingActivities`, `momentSources`, `contactPhysics`, `physicsCues`, `stimulusKinds`, `escalationVerbs`, `commanderConditions`. All are in `DESCRIBED_REGISTRIES`; all but `physicsCues` and `escalationVerbs` are `PLAYER_VISIBLE`. The seven that may carry `contentTags` (`worshipTargets`, `blockingContacts`, `blockingItems`, `blockingActivities`, `momentSources`, `contactPhysics`, `stimulusKinds`) are in `CONTENT_GATED_REGISTRIES`, each with a `GATE_PROBES` entry. Anything in a blocking.md "Effects" cell that is not one of the 18 effect types is in `promptHint` or `description`, never a new type. Texts the spec did not give are `AUTHOR TO WRITE`.
- **R5 — effects.** A closed vocabulary (`BlockingEffectSchema`): `camera`, `backdrop`, `pose_shot`, `filter`, `perception`, `input`, `gestures`, `device`, `sensory`, `sound`, `visibility`, `mobility`, `strain`, `escalation`, `physics`, `rule`, `notice`, `status_after`. Readers built: `perception` and `camera pov_dark` → `blocking:pov`; `input` and `mobility` → the `blocking:scene` words; `device` → the tab lock; `sound` → the muffle and the bell; `visibility` → `third_party`; `mobility` → transitions; `escalation` → her answer; `physics` → `startPhysics`; `status_after` → conditions. The visual hints never gate anything.
- **R6 — the blocking state.** `SceneRecord.blocking: Record<unitId | 'commander', Blocking>` with `posture`, `anchor { id, relTo }`, `contact { id, with, direction, target, since }`, `worn` by slot, `activity`, `intimacy`, `note`. A field that is unset is not shown. A contact is stored on the receiver, `with` = the actor, one per receiver; `implies` writes both sides' posture and anchor and keeps the replaced values. Transitions (`transitionProblem`): `mobility none` freezes, `limited` refuses anchors and standing, `crawl` keeps `all_fours`, `follows` allows only relative anchors to her. Every change is validated (entry exists, the gate, the frame, `requires.affordances ⊆ sceneAffordances`, free slots, the person present); extractor changes below 0.6 are dropped. Her activity at scene start comes from the pastime, else `fromActivities` of `scene.activityId`, else unset (`attending`); only the engine and the chips set an activity.
- **R7 — snapshots and the swipe.** Every change to `scene.blocking` or `scene.moments` first pushes a snapshot to `stagingLog` (`at` = chat index; at most `TUNING.blocking.logMax`). The chip, moment and physics actions of the scene screen go through `SceneController.stage(action)`, which keeps `lastApply.after` current so a swipe restores the extraction and the staged changes after it; with no extraction to restore the controller dispatches `blocking/rollback { after }`. **Physics is never rolled back by a swipe while a hold runs**: it keeps every physics state (`DEBUG_NOT_ROLLED_BACK`). A hold that the reading itself ended (`removed`) comes back with the extraction restore when nothing physical happened since; when a segment ran meanwhile the restore fails and only the chips staged after the reply go. A chat switch stops the staging controller's timers and forgets every scene-keyed cache; every dispatch carries `expectChatId`.
- **R8 — `[BLOCKING]` and the directives.** Provider `blocking`, priority 88, `core: true`, only while live: one line per person with a set field (participants, then "The commander"), built from labels and `promptHint`s, never a pronoun for the commander. `blocking:scene` (hard limits from `input` / `mobility`), `blocking:pov`, `blocking:stop`, `moment:<sourceId>` (`next_reply`) and `physics:<physicsId>` / `physics:perception` / `physics:end` are cleared at scene end and on a chat switch.
- **R9 — the extractor.** `IntentExtractInput.staging` (persons, the allowed vocabulary, `ripe`, `open`) is sent only while live: without it the prompt is byte-identical (`tests/fixtures/intent_extract/prompt_without_reading.txt`). The output's optional `staging { blocking, ripe, answer, labels }` is sanitized against the input (unknown ids dropped, at most 4 changes, an answer needs an open moment and confidence ≥ 0.55, exactly three labels of at most 40 characters, `ripe` must be offered) and goes to `intents/apply` as `payload.staging`, applied in the same step. `intent_extract`'s default budget is 700. The labels are part of the `scene.intents` reading, not a site of their own.
- **R10 — moments.** `scene.moments { open?, fired, seen?, lastAnswer? }`; closed `LIVE_KINDS` (`extracted`, `blocking`, `visitor`, `obscured`, `mood_jump`, `weakness`, `asleep`, `alarm`, `keeps_fact`, `physics_warning`, `physics_slip`, `external`); `liveSources` one row per (source, soldier). The pass (`momentPass`) runs after `intents/apply` and `physics/segment_end`, is a no-op unless live, no moment is open and something is live, and only then draws one `chance` and, on a hit, one `int`. Cooldowns by frequency (`minGap`, `maxPerScene`, `sourceGap` 8). `fireMoment` builds the frame's three options plus `lock`, `look`, `ally` where they fit (minus `hide` when a value forbids it), names the exposing element, picks the visitor with `fnv1a` (no draw) and reveals her oldest `keeps` fact for `memory_surfaces`. Her expected option (`expectedOption`, `registerExpectation`) and the gap (`matched` / `partial` / `opposite`) are the engine's own and never reach a reading; an `opposite` answer draws `chance(0.5 × strength)` for the escalation verb. An unanswered moment lapses after 2 passes. In a quiet meeting only the pastime's sources or `generalMeeting` ones are allowed.
- **R11 — escalation verbs.** `ESCALATION_ORDER` (15 verbs, blocking.md §9); the role-reversal verbs go to P17b.
- **R12 — physics.** One run per scene (`scene.physics`), started by `startPhysics`; nothing starts one except setting a contact or an item with `physics` that passes the gates and whose interaction is switched on. Stand-ins: `physicsStyleOf` (`neutral`), `holdsUntilOf` (`signal`); `blackout` is honoured only with `breath_play`, else it acts as `limit`. Turn-based by default (4 beats a segment; a typed message uses up `ceil(chars/40)` beats), real time as a setting (`beatMs` 1500). A segment is planned once (`planSegment`: windows, shifts, attention, cues; her personal rhythm offsets the beats by `fnv1a`), resolved by a pure function with no draw (`resolveSegment`) by the six interaction types (`timing`, `hold`, `decision`, `order`, `passive`, `gesture`), and closed at `physics/segment_end`, which decides her next move and the release by `holdsUntil` and sets the segment `held` until `physics/next_segment`. Two signals: `physics/signal` (the tap, follows `holdsUntil`) and `physics/stop_word` (the player, **always** ends the run and removes its contact or item). A gauge at 0 is a blackout (breath, honoured) or a collapse. Chains (`chains`) open a second physics or extend the hold. The commander's endurance (`Commander.endurance`, thresholds 30 / 80 / 150 / 250 / 400, three routes) and her skills (`Relation.herSkill`, **on the relation, not in P15's `Relation.dynamic`**) grow as specified. The cue pool is one `physics.cues` call per run (quiet site, budget 250) with `physicsCues` as the fallback.
- **R13 — physics depth.** Her gaze (`attentionOf`, relief inputs and the cheat roll), noise (`physics_noise`), combined physics (`second`, the fixed pair rules), the marathon (phases, strategies with one draw per stretch, attrition, the fiction clock, extra slots, `stiff`, `marathon_done`), the stimulus layer (`Commander.stimuli`: tolerance, reflex, the ways, the trajectory with hysteresis, the language of perception, `scentBand`) and the mouth acts (`kiss`, `counted`, `long`, `lick`, `pet`, `mouth`) as in the spec.
- **R14 — settings.** Global: `momentFrequency` (`normal`), `momentExplicit` (`rarer`), `momentChips` (`chips`; UI only), `physicsRealtime` (false), `physicsInteractions` (all true), `marathonPace` (`normal`). SYS › **Scene** is a new section after Conversations; each field has `setting_<key>` in the glossary. The engine reads a campaign mirror (`campaign/set_scene_settings`, synced by `syncSceneSettings`; a campaign that already holds the defaults gets no dispatch).
- **R15 — memory check.** Eleven `memoryRules` rows with resolvers (`moment_weakness`, `moment_question_lie`, `moment_slip_confessed`, `moment_slip_hidden`, `moment_exposed`, `moment_memory`, `physics_blackout`, `physics_limit_broken`, `physics_caught`, `stimulus_craving`, `stimulus_adoring`). Blocking changes, labels, gauges, segments, summaries and cues are bookkeeping; no relation event is added.
- **R16 — events and actions.** Events: `blocking_changed`, `blocking_rolled_back`, `moment_fired`, `moment_answered`, `moment_lapsed`, `moment_escalated`, `physics_started`, `physics_segment`, `physics_signal`, `physics_slip`, `physics_cheat`, `physics_caught`, `physics_noise`, `physics_outcome`, `blackout`, `endurance_gained`, `her_skill_gained`, `marathon_phase`, `marathon_done`, `reflex`, `stimulus_stage_changed`, `condition_set`, `condition_ended`. Actions: `blocking/set`, `blocking/rollback`, `moment/answer`, `physics/{start, next_segment, segment_end, typed, signal, stop_word, skip, stimulus, act, act_finish, wake_seen}`, `campaign/set_scene_settings`. All run during an open scene only, except `physics/wake_seen` and `campaign/set_scene_settings`.

### Rulings made while building

- **The event field `responseType`.** The plan's `moment_answered { …, type, … }` collides with the event's own `type`; the response type is `responseType`. Her expected option is looked for among the frame's three keys only.
- **A source's `sources` weight.** A value's `sources` makes a source live only when the source has the `blocking` kind; for any other kind it makes the source likelier once it is live another way. `ripe` counts only for sources with the `extracted` kind (adds 1, the sum doubles). `exposes: true` on a source (`third_party`, `remote`) names the exposing element.
- **The `lock` and `hide` rules read live kinds, not ids** (`visitor`, not `third_party`). The `exposed` variable of the memory resolver is `type ≠ yielded and key ≠ lock`.
- **Physics starts held.** A run starts `held` with no plan; `physics/next_segment` plans it, so starting draws nothing and `setBlocking` keeps its signature. The physics layer hooks the blocking through `registerAfterChange` and `registerWithdrawal`.
- **`window` is `opening`.** Engine files may not contain the word `window` (`tests/architecture.test.ts`): `PlannedBeat.opening`.
- **Effects are the commander's.** A contact applies to the commander whichever side acts; a soldier carries her own posture, anchor, activity and items. Mobility reads items and the contact only.
- **A blackout takes `extraSlots`** at `scene/end` (never past the end of the day), sets `dizzy` until that day ends and stores `lastWake`; the wake card shows once (`physics/wake_seen`).
- **The marathon's fiction hours** are the same at every pace: a segment's gauge change is scaled by the pace. The clock starts at 08:00 / 13:00 / 18:00 / 22:00 by slot; a slot is 4 fiction hours.
- **Tolerance starts at 20** (AUTHOR TO TUNE), +2 a scene of exposure per kind, −1 per 7 days apart, never below half the best; the trajectory's stage moves one step after three updates that point the same way.
- **Acts are code constants** (`ACT_KINDS`), not a registry. A kiss and the counted ritual draw nothing.
- **The settings entries** for the six moment settings landed with Task 14 (the coverage tests fail the suite otherwise).

### Non-obvious things to know

- **Off is byte-identical.** `tests/blocking/unaffected.test.ts` runs the seeded week of `helpers/unaffectedWeek.ts` against the committed golden `tests/fixtures/unaffected-week.json` (never regenerate it for P15a): the week, with and without every category on, ends with the same events, the same `state.rng` and none of the new keys. A seeded test that moves **stops and reports**.
- **The rng is drawn only while something is live.** A moment pass draws only when live and cooled down; a segment plan draws at `physics/next_segment`; `segment_end` draws the cheat roll and her move. A contact that covers the commander's eyes keeps `sensory` live, so a segment with one draws the moment chance every time: tests that assert "no draw" use `footrest`.
- **The real-time layer never waits for the model.** A segment ends on the clock (real time) or when the beats are used up (turn-based); the next starts when no reply is pending (silent holders never wait). The cue pool is per run, in memory only (lost on reload: the registry stands in).
- **Hers is never read.** Her expected option, her skills, her rhythm, her attention and the segment plan never reach a reading (`tests/analysis/blockingHidden.test.ts` compares two scenes that differ only in them, word for word, and the hidden fixture holds sentinels for the xp, the tolerance, the stimulus share and `herSkill.practice`). The model never receives a line that states the commander's feelings (the physics directive carries perception only).
- **A swipe that rolls the staging log back** restores the blocking and the moments but not the rng; only the controller's own undo of the last extraction (`deps.restore`) rewinds the rng, so only that path re-draws the same moment. A swipe of an older reply, or after chips were staged, re-draws (see the open items).
- **The labels of an open moment arrive with the NEXT reading** (the reading that fired it had no open moment to word); the generic words show in between. A set of labels with a pronoun for the commander is dropped whole.
- **`moments.seen`** is seeded by the first live pass of a scene, so a mood change before it is not a jump. `physicsLive` reads `run.last` (`warning` → `physics_warning`, `slips > 0` → `physics_slip`); the run is gone when a segment ends it, so no moment follows an ending.
- **`blocking:stop`** is set from `physics_outcome stopped` (`applyPhysicsDirectives` in the follow-ups); `moment:` directives are event-driven (a derived `next_reply` directive would come back at every refresh).
- **A new analyze provider** for a bare source needs a `SAMPLE_ADDRESS` entry in `tests/helpers/analyze.ts`. A new gated registry needs a `GATE_PROBES` entry (they use the plain content gate; the probe state has no scene).
- **A chat switch** resets everything keyed by scene id (ids repeat across campaigns).

### Open items

- **A swipe does not rewind the rng** except through the controller's own undo of the last extraction. Decide whether a re-drawn moment after an older swipe is acceptable (it never changes text the player already read).
- **`revealFact` is not undone by a rollback:** a `keeps_fact` moment's fact stays told after a swipe.
- **Nothing plays the `steps` sound yet** (`third_party` was to). `GATE_PROBES` of the seven new registries use the plain gate, not `blockingVocabulary`.
- **The pastime `commanderActivity` ids** (`reading_aloud`, `holding_for_her`…) are dynamic: set only at frame `play`; at `equal` the directive keeps the word.
- **Numbers marked AUTHOR TO TUNE** (tolerance start, the cheat chances, the gap pairs, the marathon attrition) and every `AUTHOR TO WRITE` text are drafts.
- **The in-SillyTavern checklist** `docs/MANUAL_TEST_P15a.md` has not been run by hand.

### Fixed after the whole-branch review (2026-11-21)

An Opus review of the whole branch found one Critical and nine Important issues; each was fixed with a test that failed first. What changed and what to know:

- **A rollback never brings back what was taken away quietly** (C1). `removeSource` (the stop word, the end of a hold), `stripTagged` (a category switched off) and `unsetActivity` also take the value out of every `stagingLog` snapshot (`scrubLog` in `snapshots.ts`). A new quiet removal must call `scrubLog` too.
- **The staging controller's keys carry the scene id** (I1): cue pools, the "asked" set and the scene-end guards are keyed `scene.id|run.id`, because run ids repeat in every scene.
- **`physics/typed`** takes the panel's beat (`panelBeat(host)`) and does nothing in real time (I2). **The stop word and a removed mouth contact end the counted kisses** (I3).
- **Her own limits count** in `actsFor`, `exposedKinds` and a worship target's own gate (I4). **A missed craved stimulus** costs stress only from `missingDays` to `separatedDays` apart and never for a kind whose category is off (I6; `decayStimuli(draft, reg)`).
- **The `moment:` directive** names whose moment it is, the visitor and the fact (I5); `momentSources[].promptHint` is the clause the model gets and the description is the player's. **The perception lines of `stimulusKinds`** are sensation only (I7; a test lists the feeling words that may not appear).
- **A swipe after a physics action** still takes back the chips staged after the reply (I8: `rollbackStaging` is the fallback when the extraction cannot be restored whole). **Real-time Space** is a pair of document listeners per panel host, read at key time and removed with the panel (I9).
- **Second pass (the rest of the review, 2026-11-21):**
  - The marathon's pace scale is applied beat by beat, **before** the clamp, and a catch counts as many catches as the pace's scale stands for (streak and its xp), so a perfectly played marathon gives the same collapses and xp per hold at every pace (`tests/engine/physics/marathon.test.ts`, 40 seeds, three paces). It was applied after the clamp: a short pace collapsed 36 times in 40 where a long one never did, and paid a third of the xp.
  - One input of a kind counts once on a beat (`resolveSegment` dedupes by beat and kind): a fast clicker no longer refills the gauge.
  - The stop word with no hold and no contact takes off everything the commander wears; the panel shows STOP WORD whenever a contact or anything worn holds the commander.
  - `scene/end`: the extra slots are capped by the slots left in the day **before** the scene's own slot is spent (a night or evening hold spends only its own); `scene/start` clears an old `lastWake`.
  - `setCondition` puts its stress through `addCommanderStress` (a `commander_stress_changed` event); a contact set with no target takes the first target the gates allow; the withdrawal looks at the second physics' tags; the physics live kinds (`physics_warning`, `physics_slip`) are live only in the pass after the segment (`liveSources(…, { cause })`).
  - When the blocking stops being live with a hold running (the bond fell below close), the staging controller ends the hold once through `physics/stop_word` instead of dispatching a failing `next_segment` on every tick.
- Not built in play: nothing starts a marathon (`duration`) or a second physics (`second`) except `physics/start` with those fields; a later package (P15 / P16) must offer them.

### Interfaces provided to later packages

The hooks: `registerFrameReader`, `registerBlockingGate`, `registerExpectation`, `registerMomentTrigger`, `registerPhysicsStyle`, `registerHoldsUntil`, `registerAfterChange`. The readers: `blockingOf`, `blockingLive`, `entryAllowed`, `effectsOf(blocking, reg, channel)`, `blockingVocabulary`, `liveSources`, `commanderSkill`, `herSkillOf`, `scentBand`, `conditionsOf`. The actions and events of R16. Details: the **Interfaces already provided by P15a** section of each dependent spec and overview §5.4.
