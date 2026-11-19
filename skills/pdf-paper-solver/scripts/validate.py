#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""validate.py — gate the finished Obsidian solutions note before reporting.

usage: validate.py <note.md> <total_questions>

Fails (exit 1) on:
  * missing frontmatter
  * missing / duplicated question headings
  * an answer keynote letter that disagrees with the [success] callout in the body
  * leftover plain '**उत्तर: ...' lines (conversion incomplete)
  * answer-key wikilinks whose target heading does not exist
  * broken TOC wikilinks
Prints PASS/FAIL summary and a per-check list.
"""
import re
import sys

path = sys.argv[1]
total = int(sys.argv[2])
text = open(path, encoding="utf-8").read()
lines = text.split("\n")
fails, notes = [], []


def check(cond, ok, bad):
    if cond:
        notes.append("PASS  " + ok)
    else:
        fails.append(bad)


check(text.startswith("---\n"), "YAML frontmatter present", "frontmatter missing")

nums = [int(m) for m in re.findall(r"^### प्रश्न (\d+)", text, re.M)]
check(nums == sorted(nums), "question headings in ascending order", "question headings out of order")
check(sorted(set(nums)) == list(range(1, total + 1)),
      f"all {total} questions present exactly once",
      f"question headings problem — got {len(nums)}, unique {len(set(nums))}, missing "
      f"{sorted(set(range(1, total + 1)) - set(nums))}, dupes "
      f"{sorted(n for n in set(nums) if nums.count(n) > 1)}")

key = {int(n): a for n, a in re.findall(r"\| (\d+) \| \[\[#प्रश्न \d+\\\|\*\*([A-E?])\*\*\]\]", text)}
check(len(key) == total, f"answer-key table has {len(key)} wikilinked answers",
      f"answer-key table only has {len(key)}/{total} entries")
check(not [n for n, a in key.items() if a == "?"], "no '?' placeholders in the answer key",
      f"unanswered in key: {sorted(n for n, a in key.items() if a == '?')}")

body = {}
for m in re.finditer(r"^### प्रश्न (\d+)([\s\S]*?)(?=^### प्रश्न \d+|\Z)", text, re.M):
    mm = re.search(r"^> \[!success\] उत्तर: \(([A-E])\)", m.group(2), re.M)
    body[int(m.group(1))] = mm.group(1) if mm else None
check(not [n for n, a in body.items() if a is None],
      "every question has a success answer callout (" + str(len(body)) + " checked)",
      f"questions without an answer callout: {sorted(n for n, a in body.items() if a is None)}")
mismatch = sorted(n for n in key if n in body and body[n] != key[n])
check(not mismatch, "key-table letters match body callout letters",
      f"key vs body letter mismatch at questions {mismatch}")

leftover = re.findall(r"^\*\*उत्तर:", text, re.M)
check(not leftover, "no leftover plain answer lines", f"{len(leftover)} plain '**उत्तर:' lines remain")

heads = {h.strip() for h in re.findall(r"^#{1,4} (.+)$", text, re.M)}
key_links = set(re.findall(r"\[\[#(प्रश्न \d+)\\\|", text))
check(not (key_links - heads), "all answer-key wikilinks resolve",
      f"unresolved key links: {sorted(key_links - heads)[:10]}")
toc = re.findall(r"^> - \[\[#([^\]]+)\]\]", text, re.M)
check(not [t for t in toc if t not in heads], f"all {len(toc)} TOC wikilinks resolve",
      f"broken TOC links: {[t for t in toc if t not in heads]}")

print("\n".join(notes))
print()
if fails:
    print("FAIL — " + str(len(fails)) + " problem(s):")
    for f in fails:
        print("  ✗ " + f)
    sys.exit(1)
print(f"PASS — {total} questions, answer key and body agree, all wikilinks resolve.")
