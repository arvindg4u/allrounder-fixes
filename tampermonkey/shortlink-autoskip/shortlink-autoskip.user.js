// ==UserScript==
// @name         Shortlink Auto-Skip (timers + auto-continue)
// @namespace    https://github.com/arvindg4u/allrounder-fixes
// @version      1.14.0
// @description  Automates "wait 15 seconds / wait 10 seconds / click Continue" pages on earn-per-click short URL sites: speeds up countdowns, enables + clicks the Continue/Verify/Next/Get-Link button for every step and lands you on the final destination URL. Handles blog-style gates (vplink & friends) too.
// @author       arvindg4u
// @license      MIT
// @run-at       document-start
// @icon         https://www.google.com/s2/favicons?sz=64&domain=gplinks.com
// @match        *://*/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @grant        GM_setClipboard
// ==/UserScript==

/*
 * NOTE: @match *://*\/* is a deliberate catch-all — the script stays completely
 * idle unless a page is detected as a shortlink gate (see looksLikeGate below).
 *
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
        // 'auto'   = click for me (default)
        // 'assist' = never click, just mark the real buttons RED so I tap them
        actionMode: 'auto',
        assistOnFinalStep: true,   // hand the server-generated last click to the human
        stopAtDestination: true,   // once the real file URL is reached: do nothing
        stopAtShortener: true,     // coming BACK to the shortener's own site = the end
        useEmbeddedDestination: true,  // read the destination out of the page instead of clicking
        speedUpTimers: true,
        warpClock: true,        // also speed up Date.now()/new Date() — many gates poll wall-clock
        visibilityShield: true, // never let the gate see the tab as hidden/unfocused
        simulateAdVisit: true,  // fake the "went to the ad and came back" round trip
        deadEndReload: true,    // reload once on "click an ad and keep it open" dead ends
        waitForNetwork: true,   // never click while the page is still talking to its server
        politeRetry: true,      // on "bad request"/error: slow down to honest timing and retry
        firstFinalClickMs: 2500,// minimum real wait before pressing "Get link" the first time
        speedFactor: 60,        // 15000ms countdown -> ~250ms
        minDelayToSpeed: 300,   // don't touch animation-ish timers
        maxDelayToSpeed: 300000,
        firstClickDelayMs: 600, // let the page settle before the first click
        clickIntervalMs: 700,   // how often we re-scan for the step button
        maxClicksPerPage: 30,
        hardFallbackMs: 7000,  // if nothing worked in 7s, force the loose scan
        giveUpMs: 90000,        // stop scanning entirely after this long
        blockPopups: true,
        satisfyAdClick: true,   // fire the "click the photo/ad" click WITHOUT letting it navigate
        loopDetect: true,       // stop clicking when a gate bounces you in circles
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
    // Gate widgets ("Verify") are often inside an iframe, so we no longer use
    // @noframes — but inside a frame we only click; no badge, no navigation.
    let IN_FRAME = false;
    try { IN_FRAME = window.top !== window.self; } catch (e) { IN_FRAME = true; }

    // Native timers captured BEFORE we accelerate the page's ones, so the
    // script's own scheduling keeps real-world seconds.
    const REAL_NOW = Date.now.bind(Date);
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
        // vplink family + the "partner blog" gates it hands off to
        'vplink.in', 'vplink.co', 'jrlinks.in', 'lksfy.com', 'lksfy.in',
        'softurl.in', 'linkshortify.in', 'shrinkforearn.in', '4hi.in',
        'indianshortner.com', 'dekhe.click', 'clk.wiki', 'go.tnshort.net',
        'alpharede.com', 'arolinks.com', 'arolinks.in', 'linkspay.in', 'shrinkforearn.xyz',
    ].concat(G.get('customHosts', []));

    // Partner blogs that HOST the gates. They are gates to be solved — never
    // "the shortener's own site", so the stop hook must never trigger on them.
    const GATE_BLOG_HOSTS = [
        'onlinewish.in', 'crimejasoos.in', 'theimmigrationworld.com', 'entiredust.in',
        'donpviral.xyz', 'rodaemotor.com',
    ].concat(G.get('customBlogHosts', []));

    function isGateBlogHost() {
        return GATE_BLOG_HOSTS.some(h => HOST === h || HOST.endsWith('.' + h));
    }

    // Does this page look like a content blog (article) rather than a
    // shortener's own front/landing page?
    function looksLikeBlogPage() {
        if (document.querySelector('article, .post-content, .entry-content, .single-post, [class*="post-body"]')) return true;
        const ps = document.querySelectorAll('p').length;
        const text = bodyText();
        if (ps >= 8 && text.length > 2500) return true;
        return /voltar para artigos|leave a comment|deixe um coment|categorias|posted (on|by)|by admin|read more|leia mais/i.test(text.slice(0, 20000));
    }

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
        { test: /(vplink|jrlinks|lksfy|softurl|linkshortify|shrinkforearn)\./, selectors: ['#verify_button', '#VerifyBtn', '#NextBtn', '#btn-main', '#getlink', '.get-link'] },
        // WordPress "human verification" blog gates used by vplink & co.
        // (Soralink / tpdev / generic wp-block-button reveals)
        { test: /.*/, selectors: [
            '#soralink-human-verif-main', '#soralink-generate', '#generater', '#showlink a', '#getlink',
            '#wpsafe-link a', '#wpsafegenerate', '#wpsafelinkhuman', '#wpsafe-generate',
            'form#wpsafelink-landing button[type="submit"]', '#surl1',
            '.tpdev-btn', '#tp98', '#rbtn', '#btn-continue', '#continue-btn',
            'a.skiptoken', '.wp-block-button__link[href]:not([href="#"]):not([href^="javascript"])',
        ], blogGateOnly: true },
    ];

    /* ───────────────────── text matchers for buttons ─────────────────── */

    const GOOD_TEXT = /(^|\b)(continue|click here to continue|click to continue|go to link|goto link|get link|get the link|generate link|create link|proceed|next|next step|skip ad|skip ads|skip|verify|human verification|i am human|i'm not a robot(?! *checkbox)|unlock|open link|full link|view link|claim link|download link|get url|start|jari rakhen|aage badhein|prosseguir|prossiga|continuar|continue para|avancar|avançar|proximo|próximo|clique aqui|clique para|obter link|gerar link|pegar link|baixar|pular|ir para o link|siguiente|obtener enlace|saltar|lanjut|lanjutkan|klik di sini|dapatkan link|tunggu|finalizar|finalize|concluir|acessar|abrir link|ir para|desbloquear|destravar|avante|seguir avante|proximo passo|avancar passo)(\b|$)|जारी\s*रखें|आगे\s*बढ़ें|यहाँ?\s*क्लिक|डाउनलोड\s*लिंक|लिंक\s*पाने|सत्यापित/i;

    const BAD_TEXT = /(install|download app|get app|telegram|whatsapp|join|subscribe|follow|sign ?up|register|login|log in|create account|deposit|bet|casino|earn money|play now|invest|buy|offer|survey|allow|notification|vpn|antivirus|update your|cancel|back|home|report|contact|privacy|terms|disable adblock|turn off|discord|servidor|grupo|canal|entre no|entrar no|participe|inscreva|siga|curta|free fire|sorteio|giveaway|apk|feito com|powered by|criado por|desenvolvido por|tema wordpress|generatepress|publicidade|publicidad|anuncio|propaganda|iklan|voltar para artigos|sobre nos|politica de privacidade|termos de servico|categorias|buscar posts)/i;

    // Hosts that are never the destination: social, chat, app stores and the
    // CMS/theme credits in the footer (generatepress.com & friends). Clicking
    // one of these throws the whole chain away, so it is a hard block.
    const JUNK_LINK_HOSTS = /(^|\.)(discord\.(gg|com)|whatsapp\.com|wa\.me|t\.me|telegram\.(me|org)|facebook\.com|fb\.(com|me)|instagram\.com|twitter\.com|x\.com|threads\.net|tiktok\.com|pinterest\.|reddit\.com|linkedin\.com|snapchat\.com|kwai\.com|generatepress\.com|wordpress\.(org|com)|woocommerce\.com|elementor\.com|themesia\.com|blogger\.com|wix\.com|squarespace\.com|cloudflare\.com|jquery\.com|bootstrap\.|play\.google\.com|apps\.apple\.com|chromewebstore\.google\.com|chrome\.google\.com|microsoft\.com|apple\.com|amazon\.|shopee\.|mercadolivre\.|aliexpress\.)/i;

    // Page furniture: menus, footers, widgets, credits — never the step button.
    const FURNITURE_SEL = 'footer, .footer, .site-footer, #footer, nav, .nav, .navbar, .menu, .site-navigation, aside, .sidebar, .widget, .credits, .site-info, .copyright, .comments, #comments, .breadcrumb';

    const AD_HOSTS = /(doubleclick|googlesyndication|googleadservices|adservice|propellerads|popads|popcash|adsterra|onclickads|revcontent|taboola|outbrain|mgid|hilltopads|monetag|clickadu|exoclick|juicyads|trafficstars|profitableratecpm|effectiveratecpm|highperformanceformat)\./i;

    const COUNTDOWN_TEXT = /(please wait|wait\s*\d|\d{1,3}\s*(seconds?|secs?)\b|countdown|count down|generating (your )?link|preparing (your )?link|link is being generated|aguarde|aguard\w*\s*\d|\d{1,3}\s*segundos?|espere|\d{1,3}\s*detik|gerando (o )?link|aguarde \d*\s*s\b|bloqueado)/i;

    /* ───────────────────────── state / guards ───────────────────────── */

    const ENGAGED_AT = REAL_NOW();
    const FINAL_BTN_TEXT = /(get\s*link|get\s*url|download|generate|create link|continue to|go to (the )?link)/i;
    let pendingVerifyFlag = false;

    // Buttons that did nothing YET. Never permanent: these gates arm their
    // Verify button only after their own timer expires, so a button that was
    // inert 3 seconds ago is very often the right button 10 seconds later.
    let coldElements = new WeakSet();

    // element -> { sig, at, n, fp }
    let clickLog = new WeakMap();
    // attempt 1 -> retry after 2.5s, then 6s, 12s, 20s, 30s …
    const BACKOFF_MS = [0, 2500, 6000, 12000, 20000, 30000, 45000];
    const MAX_CLICKS_PER_ELEMENT = 7;
    const MIN_CLICK_GAP_MS = 1500;
    let clickCount = 0;
    let started = false;
    let scanTimer = null;
    let badgeEl = null;

    // Cross-page loop guard: if we bounce through the same host too many times
    // in one session, stop touching it.
    const hopKey = 'sas_hops_' + HOST;
    const hops = (parseInt(sessionStorage.getItem(hopKey) || '0', 10) || 0) + 1;
    try { sessionStorage.setItem(hopKey, String(hops)); } catch (e) { /* ignore */ }

    // Trail of pages this chain has already shown us. Gates like entiredust.in
    // ("step 2/3" + "click the photo, wait 15s, come back") shuffle you between a
    // handful of articles forever; revisiting a URL is the tell.
    const HERE = location.href.split('#')[0];

    // Set once a site has rejected us for being too fast (see checkServerError).
    const slowKey = 'sas_slow_' + HOST;
    // Honest mode is a temporary punishment, not a life sentence: once a site has
    // rejected our timing we slow down for 3 minutes, then speed up again.
    const SLOW_MODE_TTL = 180000;
    let SLOW_MODE = false;
    try {
        const raw = sessionStorage.getItem(slowKey);
        if (raw) {
            const t = parseInt(raw, 10);
            SLOW_MODE = Number.isFinite(t) ? (Date.now() - t < SLOW_MODE_TTL) : true;
            if (!SLOW_MODE) sessionStorage.removeItem(slowKey);
        }
    } catch (e) { /* ignore */ }
    let trail = [];
    try { trail = JSON.parse(sessionStorage.getItem('sas_trail') || '[]'); } catch (e) { trail = []; }
    // A page that simply RELOADS itself (these gates do that constantly, and so
    // does our own dead-end reload) must not look like a loop. Only count a
    // revisit when we actually came here from somewhere else.
    let cameFromElsewhere = true;
    try {
        const ref = document.referrer ? document.referrer.split('#')[0] : '';
        cameFromElsewhere = !ref || ref !== HERE;
    } catch (e) { /* ignore */ }
    const seenBefore = trail.filter(u => u === HERE).length;
    if (!IN_FRAME && cameFromElsewhere) trail.push(HERE);
    if (trail.length > 30) trail = trail.slice(-30);
    try { sessionStorage.setItem('sas_trail', JSON.stringify(trail)); } catch (e) { /* ignore */ }

    // "You are currently on step 2/3" -> track real progress, not just clicks.
    function readStep() {
        const t = bodyText().slice(0, 5000);
        const m = t.match(/(?:step|etapa|paso|langkah|passo)\s*(\d{1,2})\s*(?:\/|of|out of|de|dari)\s*(\d{1,2})/i) ||
            // bare "1/5" badge these Brazilian gates put at the top of the page
            t.match(/(?:^|\s)(\d{1,2})\s*\/\s*(\d{1,2})(?:\s|$)/);
        if (!m) return null;
        const cur = Number(m[1]);
        const total = Number(m[2]);
        if (!(total >= 2 && total <= 12 && cur >= 1 && cur <= total)) return null;
        return { cur, total };
    }

    // Real progress (a higher "step x/y" than anything seen so far) clears the
    // whole loop history — you are not going in circles if you are advancing.
    function notePr0gress() {
        const st = readStep();
        if (!st) return;
        let best = 0;
        try { best = parseInt(sessionStorage.getItem('sas_step_best') || '0', 10) || 0; } catch (e) { /* ignore */ }
        if (st.cur > best) {
            try {
                sessionStorage.setItem('sas_step_best', String(st.cur));
                sessionStorage.setItem('sas_trail', JSON.stringify([HERE]));
                sessionStorage.setItem(hopKey, '1');
            } catch (e) { /* ignore */ }
            trail = [HERE];
            log('progress: step', st.cur, '-> loop history cleared');
        }
    }

    // "Cautious" is NOT "off": when we may be looping we still run the timer /
    // visibility layers and still click buttons we have never tried, we just
    // refuse to follow links that lead back to pages we already passed.
    const cautious = CFG.loopDetect && (hops > 15 || seenBefore >= 3);
    const loopTripped = false;

    // Honest mode: after a server rejection we stop bending time on this host.
    if (SLOW_MODE) {
        CFG.speedUpTimers = false;
        CFG.warpClock = false;
        CFG.speedFactor = 1;
        CFG.firstClickDelayMs = Math.max(CFG.firstClickDelayMs, 2500);
    }

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

    function patchClock() {
        if (!CFG.warpClock) return;
        try {
            const RealDate = PAGE.Date;
            if (!RealDate || RealDate.__sasPatched) return;
            const realNow = RealDate.now.bind(RealDate);
            const t0 = realNow();
            const warp = () => Math.round(t0 + (realNow() - t0) * CFG.speedFactor);
            const Warped = new Proxy(RealDate, {
                construct(target, args) {
                    return args.length === 0 ? new target(warp()) : new target(...args);
                },
                get(target, prop, recv) {
                    if (prop === 'now') return warp;
                    if (prop === '__sasPatched') return true;
                    return Reflect.get(target, prop, recv);
                },
            });
            PAGE.Date = Warped;
            const perf = PAGE.performance;
            if (perf && typeof perf.now === 'function') {
                const rn = perf.now.bind(perf);
                const p0 = rn();
                try { perf.now = () => p0 + (rn() - p0) * CFG.speedFactor; } catch (e) { /* read-only */ }
            }
            log('clock warped x' + CFG.speedFactor);
        } catch (e) { log('clock warp failed', e); }
    }

    // Some countdowns run on requestAnimationFrame timestamps rather than
    // setTimeout, so patching timers alone leaves them at full speed.
    function patchRaf() {
        if (!CFG.speedUpTimers) return;
        try {
            const orig = PAGE.requestAnimationFrame;
            if (typeof orig !== 'function' || orig.__sasPatched) return;
            const base = (PAGE.performance && PAGE.performance.now) ? PAGE.performance.now() : 0;
            const wrapped = function (cb) {
                if (typeof cb !== 'function') return orig.call(PAGE, cb);
                return orig.call(PAGE, (ts) => cb(base + (ts - base) * CFG.speedFactor));
            };
            wrapped.__sasPatched = true;
            PAGE.requestAnimationFrame = wrapped;
            log('rAF accelerated x' + CFG.speedFactor);
        } catch (e) { /* ignore */ }
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

    /* ───── layer 1d: don't outrun their server (fetch / XHR tracking) ──── */

    let inflight = 0;
    let lastNetAt = 0;
    let netDeferred = 0;

    function patchNetwork() {
        if (!CFG.waitForNetwork) return;
        try {
            const of = PAGE.fetch;
            if (typeof of === 'function' && !of.__sasPatched) {
                const wrapped = function (...args) {
                    inflight++;
                    const settle = () => { inflight = Math.max(0, inflight - 1); lastNetAt = REAL_NOW(); };
                    let p;
                    try { p = of.apply(this, args); } catch (e) { settle(); throw e; }
                    try { p.then(settle, settle); } catch (e) { settle(); }
                    return p;
                };
                wrapped.__sasPatched = true;
                PAGE.fetch = wrapped;
            }
            const OX = PAGE.XMLHttpRequest;
            if (typeof OX === 'function' && !OX.__sasPatched) {
                const X = function () {
                    const x = new OX();
                    let counted = false;
                    try {
                        x.addEventListener('loadstart', () => { inflight++; counted = true; });
                        const done = () => {
                            if (counted) { inflight = Math.max(0, inflight - 1); counted = false; lastNetAt = REAL_NOW(); }
                        };
                        x.addEventListener('loadend', done);
                        x.addEventListener('error', done);
                        x.addEventListener('abort', done);
                    } catch (e) { /* ignore */ }
                    return x;
                };
                X.__sasPatched = true;
                X.prototype = OX.prototype;
                ['UNSENT', 'OPENED', 'HEADERS_RECEIVED', 'LOADING', 'DONE'].forEach((k, i) => { X[k] = i; });
                PAGE.XMLHttpRequest = X;
            }
            log('network tracking on');
        } catch (e) { log('network patch failed', e); }
    }

    // Busy = a request in flight, or one finished less than 600ms ago (the page
    // still has to render whatever came back before its button really works).
    function networkBusy() {
        if (!CFG.waitForNetwork) return false;
        return inflight > 0 || (lastNetAt && REAL_NOW() - lastNetAt < 600);
    }

    /* ───── server said no: slow down to honest timing and try again ────── */

    const ERROR_TEXT = /(bad request|400 -|error 400|403 forbidden|invalid (request|token|link|session)|something went wrong|an error (has )?occurred|link (has )?expired|session expired|try again later|access denied|too many requests|429|failed to (generate|create|fetch))/i;
    let serverErrorHandled = false;
    let serverErrors = 0;
    let lastErrorClick = -1;
    function checkServerError() {
        if (!CFG.politeRetry || serverErrorHandled || clickCount === 0) return;
        // Only count an error ONCE per click — the message stays on the page
        // afterwards, and re-counting it inflated the backoff to 9s+.
        if (lastErrorClick === clickCount) return;
        const t = bodyText().slice(0, 4000);
        if (!ERROR_TEXT.test(t)) return;
        const m = t.match(ERROR_TEXT);
        log('server error detected:', m && m[0], '- attempt', serverErrors + 1);
        serverErrors++;
        lastErrorClick = clickCount;
        serverErrorHandled = true;          // don't re-enter while we back off

        // "Bad request" here almost always means we outran their backend: the
        // real URL is still being generated. Stop bending time on this host and
        // simply try again after a few REAL seconds.
        SLOW_MODE = true;
        CFG.warpClock = false;
        CFG.speedUpTimers = false;
        CFG.speedFactor = 1;
        try { sessionStorage.setItem(slowKey, String(Date.now())); } catch (e) { /* ignore */ }

        if (CFG.assistOnFinalStep && serverErrors >= 3) {
            // Their backend, their rules: stop guessing when the token is ready
            // and let a human press it at the right moment.
            enterAssist('the server rejected our timing twice — press it when the page looks ready');
            return;
        }
        if (serverErrors >= 4) {
            setBadge('the site keeps rejecting the request — press the last button yourself');
            stop();
            return;
        }
        const waitMs = 3000 * serverErrors;      // 3s, 6s, 9s — real seconds
        setBadge('server said "' + (m && m[0] ? m[0] : 'error') + '" — waiting ' +
            (waitMs / 1000) + 's and trying again');
        NATIVE.setTimeout(() => {
            serverErrorHandled = false;
            clickLog = new WeakMap();            // let the same button be pressed again
            coldElements = new WeakSet();
            step(false);
        }, waitMs);
    }

    /* ─── layer 1c: visibility / focus shield + fake ad round trip ────── */

    // These gates decide whether you "really visited the ad" with the Page
    // Visibility API (document.hidden / visibilitychange) and window focus.
    //   shieldOn = true  -> page always looks visible+focused, so their timer
    //                       keeps running and never resets while you are away.
    //   a round trip     -> we deliberately fake hidden -> visible again, which
    //                       is what unlocks gates that REQUIRE you to leave.
    const openedPopups = [];
    let shieldOn = true;
    let fakeHidden = false;
    let roundTrips = 0;

    function defineGetter(obj, prop, getter) {
        try { Object.defineProperty(obj, prop, { configurable: true, get: getter }); } catch (e) { /* ignore */ }
    }

    function shieldVisibility() {
        if (!CFG.visibilityShield) return;
        const doc = (PAGE && PAGE.document) || document;
        defineGetter(doc, 'hidden', () => fakeHidden);
        defineGetter(doc, 'webkitHidden', () => fakeHidden);
        defineGetter(doc, 'mozHidden', () => fakeHidden);
        defineGetter(doc, 'msHidden', () => fakeHidden);
        defineGetter(doc, 'visibilityState', () => (fakeHidden ? 'hidden' : 'visible'));
        defineGetter(doc, 'webkitVisibilityState', () => (fakeHidden ? 'hidden' : 'visible'));
        try { doc.hasFocus = () => !fakeHidden; } catch (e) { /* ignore */ }

        const swallow = (e) => { if (shieldOn && !e.__sas) { e.stopImmediatePropagation(); } };
        ['blur', 'visibilitychange', 'webkitvisibilitychange', 'mozvisibilitychange',
            'msvisibilitychange', 'pagehide', 'mouseleave', 'freeze'].forEach(type => {
            try { doc.addEventListener(type, swallow, true); } catch (e) { /* ignore */ }
            try { PAGE.addEventListener(type, swallow, true); } catch (e) { /* ignore */ }
        });
        log('visibility shield on');
    }

    function fire(target, type) {
        try {
            const ev = new PAGE.Event(type, { bubbles: false, cancelable: false });
            ev.__sas = true;                    // our own events are never swallowed
            target.dispatchEvent(ev);
        } catch (e) { /* ignore */ }
    }

    // "Open the ad, wait, come back" — performed entirely inside this tab.
    function simulateAdRoundTrip(done) {
        if (!CFG.simulateAdVisit || roundTrips >= 3) return false;
        roundTrips++;
        const doc = (PAGE && PAGE.document) || document;
        setBadge('simulating the ad visit (nothing opens)…');
        log('ad round trip #' + roundTrips);

        shieldOn = false;                       // let THESE events through
        fakeHidden = true;
        openedPopups.forEach(w => { w.closed = false; });
        fire(doc, 'visibilitychange');
        fire(doc, 'webkitvisibilitychange');
        fire(PAGE, 'blur');
        fire(PAGE, 'pagehide');

        NATIVE.setTimeout(() => {
            fakeHidden = false;
            openedPopups.forEach(w => { w.closed = true; });
            fire(doc, 'visibilitychange');
            fire(doc, 'webkitvisibilitychange');
            fire(PAGE, 'focus');
            fire(PAGE, 'pageshow');
            shieldOn = true;
            clickLog = new WeakMap();      // new state -> fresh attempt budget
            coldElements = new WeakSet();
            log('ad round trip complete');
            if (done) done();
        }, 1200);
        return true;
    }

    // Last resort for "click any ad and keep it open for 15 seconds" dead ends:
    // reload the page once (the gate usually re-rolls into a passable state).
    function deadEndReload() {
        if (!CFG.deadEndReload || IN_FRAME) return;
        const t = bodyText();
        if (!/click\s+(on\s+)?(any\s+)?ads?\b[^.]{0,60}(keep|open|continue)|click\s+on\s+the\s+ads?\s+to\s+continue/i.test(t)) return;
        const key = 'sas_reload_' + HERE;
        try {
            if (sessionStorage.getItem(key)) return;
            sessionStorage.setItem(key, '1');
        } catch (e) { return; }
        setBadge('ad-wall dead end — reloading once');
        NATIVE.setTimeout(() => location.reload(), 1500);
    }

    /* ───────────── layer 1b: popup / new-tab blocking ───────────────── */

    function blockPopups() {
        if (!CFG.blockPopups) return;
        try {
            const origOpen = PAGE.open;
            PAGE.open = function (url) {
                // Hand back a believable window: gates (and adblock detectors) check
                // the return value, and popunder code polls `closed`. Nothing opens.
                const fake = {
                    closed: false, name: '', opener: PAGE, location: { href: url || '' },
                    close() { this.closed = true; }, focus() {}, blur() {}, postMessage() {},
                    document: { write() {}, close() {}, body: null },
                };
                openedPopups.push(fake);
                NATIVE.setTimeout(() => { fake.closed = true; }, 1500);
                log('blocked popup ->', url);
                return fake;
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

    // Soralink: #soralink-human-verif-main -> #generater -> #showlink
    function soralinkStep() {
        let acted = false;
        ['#soralink-human-verif-main', '#generater', '#showlink a', '#showlink'].forEach(sel => {
            const el = document.querySelector(sel);
            if (!el || !mayClick(el)) return;
            unlock(el);
            const wait = document.getElementById('pleasewaits');
            if (wait) wait.style.display = 'none';
            if (clickOnce(el, 'soralink ' + sel)) acted = true;
        });
        return acted;
    }

    function tryShortcut() {
        if (IN_FRAME) return false;      // navigating a frame gets us nowhere

        // Best case: the page already carries the destination (wpsafelink & co.)
        const embedded = extractEmbeddedDestination();
        if (embedded) {
            const isFile = FILE_HOSTS.test(new URL(embedded).hostname + '.');
            if (isFile || REAL_NOW() - ENGAGED_AT > 4000) {
                setBadge('found the real link in the page — going there');
                markChainDone('embedded destination');
                NATIVE.setTimeout(() => location.replace(embedded), 400);
                return true;
            }
            NATIVE.setTimeout(() => { if (CFG.enabled) tryShortcut(); }, 4200);
        }

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

    // Visible page text. innerText is what we want (it ignores <script>/<style>);
    // where it is unavailable we walk the text nodes ourselves instead of using
    // textContent, which would happily include inline script source.
    let btCache = { at: 0, val: '' };
    function bodyText() {
        const b = document.body;
        if (!b) return '';
        if (typeof b.innerText === 'string') return b.innerText;
        if (Date.now() - btCache.at < 400) return btCache.val;
        let out = '';
        try {
            const walker = document.createTreeWalker(b, NodeFilter.SHOW_TEXT, {
                acceptNode(node) {
                    const tag = node.parentNode && node.parentNode.nodeName;
                    return (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'TEMPLATE')
                        ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
                },
            });
            const parts = [];
            let n;
            while ((n = walker.nextNode())) parts.push(n.nodeValue);
            out = parts.join(' ');
        } catch (e) { out = ''; }
        btCache = { at: Date.now(), val: out };
        return out;
    }

    // These gates write their buttons as PR0SS3GU!R / C0NT!NU3 / G3T L!NK purely to
    // break text-matching bypass scripts. Undo that before matching anything.
    const LEET = {
        '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '6': 'g', '7': 't', '8': 'b', '9': 'g',
        '@': 'a', '$': 's', '!': 'i', '|': 'l', '£': 'l', '€': 'e', '+': 't', '¡': 'i', '¥': 'y',
        '&': 'e', '#': 'h', '*': 'x', '§': 's', '©': 'c', '®': 'r',
    };
    // Cyrillic / Greek look-alikes (NFKD cannot fix these — different letters)
    const HOMOGLYPH = {
        // Cherokee / Lisu / Coptic / Armenian look-alikes seen in these gates
        'Ꭺ': 'a', 'Ꮮ': 'l', 'Ꮯ': 'c', 'Ꭼ': 'e', 'Ꮋ': 'h', 'Ꭻ': 'j', 'Ꮶ': 'k', 'Ꮇ': 'm',
        'Ꮪ': 's', 'Ꭲ': 't', 'Ꮩ': 'v', 'Ꮃ': 'w', 'Ꭹ': 'y', 'Ꮓ': 'z', 'Ꮲ': 'p', 'Ꮢ': 'r',
        'Ⲣ': 'p', 'Ⲟ': 'o', 'Ⲥ': 'c', 'Ⲧ': 't', 'Ⲭ': 'x', 'Ⲛ': 'n', 'Ⲙ': 'm', 'Ⲕ': 'k',
        'Օ': 'o', 'Տ': 's', 'Ս': 'u', 'Ց': 'g', 'Ր': 'r', 'Ժ': 'd', 'Ի': 'h', 'Ն': 'u',
        'Ʀ': 'r', 'Ɛ': 'e', 'Ɩ': 'l', 'Ɵ': 'o', 'Ʊ': 'u', 'Ϲ': 'c', 'Ϝ': 'f', 'Ѕ': 's',
        // Greek / Cyrillic CAPITALS keep their Latin look-alike (Ν is an N, not a v)
        'Α': 'A', 'Β': 'B', 'Ε': 'E', 'Ζ': 'Z', 'Η': 'H', 'Ι': 'I', 'Κ': 'K', 'Μ': 'M',
        'Ν': 'N', 'Ο': 'O', 'Ρ': 'P', 'Τ': 'T', 'Υ': 'Y', 'Χ': 'X', 'Ϲ': 'C', 'Θ': 'O',
        'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 'О': 'O', 'Р': 'P',
        'С': 'C', 'Т': 'T', 'У': 'Y', 'Х': 'X', 'Ј': 'J', 'І': 'I', 'Ԛ': 'Q', 'Ԝ': 'W',
        'Ꭰ': 'D', 'Ꭼ': 'E', 'Ꮐ': 'G', 'Ꭺ': 'A', 'Ꮋ': 'H', 'Ꮅ': 'L', 'Ꮇ': 'M', 'Ꮎ': 'O',
        'Ꮒ': 'H', 'Ꮓ': 'Z', 'Ꮖ': 'P', 'Ꮘ': 'Q', 'Ꮚ': 'W', 'Ꮜ': 'S', 'Ꮝ': 'S', 'Ꮟ': 'B',
        'Ꮤ': 'W', 'Ꮧ': 'D', 'Ꮨ': 'T', 'Ꮪ': 'S', 'Ꮭ': 'L', 'Ꮮ': 'L', 'Ꮯ': 'C', 'Ꮳ': 'C',
        'Ꮷ': 'J', 'Ꮸ': 'C', 'Ꮼ': 'G', 'Ꮾ': 'V', 'Ᏸ': 'B', 'Ᏺ': 'G', 'Ᏼ': 'B', 'Ꭾ': 'O',
        'Ԁ': 'd', 'Ь': 'b', 'Ғ': 'f', 'Ԛ': 'q', 'Ԝ': 'w', 'Ⅰ': 'i', 'Ⅴ': 'v', 'Ⅹ': 'x',
        'а': 'a', 'в': 'b', 'с': 'c', 'ԁ': 'd', 'е': 'e', 'ѕ': 's', 'і': 'i', 'ј': 'j', 'к': 'k',
        'м': 'm', 'н': 'h', 'о': 'o', 'р': 'p', 'т': 't', 'у': 'y', 'х': 'x', 'ц': 'u', 'ѵ': 'v',
        'α': 'a', 'β': 'b', 'ε': 'e', 'ι': 'i', 'κ': 'k', 'ν': 'v', 'ο': 'o', 'ρ': 'p', 'τ': 't',
        'υ': 'u', 'χ': 'x', 'ѡ': 'w', 'ʀ': 'r', 'ɢ': 'g', 'ᴏ': 'o', 'ɪ': 'i', 'ʟ': 'l', 'ɴ': 'n',
    };

    // Turns  PR0SS3GU!R / F!N𝗔L!ZAR / BL0QU&AD0 / ANuNC10  into plain words, while
    // leaving standalone numbers alone ("7 s3gund0s" -> "7 segundos", "1/5" -> "1/5").
    function deleet(t) {
        if (!t) return '';
        let x = String(t)
            // UTS #39 step 1: drop invisible / default-ignorable characters
            .replace(/[\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180b-\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u206a-\u206f\u3164\ufe00-\ufe0f\ufeff\uffa0]/g, '')
            .normalize('NFKD')                                   // 𝗔 -> A, Ａ -> A, ⓐ -> a
            .replace(/[\u0300-\u036f]/g, '')                     // á -> a
            // UTS #39 skeleton step: fold confusables BEFORE case folding, so a
            // Greek capital Ν stays an N instead of lowercasing into ν ("v").
            // Unknown non-ASCII becomes '?', a wildcard the fuzzy matcher absorbs.
            .replace(/[^\x00-\x7f]/g, c => {
                if (HOMOGLYPH[c]) return HOMOGLYPH[c];
                const lower = c.toLowerCase();
                if (HOMOGLYPH[lower]) return HOMOGLYPH[lower];
                if (/[\u0900-\u097f]/.test(c)) return c;
                return '?';
            })
            .toLowerCase();

        // Substitute a leet character only when it sits next to a letter, so real
        // numbers survive. Two passes catch runs like "ANuNC10" (…c-1-0).
        const pass = (str) => str.replace(/[0-9@$!|&+£€#*§¡¥]/g, (c, i) => {
            const prev = str[i - 1] || '';
            const next = str[i + 1] || '';
            const letterAdjacent = /[a-z]/.test(prev) || /[a-z]/.test(next);
            return letterAdjacent ? (LEET[c] || c) : c;
        });
        x = pass(pass(x));

        return x.replace(/[^a-z0-9?\s\u0900-\u097f]/g, ' ').replace(/\s+/g, ' ').trim();
    }

    // Words that mean "this is the step button", in every language these gates use.
    const FUZZY_WORDS = [
        'continue', 'continuar', 'prosseguir', 'prossiga', 'avancar', 'proximo', 'seguir',
        'finalizar', 'concluir', 'acessar', 'desbloquear', 'destravar', 'baixar', 'obter',
        'gerar', 'verificar', 'verify', 'verification', 'download', 'generate', 'proceed',
        'next', 'skip', 'unlock', 'getlink', 'siguiente', 'obtener', 'enlace', 'lanjut',
        'lanjutkan', 'tunggu', 'klik', 'aguarde', 'espere',
    ];

    function levenshtein(a, b) {
        if (a === b) return 0;
        if (!a.length || !b.length) return Math.max(a.length, b.length);
        let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
        for (let i = 1; i <= a.length; i++) {
            const cur = [i];
            for (let j = 1; j <= b.length; j++) {
                cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
            }
            prev = cur;
        }
        return prev[b.length];
    }

    // Approximate match so a brand-new obfuscation trick still lands: every token
    // of the cleaned text is compared to the keyword list with an edit-distance
    // budget (1 for short words, 2 for long ones), plus a "contains" check.
    function fuzzyStepWord(cleaned) {
        if (!cleaned) return '';
        const squashed = cleaned.replace(/\s+/g, '');
        for (const w of FUZZY_WORDS) {
            if (w.length >= 6 && squashed.includes(w)) return w;
        }
        const tokens = cleaned.split(' ').filter(t => t.length >= 4)
            .concat(squashed.length >= 5 && squashed.length <= 24 ? [squashed] : []);
        for (const tok of tokens) {
            for (const w of FUZZY_WORDS) {
                if (Math.abs(tok.length - w.length) > 2) continue;
                const budget = w.length >= 8 ? 2 : (w.length >= 6 ? 1 : 0);
                if (budget && levenshtein(tok, w) <= budget) return w;
            }
        }
        return '';
    }

    // match a pattern against the literal text AND its de-obfuscated form
    function hit(re, t) {
        if (!t) return false;
        return re.test(t) || re.test(deleet(t));
    }

    // "is this a step button?" — regex first, fuzzy fallback for novel obfuscation
    function looksLikeStepText(t) {
        if (!t) return false;
        if (hit(GOOD_TEXT, t)) return true;
        const cleaned = deleet(t);
        if (cleaned.length > 60) return false;
        return !!fuzzyStepWord(cleaned);
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
        if (isJunkLink(el)) return false;        // social / theme credit / store links: never
        // never click our own UI (the badge is the STOP button!)
        try {
            if (el.id && el.id.indexOf('sas-') === 0) return false;
            if (el.closest && el.closest('#sas-badge, #sas-diag')) return false;
        } catch (e) { /* ignore */ }
        const rec = clickLog.get(el);
        if (!rec) return true;
        if (rec.n >= MAX_CLICKS_PER_ELEMENT) return false;
        const gap = Date.now() - rec.at;
        if (gap < MIN_CLICK_GAP_MS) return false;               // never machine-gun a button
        if (rec.sig !== signature(el)) return true;             // label/state changed -> new step
        if (rec.fp !== pageFingerprint()) return true;          // page moved on -> worth another go
        const wait = BACKOFF_MS[Math.min(rec.n, BACKOFF_MS.length - 1)];
        return gap > wait;                                      // patient retry, no hammering
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

    const VERIFY_TEXT = /(verify|verification|i am human|सत्यापित|captcha|verificar|verificacao|sou humano|verifikasi)/i;
    const CONTINUE_TEXT = /(continue|next|proceed|go to link|get\s*link|prosseguir|continuar|avancar|proximo|siguiente|lanjut|जारी\s*रखें|आगे\s*बढ़ें)/i;

    // True for links that can only take us away from the chain.
    function isJunkLink(el) {
        try {
            if (!el || el.tagName !== 'A') return false;
            const raw = el.getAttribute('href');
            if (!raw || /^(#|javascript:)/i.test(raw)) return false;
            const u = new URL(raw, location.href);
            if (!/^https?:$/.test(u.protocol)) return true;
            if (JUNK_LINK_HOSTS.test(u.hostname)) return true;
            if (AD_HOSTS.test(u.hostname + '.')) return true;
            return false;
        } catch (e) { return false; }
    }

    function hrefOf(el) {
        try { return el.tagName === 'A' && el.getAttribute('href') ? new URL(el.getAttribute('href'), location.href).href.split('#')[0] : ''; }
        catch (e) { return ''; }
    }

    // "Verify first" only applies while a verification button has never been
    // pressed. Once it has, Continue competes on equal terms — otherwise a
    // leftover Verify button would block the rest of the flow forever.
    function pendingVerify() {
        return Array.from(document.querySelectorAll('button, a, [role="button"], .btn, input[type="submit"]'))
            .some(el => hit(VERIFY_TEXT, textOf(el)) && isVisible(el) && !isDisabled(el) && !clickLog.has(el));
    }

    function score(el) {
        const t = textOf(el);
        const meta = (el.id + ' ' + (typeof el.className === 'string' ? el.className : '') + ' ' + (el.name || '')).toLowerCase();
        let s = 0;
        if (hit(GOOD_TEXT, t)) s += 60;
        else if (looksLikeStepText(t)) s += 45;      // fuzzy match on a mangled label
        if (/\b(next|continue|verify|skip|generate|getlink|get-link|proceed|submit|go)\b/.test(meta)) s += 40;
        if (/\b(btn|button)\b/.test(meta)) s += 5;
        if (el.tagName === 'BUTTON' || el.tagName === 'INPUT') s += 10;
        if (el.tagName === 'A' && el.getAttribute('href') && el.getAttribute('href') !== '#') s += 10;
        if (el.form || el.type === 'submit') s += 8;
        if (hit(BAD_TEXT, t)) s -= 120;
        if (el.tagName === 'A' && AD_HOSTS.test(el.href || '')) s -= 200;
        if (t.length > 45) s -= 20;
        // Gates want Verify done BEFORE Continue; and never walk back to a page
        // this chain has already shown us (that is exactly how the loop forms).
        if (VERIFY_TEXT.test(t)) s += 15;
        if (coldElements.has(el)) s -= 25;
        if (CONTINUE_TEXT.test(t) && pendingVerifyFlag) s -= 45;
        const href = hrefOf(el);
        if (href && trail.includes(href)) s -= 300;
        if (isJunkLink(el)) s -= 1000;                       // social / theme credit / app store
        try { if (el.closest && el.closest(FURNITURE_SEL)) s -= 150; } catch (e) { /* ignore */ }
        if (cautious && clickLog.has(el)) s -= 500;
        return s;
    }

    // Plenty of these gates render their step button as a <div onclick> or a
    // styled <span>, which a button/a-only scan never sees ("nothing to click").
    const CLICKABLE_SEL = [
        'button', 'a', 'input[type="submit"]', 'input[type="button"]', '[role="button"]',
        '.btn', '.button', '[onclick]', '[class*="btn" i]', '[class*="button" i]',
        '[id*="btn" i]', '[id*="verify" i]', '[id*="continue" i]', '[id*="getlink" i]',
        '[class*="verify" i]', '[class*="continue" i]', 'label[for]',
    ].join(', ');

    function textishButtons() {
        // last resort: any small visible element whose text is a step label
        const out = [];
        document.querySelectorAll('div, span, p, h2, h3, h4, strong, b, td, li, center, font').forEach(el => {
            if (el.children.length > 2) return;
            const t = textOf(el);
            if (!t || t.length > 40 || !looksLikeStepText(t) || hit(BAD_TEXT, t)) return;
            if (!isVisible(el)) return;
            out.push(el);
        });
        return out.slice(0, 12);
    }

    function candidates(loose) {
        const out = [];
        const seen = new Set();
        const consider = (el) => {
            if (seen.has(el)) return;
            seen.add(el);
            if (!mayClick(el)) return;
            if (!loose && (!isVisible(el) || isDisabled(el))) return;
            const s = score(el);
            if (s >= (loose ? 30 : 50)) out.push({ el, s });
        };
        document.querySelectorAll(CLICKABLE_SEL).forEach(consider);
        if (!out.length) textishButtons().forEach(consider);   // widen only when needed
        return out.sort((a, b) => b.s - a.s).map(o => o.el);
    }

    function siteSelectorTargets() {
        const found = [];
        SITE_RULES.filter(r => r.test.test(HOST)).forEach(rule => {
            rule.selectors.forEach(sel => {
                let nodes = [];
                try { nodes = Array.from(document.querySelectorAll(sel)); } catch (e) { return; }
                nodes.forEach(el => {
                    if (!mayClick(el)) return;
                    if (rule.blogGateOnly) {
                        // generic blog-gate selectors: never fire on an ad / junk button
                        const t = textOf(el);
                        if (hit(BAD_TEXT, t)) return;
                        if (t && !looksLikeStepText(t) && t.length > 25) return;
                        if (el.tagName === 'A' && AD_HOSTS.test(el.href || '')) return;
                    }
                    found.push(el);
                });
            });
        });
        return found;
    }

    function clickOnce(el, why) {
        if (!el || !mayClick(el)) return false;
        if (clickCount >= CFG.maxClicksPerPage) { setBadge('click limit reached'); stop(); return false; }
        const rec = clickLog.get(el) || { n: 0 };
        clickLog.set(el, { sig: signature(el), at: Date.now(), n: rec.n + 1, fp: pageFingerprint() });
        clickCount++;
        watchEffect(el, rec.n + 1);
        unlock(el);
        realClick(el);
        log('clicked', why, '->', textOf(el) || el.id || el.className);
        setBadge('clicked "' + (textOf(el) || el.id || 'step') + '"');
        return true;
    }

    function step(loose) {
        if (!CFG.enabled) return;
        zeroCounters();
        if (CFG.actionMode === 'assist') { highlightButtons(false); return; }
        // Their timer is still visibly ticking: wait instead of spending clicks on
        // a button that is not armed yet (this is what broke entiredust.in).
        if (!loose && hasLiveCountdown()) {
            setBadge('their timer is running — waiting for Verify to arm');
            return;
        }
        checkServerError();
        if (serverErrorHandled) return;

        // Their server is still working on the real URL — clicking now is what
        // produces "Bad Request". Wait for it (up to ~12s) before touching anything.
        if (!loose && networkBusy() && netDeferred < 40) {
            netDeferred++;
            setBadge('waiting for their server to answer…');
            return;
        }

        // The final step usually generates the URL server-side; give it a moment
        // before the very first click, otherwise we get "400 Bad Request".
        if (!loose && clickCount === 0 && REAL_NOW() - ENGAGED_AT < CFG.firstFinalClickMs &&
            FINAL_BTN_TEXT.test((candidates(false)[0] && textOf(candidates(false)[0])) || '')) {
            setBadge('letting the server prepare the link…');
            return;
        }

        // The page asks for N seconds: sit them out ONCE instead of clicking,
        // failing, clicking, failing … (that is what made step 2 take ~10 tries).
        const armAt = gateArmAt();
        if (!loose && armAt && REAL_NOW() < armAt) {
            setBadge('waiting ' + Math.ceil((armAt - REAL_NOW()) / 1000) + 's as the page asks…');
            return;
        }

        if (soralinkStep()) return;
        pendingVerifyFlag = pendingVerify();
        satisfyAdClick();
        maybeRoundTrip();

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

    // Did that click change anything at all? (url, step counter, page text, new
    // buttons). If not — twice — stop clicking it, it is decoration or an ad hook.
    function pageFingerprint() {
        const st = readStep();
        return [location.href, st ? st.cur + '/' + st.total : '',
            bodyText().length,
            document.querySelectorAll('a,button').length].join('|');
    }

    function watchEffect(el, n) {
        const before = pageFingerprint();
        NATIVE.setTimeout(() => {
            if (pageFingerprint() !== before) return;       // something moved, keep it
            if (n >= 2) {
                coldElements.add(el);      // deprioritised, NOT banned — their timer may still arm it
                log('no effect yet (will retry with backoff):', textOf(el) || el.id);
            }
            // A Verify that ignores us usually wants proof you visited the ad:
            // fake the whole leave-and-come-back trip, then try it again at once.
            if (hit(VERIFY_TEXT, textOf(el)) || n >= 2) {
                simulateAdRoundTrip(() => {
                    const r = clickLog.get(el);
                    if (r) r.at = 0;                       // skip the backoff for this retry
                    setBadge('back from the "ad" — retrying');
                    step(false);
                });
            }
        }, 3000);
    }

    // "क्लिक करें फोटो पर, 15 सेकंड रुकें" / "click the image and come back":
    // fire the click so their handler marks you as verified, but block the actual
    // navigation and the popup, so you never land on the ad.
    let adClickDone = false;
    function satisfyAdClick() {
        if (!CFG.satisfyAdClick || adClickDone) return;
        const txt = bodyText().slice(0, 6000);
        const flat = deleet(txt);
        const asksForAdClick = /(click|tap|क्लिक).{0,80}(image|photo|picture|banner|ad\b|ads\b|फोटो|तस्वीर|इमेज|विज्ञापन)/i.test(txt) ||
            /(फोटो|इमेज|तस्वीर).{0,40}क्लिक/i.test(txt) ||
            /(clique|clica|toque|aperte|pressione|klik|clic).{0,40}(anuncio|publicidade|imagem|foto|banner|iklan)/i.test(flat);
        if (!asksForAdClick) return;

        const imgs = Array.from(document.querySelectorAll('a img, a[target="_blank"] img, .gate img'))
            .map(img => img.closest('a') || img)
            .filter(el => isVisible(el))
            .slice(0, 3);
        if (!imgs.length) return;

        adClickDone = true;
        setBadge('satisfying the "click the image" check (no ad opened)');
        // Only preventDefault (never stopPropagation) — the page's own handler MUST
        // still run, that is the whole point; we just refuse to go to the ad.
        const block = (e) => e.preventDefault();
        document.addEventListener('click', block, true);
        imgs.forEach(el => {
            try { realClick(el); } catch (e) { /* ignore */ }
            log('ad-gate click fired on', el.tagName, (el.getAttribute && el.getAttribute('href')) || '');
        });
        NATIVE.setTimeout(() => document.removeEventListener('click', block, true), 50);
    }

    // How long does this page say we must wait? ("15 seconds", "15 सेकंड")
    function requiredWaitMs() {
        const raw = bodyText().slice(0, 5000);
        const m = raw.match(/(\d{1,3})\s*(seconds?|secs?|sec\b|segundos?|segs?|detik|सेकंड|सेकेंड)/i) ||
            deleet(raw).match(/(\d{1,3})\s*(seconds?|secs?|segundos?|detik)/i);
        if (!m) return 0;
        const n = Number(m[1]);
        return (n > 0 && n <= 180) ? n * 1000 : 0;
    }

    // Persisted across the reloads these gates love, so a reload does not restart
    // the whole dance from zero.
    let gstate = null;
    function gateState() {
        if (gstate) return gstate;
        try { gstate = JSON.parse(sessionStorage.getItem('sas_gate_' + HERE) || '{}') || {}; } catch (e) { gstate = {}; }
        return gstate;
    }
    function saveGate() {
        try { sessionStorage.setItem('sas_gate_' + HERE, JSON.stringify(gateState())); } catch (e) { /* ignore */ }
    }

    // Absolute time (real clock) before which clicking is pointless.
    function gateArmAt() {
        const g = gateState();
        if (g.armAt) return g.armAt;
        const need = requiredWaitMs();
        if (!need) return 0;
        // With the clock warped x60 the page's own 15s pass in ~0.25s of real
        // time; in honest mode we really do wait it out.
        const scaled = CFG.warpClock ? Math.max(1200, need / Math.max(1, CFG.speedFactor)) : need;
        g.armAt = REAL_NOW() + scaled;
        saveGate();
        log('page asks for', need / 1000 + 's -> waiting', Math.round(scaled) + 'ms');
        return g.armAt;
    }

    // Gate copy that literally describes the round trip we can fake.
    const ROUND_TRIP_COPY = /(come back|comeback|वापस आएं|वापस आये|did ?n[o']?t visit|visit the ad|click the ad|keep it open|and return|then return|फिर इसी पेज|clique no anuncio|clique na publicidade|toque no anuncio|aperte no anuncio|volte|aguarde \d+ segundos|espere \d+ segundos|destravar|desbloquear o proximo|klik iklan)/i;
    function maybeRoundTrip() {
        if (roundTrips > 0 || !CFG.simulateAdVisit) return;
        // Popunder networks frequency-cap their ads (Adsterra: ~4 per 2h, 10s apart),
        // so one simulated visit is not always enough — allow a repeat while the
        // page still nags us, spaced out to avoid a storm.
        if (gateState().roundTrip && REAL_NOW() - gateState().roundTrip < 8000) return;
        const copy = bodyText().slice(0, 8000);
        if (!ROUND_TRIP_COPY.test(copy) && !ROUND_TRIP_COPY.test(deleet(copy))) return;
        gateState().roundTrip = REAL_NOW();
        saveGate();
        simulateAdRoundTrip(() => { setBadge('back from the "ad" — retrying'); step(false); });
    }

    function nudgeScroll() {
        try {
            const y = window.scrollY;
            window.scrollTo(0, Math.max(0, document.body.scrollHeight / 2));
            NATIVE.setTimeout(() => window.scrollTo(0, document.body.scrollHeight), 300);
            NATIVE.setTimeout(() => window.scrollTo(0, y), 900);
        } catch (e) { /* ignore */ }
    }

    function watchHrefReveal() {
        const seen = new WeakMap();
        const check = () => {
            document.querySelectorAll('a[href]').forEach(a => {
                const href = a.getAttribute('href') || '';
                const prev = seen.get(a);
                seen.set(a, href);
                if (prev === undefined || prev === href) return;
                const wasLocked = prev === '#' || prev === '' || prev.startsWith('javascript:');
                if (!wasLocked || !/^https?:/i.test(href)) return;
                if (AD_HOSTS.test(href)) return;
                let sameHost = true;
                try { sameHost = new URL(href, location.href).hostname.replace(/^www\./, '') === HOST; } catch (e) { /* ignore */ }
                const t = textOf(a);
                if (hit(BAD_TEXT, t)) return;
                if (looksLikeStepText(t) || !sameHost) {
                    log('href revealed ->', href);
                    setBadge('link unlocked — going there');
                    clickOnce(a, 'href-reveal') || location.assign(href);
                }
            });
        };
        check();
        const mo = new MutationObserver(check);
        try { mo.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['href'], childList: true }); } catch (e) { /* ignore */ }
        NATIVE.setInterval(check, 1500);
    }

    /* ── the real fix: the destination is already IN the page (base64) ──── */

    function b64json(v) {
        try {
            const o = JSON.parse(atob(String(v).trim()));
            return (o && typeof o === 'object') ? o : null;
        } catch (e) { return null; }
    }

    function plausibleDest(u) {
        if (!u || typeof u !== 'string') return '';
        let url;
        try { url = new URL(u, location.href); } catch (e) { return ''; }
        if (!/^https?:$/.test(url.protocol)) return '';
        const h = url.hostname.replace(/^www\./, '');
        if (h === HOST) return '';
        if (AD_HOSTS.test(url.hostname + '.')) return '';
        if (/(google|bing|facebook|twitter|whatsapp|telegram|instagram)\.(com|co)$/i.test(h)) return '';
        return url.href;
    }

    // wpsafelink / Soralink and friends ship the final URL with the page, in a
    // base64 JSON blob — the countdown and "Get Link" button are pure theatre.
    function extractEmbeddedDestination() {
        if (!CFG.useEmbeddedDestination) return '';
        const tryVals = [];

        // 1. wpsafelink landing form: JSON.parse(atob(value)).linkr
        document.querySelectorAll('input[name="newwpsafelink"], input[name="wpsafelink"], #wpsafelink-landing input[type="hidden"]')
            .forEach(i => {
                const o = b64json(i.value);
                if (o) tryVals.push(o.linkr, o.safelink, o.url, o.link);
            });

        // 2. div#wpsafe-link <a onclick="...?safelink_redirect=BASE64',...">
        document.querySelectorAll('#wpsafe-link a[onclick], a[onclick*="safelink_redirect"]').forEach(a => {
            const onc = a.getAttribute('onclick') || '';
            const part = onc.split(/\?safelink_redirect=|',|"\)/)[1];
            const o = part && b64json(part);
            if (o) tryVals.push(o.safelink, o.second_safelink_url, o.linkr);
        });

        // 3. any inline script: atob("…"), "safelink":"…", "linkr":"…", "url":"http…"
        const scripts = Array.from(document.querySelectorAll('script:not([src])'))
            .map(x => x.textContent || '').join('\n');
        const direct = scripts.match(/"(?:safelink|linkr|redirect_url|destination|final_url|url)"\s*:\s*"(https?:\/\/[^"\\]{8,})"/i);
        if (direct) tryVals.push(direct[1].replace(/\\\//g, '/'));
        const b64s = scripts.match(/[A-Za-z0-9+/=]{24,}/g) || [];
        b64s.slice(0, 60).forEach(b => {
            const o = b64json(b);
            if (o) { tryVals.push(o.safelink, o.linkr, o.url, o.link, o.second_safelink_url); return; }
            try {
                const dec = atob(b);
                if (/^https?:\/\//i.test(dec)) tryVals.push(dec.trim());
            } catch (e) { /* not base64 */ }
        });

        // 4. data-* attributes holding a URL
        document.querySelectorAll('[data-url], [data-link], [data-href], [data-target-url]').forEach(el => {
            ['data-url', 'data-link', 'data-href', 'data-target-url'].forEach(k => {
                const v = el.getAttribute(k);
                if (v) tryVals.push(v, (b64json(v) || {}).safelink);
            });
        });

        const found = tryVals.map(plausibleDest).filter(Boolean);
        if (!found.length) return '';
        // a known file host is certainly the destination; otherwise take the first
        const best = found.find(u => FILE_HOSTS.test(new URL(u).hostname + '.')) || found[0];
        log('embedded destination found:', best);
        return best;
    }

    /* ──────── assist mode: mark the real buttons RED, let you tap ─────── */

    let hlLayer = null;
    let hlTimer = null;

    function ensureHlStyles() {
        if (document.getElementById('sas-hl-style')) return;
        const css = `
        .sas-hl-primary { outline:4px solid #ff2d2d !important; outline-offset:2px !important;
            box-shadow:0 0 0 6px rgba(255,45,45,.30), 0 0 22px rgba(255,45,45,.75) !important;
            animation:sas-pulse 1.1s ease-in-out infinite !important; border-radius:6px !important; }
        .sas-hl-second  { outline:3px dashed #ff9f0a !important; outline-offset:2px !important; }
        .sas-hl-decoy   { outline:2px dotted #6e7681 !important; opacity:.45 !important; }
        @keyframes sas-pulse { 0%,100%{ box-shadow:0 0 0 6px rgba(255,45,45,.30),0 0 18px rgba(255,45,45,.65);}
                               50%    { box-shadow:0 0 0 12px rgba(255,45,45,.10),0 0 30px rgba(255,45,45,.95);} }
        #sas-hl-layer { position:fixed; inset:0; pointer-events:none; z-index:2147483646; }
        .sas-tag { position:absolute; transform:translateY(-100%);
            font:700 12px/1.25 system-ui,-apple-system,Segoe UI,Roboto,sans-serif; color:#fff;
            padding:3px 8px; border-radius:6px 6px 6px 0; white-space:nowrap;
            box-shadow:0 2px 8px rgba(0,0,0,.5); }
        .sas-tag-primary { background:#ff2d2d; }
        .sas-tag-second  { background:#ff9f0a; color:#20160a; }
        .sas-tag-decoy   { background:#6e7681; }
        `;
        if (typeof GM_addStyle === 'function') {
            try { GM_addStyle(css); } catch (e) { /* ignore */ }
            const mark = document.createElement('meta');
            mark.id = 'sas-hl-style';
            (document.head || document.documentElement).appendChild(mark);
            return;
        }
        const st = document.createElement('style');
        st.id = 'sas-hl-style';
        st.textContent = css;
        (document.head || document.documentElement).appendChild(st);
    }

    function clearHighlights() {
        document.querySelectorAll('.sas-hl-primary, .sas-hl-second, .sas-hl-decoy')
            .forEach(el => el.classList.remove('sas-hl-primary', 'sas-hl-second', 'sas-hl-decoy'));
        if (hlLayer) hlLayer.innerHTML = '';
    }

    function tag(el, text, kind) {
        if (!hlLayer) return;
        const r = el.getBoundingClientRect();
        const t = document.createElement('div');
        t.className = 'sas-tag sas-tag-' + kind;
        t.textContent = text;
        t.style.left = Math.max(2, r.left) + 'px';
        t.style.top = Math.max(14, r.top - 4) + 'px';
        hlLayer.appendChild(t);
    }

    // Paints the gate's real step buttons red (and the ad decoys grey).
    function highlightButtons(scrollToIt) {
        if (IN_FRAME) return 0;
        ensureHlStyles();
        if (!hlLayer) {
            hlLayer = document.createElement('div');
            hlLayer.id = 'sas-hl-layer';
            document.documentElement.appendChild(hlLayer);
        }
        clearHighlights();

        const savedLog = clickLog;
        clickLog = new WeakMap();                 // ignore "already clicked" for display
        let picks;
        try {
            picks = siteSelectorTargets().concat(candidates(false), candidates(true))
                .filter((el, i, a) => a.indexOf(el) === i)
                .slice(0, 5);
        } finally { clickLog = savedLog; }
        picks.forEach((el, i) => {
            const t = textOf(el) || el.id || el.tagName;
            if (i === 0) {
                el.classList.add('sas-hl-primary');
                tag(el, '👉 TAP THIS: ' + t.slice(0, 26), 'primary');
            } else {
                el.classList.add('sas-hl-second');
                tag(el, '#' + (i + 1) + ' ' + t.slice(0, 22), 'second');
            }
        });

        // and the traps, so you know what NOT to touch
        let decoys = 0;
        Array.from(document.querySelectorAll('a, button, [role="button"], .btn')).forEach(el => {
            if (decoys >= 4 || picks.includes(el)) return;
            const t = textOf(el);
            if (!t || !isVisible(el)) return;
            if (!(hit(BAD_TEXT, t) || (el.tagName === 'A' && AD_HOSTS.test(el.href || '')))) return;
            el.classList.add('sas-hl-decoy');
            tag(el, '✕ ad / decoy', 'decoy');
            decoys++;
        });

        if (scrollToIt && picks[0]) {
            try { picks[0].scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { /* ignore */ }
        }
        // keep the tags glued to their buttons while the page scrolls
        if (!hlTimer) hlTimer = NATIVE.setInterval(() => {
            if (!document.querySelector('.sas-hl-primary')) return;
            highlightPositionsOnly();
        }, 700);
        return picks.length;
    }

    function highlightPositionsOnly() {
        if (!hlLayer) return;
        const tags = hlLayer.children;
        const els = document.querySelectorAll('.sas-hl-primary, .sas-hl-second, .sas-hl-decoy');
        for (let i = 0; i < tags.length && i < els.length; i++) {
            const r = els[i].getBoundingClientRect();
            tags[i].style.left = Math.max(2, r.left) + 'px';
            tags[i].style.top = Math.max(14, r.top - 4) + 'px';
        }
    }

    function enterAssist(reason) {
        CFG.actionMode = 'assist';
        const n = highlightButtons(true);
        setBadge(n ? '🖐 tap the RED button — ' + reason : 'no button found — ' + reason);
        log('assist mode:', reason, '(' + n + ' candidates)');
    }

    /* ───── destination: the chain is over, keep your hands off the page ── */

    const FILE_HOSTS = /(drive\.google|docs\.google|mediafire|mega\.nz|dropbox|terabox|1fichier|pixeldrain|gofile|workupload|pcloud|sendspace|krakenfiles|buzzheavier|hubcloud|gdtot|filepress|github\.com|sourceforge|archive\.org|youtube\.com|youtu\.be)\./i;
    const FILE_EXT = /\.(zip|rar|7z|tar|gz|apk|exe|msi|dmg|iso|pdf|epub|mp4|mkv|avi|mp3|flac|torrent|docx?|xlsx?|pptx?|csv|jpg|png)($|\?)/i;

    function looksLikeDestination() {
        if (!CFG.stopAtDestination) return false;
        if (FILE_EXT.test(location.pathname)) return true;
        if (FILE_HOSTS.test(location.hostname + '.')) return true;
        return false;
    }

    // The chain starts at the shortener's own site, wanders through partner
    // blogs, and comes BACK to the shortener for the final timer + Get Link.
    // Knowing the origin lets us recognise that last stage — and stop after it.
    function rememberOrigin() {
        try {
            if (!sessionStorage.getItem('sas_origin') && isKnownHost()) {
                sessionStorage.setItem('sas_origin', HOST);
            }
        } catch (e) { /* ignore */ }
        // Cross-domain marker: the chain origin is simply the FIRST host we
        // engaged on — no host list needed, so unknown providers (arolinks.com,
        // whatever launches next week) are recognised on the way back too.
        const chain = chainGet();
        const age = chain.at ? Date.now() - chain.at : Infinity;
        if (!isGateBlogHost() && !looksLikeBlogPage() && (age > 30 * 60 * 1000 || !chain.origin)) {
            chainSet({ origin: HOST, at: Date.now() });
            try { sessionStorage.setItem('sas_origin', HOST); } catch (e) { /* ignore */ }
            log('chain origin =', HOST, '(shared across domains)');
        }
    }

    function backAtOrigin() {
        try { return sessionStorage.getItem('sas_origin') === HOST && (trail.length > 1 || hops > 1); }
        catch (e) { return false; }
    }

    function chainFinished() {
        try { return sessionStorage.getItem('sas_done') === '1'; } catch (e) { return false; }
    }

    // Is this page the shortener provider's own website (not a partner blog)?
    const SHORTENER_COPY = /(url shortener|link shortener|shorten (your )?links?|shorten and earn|shorten & earn|earn money.{0,40}(link|click)|highest paying url|encurtador de links|encurte links|ganhe dinheiro.{0,40}link|acortador de enlaces|acorta y gana|pemendek tautan|perpendek tautan)/i;

    function isShortenerSite() {
        // hard exclusions first: a partner blog is never the provider
        if (isGateBlogHost()) return false;
        // the host this chain started on is by definition the provider
        try {
            const chain = chainGet();
            if (chain.origin === HOST && !looksLikeBlogPage()) return true;
            if (sessionStorage.getItem('sas_origin') === HOST && !looksLikeBlogPage()) return true;
        } catch (e) { /* ignore */ }
        if (isKnownHost() && !looksLikeBlogPage()) return true;
        if (looksLikeBlogPage()) return false;
        const t = (document.title + ' ' + bodyText().slice(0, 5000));
        if (SHORTENER_COPY.test(t) || SHORTENER_COPY.test(deleet(t))) return true;
        // AdLinkFly-style publisher site: login/register/dashboard/payout nav + earn copy
        const nav = ['a[href*="/login"]', 'a[href*="/register"]', 'a[href*="/signup"]',
            'a[href*="/dashboard"]', 'a[href*="/publisher"]', 'a[href*="/payout"]',
            'a[href*="/member"]', 'a[href*="/auth"]']
            .filter(sel => { try { return !!document.querySelector(sel); } catch (e) { return false; } }).length;
        if (nav >= 3 && /(shorten|encurt|acort|earn|ganhe|payout|cpm|monetiz)/i.test(t)) return true;
        return false;
    }

    // Did we get here as part of a running chain (as opposed to opening the
    // shortener link fresh)? Only then does "we are back" mean anything.
    // GM_* storage is shared across ALL sites, unlike sessionStorage — this is the
    // only reliable way to know "we started at vplink.in and now we are back".
    function chainGet() {
        try {
            if (typeof GM_getValue !== 'function') return {};
            return JSON.parse(GM_getValue('sas_chain_state', '{}') || '{}') || {};
        } catch (e) { return {}; }
    }
    function chainSet(o) {
        try { if (typeof GM_setValue === 'function') GM_setValue('sas_chain_state', JSON.stringify(o)); }
        catch (e) { /* ignore */ }
    }
    function chainClear() { chainSet({}); }

    // How many *distinct* pages of this host have we seen in this tab? A plain
    // reload does not count, a genuine return does.
    function bumpVisits() {
        try {
            const k = 'sas_visit_' + HOST;
            const raw = JSON.parse(sessionStorage.getItem(k) || '{}') || {};
            let n = raw.n || 0;
            if (raw.last !== HERE) n++;
            sessionStorage.setItem(k, JSON.stringify({ n, last: HERE, at: Date.now() }));
            return n;
        } catch (e) { return 1; }
    }

    // True when this load is a RETURN to the shortener, by any of three
    // independent signals (referrer is often stripped, so never rely on it alone).
    // "Back at the provider" means: back at the host where THIS chain started
    // (or, at most, another host that is unmistakably a shortener front page).
    // It must never be true for the partner blogs in between.
    function returningToProvider() {
        if (isGateBlogHost() || looksLikeBlogPage()) return false;

        const chain = chainGet();
        const age = chain.at ? Date.now() - chain.at : Infinity;
        const chainLive = age < 30 * 60 * 1000;
        const isOrigin = chainLive && chain.origin === HOST;

        // same host we started from, and this is not that very first page
        if (isOrigin && age > 8000) {
            log('return detected: chain started on this host', Math.round(age / 1000) + 's ago');
            return true;
        }
        // no cross-domain storage (bookmarklet): fall back to the per-tab
        // visit count, which only counts distinct pages of THIS host
        const visits = bumpVisits();
        const sameOriginMarker = (() => {
            try { return sessionStorage.getItem('sas_origin') === HOST; } catch (e) { return false; }
        })();
        if (visits >= 2 && (isKnownHost() || isOrigin || sameOriginMarker)) {
            log('return detected: 2nd distinct page on', HOST);
            return true;
        }
        // the old same-origin marker, still useful when GM storage is missing
        if (backAtOrigin()) {
            log('return detected: sessionStorage origin marker');
            return true;
        }
        return false;
    }

    function arrivedViaChain() {
        let refHost = '';
        try { refHost = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, '') : ''; }
        catch (e) { refHost = ''; }
        if (!refHost || refHost === HOST) return false;
        if (trail.length > 1 || hops > 1) return true;
        try { return !!sessionStorage.getItem('sas_chain'); } catch (e) { return false; }
    }

    function stopAtProvider() {
        try {
            sessionStorage.setItem('sas_done', '1');
            sessionStorage.removeItem('sas_chain');
            sessionStorage.removeItem('sas_trail');
        } catch (e) { /* ignore */ }
        log('back at the shortener provider (' + HOST + ') — stopping, as configured');
        setBadge('🛑 back at ' + HOST + ' — this is the last step, stopping here');
        CFG.actionMode = 'assist';
        NATIVE.setTimeout(() => {
            const n = highlightButtons(true);
            setBadge(n ? '🛑 last step at ' + HOST + ' — tap the RED button yourself'
                : '🛑 back at ' + HOST + ' — stopped, finish this step manually');
        }, 900);
    }

    function markChainDone(why) {
        try {
            sessionStorage.removeItem('sas_chain');
            sessionStorage.removeItem('sas_trail');
            sessionStorage.setItem('sas_done', '1');
        } catch (e) { /* ignore */ }
        log('chain finished:', why);
        setBadge('✅ destination reached — stopped here');
        NATIVE.setTimeout(stop, 6000);
    }

    /* ─────────────────────── page qualification ─────────────────────── */

    function isKnownHost() {
        return KNOWN_HOSTS.some(h => HOST === h || HOST.endsWith('.' + h));
    }

    // Remembers numeric labels between passes so we can spot a *live* countdown
    // (a number that keeps going down) — the single strongest gate signal.
    const numSnapshot = new WeakMap();
    function hasLiveCountdown() {
        let live = false;
        document.querySelectorAll('span,div,b,strong,p,h1,h2,h3,h4,td,li,font').forEach(el => {
            if (el.children.length) return;
            const t = (el.textContent || '').trim();
            if (!/^\d{1,3}$/.test(t)) return;
            const n = Number(t);
            if (n > 600) return;
            const prev = numSnapshot.get(el);
            if (typeof prev === 'number' && n < prev) live = true;
            numSnapshot.set(el, n);
        });
        return live;
    }

    function cameFromShortener() {
        // vplink & co. bounce you onto a rotating "partner blog" that hosts the
        // real gate — so trust the referrer chain, not just the domain name.
        let refHost = '';
        try { refHost = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, '') : ''; } catch (e) { /* ignore */ }
        if (refHost && refHost !== HOST &&
            KNOWN_HOSTS.some(h => refHost === h || refHost.endsWith('.' + h))) return true;
        try {
            const chain = parseInt(sessionStorage.getItem('sas_chain') || '0', 10);
            if (chain && Date.now() - chain < 10 * 60 * 1000) return true;   // we engaged <10min ago
        } catch (e) { /* ignore */ }
        return false;
    }

    // Score-based: a gate needs at least two independent signals. This is what
    // lets it fire on a 20 000-word "blog" page that hides a 15s timer inside.
    function gateSignals() {
        const text = bodyText();
        const flat = deleet(text.slice(0, 20000));      // PR0SS3GU!R -> prosseguir
        const head = text.slice(0, 3000);
        const sig = [];
        if (COUNTDOWN_TEXT.test(head) || COUNTDOWN_TEXT.test(text.slice(0, 20000)) || COUNTDOWN_TEXT.test(flat)) sig.push('countdown-text');
        if (document.querySelector('#timer,.timer,#countdown,.countdown,#count,.counter,[id*="timer" i],[class*="countdown" i],[id*="count" i]')) sig.push('timer-element');
        if (hasLiveCountdown()) sig.push('live-countdown');
        if (/(click|scroll).{0,40}(below|down).{0,40}(continue|get\s*link\b|wait)|wait.{0,25}\d{1,3}.{0,25}second|get\s*link\b.{0,30}(below|button|here)|(click|wait).{0,30}to get (the )?link/i.test(text.slice(0, 20000)) ||
            /(clique|clica|clic|klik|toque|aperte|pressione).{0,30}(no |na |en |el |di )?(anuncio|anúncio|publicidade|ad|iklan)|aguarde.{0,20}\d{1,3}.{0,20}segundos?|para prosseguir|espere.{0,20}\d{1,3}.{0,20}segundos?|destravar|desbloquear/i.test(flat)) sig.push('gate-copy');
        if (candidates(true).length > 0) sig.push('step-button');
        if (document.querySelector('button[disabled], input[disabled][type="submit"], .btn.disabled, [aria-disabled="true"], a[href="#"], a[href^="javascript:"]')) sig.push('locked-button');
        if (cameFromShortener()) sig.push('shortener-referrer');
        if (text.length < 6000) sig.push('tiny-page');
        return sig;
    }

    function looksLikeGate() {
        const sig = gateSignals();
        const has = k => sig.includes(k);
        // One strong signal, or the classic tiny "please wait N seconds" page.
        const strong = has('live-countdown') || has('gate-copy') || has('shortener-referrer');
        const weakCombo = has('countdown-text') && has('timer-element') && has('tiny-page');
        const clickable = has('step-button') || has('locked-button');
        const ok = (strong || weakCombo) && clickable;
        log('gate signals:', sig.join(', ') || 'none', '=>', ok);
        return ok;
    }

    function shouldRun() {
        if (!CFG.enabled || CFG.genericMode === 'off') return false;
        if (cautious) {
            log('cautious mode on', HOST, '(seen this page', seenBefore, 'times, hops', hops + ')');
            NATIVE.setTimeout(() => setBadge('possible loop — only trying buttons I have never clicked'), 1200);
        }
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
        if (!CFG.showBadge || IN_FRAME) return;
        if (!badgeEl) {
            if (!document.body) return;
            addStyle(`#sas-badge{position:fixed;z-index:2147483647;right:12px;bottom:12px;background:#111;color:#0f6;
                font:12px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:8px 10px;border-radius:8px;
                box-shadow:0 2px 10px rgba(0,0,0,.4);max-width:260px;opacity:.92;cursor:pointer}
                #sas-badge b{color:#fff}#sas-badge small{color:#9aa;display:block;margin-top:2px}`);
            badgeEl = document.createElement('div');
            badgeEl.id = 'sas-badge';
            badgeEl.title = 'Click to stop auto-skip on this page';
            // 1st tap  -> assist mode: mark the real buttons red and stop clicking
            // 2nd tap   -> switch off completely
            badgeEl.addEventListener('click', () => {
                if (CFG.actionMode !== 'assist') {
                    CFG.actionMode = 'assist';
                    enterAssist('you asked to take over');
                    return;
                }
                CFG.enabled = false;
                clearHighlights();
                stop();
                badgeEl.innerHTML = '<b>auto-skip</b><small>stopped</small>';
            });
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
    const earlyEngage = CFG.enabled &&
        (isKnownHost() || CFG.genericMode === 'aggressive');
    if (earlyEngage) {
        patchTimers();
        patchClock();
        patchRaf();
        shieldVisibility();
        patchNetwork();
        blockPopups();
        zeroCounters();
        if (tryShortcut()) return;
    }

    function start() {
        if (looksLikeDestination()) { markChainDone('file/destination URL'); return; }
        if (CFG.stopAtShortener && isShortenerSite() && returningToProvider()) { stopAtProvider(); return; }
        // Already finished this chain: never touch anything again (no extra hop).
        if (chainFinished() && !isKnownHost()) { log('chain already finished — staying idle'); return; }
        rememberOrigin();
        if (started) return;
        if (!shouldRun()) { log('not a shortlink gate, idling on', HOST); return; }
        started = true;
        notePr0gress();
        const st = readStep();
        if (CFG.stopAtShortener && isShortenerSite() && returningToProvider()) {
            stopAtProvider();
            return;
        }
        log('engaged on', HOST, st ? '(step ' + st.cur + '/' + st.total + ')' : '');
        if (!earlyEngage) {            // late engage: heuristic said "this is a gate"
            patchTimers();
            patchClock();
            patchRaf();
            shieldVisibility();
            blockPopups();
            zeroCounters();
        }
        setBadge((st ? 'step ' + st.cur + '/' + st.total + ' — ' : '') +
            (SLOW_MODE ? 'honest mode (no time tricks) — ' : '') + 'waiting for the step button…');

        if (tryShortcut()) return;

        // Mark the chain so the next hop (rotating partner blog) engages too.
        try { sessionStorage.setItem('sas_chain', String(Date.now())); } catch (e) { /* ignore */ }

        // Some blog gates only reveal the button once it is scrolled into view.
        nudgeScroll();

        // Watch for a locked link turning into a real off-site href (very common:
        // <a href="#">CONTINUE</a> gets its real href when the timer ends).
        watchHrefReveal();

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
        NATIVE.setTimeout(() => {
            if (!CFG.enabled) return;
            if (clickCount === 0) {
                setBadge('nothing found to click — tap me, then run the 🩺 diagnostics bookmarklet');
                log('give up: no candidates. Loose scan saw', candidates(true).length, 'elements');
            }
            deadEndReload();
        }, CFG.giveUpMs);
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
        GM_registerMenuCommand(
            (CFG.actionMode === 'assist' ? '🤖 Switch to AUTO clicking' : '🖐 Switch to ASSIST (mark buttons red, I tap)'),
            () => {
                const next = CFG.actionMode === 'assist' ? 'auto' : 'assist';
                persist('actionMode', next);
                if (next === 'assist') enterAssist('assist mode on'); else location.reload();
            });
        GM_registerMenuCommand('🔴 Mark the real buttons now', () => {
            const n = highlightButtons(true);
            setBadge(n ? 'marked ' + n + ' candidate button(s) — red one first' : 'nothing recognisable found');
        });
        GM_registerMenuCommand('🩺 Copy gate diagnostics', () => {
            const rows = Array.from(document.querySelectorAll('button, a, input[type="submit"], [role="button"], .btn'))
                .map(el => ({
                    tag: el.tagName, id: el.id || '', cls: (typeof el.className === 'string' ? el.className : '').slice(0, 60),
                    text: textOf(el), href: (el.getAttribute && el.getAttribute('href')) || '',
                    visible: isVisible(el), disabled: isDisabled(el), score: score(el),
                }))
                .filter(r => r.text || r.id)
                .sort((a, b) => b.score - a.score).slice(0, 25);
            const dump = JSON.stringify({
                url: location.href, host: HOST, referrer: document.referrer,
                engaged: started, clicks: clickCount, signals: gateSignals(), candidates: rows,
            }, null, 2);
            console.log(dump);
            if (typeof GM_setClipboard === 'function') GM_setClipboard(dump, 'text');
            setBadge('diagnostics copied to clipboard');
        });
    }
})();
