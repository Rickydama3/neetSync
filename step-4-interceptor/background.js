// background.js — the brain, now receiving real submission events.
// For this step we just record them properly in storage. Steps 5 & 6
// will add: fetch problem metadata, then push to GitHub.

console.log('[NeetSync worker] started');

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SUBMISSION') {
    recordSubmission(message.payload).then((record) => {
      sendResponse({ ok: true, record });
    });
    return true; // async sendResponse — keep channel open (Step 3 lesson!)
  }
});

async function recordSubmission(p) {
  if (!p.slug) return null;

  const data = await chrome.storage.local.get('problems');
  const problems = data.problems || {};

  const prev = problems[p.slug] || {
    slug: p.slug,
    attempts: 0,
    solved: false,
    firstSolvedAt: null,
  };

  const record = {
    ...prev,
    attempts: prev.attempts + 1,
    lang: p.lang || prev.lang,
    solved: prev.solved || p.accepted,
    firstSolvedAt: prev.firstSolvedAt || (p.accepted ? Date.now() : null),
    lastVerdict: p.verdict,
    lastRuntime: p.runtime,
    lastMemory: p.memory,
    // Keep the latest ACCEPTED code only — that's what we'll push later.
    code: p.accepted ? p.code : prev.code,
  };

  problems[p.slug] = record;
  await chrome.storage.local.set({ problems });

  console.log(
    `[NeetSync worker] ${p.slug}: ${p.verdict} ` +
    `(attempt #${record.attempts}${p.accepted ? ', SOLVED ✅' : ''})`
  );
  if (p.accepted) {
    console.log('[NeetSync worker] captured code:\n', (p.code || '').slice(0, 200));
  }

  return record;
}
