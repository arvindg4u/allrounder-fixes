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

function makeDom(html, url, onAd, referrer) {
    const dom = new JSDOM(html, {
        url, referrer, runScripts: 'dangerously', pretendToBeVisual: true,
        beforeParse(w) {
            w.alert = (m) => onAd && onAd(m);
            Object.defineProperty(w.Element.prototype, 'getBoundingClientRect', {
                value() { return { width: 100, height: 40, top: 0, left: 0, right: 100, bottom: 40 }; },
            });
            w.HTMLElement.prototype.scrollIntoView = function () {};
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
