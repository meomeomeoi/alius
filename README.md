# Alius

Alius is a SillyTavern extension that turns a group chat into a squad-command RPG: relationships first, turn-based combat second, base management as background. You play a convicted officer given command of a penal squad of off-spec soldiers; the soldiers are your imported character cards.

**Version 0.1.0.** Every package of release 0.1 is implemented (P0–P14b; the table in `docs/00-overview.md` §9). P14c (her life) is implemented on the way to 0.2; the rest of 0.2 and later (P15–P26) are specs only. The lore and many texts are still drafts: entries marked `AUTHOR TO WRITE:` are being written. What each version brought: [`CHANGELOG.md`](CHANGELOG.md).

## Install

1. In SillyTavern open **Extensions** → **Install extension** and paste `https://github.com/meomeomeoi/alius`.
2. Reload the page. **Alius** appears in the wand menu next to the chat input and in the Extensions panel; `Alt+Shift+A` opens it too.

Optional, recommended:
- **Connection Manager** (built into SillyTavern): pick a second, cheaper *mechanic* profile in Alius › SYS for the structured calls (intent extraction, summaries, card import). Without one, those calls fall back to your main model.
- **Expressions**: character sprites in scenes.

## Start

Wand menu → **Alius: New campaign**. The CCP intake form walks you through the starting point, the world parameters (including **content categories**), the commander's file and the import of up to four character cards, each calibrated into a soldier's profile. By default the intake is played in fiction as a prologue (transport, interview, medical exam, the signed dossier) followed by a first patrol; tick **VETERAN INTAKE** for plain forms and no patrol. The campaign lives in the chat's metadata, so each chat is its own campaign; export and import are in SYS.

**Mature content is opt-in.** Every content category is off by default and can be changed per campaign in WORLD PARAMETERS › CONTENT or in SYS; a category that is off is excluded from every generation and every mechanic, and a character's own limits from her card still apply.

## For contributors

Design docs live in `docs/` (start with `docs/README.md`, then `docs/00-overview.md`). Agents working on the code follow `CLAUDE.md`.

```bash
npm install
npm run build      # bundles src/ into dist/index.js and css/ into style.css (both are committed)
npm test           # vitest; also rebuilds dist/index.js and style.css
npm run typecheck  # tsc --noEmit
npm run sim -- --neutrality   # the headless balance harness (docs/BALANCE_REPORT.md)
```

## License

MIT (see `LICENSE`).
