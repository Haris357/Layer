# Security Policy

## Supported versions

Only the latest released version of Layer is supported. Layer auto-updates in
the background, so most users are on the latest version already.

## Reporting a vulnerability

**Please don't open a public GitHub issue for a security vulnerability.**

Instead, use GitHub's private reporting:
[Security → Report a vulnerability](../../security/advisories/new) on this
repo. If that isn't available for any reason, email
**harisimran7857@gmail.com** with details and, if possible, steps to
reproduce.

We'll acknowledge reports within a few days and aim to ship a fix before any
public disclosure.

## Scope

Layer is a local-first Windows desktop app — it doesn't run a server or store
user data in the cloud. Areas most worth a careful look:

- The Rust/Tauri backend (`src-tauri/src/`) — window/OS-level code, file
  import/export, the screensaver launch path.
- The optional Spaces publish/share feature, which does talk to Firebase.

Widget rendering and canvas/state logic (`src/`) are lower severity by nature
(local UI state), but are still fair game to report if you find something.
