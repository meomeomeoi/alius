# P25 — Bonds in Progression and the Command Tree

**Status: spec.** Release 0.4 (post-release). **Depends on:** P23, P24, P21 (resonance), P3/P9d (milestones, tiers), P6 (defect arcs), P15 (holder, command domain), P13, P7 (social stats, traits), P2 (train activity), P7a. **Read:** overview; P21; P23; this file; the **Implemented as** of P4, P6, P7 and P15.

**Analysis tool (P7a)** rules apply.

## Goal

Tie growth to who she is and to the relationship with the commander, and give the commander a combat progression of their own.

## 1. Signature growth

- The signature skill gets **3 ranks**. Ranks come from relationship milestones (P3 state changes by tier) and from her defect arc (P6).
- The **final form** depends on the arc's path: Cure, Manage or Embrace each give a different rank-3 version (data per signature template).

## 2. Cross-training

- A unit can learn **1–2 skills of another role** by training (`train` activity) with a companion of that role; progress per session, gated by the companion's relationship tier with the commander (v1 has no NPC↔NPC axes).
- Learned skills use loadout slots like her own.

## 3. The holder and builds

- A holder decides her own specialisation and respecs (P23 §5).
- With the P15 `command` domain she can **influence others' builds**: veto a respec, set rows, demand a specialisation — the P13 override chips (`COMPLY / ARGUE / DEFY`) with her hold in place of the warden's satisfaction.

## 4. The command tree

- A tree for the commander: **new orders**, upgrades of existing ones (cost, effect, a second target), CP rules (start, gain, cap), resonance actions (P21).
- Points from `authority` ranks, **command XP** from fights (orders given, crises survived) and traits (P7).
- **No overdrive for the commander** (author ruling).
- P10: the non-body principle holds; nothing here needs a body stat.

## Acceptance criteria

1. Signature ranks advance from milestones and arcs; final forms follow the arc path.
2. Cross-training teaches off-role skills with the companion gate.
3. Holder rules apply to her own build and, with the command domain, to others'.
4. The command tree unlocks and upgrades orders; points come from the three sources.

## Open decisions (author)

- Rank texts, cross-training lists, the command tree and every number.

## Interfaces already provided by P15 (implemented — use, do not rebuild)

P15 is implemented (see its **Implemented as**: rulings R1–R25). What follows is what exists for this package and what is reserved for it. Every P15 reader answers null, zero or an empty list while the dynamic is off (`dynamicOn`, `herPracticeLive`), and nothing it adds draws from the rng unless someone is eligible: a hook you register must keep a campaign with no dynamic byte-identical (`tests/dynamic/unaffected.test.ts`). Keep new directive ids away from `dynamic:`; read domains by capability, styles, milestones and aftermaths by field, never by id; no text gives the commander a pronoun or a feeling.

- **The command domain's influence on others' builds:** the P13 override chips (`COMPLY` / `ARGUE` / `DEFY`) already work for a holder with `countermand` (`holderSource`, `rollOverrides`, `answerOverride`; COMPLY hold +3 and favour +2, DEFY hold −6 through `overrode_her`, favour −3, the contest at `rule`, no punishment roll). A veto of a respec, a set row or a demanded specialisation is a new order kind at the hook sites; `conflictOf(state, reg, order, judged?, source?)` takes her expectations (`holderAgenda`: her values, plus `keep_me_close` and `no_romance_with_others` for a `possessive` / `obsessive` primary).
- **Read by capability:** `capabilitiesOf`, `hasCapability`, `holderWith(state, reg, 'countermand')`; a kept command after an exit (`command_kept`, her override keeps rolling until the commander wins votes against her, an enforcement of severity at least 3 lands, or the Leash is used on her).
- **Regard and mastery** exist (`Relation.regard`, `Relation.mastery`) for signature growth readings; both are hidden values (sentinels).
