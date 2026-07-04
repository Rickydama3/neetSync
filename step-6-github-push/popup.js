// popup.js — the settings screen.
// Saves { token, owner, repo } into chrome.storage.local (the same little
// database the worker uses) and verifies the token by asking GitHub
// "who am I?" (GET /user). If GitHub answers with a username, the token
// is valid.

const $ = (id) => document.getElementById(id);

// Load any previously saved settings into the form.
chrome.storage.local.get('settings').then(({ settings }) => {
  if (!settings) return;
  $('token').value = settings.token || '';
  $('owner').value = settings.owner || '';
  $('repo').value = settings.repo || '';
});

$('save').addEventListener('click', async () => {
  const settings = {
    token: $('token').value.trim(),
    owner: $('owner').value.trim(),
    repo: $('repo').value.trim(),
  };
  const status = $('status');

  if (!settings.token || !settings.owner || !settings.repo) {
    status.textContent = 'Fill in all three fields.';
    status.className = 'err';
    return;
  }

  status.textContent = 'Checking token…';
  status.className = '';

  try {
    const res = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: 'Bearer ' + settings.token,
        Accept: 'application/vnd.github+json',
      },
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const user = await res.json();

    await chrome.storage.local.set({ settings });
    status.textContent = '✅ Connected as ' + user.login + '. Saved.';
    status.className = 'ok';
  } catch (err) {
    status.textContent = '❌ Token rejected (' + err.message + ')';
    status.className = 'err';
  }
});
