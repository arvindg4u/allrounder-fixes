---
name: pdf-paper-solver
description: Solve any uploaded exam/question-paper PDF (scanned or text) end-to-end and produce a single Obsidian Flavored Markdown solution note with frontmatter, wikilinked answer key, per-question callouts, verified explanations and sources. Use when the user uploads or names a PDF paper and asks to solve it, make an answer key, prepare solutions, or "solve this paper / question paper / previous year paper / model paper".
metadata:
  origin: custom
  version: 2.0.0
---

# PDF Paper Solver → Obsidian Solutions Note

Turn a question-paper PDF into one finished Obsidian note: frontmatter, wikilinked answer key,
per-question callouts, web-verified explanations, sources, revision checklist.

**Deliverable is always exactly one `.md` file** plus a `<file>.bak.txt` plain copy.

## The two non-negotiable rules

1. **No subagents, ever.** The paper is transcribed and solved by the single main agent.
   Delegation splits the page images away from the notes and forces re-reads.
2. **One page = one image read, exactly once.** Read a page image, immediately write that page's
   transcription into the notes file, then never look at that page again. Never read two or more
   page images in one tool call and never batch pages: bulk reads blow the context window
   (auto-compaction silently drops earlier transcriptions), and re-opening a page for one small
   detail is the slowest possible path.

**So the order is fixed: read → note → finish the whole paper → build the bank → only then solve.**
Solving before the transcript is complete makes you re-read the same pages once per question.

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
Also run `pdftotext -layout` into `text-dump.txt`. Treat that dump as an **index only** — scanned
papers give garbled text (`प्रश्न` → `F-'ki~R!.a`) or an empty file. Never transcribe from it.

```
/tmp/paper/
  pages/p-01.png …        rendered page images — each one is read exactly ONCE
  text-dump.txt           garbled/empty; locator only
  notes.md                THE BANK: page-wise verbatim transcript, built page by page
  parts/part_01.md …      solutions, written only after the bank is complete
  meta.json               paper metadata + output path
  crops/                  high-DPI crops for words the scan broke
```

### 1. Recon — exactly two image reads
Read `pages/p-01.png` and the last page, once each. Capture: institute, paper code, total pages,
total questions, option pattern (e.g. (A)–(D) + (E) "अनुत्तरित प्रश्न / Question not attempted"),
language(s) and the rough subject order. Write `meta.json` from `scripts/meta.template.json`
(section labels get refined later; the section headings themselves come from the part files).
Record these recon facts at the top of `notes.md` so they are never re-derived.

### 2. The single transcription pass — one page per call, in order
From page 1 to page N, strictly in order:

```
read pages/p-07.png          ← exactly one image in this tool call
   ↓ immediately append to notes.md:
## Page 7 (printed "Page: 8")
Q17. <verbatim question text> (A) … (B) … (C) … (D) … (E) अनुत्तरित प्रश्न
Q18. …
Q19. …
```

Rules for this pass:
- **One image per tool call.** Never two, never "the remaining pages".
- **Note the page before reading the next one.** If the context compacts, `notes.md` is the resume
  point and the images never have to be read again.
- Transcribe the **Hindi column** where it exists (it carries the fuller text); English-only pages
  are transcribed as printed. Keep English technical terms in parentheses.
- **Never re-read a page.** If a word is unreadable, either mark it `[?]` and continue, or in the
  same step crop that region at 400 dpi and OCR only the crop:
  ```bash
  pdftoppm -f 28 -l 28 -r 400 -png "<paper.pdf>" /tmp/paper/crops/hi28
  python3 -c "from PIL import Image; im=Image.open('/tmp/paper/crops/hi28-28.png'); w,h=im.size; im.crop((int(w*0.5),int(h*0.03),int(w*0.66),int(h*0.058))).resize((1500,360)).save('/tmp/paper/crops/w.png')"
  tesseract /tmp/paper/crops/w.png stdout -l hin --psm 6
  ```
- Keep a running question counter. If a page ends at Q30 and the next page starts at Q34, the tail
  of the page you are holding still contains Q31–Q33 — transcribe them **now**. Boundary gaps are
  cheap only at the moment you are looking at the page.
- Options that continue on the next page are captured when you reach that next page — one read.

### 3. Build the bank and verify coverage — still no solving
`notes.md` now holds the whole paper. Check it before solving anything:
```bash
python3 scripts/bank_check.py /tmp/paper/notes.md 120
```
It prints per-page counts plus missing and duplicate question numbers. Fix what it flags by editing
`notes.md` or with a targeted 400-dpi crop — never by re-reading whole pages.

Only when the bank is complete and gap-free does solving start.

### 4. Solve from the bank
Work through the bank **in order, ~15–20 questions at a time**, writing `parts/part_XX.md`
(`## प्रश्न N` blocks with the question text copied verbatim from the bank):

- **GK / history / polity / science / current affairs** — verify every fact with a web lookup and
  cite the source domain in parentheses: official first (PIB, `.gov.in`, university/organiser
  sites, Transparency International, UNESCO, MyGov), then exam-authoritative (Drishti, Testbook,
  RajRAS, Wikipedia). **Never answer from memory.**
- **Maths / reasoning / series** — solve, then re-verify with a **second, different method**
  (equation ↔ unitary, formula ↔ back-substitution, forward rule ↔ reverse back-calculation).
  Label them `**व्याख्या (विधि 1):**` and `**सत्यापन (विधि 2):**`.
- **English grammar / narration / voice / संधि-समास** — state the rule, then map it to the option.
- Every question ends with a **standalone** `**अन्य विकल्प क्यों गलत:**` heading and one bullet per
  option — never inline prose, or the folded callout will not build.
- Flag, don't hide: ambiguous options, misprints and low-confidence answers are written inside the
  question and listed in the closing note.

### 5. Assemble
```bash
python3 scripts/assemble.py /tmp/paper/meta.json
```
Produces the final Obsidian note at `meta.output` and a plain `<output>.bak.txt`.

### 6. Validate (must pass before reporting)
```bash
python3 scripts/validate.py "$OUTPUT" <total_questions>
```
Fails on: missing questions, a key letter ≠ its `[!success]` letter, leftover plain `**उत्तर:**`
lines, broken TOC/key wikilinks, missing frontmatter.

### 7. Report
Give the user: output path, `filled/total` answers, section→count table, the flagged/low-confidence
questions and the sources relied on. Never claim "all verified" when items are flagged.

## Cost model (why the rules above exist)
A 150-dpi page image costs roughly 700–1,500 image tokens; a dense page read twice costs that twice.
Reading 10 pages in one call also pushes the session toward auto-compaction, which summarises away
what you just transcribed — the notes file, not the context, is the durable store. One read per page
plus an immediate note is therefore both the cheapest and the only lossless option.

## Prerequisites
`poppler-utils` (`pdftoppm`, `pdfinfo`, `pdftotext`), `python3`, optional `tesseract-ocr` + `hin`/`eng`
traineddata, optional `PIL` for crops. Check with `command -v pdftoppm pdfinfo tesseract`.

Run it via the `/solve-paper <pdf>` command, or just upload a paper PDF and ask to solve it.

## Pitfalls to avoid
See [references/pitfalls.md](references/pitfalls.md). The five that cost the most:
1. Batching page reads, or reading a page a second time instead of taking a note the first time.
2. Solving questions before the whole bank exists — that re-reads pages question by question.
3. Answering a GK/current-affairs question from memory instead of a cited source.
4. Writing the "why other options are wrong" block inline, so the folded callout never builds.
5. Keying the answer table from a separate file (it drifts) instead of parsing the part files.
