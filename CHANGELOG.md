# Changelog

All notable changes to Alius are listed here, newest version first. Each version lists what changed for players.

## 0.1.0 — 2026-11-20

The first release. Alius turns a SillyTavern group chat into a squad-command RPG. You play a convicted officer given command of a penal squad of "off-spec" soldiers, bio-engineered women the corporations consider defective. Your imported character cards become the squad. The focus is relationships first, turn-based combat second, and base management in the background.

### Starting a campaign
- **New campaign** from the wand menu. A CCP intake form walks you through the setup step by step.
- **By default the intake is played as a prologue**: transport, an interview, a medical exam and a signed personnel dossier, then a first patrol and a debrief. Tick **Veteran intake** to use plain forms and skip the patrol.
- **Two starting points**, each with its own corporation and story spine: *Seed Stock* (Vesper Somatics) and *Quota* (Kestrel-Ward Industrial).
- **Six crimes** for the commander, each with a perk and a flaw: Asset Liquidation, Data Smuggling, Unsanctioned Experimentation, Sector Purge, Mutiny and Strain Trafficking.
- **A commander file** sets body, build, expression, background and traits. A weaker commander really is weaker, but there is always another route than strength.
- **World parameters** set the tone, how the squad feels about the commander, oversight, Bloom horror, squad votes and more. Four presets are included: Gentle, Standard, Brutal and Assertive squad.
- **Character import**: up to four cards become soldiers. The model proposes each soldier's role, signature skill, defects, values and bond profile, and you confirm or change them.
- **Head start**: begin as if the commander had already been at the base for a week, two weeks or a month. The squad remembers those first weeks.

### The squad
- **Six roles**: Assault, Defender, Sniper, Support, Medic and Specialist, each with a skill tree. There are 12 signature skill templates.
- **Twenty defects**, the malfunctions that put a soldier in the penal program. Each has an upside, a downside, a breakdown and social effects. Many can be cured, managed or embraced through a personal arc at the medbay.
- **Relationships** track Trust, Affinity and Attraction across 20 relationship states, from stranger to devoted, rival or estranged. Each soldier has her own values, likes, dislikes and limits.
- **Character development**: soldiers change over time from what they live through, within the limits of their card. They pick up habits and skills, and you can see what changed since each one joined.

### Scenes and messages
- **Scenes** play in the group chat with the soldiers present. After each exchange the model reads what happened, and the game turns it into relationship changes.
- **Proposals and leads**: in close scenes either side may take the lead, and formal proposals get rule-based answers.
- **PDA messages**: soldiers write to the commander on their own, and the messages behave like a person's: she hesitates, deletes a message, double-texts, writes late at night, sends a voice message or turns curt after a quarrel. Handwritten notes are left in the commander's quarters.
- **Night events**: knocks on the door, confrontations and quiet nights.

### Days, base and economy
- **Days are split into morning, afternoon and evening.** Each slot is spent on one activity: Train, Workshop, Medbay, Work, Scout the net, Rest, Group meal, Study or Talk.
- **A base** with Barracks, Workshop, Medbay, Mess hall and Comms room to upgrade. You manage credits, supplies and PLYX, and grunts fill out the roster.
- **Rations**: when supplies run short, you decide who goes without.

### Missions and combat
- **A world map** with five regions, mission offers from the corporation and side jobs, rumors, and a director that paces the story.
- **Expeditions** are runs across a node map with fights, events and choices on the way.
- **Turn-based combat** with skills, stress, breakdowns, synergies between soldiers, commander orders and AUTO mode. There are 18 enemy types plus affixes, and three difficulty levels.
- **Loot, items and crafting** at the workshop, with levels and skill points.
- **Her call**: in the field a soldier may decide something on her own. You can tell her to ask first.

### Decisions, loyalty and the Leash
- **Dilemmas**: decisions written by the model and checked by the game, with an authored fallback for each.
- **Disloyalty**: a soldier may refuse an order, desert or start a mutiny.
- **The Leash**: the corporate override implant. The commander can only file a request with oversight to compel, suppress or terminate a soldier, and the squad knows who filed it.

### Discipline and the squad's power
- **Impunity and discipline**: how far each soldier thinks she can push the commander, and six punishments with an UNDO. Soldiers can make demands, and the commander earns a reputation and nicknames.
- **Squad power**: optional squad votes (with the option to overrule at a cost), a leader with standing and privileges, how outsiders see the squad, and a scapegoat when a mission goes wrong.
- **Personal pressure**: device access levels, booked time, keepsakes given to the commander, wagers (five games), squad secrets and a day of obedience. Each needs an imported bond profile.

### The commander
- **Traits** with real effects: Insomniac, Old Wound, Silver Tongue, Pretty Face, Bookish, Field Medic, Corporate Polish, Street-Raised and Vow of Distance.
- **Special traits** that work as whole subsystems: Secret Frequency, Bloom-induced Paranoia and Web of Debts.

### LEASHSWAP mode
- **An optional mode in which one soldier, the warden, holds the Leash over the commander.** She has her own agenda and can override the commander's orders; the commander can comply, argue or defy.
- **The warden can punish the commander.**
- **A day can be rewound on death.**
- **The commander can remove her**: through intrigue, by hacking the implant, or by reporting her.

### Memory
- **The squad remembers.** Important events become facts that only the soldiers who were there know, and rumors spread from soldier to soldier.
- **The model is given only what it needs**: a dossier on each soldier, a journal and a chronicle of the campaign, all within a memory budget with presets.
- **A MEMORY view** shows what the squad knows. Old scenes can be hidden from the chat to save context.

### Interface
- **A hub** shows the outpost as a top-down plan: two floors and the roofs, named cabins, who is where, and lighting by time of day.
- **The PDA** is a device in one of three skins. Tabs: HOME, SQUAD, OPS, MAP, COMMS, BASE, INV, LOG and SYS.
- **Scene backdrops** with 14 room styles for soldiers' quarters, dithered portraits, synthesized UI sounds and bundled fonts.
- **Accessibility options**: a readable mode and reduced motion.
- **The analysis tool**: hover, press `?` or long-press almost any stat, chip or option to see what it means and why it has its value. A glossary covers 268 terms.

### Model calls
- **Every model call runs through one envelope.** Failed or refused generations are detected and retried automatically. Where something failed, a chip offers RETRY, and some results can be REROLLed.
- **A second, cheaper mechanic connection profile is optional** (it needs Connection Manager). Without one, the mechanic calls use your main model.

### Content and safety
- **Mature content is opt-in.** Nine content categories are all off by default and can be changed per campaign. A category that is off is excluded from every generation and every mechanic, and a soldier's own limits from her card still apply.
- **The commander may be of any gender.** The game never assigns the commander a pronoun.
- **Nothing is loaded from the network.** Art, fonts and sounds ship with the extension.
- **Campaigns live in the chat's metadata**, one per chat, with export and import in SYS. Saves from another chat file are checked before they are used.

### Known limitations
- **Draft texts remain.** The lore and many texts are still drafts. Lines that start with `AUTHOR TO WRITE:` are placeholders being written and can appear in the game and in the model's instructions.
- **Some defect arcs are missing.** Arc paths that are not written yet are hidden. Possessive Protocol, Reward Loop Damage and Compliance Craving have no arc yet.
- **Balance is still being tuned.** At high mission danger some defects make a soldier stronger in combat than having no defect at all.
