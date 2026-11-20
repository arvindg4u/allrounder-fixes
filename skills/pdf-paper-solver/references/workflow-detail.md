# Workflow detail — one page at a time, bank first, then solve

## A. Why one page per tool call (not "optimisation", it is the only safe way)

A 150-dpi scan page costs roughly 700–1,500 image tokens and is billed by pixels, not by how much
text is on it. Reading ten pages in one call therefore costs the same as ten separate calls **and**
adds two failure modes:

- **Auto-compaction.** A large multi-image call pushes the session over the compaction threshold;
  the harness then summarises older turns, and the transcription you just did is gone.
- **Attribution loss.** A wrong number cannot be traced to a page, and a retry means re-reading
  everything again.

Per-page reads give: a page number attached to every extracted value, a retry that costs one page,
and a notes file that survives compaction. (This is the same conclusion the multimodal-input
literature reaches: "use one call per image for everything else, because the token cost is the same
either way" — https://sameralqaisi.me/ai-programming/core-llm-integration/multimodal-input-images-audio-and-documents)

## B. The transcription loop

```
for page N in 1..total:
    read /tmp/paper/pages/p-NN.png        # ONE image, one tool call
    append to /tmp/paper/notes.md:
        ## Page N (printed "Page: N+1")
        Qxx. <verbatim Hindi text>  (A) … (B) … (C) … (D) … (E) अनुत्तरित प्रश्न
        Qxy. …
```

Per page, also record:
- the printed footer (`Page: 12`) so the PDF-page ↔ paper-page map stays explicit;
- any question whose **stem** starts on this page but whose options continue overleaf — you will
  complete the options when you reach the next page (no extra read);
- the running counter: it must climb by the number of question-number lines you saw. A jump means
  the previous page's tail still holds questions — transcribe them while it is still in front of you.

Discipline that saves the most time:
- Take the note **before** the next read. Never "I'll note it later".
- Unreadable word → `[?]` in the text, or a 400-dpi crop of just that region (see SKILL.md step 2).
- Do not solve while transcribing. A quick provisional answer in the margin is fine (`=> (C)?`),
  but the full solution is written in step 4 from the notes, never from the image.

## C. The bank (`notes.md`) and its check

`notes.md` is the whole paper in text form. Before solving:

```bash
python3 scripts/bank_check.py /tmp/paper/notes.md 120
```

```
page  1 (printed   2): Q1–Q3            (3)
page  2 (printed   3): Q4–Q5            (2)
…
BANK: 120/120 · missing: none · duplicates: none
```

If something is missing, fix `notes.md` (or crop that one region) — the page images are a last
resort, only for the single page that needs it, and only once.

Bank entry format the checker understands (either works):

```
Q17. <text>
17. <text>
प्रश्न 17. <text>
```

## D. Solving from the bank

Write `parts/part_01.md`, `part_02.md`, … in bank order, ~15–20 questions per file:

```
## प्रश्न 17
**प्रश्न:** <verbatim from the bank + all options>

**उत्तर: (B) <answer>**

**व्याख्या:**
- <reasoning; GK facts cite a source domain in parentheses>

**अन्य विकल्प क्यों गलत:**
- **(A)** — …
```

- GK/current-affairs: one web lookup per fact, official sources first, cite the domain.
- Maths/reasoning: `**व्याख्या (विधि 1):**` then `**सत्यापन (विधि 2):**` with a genuinely
  different second method, not the same arithmetic re-worded.
- Grammar: name the rule, then apply it to the options.
- The part files are the single source of truth for the answer key — `assemble.py` re-parses them,
  so the key table can never disagree with the body text.

## E. Assembly order

```bash
python3 scripts/bank_check.py /tmp/paper/notes.md <total>    # 1. bank complete?
python3 scripts/assemble.py /tmp/paper/meta.json            # 2. parts + meta -> Obsidian note
python3 scripts/validate.py "$OUTPUT" <total>                # 3. must print PASS
```

`meta.sections` maps one part file per section, and `skip` can drop a question that a section
deliberately does not cover.
