import { mkdir, readFile, writeFile, appendFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { providers, collectProvider } from './providers.mjs';
import { chinaDate, priorDate, validateChart, buildSnapshot } from './ranking.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJSON = async path => JSON.parse(await readFile(path, 'utf8'));
const writeJSON = async (path, value) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, `${JSON.stringify(value, null, 2)}\n`); };
const now = new Date();
const date = chinaDate(now);
const generatedAt = now.toISOString();
const aliases = await readJSON(resolve(root, 'config/aliases.json'));
const importDirectory = resolve(root, 'imports', date);

// Provider failures are isolated deliberately and appear in both run records and the public source ledger.
const results = await Promise.allSettled(providers.map(async provider => {
  const importFile = resolve(importDirectory, `${provider.id}.json`);
  const imported = existsSync(importFile);
  if (!provider.enabled && !imported) return { ...provider, status: 'disabled', message: provider.disabledReason, count: 0, entries: [], fetchedAt: null, sourceUpdatedAt: null, sourcePeriod: null };
  const chart = validateChart(imported ? await readJSON(importFile) : await collectProvider(provider, { now }), provider, date);
  return { ...provider, providerId: provider.id, fetchedAt: chart.fetchedAt, sourceUpdatedAt: chart.sourceUpdatedAt, sourcePeriod: chart.sourcePeriod, entries: chart.entries, sourceUrl: chart.sourceUrl, chartName: chart.chartName, status: 'ok', ingestion: imported ? 'import' : 'public', message: imported ? '人工导入：保留来源与采集时间' : null };
}));
const sources = results.map((result, index) => result.status === 'fulfilled' ? result.value : {
  ...providers[index], status: 'error', message: result.reason.message, entries: [], count: 0, fetchedAt: generatedAt, sourceUpdatedAt: null, sourcePeriod: null,
});
const dailyDirectory = resolve(root, 'data/daily');
await mkdir(dailyDirectory, { recursive: true });
const dailyFiles = (await readdir(dailyDirectory)).filter(name => /^\d{4}-\d{2}-\d{2}\.json$/.test(name) && name.slice(0, 10) < date).sort().slice(-13);
const history = await Promise.all(dailyFiles.map(name => readJSON(resolve(dailyDirectory, name))));
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
  `${published ? '已生成综合榜' : '未发布：独立来源组不足 2 个'}。${snapshot.coverage.available}/${providers.length} 平台，${snapshot.coverage.groups}/4 独立组。`,
  ...sources.map(source => `- ${source.name}: ${source.status}${source.message ? ` — ${source.message}` : ''}`),
].join('\n');
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `published=${published}\n`);
// Preserve diagnostics and permit the workflow to commit/deploy before reporting partial failure.
if (!published || sources.some(source => source.status === 'error')) process.exitCode = 1;
