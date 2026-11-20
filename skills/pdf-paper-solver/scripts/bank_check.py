#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""bank_check.py — verify the page-wise transcription bank before any solving starts.

usage: bank_check.py <notes.md> <total_questions>

The bank is the notes file built during the single transcription pass (one page image read per
tool call, that page noted immediately). Entries are recognised as `Q17. ...`, `17. ...` or
`प्रश्न 17. ...` and are grouped under `## Page N` / `### Page N` headings when present.

Prints per-page counts, then missing / duplicate question numbers.
Exit code 1 when the bank is incomplete, so it can gate the solve step.
"""
import re
import sys
from collections import OrderedDict

path = sys.argv[1]
total = int(sys.argv[2])
lines = open(path, encoding="utf-8").read().split("\n")

PAGE_RE = re.compile(r"^#+\s*Page\s+(\d+)")
# "Q17. text", "17. text", "प्रश्न 17. text" — the delimiter must be followed by
# whitespace/end so decimals ("10.5 cm") are not mistaken for question numbers.
Q_RE = re.compile(r"^\s*(?:Q|प्रश्न)?\s*(\d{1,3})\s*[.)।](?=\s|$)")

page = None
seen = OrderedDict()          # question -> [pages]
pages = OrderedDict()         # page -> [questions]
for line in lines:
    m = PAGE_RE.match(line)
    if m:
        page = int(m.group(1))
        pages.setdefault(page, [])
        continue
    m = Q_RE.match(line)
    if m:
        q = int(m.group(1))
        if q < 1 or q > total:
            continue
        seen.setdefault(q, []).append(page)
        pages.setdefault(page, []).append(q)


def compress(nums):
    """[1,2,3,7] -> ['1–3', '7']"""
    nums = sorted(set(nums))
    out, i = [], 0
    while i < len(nums):
        j = i
        while j + 1 < len(nums) and nums[j + 1] == nums[j] + 1:
            j += 1
        out.append(f"{nums[i]}" if i == j else f"{nums[i]}–{nums[j]}")
        i = j + 1
    return out


print(f"bank file : {path}")
print(f"questions : {len(seen)}/{total}")
print()
print("page   questions            count")
for p, qs in pages.items():
    if not qs:
        continue
    label = ", ".join(compress(qs))
    print(f"{str(p) if p is not None else '?':>4}   Q{label:<18} {len(qs):>3}")

missing = [q for q in range(1, total + 1) if q not in seen]
dupes = sorted(q for q, ps in seen.items() if len(ps) > 1)

print()
if missing:
    print("MISSING   : " + ", ".join(compress(missing)))
if dupes:
    print("DUPLICATES: " + ", ".join(f"Q{q} (pages {seen[q]})" for q in dupes))
if not missing and not dupes:
    print(f"BANK OK — every question 1..{total} present exactly once.")
    sys.exit(0)
print()
print("Fix by editing the bank (or a targeted 400-dpi crop) — do NOT re-read whole pages.")
sys.exit(1)