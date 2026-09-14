---
name: block-pool-file-outside-studio
enabled: true
event: file
conditions:
  - field: file_path
    operator: regex_match
    pattern: (?:^/(?!(?:__POOL_ROOT_RX__|__POOL_ALIAS_RX__)(?:[\s\"\'/;&|)\]]|$))(?!dev/null(?:[\s\"\'/;&|)\]]|$))(?!proc(?:/|(?:[\s\"\'/;&|)\]]|$)))(?!sys(?:/|(?:[\s\"\'/;&|)\]]|$)))[A-Za-z0-9._~+][A-Za-z0-9._~+/-]*)|(?:^~[A-Za-z_][\w.-]*)|(?:^~/\.\..*)|(?:/(?:__POOL_ROOT_RX__|__POOL_ALIAS_RX__)/\.\.(?:/|$))|(?:/(?:__POOL_ROOT_RX__|__POOL_ALIAS_RX__)/[A-Za-z0-9._~+/-]*?/\.\.(?:/|$))|(?:^\.\.(?:/|$))
action: block
---

Blocked: this disk sandbox is on a pool machine. Only __POOL_ROOTS__ persists — everything outside will be cleaned after restart.

You tried to read, write, or edit a file outside the studio directory (absolute path, `~other/...`, `~/..`, `../`, or a `..` escape hidden inside a studio path). That file will be wiped when the machine restarts, so any work stored there is lost.

Move the file operation inside the studio directory instead.
