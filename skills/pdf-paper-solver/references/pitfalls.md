# Pitfalls — hard-won, in the order they bite

## 1. The PDF's text layer is a trap (Adobe Scan)
`pdftotext -layout` on a scanned paper returns `F-'ki~R!.a i't` for `प्रश्न 1. राणा सांगा…`.
Some papers are text-native and extract perfectly — check first:
```bash
pdftotext -layout paper.pdf /tmp/paper/text-dump.txt
head -c 400 /tmp/paper/text-dump.txt     # readable prose? -> you may solve from text
grep -c 'राणा\|प्रश्न' /tmp/paper/text-dump.txt
```
If garbled: images are authoritative, the dump is only a locator (question numbers, page
footers like `Page: 12`, `Help : 8290645748`).

## 2. Context blow-up from bulk page reads
Reading 10+ page images in one call → auto-compaction → earlier transcriptions vanish.
Read 1–2 at a time and persist to `notes.md` after every batch. If compaction happens,
`notes.md` + the part files are the recovery source, so update them eagerly.

## 3. Workers writing answers from memory
Without a source domain, an answer is unverifiable. Require citations, and re-check any
item the worker flags. The research-first gate also means **each worker needs its own
lookup before it can write** — put that instruction in the prompt or the worker stalls.

## 4. Drifting answer key
Keeping answers in a separate `ans.txt` and the text in part files lets the two disagree
(one run lost Q17 and Q48–67 from `ans.txt` because two workers wrote concurrently).
Fix: `assemble.py` parses answers from the part files and the validator compares
key-table letters against the `[!success]` callout letters. Both must match.

## 5. Renaming headings after the TOC is generated
`[[#प्रश्न 48]]` and `[[#विस्तृत हल (प्रश्न 48–67) — गणित]]` resolve by exact heading text.
Renaming or "tidying" a heading silently breaks the links. Run `validate.py`; it fails on
broken TOC and key links.

## 6. Misprints in the paper (keep the answer, expose the flaw)
Real examples from the reference run:
- `शोल्डर (Shoulder)` printed where `सोल्डर (solder)` was meant — answer still (C) because
  solder = Pb + Sn.
- A question with two valid विसर्ग-संधि options (`निष्ठुर` and `मनोयोग`) → mark the
  question technically flawed, state the conventional key, explain both sides.
- Duplicate/derailed options in a passive-voice question → note the printing defect.
- A statement whose district list is incomplete (isobars) → the incomplete statement is the
  "false" one; justify by proving the other three true (elimination logic).
Put the explanation inside the question (often as a `> [!note]` callout) **and** in the
closing note's low-confidence list.

## 7. Wrong subject order across pages
Never assume pages follow the subject order of the section split. One run found the science
stems `Q71–Q74` on the page assumed to be maths/reasoning. Read the page footer
(`Page: 20`) and the neighbouring images; if a range is misassigned, fix the meta
`sections[].skip` list rather than editing two part files by hand.

## 8. Duplicate coverage / gaps at section boundaries
Symptoms: the same question answered twice, or a question with no entry. Detect early with
`grep -oE '^## प्रश्न [0-9]+' parts/*.md | sort -u | wc -l` and compare against the paper's
total. Use `sections[].skip` for a deliberate duplicate, and `validate.py` for gaps.

## 9. Bilingual numbering mismatch
Hindi and English columns print the same number; when a page's Hindi column continues onto
the next page while the English one does not, transcribe from the column that is complete,
and keep question numbers from the printed number, not from reading order.

## 10. Reporting honestly
The final report must state `filled/total`, list the flagged questions, and name the source
domains used. Do not claim "100% verified" if any item was answered by elimination or is
marked as a printing defect.
