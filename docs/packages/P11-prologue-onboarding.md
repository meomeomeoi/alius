# P11 — Prologue & Onboarding

**Depends on:** P7 (commander profile), P8 (world options), P10 (voices, hub). **Read:** overview; this file; `content/lore.md`.

## Goal

The first 5–15 minutes put the player on rails: character creation happens **inside the world** (intake, medical exam, dossier), the squad is met in person, a short scripted expedition teaches combat and choices, and the PDA unlocks gradually. Afterwards an objective tracker keeps a soft direction.

## 1. Flow

1. **Meta setup (outside fiction):** start/corporation, world options (P8 screen), unit card selection and profile calibration (P1 wizard). Rationale: these are player-level choices; turning them into fiction gains nothing.
2. **Cold open** (`paper` + scene): transport, restraints, the sentence read aloud. Authored text.
3. **Intake interview** (`paper` form + clerk lines): "Article?" → crime; "Name for the record?" → commander name; corporate owner is confirmed (from step 1). Choices fill the same fields as the old wizard.
4. **Medical examination** (`paper` form): the medic dictates descriptors — body stats (pool), expression, seasoning — with live lines like "Build: slight. Write it down." Traits appear as "notes in the file" (choose up to 2 + optional rule trait).
5. **Personnel dossier review** (`paper`): the full commander file with stamps; editable before signing (`[SIGN]`).
6. **Arrival & line-up** (group scene, all imported units): first impressions (P7 presence, tastes). Scene goal directive; capped at ~6 exchanges, then the guide offers to move on.
7. **First words** (one short private exchange per unit, cap 2–3 exchanges each, skippable per unit).
8. **Tutorial expedition**: authored fixed node map (3–4 nodes): one combat with tooltips (rows, CP orders, stress), one event with a mini-dilemma (P6 validator applies), objective node. Text for events is generated from authored directives.
9. **Debrief & first evening**: after-action report, one guided free slot ("someone wants to talk"), first DM from a unit, optional night knock.
10. **Free play** with progressive unlocks.

Every step has `[SKIP]` for repeat players: "Veteran intake" collapses 2–5 into the classic wizard (same fields), and the tutorial expedition can be skipped (the line-up scene stays).

## 2. Data

Registry `prologues` (one per start; shared skeleton allowed via `extends`):

```
{ id, startId, steps: [{
    id, kind: 'paper_form'|'scene'|'expedition'|'dossier'|'guided_slot'|'free',
    voice, authoredText?: string[], directive?: string,
    fields?: ('crime'|'name'|'body'|'expression'|'seasoning'|'traits')[],
    expeditionId?, exchangeCap?, completion: Condition, skippable: boolean }] }
```

Campaign state: `onboarding { prologueId, stepId, completed: string[], skipped: string[], done: boolean }`. Migration: existing campaigns get `done: true`.

## 3. Progressive unlocks

Registry `uiUnlocks`: `{ tab | hubRoom | feature, condition, notice }`. Default: day 1 → SQUAD, COMMS; after tutorial → OPS, MAP; day 2 → BASE, INV; LOG always. Unlocks show a diegetic notice ("MODULE ONLINE: BASE") in the `terminal` voice.

## 4. Objective tracker

Campaign `objectives: [{ id, text, source: 'prologue'|'spine'|'director'|'unit', dueDay?, done }]`, top 1 shown on the hub (P10), the rest in OPS. Prologue steps set objectives; afterwards the director (extend P5 output with `objectiveHint`, ≤ 1 per tick) and spine beats feed it; unit requests (P9 demands, "wants to talk") appear as secondary entries.

## 5. Author content

`content/prologue/<startId>.md` → JSON: cold-open text, clerk and medic lines, dossier template, line-up scene goal, tutorial event directives. Two starts in v1; shared skeleton, different details.

## Acceptance criteria

1. A new campaign runs meta setup → cold open → intake → exam → dossier → line-up → first words → tutorial → debrief → free play; every field matches what the old wizard produced.
2. "Veteran intake" and tutorial skip work; resulting state is equivalent.
3. Exchange caps and scene-goal directives apply in line-up and first-words scenes.
4. Tabs unlock on their conditions with notices; existing campaigns are unaffected.
5. Objective tracker shows prologue objectives, then director/spine hints after the prologue.
6. Both starts have their own prologue built from a shared skeleton.
