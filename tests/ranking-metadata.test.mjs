import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSnapshot, validateChart } from '../scripts/ranking.mjs';

const aliases = { artists: {}, tracks: {} };
const makeSources = order => ['netease', 'qishui'].map(id => ({
  id, name: id, group: id, status: 'ok',
  entries: order.map((name, index) => ({
    rank: index + 1, sourceId: name, title: name, artists: ['Artist'],
    url: `https://example.com/song/${name}`, artwork: null,
    sourceMovement: { direction: 'up', delta: 10, previousRank: index + 11, period: 'previous-edition', raw: { rank_delta: '10', rank_type: 'up' } },
    mv: { status: 'linked', items: [{ id: 'video-id', hash: null, url: null }] },
  })),
}));

test('platform movement remains independent of the combined daily movement', () => {
  const previous = buildSnapshot({ date: '2026-10-22', generatedAt: '2026-10-22T08:00:00Z', sources: makeSources(['A', 'B']), aliases });
  const current = buildSnapshot({ date: '2026-10-23', generatedAt: '2026-10-23T08:00:00Z', sources: makeSources(['B', 'A']), aliases, previous });
  const song = current.songs.find(song => song.title === 'A');
  assert.deepEqual(song.combinedMovement, { direction: 'down', delta: -1, previousRank: 1, period: 'previous-day', comparisonDate: '2026-10-22' });
  assert.equal(song.platforms[0].sourceMovement.delta, 10);
  assert.equal(song.platforms[0].mv.items[0].id, 'video-id');
  assert.equal(current.sources[0].entries[1].sourceMovement.raw.rank_type, 'up');
});

test('new metadata neither changes the score nor fabricates a daily comparison', () => {
  const sources = makeSources(['A', 'B']);
  const input = { date: '2026-10-23', generatedAt: '2026-10-23T08:00:00Z', aliases };
  const withMetadata = buildSnapshot({ ...input, sources });
  const withoutMetadata = buildSnapshot({ ...input, sources: sources.map(source => ({ ...source, entries: source.entries.map(({ sourceMovement, mv, ...entry }) => entry) })) });
  assert.deepEqual(withMetadata.songs.map(song => [song.id, song.rank, song.score]), withoutMetadata.songs.map(song => [song.id, song.rank, song.score]));
  assert.equal(withMetadata.songs[0].combinedMovement.direction, 'unknown');
  assert.equal(withMetadata.songs[0].combinedMovement.comparisonDate, null);
  assert.equal(withoutMetadata.songs[0].platforms[0].sourceMovement, undefined);
});

test('imported video links must use HTTP(S); historical rows may omit new fields', () => {
  const provider = { id: 'qishui', collectionDepth: 1, maxAgeHours: 216 };
  const chart = { providerId: 'qishui', chartName: '热歌榜', sourceUrl: 'https://example.com/chart', fetchedAt: '2026-10-23T08:00:00Z', sourceUpdatedAt: null, sourcePeriod: 'weekly', entries: makeSources(['A'])[0].entries };
  assert.equal(validateChart(chart, provider, '2026-10-23').entries.length, 1);
  const bad = structuredClone(chart);
  bad.entries[0].mv.items[0].url = 'javascript:alert(1)';
  assert.throws(() => validateChart(bad, provider, '2026-10-23'), /HTTP\(S\)/);
  delete chart.entries[0].sourceMovement;
  delete chart.entries[0].mv;
  assert.equal(validateChart(chart, provider, '2026-10-23').entries.length, 1);
});
