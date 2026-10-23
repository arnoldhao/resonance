/** One public read per request. Errors are reported by the caller; no retries. */
export async function readPublic(url, { referer, format = 'json' } = {}) {
  let response;
  try {
    response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ResonanceCharts/1.0)',
        Accept: format === 'json' ? 'application/json' : 'text/html',
        ...(referer ? { Referer: referer } : {}),
      },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    // Node's generic "fetch failed" discards the useful DNS/TLS/socket cause unless recorded explicitly.
    const cause = error.cause ?? error;
    const details = (cause.errors ?? [cause]).map(item => [item.code, item.message].filter(Boolean).join(': ')).join('; ');
    throw new Error(`Network error from ${new URL(url).hostname}: ${details}`, { cause: error });
  }
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${new URL(url).hostname}`);
  return format === 'json' ? response.json() : response.text();
}
