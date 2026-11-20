# Pitfalls — hard-won, in the order they bite

The workflow this file guards: **read one page → note that page immediately → finish the whole
paper → check the bank → only then solve.** Every pitfall below is a way that order gets broken.

## 1. The PDF's text layer is a trap (Adobe Scan)
`pdftotext -layout` on a scanned paper returns `F-'ki~R!.a i't` for `प्रश्न 1. राणा सांगा...`.
Some papers are text-native and extract perfectly — check first:
```bash
pdftotext -layout paper.pdf /tmp/paper/text-dump.txt
head -c 400 /tmp/paper/text-dump.txt     # readable prose? -> you may solve from text
grep -c 'राणा\|प्रश्न' /tmp/paper/text-dump.txt
```
If garbled: images are authoritative, the dump is only a locator (question numbers, page
footers like `Page: 12`, `Help : 8290645748`). A 37-page scan can extract to **0 bytes** —
then the dump gives you nothing at all, not even numbering, and you must reconcile numbering
from the page footers as you go.

## 2. Reading several page images in one call (the worst one)
Two page images in one tool call is already a mistake; ten is a session-killer:
- **auto-compaction** summarises away the transcriptions you just made, silently;
- a wrong number can no longer be traced to a page;
- a retry costs the whole batch instead of one page.

Cost is per pixel, not per call, so batching saves nothing:
`detail=high` ≈ 85 + 170 tokens per 512×512 tile → a 150-dpi page is roughly 700–1,500 tokens
either way. **One image per tool call, in page order, and append to `notes.md` before the next
read.** The notes file — not the context window — is the durable store.

## 3. Reading a page a second time
Symptom: "I need to check whether Q37 option (C) said *X* or *Y*", so the page gets re-opened —
and now every question that page holds is paid for twice, plus the context churn.
Fix at the moment of first read:
- transcribe the **whole** page, including options you think are boring;
- an unreadable word → `[?]` in the bank, or a 400-dpi crop of just that region (below);
- never leave the page without its note written.

Crop-and-OCR instead of re-reading (Tesseract: `--psm 6` for a block, `--psm 7` for one line,
≥300 dpi, ~10 px white border — `tesseractocr.org/doc`, `github.com/tesseract-ocr/tessdoc`):
```bash
pdftoppm -f 28 -l 28 -r 400 -png "paper.pdf" /tmp/paper/crops/hi28
python3 -c "from PIL import Image; im=Image.open('/tmp/paper/crops/hi28-28.png'); w,h=im.size; im.crop((int(w*0.05),int(h*0.20),int(w*0.52),int(h*0.26))).resize((1600,600)).save('/tmp/paper/crops/w.png')"
tesseract /tmp/paper/crops/w.png stdout -l hin --psm 6
```

## 4. Solving before the bank is complete
If you start answering at Q1 while pages 12–37 are still unread, every later question tempts you
back into an image. The bank makes the solve step **image-free**: text in, text out.
Gate it:
```bash
python3 scripts/bank_check.py /tmp/paper/notes.md 120   # must say BANK OK
```

## 5. Questions that straddle a page boundary
Real case: printed Page 13 ended at Q30, Page 14 started at Q34 — Q31–33 sat at the bottom of
Page 13 and were skipped, and the gap was only noticed much later. Because you are holding the
page, the fix costs nothing **at that moment**: transcribe the tail before moving on, and keep a
running counter. `bank_check.py` catches what you miss, but catching it in the pass is free.

Also: a question whose stem is on one page and whose options continue overleaf is completed when
you reach the next page — still one read, no going back.

## 6. Letting a subagent do part of the paper
Delegation splits the images away from the note file: the worker holds the page, the main session
holds the bank, and neither can finish alone. It reliably produces duplicate coverage, boundary
gaps, and questions transcribed twice from the same page. **Do the paper yourself, in one
session.** Long papers are handled by *time*, not by parallelism.

## 7. Answering GK / current affairs from memory
Without a source domain an answer is unverifiable, and recall is exactly what goes stale first
(a 2026 paper asks about 2026 events). Verify every fact and cite the domain in parentheses:
official first (PIB, `.gov.in`, organiser/university sites, NITI Aayog, MoEFCC, NTCA), then
exam-authoritative (Drishti, Testbook, RajRAS, Wikipedia). Anything unverifiable stays flagged as
low-confidence rather than quietly asserted.

## 8. Drifting answer key
Keeping answers in a separate `ans.txt` and the text in part files lets the two disagree.
Fix: `assemble.py` parses answers **from the part files**, and `validate.py` compares the
key-table letters against each `[!success]` callout. Never key the table from a second list.

## 9. Renaming headings after the TOC is generated
`[[#प्रश्न 48]]` and `[[#विस्तृत हल (प्रश्न 48–67) — गणित]]` resolve by exact heading text.
Renaming or "tidying" a heading silently breaks the links. Run `validate.py`; it fails on broken
TOC and key links.

## 10. Misprints in the paper (keep the answer, expose the flaw)
Real examples:
- `शोल्डर (Shoulder)` printed where `सोल्डर (solder)` was meant — answer still (C), solder = Pb + Sn.
- A question with two valid विसर्ग-संधि options (`निष्ठुर`, `मनोयोग`) → mark the question flawed,
  state the conventional key, explain both sides.
- "Slide Shorter" printed for **Slide Sorter**; "जीटा टाउन" for **JITO Town**; a district score
  printed as 57.82 when the official figure is 51.82.
Put the explanation inside the question (often `> [!note]`) **and** in the closing note's
low-confidence list.

## 11. The "why other options are wrong" block written inline
A single line `**अन्य विकल्प क्यों गलत:** (B) ... (C) ...` is not a block: the assembler leaves it
as prose and the folded callout silently disappears (23 of 120 questions in one run). Write a
**standalone heading + one bullet per option**, then verify:
```bash
grep -c '^> \[!warning\]-' "$OUTPUT"     # should be close to total_questions
```
Gaps are fixed by editing the part file from the bank — no page reads needed.

## 12. Never hardcode the callout phrases in the assembler
Headings get worded differently (`सत्यापन (विधि 2) — मिश्रण नियम से`, `अन्य विकल्प क्यों सही हैं`,
`दूसरी विधि ...`, `पुनः जाँच ...`). Match **any bold-only heading** and classify from phrase hints:
- `गलत | असंगत | बेमेल | असत्य | त्रुटि` (but not `गलत नहीं`) → folded `warning`
- `सत्यापन | जाँच | विधि 2 | दूसरी विधि | वैकल्पिक विधि` → visible `tip`
- `अन्य विकल्प ... क्यों सही` → `tip` (green), not a red warning

## 13. Reporting honestly
The final report must state `filled/total`, list the flagged questions, and name the source
domains used. Do not claim "100% verified" if any item was answered by elimination or is marked
as a printing defect.