# pdf-paper-solver — skill

Solve an exam/question-paper PDF end-to-end and emit **one Obsidian Flavored Markdown note**:
frontmatter, wikilinked answer key, per-question callouts, web-verified explanations,
sources, revision checklist — plus a plain-text copy of the same content.

```
skills/pdf-paper-solver/
├── SKILL.md                    the skill contract (load this first)
├── scripts/
│   ├── render_pages.sh         PDF → page PNGs + garbled-text-layer warning
│   ├── bank_check.py           gate: page-wise transcript complete before solving
│   ├── assemble.py             parts/*.md + meta.json → Obsidian note + plain .bak.txt
│   ├── validate.py             PASS/FAIL gate: gaps, key≠body mismatch, broken wikilinks
│   └── meta.template.json      paper metadata template
├── references/
│   ├── workflow-detail.md      one-page-per-read protocol + bank format
│   ├── pitfalls.md             the failure modes worth avoiding
│   └── obsidian-output.md      output spec, callout mapping, wikilink rules
├── command/solve-paper.md      OpenCode slash command
└── examples/                   two full solved papers (120 questions each)
```

## Two hard rules

1. **No subagents.** The paper is transcribed and solved by the single main agent — delegation
   splits the page images away from the notes and causes re-reads.
2. **One page image = one read.** Read a page, immediately write that page's transcript into
   `notes.md`, then never open that page again. Never two images in one tool call, never a batch.
   Bulk reads trigger auto-compaction and silently drop what you just transcribed.

## Install

```bash
bash install.sh              # copies into $OPENCODE_CONFIG_DIR (default ~/.config/opencode)
bash install.sh --dry-run    # show what would happen
```

Manual install: copy `SKILL.md`, `scripts/`, `references/` into
`<config>/skills/pdf-paper-solver/`, and `command/solve-paper.md` into `<config>/commands/`.

## Use

```
/solve-paper /path/to/paper.pdf
```

or just upload a paper PDF and ask to solve it — the skill description matches
"solve this question paper / model paper / previous year paper".

## Requirements

| Need | Why |
|---|---|
| `poppler-utils` (`pdftoppm`, `pdfinfo`, `pdftotext`) | render pages to images; the text layer of scanned papers is unusable |
| `python3` | `bank_check.py`, `assemble.py`, `validate.py` |
| `tesseract-ocr` (+ `hin`/`eng`) | optional, only to rescue words the scan broke |

## How it works (7 phases)

1. **Intake** — `render_pages.sh` renders every page to PNG at 150 dpi and flags a garbled
   text layer (Adobe Scan). The text dump is used only to locate question numbers/pages; a
   pure scan can dump 0 bytes.
2. **Recon** — read page 1 and the last page, one image per tool call. Capture paper name, code,
   page/question totals, option pattern and languages; write `meta.json`; keep the facts at the
   top of `notes.md`.
3. **Transcribe — the single pass** — pages 1..N strictly in order, **one image per tool call**,
   appending that page's verbatim questions to `notes.md` before reading the next page. Unreadable
   word → `[?]` or a 400-dpi crop of just that region; never re-open the page. Watch the running
   question counter so a page-boundary question is captured while the page is in hand.
4. **Bank check** — `bank_check.py` must print `BANK OK` (per-page counts, missing, duplicates).
   Fixes happen in `notes.md`, never by re-reading pages. **Solving starts only here.**
5. **Solve from the bank** — image-free, in order, ~15–20 questions per `parts/part_XX.md`:
   maths/reasoning by **two independent methods**; every GK/science/current-affairs fact against a
   cited source domain; grammar by named rule; misprints and low-confidence items flagged, never
   hidden.
6. **Assemble** — `assemble.py` rebuilds the answer key from the section files (single source
   of truth), demotes headings, converts answers to `[!success]` callouts and
   "why other options are wrong" to folded `[!warning]-` callouts, and adds frontmatter, TOC,
   mermaid diagram, sources and checklist.
7. **Validate** — `validate.py` must print `PASS` before anything is reported.

## Examples

Two full 120-question papers, both solved from scanned PDFs (no usable text layer):

| Example | Source | Highlights |
|---|---|---|
| `examples/CET_12th_9Aug_Solutions_Hindi.md` (+ `.plain.txt`) | 29-page scan | history/GK, art & current affairs, maths (two-method), chemistry/economy/computer, polity/computer, sandhi-samas + English grammar |
| `examples/CET_12th_16Aug_Solutions_Hindi.md` (+ `.plain.txt`) | 37-page scan | 1857 revolution + saints, lok-devtas, forests, President/PM & current affairs, chemistry + simple interest, environment/computer, English narration |

Each `.plain.txt` is the same note with Obsidian syntax stripped, as produced by `assemble.py`.

The source PDF itself is not included.
