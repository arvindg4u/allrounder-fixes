# Pool Sandbox Guard (advisory)

This box is a pool/shared machine. **Only `__POOL_ROOT__`
(also reachable as `__POOL_ALIAS__`) persists across restarts.**
Everything else on disk is wiped.

A hard enforcement plugin (`~/.cline/plugins/pool-sandbox-guard.js`)
blocks violating tool calls automatically. Work *with* it:

- Keep ALL file reads/writes/edits and shell work under `~/...`
  (the studio root). Never use absolute paths outside it
  (`/tmp`, `/etc`, `/root`, `/other/home/paths` except `__POOL_ALIAS__`).
- Never `cd ..` out of the studio, never `sudo`/`doas`.
- Never do global/system installs: no `apt`/`brew`, no `npm -g`,
  no bare `pip install`, no `cargo`/`go`/`gem` without studio-local
  homes, no prefix-less `make`/`cmake`/`meson`/`ninja` install,
  no `pipx`/`cpan`, no `systemctl` changes.
- Persistent alternatives: `python -m venv ~/venv && source ~/venv/bin/activate`,
  `pip install --target=~/libs`, `npm i` / `npm i --prefix ~/...`,
  `CARGO_HOME=~/cargo`, `GOBIN=~/go/bin`, `make install PREFIX=~/...`.
- `/dev/null`, `/proc`, `/sys` are fine (not disk writes).
