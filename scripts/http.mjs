/** One public read per request. Errors are reported by the caller; no retries. */
export async function readPublic(url, { referer, format = 'json' } = {}) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; ResonanceCharts/1.0)',
      Accept: format === 'json' ? 'application/json' : 'text/html',
      ...(referer ? { Referer: referer } : {}),
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${new URL(url).hostname}`);
  return format === 'json' ? response.json() : response.text();
}
