import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSnapshot, buildMovementChart } from '../scripts/ranking.mjs';
import { buildMonthlyCharts } from '../scripts/weekly.mjs';
import { buildCadenceReport } from '../scripts/cadence.mjs';
import { entryID, revisionOf } from '../scripts/feeds.mjs';

const unknown = { direction: 'unknown', delta: null, previousRank: null, period: 'previous-edition', raw: {} };
function day(date, titles, overrides = {}) {
  return buildSnapshot({
    date, generatedAt: `${date}T13:00:00.000Z`, aliases: { tracks: {}, artists: {} },
    sources: ['apple', 'netease'].map(id => ({
      id, name: id, group: id, status: 'ok', ingestion: 'public', collectionDepth: 3,
      chartName: 'Hot songs', sourceUrl: `https://example.com/${id}/chart`,
      fetchedAt: `${date}T13:00:00.000Z`, sourceUpdatedAt: null, sourcePeriod: date,
      entries: titles.map((title, index) => ({
        sourceId: title, rank: index + 1, title, artists: ['Artist'],
        url: `https://example.com/${id}/${title}`, sourceMovement: { ...unknown },
      })),
    })),
    ...overrides,
  });
}

test('missing official movement compares yesterday by platform ID while official zero stays authoritative', () => {
  const previous = day('2026-10-23', ['A', 'B', 'C']);
  const input = day('2026-10-24', ['B', 'A', 'D']);
  input.sources[0].entries[0].sourceMovement = { direction: 'same', delta: 0, previousRank: 1, period: 'previous-edition', raw: { change: 0 } };
  const chart = day('2026-10-24', [], { sources: input.sources, previous });
  const entries = chart.sources[0].entries;
  assert.equal(entries[0].sourceMovement.origin, 'official');
  assert.equal(entries[0].sourceMovement.delta, 0);
  assert.equal(entries[1].sourceMovement.delta, -1);
  assert.equal(entries[1].sourceMovement.origin, 'snapshot-comparison');
  assert.equal(entries[1].sourceMovement.comparisonDate, '2026-10-23');
  assert.equal(entries[2].sourceMovement.direction, 'new');
  assert.equal(entries[2].sourceMovement.delta, null);
  assert.equal(entries[2].sourceMovement.comparisonDepth, 3);
  assert.equal(chart.songs.find(song => song.title === 'A').platforms[0].sourceMovement.delta, -1);
});

test('an older reused observation cannot become a yesterday comparison', () => {
  const previous = day('2026-10-23', ['A', 'B', 'C']);
  previous.sources[0].status = 'stale';
  previous.sources[0].fetchedAt = '2026-10-22T13:00:00.000Z';
  const chart = day('2026-10-24', ['B', 'A', 'C'], { previous });
  assert.equal(chart.sources[0].entries[0].sourceMovement.direction, 'unknown');
  assert.equal(chart.sources[1].entries[0].sourceMovement.delta, 1);
});

test('intraday revisions keep yesterday as their comparison baseline', () => {
  const previous = day('2026-10-23', ['A', 'B', 'C']);
  const morning = day('2026-10-24', ['B', 'A', 'C'], { previous });
  const afternoon = day('2026-10-24', ['C', 'B', 'A'], { previous });
  assert.equal(morning.songs.find(song => song.title === 'A').delta, -1);
  assert.equal(afternoon.songs.find(song => song.title === 'A').delta, -2);
  assert.equal(afternoon.sources[0].entries[2].sourceMovement.delta, -2);
});

test('movement chart sorts changes, keeps combined ranks, and never invents a delta for entrants', () => {
  const previous = day('2026-10-23', ['A', 'B', 'C']);
  const chart = day('2026-10-24', ['C', 'D', 'A'], { previous });
  const result = buildMovementChart(chart);
  assert.deepEqual(result.rising.map(song => [song.title, song.delta, song.rank, song.movementRank]), [['C', 2, 1, 1]]);
  assert.deepEqual(result.falling.map(song => [song.title, song.delta, song.rank]), [['A', -2, 3]]);
  assert.equal(result.newEntries[0].title, 'D');
  assert.equal(result.newEntries[0].delta, null);
  assert.deepEqual(buildMovementChart(previous).rising, []);
});

test('calendar months respect leap years and use the last snapshot per date with missing days excluded', () => {
  const early = day('2028-02-01', ['A', 'B', 'C'], { generatedAt: '2028-02-01T01:00:00.000Z' });
  early.sources.forEach(source => { source.fetchedAt = early.generatedAt; });
  const late = day('2028-02-01', ['B', 'C', 'D']);
  const next = day('2028-02-02', ['B', 'C', 'D']);
  const month = buildMonthlyCharts({ days: [early, late, next], asOfDate: '2028-03-01' }).find(chart => chart.month === '2028-02');
  assert.equal(month.monthEnd, '2028-02-29');
  assert.equal(month.coverage.expectedDays, 29);
  assert.equal(month.coverage.observedDays, 2);
  assert.equal(month.coverage.missingDates.length, 27);
  assert.equal(month.status, 'incomplete');
  assert.equal(month.songs.find(song => song.title === 'B').score, 100);
  assert.equal(month.songs.some(song => song.title === 'A'), false);
});

test('monthly comparison requires adjacent complete calendar months and identical signatures', () => {
  const days = [];
  for (let index = 0; index < 59; index++) {
    const date = new Date(Date.parse('2027-01-01T00:00:00Z') + index * 86_400_000).toISOString().slice(0, 10);
    days.push(day(date, date.startsWith('2027-01') ? ['A', 'B', 'C'] : ['B', 'A', 'C']));
  }
  const closed = buildMonthlyCharts({ days, asOfDate: '2027-03-01' }).find(chart => chart.month === '2027-02');
  assert.equal(closed.coverage.comparisonAvailable, true);
  assert.equal(closed.songs[0].monthlyMovement.delta, 1);
  assert.equal(closed.songs[0].monthlyMovement.period, 'previous-month');
  assert.equal(closed.songs[0].monthlyMovement.comparisonDate, '2027-01-01');
  const preview = buildMonthlyCharts({ days, asOfDate: '2027-02-28' })[0];
  assert.equal(preview.status, 'provisional');
  assert.equal(preview.coverage.comparisonAvailable, false);
  days[31].comparisonSignature = 'different';
  const excluded = buildMonthlyCharts({ days, asOfDate: '2027-03-01' }).find(chart => chart.month === '2027-02');
  assert.equal(excluded.status, 'incomplete');
  assert.equal(excluded.coverage.excludedDates.length, 1);
  assert.equal(excluded.coverage.comparisonAvailable, false);
});

test('cadence ignores refreshed timestamps, counts actual order changes and deduplicates observations', () => {
  const first = day('2026-10-24', ['A', 'B', 'C']);
  const timestampOnly = structuredClone(first);
  timestampOnly.generatedAt = '2026-10-24T13:10:00.000Z';
  timestampOnly.sources.forEach(source => { source.fetchedAt = timestampOnly.generatedAt; source.sourceUpdatedAt = timestampOnly.generatedAt; });
  const changed = day('2026-10-24', ['B', 'A', 'C'], { generatedAt: '2026-10-24T13:20:00.000Z' });
  changed.sources.forEach(source => { source.fetchedAt = changed.generatedAt; });
  const changedAgain = day('2026-10-24', ['C', 'B', 'A'], { generatedAt: '2026-10-24T13:30:00.000Z' });
  changedAgain.sources.forEach(source => { source.fetchedAt = changedAgain.generatedAt; });
  const report = buildCadenceReport({ snapshots: [first, first, timestampOnly, changed, changedAgain], generatedAt: '2026-10-24T14:00:00.000Z' });
  const apple = report.sources.find(source => source.id === 'apple');
  assert.equal(apple.observations, 4);
  assert.equal(apple.changes.length, 2);
  assert.equal(apple.changes[0].after, timestampOnly.generatedAt);
  assert.equal(apple.maxDailyChanges, 2);
  assert.equal(apple.editionChanges.length, 0);
});

test('monthly subscription IDs stay stable and observation-only movement timestamps do not revise content', () => {
  assert.equal(entryID('https://example.com', { month: '2026-10', mode: 'live' }), 'https://example.com/api/v1/monthly/2026-10.json#live');
  assert.equal(revisionOf({ currentObservedAt: '2026-10-24T01:00:00Z', delta: 1 }), revisionOf({ currentObservedAt: '2026-10-24T02:00:00Z', delta: 1 }));
});
