# Alius — Roles, Skills, Equipment (draft, author will tune)

> Numbers are starting points for balancing, not final. All of it becomes JSON in `content/core/roles.json`, `skills.json`, `signatures.json`, `items.json`.

## 1. Stats

`HP, ATK, DEF, SPD, CRIT (%)` + `Stress (0–100)`.

Damage: `dmg = ATK × skillMult × 100/(100+DEF) × (crit ? 1.5 : 1) × rand(0.9, 1.1)`, rounded. Stat growth per level = role growth vector. Level caps are raised by **clearance tiers** granted by story/spine beats and facility upgrades: 10 → 20 → 30 → 40 (v1 max 40, configurable). 1 skill point per level; each role tree costs ~66 points in total, so a capped unit owns ~60% of her tree. Respec costs Plyx + credits, scaling with level.

## 2. Roles

| id | Role | Row | Base HP/ATK/DEF/SPD/CRIT | Weapons | Armor | Identity |
|---|---|---|---|---|---|---|
| `assault` | Assault | front | 110/24/12/14/10 | Blade, SMG, Shotgun | Light, Medium | Burst damage, executes |
| `defender` | Defender | front | 150/16/22/9/5 | Shotgun, Heavy, Blade | Medium, Heavy | Guard, taunt, counters |
| `sniper` | Sniper | back | 85/30/8/12/20 | Precision Rifle, Pistol | Light | Single-target, marks, crits |
| `support` | Support | back | 95/16/12/13/8 | Rifle, Pistol, Tech | Light, Medium | Buffs, CP generation, cleanse |
| `medic` | Medic | back | 90/14/12/12/5 | Pistol, Bio | Light | Heal, stress relief, revive (once per combat) |
| `specialist` | Specialist | either | 100/20/12/13/12 | Tech, Bio, Rifle | Light, Medium | Debuffs, DoTs, field control |

Each role tree: 3 branches × ~8 nodes (actives, passives, upgrades), one **ultimate** gated by CP.

Example branches:
- Assault: *Breach* (armor shred), *Momentum* (extra actions on kill), *Bloodline* (lifesteal, self-damage synergies).
- Defender: *Bulwark* (guard/shields), *Retaliation* (counters), *Anchor* (row control, stun).
- Sniper: *Marksman* (crit), *Spotter* (marks for team), *Ghost* (evasion, row-ignoring shots).
- Support: *Command Link* (CP generation, ally SPD), *Overwatch* (reaction shots), *Field Kit* (shields, cleanse).
- Medic: *Triage* (heals), *Sedation* (stress relief, calm breakdowns), *Viral Countermeasures* (cleanse Infect).
- Specialist: *Corrosion* (DEF down, DoT), *Drones* (summons), *Bloom Tech* (risky viral abilities, stress cost).

## 3. Active skill model

Unit has 4 equipped active skills + 1 signature + ultimate. Skill fields: `id, name, roleId, cost {cooldown, cp?, stress?}, usableFrom: ['front'|'back'], targets: {side, rows, count}, effects[] (damage mult, heal, status, stat mod, row swap, stress ±), tags`.

Status effects (v1): `bleed`, `burn`, `stun`, `mark`, `guard`, `taunt`, `corrode` (DEF−), `infect` (stress over time; from mutants), `overheat` (from Cybernetic defects), `shield`.

## 4. Signature skill templates (AI picks + names + flavors, numbers stay)

The mechanic model at import picks 3 templates matching the card; the player chooses one; the model writes `name` + `description` in character voice. Examples:

| template id | Mechanic | Fits characters who are… |
|---|---|---|
| `sig_last_stand` | Below 30% HP: next attack ×2, can't be stunned | stubborn, proud |
| `sig_shared_pain` | Redirect 50% of damage from an ally to self for 2 turns | protective, self-sacrificing |
| `sig_cold_read` | Reveal enemy weakness; team +15% crit vs target | analytical, cold |
| `sig_lullaby` | Remove 15 stress from all allies, self +5 | nurturing, calm |
| `sig_frenzy` | 3 random hits, +5 stress self | wild, impulsive |
| `sig_mock` | Taunt all + enemies −10% ATK | sharp-tongued, theatrical |
| `sig_vanish` | Untargetable 1 turn, next shot crit | evasive, secretive |
| `sig_command_echo` | Repeat the last CP order for free | disciplined, loyal |
| `sig_scavenge` | On kill: extra loot roll | greedy, resourceful |
| `sig_overclock_burst` | Act twice this turn, then skip next | reckless, energetic |
| `sig_spite` | Damage scales with HP missing of allies | vengeful |
| `sig_anchor_words` | Ally in breakdown recovers immediately | empathetic |

## 5. Commander Command Points

CP: start 1 (+crime perks), +1 per round, max 5. CP is spent on orders and ultimates, never on the commander's own "turn" (he has none).

| Order | Cost | Effect |
|---|---|---|
| Focus Fire | 2 | All allies +25% damage vs marked target this round |
| Hold the Line | 2 | Front row +30% DEF, immune to row-shift |
| Fall Back | 1 | Swap a unit's row without using her turn |
| Steady | 1 | −10 stress to one unit |
| Authorize Ultimate | 3 | Unit may use her ultimate this turn |

**Commander Crisis** (not every fight): certain nodes/events expose the commander as a target. A unit must be assigned to cover him; if he is hit, the expedition fails or he gets injured (inflicts Trust/Affinity reactions both ways).

**Relationship synergies** (from P3 states): e.g. `friend`+ pairs unlock *Follow-Up* (ally attacks after a crit), `lover`/`devoted` unlocks *Shield Body* (auto-intercept a lethal hit on the commander), `rival` grants +damage when fighting near the rival.

## 6. Equipment

Slots: **Weapon**, **Upper**, **Lower**. Restricted by role (weapon classes, armor weight). Weight classes affect SPD (Light 0, Medium −1, Heavy −3).

Rarities: `standard` → `refined` → `prototype` → `corporate` → `anomalous`. Higher rarity = more affix slots; `anomalous` items have a drawback affix (Bloom-touched).

Weapon classes: Blade, Pistol, SMG, Rifle, Shotgun, Precision Rifle, Heavy, Tech (drones/emitters), Bio (sera injectors).

Crafting/upgrades use **Plyx** at the Workshop; facility level caps craftable rarity.

## 7. Grunts

Generated: role, level near squad average, one *lite* defect (no arc), ASCII portrait (generated from a seed), designation like `K-117` (optional name via `flavor` call), Trust only. Die permanently on defeat-at-0-HP in a lost combat (configurable chance in won combats).
