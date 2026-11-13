# P9c — Personal Pressure: Device Access, Bookings, Courtship, Tokens, Secrets, Wagers

**Depends on:** P9b, P9 (demands, Impunity), P3 (relationship graph, facts), P4 (combat engine for sparring), P10 (voices, PDA device). **Read:** overview; this file; P9d §1 (bond profile).

**Analysis tool (P7a):** every new player-facing stat, chip, option and choice card in this package carries `data-analyze`, has a glossary entry or registry `description`, and live values get an analyze provider reading through `Knowledge`.

## Goal

Pressure on the commander from individual units, in everyday life and in his own device: they take over his time, court him, mark him as theirs, keep secrets from him, bet with him for power — and, with enough closeness or impunity, get inside his PDA.

All mechanics here apply only to units whose bond profile allows them (P9d §1); frequencies scale with `squad_assertiveness` (P9b).

## 1. Device access levels (unified)

Per named unit, `deviceAccess ∈ {0,1,2,3,4}`, derived (not stored) from relationship state, Affinity, Impunity and leadStyle (table in registry `deviceAccessRules`):

| Level | Name | What she can do | Typically from |
|---|---|---|---|
| 1 | **Decor** | stickers on the device frame, her photo as wallpaper, renamed contact in COMMS ("★ yours") | `friend`+ / `flirting`+ with leadStyle ≥ balanced |
| 2 | **Notes** | pinned notes on the PDA home (incl. relationship rules from P9d) | `close`/romantic states |
| 3 | **Calendar** | books his slots (§2) | romantic + leadStyle ≥ assertive, or Impunity ≥ 60 |
| 4 | **Messages** | edits his outgoing DMs and cancels his requests before they go out | leadStyle dominant + (romantic or Impunity ≥ 75) |

Level-4 edits: the player's text in the DM input visibly changes before sending; chip `EDITED BY {NAME}` with `[KEEP] [REVERT]`. Revert = defiance toward her (Trust −, Impunity +). Rate-limited (default ≤ 1 per day per unit). Cancelling a request (e.g. a Leash request, a recruit order) uses the same chip.

Removing decor (the player can peel a sticker / change wallpaper) is visible to her: Affinity −, and a scene hook. On a break-up, decor stays as a faded mark for 7 days.

Visuals for levels 1–2 are rendered by P10b; this package provides the data and rules.

## 2. Calendar bookings

Units at access ≥ 3 can book a future slot of the commander ("evening — you're with me"). Bookings appear in the calendar marked with her name and colour. At slot time the booked scene starts unless the player cancels: cancelling = refused demand (P9 refuse deltas, scaled by her Impunity). Two bookings for the same slot → conflict event: choose one (the other gets `rejected_advance`-like deltas) or let them settle it (`attachment`/leadStyle decide; the loser gets stress).

Frequency: ∝ Affinity, Want (P9d) and Impunity; cap per unit per week (default 2).

## 3. Inverted courtship

For units with leadStyle ≥ assertive in romantic-eligible states: character-initiated proposals (P3 §5) get ×2 frequency, and the commander's response options in chips become **accept / deflect / set a condition** (condition = a short free text that becomes a promise in P3). New event `claimed` (she publicly signals he is hers): requires P9d §5 publicity `public` or turns it public; other units react by values and states (jealousy, respect, amusement).

## 4. Tokens

Units can give the commander personal tokens (registry `tokenKinds`: dog tag, patch, ribbon, workshop-made plyx ring, etc., flavoured per unit). Tokens are items with a `worn` flag; up to 2 worn. Worn tokens: visible on the CMDR dossier, in the scene context ("wears Rhea's patch"), and to other units. Effects: giver Affinity + while worn; others' jealousy/respect by state; removing a worn token = event for the giver. Possessive Protocol and Dominance Drive (P9d) amplify all of it.

## 5. Collective secrets

Engine-created facts known to all (or a subset of) the squad and **not** the commander, flagged `squadSecret` with a reason (`protect_him`, `self_interest`, `leader_order`). Sources: events (a unit hid an injury, a deal with traders, who the squad picked as the commander's successor), leader decisions, P12 Debts discovery by a unit that chose to protect him. Directive to present units: "do not reveal X to the commander".

Discovery routes: Insight checks in scenes with low-Trust units, Secret Frequency intercepts (P12), a unit in `open_defiance` or `resentful` letting it slip, night talks at high Affinity. On discovery the commander chooses: confront everyone (squad punishment: Impunity −, Affinity − across the squad), pretend not to know (fact gains `commanderKnowsSecretly`), or use it (leverage in later scenes).

## 6. Wagers

A unit challenges the commander (DM or scene chip), or the commander challenges her. Games (registry `wagerGames`): `coin`, `rps` (rock-paper-scissors), `high_card`, `sparring` (1v1 quick simulation on the P4 engine: commander body stats vs her stats with a handicap table — the commander can win only through the handicap or luck, by design), `expedition_bet` (kills / no-damage / first to the objective, resolved at expedition end).

Stakes (registry `wagerStakes`): a day of obedience (the loser follows the winner's non-combat orders for a day), a slot, a privilege, dropping a pending demand, a token, an answer to one question (truthful; becomes a fact). Stakes respect the content categories of P9d §2 — a stake that touches a disabled category is never offered.

Outcomes apply as engine effects; "a day of obedience" for the commander = his non-combat choices for that day are hers (UI shows her choice pre-selected; overriding = defiance toward her).

## Acceptance criteria

1. Access levels derive from the table; each level unlocks exactly its capabilities; level-4 edits show the chip and respect the rate limit; KEEP/REVERT apply consequences.
2. Bookings appear, start their scenes, can be cancelled with demand-refuse consequences; double booking resolves both ways.
3. Inverted courtship applies only to eligible units; condition becomes a promise; `claimed` makes the relationship public and triggers reactions.
4. Tokens: worn limit, visibility in dossier and context, removal events.
5. Squad secrets: directive keeps them out of replies (fixture test on context), discovery routes fire, all three responses work.
6. Wagers: all five games resolve; sparring uses the P4 engine; stakes never include disabled content categories; a day of obedience pre-selects her choices.
7. Units without a suitable bond profile never use these mechanics (test).
