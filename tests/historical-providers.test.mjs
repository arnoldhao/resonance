import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHistoricalQQ, parseHistoricalKugou, parseKugouResponse } from '../scripts/historical-providers.mjs';
import { validateChart } from '../scripts/ranking.mjs';

test('QQ history follows ranked IDs rather than the metadata array order, and rejects wrong periods', () => {
  const track = id => ({ id, mid: `mid-${id}`, name: `track-${id}`, singer: [{ name: 'Artist' }], album: { name: 'Album' }, mv: { vid: id === 1 ? 'mv-id' : '' } });
  const data = { code: 0, detail: { code: 0, data: { data: { topId: 26, period: '2026-10-15', song: [{ rank: 1, songId: 1, rankType: 1, rankValue: '2' }, { rank: 2, songId: 2, rankType: 4, rankValue: '0' }] }, songInfoList: [track(2), track(1)] } } };
  const chart = parseHistoricalQQ(data, '2026-10-15');
  assert.equal(chart.entries[0].title, 'track-1');
  assert.equal(chart.entries[0].sourceMovement.previousRank, 3);
  assert.equal(chart.entries[1].sourceMovement.direction, 'new');
  assert.equal(chart.entries[0].mv.items[0].id, 'mv-id');
  assert.throws(() => parseHistoricalQQ(data, '2026-10-14'), /榜期/);
  const provider = { id: 'qq', collectionDepth: 2, maxAgeHours: 48 };
  const input = { ...chart, providerId: 'qq', chartName: '热歌榜', sourceUrl: 'https://example.com/chart', fetchedAt: '2026-10-23T03:00:00Z' };
  assert.throws(() => validateChart(input, provider, '2026-10-23'), /新鲜度/);
  assert.equal(validateChart(input, provider, '2026-10-23', { editionDate: '2026-10-15' }).fetchedAt, input.fetchedAt);
});

test('Kugou history unwraps the official response and checks every row edition', () => {
  const data = { status: 1, data: { info: [{ hash: 'song-hash', songname: 'Song', authors: [{ author_name: 'Artist' }], rank_id_publish_date: '2026-10-15 08:30:01', sort: 1, last_sort: 2, mvhash: '', mvdata: [{ id: 'video-id', hash: 'video-hash' }] }] } };
  const parsed = parseKugouResponse(`<!--KG_TAG_RES_START-->${JSON.stringify(data)}<!--KG_TAG_RES_END-->`);
  const chart = parseHistoricalKugou(parsed, '2026-10-15');
  assert.equal(chart.entries[0].sourceMovement.delta, 1);
  assert.equal(chart.entries[0].mv.status, 'linked');
  assert.throws(() => parseHistoricalKugou(parsed, '2026-10-14'), /榜期/);
});

test('historical source rank gaps are preserved without relaxing live completeness', () => {
  const tracks = [1, 3].map(rank => ({ hash: `song-${rank}`, songname: `Song ${rank}`, authors: [{ author_name: 'Artist' }], rank_id_publish_date: '2026-10-15 08:30:00', sort: rank, last_sort: rank + 1 }));
  const parsed = parseHistoricalKugou({ status: 1, data: { info: tracks } }, '2026-10-15');
  assert.deepEqual(parsed.entries.map(entry => entry.rank), [1, 3]);
  assert.equal(parsed.entries[1].sourceMovement.delta, 1);
  const provider = { id: 'kugou', collectionDepth: 3, maxAgeHours: 48 };
  const chart = { ...parsed, providerId: 'kugou', chartName: 'TOP500', sourceUrl: 'https://example.com/chart', fetchedAt: '2026-10-23T03:00:00Z' };
  assert.equal(validateChart(chart, provider, '2026-10-23', { editionDate: '2026-10-15' }).entries.length, 2);
  assert.throws(() => validateChart(chart, provider, '2026-10-23'), /不足/);
  assert.throws(() => validateChart({ ...chart, entries: [...chart.entries].reverse() }, provider, '2026-10-23', { editionDate: '2026-10-15' }), /名次无效/);
});
