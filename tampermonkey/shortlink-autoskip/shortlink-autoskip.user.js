// ==UserScript==
// @name         Shortlink Auto-Skip (timers + auto-continue)
// @namespace    https://github.com/arvindg4u/allrounder-fixes
// @version      1.0.0
// @description  Automates "wait 15 seconds / wait 10 seconds / click Continue" pages on earn-per-click short URL sites: speeds up countdowns, enables + clicks the Continue/Verify/Next/Get-Link button for every step and lands you on the final destination URL.
// @author       arvindg4u
// @license      MIT
// @run-at       document-start
// @noframes
// @icon         https://www.google.com/s2/favicons?sz=64&domain=gplinks.com
//
// ── Generic catch-all for "earn" shorteners (heuristic mode keeps it safe) ──
// @match        *://*/*
//
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// ==/UserScript==

/*
 * HOW IT WORKS (3 layers, in order of reliability)
 *
 *   1. Timer layer   – patches setTimeout/setInterval on the page so a 15s / 10s
 *                      countdown finishes almost instantly, and zeroes the usual
 *                      global counter variables (seconds, timeleft, counter, ...).
 *   2. Click layer   – a MutationObserver + slow poll looks for the step button
 *                      ("Continue", "Click here to continue", "Verify", "Next",
 *                      "Get Link", "Generate Link", "Skip Ad", "Go to link"),
 *                      un-disables / un-hides it and clicks it with real mouse
 *                      events. Repeats for every step until the final URL.
 *   3. Shortcut layer– known redirect patterns (?url=, ?r=, base64 payloads,
 *                      AdFly ysmm, canonical link) jump straight to the target.
 *
 * SAFETY
 *   - genericMode: 'heuristic' (default) only acts on pages that actually look
 *     like a shortlink gate (countdown text + a continue-ish button).
 *   - Ad / social / download-app buttons are blocklisted, popups are blocked,
 *     every element is clicked at most once and there is a per-page click cap,
 *     so the script cannot spin in a loop.
 *   - Toggle everything from the Tampermonkey menu (⚙ icon > this script).
 */

(function () {
    'use strict';

    /* ─────────────────────────── config ─────────────────────────── */

    const DEFAULTS = {
        enabled: true,
        // 'off' | 'heuristic' | 'aggressive'
        //  heuristic  -> only run when the page looks like a shortlink gate
        //  aggressive -> run on every page in KNOWN_HOSTS + anything that has a countdown
        genericMode: 'heuristic',
        speedUpTimers: true,
        speedFactor: 60,        // 15000ms countdown -> ~250ms
        minDelayToSpeed: 300,   // don't touch animation-ish timers
        maxDelayToSpeed: 300000,
        firstClickDelayMs: 600, // let the page settle before the first click
        clickIntervalMs: 700,   // how often we re-scan for the step button
        maxClicksPerPage: 15,
        hardFallbackMs: 15000,  // if nothing worked in 15s, try the loose scan
        giveUpMs: 90000,        // stop scanning entirely after this long
        blockPopups: true,
        followRedirectParams: true,
        showBadge: true,
        debug: false,
    };

    const G = (typeof GM_getValue === 'function')
        ? { get: (k, d) => GM_getValue(k, d), set: (k, v) => GM_setValue(k, v) }
        : {
            get: (k, d) => { try { const v = localStorage.getItem('sas_' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
            set: (k, v) => { try { localStorage.setItem('sas_' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
        };

    const CFG = {};
    Object.keys(DEFAULTS).forEach(k => { CFG[k] = G.get(k, DEFAULTS[k]); });

    const PAGE = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;
    const HOST = location.hostname.replace(/^www\./, '');

    // Native timers captured BEFORE we accelerate the page's ones, so the
    // script's own scheduling keeps real-world seconds.
    const NATIVE = {
        setTimeout: window.setTimeout.bind(window),
        setInterval: window.setInterval.bind(window),
        clearInterval: window.clearInterval.bind(window),
    };

    const log = (...a) => { if (CFG.debug) console.log('%c[auto-skip]', 'color:#0a0;font-weight:bold', ...a); };

    /* ─────────────────────── host knowledge base ────────────────────── */

    // Hosts that are *always* treated as a shortlink gate (no heuristic needed).
    // Add your own with the "Add this site" menu command.
    const KNOWN_HOSTS = [
        // big earn-per-click families
        'gplinks.com', 'gplinks.co', 'gplinks.in',
        'shrinkme.io', 'shrinkme.ink', 'shrinkme.site', 'shrinkme.us',
        'shrinkearn.com', 'shrinke.me', 'shrinklink.in',
        'adfoc.us', 'adf.ly', 'q.gs', 'j.gs',
        'ouo.io', 'ouo.press',
        'exe.io', 'exey.io', 'exeo.app',
        'za.gl', 'za.uy', 'zagl.xyz',
        'cutt.ly', 'ciy.ink', 'clk.sh', 'sh.st', 'shorte.st', 'destyy.com',
        'tmearn.com', 'tmearn.net', 'mitly.us', 'mdiskshortner.link',
        'earn4link.in', 'linkpays.in', 'link4earn.com', 'linksly.co',
        'droplink.co', 'dropgalaxy.in', 'rocklinks.net', 'link1s.com',
        'gyanilinks.com', 'go.linkbnao.com', 'indiadrive.in',
        'urlsopen.com', 'onepagelink.in', 'bindaaslinks.com',
        'techyinfo.in', 'shortlinkto.biz', 'try2link.com', 'mdisk.me',
        'srt.am', 'pdiskshortener.com', 'ez4short.com', 'oko.sh',
        'linkjust.com', 'just2earn.com', 'urlshortx.com', 'v.gd',
        'short.pe', 'shortzon.com', 'atglinks.com', 'birdurls.com',
        'crus.link', 'dalink.in', 'earnl.xyz', 'fc.lc', 'ez4mods.com',
    ].concat(G.get('customHosts', []));

    // Per-site fast paths (selectors that are known to be THE step button).
    const SITE_RULES = [
        { test: /gplinks\.(com|co|in)$/,  selectors: ['#verify_button', '#VerifyBtn', '#NextBtn', '#gplinks_btn', 'a.btn[href]:not([href="#"])'] },
        { test: /shrinkme\./,             selectors: ['#invisibleCaptchaShortlink', '#btn6', '#link-view'] },
        { test: /shrinkearn\.com$/,       selectors: ['#invisibleCaptchaShortlink', 'button[type="submit"]'] },
        { test: /adfoc\.us$/,             selectors: ['#skip', '.skip', '#showSkip a'] },
        { test: /(ouo\.io|ouo\.press)$/,  selectors: ['#btn-main', 'form#form-go button', 'button[type="submit"]'] },
        { test: /(exe\.io|exey\.io|za\.gl|za\.uy|fc\.lc|oko\.sh|clk\.sh|sh\.st)$/, selectors: ['#invisibleCaptchaShortlink', '#btn-main', 'button.get-link', 'button[type="submit"]'] },
        { test: /linkjust\.com$/,         selectors: ['#next-timer-btn', '#next-timer-btn button'] },
        { test: /(tmearn|mitly|earn4link|linkpays|rocklinks|droplink|link1s|try2link)\./, selectors: ['#invisibleCaptchaShortlink', '#btn-main', '#next', '.get-link'] },
    ];

    /* ───────────────────── text matchers for buttons ─────────────────── */

    const GOOD_TEXT = /(^|\b)(continue|click here to continue|click to continue|go to link|goto link|get link|get the link|generate link|create link|proceed|next|next step|skip ad|skip ads|skip|verify|human verification|i am human|i'm not a robot(?! *checkbox)|unlock|open link|full link|view link|claim link|download link|get url|start)(\b|$)/i;

    const BAD_TEXT = /(install|download app|get app|telegram|whatsapp|join|subscribe|follow|sign ?up|register|login|log in|create account|deposit|bet|casino|earn money|play now|invest|buy|offer|survey|allow|notification|vpn|antivirus|update your|cancel|back|home|report|contact|privacy|terms|disable adblock|turn off)/i;

    const AD_HOSTS = /(doubleclick|googlesyndication|googleadservices|adservice|propellerads|popads|popcash|adsterra|onclickads|revcontent|taboola|outbrain|mgid|hilltopads|monetag|clickadu|exoclick|juicyads|trafficstars|profitableratecpm|effectiveratecpm|highperformanceformat)\./i;

    const COUNTDOWN_TEXT = /(please wait|wait\s*\d|\d+\s*(seconds?|secs?|s\b)|countdown|timer|generating|preparing)/i;

    /* ───────────────────────── state / guards ───────────────────────── */

    // element -> { sig, at, n }  (lets us click the SAME button again on the next
    // step once its label/state changed, without ever hammering it in a loop)
    const clickLog = new WeakMap();
    const RECLICK_COOLDOWN_MS = 2500;
    const MAX_CLICKS_PER_ELEMENT = 4;
    let clickCount = 0;
    let started = false;
    let scanTimer = null;
    let badgeEl = null;

    // Cross-page loop guard: if we bounce through the same host too many times
    // in one session, stop touching it.
    const hopKey = 'sas_hops_' + HOST;
    const hops = (parseInt(sessionStorage.getItem(hopKey) || '0', 10) || 0) + 1;
    try { sessionStorage.setItem(hopKey, String(hops)); } catch (e) { /* ignore */ }
    const loopTripped = hops > 12;

    /* ───────────────── layer 1: timer acceleration ──────────────────── */

    function patchTimers() {
        if (!CFG.speedUpTimers) return;
        const speed = (delay) => {
            const d = Number(delay) || 0;
            if (d >= CFG.minDelayToSpeed && d <= CFG.maxDelayToSpeed) {
                return Math.max(1, Math.floor(d / CFG.speedFactor));
            }
            return delay;
        };
        ['setTimeout', 'setInterval'].forEach(name => {
            const orig = PAGE[name];
            if (typeof orig !== 'function' || orig.__sasPatched) return;
            const patched = function (fn, delay, ...rest) {
                try { delay = speed(delay); } catch (e) { /* ignore */ }
                return orig.call(this, fn, delay, ...rest);
            };
            patched.__sasPatched = true;
            try { PAGE[name] = patched; } catch (e) { log('cannot patch', name, e); }
        });
        log('timers accelerated x' + CFG.speedFactor);
    }

    const COUNTER_VARS = ['seconds', 'second', 'secs', 'sec', 'count', 'counter', 'countdown',
        'timeleft', 'timeLeft', 'time_left', 'timer', 'tmr', 'wait', 'waitTime', 'waittime',
        'remaining', 'i', 'x', 'n'];

    function zeroCounters() {
        COUNTER_VARS.forEach(name => {
            try {
                const v = PAGE[name];
                if (typeof v === 'number' && v > 0 && v <= 600) { PAGE[name] = 0; }
            } catch (e) { /* cross-origin / getter-only */ }
        });
        // visible "15" / "10" countdown labels
        document.querySelectorAll('span,div,b,strong,p,h1,h2,h3,#timer,.timer,#countdown,.countdown,#count,.count').forEach(el => {
            if (el.children.length) return;
            const t = (el.textContent || '').trim();
            if (/^\d{1,3}$/.test(t) && Number(t) > 0 && Number(t) <= 600) {
                const ctx = (el.parentElement ? el.parentElement.textContent : t) || '';
                if (COUNTDOWN_TEXT.test(ctx) || /timer|count|wait|sec/i.test(el.id + ' ' + el.className)) {
                    el.textContent = '0';
                }
            }
        });
    }

    /* ───────────── layer 1b: popup / new-tab blocking ───────────────── */

    function blockPopups() {
        if (!CFG.blockPopups) return;
        try {
            const origOpen = PAGE.open;
            PAGE.open = function (url) {
                log('blocked popup ->', url);
                return { closed: true, close() {}, focus() {}, blur() {}, postMessage() {}, document: { write() {}, close() {} } };
            };
            PAGE.open.__sasPatched = true;
            PAGE.__sasOrigOpen = origOpen;
        } catch (e) { /* ignore */ }

        // strip target=_blank so step links stay in this tab
        document.addEventListener('click', (e) => {
            const a = e.target && e.target.closest && e.target.closest('a[target="_blank"]');
            if (a && !AD_HOSTS.test(a.href || '')) a.removeAttribute('target');
        }, true);
    }

    /* ───────────── layer 3: direct redirect shortcuts ───────────────── */

    const REDIRECT_PARAMS = ['url', 'u', 'r', 'link', 'to', 'dest', 'destination', 'target',
        'redirect', 'redirect_url', 'goto', 'go', 'out', 'continue', 'next'];

    function looksLikeUrl(s) {
        return typeof s === 'string' && /^https?:\/\/[^\s"'<>]+$/i.test(s);
    }

    function b64(s) {
        try { return decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))); }
        catch (e) { try { return atob(s); } catch (e2) { return ''; } }
    }

    function fromParams() {
        if (!CFG.followRedirectParams) return null;
        const qs = new URLSearchParams(location.search);
        for (const key of REDIRECT_PARAMS) {
            const raw = qs.get(key);
            if (!raw) continue;
            let val = raw;
            try { val = decodeURIComponent(raw); } catch (e) { /* ignore */ }
            if (looksLikeUrl(val)) return val;
            const dec = b64(val);
            if (looksLikeUrl(dec)) return dec;
        }
        // trailing base64 in the path: /go/aHR0cHM6Ly8...
        const tail = location.pathname.split('/').filter(Boolean).pop() || '';
        if (tail.length > 16 && /^[A-Za-z0-9+/=_-]+$/.test(tail)) {
            const dec = b64(tail);
            if (looksLikeUrl(dec)) return dec;
        }
        return null;
    }

    // Classic AdFly / adf.ly style "ysmm" payload.
    function fromAdfly() {
        try {
            const ysmm = PAGE.ysmm;
            if (typeof ysmm !== 'string' || ysmm.length < 8) return null;
            let left = '', right = '';
            for (let i = 0; i < ysmm.length; i++) {
                if (i % 2 === 0) left += ysmm.charAt(i);
                else right = ysmm.charAt(i) + right;
            }
            let decoded = b64(left + right);
            decoded = decoded.substring(2);
            if (decoded.indexOf('dest=') > -1) decoded = decodeURIComponent(decoded.split('dest=')[1]);
            return looksLikeUrl(decoded) ? decoded : null;
        } catch (e) { return null; }
    }

    function tryShortcut() {
        const dest = fromParams() || fromAdfly();
        if (dest && dest.replace(/\/$/, '') !== location.href.replace(/\/$/, '')) {
            const destHost = (() => { try { return new URL(dest).hostname.replace(/^www\./, ''); } catch (e) { return ''; } })();
            if (destHost && destHost !== HOST && !AD_HOSTS.test(destHost)) {
                setBadge('jumping to destination…');
                log('shortcut ->', dest);
                location.replace(dest);
                return true;
            }
        }
        return false;
    }

    /* ─────────────── layer 2: find & click the step button ──────────── */

    function isVisible(el) {
        if (!el || !el.getBoundingClientRect) return false;
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return false;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none') return false;
        if (parseFloat(cs.opacity || '1') < 0.05) return false;
        return true;
    }

    function textOf(el) {
        return ((el.innerText || el.textContent || el.value || el.getAttribute('aria-label') || '') + '')
            .replace(/\s+/g, ' ').trim().slice(0, 80);
    }

    function signature(el) {
        return [el.tagName, el.id, el.className, textOf(el)].join('|');
    }

    function isDisabled(el) {
        if (el.disabled === true) return true;
        if (el.getAttribute && el.getAttribute('aria-disabled') === 'true') return true;
        if (el.classList && (el.classList.contains('disabled') || el.classList.contains('btn-disabled') || el.classList.contains('is-disabled'))) return true;
        try { if (getComputedStyle(el).pointerEvents === 'none') return true; } catch (e) { /* ignore */ }
        return false;
    }

    function mayClick(el) {
        const rec = clickLog.get(el);
        if (!rec) return true;
        if (rec.n >= MAX_CLICKS_PER_ELEMENT) return false;
        if (rec.sig !== signature(el)) return true;           // label/state changed -> next step
        return (Date.now() - rec.at) > RECLICK_COOLDOWN_MS;   // same button, gentle retry
    }

    function unlock(el) {
        try {
            el.disabled = false;
            el.removeAttribute('disabled');
            el.removeAttribute('hidden');
            el.classList.remove('disabled', 'btn-disabled', 'is-disabled', 'd-none', 'hide', 'hidden', 'invisible');
            if (el.style) {
                if (el.style.display === 'none') el.style.display = '';
                if (el.style.visibility === 'hidden') el.style.visibility = 'visible';
                el.style.pointerEvents = 'auto';
                el.style.opacity = '1';
            }
            // parent wrappers are often the hidden ones
            let p = el.parentElement, depth = 0;
            while (p && depth++ < 3) {
                if (p.style && p.style.display === 'none') p.style.display = '';
                if (p.classList) p.classList.remove('d-none', 'hide', 'hidden');
                p = p.parentElement;
            }
        } catch (e) { /* ignore */ }
    }

    function realClick(el) {
        const opts = { bubbles: true, cancelable: true, view: PAGE, button: 0 };
        try { el.scrollIntoView({ block: 'center' }); } catch (e) { /* ignore */ }
        // down/up only — the actual 'click' is fired once, below, so handlers
        // never run twice (that would skip a step or double-submit).
        ['pointerover', 'mouseover', 'pointerdown', 'mousedown', 'pointerup', 'mouseup'].forEach(type => {
            try {
                const Ev = type.startsWith('pointer') && PAGE.PointerEvent ? PAGE.PointerEvent : PAGE.MouseEvent;
                el.dispatchEvent(new Ev(type, opts));
            } catch (e) { /* ignore */ }
        });
        try {
            if (typeof el.click === 'function') el.click();
            else el.dispatchEvent(new PAGE.MouseEvent('click', opts));
        } catch (e) {
            try { el.dispatchEvent(new PAGE.MouseEvent('click', opts)); } catch (e2) { /* ignore */ }
        }
    }

    function score(el) {
        const t = textOf(el);
        const meta = (el.id + ' ' + (typeof el.className === 'string' ? el.className : '') + ' ' + (el.name || '')).toLowerCase();
        let s = 0;
        if (GOOD_TEXT.test(t)) s += 60;
        if (/\b(next|continue|verify|skip|generate|getlink|get-link|proceed|submit|go)\b/.test(meta)) s += 40;
        if (/\b(btn|button)\b/.test(meta)) s += 5;
        if (el.tagName === 'BUTTON' || el.tagName === 'INPUT') s += 10;
        if (el.tagName === 'A' && el.getAttribute('href') && el.getAttribute('href') !== '#') s += 10;
        if (el.form || el.type === 'submit') s += 8;
        if (BAD_TEXT.test(t)) s -= 120;
        if (el.tagName === 'A' && AD_HOSTS.test(el.href || '')) s -= 200;
        if (t.length > 45) s -= 20;
        return s;
    }

    function candidates(loose) {
        const sel = 'button, a, input[type="submit"], input[type="button"], [role="button"], .btn, .button';
        const out = [];
        document.querySelectorAll(sel).forEach(el => {
            if (!mayClick(el)) return;
            if (!loose && (!isVisible(el) || isDisabled(el))) return;
            const s = score(el);
            if (s >= (loose ? 30 : 50)) out.push({ el, s });
        });
        return out.sort((a, b) => b.s - a.s).map(o => o.el);
    }

    function siteSelectorTargets() {
        const rule = SITE_RULES.find(r => r.test.test(HOST));
        if (!rule) return [];
        const found = [];
        rule.selectors.forEach(sel => {
            document.querySelectorAll(sel).forEach(el => { if (mayClick(el)) found.push(el); });
        });
        return found;
    }

    function clickOnce(el, why) {
        if (!el || !mayClick(el)) return false;
        if (clickCount >= CFG.maxClicksPerPage) { setBadge('click limit reached'); stop(); return false; }
        const rec = clickLog.get(el) || { n: 0 };
        clickLog.set(el, { sig: signature(el), at: Date.now(), n: rec.n + 1 });
        clickCount++;
        unlock(el);
        realClick(el);
        log('clicked', why, '->', textOf(el) || el.id || el.className);
        setBadge('clicked "' + (textOf(el) || el.id || 'step') + '"');
        return true;
    }

    function step(loose) {
        if (!CFG.enabled) return;
        zeroCounters();

        for (const el of siteSelectorTargets()) {
            if (isVisible(el) || loose) { if (clickOnce(el, 'site-rule')) return; }
        }
        const list = candidates(loose);
        if (list.length) { clickOnce(list[0], loose ? 'loose-scan' : 'scan'); return; }

        // Nothing clickable yet: maybe the destination link is just sitting there.
        if (loose) {
            const a = Array.from(document.querySelectorAll('a[href^="http"]'))
                .filter(x => isVisible(x) && GOOD_TEXT.test(textOf(x)) && !AD_HOSTS.test(x.href))
                .find(x => { try { return new URL(x.href).hostname.replace(/^www\./, '') !== HOST; } catch (e) { return false; } });
            if (a) clickOnce(a, 'destination-link');
        }
    }

    /* ─────────────────────── page qualification ─────────────────────── */

    function isKnownHost() {
        return KNOWN_HOSTS.some(h => HOST === h || HOST.endsWith('.' + h));
    }

    function looksLikeGate() {
        const bodyText = (document.body ? document.body.innerText || '' : '').slice(0, 4000);
        const hasCountdown = COUNTDOWN_TEXT.test(bodyText) ||
            !!document.querySelector('#timer,.timer,#countdown,.countdown,#count,.counter,[id*="timer" i],[class*="countdown" i]');
        // NB: loose scan — on a gate the button is usually still disabled/hidden
        // at this point, which is exactly what we want to detect.
        const hasStepBtn = candidates(true).length > 0 ||
            !!document.querySelector('button[disabled], input[disabled][type="submit"], .btn.disabled, [aria-disabled="true"]');
        const smallPage = bodyText.length < 6000; // gate pages are tiny, real sites are not
        return hasCountdown && hasStepBtn && smallPage;
    }

    function shouldRun() {
        if (!CFG.enabled || CFG.genericMode === 'off') return false;
        if (loopTripped) { log('loop guard tripped on', HOST); return false; }
        if (isKnownHost()) return true;
        if (CFG.genericMode === 'aggressive') return true;
        return looksLikeGate();
    }

    /* ──────────────────────────── badge UI ──────────────────────────── */

    function addStyle(css) {
        if (typeof GM_addStyle === 'function') { GM_addStyle(css); return; }
        const s = document.createElement('style'); s.textContent = css;
        (document.head || document.documentElement).appendChild(s);
    }

    function setBadge(msg) {
        if (!CFG.showBadge) return;
        if (!badgeEl) {
            if (!document.body) return;
            addStyle(`#sas-badge{position:fixed;z-index:2147483647;right:12px;bottom:12px;background:#111;color:#0f6;
                font:12px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:8px 10px;border-radius:8px;
                box-shadow:0 2px 10px rgba(0,0,0,.4);max-width:260px;opacity:.92;cursor:pointer}
                #sas-badge b{color:#fff}#sas-badge small{color:#9aa;display:block;margin-top:2px}`);
            badgeEl = document.createElement('div');
            badgeEl.id = 'sas-badge';
            badgeEl.title = 'Click to stop auto-skip on this page';
            badgeEl.addEventListener('click', () => { CFG.enabled = false; stop(); badgeEl.innerHTML = '<b>auto-skip</b><small>stopped</small>'; });
            document.body.appendChild(badgeEl);
        }
        badgeEl.innerHTML = '<b>auto-skip</b><small>' + String(msg).replace(/[<>]/g, '') + '</small>';
    }

    function stop() {
        if (scanTimer) { NATIVE.clearInterval(scanTimer); scanTimer = null; }
    }

    /* ───────────────────────────── boot ─────────────────────────────── */

    // At document-start we only touch pages we already know are gates, so a
    // normal website never gets its timers or popups messed with.
    const earlyEngage = CFG.enabled && !loopTripped &&
        (isKnownHost() || CFG.genericMode === 'aggressive');
    if (earlyEngage) {
        patchTimers();
        blockPopups();
        zeroCounters();
        if (tryShortcut()) return;
    }

    function start() {
        if (started) return;
        if (!shouldRun()) { log('not a shortlink gate, idling on', HOST); return; }
        started = true;
        log('engaged on', HOST);
        if (!earlyEngage) {            // late engage: heuristic said "this is a gate"
            patchTimers();
            blockPopups();
            zeroCounters();
        }
        setBadge('waiting for the step button…');

        if (tryShortcut()) return;

        NATIVE.setTimeout(() => step(false), CFG.firstClickDelayMs);
        scanTimer = NATIVE.setInterval(() => {
            if (!CFG.enabled || clickCount >= CFG.maxClicksPerPage) { stop(); return; }
            step(false);
        }, CFG.clickIntervalMs);

        const mo = new MutationObserver(() => { zeroCounters(); });
        try { mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true }); } catch (e) { /* ignore */ }

        // Hard fallback: page fought us for 15s -> loosen the rules once.
        NATIVE.setTimeout(() => { if (CFG.enabled && clickCount === 0) { setBadge('fallback scan…'); step(true); } }, CFG.hardFallbackMs);
        NATIVE.setTimeout(() => { if (CFG.enabled && clickCount === 0) { setBadge('fallback scan…'); step(true); } }, CFG.hardFallbackMs * 2);
        NATIVE.setTimeout(() => { if (CFG.enabled && clickCount === 0) { setBadge('nothing to click — do it manually'); stop(); } }, CFG.giveUpMs);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
        window.addEventListener('load', () => NATIVE.setTimeout(start, 500), { once: true });
    } else {
        start();
    }

    // Gates often render their timer/button a second or two late, so keep
    // re-evaluating for a while (cheap: stops as soon as we engage).
    let retries = 0;
    const retryTimer = NATIVE.setInterval(() => {
        if (started || !CFG.enabled || ++retries > 20) { NATIVE.clearInterval(retryTimer); return; }
        start();
    }, 1000);

    /* ─────────────────────── Tampermonkey menu ──────────────────────── */

    if (typeof GM_registerMenuCommand === 'function') {
        const persist = (k, v) => { CFG[k] = v; G.set(k, v); };
        GM_registerMenuCommand((CFG.enabled ? '⏸ Disable' : '▶ Enable') + ' auto-skip', () => {
            persist('enabled', !CFG.enabled); location.reload();
        });
        GM_registerMenuCommand('🔁 Mode: ' + CFG.genericMode + ' (click to cycle)', () => {
            const order = ['heuristic', 'aggressive', 'off'];
            persist('genericMode', order[(order.indexOf(CFG.genericMode) + 1) % order.length]);
            location.reload();
        });
        GM_registerMenuCommand('➕ Always auto-skip ' + HOST, () => {
            const list = G.get('customHosts', []);
            if (!list.includes(HOST)) { list.push(HOST); G.set('customHosts', list); }
            location.reload();
        });
        GM_registerMenuCommand('🗑 Clear my site list', () => { G.set('customHosts', []); location.reload(); });
        GM_registerMenuCommand('🐞 Debug logs: ' + (CFG.debug ? 'on' : 'off'), () => { persist('debug', !CFG.debug); location.reload(); });
    }
})();
