# Workflow detail — reading, splitting, subagent prompts

## A. Page-reading protocol (protects the context window)

A dense exam page costs ~2k tokens as an image. Reading 12 pages in one call blows past
the safe window and triggers auto-compaction, which silently drops transcriptions.

Rules:
1. Read **1–2 images per tool call**, not more.
2. After each call, immediately append the verbatim questions + answers to `notes.md`.
   Losing the image is fine; losing `notes.md` is not.
3. Bilingual papers: transcribe the Hindi column for the solution text, keep the English
   technical terms — e.g. `लाभ प्रतिशत (profit %)`, `द्रव्यमान संरक्षण (law of conservation of mass)`.
4. Option (E) is usually "अनुत्तरित प्रश्न / Question not attempted" — note it once in
   `meta.exam_details`, and keep each question's own (E) line in the verbatim text.
5. Words broken by the scan: crop + re-OCR, do not guess silently.
   ```bash
   pdftoppm -f 28 -l 28 -r 400 -png paper.pdf /tmp/paper/hi28
   python3 - <<'PY'
   from PIL import Image
   im = Image.open('/tmp/paper/hi28-28.png'); w, h = im.size
   im.crop((int(w*0.50), int(h*0.030), int(w*0.66), int(h*0.058))).resize((1500, 360)).save('/tmp/paper/crops/word.png')
   PY
   tesseract /tmp/paper/crops/word.png stdout -l hin --psm 6
   ```
   If it stays ambiguous, write the reading in `[ ]` in the verbatim line and explain
   the ambiguity inside the question's `नोट` callout.

## B. Section split

Choose ranges so each question 1..N is covered **exactly once**, and so that a question
never straddles two part files. Verify the page → question mapping from the footer
(`Page: 12`) plus the text dump:

```bash
grep -n "Page: 1[2-4]" /tmp/paper/text-dump.txt | head
```

If a question's stem is on page X and its options on page X+1 (common for multi-statement
questions), assign the whole question to the section that holds the **options**, and give
that subagent both page images.

Watch for pages that do **not** belong to the assumed subject order (a science page
sandwiched between maths pages, a stray reasoning question inside a science range). Tell the
subagent explicitly which pages to read and note the anomaly in the run log.

## C. Subagent prompt template (one per section, launched in parallel)

````text
You are writing part of a Hindi-language solutions document for a scanned
<exam name> question paper.

TASK: Read the page images <p-XX.png paths, comma separated> (one or two at a time with
the `read` tool, do NOT read all at once). They contain questions <Q_from>–<Q_to>
(<topics>).

For EVERY question <Q_from> through <Q_to>, write a detailed Hindi solution into
<workdir>/parts/<part_file>.md (create/overwrite it). Do not skip any question.

THE VERIFIED ANSWER KEY (already computed — your solutions MUST agree with it):
<Q48 (C) 600 | Q49 (A) 30 | …>

RULES:
1. Before writing any file you MUST perform at least one web search/fetch in this same
   turn — a global research-first gate blocks file writes until the turn has a lookup.
2. Verify every historical/GK/current-affairs fact against genuine sources (official
   portals, PIB, university/organiser sites, Transparency International, UNESCO, then
   Drishti/Testbook/Wikipedia) and cite the source domain in parentheses after the fact.
3. Maths/reasoning questions: solve, then RE-VERIFY with a SECOND, DIFFERENT method
   (equation ↔ unitary, formula ↔ back-substitution, forward rule ↔ reverse
   back-calculation). Show both, labelled "व्याख्या (विधि 1)" and
   "> [!tip] सत्यापन (विधि 2)".
4. Output language: Hindi, keeping English technical terms in parentheses.
5. Never invent question text. Transcribe faithfully from the image; if a word is
   unclear, put your best reading in [ ].

EXACT FORMAT PER QUESTION (this file is assembled into an Obsidian note):

## प्रश्न N
**प्रश्न:** <full question text with all options (A) … (E) …>

**उत्तर: (X) <answer text>**

**व्याख्या:**
- <bullets with reasoning + source domain>

**अन्य विकल्प क्यों गलत:**
- **(A)** — <why wrong>

Start the file with `# विस्तृत हल (प्रश्न <from>–<to>) — <topic>` then `---`, then the
questions in order.

ALSO append one line per question to <workdir>/ans.txt in the form `48 C` (append with >>,
never overwrite).

When done, reply with the list question number -> option letter, and flag any question
whose printed text you could not read or whose answer you are unsure about.
````

Notes:
- Pass the already-solved key so parallel workers cannot drift from your own answers.
- Ask for the flag list — that list becomes the "low-confidence questions" bullet in the
  closing note. Never discard it.
- `## प्रश्न N` (not `###`) is what the workers write; `assemble.py` demotes headings and
  rebuilds the key table from these files, so the part files are the single source of truth.
- After the workers finish, spot-check anything they flagged (`Q3`, `Q8`, `Q19`, `Q23` in the
  reference run) with your own lookup before assembling.

## D. Assembly order

```bash
python3 scripts/assemble.py /tmp/paper/meta.json      # parts + meta -> Obsidian note (+ .bak.txt)
python3 scripts/validate.py "$OUTPUT" 120             # must print PASS
```

`assemble.py` re-derives the answer key by parsing each `## प्रश्न N` block, so the table
can never disagree with the body text.
