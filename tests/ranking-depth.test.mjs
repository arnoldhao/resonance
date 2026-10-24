import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSnapshot, withCombinedMovements, validateChart, rankValue, scoringRank, methodology } from '../scripts/ranking.mjs';
import { buildWeeklyCharts, buildMonthlyCharts } from '../scripts/weekly.mjs';
import { buildCadenceReport } from '../scripts/cadence.mjs';

const aliases = { artists: {}, tracks: {} };
const date = '2026-10-24';
const generatedAt = `${date}T05:00:00.000Z`;
const legacyRule = {
  version: '1.3', rankDepth: 50, minimumGroups: 2,
  groupWeights: methodology.groupWeights, platformWeights: methodology.platformWeights,
};
function source(id, count, targetRank) {
  return {
    id, group: id === 'netease' ? 'netease' : 'tme', name: id, status: 'ok', ingestion: 'public',
    chartName: 'Hot songs', sourceUrl: `https://example.com/${id}`, collectionDepth: count,
    fetchedAt: generatedAt, sourceUpdatedAt: null, sourcePeriod: date,
    entries: Array.from({ length: count }, (_, index) => ({
      rank: index + 1, sourceId: `${id}-${index + 1}`,
      title: index + 1 === targetRank ? 'Shared recording' : `${id} song ${index + 1}`,
      artists: ['Artist'], url: `https://example.com/${id}/${index + 1}`,
    })),
  };
}
const sources = () => [source('qq', 200, 101), source('kugou', 200, 17), source('netease', 200)];
function snapshot(overrides = {}) {
  const snapshotDate = overrides.date ?? date;
  const capturedAt = overrides.generatedAt ?? `${snapshotDate}T05:00:00.000Z`;
  const records = sources().map(source => ({ ...source, fetchedAt: capturedAt, sourcePeriod: snapshotDate }));
  return buildSnapshot({ date: snapshotDate, generatedAt: capturedAt, sources: records, aliases, ...overrides });
}

test('QQ #101 and Kugou #17 both contribute while the published composite stays Top 100', () => {
  const chart = snapshot();
  const song = chart.songs.find(song => song.title === 'Shared recording');
  assert.equal(chart.songs.length, 100);
  assert.equal(chart.sources[0].entries.length, 200);
  assert.equal(chart.sources[1].scoringCount, 200);
  assert.equal(song.platforms.find(platform => platform.id === 'qq').rank, 101);
  assert.equal(song.platforms.find(platform => platform.id === 'qq').eligible, true);
  assert.ok(song.platforms.find(platform => platform.id === 'qq').contribution > 0);
  assert.equal(song.platforms.find(platform => platform.id === 'kugou').rank, 17);
  const legacy = snapshot({ rule: legacyRule }).songs.find(candidate => candidate.title === 'Shared recording');
  assert.equal(legacy.platforms.find(platform => platform.id === 'qq').contribution, 0);
  assert.ok(song.score > legacy.score);
});

test('the tail joins at #50, decreases with absolute rank, and has no ten-percent floor', () => {
  assert.equal(rankValue(1), 1);
  assert.equal(rankValue(50), rankValue(50, legacyRule));
  assert.ok(rankValue(51) < rankValue(50));
  assert.ok(rankValue(101) < rankValue(100));
  assert.ok(rankValue(200) < rankValue(101));
  assert.ok(rankValue(200) > 0 && rankValue(200) < 0.02);
  assert.equal(rankValue(101, legacyRule), 0.9 * Math.exp(-100 / 25) + 0.1);
});

test('scoring stops at 200 for the four peers, 100 for Apple and 50 for Qishui', () => {
  for (const id of ['qq', 'netease', 'kugou', 'kuwo']) {
    assert.equal(scoringRank(200, methodology, id), true);
    assert.equal(scoringRank(201, methodology, id), false);
  }
  assert.equal(scoringRank(100, methodology, 'apple'), true);
  assert.equal(scoringRank(101, methodology, 'apple'), false);
  assert.equal(scoringRank(50, methodology, 'qishui'), true);
  assert.equal(scoringRank(51, methodology, 'qishui'), false);
});

test('a complete requested window is retained independently of the full chart total', () => {
  const provider = { id: 'qq', collectionDepth: 3, maxAgeHours: 48 };
  const chart = { ...source('qq', 5), providerId: 'qq', declaredCount: 5 };
  assert.equal(validateChart(chart, provider, date).entries.length, 3);
  assert.equal(validateChart(chart, provider, date).declaredCount, 5);
  assert.throws(() => validateChart({ ...chart, entries: chart.entries.slice(0, 2) }, provider, date), /榜单不足 3 首/);
  assert.throws(() => validateChart({ ...chart, declaredCount: 2 }, provider, date), /源站声明 2 首/);
});

test('weekly and monthly rebuilding use the saved platform windows and tail curve', () => {
  const chart = snapshot();
  for (const build of [buildWeeklyCharts, buildMonthlyCharts]) {
    const period = build({ days: [chart], asOfDate: date })[0];
    const song = period.songs.find(song => song.title === 'Shared recording');
    assert.equal(song.score, chart.songs.find(candidate => candidate.id === song.id).score);
    assert.equal(song.platforms.find(platform => platform.id === 'qq').eligible, true);
    assert.equal(period.methodology.baseVersion, '1.4');
    assert.equal(period.methodology.rankPolicy, 'platform-top-n');
    assert.equal(period.methodology.platformRankDepths.qq, 200);
  }
});

test('October 23 remains the daily baseline and participates in periods after collection expands', () => {
  const previousDate = '2026-10-23';
  const previous = snapshot({
    date: previousDate, rule: legacyRule,
    sources: sources().map(source => ({ ...source, collectionDepth: 100, fetchedAt: `${previousDate}T05:00:00.000Z`, sourcePeriod: previousDate, entries: source.entries.slice(0, 100) })),
  });
  const savedPrevious = JSON.stringify(previous);
  const current = snapshot({ previous, history: [previous] });
  const song = current.songs.find(song => song.title === 'Shared recording');
  const previousSong = previous.songs.find(candidate => candidate.id === song.id);
  assert.equal(current.coverage.comparisonAvailable, true);
  assert.equal(song.previousRank, previousSong.rank);
  assert.equal(song.delta, previousSong.rank - song.rank);
  assert.deepEqual(song.history.map(point => [point.date, point.methodologyVersion]), [[previousDate, '1.3'], [date, '1.4']]);
  assert.equal(song.history[0].score, previousSong.score);
  for (const build of [buildWeeklyCharts, buildMonthlyCharts]) {
    const period = build({ days: [previous, current], asOfDate: date })[0];
    const aggregate = period.songs.find(candidate => candidate.id === song.id);
    assert.deepEqual(period.coverage.includedDates, [previousDate, date]);
    assert.equal(period.coverage.observedDays, 2);
    assert.deepEqual(period.coverage.excludedDates, []);
    assert.deepEqual(period.methodology.baseVersions, ['1.3', '1.4']);
    assert.equal(period.coverage.mixedMethods, true);
    assert.equal(period.comparisonSignature, null);
    assert.equal(period.coverage.comparisonAvailable, false);
    assert.deepEqual(aggregate.dailyScores, [{ date: previousDate, score: previousSong.score }, { date, score: song.score }]);
    assert.ok(Math.abs(aggregate.score - (previousSong.score + song.score) / 2) < 0.0002);
  }
  const archived = { ...current, coverage: { ...current.coverage, comparisonAvailable: false }, songs: current.songs.map(song => ({ ...song, delta: null, previousRank: null, combinedMovement: { direction: 'unknown' } })) };
  const restored = withCombinedMovements(archived, previous);
  assert.equal(restored.coverage.comparisonAvailable, true);
  assert.equal(restored.songs.find(candidate => candidate.id === song.id).delta, song.delta);
  assert.deepEqual(restored.songs.map(song => [song.id, song.rank, song.score]), current.songs.map(song => [song.id, song.rank, song.score]));
  assert.equal(JSON.stringify(previous), savedPrevious);
});

test('daily movement compares published ranks across collection changes but keeps the adjacent date and mode', () => {
  const previousDate = '2026-10-23';
  const previous = snapshot({ date: previousDate, rule: legacyRule });
  assert.equal(snapshot({ previous }).coverage.comparisonAvailable, true);
  const sameRule = snapshot({ date: previousDate });
  const changedRule = { ...methodology, platformRankDepths: { ...methodology.platformRankDepths, qq: 100 } };
  assert.equal(snapshot({ rule: changedRule, previous: sameRule }).coverage.comparisonAvailable, true);
  assert.equal(snapshot({ previous: { ...previous, mode: 'demo' } }).coverage.comparisonAvailable, false);
  assert.equal(snapshot({ previous: { ...previous, date: '2026-10-22' } }).coverage.comparisonAvailable, false);
});

test('cadence does not count an expanded observation window as a platform ranking update', () => {
  const first = snapshot({ rule: legacyRule });
  first.sources[0].entries = first.sources[0].entries.slice(0, 100);
  first.sources[0].collectionDepth = 100;
  const expanded = snapshot({ generatedAt: `${date}T06:00:00.000Z` });
  expanded.sources.forEach(source => { source.fetchedAt = expanded.generatedAt; });
  const report = buildCadenceReport({ snapshots: [first, expanded], generatedAt: `${date}T07:00:00.000Z` });
  assert.equal(report.sources.find(source => source.id === 'qq').changes.length, 0);
});
