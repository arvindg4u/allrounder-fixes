---
name: block-pool-bash-outside-studio
enabled: true
event: bash
pattern: (?:(?<![\w$./~:\-}>*])/(?!(?:__POOL_ROOT_RX__|__POOL_ALIAS_RX__)(?:[\s\"\'/;&|)\]]|$))(?!dev/(?:null|zero|stdin|stdout|stderr)(?:[\s\"\'/;&|)\]]|$))(?!proc(?:/|(?:[\s\"\'/;&|)\]]|$)))(?!sys(?:/|(?:[\s\"\'/;&|)\]]|$)))[A-Za-z0-9._~+][A-Za-z0-9._~+/-]*)|(?:(?<![\w$])~[A-Za-z_][\w.-]*)|(?:~/\.\..*)|(?:\$[{]?HOME[}]?/\.\.(?:/|$))|(?:(?:^|[\s;&|(\n]+)(?:builtin\s+)?(?:cd|pushd)\s+(?:\.\.(?:[\s;\'\"/&|)\]]|$)|~/\.\..*|~[A-Za-z_][\w.-]*|/(?!(?:__POOL_ROOT_RX__|__POOL_ALIAS_RX__)(?:[\s\"\'/;&|)\]]|$))[A-Za-z0-9._~+/-]*))|(?:(?:^|[\s;&|(\n]+)\.\.(?:[\s;\'\"/&|)\]]|$))|(?:(?:^|[;&|(\n]+\s*)(?:[A-Za-z_][\w]*=[^\s;&|]+\s+)*(?:sudo|doas)(?![\w-]))
action: block
---

Blocked: this disk sandbox is on a pool machine. Only __POOL_ROOTS__ persists — everything outside will be cleaned after restart.

Detected in your shell command: an absolute path outside the studio, a `cd`/`pushd` escape (`..`, `/`, `/tmp`, `~other`, `~/..`), a `$HOME/..` escape, or `sudo`/`doas` elevation. None of that survives a machine restart, and `sudo` modifies the system image directly.

Redo the command inside the studio directory (e.g. `cd __POOL_ROOT__` first, keep all paths under `~/...`), and never use `sudo` here.
