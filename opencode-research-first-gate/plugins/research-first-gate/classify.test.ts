/**
 * Unit tests for the research-first gate classifier.
 *
 * Run: bun test /home/ubuntu/.config/opencode/plugins/research-first-gate/classify.test.ts
 */

import { describe, expect, test } from "bun:test"
import { isMutatingTool, isResearchTool, normalize, refusalMessage } from "./classify.ts"

describe("normalize", () => {
  test("strips namespaces", () => {
    expect(normalize("aws-mcp.aws___put_object")).toBe("aws___put_object")
    expect(normalize("write")).toBe("write")
    // Underscore-prefixed MCP names are matched against the full name, not the last dot segment.
    expect(normalize("mcp__context7__resolve-library-id")).toBe("mcp__context7__resolve-library-id")
  })
})

describe("isResearchTool", () => {
  const research = [
    "webfetch",
    "websearch",
    "web_fetch",
    "web_search",
    "aws-mcp.search_documentation",
    "aws-mcp.aws___read_documentation",
    "mcp__context7__resolve-library-id",
    "get-library-docs",
    "docs-lookup",
    "exa_search",
    "firecrawl_scrape",
    "tavily_search",
    "perplexity_ask",
    "deepwiki_read",
    "research_topic",
  ]
  for (const name of research) test(`counts ${name}`, () => expect(isResearchTool(name)).toBe(true))

  const notResearch = [
    "read",
    "glob",
    "grep",
    "todo",
    "question",
    "skill",
    "schedule",
    "artifact",
    "image-generate",
    "aws___get_presigned_url",
    "aws___get_tasks",
    "aws___list_regions",
    "cloudflare-api.abuseReports_appeals_eligibility",
    "example_thing",
  ]
  for (const name of notResearch) test(`does not count ${name}`, () => expect(isResearchTool(name)).toBe(false))
})

describe("isMutatingTool — file and orchestration tools", () => {
  const mutating = [
    "write",
    "edit",
    "patch",
    "multiedit",
    "notebookedit",
    "subagent",
    "create_file",
    "supabase.apply_migration",
    "aws-mcp.aws___put_object",
    "aws___create_bucket",
    "dns_records_create",
    "deploy_service",
  ]
  for (const name of mutating) test(`gates ${name}`, () => expect(isMutatingTool(name, {})).toBe(true))

  const readOnly = [
    "read",
    "glob",
    "grep",
    "todo",
    "question",
    "skill",
    "artifact",
    "aws___get_presigned_url",
    "aws___get_tasks",
    "aws___list_regions",
    "cloudflare-api.accounts_list",
    "supabase.list_tables",
    "execute",
  ]
  for (const name of readOnly) test(`allows ${name}`, () => expect(isMutatingTool(name, {})).toBe(false))

  test("allows research tools", () => {
    expect(isMutatingTool("webfetch", { url: "https://x" })).toBe(false)
    expect(isMutatingTool("aws-mcp.search_documentation", {})).toBe(false)
  })
})

describe("isMutatingTool — shell commands", () => {
  const mutating = [
    "rm -rf build",
    "mkdir -p src/x",
    "mv a b",
    "cp a b",
    "touch f",
    "chmod +x s.sh",
    "npm install",
    "npm i react",
    "pnpm add zod",
    "pip install requests",
    "sudo apt-get install -y curl",
    "git commit -m 'x'",
    "git push origin main",
    "echo hi > out.txt",
    "echo hi >> out.txt",
    "sed -i 's/a/b/' f.txt",
    "curl -o f.txt https://example.com",
    "wget -O f.txt https://example.com",
    "npx prettier --write .",
    "docker build .",
    "kubectl apply -f x.yaml",
    "terraform apply",
    "aws s3 rm s3://bucket/key",
    "supabase db push",
  ]
  for (const command of mutating) {
    test(`gates bash: ${command}`, () => expect(isMutatingTool("shell", { command })).toBe(true))
  }

  const readOnly = [
    "ls -la",
    "cat package.json",
    "git status",
    "git diff",
    "git log --oneline -5",
    "git branch --show-current",
    "rg 'foo' src",
    "grep -rn foo .",
    "find . -name '*.ts'",
    "node --version",
    "npm ls",
    "pip list",
    "docker ps",
    "pwd",
    "ls 2>&1",
    "echo hello",
    "wc -l file.txt",
    "which bun",
  ]
  for (const command of readOnly) {
    test(`allows bash: ${command}`, () => expect(isMutatingTool("shell", { command })).toBe(false))
  }

  test("gates an unknown shell tool with no readable command", () => {
    expect(isMutatingTool("bash", {})).toBe(true)
  })
})

describe("refusalMessage", () => {
  test("names the tool and the next step", () => {
    const message = refusalMessage("aws-mcp.aws___put_object", 3)
    expect(message).toContain("aws___put_object")
    expect(message).toContain("websearch")
    expect(message).toContain("3 attempt(s)")
  })

  test("announces fail-open when no attempts remain", () => {
    expect(refusalMessage("write", 0)).toContain("failing open")
  })
})
