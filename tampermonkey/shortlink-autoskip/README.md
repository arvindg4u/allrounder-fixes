# Shortlink Auto-Skip — Tampermonkey userscript

**v1.4.0** — defeats the *popup-ad + "come back" + timer* gates: visibility/focus shield plus a simulated ad round trip.

Automates the "wait 15 seconds → Continue → wait 10 seconds → Click here to continue → Get Link"
chain used by earn-per-click short URL sites, so you land on the **final destination URL / file**
without babysitting the tab.

| File | What it is |
| --- | --- |
| [`shortlink-autoskip.user.js`](shortlink-autoskip.user.js) | The userscript you install in Tampermonkey |
| `test/mock-shortlink.html` | A fake 3-step gate (15s → 10s → 5s) to verify it works, plus decoy ad buttons |
| `test/mock-blog-gate.html` | A **vplink-style** gate: long article, JS-injected countdown, hidden `CONTINUE` with a locked `href="#"` |
| `test/mock-adgate.html` | An **entiredust-style** `step 2/3` gate: Hindi "click the photo" ad check, `Verify`, and a loop-back link |
| `test/mock-timed-verify.html` | The nastier variant: **no countdown is shown at all**, `Verify` just refuses to work for 10s |
| `test/mock-visit-gate.html` | The hardest one: popunder ad + Page-Visibility check (*did you leave and come back?*) + 15s timer |
| `test/final.html` | The "final URL" the mock redirects to |
| `test/run-tests.js` | Headless jsdom tests (no browser needed) |
| `bookmarklet/` | Builder + ready-made bookmarklet for browsers where Tampermonkey is blocked |

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

## 🔖 No-extension fallback: the bookmarklet (use this if Tampermonkey is blocked)

Kiwi's Chromium fork is old and discontinued: even with **Developer Mode** on, Tampermonkey 5.3+
(MV3) often can't get the `userScripts` permission, so the banner never goes away and *no* script
runs. Same engine, zero extensions required:

```bash
node bookmarklet/build-bookmarklet.js      # regenerate after editing the userscript
```

* `bookmarklet/shortlink-autoskip.bookmarklet.txt` — the `javascript:` URL (~25 KB, minified)
* `bookmarklet/install.html` — open it and tap **Copy bookmarklet** (works on a phone)

**Android setup (Kiwi / Chrome / Edge / Samsung Internet):**

1. Open `bookmarklet/install.html`, tap **Copy bookmarklet**.
2. Bookmark any page (☆), then **⋮ → Bookmarks → edit** that bookmark.
3. Name it `skip`, paste the copied text as the **URL**, save.
4. On a shortlink/gate page, type `skip` in the address bar and tap the bookmark suggestion.

The badge appears, countdowns are fast-forwarded and the step buttons get clicked. Because a
bookmarklet only starts *after* the page has loaded, tap it again on each new step page
(the userscript does that part automatically — the bookmarklet is the fallback, not the equal).

**Other options that work today:** Firefox for Android + Tampermonkey/Violentmonkey (full support,
no toggle needed), Edge Canary for Android, or the legacy MV2 build of Tampermonkey in Kiwi.

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

## Ad-visit gates and loops (v1.2)

Some gates (`entiredust.in`, and everything else built on the same WordPress kit) add a step that
isn't a timer at all:

> **You are currently on step 2/3.**
> ▼ LINK पाने और DOWNLOAD करने के लिए, **फोटो पर क्लिक करें, 15 सेकंड रुकें और फिर इसी पेज पर वापस आएं**
> **Verify** — Scroll down & click on **Continue** button for your destination link

`Verify` silently does nothing until their script has seen a click on the ad image, and the
`Continue` at the bottom links to *another article on the same blog* — so you get shuffled between
posts forever. v1.2 handles all of it:

* **Ad-click satisfier** — when the page asks you to click a photo/banner (English *or* Hindi), the
  script fires a real click on that image so their "you visited the ad" flag flips, while
  `preventDefault` + popup blocking make sure **the ad itself never opens**.
* **Verify before Continue** — verification buttons get priority; `Continue` is held back until no
  unclicked `Verify` remains.
* **Dead-element blacklist** — a button clicked twice with *zero* observable effect (URL, step
  counter, page text, button count all unchanged) is never clicked again.
* **URL trail + loop detection** — every page of the chain is remembered; links back to a page you
  already passed score −300, and if the same page shows up 3 times the script stops and tells you:
  *"loop detected — this gate needs one manual step"* instead of burning clicks.
* **Step awareness** — `step 2/3` is parsed and shown on the badge, so you can see real progress.
* Multilingual button text: जारी रखें, आगे बढ़ें, यहाँ क्लिक, डाउनलोड लिंक, सत्यापित …

## Timer-armed `Verify` buttons (v1.3)

On `entiredust.in` and friends there is often **no visible countdown**: the page just keeps its
`Verify` button inert until its own timer (10–50s) expires, then `Verify` → `Continue` works.
v1.2 made this *worse* — it clicked Verify immediately, saw no effect, and blacklisted the one
button that mattered. v1.3 changes the policy:

* **No permanent blacklist.** A button that did nothing is only *deprioritised*; it is retried with
  backoff (2.5s → 6s → 12s → 20s → 30s → 45s, up to 7 attempts) and instantly re-armed whenever its
  label, state or the page fingerprint changes. Patient, but never spammy.
* **Clock warping.** Countdown code that polls `Date.now()` / `new Date()` / `performance.now()`
  (instead of `setTimeout`) can't be sped up by patching timers, so on gate pages the script now
  runs the page's clock `speedFactor`× faster as well. A 50-second wall-clock gate arms in about a
  second. (Turn it off with `warpClock: false` if a site checks timing server-side.)
* **Waits while a countdown is visibly ticking** instead of wasting attempts on a button that isn't
  armed yet — the badge says *"their timer is running — waiting for Verify to arm"*.
* **Iframe support.** `@noframes` is gone: gate widgets that live in an iframe get clicked too
  (inside frames the script only clicks — no badge, no navigation shortcuts).

## Popup-ad "go away and come back" gates (v1.4) — how they actually work

Research on this gate family (Safelink/Soralink-style WordPress kits, and what the big bypass
scripts + uBlock filters do about them) shows they don't rely on a countdown at all. They use:

1. **The Page Visibility API** — `document.hidden` / `visibilityState` / the `visibilitychange`
   event, plus `window.blur`/`focus` and `document.hasFocus()` — to check that you *left the tab
   for the ad and returned*. Their timer is usually started **on your return**, not on page load.
2. **A popunder** via `window.open`, whose returned window object they keep and poll (`w.closed`);
   a `null` return also doubles as adblock detection.
3. A wall-clock (`Date.now()`) wait after the return, which `setTimeout` patching can't shorten.

That's why the mainstream scripts neutralise exactly those events (Bloggerpemula's `EnableRCF`
force-fires `stopImmediatePropagation` on `visibilitychange`/`blur`/`focus`/`mouseleave`, and
uBlock's shortener filters use `+js(aeld, /visibilitychange|focus|blur/)` and
`+js(set, document.hidden, …)`).

v1.4 implements both halves, because the two cases need opposite behaviour:

* **Visibility / focus shield (default on).** `document.hidden` → `false`,
  `visibilityState` → `visible`, `hasFocus()` → `true`, and `blur` / `visibilitychange` /
  `pagehide` / `mouseleave` are swallowed. Their timer keeps running and never resets when you
  switch tabs.
* **Simulated ad round trip.** When the page's copy asks for it (*"click the ad, wait 15 seconds
  and come back"*, *"फिर इसी पेज पर वापस आएं"*) — or when a `Verify` button stays inert — the
  script briefly drops the shield and fakes the whole trip: `hidden` + `visibilitychange` + `blur`
  + `pagehide`, the fake popup reports itself open, then `visible` + `visibilitychange` + `focus` +
  `pageshow` with the popup reported closed. The gate believes you visited the ad; **no ad ever
  opens**. Up to 3 attempts, each one granting the buttons a fresh retry budget.
* **Believable fake popup.** `window.open` now returns a real-looking window object that is
  `closed: false` and flips to `closed: true` after ~1.5s, instead of an obviously-dead stub
  (which some gates read as "adblock user").
* **Dead-end reload.** Pages that insist *"click any ad and keep it open for 15 seconds"* get one
  automatic reload (once per URL) — the standard trick for those.
* Buttons are never machine-gunned: minimum 1.5s between clicks on the same element.

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
# PASS  ad-gate "click the photo" step 2/3
# PASS  timer-armed Verify with no visible countdown
# PASS  popup-ad visit gate
# PASS  loop guard stops after revisiting the same page
# PASS  bookmarklet build on the blog gate
# PASS  ignores a news article saying "30 seconds ago"
```

## Notes

Shortlink pages fund themselves with ads. Skipping them is your call — this only automates clicks
you would otherwise make yourself, in your own browser. Some services will detect unusually fast
completions and may block the link; if that happens, lower `speedFactor` (e.g. `3`) so the countdown
still takes a couple of seconds.
