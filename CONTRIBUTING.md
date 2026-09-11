# Contributing to Layer

Thanks for considering it — Layer is a one-person project turned open-source,
so outside eyes and PRs genuinely help.

## Before you start

- **Small fix or bug?** Just open a PR.
- **New widget or bigger feature?** Open an issue first describing what you
  want to build, so we can align on approach before you sink time into it.
  [ROADMAP.md](ROADMAP.md) has ideas already earmarked if you want inspiration
  — anything marked *good first issue* is a solid place to start.

## Building from source

See the [README](README.md#prerequisites) for prerequisites and build steps.

## Code conventions

- **TypeScript** for the frontend, **Rust** for the Tauri backend
  (`src-tauri/`).
- **No hardcoded UI text.** Every user-facing string goes through i18n
  (`src/locales/*.json`) — add your string to `en.json` at minimum; other
  languages fall back to English if untranslated. If you can add translations
  for languages you speak, even better.
- **Every interactive button gets a tooltip** — use the shared `Tooltip`
  component (`src/components/Tooltip.tsx`).
- Match the existing style of whichever file you're editing rather than
  introducing a new pattern — this is a small codebase and consistency matters
  more than any one file being "more correct."
- Keep PRs focused. A bug fix doesn't need a refactor riding along with it.

## Submitting a PR

1. Fork, branch, commit.
2. Make sure `npm run build` (frontend typecheck) and `cargo check`
   (`src-tauri/`) both pass.
3. Describe *what* changed and *why* in the PR description — screenshots or a
   short clip for anything visual.
4. One approval from a maintainer and it's good to merge.

## Reporting bugs / requesting features

Open a [GitHub issue](../../issues). For bugs, include your Windows version,
Layer version (Settings → About), and repro steps. For features, a quick
sketch of the UI (even hand-drawn) helps a lot.

## Reporting a security issue

Please don't open a public issue for a security vulnerability — see
[SECURITY.md](SECURITY.md) instead.
