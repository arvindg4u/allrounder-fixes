/**
 * research-first-gate — global OpenCode V2 plugin.
 *
 * Enforces the global WEB-RESEARCH-FIRST rule: an agent may not make a mutating
 * change (write / edit / patch / mutating shell / subagent / mutating MCP tool)
 * in a session until that session has consulted an external source
 * (web search / web fetch / official-docs lookup) at least once.
 *
 * Mechanism: `tool.hook("execute.before")` is the only hook whose failure channel
 * rejects the tool call before it runs. Throwing from it produces a Tool.Error that
 * the model sees, so the agent is told exactly what to do instead of the task dying.
 *
 * Read-only tools are never blocked, so the agent can always do the research first.
 * The gate is per-session, satisfied by an ancestor (subagent) session's research,
 * and fails open after `maxBlocks` refusals so a task can never deadlock.
 *
 * Every decision is appended to an audit log (JSON Lines) so a block is never silent.
 *
 * Options (set in opencode.json under plugins[].options):
 *   enabled            boolean, default true
 *   maxBlocks          number,  default 4    — refusals per session before failing open
 *   injectSystemPrompt boolean, default true — keep the rule in every model request
 *   audit              boolean, default true — append decisions to the audit log
 *   logPath            string,  default ~/.local/share/opencode/log/research-first-gate.log
 *   extraResearchTools string[] — additional tool names that count as research
 *   extraMutationTools string[] — additional tool names to gate
 */

import { appendFileSync, mkdirSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { Plugin } from "@opencode/plugin"
import { isMutatingTool, isResearchTool, refusalMessage, SYSTEM_REMINDER } from "./classify.ts"

const DEFAULT_LOG_PATH = join(homedir(), ".local", "share", "opencode", "log", "research-first-gate.log")

export default Plugin.define({
  id: "research-first-gate",

  async setup(ctx) {
    const options = ctx.options ?? {}
    const enabled = options.enabled !== false
    const injectSystemPrompt = options.injectSystemPrompt !== false
    const auditEnabled = options.audit !== false
    const maxBlocks = Number.isFinite(options.maxBlocks) ? Number(options.maxBlocks) : 4
    const logPath = typeof options.logPath === "string" && options.logPath.length > 0 ? options.logPath : DEFAULT_LOG_PATH
    const extraResearchTools = Array.isArray(options.extraResearchTools) ? options.extraResearchTools : []
    const extraMutationTools = Array.isArray(options.extraMutationTools) ? options.extraMutationTools : []

    /** Append-only audit trail. Logging must never break enforcement. */
    const audit = (event, detail) => {
      if (!auditEnabled) return
      try {
        mkdirSync(dirname(logPath), { recursive: true })
        appendFileSync(
          logPath,
          `${JSON.stringify({ time: new Date().toISOString(), event, sink: ctx.location?.directory, ...detail })}\n`,
        )
      } catch {
        // A failed write is not a reason to let the change through.
      }
    }

    if (!enabled) {
      audit("disabled", {})
      return
    }

    /** sessionID -> true once an external lookup has succeeded in that session. */
    const researched = new Map()
    /** sessionID -> how many mutations this gate has refused. */
    const refusals = new Map()

    const safe = async (run) => {
      try {
        return await run()
      } catch {
        return undefined
      }
    }

    /** Look for a completed research call already in this session's transcript. */
    const seedFromHistory = async (sessionID) => {
      const messages = await safe(() => ctx.session.context({ sessionID }))
      if (!Array.isArray(messages)) return false
      for (const message of messages) {
        const content = message?.content
        if (!Array.isArray(content)) continue
        for (const part of content) {
          if (part?.type !== "tool") continue
          if (part?.state?.status !== "completed") continue
          if (isResearchTool(part.name, extraResearchTools)) return true
        }
      }
      return false
    }

    /**
     * A session is satisfied by its own research, or by an ancestor session's, so a
     * subagent inherits the parent task's sources instead of deadlocking on spawn.
     */
    const satisfied = async (sessionID) => {
      if (researched.get(sessionID) === true) return true

      let current = sessionID
      for (let depth = 0; depth < 8 && typeof current === "string" && current.length > 0; depth++) {
        if (researched.get(current) === true) {
          researched.set(sessionID, true)
          return true
        }
        const info = await safe(() => ctx.session.get({ sessionID: current }))
        const parent = info?.parentID
        if (typeof parent !== "string" || parent.length === 0 || parent === current) break
        current = parent
      }

      if (await seedFromHistory(sessionID)) {
        researched.set(sessionID, true)
        audit("unlocked-from-transcript", { sessionID })
        return true
      }
      return false
    }

    // ---- record successful research -------------------------------------
    await ctx.tool.hook("execute.after", (event) => {
      if (event.status !== "completed") return
      if (!isResearchTool(event.tool, extraResearchTools)) return
      researched.set(event.sessionID, true)
      refusals.delete(event.sessionID)
      audit("research-satisfied", { sessionID: event.sessionID, tool: event.tool })
    })

    // ---- block mutations until researched ------------------------------
    await ctx.tool.hook("execute.before", async (event) => {
      if (isResearchTool(event.tool, extraResearchTools)) return
      if (!isMutatingTool(event.tool, event.input, extraMutationTools)) return
      if (await satisfied(event.sessionID)) return

      const used = refusals.get(event.sessionID) ?? 0
      if (used >= maxBlocks) {
        audit("fail-open", { sessionID: event.sessionID, tool: event.tool, refusals: used })
        return
      }
      refusals.set(event.sessionID, used + 1)
      audit("refused", {
        sessionID: event.sessionID,
        agent: event.agent,
        tool: event.tool,
        attempt: used + 1,
        remaining: maxBlocks - used - 1,
      })
      throw new Error(refusalMessage(event.tool, maxBlocks - used - 1))
    })

    // ---- keep the rule in front of the model on every request ----------
    if (injectSystemPrompt) {
      await ctx.session.hook("context", (event) => {
        event.system.push({
          type: "text",
          metadata: { source: "research-first-gate" },
          text: SYSTEM_REMINDER,
        })
      })
    }

    audit("active", { maxBlocks, injectSystemPrompt })
    return () => audit("unloaded", {})
  },
})
