---
description: Solve an uploaded question-paper PDF and build one Obsidian solutions note (answer key + detailed verified solutions)
---

# Solve Paper Command

Solve the question paper in this PDF and produce the finished Obsidian solutions note: $ARGUMENTS

## Your Task

1. **Load the skill** — read `~/.config/opencode/skills/pdf-paper-solver/SKILL.md` and follow its workflow exactly (it is the contract for this task; do not improvise the output shape).
2. **Prepare** — `scripts/render_pages.sh "<pdf>" /tmp/paper/pages 150`; treat the `pdftotext` dump as an index only (scanned papers produce garbled text).
3. **Recon** — read page 1 and the last page as images; capture paper name, code, total pages, total questions, option pattern, section split; write `meta.json` from `scripts/meta.template.json`.
4. **Transcribe + solve** — read page images one or two at a time, appending verbatim questions to `notes.md`; split into ~15–20 question batches and run one `general` subagent per batch in parallel, each getting the page paths, its range, the solution format, and the answers already verified.
5. **Verify** — maths/reasoning by two independent methods; every GK/science/current-affairs answer against genuine web sources with the source domain cited; flag low-confidence or misprinted questions instead of hiding them.
6. **Assemble** — `python3 scripts/assemble.py /tmp/paper/meta.json` (writes the Obsidian note + a plain `.bak.txt`).
7. **Validate** — `python3 scripts/validate.py "<output>" <total_questions>`; it must print `PASS`. Fix and re-run until it does.
8. **Report** — output path, filled/total answers, section-wise counts, flagged questions, and the source domains used.

## Hard rules

- Never transcribe question text from the garbled text dump.
- Never answer a GK/current-affairs question from memory — cite a source, or mark it `TBD` and flag it.
- Every maths/reasoning answer must show a second, different verification method.
- Do not rename section headings after assembly (it breaks the `[[#…]]` links); `validate.py` enforces this.
- If the paper's own print is defective (duplicate options, contradictory statements), keep the best answer AND explain the defect inside the question.
