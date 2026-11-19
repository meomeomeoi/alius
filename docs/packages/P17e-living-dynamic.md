# P17e — The Living Dynamic: Tests, Emergent Rituals, Her Weakness, Signature, Address, Feelings

**Status: spec.** Release 0.2 (post-release), after P17d. **Depends on:** P15a (blocking, moments, contact physics), P14b (development, repetition counters, appraisal), P15–P17d, P3b (memory), P10b (handwriting), P14, P7a. **Read:** overview; P14b; P15–P17d; this file.

**Analysis tool (P7a)** and **P14** rules apply.

## Goal

Keep the dynamic alive and personal over months: she tests the commander, the pair's habits turn into rituals by themselves, she is not a machine of power, and the player's own hand, words and feelings enter the fiction.

## 1. Secret tests

A holder may run a **test without warning** (registry `holderTests`, by style and frame): leaves the PDA unlocked to see whether the commander reads it; asks a friend to flirt; says "no protocol today" and watches; leaves a privilege unguarded. The engine knows it is a test; the player does not. The outcome (judged by engine events or `intent_extract`) moves hold and trust; **she reveals the test later** (a scene line, a note), or never, by style.

## 2. Emergent rituals

A practice repeated N times and well received (P14b counters, P16 verdicts) **becomes a ritual by itself**: a name she gives it (generated), a time, a streak, a cost for skipping. Her favourite practices weigh the generator (P16) more. Each pair grows its own traditions; nothing is pre-authored. A ritual that is neglected fades back into a practice.

## 3. Her weakness

After a hard practice, an `affectionate` or `clinical` holder (and others, rarely, by stress and appraisal, P14b) may crack: doubt, "did I go too far?". A short scene beat in which the commander can comfort her (`comforted` intent): roles soften for a moment and return. Outcome: her stress, trust and development (P14b) move; neglecting the moment has its own cost.

## 4. The signature

- At the first signature (a contract, P17a) the player **draws** it with the pointer; it is stored as a point set (the reference).
- Later signatures are compared to the reference with a point-cloud recogniser ($P family: normalised size and position, distance between clouds), plus stroke duration and length: too unlike, too fast or too short = **sloppy**. Deterministic, no model.
- Her reaction by style: `ritual` makes the commander sign again, `playful` laughs, `cold` hands the paper back in silence.

## 5. How you address her

The player chooses the form of address (ma'am, mistress, her name, a nickname, free text); it becomes protocol (P16 rules), checked by `intent_extract`. Changing it is an event she reacts to.

## 6. "What do you feel?"

After strong moments she sometimes asks. The player answers in free text; the answer is stored as a memory fact (P3b, the commander's words) and she may bring it back later ("you said you were afraid"). The commander's inner life is the player's to write; the world reacts to it (consistent with P15's ruling: no engine meter for the commander's state).

## Depth revision (design session 2026-11-19)

Added after the 0.2 depth review; built on P15a (blocking, moments, contact physics). Where it conflicts with the sections above, this section wins.

- **Habits of the pair** (general to every close relation, not only holders): practices and small acts repeated and well received turn into habits by themselves (P14b counters): she always sits on the left, the morning coffee is the commander's, her phrase before a sortie. Others notice them; breaking one hurts (a small cost and her reaction). §2's emergent rituals are the dynamic's subset of habits; nothing is pre-authored and no order is fixed.
- **The litany** (style `ritual`). She writes a formula of worship in her words (generated, P14 site `practice.litany`); the commander recites it by typing (P17c dictation compare). The litany **grows** with the dynamic's milestones (lines are added); a slip in it is a slip.
- **Memory check:** a habit formed or broken → a `memoryRules` entry (audience: the pair; a habit seen by others: those who saw it); the litany's text is not a fact (it lives on the pair, like the contract).

## Acceptance criteria

1. Tests run unseen, resolve, and are revealed by style.
2. Rituals emerge from repetition and verdicts, carry streaks and costs, and fade when neglected.
3. Her weakness appears by style and stress; comforting and neglect both apply.
4. The signature is drawn once and compared deterministically; sloppiness follows the three signals.
5. The chosen address becomes protocol and changes are events.
6. Feeling answers are stored and can be recalled by her.
7. Every element carries `data-analyze`; every generation goes through P14.
