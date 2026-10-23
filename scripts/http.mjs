import { setTimeout as sleep } from 'node:timers/promises';

const retryDelaysMs = [5_000, 10_000];
const retryableStatuses = new Set([408, 429, 500, 502, 503, 504]);
class RetryableReadError extends Error {}

function networkError(url, error) {
  // Node's generic "fetch failed" discards the useful DNS/TLS/socket cause unless recorded explicitly.
  const cause = error.cause ?? error;
  const details = (cause.errors ?? [cause]).map(item => [item.code, item.message].filter(Boolean).join(': ')).join('; ');
  return new RetryableReadError(`Network error from ${new URL(url).hostname}: ${details}`, { cause: error });
}

async function readOnce(url, { referer, format }) {
  let response;
  try {
    response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ResonanceCharts/1.0)',
        Accept: format === 'json' ? 'application/json' : 'text/html',
        ...(referer ? { Referer: referer } : {}),
      },
      signal: AbortSignal.timeout(60_000),
    });
  } catch (error) {
    throw networkError(url, error);
  }
  if (!response.ok) {
    await response.body?.cancel();
    const ErrorType = retryableStatuses.has(response.status) ? RetryableReadError : Error;
    throw new ErrorType(`HTTP ${response.status} from ${new URL(url).hostname}`);
  }
  let text;
  try {
    text = await response.text();
  } catch (error) {
    throw networkError(url, error);
  }
  // Malformed JSON and provider contract errors are not transport failures.
  return format === 'json' ? JSON.parse(text) : text;
}

/** Retry only failed public reads, up to two more times; callers validate the returned data once. */
export async function readPublic(url, { referer, format = 'json', sleepImpl = sleep } = {}) {
  const maxAttempts = retryDelaysMs.length + 1;
  for (let attempt = 0; ; attempt++) {
    try {
      const result = await readOnce(url, { referer, format });
      if (attempt > 0) console.log(`[采集重试成功 ${attempt + 1}/${maxAttempts}] ${new URL(url).hostname}`);
      return result;
    } catch (error) {
      if (!(error instanceof RetryableReadError) || attempt === retryDelaysMs.length) throw error;
      const delay = retryDelaysMs[attempt];
      console.warn(`[采集重试 ${attempt + 2}/${maxAttempts}] ${error.message}；${delay / 1000} 秒后再次请求。`);
      await sleepImpl(delay);
    }
  }
}
