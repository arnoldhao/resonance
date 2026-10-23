import { cp, mkdir, rm, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAPI } from './api.mjs';
import { buildFeed } from './feeds.mjs';
import { buildWeeklyCharts } from './weekly.mjs';
import { chinaDate } from './ranking.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Local preview stays separate from the production files committed by Actions.
const preview = process.argv.includes('--preview');
const outputDirectory = preview ? '.preview' : 'dist';
const dist = resolve(root, outputDirectory);
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(resolve(root, 'site'), dist, { recursive: true });
const real = existsSync(resolve(root, 'data/latest.json'));
const dataDirectory = resolve(root, real ? 'data' : 'demo');
await mkdir(resolve(dist, 'data'), { recursive: true });
for (const item of ['latest.json', 'dates.json', 'daily']) await cp(resolve(dataDirectory, item), resolve(dist, 'data', item), { recursive: true });
const statusDirectory = existsSync(resolve(root, 'data/status.json')) ? 'data' : 'demo';
await cp(resolve(root, statusDirectory, 'status.json'), resolve(dist, 'data/status.json'));
await cp(resolve(root, 'docs'), resolve(dist, 'docs'), { recursive: true });
const snapshot = JSON.parse(await readFile(resolve(dataDirectory, 'latest.json'), 'utf8'));
const status = { ...JSON.parse(await readFile(resolve(root, statusDirectory, 'status.json'), 'utf8')), mode: statusDirectory === 'data' ? 'live' : 'demo' };
const { dates } = JSON.parse(await readFile(resolve(dataDirectory, 'dates.json'), 'utf8'));
const days = await Promise.all(dates.map(date => readFile(resolve(dataDirectory, 'daily', `${date}.json`), 'utf8').then(JSON.parse)));
const weeks = buildWeeklyCharts({ days, asOfDate: real ? chinaDate(new Date()) : snapshot.date });
const weeklyDirectory = resolve(dist, 'data/weekly');
await mkdir(weeklyDirectory, { recursive: true });
const writeWeekly = (name, value) => writeFile(resolve(weeklyDirectory, `${name}.json`), `${JSON.stringify(value, null, 2)}\n`);
await Promise.all([
  writeWeekly('index', {
    schemaVersion: 1,
    mode: snapshot.mode,
    latest: weeks[0]?.weekStart ?? null,
    weeks: weeks.map(week => ({ weekStart: week.weekStart, weekEnd: week.weekEnd, status: week.status, observedDays: week.coverage.observedDays })),
  }),
  ...weeks.map(week => writeWeekly(week.weekStart, week)),
  ...(weeks.length ? [writeWeekly('latest', weeks[0])] : []),
]);
const archives = [];
const archiveDirectory = resolve(dataDirectory, 'platform-history');
if (existsSync(archiveDirectory)) {
  for (const provider of await readdir(archiveDirectory)) {
    for (const file of (await readdir(resolve(archiveDirectory, provider))).filter(name => /^\d{4}-\d{2}-\d{2}\.json$/.test(name))) {
      archives.push(JSON.parse(await readFile(resolve(archiveDirectory, provider, file), 'utf8')));
    }
  }
}
await buildAPI({ dist, dataDirectory, snapshot, status, days, archives });
await cp(weeklyDirectory, resolve(dist, 'api/v1/weekly'), { recursive: true });
await buildFeed({ dist, dataDirectory, snapshot, weeks });
const quote = value => { const text = String(value); return `"${(/^[=+\-@\t\r]/.test(text) ? `'${text}` : text).replaceAll('"', '""')}"`; };
const csv = ['rank,title,artists,score,platform_count,date,mode', ...snapshot.songs.map(song => [song.rank, song.title, song.artists.join(' / '), song.score, song.appearances, snapshot.date, snapshot.mode].map(quote).join(','))].join('\n');
await writeFile(resolve(dist, 'data/latest.csv'), `\uFEFF${csv}\n`);
console.log(`静态文件已写入 ${outputDirectory}/；${real ? '真实快照' : '明确标记的设计示例'}，日榜 ${snapshot.songs.length} 首，周榜 ${weeks.length} 期；公开 API：/api/v1/index.json。`);
