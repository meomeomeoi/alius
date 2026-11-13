# P9d — Desire & Bonds: Bond Profile, Content Categories, Lead, Want, Relationship Rules, New Defects, Publicity

**Depends on:** P3 (relationship graph, scenes, intents), P7 (commander), P9 (Impunity, demands), P2 (calendar, night events). **Read:** overview; this file; P3; `content/defects.md` (Desire/Bond category).

Packages P9b and P9c read the bond profile defined here; implement §1 and §2 first.

**Analysis tool (P7a):** every new player-facing stat, chip, option and choice card in this package carries `data-analyze`, has a glossary entry or registry `description`, and live values get an analyze provider reading through `Knowledge`.

## Goal

Make romance, desire and intimacy mechanically meaningful while keeping the player in full control of what content appears: an opt-in content model, a per-unit bond profile so only fitting characters use these mechanics, "who leads" in romantic scenes, desire as a pressure that builds, relationship rules set by leading partners, two new Desire/Bond defects, and public vs private relationships.

Scene content itself stays the main model's job (and the user's preset). This package governs **what may appear**, **who drives**, and **what follows**.

## 1. Bond profile (import extension)

`profile_import` adds (editable in the wizard, "Re-sync from card" supported):

```
Unit.bond {
  leadStyle: 'dominant'|'assertive'|'balanced'|'yielding'
  attachment: 'slow'|'steady'|'intense'|'avoidant'
  desire: 'low'|'medium'|'high'
  caretaker: boolean
  ownLimits: { categories: ContentCategoryId[], note?: string }   // what SHE would not do, from the card
}
```

The profile gates mechanics: Want (§4) only with `desire ≥ medium`; relationship rules (§5) only with `leadStyle ≥ assertive`; P9c bookings/courtship/device access per its tables. A unit with an empty or modest profile simply never uses them.

## 2. Content categories (opt-in)

Registry `contentCategories` (author-editable): e.g. `humiliation`, `public_humiliation`, `degrading_language`, `pain_rough`, `restraint`, `physical_discipline_shown`, `jealousy_games`, `body_modification`, `explicit_scenes` (supersedes the old single "explicit scenes allowed" switch), plus room for more.

- **All categories are off by default.** They are listed explicitly in the setup screen (P8 WORLD PARAMETERS → new section **CONTENT**) with a one-line description each, and in SYS for changes mid-campaign.
- **Enabling a category = the player's full consent** for that content to appear when the story leads there, with no further in-scene confirmation.
- **Disabled = excluded everywhere:** every main-model generation gets a hard exclusion directive listing disabled categories; mechanics never generate rules, demands, wager stakes, bookings or events tagged with a disabled category; `scene_summary`/`intent_extract` flag violations (`content_violation` with category) → the reply is marked in the UI and the player can regenerate.
- Changes mid-campaign apply from the next generation.
- **Characters' own limits** (`bond.ownLimits`) still apply when a category is enabled: she does not do what her card says she wouldn't. Pushing her past them = `rejected_advance` / `decision_violated` with the usual consequences — this protects character integrity, not consent.

## 3. Who leads

In scenes flagged romantic/intimate (scene tag set by state or by `intent_extract`), the engine decides the **lead**: from `leadStyle`, current state, Impunity, Dominance Drive (§6) and recent events. Directive: "{Name} leads this scene." The commander's options remain free text; the UI offers quick chips **follow / ask / set a limit** (a limit here is an in-fiction boundary for this scene, recorded as a fact; it is not the content-category system).

## 4. Want

Per eligible unit, `want ∈ [0, 100]`, rising daily: base by `desire` (medium +4, high +7) × attachment factor (intense ×1.4, avoidant ×0.6), only while in a romantic/`fwb` state or with Attraction ≥ 60 and `attachment ≠ avoidant`. Reduced by intimate scenes, close time together, and by being redirected (a demanding expedition, training together).

Effects by band: ≥ 40 more initiative (DMs, bookings in P9c, night visits via P2 queue); ≥ 70 stress + irritability directive; ≥ 90 Desire/Bond defects may trigger their breakdown behaviour (Imprint Hunger withdrawal, Reward Loop binge). The commander can satisfy, postpone (Affinity − small, patience directive) or redirect.

## 5. Relationship rules

Units with `leadStyle ≥ assertive` in romantic/`fwb`/`close` states can propose rules (registry `relationshipRuleTemplates`, each with tags checked against content categories): "report to me every evening", "nobody else touches your gear", "ask me before taking anyone on a night run", "you don't wear other girls' tokens", etc. The `flavor` call may personalize wording.

Proposal → `[ACCEPT] [NEGOTIATE] [REFUSE]` (negotiate opens a scene; `compromise_reached` sets the agreed version). Accepted rules: shown in her dossier and pinned on the PDA via device access level 2 (P9c); compliance tracked by engine events where possible (tokens, bookings, expedition roster) and by `intent_extract` (`rule_kept` / `rule_broken`) otherwise. Breaking: her Trust/Affinity −, stress +; witnessed breaks spread as facts.

## 6. New Desire/Bond defects (content/defects.md, category Desire/Bond)

- **Dominance Drive** `dominance_drive` — Upside: +damage and +initiative when acting on her own call; bonus when the commander yields decisions to her (endorsed leader, accepted rules, kept wagers). Downside: stress when the commander asserts authority over her (orders, punishments, overruled votes). Breakdown: *Seize Command* — ignores CP orders, issues her own to allies (they may follow). Arc: Cure / Manage (agreed domains of authority) / Embrace (formal co-command).
- **Caretaker Overdrive** `caretaker_overdrive` (requires `bond.caretaker`) — Upside: heals/relieves more when the commander or an ally is injured or stressed; bonus when the commander is frail/slight (P7). Downside: stress when he takes risks; tries to keep him at base. Breakdown: *Smother* — cancels his expedition participation / books his slots to keep him safe (uses P9c). Arc: Cure / Manage / Embrace.

Both follow the defect neutrality rule (balance harness).

## 7. Publicity

Each romantic/`fwb` relation has `publicity: 'secret'|'known'|'public'`, plus each side's preference. Mismatched preferences are a source of scenes and demands. `public` + she leads → other units react by values: some lose respect (their Impunity toward the commander +), some respect the honesty (Trust +), her friends close ranks. Secret relations can be discovered with the P3 secret-romance machinery; `claimed` (P9c) forces `public`.

## Acceptance criteria

1. Bond profile is imported, editable, re-syncable; units without suitable profiles never get Want, rules or P9c mechanics (test).
2. All content categories default off and are listed at setup; enabling/disabling changes the exclusion directive from the next generation; mechanics never produce items tagged with disabled categories (test over all registries); violations are flagged in the UI.
3. Characters' own limits hold even with categories enabled.
4. Lead is decided per scene and injected; chips work.
5. Want rises only under the stated conditions; bands trigger their effects; redirecting lowers it.
6. Rules: proposal, negotiation, compliance tracking and breaking consequences.
7. New defects pass the balance harness neutrality check.
8. Publicity states, preferences and reactions work; `claimed` forces public.
