import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createEntryHistory, loadEntryHistory, saveEntryHistory } from '../scripts/entry-history.mjs';
import { entryHistoryFor, withCombinedMovements, buildMovementChart, identify } from '../scripts/ranking.mjs';
import { buildWeeklyCharts, buildMonthlyCharts } from '../scripts/weekly.mjs';

const aliases = { artists: {}, tracks: {} };
const snapshot = (date, ids) => ({
  mode: 'live', date, generatedAt: `${date}T08:00:00Z`, sources: [], coverage: {},
  songs: ids.map((id, i) => ({ id, title: id, rank: i + 1 })),
});

test('an entry outside the recent trend window returns without becoming a first entry', () => {
  const history = entryHistoryFor(createEntryHistory(aliases), 'live', 'daily');
  withCombinedMovements(snapshot('2026-01-01', ['A']), undefined, history);
  const previous = snapshot('2026-08-01', ['B']);
  const current = withCombinedMovements(snapshot('2026-08-02', ['A', 'C']), previous, history);
  assert.equal(current.songs[0].combinedMovement.direction, 'reentry');
  assert.equal(current.songs[0].combinedMovement.firstEntryDate, '2026-01-01');
  assert.equal(current.songs[1].combinedMovement.direction, 'new');
  assert.equal(current.songs[1].combinedMovement.firstEntryDate, '2026-08-02');
  const movement = buildMovementChart(current);
  assert.deepEqual(movement.reentries.map(song => song.id), ['A']);
  assert.deepEqual(movement.newEntries.map(song => song.id), ['C']);
  assert.equal(movement.reentries[0].previousRank, null);
  assert.equal(movement.reentries[0].delta, null);
});

test('repeated intraday publication preserves a first entry until the date changes', () => {
  const history = entryHistoryFor(createEntryHistory(aliases), 'live', 'daily');
  const previous = snapshot('2026-10-29', ['B']);
  const morning = withCombinedMovements(snapshot('2026-10-30', ['A']), previous, history);
  withCombinedMovements(snapshot('2026-10-30', ['B']), previous, history);
  const evening = withCombinedMovements(snapshot('2026-10-30', ['A']), previous, history);
  assert.equal(morning.songs[0].combinedMovement.direction, 'new');
  assert.equal(evening.songs[0].combinedMovement.direction, 'new');
  assert.equal(evening.songs[0].combinedMovement.firstEntryDate, '2026-10-30');
});

test('a missing comparison day stays unknown even when the song has older history', () => {
  const index = createEntryHistory(aliases);
  const history = entryHistoryFor(index, 'live', 'daily');
  withCombinedMovements(snapshot('2026-01-01', ['A']), undefined, history);
  const current = withCombinedMovements(snapshot('2026-10-30', ['A']), snapshot('2026-10-28', ['B']), history);
  assert.equal(current.songs[0].combinedMovement.direction, 'unknown');
  assert.deepEqual(buildMovementChart(current).reentries, []);
  assert.deepEqual(entryHistoryFor(index, 'demo', 'daily').firstSeen, {});
});

const plus = (date, count) => new Date(Date.parse(`${date}T00:00:00Z`) + count * 86_400_000).toISOString().slice(0, 10);
function day(date, ids) {
  const entries = ids.map((id, i) => ({ songId: id, sourceId: id, title: id, artists: ['Artist'], rank: i + 1 }));
  return {
    date, generatedAt: `${date}T08:00:00Z`, mode: 'live', comparisonSignature: 'test',
    methodology: { version: '1.1', rankDepth: 50, groupWeights: { a: 0.6, b: 0.4 }, minimumGroups: 2 },
    coverage: { available: 2, expected: 2, groups: 2, groupTotal: 2, status: 'complete' },
    sources: ['a', 'b'].map(id => ({ id, group: id, status: 'ok', entries })), songs: [],
  };
}

test('weekly history excludes previews and distinguishes first entries from returns', () => {
  const entryHistory = createEntryHistory(aliases);
  const days = Array.from({ length: 21 }, (_, i) => day(plus('2026-10-05', i), i < 7 ? ['A'] : i < 14 ? ['B'] : ['A', 'N']));
  buildWeeklyCharts({ days, asOfDate: '2026-10-11', entryHistory });
  assert.deepEqual(entryHistoryFor(entryHistory, 'live', 'weekly').firstSeen, {});
  const chart = buildWeeklyCharts({ days, asOfDate: '2026-10-26', entryHistory }).find(chart => chart.weekStart === '2026-10-19');
  assert.equal(chart.songs.find(song => song.id === 'A').weeklyMovement.direction, 'reentry');
  assert.equal(chart.songs.find(song => song.id === 'A').weeklyMovement.firstEntryDate, '2026-10-05');
  assert.equal(chart.songs.find(song => song.id === 'N').weeklyMovement.direction, 'new');
  assert.deepEqual(entryHistoryFor(entryHistory, 'live', 'daily').firstSeen, {});
});

test('monthly history is independent of daily and weekly history', () => {
  const entryHistory = createEntryHistory(aliases);
  const days = [];
  for (let date = '2027-02-01'; date < '2027-05-01'; date = plus(date, 1)) {
    days.push(day(date, date.startsWith('2027-02') ? ['A'] : date.startsWith('2027-03') ? ['B'] : ['A', 'N']));
  }
  const chart = buildMonthlyCharts({ days, asOfDate: '2027-05-01', entryHistory }).find(chart => chart.month === '2027-04');
  assert.equal(chart.songs.find(song => song.id === 'A').monthlyMovement.direction, 'reentry');
  assert.equal(chart.songs.find(song => song.id === 'A').monthlyMovement.firstEntryDate, '2027-02-01');
  assert.equal(chart.songs.find(song => song.id === 'N').monthlyMovement.direction, 'new');
  assert.deepEqual(entryHistoryFor(entryHistory, 'live', 'weekly').firstSeen, {});
});

test('bootstrap recognizes corrected aliases and normal loads do not reopen daily archives', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'resonance-entry-history-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(join(directory, 'daily'));
  const entry = { sourceId: '1', title: 'Song', artists: ['Artist (reading)'] };
  const oldID = identify(entry, 'qq', aliases).id;
  const source = { ...snapshot('2026-01-01', [oldID]), sources: [{ id: 'qq', entries: [{ ...entry, songId: oldID }] }] };
  const path = join(directory, 'daily', '2026-01-01.json');
  await writeFile(path, JSON.stringify(source));
  const runDirectory = join(directory, 'runs', '2025-12-15');
  await mkdir(runDirectory, { recursive: true });
  await writeFile(join(runDirectory, 'published.json'), JSON.stringify({ ...source, date: '2025-12-15', coverage: { status: 'partial' } }));
  const corrected = { artists: { 'Artist (reading)': 'Artist' }, tracks: {} };
  const id = identify(entry, 'qq', corrected).id;
  const index = await loadEntryHistory(directory, corrected);
  assert.equal(entryHistoryFor(index, 'live', 'daily').firstSeen[id], '2025-12-15');
  await saveEntryHistory(directory, index);
  await rm(path);
  await rm(runDirectory, { recursive: true });
  const cached = await loadEntryHistory(directory, corrected);
  assert.equal(entryHistoryFor(cached, 'live', 'daily').firstSeen[id], '2025-12-15');
  await writeFile(path, JSON.stringify(source));
  const changed = { artists: { 'Artist (reading)': 'Canonical Artist' }, tracks: {} };
  const rebuilt = await loadEntryHistory(directory, changed);
  assert.equal(entryHistoryFor(rebuilt, 'live', 'daily').firstSeen[identify(entry, 'qq', changed).id], '2025-12-15');
});
