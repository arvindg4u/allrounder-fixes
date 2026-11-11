/**
 * Pure classification logic for the research-first gate.
 *
 * Deliberately free of OpenCode imports so it can be unit-tested directly.
 */

/** Tools that count as "consulted an authoritative external source". */
const RESEARCH_PATTERNS = [
  /(^|[^a-z])web[_-]?(search|fetch)([^a-z]|$)/,
  /(^|[^a-z])fetch([^a-z]|$)/,
  /(^|[^a-z])browse([^a-z]|$)/,
  /context7/,
  /resolve[_-]?library[_-]?id/,
  /get[_-]?library[_-]?docs/,
  /(search|read)[_-]?documentation/,
  /(search|read)[_-]?docs?([^a-z]|$)/,
  /(^|[^a-z])exa([^a-z]|$)/,
  /firecrawl/,
  /tavily/,
  /perplexity/,
  /deepwiki/,
  /docs[_-]?lookup/,
  /(^|[^a-z])research([^a-z]|$)/,
]

/** Exact mutating tool names (normalised). */
const MUTATION_TOOLS = new Set([
  "write",
  "edit",
  "multiedit",
  "multi_edit",
  "patch",
  "apply_patch",
  "applypatch",
  "notebookedit",
  "notebook_edit",
  "str_replace",
  "str_replace_editor",
  "create_file",
  "delete_file",
  "move_file",
  "rename_file",
  "subagent",
  "task",
  "delegate",
  "deploy",
  "publish",
  "release",
])

/** Verbs that make a tool mutating when they appear as a name segment. */
const MUTATION_VERBS = new Set([
  "write", "edit", "patch", "create", "delete", "remove", "update", "put", "post",
  "set", "insert", "upsert", "drop", "truncate", "apply", "deploy", "publish",
  "release", "start", "stop", "restart", "terminate", "enable", "disable",
  "attach", "detach", "grant", "revoke", "send", "upload", "push", "commit",
  "rollback", "revert", "merge", "move", "rename", "copy", "mkdir", "rmdir",
  "chmod", "chown", "install", "uninstall", "migrate", "import", "restore",
  "sync", "register", "subscribe", "cancel", "kill", "reset", "purge", "destroy",
  "modify", "execute",
])

/** Shell tools. The command string decides whether the call is a mutation. */
const SHELL_TOOLS = new Set([
  "shell",
  "bash",
  "sh",
  "zsh",
  "fish",
  "terminal",
  "run_command",
  "execute_command",
  "exec_command",
])

const MUTATING_SHELL = new RegExp(
  [
    String.raw`(^|[\s;&|(])(rm|rmdir|mv|cp|mkdir|touch|chmod|chown|chgrp|truncate|dd|tee|ln|mkfifo|mknod|patch)(\s|$)`,
    String.raw`\bsed\b[^|;&]*\s-i`,
    String.raw`\bperl\b[^|;&]*\s-i`,
    String.raw`>>?\s*(?!&)\S`,
    String.raw`\b(npm|pnpm|yarn|bun)\s+(i|install|add|remove|rm|uninstall|upgrade|update|link|publish|init)\b`,
    String.raw`\b(pip|pip3)\s+(install|uninstall|upgrade)\b`,
    String.raw`\bpython3?\s+-m\s+pip\s+(install|uninstall|upgrade)\b`,
    String.raw`\b(apt|apt-get|dnf|yum|apk|brew|pacman|snap|choco|winget)\s+(install|remove|purge|upgrade|update|add)\b`,
    String.raw`\bgit\s+(commit|push|pull|checkout|switch|reset|clean|merge|rebase|cherry-pick|stash|apply|am|tag|init|clone|add|rm|mv|restore|revert|fetch)\b`,
    String.raw`\b(docker|podman)\s+(run|build|rm|rmi|stop|start|restart|exec|push|compose)\b`,
    String.raw`\bkubectl\s+(apply|delete|patch|create|replace|edit|scale|rollout|set|drain|cordon)\b`,
    String.raw`\b(systemctl|service|launchctl|pm2)\s+(start|stop|restart|enable|disable|reload|delete)\b`,
    String.raw`\b(terraform|tofu)\s+(apply|destroy|import|taint|state)\b`,
    String.raw`\baws\s+\S+\s+(create|delete|put|update|modify|terminate|start|stop|attach|detach|set)\S*`,
    String.raw`\bsupabase\s+(db|migration|migrations|functions|secrets|projects)\b`,
    String.raw`\b(npx|pnpx)\b`,
    String.raw`\bnode\s+-e\b`,
    String.raw`\bpython3?\s+-c\b`,
    String.raw`\b(curl|wget)\b[^|;&]*\s(-o|-O|--output)\b`,
    String.raw`\b(kill|pkill|killall|reboot|shutdown|mount|umount|useradd|usermod|groupadd|passwd)\b`,
    String.raw`\bmake\s+(install|clean|all)\b`,
  ].join("|"),
  "m",
)

/** `aws-mcp.aws___put_object` -> `aws___put_object`; `write` -> `write`. */
export const normalize = (name) =>
  String(name ?? "")
    .split(/[.:/]/)
    .filter(Boolean)
    .pop()
    ?.toLowerCase() ?? ""

export const segmentsOf = (name) =>
  String(name ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)

export const isResearchTool = (name, extra = []) => {
  const lower = String(name ?? "").toLowerCase()
  if (extra.some((item) => lower === String(item).toLowerCase())) return true
  return RESEARCH_PATTERNS.some((pattern) => pattern.test(lower))
}

export const readShellCommand = (input) => {
  if (!input || typeof input !== "object") return undefined
  for (const key of ["command", "cmd", "script", "code"]) {
    const value = input[key]
    if (typeof value === "string" && value.trim().length > 0) return value
  }
  return undefined
}

/**
 * Index of the first message belonging to the current turn: the last user
 * message. Returns 0 when the transcript has no user message yet, which makes
 * "the current turn" the whole transcript.
 */
export const currentTurnStart = (messages) => {
  if (!Array.isArray(messages)) return 0
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index]?.type === "user") return index
  }
  return 0
}

/**
 * Has an external lookup already completed for the turn being worked on?
 *
 * `wholeSession` widens the window to the entire transcript, for the
 * once-per-session scope. The default is the current turn only, so every new
 * user message re-arms the gate.
 */
export const hasCompletedResearch = (messages, extra = [], wholeSession = false) => {
  if (!Array.isArray(messages)) return false
  const start = wholeSession ? 0 : currentTurnStart(messages)
  for (let index = start; index < messages.length; index++) {
    const content = messages[index]?.content
    if (!Array.isArray(content)) continue
    for (const part of content) {
      if (part?.type !== "tool") continue
      if (part?.state?.status !== "completed") continue
      if (isResearchTool(part.name, extra)) return true
    }
  }
  return false
}

export const isMutatingShellCommand = (command) => MUTATING_SHELL.test(String(command ?? ""))

export const isMutatingTool = (name, input, extra = []) => {
  if (isResearchTool(name, [])) return false
  const normalized = normalize(name)
  const lower = String(name ?? "").toLowerCase()
  if (extra.some((item) => lower === String(item).toLowerCase())) return true

  // `execute` is Code Mode's dispatcher; its inner calls are gated individually, so
  // never gate the dispatcher itself or every tool would become unreachable.
  if (normalized === "execute") return false

  if (SHELL_TOOLS.has(normalized)) {
    const command = readShellCommand(input)
    if (command === undefined) return true
    return isMutatingShellCommand(command)
  }

  if (MUTATION_TOOLS.has(normalized)) return true
  return segmentsOf(name).some((segment) => MUTATION_VERBS.has(segment))
}

export const refusalMessage = (tool, remaining, scope = "turn") => {
  const label = normalize(tool) || String(tool)
  const unit = scope === "session" ? "this session" : "this turn"
  return [
    `BLOCKED by the global WEB-RESEARCH-FIRST gate: "${label}" was refused before it ran.`,
    "",
    "You tried to change something without consulting an external source first. Your",
    "recall may be outdated, version-mismatched, or simply wrong, so it is not accepted",
    "as evidence for a change.",
    "",
    "Do this now, in order:",
    "1. Read the manifest/lockfile/config to pin the exact versions involved.",
    "2. Look it up: `websearch` for the current best practice for that exact version and",
    "   task, and/or `webfetch` the official documentation for the library, API, or service.",
    "3. Prefer primary sources: official docs, upstream repo/CHANGELOG/tests, spec or RFC.",
    "   Blog posts and AI summaries are only pointers, never the basis for a decision.",
    "4. State the URL and version you relied on, then retry this call.",
    "",
    remaining > 0
      ? "Read-only tools (read, glob, grep, webfetch, websearch, docs lookups) work normally. " +
        `The gate re-arms for every turn, so a lookup is required in ${unit} before the next change. ` +
        `${remaining} attempt(s) before the gate fails open.`
      : `The gate is failing open for ${unit} so the task cannot deadlock. The rule still applies.`,
  ].join("\n")
}

export const SYSTEM_REMINDER = [
  "WEB-RESEARCH-FIRST (global rule, mechanically enforced every turn).",
  "Your recall is not evidence. Before any mutating change, pin the exact versions",
  "in play, look up the current best practice in the official docs or upstream",
  "repository for that exact version, cite the URL, and only then implement.",
  "The gate re-arms on every user turn: it rejects write, edit, patch, mutating shell,",
  "subagent, and mutating MCP calls until the current turn performs one successful",
  "web or docs lookup. Research done in an earlier turn does not count.",
].join(" ")
