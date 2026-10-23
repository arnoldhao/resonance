import { mkdir, readFile, writeFile, appendFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { providers, collectProvider } from './providers.mjs';
import { chinaDate, priorDate, validateChart, buildSnapshot, sourceFreshnessIssue } from './ranking.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJSON = async path => JSON.parse(await readFile(path, 'utf8'));
const writeJSON = async (path, value) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, `${JSON.stringify(value, null, 2)}\n`); };
const now = new Date();
const date = chinaDate(now);
const generatedAt = now.toISOString();
const aliases = await readJSON(resolve(root, 'config/aliases.json'));
const importDirectory = resolve(root, 'imports', date);
const dailyDirectory = resolve(root, 'data/daily');
await mkdir(dailyDirectory, { recursive: true });
const dailyFiles = (await readdir(dailyDirectory)).filter(name => /^\d{4}-\d{2}-\d{2}\.json$/.test(name) && name.slice(0, 10) <= date).sort().slice(-14);
const dailyObservations = await Promise.all(dailyFiles.map(async name => ({ snapshot: await readJSON(resolve(dailyDirectory, name)), path: `data/daily/${name}` })));
const history = dailyObservations.map(item => item.snapshot).filter(day => day.date < date).slice(-13);

// Runs retain each real observation, including a success earlier on the same day that daily.json has since replaced.
const runDirectory = resolve(root, 'data/runs');
const oldestCacheDate = chinaDate(new Date(now.getTime() - Math.max(...providers.map(provider => provider.maxAgeHours)) * 3_600_000));
const runDates = existsSync(runDirectory) ? (await readdir(runDirectory)).filter(day => /^\d{4}-\d{2}-\d{2}$/.test(day) && day >= oldestCacheDate && day <= date) : [];
const runPaths = (await Promise.all(runDates.map(async day => (await readdir(resolve(runDirectory, day))).filter(name => name.endsWith('.json')).map(name => `data/runs/${day}/${name}`)))).flat();
const observations = [...await Promise.all(runPaths.map(async path => ({ snapshot: await readJSON(resolve(root, path)), path }))), ...dailyObservations].filter(({ snapshot }) => snapshot.mode === 'live' && snapshot.generatedAt <= generatedAt);

function previousSuccess(provider) {
  return observations.flatMap(({ snapshot, path }) => snapshot.sources
    .filter(source => source.id === provider.id && source.status === 'ok' && ['public', 'import'].includes(source.ingestion) && source.entries.length >= provider.collectionDepth)
    .map(source => ({ source, origin: { date: snapshot.date, generatedAt: snapshot.generatedAt, path, ingestion: source.ingestion } })))
    .sort((a, b) => Date.parse(b.source.fetchedAt) - Date.parse(a.source.fetchedAt) || b.origin.generatedAt.localeCompare(a.origin.generatedAt))
    .find(({ source }) => sourceFreshnessIssue(source, provider, generatedAt) === null);
}

// Provider failures are isolated deliberately and appear in both run records and the public source ledger.
const results = await Promise.allSettled(providers.map(async provider => {
  const importFile = resolve(importDirectory, `${provider.id}.json`);
  const imported = existsSync(importFile);
  if (!provider.enabled && !imported) return { ...provider, status: 'disabled', message: provider.disabledReason, count: 0, entries: [], fetchedAt: null, sourceUpdatedAt: null, sourcePeriod: null };
  const chart = validateChart(imported ? await readJSON(importFile) : await collectProvider(provider, { now }), provider, date);
  return { ...provider, providerId: provider.id, fetchedAt: chart.fetchedAt, sourceUpdatedAt: chart.sourceUpdatedAt, sourcePeriod: chart.sourcePeriod, entries: chart.entries, sourceUrl: chart.sourceUrl, chartName: chart.chartName, status: 'ok', ingestion: imported ? 'import' : 'public', attemptedAt: generatedAt, collectionError: null, cacheOrigin: null, message: imported ? '人工导入：保留来源与采集时间' : null };
}));
const sources = results.map((result, index) => {
  if (result.status === 'fulfilled') return result.value;
  const provider = providers[index];
  const collectionError = result.reason.message;
  const cached = previousSuccess(provider);
  if (cached) {
    const { source, origin } = cached;
    return {
      ...provider, providerId: provider.id, status: 'stale', ingestion: 'cache',
      fetchedAt: source.fetchedAt, sourceUpdatedAt: source.sourceUpdatedAt, sourcePeriod: source.sourcePeriod,
      sourceUrl: source.sourceUrl, chartName: source.chartName, entries: source.entries,
      attemptedAt: generatedAt, collectionError, cacheOrigin: origin,
      message: `采集失败，沿用 ${source.fetchedAt} 的成功观察（仍在有效窗口内）；${collectionError}`,
    };
  }
  return {
    ...provider, providerId: provider.id, status: 'error', ingestion: null,
    message: `${collectionError}；没有有效窗口内的完整成功观察，暂停计分`,
    attemptedAt: generatedAt, collectionError, cacheOrigin: null,
    entries: [], count: 0, fetchedAt: null, sourceUpdatedAt: null, sourcePeriod: null,
  };
});
const previous = history.find(day => day.date === priorDate(date));
const snapshot = buildSnapshot({ date, generatedAt, sources, aliases, previous, history });
const runId = generatedAt.replace(/[:.]/g, '-');
await writeJSON(resolve(root, `data/runs/${date}/${runId}.json`), snapshot);
const published = snapshot.coverage.status !== 'insufficient';
const status = { date, generatedAt, published, coverage: snapshot.coverage, sources: snapshot.sources.map(({ entries, ...source }) => source) };
await writeJSON(resolve(root, 'data/status.json'), status);
if (published) {
  await writeJSON(resolve(dailyDirectory, `${date}.json`), snapshot);
  await writeJSON(resolve(root, 'data/latest.json'), snapshot);
  const dates = (await readdir(dailyDirectory)).filter(name => /^\d{4}-\d{2}-\d{2}\.json$/.test(name)).map(name => name.slice(0, 10)).sort().reverse();
  await writeJSON(resolve(root, 'data/dates.json'), { dates });
}
const summary = [
  `## 共振 · ${date}`,
  `${published ? '已生成综合榜' : '未发布：独立来源组不足 2 个'}。${snapshot.coverage.available}/${providers.length} 平台（本次成功 ${snapshot.coverage.fresh}，历史沿用 ${snapshot.coverage.cached}），${snapshot.coverage.groups}/4 独立组。`,
  ...sources.map(source => `- ${source.name}: ${source.status}${source.message ? ` — ${source.message}` : ''}`),
].join('\n');
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `published=${published}\n`);
// Preserve diagnostics and permit the workflow to commit/deploy before reporting partial failure.
if (!published || sources.some(source => source.status === 'error' || source.status === 'stale')) process.exitCode = 1;
