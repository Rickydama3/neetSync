// interceptor.js — runs in the page's MAIN world (LeetCode's own world).
//
// Because we're in the MAIN world:
//   ✅ we CAN see and replace the page's window.fetch
//   ❌ we CANNOT use chrome.* APIs (those only exist in the isolated world)
//
// So our only way to talk to the extension is window.postMessage — a
// shout that anyone on the page can hear. The content script listens.
//
// LeetCode's submission flow (as of mid-2026 — third parties can change!):
//   1. POST .../problems/<slug>/submit/     body contains your code + lang
//   2. GET  .../submissions/detail/<id>/check/   polled every ~1s until
//      the judge finishes; final response has state:"SUCCESS" and a
//      status_msg like "Accepted" or "Wrong Answer".

(function () {
  console.log('[NeetSync interceptor] alive in MAIN world');

  // The /check/ response doesn't always include your source code, so we
  // remember the most recent submit payload and attach it ourselves.
  let lastSubmit = {};

  function shout(payload) {
    window.postMessage(
      { source: 'neetsync', type: 'submission', payload: payload },
      '*'
    );
  }

  function rememberSubmit(body) {
    try {
      const parsed = typeof body === 'string' ? JSON.parse(body) : body;
      if (parsed && parsed.typed_code) {
        lastSubmit = { code: parsed.typed_code, lang: parsed.lang };
        console.log('[NeetSync interceptor] captured submit:', parsed.lang);
      }
    } catch (e) {
      /* body wasn't JSON — not our request */
    }
  }

  function inspectCheck(url, data) {
    // Ignore poll responses while the judge is still working.
    if (!data || data.state !== 'SUCCESS') return;
    // "Run" (the test button) uses a different endpoint; real submissions
    // come back on /submissions/detail/<id>/check/ and carry a status_msg.
    if (!url.includes('/submissions/detail/')) return;
    if (!data.status_msg) return;

    const m = location.pathname.match(/\/problems\/([^/]+)/);

    shout({
      accepted: data.status_msg === 'Accepted',
      verdict: data.status_msg,          // "Accepted", "Wrong Answer", ...
      slug: m ? m[1] : null,
      lang: data.lang || lastSubmit.lang,
      runtime: data.status_runtime,      // e.g. "52 ms"
      memory: data.status_memory,        // e.g. "16.4 MB"
      code: data.code || lastSubmit.code,
    });
  }

  // ---- Replace window.fetch with a spying wrapper ------------------------
  const realFetch = window.fetch;

  window.fetch = function (...args) {
    const url = typeof args[0] === 'string' ? args[0] : args[0] && args[0].url;
    const options = args[1];

    // Outgoing: is this the submit request? Remember the code.
    if (url && url.includes('/submit/') && options && options.body) {
      rememberSubmit(options.body);
    }

    // Always call the REAL fetch — we observe, never block.
    return realFetch.apply(this, args).then(function (response) {
      // Incoming: is this a judge-result poll? Peek at a CLONE.
      // (A response body can only be read once; if we read the original,
      // LeetCode's own code would break. clone() gives us our own copy.)
      if (url && url.includes('/check/')) {
        response.clone().json()
          .then(function (data) { inspectCheck(url, data); })
          .catch(function () { /* not JSON, ignore */ });
      }
      return response;
    });
  };

  // ---- Same trick for XMLHttpRequest (older API LeetCode sometimes uses)
  const realOpen = XMLHttpRequest.prototype.open;
  const realSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    this._neetsyncUrl = url;
    return realOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function (body) {
    const url = this._neetsyncUrl;
    if (url && url.includes('/submit/') && body) rememberSubmit(body);
    this.addEventListener('load', function () {
      if (url && url.includes('/check/')) {
        try { inspectCheck(url, JSON.parse(this.responseText)); }
        catch (e) { /* ignore */ }
      }
    });
    return realSend.apply(this, arguments);
  };
})();
