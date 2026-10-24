import { cp, mkdir, rm, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAPI } from './api.mjs';
import { buildFeed } from './feeds.mjs';
import { buildWeeklyCharts, buildMonthlyCharts } from './weekly.mjs';
import { chinaDate, priorDate, withPlatformMovements, buildMovementChart } from './ranking.mjs';
import { buildCadenceReport } from './cadence.mjs';

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
let snapshot = JSON.parse(await readFile(resolve(dataDirectory, 'latest.json'), 'utf8'));
const status = { ...JSON.parse(await readFile(resolve(root, statusDirectory, 'status.json'), 'utf8')), mode: statusDirectory === 'data' ? 'live' : 'demo' };
const { dates } = JSON.parse(await readFile(resolve(dataDirectory, 'dates.json'), 'utf8'));
const rawDays = await Promise.all(dates.map(date => readFile(resolve(dataDirectory, 'daily', `${date}.json`), 'utf8').then(JSON.parse)));
const days = [];
for (const day of rawDays.sort((a, b) => a.date.localeCompare(b.date))) {
  days.push(withPlatformMovements(day, days.find(previous => previous.date === priorDate(day.date))));
}
snapshot = days.find(day => day.date === snapshot.date);
await Promise.all([
  writeFile(resolve(dist, 'data/latest.json'), `${JSON.stringify(snapshot, null, 2)}\n`),
  ...days.map(day => writeFile(resolve(dist, 'data/daily', `${day.date}.json`), `${JSON.stringify(day, null, 2)}\n`)),
]);
const asOfDate = real ? chinaDate(new Date()) : snapshot.date;
const weeks = buildWeeklyCharts({ days, asOfDate });
const months = buildMonthlyCharts({ days, asOfDate });
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
const monthlyDirectory = resolve(dist, 'data/monthly');
await mkdir(monthlyDirectory, { recursive: true });
const writeMonthly = (name, value) => writeFile(resolve(monthlyDirectory, `${name}.json`), `${JSON.stringify(value, null, 2)}\n`);
await Promise.all([
  writeMonthly('index', {
    schemaVersion: 1, mode: snapshot.mode, latest: months[0]?.month ?? null,
    months: months.map(month => ({ month: month.month, monthStart: month.monthStart, monthEnd: month.monthEnd, status: month.status, observedDays: month.coverage.observedDays })),
  }),
  ...months.map(month => writeMonthly(month.month, month)),
  ...(months.length ? [writeMonthly('latest', months[0])] : []),
]);
const movements = days.map(buildMovementChart);
const movementDirectory = resolve(dist, 'data/movement');
await mkdir(movementDirectory, { recursive: true });
await Promise.all([
  writeFile(resolve(movementDirectory, 'latest.json'), `${JSON.stringify(buildMovementChart(snapshot), null, 2)}\n`),
  ...movements.map(chart => writeFile(resolve(movementDirectory, `${chart.date}.json`), `${JSON.stringify(chart, null, 2)}\n`)),
]);
const generatedAt = new Date().toISOString();
const runDirectory = resolve(dataDirectory, 'runs');
const sinceDate = chinaDate(new Date(Date.parse(generatedAt) - 29 * 86_400_000));
const observations = [...rawDays];
if (existsSync(runDirectory)) {
  for (const date of (await readdir(runDirectory)).filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= sinceDate)) {
    const files = (await readdir(resolve(runDirectory, date))).filter(file => file.endsWith('.json'));
    observations.push(...await Promise.all(files.map(file => readFile(resolve(runDirectory, date, file), 'utf8').then(JSON.parse))));
  }
}
const cadence = buildCadenceReport({ snapshots: observations, generatedAt });
await writeFile(resolve(dist, 'data/cadence.json'), `${JSON.stringify(cadence, null, 2)}\n`);
const archives = [];
const archiveDirectory = resolve(dataDirectory, 'platform-history');
if (existsSync(archiveDirectory)) {
  for (const provider of await readdir(archiveDirectory)) {
    for (const file of (await readdir(resolve(archiveDirectory, provider))).filter(name => /^\d{4}-\d{2}-\d{2}\.json$/.test(name))) {
      archives.push(JSON.parse(await readFile(resolve(archiveDirectory, provider, file), 'utf8')));
    }
  }
}
await buildAPI({ dist, dataDirectory, snapshot, status, days, archives, cadence });
await cp(weeklyDirectory, resolve(dist, 'api/v1/weekly'), { recursive: true });
await cp(monthlyDirectory, resolve(dist, 'api/v1/monthly'), { recursive: true });
await cp(movementDirectory, resolve(dist, 'api/v1/movement'), { recursive: true });
await buildFeed({ dist, dataDirectory, snapshot, weeks, months, days });
const quote = value => { const text = String(value); return `"${(/^[=+\-@\t\r]/.test(text) ? `'${text}` : text).replaceAll('"', '""')}"`; };
const csv = ['rank,title,artists,score,platform_count,date,mode', ...snapshot.songs.map(song => [song.rank, song.title, song.artists.join(' / '), song.score, song.appearances, snapshot.date, snapshot.mode].map(quote).join(','))].join('\n');
await writeFile(resolve(dist, 'data/latest.csv'), `\uFEFF${csv}\n`);
console.log(`静态文件已写入 ${outputDirectory}/；${real ? '真实快照' : '明确标记的设计示例'}，日榜 ${snapshot.songs.length} 首，周榜 ${weeks.length} 期，月榜 ${months.length} 期；公开 API：/api/v1/index.json。`);
