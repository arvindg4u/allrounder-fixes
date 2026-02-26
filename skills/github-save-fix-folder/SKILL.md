---
name: github-save-fix-folder
description: Save local fixes, configs, scripts, or complete Codex skills into a GitHub repository folder using GitHub MCP. Use when the user asks to save something to GitHub, create a new folder and upload files, or specifically save a skill in the correct skill-folder structure.
---

# GitHub Save Fix Folder

Save requested local files into a target GitHub repository folder with one commit and verify results.

## Required Inputs

Collect these values:

- GitHub owner (default: authenticated user)
- Repository name
- Branch (default: `main`)
- Folder path in repo
- Local file paths to upload
- Commit message

## Modes

### Mode A: General Fix Save

Use for scripts, patches, configs, docs, or mixed files.

Folder rule:
- Destination path is user-defined, for example `fixes/<topic>` or `<new-folder>`.

### Mode B: Skill Save Mode

Use when user says save a skill, update skill in GitHub, or store skill folder.

Folder rules for skills:
- Local skill source: `/root/.codex/skills/<skill-name>/`
- Repo destination root: `skills/<skill-name>/`
- Preserve relative paths under the skill root.

Skill file checklist:
- Required: `SKILL.md`
- Usually required: `agents/openai.yaml`
- Optional when present: `scripts/**`, `references/**`, `assets/**`

## Workflow

1. Verify identity with `mcp__github__get_me`.
2. Ensure target repository exists.
If missing and requested, create with `mcp__github__create_repository`.
3. Detect mode:
- If request references skill save, use Mode B.
- Otherwise use Mode A.
4. If Mode B, validate skill before upload:
- Run `python3 /root/.codex/skills/.system/skill-creator/scripts/quick_validate.py <skill-path>`.
5. Build file mapping:
- General: `<folder>/<filename or subpath>`.
- Skill mode: `skills/<skill-name>/<relative-path-from-local-skill-root>`.
6. Upload in a single commit with `mcp__github__push_files`.
7. Verify folder contents with `mcp__github__get_file_contents`.
8. Return commit SHA and final folder path.

## Safety Rules

- Keep changes scoped to the requested folder only.
- Do not overwrite unrelated repository paths.
- If files contain secrets or tokens, warn clearly before upload and proceed only if user explicitly confirms.

## Output Format

Return:

- Repository URL
- Branch
- Folder path used
- Uploaded files count (and key filenames)
- Commit SHA
