import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { entryHistoryFor, identify, recordChartEntries } from './ranking.mjs';

export function createEntryHistory(aliases) {
  return { schemaVersion: 1, aliasesSignature: createHash('sha256').update(JSON.stringify(aliases)).digest('hex'), charts: {} };
}

// Only initialization and alias changes read older snapshots. Normal collection reads this small file.
export async function loadEntryHistory(dataDirectory, aliases, days) {
  const index = createEntryHistory(aliases);
  const path = resolve(dataDirectory, 'entry-history.json');
  if (existsSync(path)) {
    const stored = JSON.parse(await readFile(path, 'utf8'));
    if (stored.aliasesSignature === index.aliasesSignature) return stored;
    // Preserve proven entries, including an intraday appearance absent from the day's final Top 100.
    index.charts = stored.charts;
  }
  if (!days) {
    const directory = resolve(dataDirectory, 'daily');
    const files = (await readdir(directory)).filter(name => /^\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort();
    days = await Promise.all(files.map(name => readFile(resolve(directory, name), 'utf8').then(JSON.parse)));
  }
  days = [...days];
  const runs = resolve(dataDirectory, 'runs');
  if (existsSync(runs)) {
    for (const date of (await readdir(runs)).filter(name => /^\d{4}-\d{2}-\d{2}$/.test(name)).sort()) {
      const files = (await readdir(resolve(runs, date))).filter(name => name.endsWith('.json'));
      const observations = await Promise.all(files.map(name => readFile(resolve(runs, date, name), 'utf8').then(JSON.parse)));
      days.push(...observations.filter(day => day.coverage.status !== 'insufficient'));
    }
  }
  for (const day of [...days].sort((a, b) => a.date.localeCompare(b.date))) {
    const history = entryHistoryFor(index, day.mode, 'daily');
    recordChartEntries(history, day.date, day.songs);
    // Translate only proven entries to current identities; an unranked source candidate is not an entry.
    for (const source of day.sources) {
      for (const entry of source.entries) {
        const identity = identify(entry, source.id, aliases);
        for (const period of ['daily', 'weekly', 'monthly']) {
          const chart = entryHistoryFor(index, day.mode, period);
          const first = chart.firstSeen[entry.songId];
          if (first) recordChartEntries(chart, first, [identity]);
        }
      }
    }
  }
  return index;
}

export const saveEntryHistory = (dataDirectory, index) => writeFile(resolve(dataDirectory, 'entry-history.json'), `${JSON.stringify(index, null, 2)}\n`);
