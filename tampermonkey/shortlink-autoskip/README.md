# Shortlink Auto-Skip — Tampermonkey userscript

**v1.19.0** — modernises the script against what the current generation of gates does and what the popular bypass scripts (Bypass All Shortlinks v96.x, FastForward, uBlock's shortener filters) now ship: a **trust shield** for `event.isTrusted` checks, Cloudflare-challenge hands-off, chain-state cleanup so a *new* link after a finished chain still gets its timers skipped, realistic clicks (coordinates + pointer/touch warm-up), meta-refresh acceleration, ROT13/reversed/double base64 destination decoders, math-captcha solving, captcha-aware continuation, ad-frame immunity, dialog-trap removal, adblock-nag removal, `window.onurlchange` (SPA gates), and an **opt-in** bypass.city resolver for server-validated providers (linkvertise / work.ink / lootlink). Full details in [the v1.19 section](#-v119--researched-against-the-current-best-scripts).

**v1.18.0** — fixes the regression that broke normal gates: "back at the provider" now requires **actually leaving the host and returning**, so multi-step shorteners keep skipping timers and clicking as before.

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
| `test/mock-final-link.html` | The last step: the URL is generated **server-side**, so an early click returns `400 Bad Request` |
| `test/mock-wpsafelink.html` | Back on the shortener: 20s timer + Get Link, with the real URL hidden in the page as base64 |
| `test/mock-leet-gate.html` | Brazilian gate: `1/5` steps, Portuguese copy, button label obfuscated as `PR0SS3GU!R` |
| `test/mock-trusted-gate.html` | A gate whose click handler checks `event.isTrusted` and is armed only when the timer ends (Soralink/pahe style) |
| `test/mock-raf-gate.html` | A countdown driven by `requestAnimationFrame` + `performance.now()` (clock-consistency check) |
| `test/mock-math-gate.html` | A "Solve: 7 + 5 = ?" math-captcha gate |
| `test/mock-shortener-home.html` | The shortener's **own** site, where the chain ends and the script must stop |
| `test/mock-wp-first-hop.html` | A WordPress first hop stuffed with analytics/CDN URLs that must **not** be read as the destination |
| `test/final.html` | The "final URL" the mock redirects to |
| `test/run-tests.js` | Headless jsdom tests (no browser needed) |
| `bookmarklet/` | Builder + ready-made bookmarklet for browsers where Tampermonkey is blocked |
| `diagnose/` | One-tap page-diagnostics collector (dumps the gate's own code so an exact rule can be written) |

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

## 🩺 When a gate still wins: send a diagnostics dump

Guessing at a gate's internals wastes everyone's time. `diagnose/diagnose.js` (also built as
`diagnose/diagnose.bookmarklet.txt`, and offered on `bookmarklet/install.html` as **🩺 Auto-Skip
DIAGNOSE**) dumps, from the stuck page itself:

* URL, referrer, `step x/y`, visibility/focus state, whether the script engaged and what its badge says
* every clickable element — id, class, text, href, visible?, disabled?, inline `onclick`
* timer/verify/step-ish elements, iframes (and whether they're same-origin)
* **the gate's own inline `<script>` source** — the actual timer and verification logic
* localStorage / sessionStorage flags, cookie names, and relevant globals

It shows a panel with **Copy** and **Download .txt**. Nothing is uploaded anywhere. Send that text
and an exact rule can be written for the site instead of another guess.

## Why it used to say "loop detected" / "nothing to click" (fixed in v1.5)

Both of those messages were **my own guards misfiring**, not the gate winning:

* **Reloads counted as a loop.** These gates reload the same URL constantly (and so did the
  dead-end reload), so after the third load the guard declared a loop and switched everything off.
  Now a self-reload (`document.referrer === location.href`) is not counted, the threshold is 3
  revisits, and advancing a step (`step 2/3` → `3/3`) **clears the loop history completely**.
* **"Loop" no longer means "stop".** It switches to *cautious mode*: the timer, clock and
  visibility layers keep running and buttons that have never been clicked are still tried — only
  links back to pages already visited are refused.
* **The scan missed the button.** It only looked at `button / a / input / [role=button] / .btn`.
  Many of these gates render the step button as a `<div onclick>` or a styled `<span>`, so nothing
  was ever found. The scan now also covers `[onclick]`, `[class*=btn]`, `[class*=button]`,
  `[id*=verify|continue|getlink]`, and — as a last resort — any small visible element whose text
  is a step label.
* And it no longer clicks **its own badge** (whose "auto-skip" text matched "skip" — that badge is
  the stop button, so the script was switching itself off).

## Server-side waits: "400 Bad Request" on the final link (v1.6)

Two things no client-side trick can shorten: **their server's processing time**, and a wait they
validate on the backend. Speeding up `setTimeout` and `Date.now()` only makes the browser ask
*earlier* — and the answer is an error. v1.6 knows the difference between a fake wait and a real one:

* **Never outrun the backend.** `fetch` and `XMLHttpRequest` are tracked; while a request is in
  flight (or finished < 600ms ago) no button is pressed — the badge says *"waiting for their server
  to answer…"*. The first press of a `Get link` / `Download` / `Generate` button also gets a
  minimum 2.5s of real time after engaging.
* **Polite retry instead of hammering.** If the page comes back with *Bad Request / invalid token /
  expired / try again / 429*, the script **switches that host to honest mode for the rest of the
  session** — no timer patching, no clock warp, real waits — and retries after 3s, then 6s, then
  9s. Each error is counted once per click (a stale error message no longer inflates the backoff).
  After four failures it stops and hands the last click to you.
* **Sit the wait out once.** When the page says *"wait 15 seconds"* (or *15 सेकंड*), the script now
  computes one arm-time and waits for it, instead of click → fail → click → fail. Combined with
  per-URL state that survives the gate's reloads, step 2 resolves in one or two passes instead of
  the ~10 it was taking.

## 🖐 Assist mode — you tap, it just shows you where (v1.7)

Some steps can't be automated honestly: the last one is generated **on their server**, so the only
thing that knows when it's ready is the page in front of you. Instead of guessing, the script can
mark the buttons and get out of the way:

* **The real step button is outlined in pulsing RED** with a `👉 TAP THIS` tag; runners-up get an
  orange dashed outline (`#2`, `#3`), and the **ad/decoy buttons are greyed out and tagged `✕ ad /
  decoy`** so you never tap the trap. Tags follow the buttons as you scroll.
* **Nothing is clicked in assist mode** — timers, clock and the visibility shield still run, so the
  wait is still short; you just press the button yourself at the right moment.
* **How to turn it on:** tap the badge once (1st tap = assist, 2nd tap = off), or use the
  Tampermonkey menu → **🖐 Switch to ASSIST** / **🔴 Mark the real buttons now**.
* **Automatic handover.** If the final Get-Link step is rejected twice by their backend, the script
  stops racing, switches to assist and says *"press it when the page looks ready"*.

## ✅ Stopping at the destination

Once the chain lands on the real file URL, the automation must end — not start clicking on the file
host. The script now treats a known destination (`drive.google`, `mediafire`, `mega.nz`, `terabox`,
`pixeldrain`, `gofile`, `buzzheavier`, `hubcloud`, GitHub, archive.org … or any URL ending in
`.zip/.apk/.pdf/.mp4/…`) as the end of the road: it clears the chain state, shows
**"✅ destination reached — stopped here"** and touches nothing on that page.

## The last hop: back on the shortener (v1.8)

The full chain is: **shortener → partner blogs (several) → back to the shortener** for one final
timer + *Get Link*, which then throws you at MediaFire/Mega. Research into that last page shows the
timer is theatre — the destination is **already in the HTML**, base64-encoded:

* **wpsafelink**: `form#wpsafelink-landing` → `input[name=newwpsafelink]`, whose value is base64 →
  `JSON.parse(atob(v)).linkr`; or `div#wpsafe-link a[onclick]` carrying `?safelink_redirect=<base64>`
  → `.safelink` / `.second_safelink_url`.
* **Soralink** (the WordPress plugin most of these blogs run) gates with
  `#soralink-human-verif-main` → `#generater` → `#showlink`, plus countdown and "human verification".

So v1.8 stops trying to out-wait them:

* **Destination extraction.** The page is mined for the answer — the wpsafelink hidden input, the
  `safelink_redirect` onclick blob, `"safelink"/"linkr"/"url"` keys in inline scripts, any base64
  string that decodes to a URL or to JSON containing one, and `data-url`/`data-link` attributes.
  Anything pointing at a known file host is taken immediately; otherwise it waits ~4s first, so a
  legitimate intermediate step is never skipped. Ad hosts and same-host links are rejected.
* **Soralink sequence** is driven directly (`#soralink-human-verif-main` → `#generater` →
  `#showlink`, hiding `#pleasewaits`).
* **Origin awareness.** The shortener you started from is remembered; when the chain comes back to
  it the badge says *"back at vplink.in — last step, then I stop"*.
* **Hard stop, not one step further.** As soon as the real file URL is reached (MediaFire, Mega,
  Drive, Terabox, pixeldrain, gofile, …), the chain is marked finished, the state is cleared and the
  script goes idle — it will not click anything on the file host, and it will not re-engage on any
  further page of that chain.

## Obfuscated buttons and non-English gates (v1.9)

The Brazilian **Alpharede** network (`donpviral.xyz`, `rodaemotor.com`, … — the domains rotate)
splits one link across ~5 blog hops. That is deliberate: Alpharede pays its publishers
*per step* — "earn proportionally as the visitor progresses, even if they never reach the final
page". Two things there broke text matching completely:

* **Leetspeak labels.** The button reads `PR0SS3GU!R` and the instruction
  `Cl!qu3 n0 Anunc!0 e Agu4rd3 7 s3gund0s p4r4 pr0sseguiR`. No `continue|verify|next` pattern will
  ever match that. The script now **de-obfuscates** every label before matching: digits and symbols
  are mapped back to letters (`0→o 1→i 3→e 4→a 5→s 7→t !→i |→l @→a $→s`), accents are stripped and
  zero-width characters removed — so `PR0SS3GU!R` → `prosseguir`, `G3T L!NK` → `get link`. Matching
  runs against both the literal and the cleaned text, so nothing that worked before regresses.
* **Non-English copy.** Added Portuguese (`prosseguir`, `continuar`, `avançar`, `clique aqui`,
  `obter/gerar link`, `baixar`, `aguarde N segundos`), Spanish (`siguiente`, `obtener enlace`,
  `espere`) and Indonesian (`lanjut`, `klik di sini`, `tunggu`, `detik`) to the button, countdown
  and "click the ad" vocabularies — and `Publicidade / Anúncio / Publicidad / Iklan / Propaganda`
  to the never-click list.
* **`1/5` step counters.** Progress is now read from a bare `N/M` badge as well as
  `step/etapa/paso/passo/langkah N of M`, so the loop guard knows real progress is happening across
  five hops instead of thinking it is going in circles.

## The obfuscation arms race (v1.10)

These gates keep mangling their button labels to break text matching. The normalizer now undoes
every layer seen so far, and matching always runs against **both** the literal and the cleaned text:

| On the page | What the script reads |
| --- | --- |
| `PR0SS3GU!R` | `prosseguir` |
| `F!N𝗔L!ZAR` (Unicode math-bold `𝗔`) | `finalizar` |
| `CL!QU3 P𝗔R@ C0NT!NU𝗔R` | `clique para continuar` |
| `AGU4RD3. BL0QU&AD0? CL!QU& N0 ANuNC10 P4RA C0Nt1NU4R.` | `aguarde bloqueado clique no anuncio para continuar` |
| `Agu4rd3 7 s3gund0s` | `aguarde 7 segundos` (the **7 survives**) |

How it works:

* **NFKD normalisation** — the decisive fix for `𝗔`. Plain NFD leaves mathematical/fullwidth/circled
  letters untouched; NFKD folds them to ASCII (`𝗔`→`A`, `Ａ`→`A`, `ⓐ`→`a`).
* **Homoglyph table** for Cyrillic/Greek look-alikes (`а е о р с х` → `a e o p c x`), which Unicode
  normalisation deliberately will *not* fold, plus zero-width character stripping.
* **Context-aware leet mapping.** A digit/symbol is only translated when it touches a letter, so
  `7 s3gund0s` keeps its `7` while `s3gund0s` becomes `segundos`. Two passes handle runs like
  `ANuNC10` → `anuncio`.
* `&`→`e`, `@`→`a`, `$`→`s`, `!`→`i`, `|`→`l`, `£`→`l`, `#`→`h` … and the vocabulary now includes
  `finalizar`, `concluir`, `acessar`, `desbloquear`, and `bloqueado` as a wait/adblock-nag signal.

## 🛑 Stop when the chain comes back to the shortener (v1.11)

The route is: **shortener → partner blogs (up to 5 paid steps) → back to the shortener**. That
return is the end of the line — the script now recognises it and gets out of the way instead of
pressing one more button:

* **Provider detection.** A host counts as a shortener's own site if it is in the known list, or if
  its title/copy says so (*"URL shortener"*, *"shorten links and earn money"*, *"encurtador de
  links"*, *"acortador de enlaces"*, *"pemendek tautan"* — also de-obfuscated), or if it has the
  AdLinkFly publisher furniture (≥3 of `/login`, `/register`, `/dashboard`, `/payout`, `/publisher`
  …) together with earn/monetise wording.
* **Only when returning.** The stop needs `document.referrer` from *another* host plus an active
  chain — so opening a fresh shortener link still automates normally. Both cases are covered by
  tests.
* **What it does then:** clears the chain state, badges *"🛑 last step at <host> — tap the RED
  button yourself"*, switches to assist mode and marks the real button red. **Zero clicks** beyond
  that point.

### Why it works sometimes and not others

The ad these gates want you to visit is a **Monetag/Adsterra onclick popunder**: a new tab opens on
click, and you are expected to come back. Those networks **frequency-cap** the ads (Adsterra's
default is ~4 popunders per 2 hours, 10s apart), so on some loads no popunder fires at all and the
gate's "did you visit the ad?" state differs from load to load — that is the source of the
"sometimes it works" behaviour, not the button detection. The simulated ad round trip may therefore
need repeating, so it is now allowed to run again (spaced ~8s, max 3) while the page still nags.

Newest wording covered: `T0qu3 n0 Anúnc!0 Esp3r3 10 S3gund0s p4r4 d3str4v4r 0 pr0x!m0 p4ss0` and
`Aperte n0 Anúnc!0 … p4r4 s3gu!r 4v4nt3` → *toque/aperte no anúncio … destravar o próximo passo /
seguir avante*.

## Why the stop hook failed on vplink.in (fixed in v1.12)

It depended on two signals these gates deliberately break:

* **`document.referrer`** — stripped by `<meta name="referrer">` or by redirecting through JS, so
  "did we come from a partner blog?" was always *no*.
* **`sessionStorage`** — it is **per origin**, so the marker written on `vplink.in` is invisible on
  `donpviral.xyz` and vice-versa; the chain could never be tracked across the hop.

v1.12 uses three independent signals, any one of which triggers the stop:

1. **Per-host visit count** (per tab): the *second distinct page* of the same shortener host is a
   return. A plain reload does **not** count — the last URL is remembered.
2. **`GM_setValue` chain state**, which unlike `sessionStorage` is **shared across all domains**:
   when the chain starts at `vplink.in` that is recorded globally, so arriving at any shortener
   later in the chain is recognised immediately.
3. The old referrer check, kept as a bonus when the referrer survives.

## Why their timer felt slow (also fixed)

* **My bug:** once a site answered "400 Bad Request", *honest mode* (no timer patching, no clock
  warp) was switched on for that host **for the whole session** — so every later page on
  `vplink.in` ran at full real speed. It now **expires after 3 minutes**.
* **Their side:** countdowns driven by `requestAnimationFrame` were never touched, so they ran at
  full speed. rAF timestamps are now scaled like every other clock.
* **The part nobody can fix:** if the wait is **validated server-side**, no client trick shortens
  it — as userscript authors keep rediscovering ("the script did make the timer move faster but
  it's not registered… these use server-linked timers"). The script now stops fighting it: the
  forced loose scan kicks in at 7s (was 15s) and unlocks the button as soon as it *can* work.

## Two architectures, two rules (v1.13)

They really are different systems, and v1.12 confused them:

| | vplink-type (IN) | Alpharede-type (BR) |
| --- | --- | --- |
| Chain | shortener → blogs → **back to the shortener** | shortener → ~5 blog hops, paid per step |
| Gate | `Verify` + ad-visit + timer | obfuscated button + "toque no anúncio" + timer |
| Script must | **stop** when back at the shortener | keep solving every blog hop |

**Bug: it stopped on every site.** I had added the partner blogs (`entiredust.in`, `donpviral.xyz`,
`rodaemotor.com`, …) to `KNOWN_HOSTS`, and `isShortenerSite()` treated *any* known host as "the
provider" — so the second page of any blog tripped the stop. Now:

* `GATE_BLOG_HOSTS` is a separate list: those hosts are **gates to solve, never providers**.
* A page that looks like an article (`<article>`, many paragraphs, *"Voltar para artigos"*,
  categories/comments) is never a provider page.
* "Back at the provider" now means **the host this chain actually started from** (recorded in
  cross-domain `GM` storage), not "any shortener-ish host".

**Bug: obfuscation still slipping through.** Matching now uses the Unicode **UTS #39 skeleton**
approach recommended for exactly this problem — strip invisible/default-ignorable characters →
NFKD → **fold confusables before case folding** (a Greek capital `Ν` must stay `N`, not lowercase
into `ν`≈`v`) → context-aware leet mapping. Anything unknown becomes `?`, a wildcard, and a
**fuzzy matcher** (Levenshtein: 1 edit for short words, 2 for long) compares the result against the
step vocabulary. Verified decodings:

| Label on the page | Resolved |
| --- | --- |
| `PR0SS3GU!R` | prosseguir |
| `C0NT1NU@R` | continuar |
| `F!N𝗔L!ZAR` (math-bold) | finalizar |
| `𝐂𝐎𝐍𝐓𝐈𝐍𝐔𝐀𝐑` (math-bold) | continuar |
| `СОNTINUАR` (Cyrillic С О А) | continuar |
| `ᏟᎾΝΤΙΝUΑᎡ` (Cherokee + Greek) | continua? → matched fuzzily |

…while site furniture (`Publicidade`, `Categorias`, `Voltar para artigos`, `Sobre nós`) still
matches **nothing**, so the ad blocks stay untouched.

## Never wander off the chain (v1.14)

Step 5 of the Brazilian chain carries decoys that are not ads in the usual sense — a Discord
invite, a footer with *"Feito com ❤️ por …"* pointing at `generatepress.com`, plus the usual
menu/privacy links. Clicking any of them throws the whole chain away, which is exactly what was
happening. Three layers now prevent it:

* **Hard host blocklist** (`JUNK_LINK_HOSTS`): Discord, WhatsApp/`wa.me`, Telegram/`t.me`,
  Facebook, Instagram, X, TikTok, Reddit, LinkedIn … plus CMS/theme credits (`generatepress.com`,
  `wordpress.org`, `elementor.com`, `themesia.com`, `blogger.com`, `wix.com`) and app stores
  (`play.google.com`, `apps.apple.com`, Chrome Web Store). These are refused **in `mayClick`**, so
  no score, heuristic or fallback scan can ever click them.
* **Furniture exclusion**: anything inside `footer`, `nav`, `aside`, `.widget`, `.sidebar`,
  `.site-info`, `.copyright`, `.comments`, `.breadcrumb` is heavily penalised.
* **Decoy vocabulary**: `discord`, `servidor`, `grupo`, `canal`, `entre no`, `participe`,
  `inscreva`, `siga`, `curta`, `free fire`, `sorteio`, `apk`, `feito com`, `powered by`,
  `criado por`, `generatepress` are all treated as never-click text.

## Unknown providers (arolinks.com and whatever launches next week)

The stop hook no longer depends on recognising the brand. **The chain origin is simply the first
host the script engaged on** — recorded in cross-domain `GM` storage *and* in `sessionStorage`. Come
back to that host later and the script stops, marks the last button red and hands it to you. That
is what prevents the *"Get Link" → 400 Bad Request* ending on `arolinks.com/otj1` and anything like
it, with no host list to maintain.

## Stopping *properly* at the provider (v1.15)

v1.14 stopped clicking at the provider but still **skipped their timer**, because the timer/clock
patches are applied at `document-start` — long before the DOM exists and the stop decision is made.
The order is now fixed:

1. **A short path like `/otj1` marks the host as the chain origin immediately**, even if the script
   never engages there. That is what makes an unknown provider (`arolinks.com`) recognisable when
   you come back.
2. **The "are we back?" question is answered at `document-start`**, from `sessionStorage` +
   cross-domain `GM` state alone (a different page of the origin host, or a return more than 45s
   later). If the answer is yes, **nothing is patched at all** — no timer acceleration, no clock
   warp, no rAF scaling, no popup blocking.
3. If we only find out later (DOM-based detection), `restoreNative()` **puts `setTimeout`,
   `setInterval`, `Date`, `performance.now` and `requestAnimationFrame` back**, disables the script
   for that page and marks the button red.

So on the provider's final page the countdown ticks at its real speed and finishes normally — you
are not fighting a half-accelerated timer any more.

**Also softened:** the footer/menu penalty from v1.14 was heavy enough to bury a genuine
`Verify`/`Continue` that happens to sit inside a nav-ish wrapper (seen on `entiredust.in`). The
big penalty now applies only to *links* whose text is not a step word; buttons keep their score.

## "Destination reached" on the very first hop (fixed in v1.16)

`earnlinks.in/Er6J4` → `itiexamshala.com` announced *"destination reached"* immediately. Cause: the
v1.8 destination extractor scanned **all** inline scripts for `"url":"https://…"` and for any
base64 that decodes to a URL. Every WordPress page carries plenty of those — emoji settings, tag
manager, `admin-ajax.php`, CDN bundles — so the first blog hop always "contained the link".

The extractor is now split in two:

* **Strong sources** (trusted, acted on immediately): the wpsafelink hidden input, the
  `?safelink_redirect=` blob in an `onclick`, and JSON keys that only these plugins use
  (`safelink`, `linkr`, `second_safelink_url`).
* **Weak guesses** (generic base64, `data-url`, `redirect_url`…): used **only** when the URL points
  at a real file host (MediaFire, Mega, Drive, …). The old "wait 4s then navigate anyway" is gone.

Plus a blanket rejection list for things that are never your file: `.js/.css/.png/.woff/.json…`,
`/wp-content/`, `/wp-includes/`, `/wp-json/`, `/feed/`, and hosts like `googletagmanager`,
`google-analytics`, `gstatic`, `jsdelivr`, `cdnjs`, `cloudflare`, `disqus`, `recaptcha` — plus any
subdomain of the page you are already on.

## The last step is automatic again (v1.17)

v1.15 went too far: it stopped at the provider and asked you to tap a red button. The point of
stopping was never "make the user click" — it was **stop skipping their timer**, because that is
what produced `400 Bad Request`. Both are now true at once:

* **Honest timing on that page.** Every patch is reverted (`setTimeout`, `setInterval`, `Date`,
  `performance.now`, `requestAnimationFrame`), so their countdown runs at its real speed and their
  server sees a normal client.
* **Then it finishes for you.** A watcher polls every 700ms and acts the moment the control is
  genuinely ready — never while a countdown is still ticking or a request is in flight:
  1. an unlocked link (`a.get-link[href]:not(.disabled)`, `a#surl1`) → follow it;
  2. an unlocked button (`#invisibleCaptchaShortlink`, `button.get-link`, `#getlink`, `#btn-main`,
     `#verify_button`) → click it;
  3. a final form (`form#go-link`, `form#form-go`, `form#setc`) → submit it;
  4. otherwise the normal scored candidate.
* This mirrors what the established bypass scripts do on AdLinkFly pages — *"click
  `#invisibleCaptchaShortlink` when it enables"*, *"wait out the timer, then submit `form#go-link`"*
  — rather than racing the clock.
* **The red button is now only a fallback:** after ~2.5 minutes with no unlock, or after repeated
  server rejections, or if you choose it in the menu (**🏁 Last step: auto-finish / let me tap it**).

## The regression from v1.14–v1.17, and the fix (v1.18)

Blocking the junk links was not the problem — two *stop-hook* rules added alongside it were:

```
providerReturnEarly:   "a different page of this host"        -> returned true on page 2
returningToProvider:   "chain started on this host >8s ago"   -> returned true on page 2
```

Any shortener that runs several steps **on its own host** (vplink step 1 → vplink step 2, gplinks,
earnlinks) tripped those on its *second* page. The script then treated an ordinary gate as "the
final provider page": it reverted the timer patches, stopped skipping countdowns and either waited
honestly or asked you to tap. That is exactly the behaviour you reported.

**The fix: a host trail.** The chain now records the sequence of hosts it walks through in
cross-domain `GM` storage (consecutive duplicates collapsed):

```
vplink.in → entiredust.in → donpviral.xyz → vplink.in     ← a real return: last step
gplinks.com → gplinks.com                                  ← same host, just the next step
```

"Back at the provider" is true only when the current host appears **earlier** in that trail — i.e.
we left and came back. The `visits >= 2` and `age > 8s` shortcuts are gone. A referrer fallback
(different host + an origin marker written on an *earlier* page load) covers the bookmarklet, where
`GM` storage is unavailable.

Also fixed while testing this: the referrer fallback used the origin marker written by the *current*
page load, so the very first visit could look like a return. It now snapshots the marker before
anything writes to it.

**Guarded by a test:** *"same-host multi-step gate still skips the timer and clicks"* asserts the
timer **is** patched, the next page **is** reached, and the page is **not** treated as a provider
return.

## 🔬 v1.19 — researched against the current best scripts

Web research into what the leading tools do right now — **Bypass All Shortlinks v96.8** by
Bloggerpemula (~500k installs), its **Debloated** fork, **FastForward**, uBlock Origin's 2025-2026
shortener filter threads, and the bypass.city resolver — turned up one arms-race change and a
handful of gaps in our script. All of them are fixed here.

### The big one: `event.isTrusted` checks (why clicks "did nothing")

Soralink/pahe-style gates and modern AdLinkFly clones now register click handlers that check
`event.isTrusted` — browser-generated events are `true`, script-dispatched ones are `false`, and the
gate **silently ignores ours**. That is exactly the "script runs but nothing happens" symptom.
`isTrusted` cannot be forged on a real event, but the page only *reads* it inside the listener it
registered — so (like BloggerPemula's `TrustMe` and uBO's `trusted-click-element`):

* **Trust shield** — on pages we engage on, `EventTarget.prototype.addEventListener` is wrapped so
  every listener we did not register receives *untrusted* events through a Proxy that reports
  `isTrusted: true`. Real user events pass through completely untouched, and
  `removeEventListener` still works (the shim registry maps listener → shim). Installed at
  `document-start` on known hosts (before the page registers anything) and at engage time
  everywhere else — which still catches the Soralink trick of *registering the handler only when
  the timer hits zero*.
* **jQuery fallback** — for handlers registered *before* the shield went up, the gate's own jQuery
  handlers (`$._data(el,'events')`, including delegated ones on ancestors) are invoked directly
  with a hand-made trusted event — the workaround documented in the Debloated-fork issue tracker
  for exactly this anti-bypass technique.

### Chain-state pollution (why the *next* link stopped being automated)

The cross-domain `GM_setValue` host trail lived for 30 minutes and the `sas_done` marker was never
cleared — so opening a **new** short link after a finished chain (same tab, or another tab within
the TTL) was misread as *"back at the provider"*: honest timing, no timer skipping, and on unknown
hosts total idling. Now:

* the chain state is **cleared the moment a chain finishes** (destination reached *or* provider
  step completed);
* a **fresh short-code URL** (`site.com/AbCdE`) opened after 3 quiet minutes resets the trail,
  the done-marker and the per-host hop counter — a new chain starts clean;
* `sas_done` is stored as a timestamp and only honoured for 5 minutes;
* the chain's `at` field now records *last activity*, so a long-running chain never looks stale.

### Cloudflare & anti-bot challenges

"Just a moment…" pages (title match, `#challenge-form`, `/cdn-cgi/challenge-platform/` scripts) are
never touched — anything patched at `document-start` is restored as soon as the DOM reveals it.
The script also **never runs inside ad-network iframes** (`doubleclick`, `adsterra`, `propellerads`,
…): those are ads, not gate widgets, and clicking "Continue" inside one *is* clicking the ad.

### Realistic clicks

Synthetic events now carry **centered element coordinates** (gates that validate "the click landed
inside the button" reject default `(0,0)` events) and are preceded by `pointermove`/`mousemove`/
`touchstart` warm-up on the document — mirroring BloggerPemula's `ReadytoClick`. Forms with
`target="_blank"` are redirected to the same tab like links already were.

### Everything else that was added

* **`<meta http-equiv=refresh>` waits** are accelerated like timers (rewritten once per element —
  rewriting again would restart the browser's countdown).
* **`requestIdleCallback`** is patched alongside `setTimeout`/`setInterval`.
* **rAF clock fix** — `requestAnimationFrame` timestamps now come from the *same warped clock* the
  page reads via `performance.now()`. The old code mixed a warped baseline with raw frame
  timestamps, which could make rAF-driven countdowns compute garbage and never finish.
* **`window.onurlchange`** (granted) — SPA-style gates that move to the next step via
  `history.pushState` re-run the shortcut/engage logic instead of stalling.
* **Dialog traps** — `alert`/`confirm`/`prompt` nag loops and `onbeforeunload` traps are
  neutralised on engaged pages (BloggerPemula's `NoPrompts`).
* **Adblock-detector removal** — `blockAdBlock`/`FuckAdBlock`/`DisableDevtool`-style scripts are
  dropped as they load (BloggerPemula's `noAdb`), so they cannot stall the gate behind a
  "disable your adblock" wall.
* **`blurred`-style flags** — `window.blurred`, `adBlockDetected` & co. are cleared every scan
  (uBlock does the same for the linksfly family).
* **Math captchas** — "Solve: 7 + 5 = ?" next to an empty input is answered automatically
  (BloggerPemula's `BpAnswer`, trimmed down).
* **Captcha-aware continuation** — when a gate shows reCAPTCHA/hCaptcha/Turnstile, the script waits
  for the human to solve it and then continues with a **fresh click budget** instead of burning
  attempts against a button that cannot work yet.
* **More decoders** for the embedded-destination extractor: reversed base64 (work.ink style),
  double base64, ROT13, `\x68\x74…` hex-escaped and `%68%74…` percent-escaped URLs, plus URL-in-any-
  query-param (referrer/campaign params excluded) and URL-in-`#fragment` (plain or base64).
* **Current host list** — boost.ink/bst.gg/bst.wtf, cpmlink.net, adtival.network, linkspy.cc,
  shortit.pw, sfl.gl, 1short.io, cshort.org, lanza.me, paycut.pro, oke.io, adpaylink.com, bc.vc,
  urlsamo.com, cutpaid.com, ez4link.com, shrs.link, shareus.io and friends.
* **`@exclude` for big non-gate sites** (Google, YouTube, Facebook, X, Instagram, TikTok, Reddit,
  LinkedIn, Discord, Telegram, WhatsApp, Amazon, Netflix, Spotify, GitHub, Wikipedia, Microsoft,
  Apple, Cloudflare, PayPal, banks, AI chats, search engines, captcha hosts…) — mirroring what the
  popular scripts exclude, for performance and safety.
* **Firefox Xray safety** — page-scope function assignments go through `exportFunction` when
  available, so timer/popup patches cannot silently no-op on Firefox.

### Server-validated providers (linkvertise, work.ink, lootlink, admaven)

These compute the destination **on their server** after a validated wait — no client-side trick
works (the Debloated fork ships the same conclusion). v1.19:

* never bends time on those hosts (honest timing from the first hop, so the server never sees an
  impossible client);
* offers an **opt-in, OFF by default** menu command: **🔗 bypass.city resolver** — sends the link
  to the community `api.bypass.city` resolver via `GM_xmlhttpRequest` and jumps straight to a
  plausible, non-ad, non-junk answer. It is off because it shares the URL you opened with a
  third-party service; enable it only if you are comfortable with that.


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
* **Big-site exclusions.** Google, YouTube, Facebook, X, Instagram, TikTok, Reddit, LinkedIn,
  Discord, Telegram, WhatsApp, Amazon, Netflix, Spotify, GitHub, Wikipedia, Microsoft, Apple,
  Cloudflare, PayPal, banks, AI chats and search engines are `@exclude`d — the script never even
  loads there (same approach as the popular bypass scripts).
* **Challenge pages & ad iframes.** Cloudflare-style "Just a moment…" interstitials are never
  touched (patching their timers could break the challenge), and the script never runs inside
  ad-network iframes.
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
| 🏁 Last step | Switch the provider's final step between **auto-finish** (default) and "let me tap it" |
| 🔗 bypass.city resolver | **Opt-in, OFF by default**: ask the community resolver for linkvertise/work.ink/lootlink links (shares the URL with a third party) |
| 🖐 Switch to ASSIST | Stop clicking; mark the real button red so you tap it |
| 🔴 Mark the real buttons now | One-shot highlight without changing the mode |

Tuning knobs live in the `DEFAULTS` object at the top of the file
(`speedFactor`, `clickIntervalMs`, `maxClicksPerPage`, `hardFallbackMs`, `giveUpMs`, …).

## Built-in site list

Recognised out of the box (no heuristic needed): gplinks, shrinkme, shrinkearn, adfoc.us, adf.ly,
ouo.io, exe.io, za.gl, clk.sh / sh.st / shorte.st, tmearn, mitly, earn4link, linkpays, link4earn,
droplink, rocklinks, link1s, gyanilinks, urlsopen, try2link, oko.sh, fc.lc, pdisk/mdisk shorteners,
linkjust, cutt.ly, boost.ink, cpmlink, adtival, linkspy, shortit, sfl.gl, 1short.io, cshort,
lanza.me, paycut.pro, oke.io, adpaylink, bc.vc and ~40 more. Anything else is handled by the
heuristic — and you can pin a site permanently with the **➕ Always auto-skip** menu command.

> Not covered: gates that need a real human step (image captcha, reCAPTCHA checkbox,
> "press the key shown"). The script waits (and solves *math* questions automatically),
> un-hides what it can and then shows *"nothing to click — do it manually"* instead of guessing.

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
# PASS  waits for the server before "Get Link"
# PASS  recovers from a real "400 Bad Request"
# PASS  reads the embedded destination on the shortener's last page
# PASS  obfuscated gate (CL!QU3 P𝗔R@ C0NT!NU𝗔R + F!N𝗔L!ZAR, 1/5, pt-BR)
# PASS  a WordPress first hop is not mistaken for the destination
# PASS  a partner blog is never treated as the shortener
# PASS  same-host multi-step gate still skips the timer and clicks
# PASS  provider return: finishes the last step without skipping their timer
# PASS  provider return works with NO referrer at all
# PASS  UNKNOWN provider (arolinks-style) is finished honestly too
# PASS  provider return: countdown left at normal speed
# PASS  providerMode='assist' marks it red instead of clicking
# PASS  a fresh visit to the shortener is still automated
# PASS  assist mode marks a button red and clicks nothing
# PASS  stops at the destination file URL
# PASS  cautious mode: revisited page never re-follows the seen link
# PASS  bookmarklet build on the blog gate
# PASS  isTrusted-guarded handler accepts the synthetic click
# PASS  never touches a Cloudflare "Just a moment" page
# PASS  a NEW short link after a finished chain is still fully automated
# PASS  meta-refresh wait is accelerated
# PASS  math captcha solved and the gate passed
# PASS  rAF countdown finishes with the warped clock
# PASS  base64 URL in the #fragment is followed
# PASS  ignores a news article saying "30 seconds ago"
```

## Notes

Shortlink pages fund themselves with ads. Skipping them is your call — this only automates clicks
you would otherwise make yourself, in your own browser. Some services will detect unusually fast
completions and may block the link; if that happens, lower `speedFactor` (e.g. `3`) so the countdown
still takes a couple of seconds.
