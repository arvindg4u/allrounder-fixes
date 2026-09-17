# Pool Sandbox Guard

## Problem

On pool/shared boxes (and throwaway VPS snapshots), only one directory
persists across machine restarts. Anything an agent writes outside it —
`/tmp` downloads, `~/.local` installs, system packages, files under `/etc`
or `/root` — is silently wiped on the next restart, along with the work
that depended on it.

## Root Cause

Agents default to system-wide locations: `pip install` targets global
site-packages, `npm i -g` escapes the project, `apt`/`brew` mutate the
image, and absolute paths like `/tmp/x` feel safe but are ephemeral.
Nothing stops the agent before the write happens.

## Working Fix

Two layers that mirror each other:

- **Claude Code** — 3 hookify rules (`hookify/`) that block tool calls
  before they run:
  - `block-pool-bash-outside-studio` — shell commands touching paths
    outside the persistent root (`cd ..` escapes, `$HOME/..`, `~other`,
    `VAR=/outside` assignments, `sudo`/`doas`).
  - `block-pool-file-outside-studio` — Edit/Write/MultiEdit outside the
    root, including `..` escapes hidden inside root-prefixed paths.
  - `block-pool-nonpersist-install` — installs that never survive reboot
    (`apt`/`yum`/`dnf`/`apk`/`brew`, `npm -g`, system-wide `pip`,
    `cargo`/`go`/`gem` without studio-local homes, prefix-less
    `make`/`cmake`/`meson`/`ninja` installs, `pipx`, `cpan`,
    `systemctl`/`service` changes).
- **OpenCode** — `opencode/pool-sandbox-guard.js` plugin enforcing the same
  boundary on `tool.execute.before`, plus global-install redirection with
  root-local alternatives.
- **Cline** — `cline/pool-sandbox-guard.js` plugin (global
  `~/.cline/plugins/`, auto-discovered for every session) enforcing the same
  boundary via a `beforeTool` hook that returns `{ skip: true }`
  (the same mechanism as Cline's official `env-blocker` /
  `gitignore-read-files-guard` examples), plus `cline/pool-sandbox-guard.md`
  advisory rule installed to `~/.cline/rules/`. Covers Cline's tool ids:
  `read_files`, `editor`, `apply_patch`, `run_commands`, `search_codebase`.

## Install

```bash
git clone https://github.com/arvindg4u/allrounder-fixes.git
cd allrounder-fixes/fixes/pool-sandbox-guard
./install.sh --root /home/deploy/app
```

Pool box with two bind mounts:

```bash
./install.sh --root /teamspace/studios/this_studio --alias /home/zeus/content
```

Options:

- `--target-dir DIR` — where the `.claude/` rules go (default: cwd).
- `--opencode-plugins DIR` — OpenCode plugins dir (default:
  `$OPENCODE_CONFIG_DIR/plugins`, else `~/.config/opencode/plugins`).
- `--alias PATH` — second persistent path (e.g. a bind-mount alias).
- `--cline-plugins DIR` — Cline plugins dir (default: `~/.cline/plugins`
  if it exists, else `$TARGET_DIR/.cline/plugins`; the advisory
  `.md` rule goes to the sibling `rules/` dir).
- `--no-claude` / `--no-opencode` / `--no-cline` — install only some sides.

The installer substitutes your root into the `__POOL_*__` template tokens
and writes `.local.md` copies (the suffix hookify loads; keep it in
`.gitignore`).

## Verify

- Claude Code: run `ls /tmp` in a session — expect a block message naming
  your persistent root. Rules are active immediately, no restart needed.
- OpenCode: reload the client after install, same check.
- Cline: new sessions pick up the global plugin automatically; same check
  (`read_files` on `/etc/hostname`, or `run_commands` with `npm i -g x`,
  must be denied with a persistent-local alternative).
- `pip install requests`, `npm i -g vercel`, `sudo apt update` must all be
  denied with a persistent-local alternative.

## Notes

- Rules assume `$HOME` is inside the persistent root (`~/...` is allowed).
  If your root sits elsewhere (e.g. `/data/work` with HOME=/root), keep
  work under the root.
- Known gaps: `${VAR}`-style indirection (except `$HOME`/`${HOME}`, which
  is covered) and multi-hop `cd` chains resolved only at runtime. The
  OpenCode plugin resolves `cd` targets against the tool cwd, so it
  catches more there.
- The `pipx`/`cargo`/`go`/`gem` conditions assume the tool-home env
  defaults point outside the persistent root. If your root IS `$HOME`,
  those installs persist fine — delete or relax the matching block.
- Uninstall: delete `.claude/hookify.block-pool-*.local.md` and
  `pool-sandbox-guard.js` from the plugins dir. For Cline, also delete
  `~/.cline/plugins/pool-sandbox-guard.js` and
  `~/.cline/rules/pool-sandbox-guard.md`.
