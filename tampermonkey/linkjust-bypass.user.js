// ==UserScript==
// @name         LinkJust Bypass
// @namespace    https://linkjust.com/
// @version      1.0
// @description  Automatically bypass linkjust.com short links — skips the 20s timer / ad wall and redirects straight to the destination.
// @author       arvindg4u
// @match        https://linkjust.com/*
// @match        *://*/*?GetArticle=*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=linkjust.com
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    /* ── Strategy 1: Intercept the page before render ── */
    if (window.location.hostname === 'linkjust.com') {
        const shortCode = window.location.pathname.replace(/^\//, '');
        if (shortCode) {
            fetch(window.location.href, { method: 'HEAD', redirect: 'follow' })
                .then(resp => {
                    if (resp.redirected && resp.url && !resp.url.includes('linkjust.com')) {
                        window.location.replace(resp.url);
                    }
                })
                .catch(() => {});
        }
    }

    /* ── Strategy 2: DOM-ready bypass ── */
    function bypass() {
        // 2a. Canonical link extraction
        const canonical = document.querySelector('link[rel="canonical"]');
        if (canonical && canonical.href) {
            const dest = canonical.href.split('?')[0];
            if (!dest.includes(window.location.hostname) && dest !== window.location.href.split('?')[0]) {
                window.location.replace(dest);
                return;
            }
        }

        // 2b. Strip GetArticle param
        const url = new URL(window.location.href);
        if (url.searchParams.has('GetArticle')) {
            url.searchParams.delete('GetArticle');
            const clean = url.toString();
            if (clean !== window.location.href) {
                window.location.replace(clean);
                return;
            }
        }

        // 2c. Kill the timer
        const timerSpan = document.getElementById('timer_seconds');
        if (timerSpan) timerSpan.textContent = '0';

        // 2d. Click Next button
        const nextBtnLink = document.getElementById('next-timer-btn');
        if (nextBtnLink) {
            nextBtnLink.style.display = 'block';
            nextBtnLink.click();
        }
        const nextBtn = nextBtnLink && nextBtnLink.querySelector('button');
        if (nextBtn) nextBtn.click();

        // 2e. Hide timer overlay
        const timerDiv = document.getElementById('linkjust-timer');
        if (timerDiv) timerDiv.style.display = 'none';

        // 2f. Remove fixed overlays
        const overlays = document.querySelectorAll('div[style*="position: fixed"], div[style*="position:fixed"]');
        overlays.forEach(el => {
            if (el.offsetParent !== null && el.innerText.includes('linkjust') || el.id === 'linkjust-timer') {
                el.remove();
            }
        });

        // 2g. Unhide main content
        document.body.style.overflow = 'auto';
        const mainContent = document.getElementById('main') || document.querySelector('.site-main') || document.querySelector('.content-area') || document.querySelector('article');
        if (mainContent) {
            mainContent.style.display = 'block';
            mainContent.style.visibility = 'visible';
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bypass);
    } else {
        bypass();
    }

    setTimeout(bypass, 250);
    setTimeout(bypass, 500);

    /* ── Strategy 3: Link hover hint ── */
    document.addEventListener('mouseover', function (e) {
        const link = e.target.closest('a[href*="linkjust.com"]');
        if (link) {
            link.title = '🔄 LinkJust — bypass active';
        }
    });
})();
