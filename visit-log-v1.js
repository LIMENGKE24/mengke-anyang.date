(() => {
  'use strict';
  if (location.origin !== 'https://mengke-anyang.date') return;
  const pages = new Set(['/', '/index.html', '/photos.html', '/favors.html', '/travel.html']);
  if (!pages.has(location.pathname)) return;
  const endpoint = 'https://visits.mengke-anyang.date/collect';
  function send() {
    if (document.visibilityState !== 'visible') {
      const onVisible = () => {
        if (document.visibilityState === 'visible') {
          document.removeEventListener('visibilitychange', onVisible);
          send();
        }
      };
      document.addEventListener('visibilitychange', onVisible);
      return;
    }
    try {
      if (!crypto.randomUUID) return;
      const body = JSON.stringify({ id: crypto.randomUUID(), page: location.pathname });
      fetch(endpoint, {
        method: 'POST', mode: 'cors', credentials: 'omit', keepalive: true,
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body
      }).catch(() => {});
    } catch {}
  }
  if (document.readyState === 'complete') send();
  else window.addEventListener('load', send, { once: true });
  window.addEventListener('pageshow', event => { if (event.persisted) send(); });
})();
