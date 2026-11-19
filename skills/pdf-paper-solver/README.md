# pdf-paper-solver — skill

Solve an exam/question-paper PDF end-to-end and emit **one Obsidian Flavored Markdown note**:
frontmatter, wikilinked answer key, per-question callouts, web-verified explanations,
sources, revision checklist — plus a plain-text copy of the same content.

```
skills/pdf-paper-solver/
├── SKILL.md                    the skill contract (load this first)
├── scripts/
│   ├── render_pages.sh         PDF → page PNGs + garbled-text-layer warning
│   ├── assemble.py             parts/*.md + meta.json → Obsidian note + plain .bak.txt
│   ├── validate.py             PASS/FAIL gate: gaps, key≠body mismatch, broken wikilinks
│   └── meta.template.json      paper metadata template
├── references/
│   ├── workflow-detail.md      page-reading protocol + ready-to-paste subagent prompts
│   ├── pitfalls.md             the 10 failure modes worth avoiding
│   └── obsidian-output.md      output spec, callout mapping, wikilink rules
├── command/solve-paper.md      OpenCode slash command
└── examples/                   a full solved paper (120 questions) as reference output
```

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
| `python3` | `assemble.py`, `validate.py` |
| `tesseract-ocr` (+ `hin`/`eng`) | optional, only to rescue words the scan broke |

## How it works (7 phases)

1. **Intake** — `render_pages.sh` renders every page to PNG at 150 dpi and flags a garbled
   text layer (Adobe Scan). The text dump is used only to locate question numbers/pages.
2. **Recon** — read page 1 and the last page to capture paper metadata and the section split.
3. **Transcribe** — read page images one or two at a time (never bulk — that triggers
   context compaction), persisting verbatim questions to `notes.md` after every batch.
4. **Parallel solve** — one `general` subagent per ~15–20 question batch, each given the
   page paths, its range, the output format, and the answers already verified.
5. **Verify** — maths/reasoning by **two independent methods**; every GK/science/current-affairs
   answer against genuine sources with the domain cited; misprints and low-confidence items
   flagged, never hidden.
6. **Assemble** — `assemble.py` rebuilds the answer key from the section files (single source
   of truth), demotes headings, converts answers to `[!success]` callouts and
   "why other options are wrong" to folded `[!warning]-` callouts, and adds frontmatter, TOC,
   mermaid diagram, sources and checklist.
7. **Validate** — `validate.py` must print `PASS` before anything is reported.

## Examples

`examples/CET_12th_9Aug_Solutions_Hindi.md` — a 120-question Rajasthan CET (12th level) paper,
solved from a 29-page scanned PDF: sections for history/geography, art & current affairs,
maths (each answer shown with a second verification method), chemistry/economy/computer,
polity/computer, and sandhi-samas + English grammar.
`examples/CET_12th_9Aug_Solutions_Hindi.plain.txt` — the same note with Obsidian syntax
stripped, as produced by `assemble.py`.

The source PDF itself is not included.
