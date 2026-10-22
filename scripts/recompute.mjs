import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSnapshot, priorDate } from './ranking.mjs';
import { revisionOf } from './feeds.mjs';

// Recalculate published editions from their preserved source rows. No network requests.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJSON = async path => JSON.parse(await readFile(path, 'utf8'));
const writeJSON = (path, value) => writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
const aliases = await readJSON(resolve(root, 'config/aliases.json'));
const directory = resolve(root, 'data/daily');
const files = (await readdir(directory)).filter(name => /^\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort();
if (!files.length) throw new Error('还没有真实日榜；请先采集。示例数据不参与重算。');
const history = [];
for (const file of files) {
  const source = await readJSON(resolve(directory, file));
  const snapshot = buildSnapshot({ date: source.date, generatedAt: source.generatedAt, sources: source.sources, aliases, previous: history.find(day => day.date === priorDate(source.date)), history: history.slice(-13) });
  if (revisionOf(snapshot) !== revisionOf(source)) snapshot.recomputedAt = new Date().toISOString();
  else if (source.recomputedAt) snapshot.recomputedAt = source.recomputedAt;
  await writeJSON(resolve(directory, file), snapshot);
  history.push(snapshot);
}
await writeJSON(resolve(root, 'data/latest.json'), history.at(-1));
await writeJSON(resolve(root, 'data/dates.json'), { dates: history.map(day => day.date).reverse() });
console.log(`已重算 ${history.length} 期日榜；原始观察记录 data/runs/ 未修改。`);
