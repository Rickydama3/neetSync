// content.js — runs automatically on every page matching leetcode.com/*
//
// Three things to understand about content scripts:
//
// 1. They run in an "ISOLATED world": they can see and modify the page's
//    DOM, but they CANNOT see the page's JavaScript variables or its
//    window.fetch. (This is exactly why Step 4 will need a separately
//    injected script.)
//
// 2. Their console.log goes to the PAGE's DevTools console (F12 on the
//    LeetCode tab), not the extension's console.
//
// 3. They can use a limited set of chrome.* APIs — enough to send
//    messages to the background worker, which is Step 3.

console.log('[LeetSync] content script loaded on:', location.pathname);

// Proof we can read the page: extract the problem slug from the URL.
// e.g. /problems/two-sum/ -> "two-sum"
const match = location.pathname.match(/\/problems\/([^/]+)/);
if (match) {
  console.log('[LeetSync] you are on problem:', match[1]);
}

// Proof we can modify the page: a small badge in the corner for 3 seconds.
const badge = document.createElement('div');
badge.textContent = 'LeetSync active';
badge.style.cssText = [
  'position:fixed',
  'bottom:16px',
  'right:16px',
  'z-index:99999',
  'background:#ffa116',
  'color:#1a1a1a',
  'padding:6px 12px',
  'border-radius:8px',
  'font:600 12px system-ui',
  'box-shadow:0 2px 8px rgba(0,0,0,.3)',
].join(';');
document.body.appendChild(badge);
setTimeout(() => badge.remove(), 3000);
