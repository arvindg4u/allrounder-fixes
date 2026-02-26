---
name: github-save-fix-folder
description: Save a local fix, script, config, or patch into a GitHub repository under a new folder using GitHub MCP. Use when the user asks to "save this fix to GitHub", "create a folder and upload these files", "store this configuration in repo", or similar requests that require packaging local changes into a clean folder structure in a target repository.
---

# GitHub Save Fix Folder

Save requested local files into a target GitHub repository folder with a single commit, then verify the result.

## Required Inputs

Collect these values from the user request or current context:

- GitHub owner (default: authenticated user)
- Repository name (create if missing and user requested)
- Branch (default: `main`)
- New folder path inside repo (for example `kiro-cli-mcp-restore-all`)
- Local file paths to upload
- Commit message

## Workflow

1. Verify GitHub identity using `mcp__github__get_me`.
2. Confirm target repository exists.
If it does not exist and user requested creation, call `mcp__github__create_repository` with the requested privacy setting.
3. Read local files and prepare repo-relative destination paths using this rule:
Destination = `<folder>/<filename or subpath>`.
4. Upload in one commit using `mcp__github__push_files`.
5. Verify commit/folder using `mcp__github__get_file_contents`.
6. Return commit SHA, folder path, and repo URL.

## File Mapping Rules

- Preserve filenames unless user asks to rename.
- Keep related files together in one folder per fix.
- Add a minimal `README.md` in that folder when context is needed to reapply the fix.

## Safety Rules

- Do not overwrite unrelated repository paths.
- Keep changes scoped to the requested new folder.
- If files include secrets/tokens, warn clearly before uploading and proceed only when user explicitly asks.

## Output Format

Return concise deployment details:

- Repository URL
- Branch
- Folder path
- Files uploaded
- Commit SHA
