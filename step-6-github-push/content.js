// content.js — now has TWO jobs:
//   1. Smuggle interceptor.js into the page's MAIN world.
//   2. Listen for its postMessage "shouts" and relay them to the worker.
//
// Note run_at changed to "document_start" in the manifest: we must patch
// fetch BEFORE LeetCode's own code grabs a reference to it. If we inject
// at document_idle, LeetCode may already hold the original fetch and our
// wrapper never sees the traffic.

// --- Job 1: inject ----------------------------------------------------------
// We can't just eval the code (CSP forbids it). Instead: create a <script>
// tag pointing at our file. This works ONLY because manifest.json lists
// interceptor.js under web_accessible_resources — that's what makes the
// chrome-extension:// URL loadable by a regular web page.
const s = document.createElement('script');
s.src = chrome.runtime.getURL('interceptor.js');
s.onload = () => s.remove(); // tag itself no longer needed once code ran
(document.head || document.documentElement).appendChild(s);

console.log('[NeetSync] interceptor injected');

// --- Job 2: relay -----------------------------------------------------------
window.addEventListener('message', (event) => {
  // postMessage is a public channel — ANY script on the page can shout.
  // So we validate: must come from this same window, and must carry our
  // source tag. Never trust postMessage data blindly.
  if (event.source !== window) return;
  if (!event.data || event.data.source !== 'neetsync') return;
  if (event.data.type !== 'submission') return;

  console.log('[NeetSync] relaying submission to worker:', event.data.payload);
  chrome.runtime.sendMessage({
    type: 'SUBMISSION',
    payload: event.data.payload,
  });
});
