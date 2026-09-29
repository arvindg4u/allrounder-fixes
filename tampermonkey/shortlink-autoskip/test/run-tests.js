/**
 * Headless sanity tests for shortlink-autoskip.user.js (no browser needed).
 *
 *   npm i jsdom        # once, anywhere; or: npm i -g jsdom
 *   node test/run-tests.js
 *
 * Test 1 – known shortener host: walks the 15s / 10s / 5s mock gate and must
 *          reach the final URL without ever clicking an ad button.
 * Test 2 – unknown host: same gate, must still be detected by the heuristic.
 * Test 3 – ordinary website: must stay completely idle.
 */
const path = require('path');
const fs = require('fs');
let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch (e) { console.error('Install jsdom first:  npm i jsdom'); process.exit(2); }

const DIR = path.join(__dirname, '..');
const SCRIPT = fs.readFileSync(path.join(DIR, 'shortlink-autoskip.user.js'), 'utf8');
const strip = f => fs.readFileSync(path.join(__dirname, f), 'utf8')
    .replace(/<script>\s*if \(new URLSearchParams[\s\S]*?<\/script>/, '')   // drop the ?auto=1 loader
    .replace(/<script>\s*var s = document[\s\S]*?<\/script>/, '');
const GATE_HTML = strip('mock-shortlink.html');
const BLOG_HTML = strip('mock-blog-gate.html');
const ADGATE_HTML = strip('mock-adgate.html');
const TIMED_HTML = strip('mock-timed-verify.html');
const VISIT_HTML = strip('mock-visit-gate.html');
const FINAL_HTML = strip('mock-final-link.html');
const WPSAFE_HTML = strip('mock-wpsafelink.html');
const LEET_HTML = strip('mock-leet-gate.html');
const SHORTHOME_HTML = strip('mock-shortener-home.html');
const WPHOP_HTML = strip('mock-wp-first-hop.html');
const TRUSTED_HTML = strip('mock-trusted-gate.html');
const RAF_HTML = strip('mock-raf-gate.html');
const MATH_HTML = strip('mock-math-gate.html');

function makeDom(html, url, onAd, referrer) {
    const dom = new JSDOM(html, {
        url, referrer, runScripts: 'dangerously', pretendToBeVisual: true,
        beforeParse(w) {
            w.alert = (m) => onAd && onAd(m);
            Object.defineProperty(w.Element.prototype, 'getBoundingClientRect', {
                value() { return { width: 100, height: 40, top: 0, left: 0, right: 100, bottom: 40 }; },
            });
            w.HTMLElement.prototype.scrollIntoView = function () {};
            w.scrollTo = function () {};
            const gm = {};                       // stands in for Tampermonkey's cross-domain store
            w.__gm = gm;
            w.GM_getValue = (k, d) => (k in gm ? gm[k] : d);
            w.GM_setValue = (k, v) => { gm[k] = v; };
            w.__logs = [];
            const rawLog = w.console.log.bind(w.console);
            w.console.log = (...a) => { try { w.__logs.push(a.join(' ')); } catch (e) { /* ignore */ } rawLog(...a); };
        },
    });
    return dom;
}

function inject(dom) {
    const el = dom.window.document.createElement('script');
    el.textContent = SCRIPT;
    dom.window.document.body.appendChild(el);
}

function gateTest(name, url, html, referrer) {
    return new Promise(resolve => {
        let adClicked = false, navigated = false;
        const dom = makeDom(html || GATE_HTML, url, () => { adClicked = true; }, referrer);
        dom.virtualConsole.on('jsdomError', e => {
            if (/Not implemented: navigation/.test(e.message)) navigated = true;
        });
        setTimeout(() => inject(dom), 50);
        setTimeout(() => {
            const ok = navigated && !adClicked;
            console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} (reached final url: ${navigated}, ad clicked: ${adClicked})`);
            dom.window.close();
            resolve(ok);
        }, 7000);
    });
}

function noFalsePositiveTest(name, url, html) {
    return new Promise(resolve => {
        const dom = makeDom(html, url);
        const clicked = [];
        dom.window.document.querySelectorAll('button, a').forEach(e =>
            e.addEventListener('click', () => clicked.push(e.textContent)));
        setTimeout(() => inject(dom), 30);
        setTimeout(() => {
            console.log(`${clicked.length ? 'FAIL' : 'PASS'}  ${name}`, clicked);
            dom.window.close();
            resolve(!clicked.length);
        }, 4000);
    });
}

// The bookmarklet build must work too: tapped 2s AFTER the page loaded.
function bookmarkletTest() {
    const file = path.join(__dirname, '..', 'bookmarklet', 'shortlink-autoskip.bookmarklet.txt');
    if (!fs.existsSync(file)) { console.log('SKIP  bookmarklet (run bookmarklet/build-bookmarklet.js first)'); return Promise.resolve(true); }
    const code = decodeURIComponent(fs.readFileSync(file, 'utf8').replace(/^javascript:/, ''));
    return new Promise(resolve => {
        let adClicked = false, navigated = false;
        const dom = makeDom(BLOG_HTML, 'https://rotating-partner-blog.example/post/',
            () => { adClicked = true; }, 'https://vplink.in/MEIN_ID_SAFE_PANEL');
        dom.virtualConsole.on('jsdomError', e => {
            if (/Not implemented: navigation/.test(e.message)) navigated = true;
        });
        setTimeout(() => dom.window.eval(code), 2000);
        setTimeout(() => {
            const ok = navigated && !adClicked;
            console.log(`${ok ? 'PASS' : 'FAIL'}  bookmarklet build on the blog gate (reached final url: ${navigated}, ad clicked: ${adClicked})`);
            dom.window.close();
            resolve(ok);
        }, 12000);
    });
}

// entiredust.in-style step 2/3: "click the photo, wait 15s, come back" + Verify
// + a Continue that links back to an article we already saw (the loop trap).
function adGateTest() {
    return new Promise(resolve => {
        const url = 'https://entiredust.example/studyscholorhiipss/post-2/';
        const dom = makeDom(ADGATE_HTML, url, null, 'https://vplink.in/MEIN_ID_SAFE_PANEL');
        const w = dom.window;
        // pretend the chain already went through the article the loop-back points to
        try {
            w.sessionStorage.setItem('sas_trail', JSON.stringify([
                'https://entiredust.example/studyscholorhiipss/already-seen-article.html',
            ]));
        } catch (e) { /* ignore */ }
        let navigated = false, loopClicked = false;
        dom.virtualConsole.on('jsdomError', e => {
            if (/Not implemented: navigation/.test(e.message)) navigated = true;
        });
        w.document.getElementById('loopback').addEventListener('click', () => { loopClicked = true; });
        setTimeout(() => inject(dom), 50);
        setTimeout(() => {
            const adNavigated = !!w.__adNavigated;
            const adRegistered = !!w.__adClicked;
            const ok = navigated && adRegistered && !adNavigated && !loopClicked;
            console.log(`${ok ? 'PASS' : 'FAIL'}  ad-gate "click the photo" step 2/3 ` +
                `(reached final: ${navigated}, ad-click registered: ${adRegistered}, ` +
                `opened the ad: ${adNavigated}, took the loop link: ${loopClicked})`);
            w.close();
            resolve(ok);
        }, 9000);
    });
}

// A gate that just bounces: the script must give up instead of spinning.
function loopGuardTest() {
    return new Promise(resolve => {
        const url = 'https://loopy.example/step/';
        const dom = makeDom(ADGATE_HTML, url);
        const w = dom.window;
        try { w.sessionStorage.setItem('sas_trail', JSON.stringify([url, url, url])); } catch (e) { /* ignore */ }
        const clicks = [];
        w.document.querySelectorAll('a, button').forEach(el =>
            el.addEventListener('click', () => clicks.push(el.textContent || el.id)));
        setTimeout(() => inject(dom), 50);
        setTimeout(() => {
            const badge = w.document.getElementById('sas-badge');
            const tookLoopLink = clicks.some(c => /Corporate Sponsored Global Degree/.test(c));
            const ok = !tookLoopLink;
            console.log(`${ok ? 'PASS' : 'FAIL'}  cautious mode: revisited page never re-follows the seen link` +
                (badge ? ` (badge: "${badge.textContent.replace('auto-skip', '')}")` : ''), clicks);
            w.close();
            resolve(ok);
        }, 5000);
    });
}

// "their backend is their one timer": Verify simply does nothing until 10s of
// wall-clock time passed, and no countdown is ever displayed. The script must
// keep retrying (and warp the clock) instead of writing the button off.
function timedVerifyTest() {
    return new Promise(resolve => {
        const dom = makeDom(TIMED_HTML, 'https://entiredust.example/studyscholorhiipss/post-9/',
            null, 'https://vplink.in/MEIN_ID_SAFE_PANEL');
        let navigated = false;
        dom.virtualConsole.on('jsdomError', e => {
            if (/Not implemented: navigation/.test(e.message)) navigated = true;
        });
        setTimeout(() => inject(dom), 50);
        setTimeout(() => {
            const msg = dom.window.document.getElementById('msg').textContent;
            console.log(`${navigated ? 'PASS' : 'FAIL'}  timer-armed Verify with no visible countdown ` +
                `(reached final: ${navigated}, page says: "${msg}")`);
            dom.window.close();
            resolve(navigated);
        }, 9000);
    });
}

// The hardest variant: popunder ad + Page-Visibility check ("did you leave and
// come back?") + a 15s timer that only starts after the return.
function adVisitGateTest() {
    return new Promise(resolve => {
        const dom = makeDom(VISIT_HTML, 'https://entiredust.example/studyscholorhiipss/post-7/',
            null, 'https://vplink.in/MEIN_ID_SAFE_PANEL');
        const w = dom.window;
        let navigated = false;
        dom.virtualConsole.on('jsdomError', e => {
            if (/Not implemented: navigation/.test(e.message)) navigated = true;
        });
        setTimeout(() => inject(dom), 50);
        setTimeout(() => {
            const ok = navigated && !!w.__sawLeave && !!w.__sawReturn;
            console.log(`${ok ? 'PASS' : 'FAIL'}  popup-ad visit gate ` +
                `(reached final: ${navigated}, saw leave: ${!!w.__sawLeave}, saw return: ${!!w.__sawReturn}, ` +
                `page says: "${w.document.getElementById('msg').textContent}")`);
            w.close();
            resolve(ok);
        }, 12000);
    });
}

// The last step: the destination is generated server-side, so clicking the
// instant the page loads returns "400 Bad Request". We must wait for the
// request to land before pressing Get Link.
function serverRaceTest() {
    return new Promise(resolve => {
        const dom = makeDom(FINAL_HTML, 'https://entiredust.example/getlink/',
            null, 'https://vplink.in/MEIN_ID_SAFE_PANEL');
        const w = dom.window;
        let navigated = false;
        dom.virtualConsole.on('jsdomError', e => {
            if (/Not implemented: navigation/.test(e.message)) navigated = true;
        });
        setTimeout(() => inject(dom), 50);
        setTimeout(() => {
            const bad = !!w.__badRequest;
            const got = !!w.__gotLink;
            const ok = got && !bad;
            console.log(`${ok ? 'PASS' : 'FAIL'}  waits for the server before "Get Link" ` +
                `(got link: ${got}, hit Bad Request: ${bad}, navigated: ${navigated})`);
            w.close();
            resolve(ok);
        }, 10000);
    });
}

// Same page, but the backend needs 4s — longer than our pre-click wait — so the
// first press really does return "400 Bad Request". We must recover from it.
function serverErrorRecoveryTest() {
    return new Promise(resolve => {
        const slow = FINAL_HTML.replace('>= 1500', '>= 9000');
        const dom = makeDom(slow, 'https://entiredust.example/getlink-slow/',
            null, 'https://vplink.in/MEIN_ID_SAFE_PANEL');
        const w = dom.window;
        setTimeout(() => inject(dom), 50);
        setTimeout(() => {
            const bad = w.__badRequest || 0;
            const got = !!w.__gotLink;
            const badge = w.document.getElementById('sas-badge');
            const ok = got && bad >= 1 && bad <= 3;   // it trips, backs off, then gets it
            console.log(`${ok ? 'PASS' : 'FAIL'}  recovers from a real "400 Bad Request" ` +
                `(got link: ${got}, bad requests: ${bad})` +
                (badge ? ` badge: "${badge.textContent.replace('auto-skip', '')}"` : ''));
            w.close();
            resolve(ok);
        }, 22000);
    });
}

// Assist mode: never click, just paint the real button red.
function assistModeTest() {
    return new Promise(resolve => {
        const dom = makeDom(ADGATE_HTML, 'https://entiredust.example/assist/',
            null, 'https://vplink.in/MEIN_ID_SAFE_PANEL');
        const w = dom.window;
        try {
            w.localStorage.setItem('sas_actionMode', JSON.stringify('assist'));
            w.__gm['actionMode'] = 'assist';
        } catch (e) { /* ignore */ }
        const clicks = [];
        w.document.querySelectorAll('a, button').forEach(el =>
            el.addEventListener('click', () => clicks.push(el.id || el.textContent)));
        setTimeout(() => inject(dom), 50);
        setTimeout(() => {
            const primary = w.document.querySelector('.sas-hl-primary');
            const layer = w.document.getElementById('sas-hl-layer');
            const tags = layer ? layer.children.length : 0;
            const ok = !!primary && tags > 0 && clicks.length === 0;
            console.log(`${ok ? 'PASS' : 'FAIL'}  assist mode marks a button red and clicks nothing ` +
                `(marked: ${primary ? (primary.id || primary.textContent.trim()) : 'none'}, tags: ${tags}, clicks: ${clicks.length})`);
            w.close();
            resolve(ok);
        }, 6000);
    });
}

// Reaching the real file URL must end the automation, not start it.
function destinationStopTest() {
    return new Promise(resolve => {
        const html = `<html><body><h1>myfile.zip</h1>
            <a id="dl" href="/download/myfile.zip">Download</a>
            <button id="b">Continue</button><span class="timer">10</span></body></html>`;
        const dom = makeDom(html, 'https://buzzheavier.com/f/myfile.zip', null, 'https://entiredust.example/step3/');
        const w = dom.window;
        const clicks = [];
        w.document.querySelectorAll('a, button').forEach(el =>
            el.addEventListener('click', () => clicks.push(el.id)));
        setTimeout(() => inject(dom), 50);
        setTimeout(() => {
            const badge = w.document.getElementById('sas-badge');
            const txt = badge ? badge.textContent : '';
            const ok = clicks.length === 0 && /destination reached/.test(txt);
            console.log(`${ok ? 'PASS' : 'FAIL'}  stops at the destination file URL ` +
                `(clicks: ${clicks.length}, badge: "${txt.replace('auto-skip', '')}")`);
            w.close();
            resolve(ok);
        }, 5000);
    });
}

// The last hop lands back on the shortener: 20s timer + "Get Link", with the
// real destination sitting in the page as base64 (wpsafelink). Read it, go
// straight to MediaFire, and stop there.
function wpsafelinkTest() {
    return new Promise(resolve => {
        const dom = makeDom(WPSAFE_HTML, 'https://vplink.in/MEIN_ID_SAFE_PANEL',
            null, 'https://entiredust.example/step3/');
        const w = dom.window;
        try { w.localStorage.setItem('sas_debug', 'true'); w.__gm['debug'] = true; } catch (e) { /* ignore */ }
        let navigated = false;
        dom.virtualConsole.on('jsdomError', e => {
            if (/Not implemented: navigation/.test(e.message)) navigated = true;
        });
        setTimeout(() => inject(dom), 50);
        setTimeout(() => {
            const logs = (w.__logs || []).join('\n');
            const wentToFile = navigated &&
                /embedded destination found[^:]*: https:\/\/www\.mediafire\.com\/file\/abc123/.test(logs);
            const tooEarly = !!w.__tooEarly;
            const badge = w.document.getElementById('sas-badge');
            const ok = wentToFile && !tooEarly;
            console.log(`${ok ? 'PASS' : 'FAIL'}  reads the embedded destination on the shortener's last page ` +
                `(went to the file host: ${wentToFile}, clicked Get Link too early: ${tooEarly})` +
                (badge ? ` badge: "${badge.textContent.replace('auto-skip', '')}"` : ''));
            w.close();
            resolve(ok);
        }, 7000);
    });
}

// Alpharede-style Brazilian gate: "1/5" steps, Portuguese copy, and the button
// label obfuscated as PR0SS3GU!R specifically to defeat text matching.
function leetGateTest() {
    return new Promise(resolve => {
        const dom = makeDom(LEET_HTML, 'https://rodaemotor.example/combustiveis-do-futuro/',
            null, 'https://alpharede.com/abc');
        const w = dom.window;
        let navigated = false;
        dom.virtualConsole.on('jsdomError', e => {
            if (/Not implemented: navigation/.test(e.message)) navigated = true;
        });
        setTimeout(() => inject(dom), 50);
        setTimeout(() => {
            const proceeded = !!w.__proceeded;
            const adClicked = !!w.__adClicked;
            const junk = w.__junkClicked || [];
            const badge = w.document.getElementById('sas-badge');
            const ok = proceeded && navigated && junk.length === 0;
            console.log(`${ok ? 'PASS' : 'FAIL'}  obfuscated gate (CL!QU3 P\u{1D5D4}R@ C0NT!NU\u{1D5D4}R + F!N\u{1D5D4}L!ZAR, 1/5, pt-BR) ` +
                `(pressed the obfuscated button: ${proceeded}, reached next page: ${navigated}, ` +
                `ad clicked: ${adClicked}, junk links clicked: ${junk.join(',') || 'none'})` + (badge ? ` badge: "${badge.textContent.replace('auto-skip', '')}"` : ''));
            w.close();
            resolve(ok);
        }, 9000);
    });
}

// Coming BACK to the shortener's own site is the LAST step: no timer skipping
// (that is what caused 400s), but the script still finishes it automatically.
// The first hop is an ordinary WordPress blog whose inline scripts are full of
// analytics/CDN URLs. None of them is "the destination" — the script must solve
// the gate instead of declaring victory and stopping.
function wpFirstHopTest() {
    return new Promise(resolve => {
        const dom = makeDom(WPHOP_HTML, 'https://itiexamshala.example/', null, 'https://earnlinks.in/Er6J4');
        const w = dom.window;
        try { w.localStorage.setItem('sas_debug', 'true'); w.__gm['debug'] = true; } catch (e) { /* ignore */ }
        w.__logs = [];
        const raw = w.console.log.bind(w.console);
        w.console.log = (...a) => { try { w.__logs.push(a.join(' ')); } catch (e) { /* ignore */ } raw(...a); };
        setTimeout(() => inject(dom), 50);
        setTimeout(() => {
            const logs = (w.__logs || []).join('\n');
            const falseDestination = /embedded destination found/.test(logs) || /chain finished/.test(logs);
            const badge = w.document.getElementById('sas-badge');
            const txt = badge ? badge.textContent : '';
            const claimedDone = /destination reached/.test(txt);
            const solved = !!w.__verified;
            const ok = !falseDestination && !claimedDone && solved;
            console.log(`${ok ? 'PASS' : 'FAIL'}  a WordPress first hop is not mistaken for the destination ` +
                `(false destination: ${falseDestination || claimedDone}, solved the gate: ${solved})`);
            w.close();
            resolve(ok);
        }, 8000);
    });
}

// REGRESSION: the provider rules must NEVER fire on a partner blog, even when a
// chain is active and we have seen more than one page of that blog host.
function blogIsNotAProviderTest() {
    return new Promise(resolve => {
        const dom = makeDom(LEET_HTML, 'https://donpviral.xyz/alguma-noticia-2/',
            null, 'https://alpharede.com/abc');
        const w = dom.window;
        try {
            w.sessionStorage.setItem('sas_visit_donpviral.xyz',
                JSON.stringify({ n: 1, last: 'https://donpviral.xyz/alguma-noticia-1/', at: Date.now() }));
            w.sessionStorage.setItem('sas_chain', String(Date.now()));
        } catch (e) { /* ignore */ }
        setTimeout(() => inject(dom), 50);
        setTimeout(() => {
            const badge = w.document.getElementById('sas-badge');
            const txt = badge ? badge.textContent : '';
            const treatedAsProvider = /last step at|waiting out their real timer/i.test(txt);
            const worked = !!w.__proceeded;
            const ok = !treatedAsProvider && worked;
            console.log(`${ok ? 'PASS' : 'FAIL'}  a partner blog is never treated as the shortener ` +
                `(treated as provider: ${treatedAsProvider}, solved the gate: ${worked})`);
            w.close();
            resolve(ok);
        }, 9000);
    });
}

function providerFinishTest(name, url, seed, referrer) {
    return new Promise(resolve => {
        const dom = makeDom(SHORTHOME_HTML, url, null, referrer);
        const w = dom.window;
        const nativeSetTimeout = w.setTimeout;
        const nativeDateNow = w.Date.now;
        let navigated = false;
        dom.virtualConsole.on('jsdomError', e => {
            if (/Not implemented: navigation/.test(e.message)) navigated = true;
        });
        try { seed(w); } catch (e) { /* ignore */ }
        setTimeout(() => inject(dom), 50);
        setTimeout(() => {
            const timerPatched = w.setTimeout !== nativeSetTimeout || !!w.setTimeout.__sasPatched;
            const clockWarped = w.Date.now !== nativeDateNow;
            // "finished" = pressed the unlocked control OR followed the unlocked link
            const finished = !!w.__clickedGet || !!w.__clickedCont || navigated;
            const tooEarly = !!w.__badRequest;
            const ok = finished && !tooEarly && !timerPatched && !clockWarped;
            console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ` +
                `(finished automatically: ${finished}, hit 400: ${tooEarly}, ` +
                `timer patched: ${timerPatched}, clock warped: ${clockWarped})`);
            w.close();
            resolve(ok);
        }, 9000);
    });
}

const stopAtShortenerTest = () => providerFinishTest(
    'provider return: finishes the last step without skipping their timer',
    'https://vplink.in/MEIN_ID_SAFE_PANEL',
    (w) => {
        w.__gm['sas_chain_state'] = JSON.stringify({
            origin: 'vplink.in', at: Date.now() - 60000,
            hosts: ['vplink.in', 'entiredust.example', 'vplink.in'],
        });
        w.sessionStorage.setItem('sas_origin', 'vplink.in');
    },
    'https://entiredust.example/step5/');

const stopAtShortenerNoReferrerTest = () => providerFinishTest(
    'provider return works with NO referrer at all',
    'https://vplink.in/final-step-xyz',
    (w) => {
        w.__gm['sas_chain_state'] = JSON.stringify({
            origin: 'vplink.in', at: Date.now() - 60000,
            hosts: ['vplink.in', 'donpviral.example', 'vplink.in'],
        });
    });

const unknownProviderStopTest = () => providerFinishTest(
    'UNKNOWN provider (arolinks-style) is finished honestly too',
    'https://arolinks.example/otj1-final',
    (w) => {
        w.__gm['sas_chain_state'] = JSON.stringify({
            origin: 'arolinks.example', at: Date.now() - 60000,
            hosts: ['arolinks.example', 'someblog.example', 'arolinks.example'],
        });
    });

const providerTimerUntouchedTest = () => providerFinishTest(
    'provider return: countdown left at normal speed',
    'https://arolinks.example/final-step',
    (w) => {
        w.__gm['sas_chain_state'] = JSON.stringify({
            origin: 'arolinks.example', at: Date.now() - 60000,
            hosts: ['arolinks.example', 'blog2.example', 'arolinks.example'],
        });
    });

// …but a FRESH visit to that same shortener must still be automated.
function freshShortenerStillWorksTest() {
    return new Promise(resolve => {
        const dom = makeDom(SHORTHOME_HTML, 'https://vplink.in/MEIN_ID_SAFE_PANEL');   // no referrer
        const w = dom.window;
        setTimeout(() => inject(dom), 50);
        setTimeout(() => {
            const acted = !!w.__clickedGet || !!w.__clickedCont;
            console.log(`${acted ? 'PASS' : 'FAIL'}  a fresh visit to the shortener is still automated (clicked: ${acted})`);
            w.close();
            resolve(acted);
        }, 6000);
    });
}

// With providerMode='assist' the user gets the red button instead.
function providerAssistModeTest() {
    return new Promise(resolve => {
        const dom = makeDom(SHORTHOME_HTML, 'https://vplink.in/assist-final');
        const w = dom.window;
        try {
            w.localStorage.setItem('sas_providerMode', JSON.stringify('assist'));
            w.__gm['providerMode'] = 'assist';
            w.__gm['sas_chain_state'] = JSON.stringify({
                origin: 'vplink.in', at: Date.now() - 60000,
                hosts: ['vplink.in', 'blog.example', 'vplink.in'],
            });
        } catch (e) { /* ignore */ }
        setTimeout(() => inject(dom), 50);
        setTimeout(() => {
            const clicked = !!w.__clickedGet || !!w.__clickedCont;
            const marked = !!w.document.querySelector('.sas-hl-primary');
            const ok = !clicked && marked;
            console.log(`${ok ? 'PASS' : 'FAIL'}  providerMode='assist' marks it red instead of clicking ` +
                `(clicked: ${clicked}, marked red: ${marked})`);
            w.close();
            resolve(ok);
        }, 6000);
    });
}

// REGRESSION (the bug the user hit): a shortener that runs several steps on its
// OWN host must keep behaving normally — timers skipped, buttons clicked. Only
// a real round trip (host → other host → host) counts as "back at the provider".
function sameHostMultiStepTest() {
    return new Promise(resolve => {
        const dom = makeDom(GATE_HTML, 'https://gplinks.com/step-2-xyz');
        const w = dom.window;
        const nativeSetTimeout = w.setTimeout;
        let adClicked = false;
        w.alert = (m) => { if (/AD CLICKED/.test(m)) adClicked = true; };
        try {   // we are on the 2nd page of the SAME host, chain started here
            w.__gm['sas_chain_state'] = JSON.stringify({
                origin: 'gplinks.com', at: Date.now() - 60000, hosts: ['gplinks.com'],
            });
            w.sessionStorage.setItem('sas_origin', 'gplinks.com');
            w.sessionStorage.setItem('sas_visit_gplinks.com',
                JSON.stringify({ n: 1, last: 'https://gplinks.com/step-1-abc', at: Date.now() }));
        } catch (e) { /* ignore */ }
        let navigated = false;
        dom.virtualConsole.on('jsdomError', e => {
            if (/Not implemented: navigation/.test(e.message)) navigated = true;
        });
        setTimeout(() => inject(dom), 50);
        setTimeout(() => {
            const timerSkipped = w.setTimeout !== nativeSetTimeout || !!w.setTimeout.__sasPatched;
            const badge = w.document.getElementById('sas-badge');
            const txt = badge ? badge.textContent : '';
            const wronglyStopped = /last step at|waiting out their real timer|tap the RED/i.test(txt);
            const ok = timerSkipped && navigated && !wronglyStopped && !adClicked;
            console.log(`${ok ? 'PASS' : 'FAIL'}  same-host multi-step gate still skips the timer and clicks ` +
                `(timer skipped: ${timerSkipped}, reached next page: ${navigated}, ` +
                `wrongly treated as provider return: ${wronglyStopped})`);
            w.close();
            resolve(ok);
        }, 9000);
    });
}

function idleTest() {
    return new Promise(resolve => {
        const html = `<html><body><h1>My blog</h1><p>${'lorem ipsum dolor sit amet '.repeat(400)}</p>
            <button id="next">Next page</button><a href="/continue">Continue reading</a></body></html>`;
        const dom = makeDom(html, 'https://example.com/post/1');
        let clicked = false;
        dom.window.document.getElementById('next').addEventListener('click', () => { clicked = true; });
        setTimeout(() => inject(dom), 50);
        setTimeout(() => {
            console.log(`${clicked ? 'FAIL' : 'PASS'}  stays idle on an ordinary website`);
            dom.window.close();
            resolve(!clicked);
        }, 4000);
    });
}

// The Soralink/pahe-style isTrusted check: the handler is armed after the
// countdown and refuses untrusted events. The trust shield must make our
// synthetic click pass, and the linksfly-style `blurred` flag must be cleared.
function trustedClickTest() {
    return new Promise(resolve => {
        const dom = makeDom(TRUSTED_HTML, 'https://gplinks.com/trusted1');
        const w = dom.window;
        let navigated = false;
        dom.virtualConsole.on('jsdomError', e => {
            if (/Not implemented: navigation/.test(e.message)) navigated = true;
        });
        setTimeout(() => inject(dom), 50);
        setTimeout(() => {
            const msg = w.document.getElementById('msg').textContent;
            const blurredCleared = w.blurred === false;
            const ok = navigated && msg === 'trusted click accepted' && blurredCleared;
            console.log(`${ok ? 'PASS' : 'FAIL'}  isTrusted-guarded handler accepts the synthetic click ` +
                `(navigated: ${navigated}, page says: "${msg}", blurred cleared: ${blurredCleared})`);
            w.close();
            resolve(ok);
        }, 9000);
    });
}

// A Cloudflare-style challenge page on a KNOWN host must be left completely
// alone: timers restored, nothing clicked.
function challengeIdleTest() {
    return new Promise(resolve => {
        const html = `<html><head><title>Just a moment...</title>
            <script src="/cdn-cgi/challenge-platform/h/b/orchestrate/jsch1/abc"></script></head>
            <body><span class="timer">10</span><button id="b">Continue</button></body></html>`;
        const dom = makeDom(html, 'https://gplinks.com/chal1');
        const w = dom.window;
        const clicks = [];
        w.document.getElementById('b').addEventListener('click', () => clicks.push('b'));
        setTimeout(() => inject(dom), 50);
        setTimeout(() => {
            const stillPatched = !!(w.setTimeout && w.setTimeout.__sasPatched);
            const ok = clicks.length === 0 && !stillPatched;
            console.log(`${ok ? 'PASS' : 'FAIL'}  never touches a Cloudflare "Just a moment" page ` +
                `(clicks: ${clicks.length}, timers still patched: ${stillPatched})`);
            w.close();
            resolve(ok);
        }, 5000);
    });
}

// The #1 "it stopped working" report: the previous chain finished (or went
// quiet) and a NEW short link is opened — it must NOT be misread as
// "back at the provider" (which disables all timer skipping).
function freshChainAfterDoneTest() {
    return new Promise(resolve => {
        const dom = makeDom(GATE_HTML, 'https://gplinks.com/newlink1');
        const w = dom.window;
        try {
            // leftover host trail from a chain that finished 4 minutes ago
            w.__gm['sas_chain_state'] = JSON.stringify({
                origin: 'gplinks.com', at: Date.now() - 240000,
                hosts: ['gplinks.com', 'someblog.example', 'gplinks.com'],
            });
            w.sessionStorage.setItem('sas_done', '1');
        } catch (e) { /* ignore */ }
        let navigated = false;
        dom.virtualConsole.on('jsdomError', e => {
            if (/Not implemented: navigation/.test(e.message)) navigated = true;
        });
        setTimeout(() => inject(dom), 50);
        setTimeout(() => {
            const timerSkipped = !!(w.setTimeout && w.setTimeout.__sasPatched);
            const badge = w.document.getElementById('sas-badge');
            const txt = badge ? badge.textContent : '';
            const wronglyStopped = /last step at|honest|waiting out their real timer|tap the RED/i.test(txt);
            const ok = navigated && timerSkipped && !wronglyStopped;
            console.log(`${ok ? 'PASS' : 'FAIL'}  a NEW short link after a finished chain is still fully automated ` +
                `(reached final: ${navigated}, timer skipped: ${timerSkipped}, misread as provider: ${wronglyStopped})`);
            w.close();
            resolve(ok);
        }, 9000);
    });
}

// Browser-native <meta http-equiv=refresh> waits must be accelerated too.
function metaRefreshTest() {
    return new Promise(resolve => {
        const html = `<html><head><meta http-equiv="refresh" content="10; url=https://files.example/final.zip"></head>
            <body><h1>Please wait 10 seconds</h1><span class="timer">10</span>
            <button disabled>Continue</button></body></html>`;
        const dom = makeDom(html, 'https://gplinks.com/mrefresh');
        const w = dom.window;
        setTimeout(() => inject(dom), 50);
        setTimeout(() => {
            const meta = w.document.querySelector('meta[http-equiv="refresh"]');
            const delay = meta ? parseFloat(meta.getAttribute('content')) : 99;
            const ok = delay < 2;
            console.log(`${ok ? 'PASS' : 'FAIL'}  meta-refresh wait is accelerated (delay now ${delay}s)`);
            w.close();
            resolve(ok);
        }, 5000);
    });
}

// "Solve: 7 + 5 = ?" — the tiny math solver must fill the input.
function mathCaptchaTest() {
    return new Promise(resolve => {
        const dom = makeDom(MATH_HTML, 'https://gplinks.com/math1');
        const w = dom.window;
        let navigated = false;
        dom.virtualConsole.on('jsdomError', e => {
            if (/Not implemented: navigation/.test(e.message)) navigated = true;
        });
        setTimeout(() => inject(dom), 50);
        setTimeout(() => {
            const msg = w.document.getElementById('msg').textContent;
            const ok = navigated && msg === 'correct!';
            console.log(`${ok ? 'PASS' : 'FAIL'}  math captcha solved and the gate passed ` +
                `(navigated: ${navigated}, page says: "${msg}")`);
            w.close();
            resolve(ok);
        }, 9000);
    });
}

// rAF-driven countdown reading performance.now(): the rAF patch must use the
// same warped clock or the countdown freezes at "more than 15 seconds left".
function rafClockTest() {
    return new Promise(resolve => {
        const dom = makeDom(RAF_HTML, 'https://gplinks.com/raf1');
        const w = dom.window;
        let navigated = false;
        dom.virtualConsole.on('jsdomError', e => {
            if (/Not implemented: navigation/.test(e.message)) navigated = true;
        });
        setTimeout(() => inject(dom), 50);
        setTimeout(() => {
            const msg = w.document.getElementById('msg').textContent;
            const ok = navigated && msg === 'armed';
            console.log(`${ok ? 'PASS' : 'FAIL'}  rAF countdown finishes with the warped clock ` +
                `(navigated: ${navigated}, page says: "${msg}")`);
            w.close();
            resolve(ok);
        }, 9000);
    });
}

// The destination hidden behind a base64 fragment: #aHR0cHM6Ly9maWxlcy5leGFtcGxl…
function hashShortcutTest() {
    return new Promise(resolve => {
        const html = `<html><body><h1>Shortening</h1>
            <span class="timer">5</span><button disabled>Continue</button></body></html>`;
        const b64 = Buffer.from('https://files.example/final.zip').toString('base64');
        const dom = makeDom(html, 'https://ouo.io/hashstep#' + b64);
        let navigated = false;
        dom.virtualConsole.on('jsdomError', e => {
            if (/Not implemented: navigation/.test(e.message)) navigated = true;
        });
        setTimeout(() => inject(dom), 50);
        setTimeout(() => {
            console.log(`${navigated ? 'PASS' : 'FAIL'}  base64 URL in the #fragment is followed`);
            dom.window.close();
            resolve(navigated);
        }, 5000);
    });
}

(async () => {
    const results = [];
    results.push(await gateTest('known shortener host (gplinks.com)', 'https://gplinks.com/abc123'));
    results.push(await gateTest('unknown host, heuristic detection', 'https://some-random-earn-link.xyz/abc'));
    results.push(await gateTest('vplink-style blog gate (long article, hidden CONTINUE, locked href)',
        'https://rotating-partner-blog.example/studyblogs/some-post/', BLOG_HTML, 'https://vplink.in/MEIN_ID_SAFE_PANEL'));
    results.push(await adGateTest());
    results.push(await timedVerifyTest());
    results.push(await adVisitGateTest());
    results.push(await serverRaceTest());
    results.push(await serverErrorRecoveryTest());
    results.push(await wpsafelinkTest());
    results.push(await leetGateTest());
    results.push(await wpFirstHopTest());
    results.push(await blogIsNotAProviderTest());
    results.push(await sameHostMultiStepTest());
    results.push(await stopAtShortenerTest());
    results.push(await stopAtShortenerNoReferrerTest());
    results.push(await unknownProviderStopTest());
    results.push(await providerTimerUntouchedTest());
    results.push(await providerAssistModeTest());
    results.push(await freshShortenerStillWorksTest());
    results.push(await assistModeTest());
    results.push(await destinationStopTest());
    results.push(await loopGuardTest());
    results.push(await bookmarkletTest());
    results.push(await idleTest());
    results.push(await trustedClickTest());
    results.push(await challengeIdleTest());
    results.push(await freshChainAfterDoneTest());
    results.push(await metaRefreshTest());
    results.push(await mathCaptchaTest());
    results.push(await rafClockTest());
    results.push(await hashShortcutTest());
    results.push(await noFalsePositiveTest('ignores a checkout page that has a .timer + Continue button',
        'https://shop.example.com/checkout',
        `<html><body><h1>Checkout</h1><p>Delivery in 2 days. Order total 1299. Popular in the 1990s.</p>
         <span class="timer">10</span><button id="go">Continue to payment</button></body></html>`));
    results.push(await noFalsePositiveTest('ignores a news article saying "30 seconds ago"',
        'https://news.example.com/article',
        `<html><body><h1>News</h1><p>${'text '.repeat(500)} updated 30 seconds ago</p>
         <a href="/next">Next article</a></body></html>`));
    const failed = results.filter(r => !r).length;
    console.log(failed ? `\n${failed} test(s) failed` : '\nAll tests passed');
    process.exit(failed ? 1 : 0);
})();
