# Alius

Alius is a SillyTavern extension that turns a group chat into a squad-command RPG: relationships first, turn-based combat second, base management as background. Design docs live in `docs/`.

## Build and test

```bash
npm install
npm run build      # bundles src/ into dist/index.js and css/ into style.css (both are committed)
npm test           # vitest
npm run typecheck  # tsc --noEmit
```
