#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""assemble.py — build a finished Obsidian Flavored Markdown solutions note.

Input : a meta.json describing the paper + one part file per section
        (each part holds `## प्रश्न N` blocks with `**उत्तर: (X) ...**` lines)
Output: the final note at meta["output"]  +  a plain copy at <output>.bak.txt

Usage: python3 assemble.py /tmp/paper/meta.json
"""
import json
import os
import re
import sys

# ----------------------------------------------------------------- tag / label helpers
ANSWER_RE = re.compile(r"^\*\*उत्तर:?\s*\(?([A-E])\)?")
Q_HEAD_RE = re.compile(r"^## प्रश्न (\d+)")
# any bold-only line, e.g. "**अन्य विकल्प क्यों गलत:**" / "**सत्यापन (विधि 2) — …:**"
BOLD_ONLY_RE = re.compile(r"^\*\*([^*]+)\*\*\s*:?\s*$")
# phrase hints decide the callout type (workers word these headings differently)
WRONG_HINT = re.compile(r"गलत|ग़लत|असंगत|बेमेल|असत्य|त्रुटि")
VERIFY_HINT = re.compile(r"सत्यापन|पुनः जाँच|जाँच|विधि\s*-?2|दूसरी विधि|वैकल्पिक विधि|तार्किक|सुमेलन जाँच")
ALT_HINT = re.compile(r"^(?:अन्य विकल्प|विकल्पों?)")
NOT_WRONG = re.compile(r"गलत नहीं")
NOTE_RE = re.compile(r"^> \*\*(नोट|परीक्षा-नोट|ध्यान दें|चेतावनी):?\*\*:?\s*(.*)$")


def is_callout_header(line):
    """True when a bold-only heading should become a callout."""
    m = BOLD_ONLY_RE.match(line)
    if not m:
        return False
    title = m.group(1)
    return bool(WRONG_HINT.search(title) or VERIFY_HINT.search(title) or ALT_HINT.search(title))


def starts_bullets(lines, i):
    """True when a bullet run (optionally after one blank line) starts at index i."""
    if i < len(lines) and lines[i].startswith(("- ", "  - ")):
        return True
    return i + 1 < len(lines) and lines[i].strip() == "" and lines[i + 1].startswith(("- ", "  - "))


def render_note(lines, i):
    """Convert a `> **नोट:** …` blockquote (plus its continuation lines) into a callout."""
    m = NOTE_RE.match(lines[i])
    kind, rest = m.group(1), m.group(2).strip()
    ctype = "warning" if kind == "चेतावनी" else "note"
    rendered = [f"> [!{ctype}] {kind}"]
    if rest:
        rendered.append("> " + rest)
    i += 1
    while i < len(lines) and lines[i].startswith(">") and not lines[i].startswith("> **"):
        rendered.append(lines[i])
        i += 1
    return rendered + [""], i


def split_pre_blocks(lines):
    pre, blocks, cur = [], [], None
    for line in lines:
        m = Q_HEAD_RE.match(line)
        if m:
            cur = [int(m.group(1)), [line]]
            blocks.append(cur)
        elif cur is None:
            pre.append(line)
        else:
            cur[1].append(line)
    return pre, blocks


def bullet_callout(lines, start, folded):
    """Consume the bullet run starting at `start`; return (rendered lines, next index)."""
    head_raw = lines[start]
    m = BOLD_ONLY_RE.match(head_raw)
    title = m.group(1).strip().rstrip(":").strip() if m else "विवरण"
    is_wrong = bool(WRONG_HINT.search(title)) and not NOT_WRONG.search(title)
    ctype = "warning" if (folded or is_wrong) else "tip"
    body, i = [], start + 1
    while i < len(lines):
        l = lines[i]
        if l.startswith("- ") or l.startswith("  - "):
            body.append(l)
            i += 1
            continue
        if l.strip() == "" and i + 1 < len(lines) and lines[i + 1].startswith("- "):
            body.append("")
            i += 1
            continue
        break
    rendered = [f"> [!{ctype}]{'-' if ctype == 'warning' else ''} {title}"]
    rendered += ["> " + b if b.strip() else ">" for b in body]
    return rendered, i


def transform_block(num, lines, skip):
    """Return (rendered lines, answer letter or None)."""
    out, letter, i = [], None, 0
    while i < len(lines):
        line = lines[i]
        if Q_HEAD_RE.match(line):
            out.append("###" + line[2:])
            i += 1
            continue
        m = ANSWER_RE.match(line)
        if m and re.match(r"^\*\*उत्तर:?\s*\(", line):
            letter = m.group(1)
            rest = re.sub(r"^\*\*उत्तर:?\s*\([A-E]\)\s*", "", line).rstrip("*").strip()
            out.append(f"> [!success] उत्तर: ({letter})" + (f" {rest}" if rest else ""))
            i += 1
            continue
        if is_callout_header(line) and starts_bullets(lines, i + 1):
            rendered, i = bullet_callout(lines, i, folded=False)
            out.extend(rendered)
            continue
        if NOTE_RE.match(line):
            rendered, i = render_note(lines, i)
            out.extend(rendered)
            continue
        out.append(line)
        i += 1
    return out, letter


def transform_pre(pre, tags):
    """Demote the section heading, convert note blockquotes, append tag line."""
    heading, body, i = None, [], 0
    while i < len(pre):
        line = pre[i]
        if re.match(r"^#\s+विस्तृत हल", line) or line.startswith("## विस्तृत हल"):
            heading = ("## " + line.lstrip("#").strip())
            i += 1
            continue
        m = NOTE_RE.match(line)
        if m:
            rendered, i = render_note(pre, i)
            body.extend(rendered)
            continue
        if line.strip() == "---":
            i += 1
            continue
        body.append(line)
        i += 1
    while body and body[0].strip() == "":
        body.pop(0)
    while body and body[-1].strip() in ("", "---"):
        body.pop()
    out = []
    if heading:
        out += [heading, ""]
    if tags:
        out += ["**विषय-टैग:** " + " ".join(tags), ""]
    out += body
    while out and out[-1].strip() == "":
        out.pop()
    out.append("")
    return heading, out


# ----------------------------------------------------------------- read meta
meta_path = sys.argv[1]
meta = json.load(open(meta_path, encoding="utf-8"))
parts_dir = meta.get("parts_dir") or os.path.dirname(os.path.abspath(meta_path))
out_path = meta["output"]
total = int(meta.get("total_questions") or 0)

fm = meta.get("frontmatter", {})
key_cfg = meta.get("key", {})
columns = int(key_cfg.get("columns", 5))
link_tpl = key_cfg.get("link", "[[#प्रश्न {q}\\|**{a}**]]")

# ----------------------------------------------------------------- sections
letters = {}
section_render, sections_meta = [], []
for sec in meta.get("sections", []):
    path = os.path.join(parts_dir, sec["file"])
    lines = open(path, encoding="utf-8").read().split("\n")
    pre, blocks = split_pre_blocks(lines)
    skip = set(sec.get("skip") or [])
    rendered = []
    first = last = None
    for num, block in blocks:
        if num in skip:
            continue
        ok, letter = transform_block(num, block, skip)
        if first is None:
            first = num
        last = num
        if letter:
            letters[num] = letter
        rendered.append(ok)
    heading, pre_out = transform_pre(pre, sec.get("tags") or [])
    if not heading:
        heading = f"## विस्तृत हल (प्रश्न {first}–{last})"
        pre_out = [heading, ""] + pre_out
    section_render.append(pre_out + [l for block in rendered for l in block + [""]])
    sections_meta.append({
        "heading": heading[3:].strip(),
        "first": first,
        "last": last,
        "label": sec.get("label") or f"प्रश्न {first}–{last}",
    })

# strip stray separators produced by the part files
body_lines = []
for idx, chunk in enumerate(section_render):
    while chunk and chunk[-1].strip() in ("", "---"):
        chunk.pop()
    while chunk and chunk[0].strip() in ("", "---"):
        chunk.pop(0)
    if idx:
        body_lines.append("---")
        body_lines.append("")
    body_lines.extend(chunk)
    body_lines.append("")

missing = [q for q in range(1, total + 1) if q not in letters]

# ----------------------------------------------------------------- header
def callout(ctype, title, text, fold=False):
    head = f"> [!{ctype}]{'-' if fold else ''}" + (f" {title}" if title else "")
    lines = [head]
    if text and str(text).strip():
        for chunk in str(text).split("\n"):
            lines.append("> " + chunk if chunk.strip() else ">")
    return lines



front = ["---"]
front.append(f'title: "{fm.get("title", meta.get("h1", "Solutions").lstrip("# "))}"')
aliases = fm.get("aliases") or []
if aliases:
    front.append("aliases:")
    front += [f"  - {a}" for a in aliases]
tags = fm.get("tags") or []
if tags:
    front.append("tags:")
    front += [f"  - {t}" for t in tags]
props = dict(fm.get("properties") or {})
props.setdefault("total_questions", total)
for k, v in props.items():
    if isinstance(v, str) and not re.fullmatch(r"[\w./@-]+", v):
        front.append(f'{k}: "{v}"')
    else:
        front.append(f"{k}: {v}")
for c in fm.get("cssclasses") or []:
    if c == (fm.get("cssclasses") or [])[0]:
        front.append("cssclasses:")
    front.append(f"  - {c}")
front += ["---", ""]

toc_cfg = meta.get("toc", {})
toc = []
if toc_cfg:
    toc = [f"> [!abstract]- {toc_cfg.get('title', 'विषय-सूची')}"]
    if toc_cfg.get("extra_first"):
        toc.append("> - " + toc_cfg["extra_first"].format(total=total))
    for s in sections_meta:
        toc.append(f"> - [[#{s['heading']}]]")
    for name in toc_cfg.get("extra_links") or []:
        toc.append(f"> - [[#{name}]]")
    toc.append("")

diagram = meta.get("diagram") or []
mermaid = []
if diagram:
    mermaid = ["```mermaid", "graph TD"]
    ids = []
    for i, label in enumerate(diagram):
        nid = "P" if i == 0 else f"S{i}"
        ids.append(nid)
        quoted = label.replace('"', '\\"')
        mermaid.append(f'    {nid}["{quoted}"]')
    mermaid.append("    " + " --> ".join(ids))
    mermaid.append("```")

table = []
if key_cfg:
    table = [
        "| " + " | ".join(["प्रश्न", "उत्तर"] * columns) + " |",
        "|" + "---|" * (2 * columns),
    ]
    rows = (total + columns - 1) // columns
    for r in range(rows):
        cells = []
        for c in range(columns):
            q = r + c * rows + 1
            cells.append(
                f"{q} | {link_tpl.format(q=q, a=letters.get(q, '?'))}" if q <= total else "| "
            )
        table.append("| " + " | ".join(cells) + " |")

head = [meta.get("h1", ""), ""]
head += toc
if meta.get("exam_details"):
    head += callout("abstract", meta["exam_details"].get("title", "परीक्षा विवरण"), meta["exam_details"].get("text", "")) + [""]
if meta.get("about"):
    head += callout("info", meta["about"].get("title", "इस हल-पुस्तिका के बारे में"), meta["about"].get("text", "")) + [""]
head += mermaid + [""] if mermaid else []
if key_cfg:
    head += [key_cfg.get("heading", "## उत्तर कुंजी (Answer Key)"), ""]
    if key_cfg.get("tip_text"):
        head += callout("tip", key_cfg.get("tip_title", ""), key_cfg["tip_text"]) + [""]
    head += table + [""]
    stats = key_cfg.get("stats_note", "आँकड़े — कुल प्रश्न: **{total}** • उत्तर भरे गए: **{filled}** • शेष: **{missing}**")
    stats = stats.format(
        total=total,
        filled=total - len(missing),
        missing="कोई नहीं" if not missing else ", ".join(map(str, missing)),
    )
    head += callout("note", stats, "") + [""]
head += ["---", ""]

# ----------------------------------------------------------------- closing blocks
tail = []
closing = meta.get("closing") or []
if closing:
    tail += ["---", ""] + closing + [""]

src = meta.get("sources") or {}
if src.get("items"):
    tail += ["---", "", src.get("heading", "## स्रोत (Sources)"), ""]
    tail += callout("cite", src.get("title", ""), "\n".join(
        f"- [{it['label']}]({it['url']})" for it in src["items"]
    )) + [""]

chk = meta.get("checklist") or {}
if chk.get("items"):
    tail += [chk.get("heading", "## पुनरावृत्ति चेकलिस्ट (Revision Tracker)"), ""]
    tail += [f"- [ ] {it}" for it in chk["items"]] + [""]

if meta.get("build_note"):
    tail += [meta["build_note"], ""]

final = "\n".join(front + head + body_lines + tail)
final = re.sub(r"\n{3,}", "\n\n", final)
if not final.endswith("\n"):
    final += "\n"

# plain copy = same content minus Obsidian-only syntax
plain_lines, in_callout = [], False
for line in final.split("\n"):
    m = re.match(r"^> \[!\w+\][-+]?\s*(.*)$", line)
    if m:
        in_callout = True
        title = m.group(1).strip()
        plain_lines.append(f"**{title}**" if title else "")
        continue
    if in_callout and line.startswith(">"):
        plain_lines.append(re.sub(r"^>\s?", "", line))
        continue
    in_callout = False
    plain_lines.append(line)
plain = "\n".join(plain_lines)
plain = re.sub(r"^---\ntitle:.*?\n---\n\n", "", plain, flags=re.S)
plain = plain.replace("\\|", "|")
plain = re.sub(r"\[\[#([^\]|]+)\|([^\]]+)\]\]", r"\2", plain)
plain = re.sub(r"\[\[#([^\]]+)\]\]", r"\1", plain)
plain = re.sub(r"%%[\s\S]*?%%\n?", "", plain)
plain = re.sub(r"\n{3,}", "\n\n", plain)

with open(out_path, "w", encoding="utf-8") as fh:
    fh.write(final)
with open(out_path + ".bak.txt", "w", encoding="utf-8") as fh:
    fh.write(plain)

print(f"assembled: {out_path}")
print(f"questions: {len(letters)}/{total} | missing: {missing if missing else 'none'} | sections: {len(sections_meta)}")
