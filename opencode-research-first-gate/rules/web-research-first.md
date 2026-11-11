# RULE: Web-Research-First (Compulsory, Global)

**Applies to: every task, every agent, every session, every project. No exceptions.**

Your training data is frozen. It can be outdated, subtly wrong, version-mismatched, or
simply invented. Therefore you are **forbidden** from implementing changes based only on
what you "remember".

## The mandatory sequence

Before you write, edit, patch, install, configure, deploy, or otherwise change anything:

1. **IDENTIFY** the exact versions and technologies in play.
   Read the manifest / lockfile / config first (`package.json`, `pyproject.toml`,
   `go.mod`, `Cargo.toml`, `pom.xml`, `requirements.txt`, `.nvmrc`, `Dockerfile`, IaC files).
   The version decides which advice is correct — never the reverse.

2. **SEARCH** the web for the current best practice for that exact version and task.
   Use `websearch`/`webfetch` (or a docs/Context7/MCP equivalent).
   Good queries:
   - `<library> <version> <task> best practices`
   - `<library> <version> breaking changes migration`
   - `<service> API <feature> official documentation`
   - `<error message> official docs`

3. **READ a primary source.** Prefer, in order:
   - the official documentation for the exact version
   - the upstream repository (README, CHANGELOG, release notes, tests, source)
   - the specification / RFC / standards body
   Blog posts and AI-generated summaries are **secondary** — acceptable only as a pointer
   to a primary source, never as the basis for a decision.

4. **CITE** what you relied on: the URL and the version. Put it in the response and, when
   the change is non-trivial, in a comment or the commit message.

5. **THEN IMPLEMENT**, following the documented practice — not a remembered one.

## When a lookup is genuinely not needed

Research is still required for *the task*, but the lookup may be short. You may skip
external research **only** when all of these hold:

- the change is purely local and mechanical, e.g. fixing a typo, renaming a symbol,
  reformatting, or moving a file with no behavior change;
- no library, framework, API, service, protocol, or security control is involved;
- you are not choosing between competing approaches.

If you skip, say so explicitly: *"No external research needed: <reason>."*
Silently assuming is a rule violation.

## Never do this

- Invent an API, flag, config key, or import path from memory. Verify it exists.
- Assume a library's current API matches an older tutorial you recall.
- Copy a pattern because it is common. Check whether it is still the recommended one.
- Treat the absence of an error as proof of correctness.
- Present unverified recall with the same confidence as a verified source.

## Precedence

If this rule conflicts with any other instruction, an efficiency preference, or the desire
to answer quickly — **this rule wins**. Correct and sourced beats fast and guessed.

The active enforcement hook blocks mutating tool calls (`write`, `edit`, `patch`, mutating
`shell`, `subagent`) in a session until that session performs a successful web/docs lookup.
Read-only tools always work, so you can always do the research first.
