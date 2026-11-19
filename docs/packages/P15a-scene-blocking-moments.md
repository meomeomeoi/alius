# P15a — Scene Blocking, Moments and Contact Physics

**Status: spec.** Release 0.2 (post-release), **first package of 0.2** (before P15). **Depends on:** P3 (scenes, participants, intents, the scene controller), P3b (memory rules), P7 (commander body, quiet night, non-body routes), P9c (sparring, device access, bookings), P9d (bond profile, content categories, `contentAllowed`, lead), P10 (hub, whereabouts, voices, portraits, `visualFlags`, sound), P10b (VITALS, handwriting, device marks), P14 (generation envelope), P7a. **Read:** overview; this file; P15–P17e (the packages built on it); the **Implemented as** of P3, P3b, P9c, P9d, P10 and P10b; `docs/content/lore.md` (§0); `docs/content/blocking.md` (the vocabulary).

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

Code reads entries by field and effect type, never by id (P10 rule).

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

1. **Gauge** — what drains or fills (air, strength, saturation, cleanliness, her activity's progress, jaw fatigue). It is the physical state of the contact, like Strain, not an inner meter of the commander (P15 ruling holds).
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

A **skill of the commander's body**, common to all holders (P7 "weakness is a playstyle": a weaker commander really endures less). It grows from: experience (each hold endured gives xp per physics); **training at base** (breath drills and similar as a slot activity in the training room, alone or with someone); **the player's mastery** in the moment (a caught window returns more air; a good streak gives xp faster). Skill raises the gauge's capacity; it never removes her rhythm.

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

- **Breath window width by style** (real time, ms; author ruling: narrow on purpose, a cruel window is meant to be hard to catch): `affectionate` 700, `cold` 550 (even, predictable), `ritual` 500 (strictly counted), `clinical` 500 (every 3rd–4th window "measures": half width), `possessive` 450, `playful` 450 (35 % of windows are false: open and shut at once), `cruel` 250, `obsessive` random 200–1000 → **200–700**. Blend of the style pair 0.65 / 0.35, reversed in the phase the secondary leads.
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

## Open decisions (author)

- Every `description`, `promptHint` and fallback frame word. Numbers: drafts agreed in the **TUNING draft** section above; they are balance values, refit after play.
- Which sprites and pose shots to generate for the contacts (to be discussed after the docs; ST's 28 knee-length emotions exist now).

## Interfaces to be provided to P15–P17e

`blockingOf(scene, personId)`, `setBlocking` (validated), `effectsOf(blocking, channel)`, `liveSources`, `fireMoment`, `answerMoment`, `startPhysics` / `physicsInput` / `physicsSignal`, `commanderSkill(physicsId)`, the `[BLOCKING]` provider, snapshots per message id, `worshipTargets`, the local-pack loader.
