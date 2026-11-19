---
name: pdf-paper-solver
description: Solve any uploaded exam/question-paper PDF (scanned or text) end-to-end and produce a single Obsidian Flavored Markdown solution note with frontmatter, wikilinked answer key, per-question callouts, verified explanations and sources. Use when the user uploads or names a PDF paper and asks to solve it, make an answer key, prepare solutions, or "solve this paper / question paper / previous year paper / model paper".
metadata:
  origin: custom
  version: 1.0.0
---

# PDF Paper Solver → Obsidian Solutions Note

Turn a question-paper PDF into one finished Obsidian note: frontmatter, wikilinked answer key, per-question callouts, web-verified explanations, sources, revision checklist.

**Deliverable is always exactly one `.md` file** plus a `<file>.bak.txt` plain copy.

## Output contract (do not improvise)

The finished note is built by `scripts/assemble.py` from `meta.json` + per-section `parts/*.md`:

| Element | Shape |
|---|---|
| Frontmatter | `title`, `aliases`, `tags` (+ paper properties: `exam`, `institute`, `paper_code`, `total_questions`, `source_pdf`, `status`) |
| Answer key | compact multi-column table, every answer a wikilink: `[[#प्रश्न 48\|**C**]]` (escape `\|` inside tables) |
| TOC | foldable `> [!abstract]- विषय-सूची` with wikilinks to each section heading (headings must not be renamed later or the links break) |
| Per question | `### प्रश्न N` heading → `**प्रश्न:**` verbatim text + options → `> [!success] उत्तर: (X) …` → `**व्याख्या:**` bullets → `> [!warning]- अन्य विकल्प क्यों गलत` (folded) |
| Maths | `**व्याख्या (विधि 1):**` + `> [!tip] सत्यापन (विधि 2)` — two independent methods, always |
| Sources | `> [!cite]` callout with real clickable links |
| Extras | `mermaid` structure diagram, tags per section, `- [ ]` revision checklist, hidden `%% … %%` build note |

Full spec with a worked example: [references/obsidian-output.md](references/obsidian-output.md).
Callout types, wikilink/table escaping and embed syntax: load the `obsidian-markdown` skill.

## Workflow

### 0. Intake
```bash
scripts/render_pages.sh "<paper.pdf>" /tmp/paper/pages 150
```
Also run `pdftotext -layout` into `/tmp/paper/text-dump.txt`. Treat that dump as an **index only** — scanned Adobe Scan PDFs produce garbled text (`प्रश्न` → `F-'ki~R!.a`). Never transcribe question text from it.

Record the work directory:
```
/tmp/paper/
  pages/p-01.png …        rendered page images (authoritative source)
  text-dump.txt           garbled OCR — locator only
  notes.md                running transcription + answers
  parts/part_01.md …      per-section solutions (assembler input)
  meta.json               paper metadata + output path
  crops/                  zoomed crops for unreadable words
```

### 1. Reconnaissance (cheap, before any solving)
Read **page 1 and the last page** as images. Establish: paper name/institute, paper code, date, total questions, total pages, option pattern (e.g. (A)–(D) plus (E) "अनुत्तरित प्रश्न / Question not attempted"), language(s), and the section split (subject + question ranges). Write `meta.json` from `scripts/meta.template.json`.
Confirm question numbering with `grep -c` on the text dump, and pick the section boundaries so that **every question 1..N is covered exactly once**.

### 2. Page-by-page transcription (context-safe)
Read images **one or two at a time**, never a whole paper at once — a bulk read triggers auto-compaction and loses earlier transcriptions. After each batch append to `notes.md`:

```
## Page 11 (Q34–37)
Q34. <verbatim question text + options>  => (D) <answer> [source-domain]
Q36. <verbatim> => TBD
```
Mark unresolved items `TBD`. Rescue unreadable words by cropping at high DPI:
```bash
pdftoppm -f 28 -l 28 -r 400 -png "<paper.pdf>" /tmp/paper/hi28
python3 -c "from PIL import Image; im=Image.open('/tmp/paper/hi28-28.png'); w,h=im.size; im.crop((int(w*0.5),int(h*0.03),int(w*0.66),int(h*0.058))).resize((900,200)).save('/tmp/paper/crops/w.png')"
tesseract /tmp/paper/crops/w.png stdout -l hin --psm 6
```

### 3. Parallel solving with subagents
Split into batches of ~15–20 questions (one batch = one contiguous page range) and launch one `general` subagent per batch, in parallel. Each subagent gets: the page PNG paths, its exact question range, the output format above, the answer key for questions already solved (so it cannot drift), and the instruction to append `N X` lines to `ans.txt`.

Ready-to-paste prompt templates: [references/workflow-detail.md](references/workflow-detail.md).

**Hard rule for every subagent:** before its first file write it must perform its own web lookup — the harness research-first gate blocks mutating calls until the current turn has a successful search/fetch.

### 4. Verification policy (non-negotiable)
- **Maths / reasoning / series** — solve, then **re-verify by a second, different method** (equation ↔ unitary, formula ↔ back-substitution, forward rule ↔ reverse back-calculation). Show both; label the second `सत्यापन (विधि 2)`.
- **GK / history / polity / science / current affairs** — verify against genuine sources, cite the domain in parentheses: official first (PIB, `.gov.in`, museum/university/organiser sites, Transparency International, UNESCO, MyGov), then exam-authoritative (Drishti, Testbook, RajRAS, Wikipedia). **Never answer from memory.**
- **English grammar / नरेशन / voice / संधि-समास** — apply the standard rule and state the rule, then map it to the option.
- **Flag, don't hide:** if two options are equally valid, if the print is a misprint (e.g. `शोल्डर` for `solder`), or if a district list is incomplete, keep the best answer but write the dispute inside the question and list it in the closing note.
- Use elimination logic when the printed key is ambiguous: if 3 of 4 statements are provably true, the remaining one is the answer even if you cannot positively confirm it.

### 5. Assemble
```bash
python3 scripts/assemble.py /tmp/paper/meta.json
```
Produces the final Obsidian note at `meta.output` and a plain `<output>.bak.txt`.

### 6. Validate (must pass before reporting)
```bash
python3 scripts/validate.py "$OUTPUT" <total_questions>
```
It fails on: missing questions, a question whose key letter ≠ its `[!success]` letter, leftover plain `**उत्तर:**` lines, broken TOC wikilinks, or a missing frontmatter block.

### 7. Report
Give the user: output path, `filled/total` answers, section→count table, the list of flagged/low-confidence questions, and the sources relied on. Never claim "all verified" when items are flagged.

## Prerequisites
`poppler-utils` (`pdftoppm`, `pdfinfo`, `pdftotext`), `python3`, optional `tesseract-ocr` + `hin`/`eng` traineddata, optional `PIL` for crops. Check with `command -v pdftoppm pdfinfo tesseract`.

Run it via the `/solve-paper <pdf>` command, or just upload a paper PDF and ask to solve it.

## Pitfalls to avoid
See [references/pitfalls.md](references/pitfalls.md). The five that cost the most:
1. Transcribing from `pdftotext` output instead of the page image.
2. Reading many pages in one tool call → context compaction → lost transcriptions.
3. Letting a subagent write answers from memory (no source domain cited).
4. Keying the answer table from a separate `ans.txt` (drifts) instead of parsing the final section files (single source of truth).
5. Renaming a section heading after generating the TOC, which silently breaks every `[[#…]]` link.
