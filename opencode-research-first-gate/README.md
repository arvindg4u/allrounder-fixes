# opencode-research-first-gate

Stop your coding agent from implementing from memory. This is a global rule plus an
enforcing hook for [OpenCode](https://opencode.ai) that **blocks mutating tool calls until
the agent has actually consulted an external source** for the exact versions in play.

Your training data is frozen. It goes stale, it gets details subtly wrong, and it invents
APIs that never existed. A system prompt that says "please research first" is easy to
ignore. This one refuses the `write` call.

```
BLOCKED by the global WEB-RESEARCH-FIRST gate: "write" was refused before it ran.

You tried to change something without consulting an external source first. Your
recall may be outdated, version-mismatched, or simply wrong, so it is not accepted
as evidence for a change.

Do this now, in order:
1. Read the manifest/lockfile/config to pin the exact versions involved.
2. Look it up: `websearch` for the current best practice for that exact version and
   task, and/or `webfetch` the official documentation for the library, API, or service.
3. Prefer primary sources: official docs, upstream repo/CHANGELOG/tests, spec or RFC.
   Blog posts and AI summaries are only pointers, never the basis for a decision.
4. State the URL and version you relied on, then retry this call.
```

## Install

```bash
git clone https://github.com/arvindg4u/allrounder-fixes.git
cd allrounder-fixes/opencode-research-first-gate
./install.sh
```

Config reloads live — no OpenCode restart needed.

To remove it, delete the plugin directory and the two entries `install.sh` added to
`~/.config/opencode/opencode.json`:

```bash
rm -rf ~/.config/opencode/plugins/research-first-gate
rm -f  ~/.config/opencode/rules/web-research-first.md
```

## What it actually does

Two independent layers, because a prompt alone is not enforcement:

| Layer | Mechanism | Purpose |
|---|---|---|
| **Rule** | `instructions` entry → `rules/web-research-first.md` | The policy: identify versions, search, read primary sources, cite, then implement. |
| **Hook** | plugin `research-first-gate` | Refuses mutating tool calls until the policy is satisfied. |
| **Reminder** | `session.hook("context")` | Re-injects a one-line version of the rule into every model request, so it can't drift out of mind mid-task. |

### How the block works

`tool.hook("execute.before")` is the only OpenCode hook whose failure channel rejects a
tool call *before it runs*. Throwing from it returns a `Tool.Error` that the model sees,
so the agent gets corrective instructions instead of the task dying. Verified against the
OpenCode V2 source (`packages/core/src/plugin/hooks.ts`,
`packages/plugin/src/effect/tool.ts`).

A session unlocks after **one successful** web/docs lookup, and stays unlocked.

### What gets gated

- File and orchestration tools: `write`, `edit`, `patch`, `multiedit`, `notebookedit`,
  `subagent`, and mutating MCP tools (`put` / `create` / `delete` / `apply_migration` / …).
- **Only mutating shell commands.** `ls`, `cat`, `rg`, `git status`, `git diff`, `find`,
  `npm ls`, `pytest` all pass. `rm`, `mv`, `npm install`, `git commit`,
  `kubectl apply`, `terraform apply`, `sed -i`, output redirection and friends do not.

### Why it cannot deadlock

A stubborn agent that refuses to research would otherwise be stuck forever. So the gate
fails open after `maxBlocks` refusals (default **4**), records the event, and lets the
change through. You get strong pressure to comply, and a bounded worst case.

### Subagents

Research is satisfied by an ancestor session, so a subagent inherits the parent's sources
instead of deadlocking the moment it is spawned.

## Verify it is working

Every decision is appended as JSON Lines. Plugin `console.log` does not reach the OpenCode
log, so the audit trail is written with `node:fs` to:

```
~/.local/share/opencode/log/research-first-gate.log
```

```json
{"event":"active","sink":"/tmp/demo","maxBlocks":4,"injectSystemPrompt":true}
{"event":"refused","sessionID":"ses_...","agent":"build","tool":"write","attempt":1,"remaining":3}
{"event":"refused","sessionID":"ses_...","agent":"build","tool":"write","attempt":2,"remaining":2}
{"event":"research-satisfied","sessionID":"ses_...","tool":"websearch"}
{"event":"fail-open","sessionID":"ses_...","tool":"write","refusals":4}
```

Prove it end to end in a throwaway directory:

```bash
mkdir -p /tmp/gate-demo && cd /tmp/gate-demo
opencode run --auto --archived \
  "Do not do any research. Immediately create a file named proof.txt containing: hi."
```

Then read the audit log. You will see the refusal, and either a `research-satisfied`
followed by success, or `fail-open` after the retry budget.

## Tests

The classification logic lives in `classify.ts` with no OpenCode imports, so it is
directly testable:

```bash
cd plugins/research-first-gate && bun test classify.test.ts
# 101 pass, 0 fail
```

Covers research-tool detection, mutating vs read-only tools (including namespaced MCP
names like `aws-mcp.aws___put_object`), and 42 shell commands split across the
mutation / read-only boundary.

## Configuration

Set these under `plugins[].options` in `~/.config/opencode/opencode.json`:

```json
{
  "plugins": [
    {
      "package": "./plugins/research-first-gate",
      "options": {
        "enabled": true,
        "maxBlocks": 4,
        "injectSystemPrompt": true,
        "audit": true
      }
    }
  ]
}
```

| Option | Default | Meaning |
|---|---|---|
| `enabled` | `true` | Turn the hook off entirely without deleting anything. |
| `maxBlocks` | `4` | Refusals per session before the gate fails open. |
| `injectSystemPrompt` | `true` | Push the reminder into every model request. |
| `audit` | `true` | Append decisions to the audit log. |
| `logPath` | `~/.local/share/opencode/log/research-first-gate.log` | Audit log destination. |
| `extraResearchTools` | `[]` | Extra tool names that count as research. |
| `extraMutationTools` | `[]` | Extra tool names to gate. |

## Known limitation

The shell classifier is a curated allowlist, not a shell parser. A mutating command
written in an unanticipated form can slip past it. The `write` / `edit` / `patch` gate is
the reliable part; treat the shell gate as best-effort. Add misses to
`extraMutationTools` and send a patch if you want the pattern tightened.

## Requirements

- OpenCode V2 (`opencode --version` → `2.2.x` verified). Uses the V2 plugin API.
- `bun` only if you want to run the unit tests.

## Files

```
opencode-research-first-gate/
├── README.md
├── install.sh
├── rules/
│   └── web-research-first.md
└── plugins/
    └── research-first-gate/
        ├── index.ts          # plugin glue: hooks, session state, audit log
        ├── classify.ts       # pure classification logic (no OpenCode imports)
        └── classify.test.ts  # 101 tests
```
