# Prologue — placeholder drafts (author will rewrite)

> **DRAFT — author will rewrite.** Every string below is a placeholder written so the engine, the forms and the tests have something to show; the JSON in `content/core/prologues.json` and `uiUnlocks.json` mirrors this file and nothing in code depends on the wording. Rules from `lore.md` §0 hold: **no pronoun for the commander** (write "the commander", "you", or rephrase); the soldiers are "she". Placeholders: `{CORPORATION}`, `{FIELD}`, `{VALUE}`, `{name}`.

## Shared skeleton — `prologue_skeleton`

Used by every start; a start overrides only what its section below lists.

### Cold Open — `cold_open`

_DRAFT — author will rewrite._ kind `paper_form`, completion `manual`.

- **title:** TRANSFER ORDER
- **authoredText:**
  1. The transport has no windows. Restraints hold your wrists to the bench; the guard across from you has stopped looking up.
  1. A speaker reads the sentence aloud: the charge, the article, the reduction offered for every mission survived.
  1. The door opens on the Correctional Command Program outpost. Someone is waiting with a clipboard.

### Intake — `intake`

_DRAFT — author will rewrite._ kind `paper_form`, completion `manual`.

- **title:** INTAKE INTERVIEW
- **lines:**
  - `ask_crime`: Article under which you were convicted?
  - `ask_name`: Name for the record?
  - `confirm_owner`: Your sentence is held by {CORPORATION}. Confirm.

### Exam — `exam`

_DRAFT — author will rewrite._ kind `paper_form`, completion `manual`.

- **title:** MEDICAL EXAMINATION
- **lines:**
  - `intro`: Stand on the mark. Arms out. This will take a minute.
  - `dictate`: {FIELD}: {VALUE}. Write it down.
  - `traits_note`: Notes for the file. Two at most; the file keeps what it is given.

### Dossier — `dossier`

_DRAFT — author will rewrite._ kind `dossier`, completion `manual`.

- **title:** PERSONNEL DOSSIER
- **lines:**
  - `sign_prompt`: Review the file. Once it is signed, the file is filed and you deploy.

### Lineup — `lineup`

_DRAFT — author will rewrite._ kind `scene`, completion `no_open_scene`.

- **title:** LINE-UP
- **objective:** Stand before the squad at the line-up.
- **directive:** This is the first meeting between the commander and the squad, in the garage straight after arrival. Each soldier sizes up the commander in her own way and says so in character; none of them knows yet whether the commander is worth following. Keep it a first meeting: no mission talk, no promises.

### First Words — `first_words`

_DRAFT — author will rewrite._ kind `scene`, completion `all_spoken`.

- **title:** FIRST WORDS
- **objective:** Say a few words to each soldier.
- **directive:** A short private exchange, the first time the commander and this soldier speak alone. She answers as herself and reveals one real thing about her attitude to the commander; keep it brief and leave the rest unsaid.

### Tutorial — `tutorial`

_DRAFT — author will rewrite._ kind `expedition`, completion `tutorial_returned`.

- **title:** SHAKEDOWN PATROL
- **objective:** Take the shakedown patrol out and bring it back.
- **hints** (coach strip, `terminal` voice):
  - `hint_rows` (combat, glossary `rows`): Soldiers fight from the front or the back row. Melee reaches only the front while anyone stands there.
  - `hint_cp` (combat, glossary `cp`): Command Points pay for your orders. You gain one each round; spend them when an order changes the fight.
  - `hint_stress` (expedition, glossary `stress`): Fights and danger raise stress. A strained soldier plays her defects harder, so watch the bars between nodes.

### Debrief — `debrief`

_DRAFT — author will rewrite._ kind `guided_slot`, completion `debriefed`.

- **title:** DEBRIEF
- **objective:** File the after-action report for the patrol.

### First Evening — `first_evening`

_DRAFT — author will rewrite._ kind `guided_slot`, completion `next_day`.

- **title:** FIRST EVENING
- **objective:** Spend the evening with whoever wants to talk.
- **nightKnock:** {name} is at the door, and it is not about duty. (ignored → `dismissed`, minor)

### Free — `free`

_DRAFT — author will rewrite._ kind `free`, completion `manual`.

- **title:** FREE PLAY

## Vesper Somatics — "Seed Stock" — `prologue_vesper`

`startId`: `start_vesper`. Overrides the skeleton for:

### Cold Open — `cold_open`

_DRAFT — author will rewrite._ kind `(inherited)`.

- **authoredText:**
  1. The transport smells of disinfectant and wet concrete. Restraints hold your wrists to the bench, and the guard across from you wears a Vesper Somatics sleeve patch.
  1. A speaker reads the sentence aloud in a pleasant voice: the charge, the article, the reduction offered for every mission survived.
  1. Through the slot of a window the District 7 quarantine wall goes by, green with growth. The Correctional Command Program outpost is the last clean building on the road.
  1. A clerk waits at the gate with a clipboard and a sample case. The case, you are told, is not your concern yet.

### Intake — `intake`

_DRAFT — author will rewrite._ kind `(inherited)`.

- **lines:**
  - `ask_crime`: Article under which Vesper Somatics has convicted you?
  - `ask_name`: Name for the record. The clean kind of record.
  - `confirm_owner`: Your sentence is held by {CORPORATION}, and so is everything you are about to touch. Confirm.

### Lineup — `lineup`

_DRAFT — author will rewrite._ kind `(inherited)`.

- **objective:** Stand before the squad in the garage.
- **directive:** This is the first meeting between the commander and the squad, in the outpost garage, a few streets from the District 7 quarantine wall. Vesper Somatics assigned the unit to secure Bloom samples; the soldiers know they are off-spec assets under a convicted officer, and each says what she makes of that in character. Keep it a first meeting: no mission talk, no promises.

### Tutorial — `tutorial`

_DRAFT — author will rewrite._ kind `(inherited)`.

- **objective:** Walk the quarantine edge and bring the patrol back.

## Kestrel-Ward Industrial — "Quota" — `prologue_kestrel`

`startId`: `start_kestrel`. Overrides the skeleton for:

### Cold Open — `cold_open`

_DRAFT — author will rewrite._ kind `(inherited)`.

- **authoredText:**
  1. The transport is a cargo carrier with benches welded to the floor. Restraints hold your wrists to a rail, and the guard across from you is mouthing numbers at the floor. Quotas, probably.
  1. A speaker reads the sentence aloud, flat as a shift report: the charge, the article, the reduction offered for every mission survived.
  1. Down the carrier ramp the Corridor K-12 mine mouth is a black seam in the hillside, with pylons and floodlights dragged up to it.
  1. A foreman waits at the gate with a clipboard and a clock. The clock, you are told, is already running.

### Intake — `intake`

_DRAFT — author will rewrite._ kind `(inherited)`.

- **lines:**
  - `ask_crime`: Article under which Kestrel-Ward has convicted you?
  - `ask_name`: Name. For the ledger.
  - `confirm_owner`: Your sentence is held by {CORPORATION}. The quota is not negotiable. Confirm.

### Lineup — `lineup`

_DRAFT — author will rewrite._ kind `(inherited)`.

- **objective:** Stand before the squad in the garage.
- **directive:** This is the first meeting between the commander and the squad, in the outpost garage beside the Corridor K-12 mine road. Kestrel-Ward has set a quota deadline; the soldiers know they are expendable off-spec assets under a convicted officer, and each says what she makes of that in character. Keep it a first meeting: no mission talk, no promises.

### Tutorial — `tutorial`

_DRAFT — author will rewrite._ kind `(inherited)`.

- **objective:** Walk the corridor mouth and bring the patrol back.

## UI unlock notices (`uiUnlocks.json`)

_DRAFT — author will rewrite._ Diegetic `terminal`-voice lines shown once when a PDA tab opens.

- `squad` (minDay 1): MODULE ONLINE: SQUAD
- `comms` (minDay 1): MODULE ONLINE: COMMS
- `ops` (afterStep tutorial): MODULE ONLINE: OPS
- `map` (afterStep tutorial): MODULE ONLINE: MAP
- `base` (minDay 2): MODULE ONLINE: BASE
- `inv` (minDay 2): MODULE ONLINE: INV

## Tutorial content (`missionTemplates.json`, `dilemmaTemplates.json`)

_DRAFT — author will rewrite._ See `tutorial_patrol` and `evt_tutorial_choice` in the core pack; the event brief is the authored directive the mechanic model writes the dilemma from.

## Head start (P11b)

_DRAFT — author will rewrite._ Texts of a campaign that begins as if the commander had already been at the base. Everything is `AUTHOR TO WRITE`; none gives the commander a pronoun.

- **Day-1 label** (status header): `DAY 1 OF OPERATIONS`.
- **Opening line** (first scene, directive `head_start:known`): `The squad has known the commander for N days: no introductions, no first meeting.` and, for new arrivals, `<Names> arrived today and meet the commander for the first time.`
- **Pending card line:** `The first weeks are being written.`
- **Chronicle fallback:** `AUTHOR TO WRITE: The squad had {days} days with the commander before operations began.`
- **Moments** (`headStartMoments`: description / fallback):
  - `shared_meal` (+): a late meal at the long table, eaten in near silence.
  - `first_argument` (−): an argument in the corridor over a small order.
  - `sparring_bout` (any): a sparring bout the commander only watched.
  - `night_talk` (+, from 7 days): a night she told the commander something she had told no one.
  - `commander_mistake` (−): a mistake that put her in a worse spot than the plan promised.
  - `covered_for_her` (+, from 14 days): a day the commander took the blame for something that was hers.
  - `cold_shoulder` (−): a request she brought and was turned away from without a reason.
  - `learned_the_crime` (needs the crime known): the day she learned what the commander was convicted of.
  - `small_favour` (+): a ration or a spare part that cost the commander something to give.
  - `rule_reminder` (any): a rule set in the first days and kept when it was inconvenient.
- **Open:** the cold open and the intake of the prologue still tell an arrival; with a head start in prologue mode they clash with it.

