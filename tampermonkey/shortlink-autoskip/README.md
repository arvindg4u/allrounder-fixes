# Shortlink Auto-Skip — Tampermonkey userscript

**v1.1.1** — handles vplink-style "partner blog" gates; clean metadata block (no ESLint warnings).

Automates the "wait 15 seconds → Continue → wait 10 seconds → Click here to continue → Get Link"
chain used by earn-per-click short URL sites, so you land on the **final destination URL / file**
without babysitting the tab.

| File | What it is |
| --- | --- |
| [`shortlink-autoskip.user.js`](shortlink-autoskip.user.js) | The userscript you install in Tampermonkey |
| `test/mock-shortlink.html` | A fake 3-step gate (15s → 10s → 5s) to verify it works, plus decoy ad buttons |
| `test/mock-blog-gate.html` | A **vplink-style** gate: long article, JS-injected countdown, hidden `CONTINUE` with a locked `href="#"` |
| `test/final.html` | The "final URL" the mock redirects to |
| `test/run-tests.js` | Headless jsdom tests (no browser needed) |

---

## Install

1. Install **Tampermonkey** (Chrome/Edge/Firefox/Brave) — or Violentmonkey, it works there too.
2. Open the raw file and Tampermonkey will offer to install it:
   `https://raw.githubusercontent.com/arvindg4u/allrounder-fixes/<branch>/tampermonkey/shortlink-autoskip/shortlink-autoskip.user.js`
   Or: Tampermonkey dashboard → **+** (new script) → paste the whole file → **File ▸ Save** (Ctrl+S).
3. Make sure the script is **enabled** and that Tampermonkey has
   *"Allow access to file URLs"* if you want to test it with the local mock page.

That's it — open a short link and it runs by itself.

## What it actually does

Three layers, applied in order:

1. **Timer layer** — patches the page's `setTimeout` / `setInterval` so a 15s or 10s countdown
   finishes in a fraction of a second, and zeroes the usual counter globals
   (`seconds`, `counter`, `timeleft`, …) and visible countdown labels.
2. **Click layer** — a scanner (poll + MutationObserver) finds the step button
   (*Continue, Click here to continue, Verify, Next, Get Link, Generate Link, Skip Ad, Go to link*),
   removes `disabled` / `hidden` / `pointer-events:none`, and clicks it with real
   pointer + mouse events. It repeats for **every** step until the destination loads.
3. **Shortcut layer** — if the destination is simply sitting in the URL
   (`?url=`, `?r=`, `?link=`, base64 in the path, AdFly `ysmm` payload, canonical link),
   it jumps straight there and skips the whole funnel.

Plus: popups / `window.open` ad tabs are blocked and `target="_blank"` is stripped from step links,
so the flow stays in one tab.

## vplink.in and other "partner blog" shorteners (v1.1)

`vplink.in`, `jrlinks`, `lksfy`, `softurl`, `shrinkforearn` … don't show the gate on their own domain —
they bounce you to a **rotating partner blog** (`onlinewish.in`, `crimejasoos.in`,
`theimmigrationworld.com`, new ones every week) where the timer is injected by JavaScript
*inside a 20 000-word article*, and the `CONTINUE` link starts as `<a href="#">` hidden in the page.
v1.0 ignored those pages. v1.1 handles them:

* **Signal-based gate detection** instead of "the page must be small": a *live* countdown (a number
  that actually ticks down), gate copy like *"CLICK BELOW & WAIT 15 SECONDS TO GET LINK"*, or a
  referrer/hop chain coming from a shortener — any one of those plus a locked/step button engages it.
* **Referrer chaining** – after the script engages once, the next hop (whatever random blog domain
  it is) is treated as part of the same chain for 10 minutes, so rotating domains don't matter.
* **Locked-href watcher** – when `href="#"` (or a `javascript:` stub) turns into a real off-site URL,
  it follows it immediately.
* **Reveal helpers** – un-hides `display:none` buttons and nudges the page scroll, because several of
  these gates only reveal `CONTINUE` when it scrolls into view.
* Built-in host list now includes vplink & friends and the known partner blogs.

What it still **cannot** do: gates that require a genuine ad visit before they mint the token
(*"click the ad and come back"*), image/math captchas, or server-side IP rate limits. Those are
server-checked, not client-side timers.

### ⚠ Nothing happens at all? Check this first (Android / Kiwi / Chrome)

If Tampermonkey shows the banner **"Please enable the `Allow User Scripts` extension setting"**,
then *no userscript runs at all* — the script isn't broken, the browser is blocking it.
Chrome-based browsers (Kiwi, Edge, Chrome 120+) require one of these:

1. Open `chrome://extensions` (Kiwi: ⋮ menu → **Extensions**).
2. Turn on **Developer mode** (toggle at the top of that page).
3. Chrome/Kiwi 138 or newer: tap **Tampermonkey → Details** and turn on
   **"Allow User Scripts"** (the per-extension toggle the banner is talking about).
4. Fully close and reopen the browser, then reload the Tampermonkey dashboard — the banner
   must be gone before anything can run.

If your build has no such toggle, **Firefox for Android + Tampermonkey** has no restriction and
runs this script as-is (Kiwi is discontinued and stuck on an old Chromium).

Quick way to confirm the script is alive: open any shortlink and look for the small dark
`auto-skip` badge in the bottom-right corner. No badge = the browser is still blocking userscripts
(or the page wasn't detected as a gate).

*(The red ESLint marker in the Tampermonkey editor — "Attributes should begin with @" — was only a
lint nag about the comment lines inside the metadata block; fixed in 1.1.1, it never affected
execution.)*

### If a site still doesn't work

1. Watch the `auto-skip` badge bottom-right — it says whether it engaged and what it clicked.
2. Tampermonkey menu → **🔁 Mode: heuristic → aggressive** (forces it to run on that page), and/or
   **➕ Always auto-skip <host>** on both the shortener *and* the blog it lands on.
3. Still stuck? Menu → **🩺 Copy gate diagnostics** — it copies the URL, referrer, detected signals
   and the top 25 clickable elements (id/class/text/score) to your clipboard. Paste that and an exact
   site rule can be added to `SITE_RULES`.

## Safety rails (why it won't break normal browsing)

* **Heuristic mode (default).** The `@match *://*/*` is broad, but on an unknown site the script
  does nothing unless the page *looks* like a gate: countdown text **and** a continue-ish button
  **and** a small page. Ordinary websites are left completely alone — it doesn't even touch their
  timers (timer patching only happens on a known host or once a gate is confirmed).
* **Ad blocklist.** Buttons saying *Download App, Join Telegram, Subscribe, Register, Play now,*
  *Deposit, Allow notifications…* score negative and are never clicked. Links pointing at known
  ad networks are excluded too.
* **No loops.** Each element can be clicked at most 4 times (only after its label/state changed, or
  after a 2.5s cooldown), max 15 clicks per page, and a per-session hop counter disables the script
  on a host that bounces you more than 12 times.
* **Visible kill switch.** A small `auto-skip` badge appears bottom-right; click it to stop
  immediately on that page.

## Tampermonkey menu (⚙ / script icon → this script)

| Command | Effect |
| --- | --- |
| ⏸ / ▶ Enable–Disable auto-skip | Global on/off |
| 🔁 Mode: heuristic → aggressive → off | `aggressive` runs on every page (use only if a site is stubborn), `off` disables detection |
| ➕ Always auto-skip *this host* | Adds the current domain to your permanent list |
| 🗑 Clear my site list | Empties that list |
| 🐞 Debug logs | Prints every decision (including gate signals) to the console |
| 🩺 Copy gate diagnostics | Copies a JSON dump of the page's buttons + detected signals for bug reports |

Tuning knobs live in the `DEFAULTS` object at the top of the file
(`speedFactor`, `clickIntervalMs`, `maxClicksPerPage`, `hardFallbackMs`, `giveUpMs`, …).

## Built-in site list

Recognised out of the box (no heuristic needed): gplinks, shrinkme, shrinkearn, adfoc.us, adf.ly,
ouo.io, exe.io, za.gl, clk.sh / sh.st / shorte.st, tmearn, mitly, earn4link, linkpays, link4earn,
droplink, rocklinks, link1s, gyanilinks, urlsopen, try2link, oko.sh, fc.lc, pdisk/mdisk shorteners,
linkjust, cutt.ly and ~40 more. Anything else is handled by the heuristic — and you can pin a site
permanently with the **➕ Always auto-skip** menu command.

> Not covered: gates that need a real human step (image captcha, reCAPTCHA checkbox, math question,
> "press the key shown"). The script waits, un-hides what it can and then shows
> *"nothing to click — do it manually"* instead of guessing.

## Test it without installing

```bash
cd tampermonkey/shortlink-autoskip
python3 -m http.server 8080          # then open:
# http://localhost:8080/test/mock-shortlink.html?auto=1   -> classic 15s/10s/5s gate, auto-skipped
# http://localhost:8080/test/mock-blog-gate.html?auto=1   -> vplink-style blog gate, auto-skipped
# http://localhost:8080/test/mock-shortlink.html          -> plain, so you can see the waits
```

Headless version (CI-friendly):

```bash
npm i jsdom
node test/run-tests.js
# PASS  known shortener host (gplinks.com)
# PASS  unknown host, heuristic detection
# PASS  vplink-style blog gate (long article, hidden CONTINUE, locked href)
# PASS  stays idle on an ordinary website
# PASS  ignores a checkout page that has a .timer + Continue button
# PASS  ignores a news article saying "30 seconds ago"
```

## Notes

Shortlink pages fund themselves with ads. Skipping them is your call — this only automates clicks
you would otherwise make yourself, in your own browser. Some services will detect unusually fast
completions and may block the link; if that happens, lower `speedFactor` (e.g. `3`) so the countdown
still takes a couple of seconds.
