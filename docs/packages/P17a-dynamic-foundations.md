# P17a — Dynamic Foundations: Attitudes, Contracts, Privileges, Inspections, Nights

**Status: spec.** Release 0.2 (post-release), after P17. **Depends on:** P15 (the dynamic), P16 (practices, favour), P17 (stagings), P9c (device access, bookings, tokens, intercepts), P9b (hierarchy), P7 (quiet night), P10 (hub), P10b (handwriting), P14, P7a. **Read:** overview; P15; P16; P17; this file; the **Implemented as** of P9c and P10.

**Analysis tool (P7a)** and **P14** rules as in P15. Direction as in P15: she holds, the commander yields. The commander is always addressed as "you"; no pronoun for the commander anywhere (lore §0).

## Goal

Structures that P15–P17 lack and that later practices lean on: how the women involved see **each other**, a written **contract** for the characters who would write one, **privileges** to earn (the economy so far is mostly punishments), **inspections** of the commander's things, and **nights**.

## 1. Light attitudes between women

v1 has no unit-to-unit axes (overview §2). The dynamic needs a narrow version: several holders, visitors, demonstrations.

- `Relation`-like records **only between units that touched the dynamic**: holders among themselves, and a witness toward the holder she saw. `UnitAttitude { fromId, toId, kind: 'respect' | 'rivalry' | 'alliance' | 'contempt' | 'none', strength: 0..100, since }`.
- Written by engine events only: claims on the same domain (rivalry), a shared demonstration or a lent evening (alliance), a witness's `dislikes` (contempt toward the holder), a holder respecting another's claim (respect). Decays slowly.
- Read by: two holders' conflicts (P15 §5) — allied holders **share** (split time, hand the commander over for an evening), rivals **compete** (bookings, wagers between them through P9c's wager machinery, sabotage); witness reactions in demonstrations and stagings; a P9b standing nudge.
- Not a general NPC↔NPC graph: no axes for women who never touched the dynamic, no scenes between two women without the commander.

## 2. The contract

- **Who writes one:** not everyone. A holder with `leadStyle: dominant` and a style pair containing `ritual`, `cold`, `possessive` or `obsessive`, at frame ≥ `play`. Others never propose it.
- **Content:** clauses from a closed vocabulary, generated in her words (`practice_generate`, `kind: 'contract'`): duties (protocol, routines, reports), prohibitions (others, places, words), rewards (privileges, §3), penalties (her discipline ladder, P16 §4, with a fixed severity per clause), limits (what she promises not to do; recorded as facts the directive enforces), term (until revoked / a date / the vow).
- **Signing** is a scene; `[SIGN] [NEGOTIATE] [REFUSE]`; negotiation changes clauses through `compromise_reached`. A signed contract can be the `play → role` milestone or the vow itself (P15 §4, data decides).
- **Amendments** are proposed by either side and signed again (a scene). **Breaking a clause** costs exactly its stated penalty: no surprise numbers.
- Shown as a paper card in her handwriting (P10b) with both signatures in her dossier and pinned on the PDA (P9c notes).

## 3. Privileges

Registry `privileges` (gated by content where relevant): call her by name, a free evening, own DMs with others, a seat beside her at the mess, a night in her bed, the PDA unlocked, a day without protocol, choosing the next activity, sleeping outside the cage (P17b).

- Granted by her from **favour** (P16 §6), by contract clauses, as rewards for kept tasks and endured practices, or at the commander's request (`[ASK FOR A PRIVILEGE]`: her answer by style, favour and frame).
- Revoked by her discipline or her mood (style). Some are standing (until revoked), some single-use.
- Privileges are read by type by the systems they touch (DMs, scenes, the hub, the calendar).

## 4. Inspections

- A holder with the `device` or `household` domain inspects the commander's quarters, PDA or gear: a booking-like event at her initiative, or a contract duty.
- **What she finds** comes from state: other women's tokens (P9c), DMs to others, a hidden item, a broken rule, compromat about another holder. Each finding is a scene hook and, by style, jealousy, a question, a note, or her discipline.
- The commander may hide things beforehand (a check; caught hiding is worse).

## 5. Nights

- A holder with `private_time` may claim the **night slot**: the commander sleeps in her quarters (hub whereabouts reason `held_night`, derived), other holders' night knocks are intercepted by her, and P7's quiet night reads it (a night with her is not quiet; the cage night, P17b, is quiet but costs stress).
- Night claims count against P9c booking caps unless the domain lifts them.

## 6. Events, actions, directives

Events: `attitude_changed`, `contract_proposed`, `contract_signed`, `contract_amended`, `clause_broken`, `privilege_granted`, `privilege_revoked`, `inspection_started`, `inspection_found`, `night_claimed`. Actions: `contract/answer`, `contract/amend`, `privilege/ask`, `inspection/hide`, `night/answer_claim`. Directives `dynamic:contract:<unitId>`, `dynamic:night:<unitId>`.

## Acceptance criteria

1. Attitudes exist only between dynamic participants, change only from engine events, and steer holder conflicts and witness reactions.
2. Only qualifying holders propose contracts; signing, negotiation, amendments and clause penalties work; the contract can serve as a milestone.
3. Privileges are granted, asked for, revoked and read by type.
4. Inspections find what the state holds; hiding works with its risk.
5. Night claims move whereabouts, intercept knocks and interact with the quiet night.
6. Every element carries `data-analyze`.
