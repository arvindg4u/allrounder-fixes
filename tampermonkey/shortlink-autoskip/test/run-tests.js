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
            el.addEventListener('click', () => clicks.push(el.id || el.textContent)));
        setTimeout(() => inject(dom), 50);
        setTimeout(() => {
            const badge = w.document.getElementById('sas-badge');
            const ok = clicks.length === 0;
            console.log(`${ok ? 'PASS' : 'FAIL'}  loop guard stops after revisiting the same page` +
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
