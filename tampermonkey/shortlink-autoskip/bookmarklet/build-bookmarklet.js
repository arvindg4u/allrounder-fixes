#!/usr/bin/env node
/**
 * Builds a self-contained bookmarklet from shortlink-autoskip.user.js.
 *
 *   node bookmarklet/build-bookmarklet.js
 *
 * Output:
 *   bookmarklet/shortlink-autoskip.bookmarklet.txt   <- paste this as a bookmark URL
 *   bookmarklet/install.html                         <- tap-to-copy page (works on phones)
 *
 * The userscript already degrades gracefully without GM_* APIs (it falls back to
 * localStorage and skips the menu commands), so no shims are needed — we only
 * strip the metadata block and wrap it so it can't be started twice.
 */
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(DIR, 'shortlink-autoskip.user.js'), 'utf8');

// 1. drop the ==UserScript== metadata block and the big header comment
let code = src
    .replace(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\s*/, '')
    .replace(/^\/\*[\s\S]*?\*\/\s*/, '');

// 2. drop whole-line // comments (never inside the template literals we use)
code = code.split('\n')
    .filter(line => !/^\s*\/\/[^\n]*$/.test(line))
    .map(line => line.replace(/\s+$/, ''))
    .join('\n');

// 3. guard against double-start, and report to the user that it fired
const payload = `(function(){
if(window.__shortlinkAutoSkip){alert('Shortlink Auto-Skip is already running on this page.');return;}
window.__shortlinkAutoSkip=1;
${code}
})();`;

// sanity: must still parse
new Function(payload); // throws on syntax error

// optional: minify if terser is available (npm i terser) -> ~4x smaller bookmarklet
let finalCode = payload;
try {
    const { minify_sync } = require('terser');
    const out = minify_sync(payload, { compress: { passes: 2 }, mangle: true, format: { comments: false } });
    if (out.code) { finalCode = out.code; console.log('minified with terser'); }
} catch (e) {
    console.log('terser not installed — shipping unminified (still works, just longer)');
}

const bookmarklet = 'javascript:' + encodeURIComponent(finalCode);
fs.writeFileSync(path.join(__dirname, 'shortlink-autoskip.bookmarklet.txt'), bookmarklet);

/* ---------- second bookmarklet: the diagnostics collector ---------- */
const diagSrc = fs.readFileSync(path.join(DIR, 'diagnose', 'diagnose.js'), 'utf8');
new Function(diagSrc);
let diagCode = diagSrc;
try {
    const { minify_sync } = require('terser');
    const o = minify_sync(diagSrc, { compress: { passes: 2 }, mangle: true, format: { comments: false } });
    if (o.code) diagCode = o.code;
} catch (e) { /* keep unminified */ }
const diagBm = 'javascript:' + encodeURIComponent(diagCode);
fs.writeFileSync(path.join(DIR, 'diagnose', 'diagnose.bookmarklet.txt'), diagBm);

const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Shortlink Auto-Skip — bookmarklet</title>
<style>
 :root{color-scheme:dark}
 body{margin:0;background:#0e1116;color:#e6edf3;font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
 .wrap{max-width:780px;margin:0 auto;padding:22px}
 h1{font-size:22px;margin:0 0 6px} h2{font-size:17px;margin:26px 0 8px;color:#58a6ff}
 .card{background:#161b22;border:1px solid #30363d;border-radius:12px;padding:16px;margin:14px 0}
 textarea{width:100%;height:110px;background:#0d1117;color:#8b949e;border:1px solid #30363d;border-radius:8px;padding:10px;font:12px/1.4 ui-monospace,monospace}
 button{font:inherit;font-weight:700;background:#238636;color:#fff;border:0;border-radius:9px;padding:12px 20px;cursor:pointer}
 a.bm{display:inline-block;background:#1f6feb;color:#fff;padding:10px 18px;border-radius:9px;text-decoration:none;font-weight:700}
 ol{padding-left:20px} li{margin:6px 0} code{background:#0d1117;padding:2px 6px;border-radius:5px;font-size:13px}
 .ok{color:#3fb950}
</style></head><body><div class="wrap">
<h1>Shortlink Auto-Skip — bookmarklet</h1>
<p>No extension needed. Works in Kiwi, Chrome, Edge and Samsung Internet on Android when
Tampermonkey is blocked by <em>“Allow User Scripts”</em>.</p>

<div class="card">
  <p><b>Desktop:</b> drag this button onto your bookmarks bar 👉 <a class="bm" id="bm" href="">⏩ Auto-Skip</a></p>
</div>

<div class="card">
  <h2>Android (Kiwi / Chrome / Edge)</h2>
  <ol>
    <li>Tap <b>Copy bookmarklet</b> below.</li>
    <li>Bookmark <em>any</em> page (☆ icon), then open <b>⋮ → Bookmarks</b> and <b>edit</b> that bookmark.</li>
    <li>Name it <code>skip</code>, and replace the URL by pasting what you copied. Save.</li>
    <li>On a shortlink page, type <code>skip</code> in the address bar and tap the bookmark suggestion.</li>
  </ol>
  <p><button id="copy">Copy bookmarklet</button> <span id="done" class="ok"></span></p>
  <textarea id="src" readonly></textarea>
</div>

<div class="card">
  <h2>🩺 Diagnostics bookmarklet (when a gate still wins)</h2>
  <p>Install this one the same way, name it <code>diag</code>, and tap it <b>on the stuck page</b>.
  It shows a panel with the page's buttons, timers, storage flags and the gate's own inline
  JavaScript — <b>Copy</b> or <b>Download .txt</b> it and send it over so an exact rule can be written.
  Nothing is uploaded anywhere.</p>
  <p><a class="bm" id="bmd" href="">🩺 Auto-Skip DIAGNOSE</a>
     <button id="copyd">Copy diagnostics bookmarklet</button> <span id="doned" class="ok"></span></p>
  <textarea id="srcd" readonly></textarea>
</div>

<div class="card">
  <h2>What happens then</h2>
  <p>A small <code>auto-skip</code> badge appears bottom-right, countdowns are fast-forwarded and the
  Continue / Verify / Get&nbsp;Link buttons are clicked for you until the final URL loads. Tap the badge to stop.
  Because a bookmarklet runs after the page loads, re-tap it on each step page if a gate reloads itself.</p>
</div>
</div>
<script>
const BM = ${JSON.stringify(bookmarklet)};
document.getElementById('src').value = BM;
document.getElementById('bm').setAttribute('href', BM);
const DIAG = ${JSON.stringify(diagBm)};
document.getElementById('srcd').value = DIAG;
document.getElementById('bmd').setAttribute('href', DIAG);
document.getElementById('copyd').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(DIAG); }
  catch (e) { const t = document.getElementById('srcd'); t.select(); document.execCommand('copy'); }
  document.getElementById('doned').textContent = '✓ copied';
});
document.getElementById('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(BM); }
  catch (e) { const t = document.getElementById('src'); t.select(); document.execCommand('copy'); }
  document.getElementById('done').textContent = '✓ copied';
});
</script>
</body></html>`;
fs.writeFileSync(path.join(__dirname, 'install.html'), html);


console.log('diagnose bytes   :', diagBm.length);
console.log('bookmarklet bytes :', bookmarklet.length);
console.log('written           : bookmarklet/shortlink-autoskip.bookmarklet.txt, bookmarklet/install.html');
