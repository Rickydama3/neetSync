// content.js — the SENSOR.
// Detects which problem you're viewing and reports it to the background
// worker. Note what it does NOT do: no storage, no decisions. Sensors
// sense; the brain decides.

console.log('[LeetSync] content script loaded');

const match = location.pathname.match(/\/problems\/([^/]+)/);

if (match) {
  const slug = match[1];

  // Send a message to the background worker.
  // - First argument: any JSON-serializable object. Convention: a `type`
  //   field so the worker can tell message kinds apart (we'll add more
  //   types later, like SUBMISSION).
  // - Second argument: optional callback that receives the worker's reply.
  chrome.runtime.sendMessage(
    { type: 'PROBLEM_VIEWED', slug: slug },
    (response) => {
      // This runs when the worker calls sendResponse(...)
      console.log('[LeetSync] worker replied:', response);
    }
  );
}
