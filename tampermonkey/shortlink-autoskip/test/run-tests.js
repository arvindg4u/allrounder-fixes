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
        try { w.localStorage.setItem('sas_actionMode', JSON.stringify('assist')); } catch (e) { /* ignore */ }
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
        try { w.localStorage.setItem('sas_debug', 'true'); } catch (e) { /* ignore */ }
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
        try { w.localStorage.setItem('sas_debug', 'true'); } catch (e) { /* ignore */ }
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
        w.sessionStorage.setItem('sas_chain', String(Date.now()));
        w.sessionStorage.setItem('sas_origin', 'vplink.in');
        w.sessionStorage.setItem('sas_visit_vplink.in',
            JSON.stringify({ n: 1, last: 'https://vplink.in/other-page', at: Date.now() }));
    },
    'https://entiredust.example/step5/');

const stopAtShortenerNoReferrerTest = () => providerFinishTest(
    'provider return works with NO referrer at all',
    'https://vplink.in/final-step-xyz',
    (w) => {
        w.sessionStorage.setItem('sas_origin', 'vplink.in');
        w.sessionStorage.setItem('sas_visit_vplink.in',
            JSON.stringify({ n: 1, last: 'https://vplink.in/MEIN_ID_SAFE_PANEL', at: Date.now() }));
    });

const unknownProviderStopTest = () => providerFinishTest(
    'UNKNOWN provider (arolinks-style) is finished honestly too',
    'https://arolinks.example/otj1-final',
    (w) => {
        w.sessionStorage.setItem('sas_origin', 'arolinks.example');
        w.sessionStorage.setItem('sas_visit_arolinks.example',
            JSON.stringify({ n: 1, last: 'https://arolinks.example/otj1', at: Date.now() }));
    });

const providerTimerUntouchedTest = () => providerFinishTest(
    'provider return: countdown left at normal speed',
    'https://arolinks.example/final-step',
    (w) => {
        w.sessionStorage.setItem('sas_origin', 'arolinks.example');
        w.sessionStorage.setItem('sas_visit_arolinks.example',
            JSON.stringify({ n: 1, last: 'https://arolinks.example/otj1', at: Date.now() }));
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
            w.sessionStorage.setItem('sas_origin', 'vplink.in');
            w.sessionStorage.setItem('sas_visit_vplink.in',
                JSON.stringify({ n: 1, last: 'https://vplink.in/first', at: Date.now() }));
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
