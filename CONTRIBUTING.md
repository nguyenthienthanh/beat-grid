# Contributing to beat-grid

Small zero-dependency library (pure functions over a `Float32Array`). Issues and pull requests are welcome; the maintainer is Ethan Nguyen.

## Setup

```bash
npm install          # Node >= 18
npm run typecheck    # tsc --noEmit
npm test             # vitest run (npm run test:watch while developing)
npm run build        # tsc -p tsconfig.build.json -> dist/
```

`npm publish` runs `prepublishOnly` (tests + build) first.

## Guidelines

- Keep the package dependency-free: no ffmpeg, no FFT library. A new dependency needs a strong reason.
- Every behaviour change needs a test in `src/` (synthetic click tracks and known tempos are the usual fixtures). Do not add real copyrighted audio.
- Keep the public API in the README in sync with `src/` exports and the stated limits under "Notes and limits".
- Dependency updates arrive through Renovate (`renovate.json`); review and merge them like any other change.

## Secrets

Nothing in this repo needs a key. npm publish tokens live in the maintainer's environment, never in files. Never commit `.env*` or tokens. Maintainer check before pushing:

```bash
~/Projects/Personal/workspace/bin/secrets-scan.sh ~/Projects/Personal/beat-grid
```

## Commits

Small commits on `main` for the maintainer; contributors open a PR from a branch. Message style: `type(scope): what and why` (for example `fix(tempo): handle silence`). Use `git pull --rebase --autostash` if a push is rejected.
