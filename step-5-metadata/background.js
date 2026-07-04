// background.js — Step 5: after an ACCEPTED submission, ask LeetCode's
// GraphQL API who this problem is (title, difficulty, topic tags) and
// merge that into the stored record.
//
// New concept — GraphQL: unlike a normal REST endpoint that returns a
// fixed shape, GraphQL lets the CLIENT describe exactly which fields it
// wants. Our "query" below is literally a text description of the data
// shape we want back. One endpoint, we pick the fields.
//
// New concept — host_permissions: this worker is not a LeetCode page, so
// by default the browser would block a fetch() to leetcode.com. The
// "host_permissions" entry in manifest.json is us asking for that right
// at install time. Remove it and watch the fetch fail — good experiment.

console.log('[NeetSync worker] started');

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SUBMISSION') {
    handleSubmission(message.payload).then((record) => {
      sendResponse({ ok: true, record });
    });
    return true; // async reply — keep the channel open
  }
});

async function handleSubmission(p) {
  if (!p.slug) return null;

  // ---- 1. Record the attempt (same as Step 4) --------------------------
  const data = await chrome.storage.local.get('problems');
  const problems = data.problems || {};
  const prev = problems[p.slug] || {
    slug: p.slug,
    attempts: 0,
    solved: false,
    firstSolvedAt: null,
  };

  let record = {
    ...prev,
    attempts: prev.attempts + 1,
    lang: p.lang || prev.lang,
    solved: prev.solved || p.accepted,
    firstSolvedAt: prev.firstSolvedAt || (p.accepted ? Date.now() : null),
    lastVerdict: p.verdict,
    code: p.accepted ? p.code : prev.code,
  };

  console.log(
    `[NeetSync worker] ${p.slug}: ${p.verdict} (attempt #${record.attempts})`
  );

  // ---- 2. NEW: on acceptance, enrich with metadata ----------------------
  // Only fetch if we don't already have it (title present = already fetched;
  // no point hitting the API again for a re-solve).
  if (p.accepted && !record.title) {
    try {
      const meta = await fetchProblemMeta(p.slug);
      record = {
        ...record,
        questionId: meta.questionFrontendId, // "1"
        title: meta.title,                   // "Two Sum"
        difficulty: meta.difficulty,         // "Easy"
        topicTags: meta.topicTags.map((t) => t.name), // ["Array", "Hash Table"]
      };
      console.log(
        `[NeetSync worker] enriched: #${record.questionId} "${record.title}" ` +
        `[${record.difficulty}] tags: ${record.topicTags.join(', ')}`
      );
    } catch (err) {
      // Metadata failing shouldn't lose the submission itself.
      console.error('[NeetSync worker] metadata fetch failed:', err);
    }
  }

  problems[p.slug] = record;
  await chrome.storage.local.set({ problems });
  return record;
}

// Ask LeetCode's GraphQL endpoint for the problem's public metadata.
async function fetchProblemMeta(slug) {
  const query = `
    query questionData($titleSlug: String!) {
      question(titleSlug: $titleSlug) {
        questionFrontendId
        title
        difficulty
        topicTags { name }
      }
    }
  `;

  const res = await fetch('https://leetcode.com/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: query,
      variables: { titleSlug: slug },
    }),
  });

  if (!res.ok) {
    throw new Error('GraphQL request failed with HTTP ' + res.status);
  }

  const json = await res.json();
  const q = json && json.data && json.data.question;
  if (!q) throw new Error('No question data returned for ' + slug);
  return q;
}
