# Alius — Defect Catalog (draft, author will tune)

> Becomes `content/core/defects.json`. **Design rule:** a defect changes *how* a unit is played, not *how strong* she is. Net power ≈ neutral. If balance tests show a squad with a defect is consistently stronger or weaker than without, the defect is broken.
>
> At import the mechanic model proposes 2–3 defects from this catalog that fit the card and writes a personal origin line for each; the player picks 1 (optionally 2). Custom defects can be assembled in the editor from existing effect ids. Grunts get a *lite* version (effects only, no arc, no social hooks).

## Structure of a defect

`id, name, category, lore, upside[effects], downside[effects], breakdown (what happens at Stress 100), stressBands (≥50 strained: downside amplified; ≥80 breaking: chance per turn to act on breakdown), socialHooks (relationship/scene triggers), arc { cure, manage, embrace }`.

**Arc** (unlocked by relationship state + medbay level + story): each path is a short multi-step personal quest and a dilemma in itself.
- **Cure** — defect removed. Upside lost too; may change personality notes the model receives ("she feels like a stranger to herself").
- **Manage** — downside reduced, upside kept; requires ongoing upkeep (medbay slot every N days, supplies).
- **Embrace** — upside amplified, downside amplified, breakdown changes into something the squad can use — or fear.

The unit's own values decide which path she *wants*. The commander may push another. That's the point.

---

## NEURAL — mind and firmware

**Echo Bleed** `echo_bleed`
Lore: hears fragments of memories from the implant's previous carriers.
Upside: +scouting (reveals one extra node on expedition maps), occasional insight into enemies. Downside: silence and isolation raise stress; misremembers events as hers.
Breakdown: *Overwritten* — acts as a previous carrier for the rest of the expedition (random skill use, may call the commander by another name).
Social: scenes where she shares a memory that isn't hers; can learn facts about the setting the player shouldn't know.
Arc: Cure = memories gone, scouting gone · Manage = journaling ritual with commander · Embrace = she starts *choosing* echoes to wear.

**Loyalty Imprint Fracture** `imprint_fracture`
Lore: factory loyalty to the corporation is broken.
Upside: Trust gains +50%; immune to enemy-corporate morale effects. Downside: Leash Compel costs double Trust with her and has a chance to fail.
Breakdown: *Unbound* — ignores all orders, fights her own way.
Social: tests the commander constantly; despises corporate talk; values honesty over authority.
Arc: Cure = re-imprinted (to whom? dilemma) · Manage = negotiated "contract" with commander · Embrace = she becomes a free agent who stays by choice — or doesn't.

**Threat Saturation** `threat_saturation`
Lore: threat-detection firmware never turns off. Paranoid.
Upside: never ambushed; reaction shots on enemy entry. Downside: can't benefit from Rest nodes; stress rises in "safe" places and crowded scenes.
Breakdown: *Hostile Read* — attacks the nearest target, ally included, once.
Social: suspects squadmates and the commander; trust is slow but very sticky once earned.
Arc: Cure = calm and dulled · Manage = commander's "all clear" ritual · Embrace = threat map shared with squad.

**Compulsive Protocol** `compulsive_protocol`
Lore: rigid routine loops from training firmware.
Upside: +15% damage and CRIT when she keeps the same row and skill rotation. Downside: plan changes (row swaps, Fall Back, changed loadouts) give stress and −SPD.
Breakdown: *Loop Lock* — repeats her last action regardless of target validity.
Social: needs schedules; reacts badly to the commander being late or breaking routine; values kept promises highly.
Arc: Cure · Manage = shared daily routine · Embrace = perfect drill: the squad syncs to her rhythm.

**Affect Dampener Fault** `affect_dampener`
Lore: emotional regulation is stuck "low".
Upside: stress gains halved. Downside: Affinity and Attraction gains halved; struggles to read others.
Breakdown: *Dissociation* — skips turns, unresponsive.
Social: flat affect; rare, intense breakthroughs when something finally reaches her are relationship milestones.
Arc: Cure = flood of feelings (temporary instability) · Manage = learns with the commander to name emotions · Embrace = perfect calm, unsettling to others.

**Rage Governor Failure** `rage_governor`
Lore: aggression limiter burned out. Short-tempered.
Upside: +ATK scaling with stress (+1% per stress point above 30). Downside: insults, refusals and being ordered back raise stress sharply; chance to ignore Hold the Line.
Breakdown: *Red Out* — attacks the strongest visible target, ignores CP orders.
Social: fights with squadmates and the commander; apologizes badly; values directness.
Arc: Cure · Manage = sparring outlet in Training Yard · Embrace = controlled fury, terrifying.

## SOMATIC — body and the Bloom

**Latent Strain** `latent_strain`
Lore: a suppressed Bloom strain lives in her.
Upside: at Stress ≥ 50, +20% ATK and regeneration. Downside: each breakdown risks *mutation progress* (a hidden clock); supplies-hungry suppressant upkeep.
Breakdown: *Bloom Surge* — massive damage to everyone in her row, allies included; mutation clock +1.
Social: fear of turning; disgust or pity from squadmates; strongly tied to *strain_trade* and *experimentation* crimes.
Arc: Cure = risky treatment (may fail) · Manage = medbay regimen · Embrace = she learns to steer the strain.

**Hunger Loop** `hunger_loop`
Lore: accelerated metabolism.
Upside: heals 5% max HP per turn in combat. Downside: consumes double supplies; supply shortage hits her stress hardest.
Breakdown: *Feeding Frenzy* — attacks enemies regardless of orders, heals per hit.
Social: food is a love language; cooking/meal activities give her extra Affinity.
Arc: Cure · Manage · Embrace = feeds on what she kills (unsettling).

**Pain Inversion** `pain_inversion`
Lore: nociception is inverted or broken.
Upside: +damage while wounded; ignores stun from damage. Downside: hides injuries — injuries she gets last longer and can worsen silently.
Breakdown: *Reckless Advance* — moves to front row and refuses retreat.
Social: worries others; scenes about care and checking on her.
Arc: Cure · Manage = commander checks on her after each expedition · Embrace = a wall that won't fall.

**Graft Rejection** `graft_rejection`
Lore: her body rejects its augments.
Upside: after medbay maintenance, +20% all stats for 3 days. Downside: without maintenance, loses HP max over time.
Breakdown: *Collapse* — falls to 1 HP, out of action for 2 turns.
Social: dependence on the commander's access to the medbay; pride vs need.
Arc: Cure = losing augments (changes role stats) · Manage · Embrace = full organic rebuild (rare, expensive).

## CYBERNETIC — implants and hardware

**Overclock Bias** `overclock_bias`
Lore: cannot run at half power.
Upside: +SPD and ATK. Downside: after combat, *overheat* reduces stats next expedition unless she rests a slot.
Breakdown: *Thermal Runaway* — acts twice, then shuts down for the rest of combat.
Social: restless, never sits still; rest activities with someone raise Affinity more.
Arc: Cure · Manage = cooling mods via Workshop · Embrace = permanent burst mode.

**Sensor Ghosting** `sensor_ghosting`
Lore: optics register false targets.
Upside: +evasion (ghost decoys), detects hidden enemies. Downside: 10% chance per attack to target a ghost (miss).
Breakdown: *Phantom Fire* — shoots at nothing for the rest of the round, stress to allies nearby.
Social: unsure what's real; asks the commander to confirm things; truth matters to her.
Arc: Cure · Manage = calibration sessions · Embrace = she *sees* anomalies others can't.

**Firmware Rollback** `firmware_rollback`
Lore: occasionally reverts to an old firmware with an old personality and old orders.
Upside: unlocks 1 extra skill from her "old profile". Downside: random rollback events: she treats the commander as a stranger for a day.
Breakdown: *Old Orders* — follows her previous commander's directives (which may be hostile).
Social: haunted by who she was; possible link to the commander's crime (*liquidation*).
Arc: Cure = old self deleted · Manage · Embrace = integrates both selves.

**Target Lock Persistence** `target_lock`
Lore: targeting can't release a lock.
Upside: +40% damage vs her current target. Downside: cannot switch target until it dies or 3 turns pass.
Breakdown: *Friendly Lock* — locks onto an ally for one attack.
Social: fixates on goals and people; stubborn.
Arc: Cure · Manage · Embrace = lock persists across expeditions (nemesis enemies).

## DESIRE / BOND — gated by the *Desire/Bond defects* setting

**Imprint Hunger** `imprint_hunger`
Lore: bonding firmware needs regular contact with an imprinted person.
Upside: +stats when the imprinted person is in the same expedition/scene. Downside: deprivation raises stress daily.
Breakdown: *Withdrawal* — ignores orders until she reaches the imprinted person.
Social: imprint target can be the commander or a squadmate; drives night visits.
Arc: Cure · Manage = agreed rituals · Embrace = deep dependency (feeds `dependent` state).

**Possessive Protocol** `possessive_protocol`
Lore: treats one chosen person as "assigned asset".
Upside: protects them automatically (intercepts hits). Downside: jealousy events; Trust/Affinity penalties when the commander favors others.
Breakdown: *Claim* — attacks whoever is near the chosen person.
Social: feeds `obsessed`; conflicts with a second romance.
Arc: Cure · Manage · Embrace.

**Reward Loop Damage** `reward_loop`
Lore: hedonic circuitry stuck open.
Upside: stress relief from pleasurable activities is doubled. Downside: risk-seeking: chooses risky options in events, harder to keep disciplined.
Breakdown: *Binge* — abandons the objective for the nearest reward (loot node, etc.).
Social: flirtatious and impulsive; boundaries are a recurring theme in scenes.
Arc: Cure · Manage · Embrace.

**Compliance Craving** `compliance_craving`
Lore: performs best under strict command; autonomy causes distress.
Upside: orders (CP) on her cost −1. Downside: stress when left without orders or given free choice; Leash usage is *less* damaging to her Trust — which tempts the commander to abuse it.
Breakdown: *Lost* — passes her turns until given an order.
Social: the moral trap is explicit: easy to exploit, harder to help her want things for herself.
Arc: Cure · Manage · Embrace.
