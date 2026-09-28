/**
 * Shortlink Auto-Skip — page diagnostics collector.
 *
 * Run it ON THE STUCK PAGE (as a bookmarklet, or paste into the console).
 * It opens a panel with a full report: buttons, timers, the gate's own inline
 * scripts, storage flags and visibility state — everything needed to write an
 * exact site rule. Nothing is uploaded anywhere; you copy or download the text.
 */
(function () {
    'use strict';

    const MAX_SCRIPT = 6000;      // chars kept per inline <script>
    const MAX_SCRIPTS = 10;
    const cut = (s, n) => {
        s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
        return s.length > n ? s.slice(0, n) + ' …[+' + (s.length - n) + ' chars]' : s;
    };

    const out = [];
    const add = (k, v) => out.push(k + ': ' + v);
    const head = (t) => out.push('\n===== ' + t + ' =====');

    /* ---------- page ---------- */
    head('PAGE');
    add('url', location.href);
    add('referrer', document.referrer || '(none)');
    add('title', cut(document.title, 120));
    add('readyState', document.readyState);
    add('when', new Date().toISOString());
    add('userAgent', cut(navigator.userAgent, 200));
    add('visibilityState', document.visibilityState + ' / hidden=' + document.hidden +
        ' / hasFocus=' + (document.hasFocus ? document.hasFocus() : 'n/a'));
    add('autoSkipPresent', !!(window.__shortlinkAutoSkip || document.getElementById('sas-badge')));
    const badge = document.getElementById('sas-badge');
    if (badge) add('autoSkipBadge', cut(badge.textContent, 160));

    const bodyText = (document.body && (document.body.innerText || document.body.textContent)) || '';
    const stepM = bodyText.slice(0, 6000).match(/step\s*(\d{1,2})\s*(?:\/|of|out of)\s*(\d{1,2})/i);
    add('stepText', stepM ? stepM[0] : '(no "step x/y" found)');
    add('bodyTextLength', bodyText.length);

    head('VISIBLE TEXT (first 1500 chars)');
    out.push(cut(bodyText, 1500));

    /* ---------- clickable elements ---------- */
    head('CLICKABLE ELEMENTS');
    const vis = (el) => {
        try {
            const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
            return r.width > 1 && r.height > 1 && cs.display !== 'none' && cs.visibility !== 'hidden' &&
                parseFloat(cs.opacity || '1') > 0.05;
        } catch (e) { return false; }
    };
    const els = Array.from(document.querySelectorAll(
        'button, a, input[type="submit"], input[type="button"], [role="button"], .btn, .button, [onclick]'));
    add('count', els.length);
    els.slice(0, 60).forEach((el, i) => {
        const bits = [
            '#' + i,
            el.tagName,
            el.id ? 'id=' + el.id : '',
            (typeof el.className === 'string' && el.className) ? 'class=' + cut(el.className, 70) : '',
            'text="' + cut(el.innerText || el.textContent || el.value || '', 60) + '"',
            el.getAttribute && el.getAttribute('href') ? 'href=' + cut(el.getAttribute('href'), 120) : '',
            'visible=' + vis(el),
            'disabled=' + !!(el.disabled || el.getAttribute('aria-disabled') === 'true'),
            el.getAttribute && el.getAttribute('target') ? 'target=' + el.getAttribute('target') : '',
            el.getAttribute && el.getAttribute('onclick') ? 'onclick=' + cut(el.getAttribute('onclick'), 200) : '',
        ].filter(Boolean);
        out.push(bits.join(' | '));
    });

    /* ---------- timers / counters in the DOM ---------- */
    head('TIMER-ISH ELEMENTS');
    const timers = Array.from(document.querySelectorAll(
        '[id*="timer" i],[class*="timer" i],[id*="count" i],[class*="count" i],[id*="wait" i],[class*="wait" i],' +
        '[id*="verif" i],[class*="verif" i],[id*="link" i],[class*="link" i],[id*="step" i],[class*="step" i]'))
        .slice(0, 40);
    add('count', timers.length);
    timers.forEach(el => out.push(el.tagName + ' id=' + (el.id || '-') +
        ' class=' + cut(typeof el.className === 'string' ? el.className : '', 60) +
        ' text="' + cut(el.innerText || el.textContent || '', 50) + '" visible=' + vis(el)));

    /* ---------- iframes ---------- */
    head('IFRAMES');
    const frames = Array.from(document.querySelectorAll('iframe'));
    add('count', frames.length);
    frames.slice(0, 15).forEach((f, i) => {
        let sameOrigin = false;
        try { sameOrigin = !!(f.contentDocument && f.contentDocument.body); } catch (e) { sameOrigin = false; }
        out.push('#' + i + ' src=' + cut(f.getAttribute('src') || '(none)', 140) +
            ' id=' + (f.id || '-') + ' sameOrigin=' + sameOrigin + ' visible=' + vis(f));
    });

    /* ---------- the gate's own code ---------- */
    head('INLINE SCRIPTS (the gate logic)');
    const inline = Array.from(document.querySelectorAll('script:not([src])'))
        .map(s => s.textContent || '')
        .filter(t => t.trim().length > 40);
    add('count', inline.length);
    inline.slice(0, MAX_SCRIPTS).forEach((t, i) => {
        out.push('\n--- inline script #' + i + ' (' + t.length + ' chars) ---');
        out.push(cut(t, MAX_SCRIPT));
    });

    head('EXTERNAL SCRIPTS');
    Array.from(document.querySelectorAll('script[src]')).slice(0, 40)
        .forEach(s => out.push(cut(s.getAttribute('src'), 160)));

    /* ---------- storage / flags ---------- */
    head('STORAGE');
    const dumpStore = (name, store) => {
        try {
            const keys = Object.keys(store);
            out.push(name + ' (' + keys.length + ' keys)');
            keys.slice(0, 40).forEach(k => out.push('  ' + k + ' = ' + cut(store.getItem(k), 160)));
        } catch (e) { out.push(name + ': unavailable (' + e.message + ')'); }
    };
    dumpStore('localStorage', localStorage);
    dumpStore('sessionStorage', sessionStorage);
    add('cookieNames', document.cookie.split(';').map(c => c.split('=')[0].trim()).filter(Boolean).join(', ') || '(none)');

    /* ---------- interesting globals ---------- */
    head('GLOBALS THAT LOOK RELEVANT');
    const interesting = /(sec|time|timer|count|wait|verif|token|link|url|redirect|step|ad|click|safe|sora|wpsafe)/i;
    let shown = 0;
    try {
        for (const k in window) {
            if (shown >= 60) break;
            if (!interesting.test(k)) continue;
            let v;
            try { v = window[k]; } catch (e) { continue; }
            const t = typeof v;
            if (t === 'object' || t === 'function' || t === 'undefined') continue;
            out.push(k + ' = ' + cut(v, 120) + '  (' + t + ')');
            shown++;
        }
    } catch (e) { out.push('(enumeration failed: ' + e.message + ')'); }

    const report = out.join('\n');

    /* ---------- UI ---------- */
    const old = document.getElementById('sas-diag');
    if (old) old.remove();
    const wrap = document.createElement('div');
    wrap.id = 'sas-diag';
    wrap.setAttribute('style', [
        'position:fixed', 'inset:0', 'z-index:2147483647', 'background:rgba(2,6,12,.96)',
        'color:#e6edf3', 'font:13px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif',
        'padding:12px', 'box-sizing:border-box', 'display:flex', 'flex-direction:column', 'gap:8px',
    ].join(';'));
    const btnCss = 'font:700 14px system-ui;padding:10px 14px;border:0;border-radius:8px;color:#fff;cursor:pointer';
    wrap.innerHTML =
        '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
        '<b style="font-size:15px">Auto-Skip diagnostics</b>' +
        '<span style="color:#8b949e">' + report.length + ' chars</span>' +
        '<span style="flex:1"></span>' +
        '<button id="sasd-copy" style="' + btnCss + ';background:#238636">Copy</button>' +
        '<button id="sasd-dl" style="' + btnCss + ';background:#1f6feb">Download .txt</button>' +
        '<button id="sasd-x" style="' + btnCss + ';background:#6e7681">Close</button>' +
        '</div>' +
        '<textarea id="sasd-t" readonly style="flex:1;width:100%;background:#0d1117;color:#c9d1d9;' +
        'border:1px solid #30363d;border-radius:8px;padding:10px;font:11px/1.45 ui-monospace,monospace;' +
        'box-sizing:border-box"></textarea>';
    document.documentElement.appendChild(wrap);
    const ta = wrap.querySelector('#sasd-t');
    ta.value = report;

    wrap.querySelector('#sasd-x').onclick = () => wrap.remove();
    wrap.querySelector('#sasd-copy').onclick = async () => {
        try { await navigator.clipboard.writeText(report); }
        catch (e) { ta.focus(); ta.select(); try { document.execCommand('copy'); } catch (e2) { /* ignore */ } }
        wrap.querySelector('#sasd-copy').textContent = '✓ Copied';
    };
    wrap.querySelector('#sasd-dl').onclick = () => {
        try {
            const blob = new Blob([report], { type: 'text/plain' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'autoskip-diagnostics-' + location.hostname + '.txt';
            document.body.appendChild(a);
            a.click();
            setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
        } catch (e) { alert('Download failed: ' + e.message + ' — use Copy instead.'); }
    };

    try { console.log(report); } catch (e) { /* ignore */ }
    return report.length;
})();
