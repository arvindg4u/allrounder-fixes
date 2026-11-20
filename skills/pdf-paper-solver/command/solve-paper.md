---
description: Solve an uploaded question-paper PDF and build one Obsidian solutions note (answer key + detailed verified solutions)
---

# Solve Paper Command

Solve the question paper in this PDF and produce the finished Obsidian solutions note: $ARGUMENTS

## Your Task

1. **Load the skill** — read `~/.config/opencode/skills/pdf-paper-solver/SKILL.md` and follow its
   workflow exactly; it is the contract for this task. Do not improvise the output shape.
2. **No subagents.** Transcribe and solve the paper yourself, in one session.
3. **Prepare** — `scripts/render_pages.sh "<pdf>" /tmp/paper/pages 150`. The `pdftotext` dump is an
   index only (scanned papers produce garbled text, or no text at all).
4. **Recon** — read page 1 and the last page, one image per tool call. Capture paper name, code,
   total pages, total questions, option pattern, language(s); write `meta.json` from
   `scripts/meta.template.json`; put the recon facts at the top of `notes.md`.
5. **Transcribe — one page per tool call, in order, exactly once each.** After every single page
   read, immediately append that page's verbatim questions to `/tmp/paper/notes.md`. Never read two
   page images in one call, never batch, and never re-read a page later: if a word is unreadable,
   mark it `[?]` or crop just that region at 400 dpi. Watch the running question counter so a
   page-boundary question (stem on one page, options on the next) is captured in the same pass.
6. **Build the bank, then verify it** — `python3 scripts/bank_check.py /tmp/paper/notes.md <total>`.
   Missing or duplicate numbers are fixed in `notes.md`, not by re-reading pages. Solving starts
   only when the bank is complete.
7. **Solve from the bank** (no images) — in bank order, ~15–20 questions per `parts/part_XX.md`:
   GK/current-affairs with a cited web source per fact, maths/reasoning with a second independent
   verification method, grammar with the named rule, and a **standalone**
   `**अन्य विकल्प क्यों गलत:**` heading with one bullet per option.
8. **Assemble** — `python3 scripts/assemble.py /tmp/paper/meta.json` (writes the Obsidian note plus
   a plain `.bak.txt`).
9. **Validate** — `python3 scripts/validate.py "<output>" <total_questions>`; it must print `PASS`.
   Fix and re-run until it does.
10. **Report** — output path, filled/total answers, section-wise counts, flagged/low-confidence
    questions, and the source domains used.

## Hard rules

- **No subagents at any stage.**
- **One page image per tool call, and each page read exactly once** — note it, then move on.
- Never transcribe question text from the garbled `pdftotext` dump.
- Never answer a GK/current-affairs question from memory — cite a source, or flag it.
- Every maths/reasoning answer shows a second, different verification method.
- Do not rename section headings after assembly (it breaks every `[[#…]]` link).
- If the paper's own print is defective (duplicate options, contradictory statements), keep the best
  answer AND explain the defect inside the question.
