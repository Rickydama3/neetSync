// background.js — Step 6: the full pipeline.
//   detect (Step 4) -> record -> enrich (Step 5) -> PUSH TO GITHUB (new!)
//
// On every ACCEPTED submission we create/update two files in your repo:
//   <Topic>/<id>-<slug>/solution.<ext>   your accepted code
//   <Topic>/<id>-<slug>/README.md        study note (title, tags, attempts)
//
// GitHub's "Contents API" rule you must know:
//   - Creating a NEW file:      PUT with { message, content }
//   - Updating an EXISTING one: PUT with { message, content, sha }
//     where sha identifies the current version (prevents blind overwrite).
//   So before every PUT we GET the path to see if it exists and grab its sha.

console.log('[NeetSync worker] started');

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SUBMISSION') {
    handleSubmission(message.payload)
      .then((record) => sendResponse({ ok: true, record }))
      .catch((err) => {
        console.error('[NeetSync worker] error:', err);
        sendResponse({ ok: false, error: String(err) });
      });
    return true;
  }
});

async function handleSubmission(p) {
  if (!p.slug) return null;

  // ---- 1. Record the attempt --------------------------------------------
  const data = await chrome.storage.local.get('problems');
  const problems = data.problems || {};
  const prev = problems[p.slug] || {
    slug: p.slug, attempts: 0, solved: false, firstSolvedAt: null,
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
  console.log(`[NeetSync worker] ${p.slug}: ${p.verdict} (attempt #${record.attempts})`);

  // ---- 2. Enrich with metadata (once) ------------------------------------
  if (p.accepted && !record.title) {
    try {
      const meta = await fetchProblemMeta(p.slug);
      record = {
        ...record,
        questionId: meta.questionFrontendId,
        title: meta.title,
        difficulty: meta.difficulty,
        topicTags: meta.topicTags.map((t) => t.name),
      };
      console.log(`[NeetSync worker] enriched: #${record.questionId} "${record.title}"`);
    } catch (err) {
      console.error('[NeetSync worker] metadata fetch failed:', err);
    }
  }

  problems[p.slug] = record;
  await chrome.storage.local.set({ problems });

  // ---- 3. NEW: push to GitHub on acceptance -------------------------------
  if (p.accepted) {
    const { settings } = await chrome.storage.local.get('settings');
    if (!settings || !settings.token) {
      console.warn('[NeetSync worker] not configured — open the popup and save your GitHub settings.');
      return record;
    }
    try {
      await pushToGitHub(settings, record, p);
      console.log('[NeetSync worker] ✅ pushed to GitHub:', record.title || p.slug);
    } catch (err) {
      console.error('[NeetSync worker] GitHub push failed:', err);
    }
  }

  return record;
}

// ---------------------------------------------------------------------------
// GitHub push
// ---------------------------------------------------------------------------

const EXT = {
  cpp: 'cpp', c: 'c', java: 'java', python: 'py', python3: 'py',
  javascript: 'js', typescript: 'ts', golang: 'go', rust: 'rs',
  kotlin: 'kt', swift: 'swift', csharp: 'cs', ruby: 'rb',
  mysql: 'sql', mssql: 'sql', oraclesql: 'sql',
};

async function pushToGitHub(settings, record, p) {
  // Folder like: Dynamic-Programming/0005-longest-palindromic-substring
  const topic = (record.topicTags && record.topicTags[0]) || 'Misc';
  const id = String(record.questionId || '0').padStart(4, '0');
  const folder = topic.replace(/\s+/g, '-') + '/' + id + '-' + record.slug;
  const ext = EXT[record.lang] || 'txt';

  // File 1: the solution code
  await upsertFile(
    settings,
    folder + '/solution.' + ext,
    (record.code || '').trimEnd() + '\n',
    'Add solution: ' + (record.title || record.slug)
  );

  // File 2: the study note
  const note =
    '# ' + (record.questionId || '?') + '. ' + (record.title || record.slug) + '\n\n' +
    '**Difficulty:** ' + (record.difficulty || '—') + '  \n' +
    '**Topics:** ' + ((record.topicTags || []).join(', ') || '—') + '  \n' +
    '**Attempts:** ' + record.attempts + '  \n' +
    '**Runtime:** ' + (p.runtime || '—') + ' | **Memory:** ' + (p.memory || '—') + '\n\n' +
    '[View on LeetCode](https://leetcode.com/problems/' + record.slug + '/)\n\n' +
    '## Notes\n\n' +
    '> Write your intuition here: what pattern is this? what tripped you up?\n\n' +
    '## Complexity\n\n' +
    '- Time: O(?)\n- Space: O(?)\n';

  await upsertFile(
    settings,
    folder + '/README.md',
    note,
    'Add notes: ' + (record.title || record.slug)
  );
}

// Create the file if new, update it if it exists (fetch sha first).
async function upsertFile(settings, path, content, commitMessage) {
  const base = 'https://api.github.com/repos/' + settings.owner + '/' + settings.repo + '/contents/' + path;
  const headers = {
    Authorization: 'Bearer ' + settings.token,
    Accept: 'application/vnd.github+json',
  };

  // Does it already exist? (200 = yes, grab sha; 404 = no)
  let sha;
  const probe = await fetch(base, { headers });
  if (probe.status === 200) {
    sha = (await probe.json()).sha;
  } else if (probe.status !== 404) {
    throw new Error('GitHub GET ' + path + ' -> HTTP ' + probe.status);
  }

  const body = {
    message: commitMessage,
    content: toBase64(content), // Contents API requires base64
  };
  if (sha) body.sha = sha;

  const res = await fetch(base, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error('GitHub PUT ' + path + ' -> HTTP ' + res.status + ' ' + text.slice(0, 200));
  }
}

// btoa() alone chokes on non-Latin characters (e.g. "→" in a comment).
// This dance makes it UTF-8 safe.
function toBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

// ---------------------------------------------------------------------------
// LeetCode GraphQL (unchanged from Step 5)
// ---------------------------------------------------------------------------

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
    body: JSON.stringify({ query, variables: { titleSlug: slug } }),
  });
  if (!res.ok) throw new Error('GraphQL HTTP ' + res.status);
  const json = await res.json();
  const q = json && json.data && json.data.question;
  if (!q) throw new Error('No question data for ' + slug);
  return q;
}
