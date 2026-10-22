import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWeeklyCharts } from '../scripts/weekly.mjs';

const plus = (date, count) => new Date(Date.parse(`${date}T00:00:00Z`) + count * 86_400_000).toISOString().slice(0, 10);
const entry = (id, rank) => ({ songId: id, sourceId: `${id}-${rank}`, title: id, artists: ['演唱者'], artwork: null, rank });
const source = (id, group, entries) => ({ id, group, status: 'ok', weight: 0.0001, entries });
function day(date, entries, overrides = {}) {
  return {
    date, generatedAt: `${date}T13:17:00.000Z`, mode: 'live', comparisonSignature: '1.1|mapping|a,b',
    methodology: { version: '1.1', rankDepth: 50, groupWeights: { a: 0.6, b: 0.4 }, minimumGroups: 2 },
    coverage: { available: 2, expected: 6, groups: 2, groupTotal: 4, status: 'partial' },
    sources: [source('a', 'a', entries), source('b', 'b', entries)], songs: [],
    ...overrides,
  };
}
const fullWeek = (start, entries, overrides) => Array.from({ length: 7 }, (_, i) => day(plus(start, i), entries, overrides));
const select = (charts, start) => charts.find(chart => chart.weekStart === start);

// Calendar boundaries also ensure the host timezone is irrelevant.
test('Monday–Sunday weeks cross year boundaries; Sunday remains a preview', () => {
  const days = fullWeek('2026-12-28', [entry('A', 1)]);
  const preview = select(buildWeeklyCharts({ days, asOfDate: '2027-01-03' }), '2026-12-28');
  assert.equal(preview.weekEnd, '2027-01-03');
  assert.equal(preview.status, 'provisional');
  const closed = select(buildWeeklyCharts({ days, asOfDate: '2027-01-04' }), '2026-12-28');
  assert.equal(closed.status, 'complete');
  assert.equal(closed.coverage.sourceCoverage.status, 'partial');
  assert.equal(closed.coverage.observedDays, 7);
});

test('zero on a valid day counts in the mean; missing days do not', () => {
  const chart = buildWeeklyCharts({ days: [day('2026-10-19', [entry('A', 1)]), day('2026-10-20', [entry('B', 1), entry('A', 51)])], asOfDate: '2026-10-25' })[0];
  const a = chart.songs.find(song => song.id === 'A');
  assert.equal(a.score, 50);
  assert.equal(a.daysOnChart, 1);
  assert.deepEqual(a.dailyScores, [{ date: '2026-10-19', score: 100 }, { date: '2026-10-20', score: 0 }]);
  assert.equal(chart.coverage.missingDates.length, 5);
  assert.equal(chart.coverage.observedDays, 2);
});

test('reconstructs candidates missing from the published daily Top 100', () => {
  const days = Array.from({ length: 7 }, (_, d) => {
    const a = Array.from({ length: 100 }, (_, i) => entry(`burst-a-${d}-${i}`, i + 1));
    const b = Array.from({ length: 100 }, (_, i) => entry(i === 49 ? 'steady-outside-daily-top100' : `burst-b-${d}-${i}`, i + 1));
    // 60 songs from A and 40 from B each beat B's #50, so these 100 labels all exclude it.
    return day(plus('2026-10-19', d), [], {
      sources: [source('a', 'a', a), source('b', 'b', b)],
      methodology: { version: '1.0', rankDepth: 100, groupWeights: { a: 0.6, b: 0.4 }, minimumGroups: 2 },
      comparisonSignature: '1.0|mapping|a,b',
      songs: [...a.slice(0, 60), ...b.slice(0, 40)].map(e => ({ id: e.songId, title: e.title, artists: e.artists, score: 99 })),
    });
  });
  const chart = select(buildWeeklyCharts({ days, asOfDate: '2026-10-26' }), '2026-10-19');
  const steady = chart.songs.find(song => song.id === 'steady-outside-daily-top100');
  assert.ok(steady);
  assert.equal(steady.daysOnChart, 7);
  assert.equal(steady.score, 9.0709);
  assert.equal(chart.songs.length, 100);
});

test('the latest day selects the weekly signature and records exclusions', () => {
  const chart = buildWeeklyCharts({ days: [
    day('2026-10-22', [entry('old', 1)], { comparisonSignature: '1.0|old|a,b', methodology: { version: '1.0', rankDepth: 100, groupWeights: { a: 0.6, b: 0.4 }, minimumGroups: 2 } }),
    day('2026-10-23', [entry('new', 1)]),
  ], asOfDate: '2026-10-23' })[0];
  assert.equal(chart.methodology.baseVersion, '1.1');
  assert.equal(chart.comparisonSignature, '1.1|mapping|a,b');
  assert.deepEqual(chart.coverage.includedDates, ['2026-10-23']);
  assert.equal(chart.coverage.excludedDates[0].date, '2026-10-22');
  assert.match(chart.coverage.excludedDates[0].reason, /口径/);
  assert.ok(!chart.coverage.missingDates.includes('2026-10-22'));
  assert.equal(chart.songs[0].id, 'new');
  assert.equal(chart.songs[0].score, 100);
});

test('same-date last publication wins and exact group weights ignore rounded source weights', () => {
  const morning = day('2026-10-19', [entry('old', 1)], { generatedAt: '2026-10-19T01:17:00Z' });
  const evening = day('2026-10-19', [], {
    sources: [source('qq', 'a', [entry('A', 8), entry('A', 1)]), source('kugou', 'a', [entry('A', 1)]), source('netease', 'b', [entry('B', 1)])],
  });
  const chart = buildWeeklyCharts({ days: [evening, morning], asOfDate: '2026-10-19' })[0];
  assert.equal(chart.songs.find(song => song.id === 'A').score, 60);
  assert.equal(chart.songs.find(song => song.id === 'B').score, 40);
  assert.ok(!chart.songs.some(song => song.id === 'old'));
  assert.equal(chart.coverage.observedDays, 1);
});

test('only adjacent complete weeks with identical signatures compare', () => {
  const days = [...fullWeek('2026-10-05', [entry('A', 1), entry('B', 2)]), ...fullWeek('2026-10-12', [entry('B', 1), entry('A', 2)])];
  const chart = select(buildWeeklyCharts({ days, asOfDate: '2026-10-19' }), '2026-10-12');
  assert.equal(chart.coverage.comparisonAvailable, true);
  assert.deepEqual(chart.songs[0].weeklyMovement, { direction: 'up', delta: 1, previousRank: 2, period: 'previous-week', comparisonDate: '2026-10-05' });
  const preview = select(buildWeeklyCharts({ days, asOfDate: '2026-10-18' }), '2026-10-12');
  assert.equal(preview.coverage.comparisonAvailable, false);
  assert.equal(preview.songs[0].weeklyMovement.direction, 'unknown');
  const changed = days.map(d => d.date >= '2026-10-12' ? { ...d, comparisonSignature: '1.1|different|a,b' } : d);
  assert.equal(select(buildWeeklyCharts({ days: changed, asOfDate: '2026-10-19' }), '2026-10-12').coverage.comparisonAvailable, false);
  const gap = [...fullWeek('2026-10-05', [entry('A', 1)]), ...fullWeek('2026-10-19', [entry('A', 1)])];
  assert.equal(select(buildWeeklyCharts({ days: gap, asOfDate: '2026-10-26' }), '2026-10-19').coverage.comparisonAvailable, false);
});

test('empty current preview and excluded closed week remain explainable', () => {
  const empty = buildWeeklyCharts({ days: [], asOfDate: '2026-10-23' })[0];
  assert.equal(empty.status, 'provisional');
  assert.deepEqual(empty.songs, []);
  assert.equal(empty.coverage.latestIncludedDate, null);
  assert.equal(empty.coverage.sourceCoverage, null);
  const invalid = day('2026-10-19', [entry('A', 1)], { sources: [source('a', 'a', [entry('A', 1)])] });
  const closed = select(buildWeeklyCharts({ days: [invalid], asOfDate: '2026-10-26' }), '2026-10-19');
  assert.equal(closed.status, 'incomplete');
  assert.equal(closed.coverage.observedDays, 0);
  assert.equal(closed.coverage.excludedDates.length, 1);
  assert.deepEqual(closed.songs, []);
});
