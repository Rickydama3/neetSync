// background.js — the BRAIN (a "service worker").
//
// Three things to understand about background service workers in MV3:
//
// 1. There is NO page and NO DOM here. You can't use document, window,
//    or alert. It's pure JavaScript running behind the scenes.
//
// 2. It is NOT always running. Chrome starts it when something happens
//    (like a message arriving) and kills it after ~30s of inactivity.
//    So you can NEVER trust global variables to survive:
//
//       let count = 0;            // ❌ resets to 0 whenever Chrome
//       count++;                  //    restarts the worker
//
//    Anything you want to keep must go in chrome.storage. This is THE
//    classic MV3 bug — remember it.
//
// 3. Its console.log does NOT appear in the page's F12 console. To see
//    it: chrome://extensions → your extension's card → click the blue
//    "service worker" link. That opens the worker's own DevTools.

console.log('[LeetSync worker] started');

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[LeetSync worker] received:', message);

  if (message.type === 'PROBLEM_VIEWED') {
    // Async work (storage) + sendResponse requires returning `true`
    // below, which tells Chrome "keep the reply channel open, I'll
    // answer later." Forgetting this is classic bug #2.
    countVisit(message.slug).then((count) => {
      sendResponse({ ok: true, timesVisited: count });
    });
    return true; // <-- keep channel open for the async sendResponse
  }
});

// Increment a per-problem visit counter in chrome.storage.local.
// storage.local survives worker restarts, browser restarts, everything —
// it's the extension's little database.
async function countVisit(slug) {
  const data = await chrome.storage.local.get('visits');
  const visits = data.visits || {};
  visits[slug] = (visits[slug] || 0) + 1;
  await chrome.storage.local.set({ visits });
  console.log(`[LeetSync worker] ${slug} visited ${visits[slug]} time(s)`);
  return visits[slug];
}
