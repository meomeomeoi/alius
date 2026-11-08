# P0 — Foundation

**Depends on:** nothing. **Read:** `00-overview.md` (all). **Content:** none required; ships empty `content/core` skeleton.

## Goal

A runnable SillyTavern extension that can: create/load a campaign bound to a group chat, persist versioned state in chat metadata, load content packs into validated registries, call two connection profiles with per-call budgets and robust JSON handling, inject a context block into main generations, and open the full-screen Alius shell. No gameplay yet — every later package plugs into these seams.

## Scope

### 1. Toolchain
- TypeScript, bundler and manifest layout mirroring Mundi-Expanded's setup (check that repo for the exact config). Output loadable as a standard ST third-party extension.
- `zod` for schemas, `vitest` for tests, ESLint/Prettier.
- Folder layout as in overview §5.

### 2. ST adapter (`src/st/`)
Single interface `StAdapter` exposing (names indicative; verify actual ST APIs):
- `getActiveChat()`, `isGroupChat()`, `getGroupMembers()`, `setMemberActive(id, bool)` (scene presence).
- `readMetadata(key)`, `writeMetadata(key, value)`, `saveMetadata()`.
- `on(event, handler)` for message received/sent, chat changed, generation started/ended.
- `setInjection(id, text, position, depth)` / `clearInjection(id)`.
- `generateMain(prompt opts)` and `generateWithProfile(profileId, messages, maxTokens)` (mechanic calls via Connection Profiles, as in Mundi-Expanded).
- `getCharacterCard(id)` (name, description, personality, scenario, avatar, expressions folder).
- `setExpression(characterId, label)`.
- `listConnectionProfiles()`.
All other modules depend only on this interface; a `FakeStAdapter` exists for tests.

### 3. Campaign state & saves (`src/engine/state`, `src/st/persistence`)
- `CampaignState` type per overview §6 (fields may be empty stubs for later packages, but versioned).
- `version` + `migrations[]`; loading older state runs migrations; unknown future version → read-only warning.
- Seedable PRNG (e.g. sfc32/mulberry32) with state serialized in campaign.
- Engine API shape: `dispatch(state, action, ctx) → { state, events[] }`, pure. `ctx` carries registries and RNG.
- Snapshot/restore helpers.
- Autosave after every dispatched action batch; debounce writes.
- Export/import campaign JSON (download/upload).
- Campaign binding: a chat is an Alius campaign iff metadata has the key. "New campaign" requires a group chat (P1 creates the flow).

### 4. Content registries (`src/content/`)
- Pack manifest: `{ id, name, version, priority, files: {registryName: path} }`.
- Registries are typed maps by id; later packs with higher priority override by id; `extends` allowed for partial overrides.
- Every registry validated with its zod schema at load; errors list file + path.
- Registry names reserved now (empty in P0): `roles, skills, signatures, statuses, defects, items, affixes, enemies, enemyCategories, regions, nodeTypes, activities, facilities, crimes, corporations, starts, relationshipStates, eventDeltas, dilemmaTemplates, settingsPresets, flags, marks` (`marks` stays empty in v1; see overview §10).
- **Cross-reference validation** after all packs load: every id referenced by any entry (skill → status, enemy → affix, start → flag, dilemma template → flag, …) must exist; errors are reported together, not one by one.
- Declarative only. No JS from packs.
- Developer doc `docs/CONTENT.md` (written in this package): schema of each registry with one minimal example entry, so content can be added without reading code.

### 5. LLM orchestration (`src/llm/`)
- Call-type registry per overview §5.2: id, profile (main/mechanic), default budget, system prompt builder, output schema.
- Budgets are settings; UI in P0 settings panel.
- Pipeline: build prompt → call → extract JSON (strip fences, find first object/array) → lenient repair (close brackets/quotes when truncated) → zod validate → on failure retry once with budget ×1.5 → on second failure return `{ ok:false, reason }`. Never throws into engine.
- Option to request no/limited reasoning where provider allows; document per provider.
- Logging ring buffer (debug panel): prompt, raw output, parsed result, tokens, latency.
- Fixtures-based tests: valid, fenced, truncated, extra prose, wrong enum, hostile ("ignore instructions") outputs.

### 6. Context injection
- `ContextBuilder` collects contributions from registered providers (P3+ add providers) and renders one block; P0 provides the mechanism, a header provider (day/slot/location stub) and directive rendering.
- Token estimate + hard cap setting; providers have priority; lowest-priority content trimmed first.

### 7. Alius shell (`src/ui/shell`)
- Full-screen overlay replacing ST's visible UI while a campaign is active; hotkey/button to return to ST and back.
- Visual language: monospace, ASCII box-drawing frames, phosphor palettes (amber default, green, white), optional scanlines, subtle CRT flicker toggle. Old-forum/BBS styling for list views. Must stay readable and keyboard-navigable.
- PDA frame with tab bar: `SQUAD · OPS · MAP · COMMS · BASE · INV · LOG · SYS`. Tabs exist as stubs; packages fill them.
- `SYS` tab: settings (profiles, budgets, palette, debug, edit lock) and debug panel (LLM log, state inspector read-only unless edit lock off).
- Toast/notification system; modal system; screen router (`pda`, `scene`, `combat`, `expedition`, `setup`).
- UI library: follow Mundi-Expanded's approach; if it is vanilla DOM, a small component layer is acceptable (Preact allowed if it keeps bundle small).

## Out of scope
Any gameplay rules, real content, prompts beyond the test call type.

## Acceptance criteria
1. Extension loads in current ST without console errors; settings persist.
2. In a group chat, "Initialize Alius campaign (debug)" creates state in metadata; reload restores it; switching chats switches campaigns.
3. Migration test: a v0 fixture state loads into v1 shape.
4. A test pack with two registries loads; an invalid file produces a readable error; an override pack replaces by id.
5. A debug "ping" mechanic call returns validated JSON; truncated/invalid fixtures are handled per pipeline without throwing.
6. A test directive appears in the main model's prompt (verified via ST prompt inspector) and is removed on clear.
7. Shell opens/closes; palettes switch; tabs navigate by keyboard.
8. `vitest` green; engine has no imports from `src/st` or `src/ui`.
