import test from 'node:test';
import assert from 'node:assert/strict';
import { providers, collectProvider, kugouEntries } from '../scripts/providers.mjs';
import { validateChart, sourceFreshnessIssue } from '../scripts/ranking.mjs';

const date = '2026-11-03';
const now = new Date(`${date}T04:00:00.000Z`);
const kugou = providers.find(source => source.id === 'kugou');
const kugouResponse = () => ({
  status: 1,
  data: {
    total: 500,
    info: Array.from({ length: 200 }, (_, index) => {
      const rank = index + 1 + (index >= 87 ? 1 : 0);
      return {
        hash: `song-${rank}`, songname: `Song ${rank}`, authors: [{ author_name: 'Artist' }],
        rank_id_publish_date: `${date} 08:30:00`, sort: rank, last_sort: rank + 2,
      };
    }),
  },
});

test('Kugou live ranks follow the official visible order when legacy sort skips 88', async t => {
  const data = kugouResponse();
  t.mock.method(globalThis, 'fetch', async () => Response.json(data));
  const chart = validateChart(await collectProvider(kugou, { now }), kugou, date);
  assert.equal(chart.entries.length, 200);
  assert.equal(chart.entries[87].sourceId, 'song-89');
  assert.equal(chart.entries[87].rank, 88);
  assert.equal(chart.entries[199].rank, 200);
  assert.equal(chart.entries[86].sourceMovement.delta, 2);
  assert.equal(chart.entries[87].sourceMovement.direction, 'unknown');
  assert.equal(chart.entries[87].sourceMovement.previousRank, null);
  assert.deepEqual(chart.entries[87].sourceMovement.raw, { sort: 89, last_sort: 91 });
  assert.equal(kugouEntries(data.data.info)[87].rank, 89);
});

test('Kugou still rejects mixed editions, unordered raw ranks and truncated lists', async t => {
  const data = kugouResponse();
  t.mock.method(globalThis, 'fetch', async () => Response.json(data));
  data.data.info[87].rank_id_publish_date = '2026-11-02 08:30:00';
  await assert.rejects(collectProvider(kugou, { now }), /榜期不一致/);
  data.data.info[87].rank_id_publish_date = `${date} 08:30:00`;
  data.data.info[87].sort = data.data.info[86].sort;
  await assert.rejects(collectProvider(kugou, { now }), /原始名次无效或乱序/);
  data.data.info.splice(87);
  const chart = await collectProvider(kugou, { now });
  assert.throws(() => validateChart(chart, kugou, date), /榜单不足 200 首/);
});

test('an unchanged Kuwo edition remains eligible without rewriting its period', () => {
  const kuwo = providers.find(source => source.id === 'kuwo');
  const chart = {
    providerId: 'kuwo', chartName: kuwo.chartName, sourceUrl: kuwo.sourceUrl,
    fetchedAt: now.toISOString(), sourceUpdatedAt: null, sourcePeriod: '2026-10-31', declaredCount: 300,
    entries: Array.from({ length: 200 }, (_, index) => ({
      sourceId: `song-${index + 1}`, title: 'Song', artists: ['Artist'], rank: index + 1,
      url: `https://www.kuwo.cn/play_detail/${index + 1}`,
    })),
  };
  const accepted = validateChart(chart, kuwo, date);
  assert.equal(accepted.entries.length, 200);
  assert.equal(accepted.sourcePeriod, '2026-10-31');
  assert.equal(accepted.fetchedAt, now.toISOString());
  assert.equal(sourceFreshnessIssue(accepted, kuwo, '2026-11-05T04:00:01.000Z'), '上次成功观察已超过新鲜度窗口');
  const netease = providers.find(source => source.id === 'netease');
  assert.equal(sourceFreshnessIssue(chart, netease, now.toISOString()), '源榜单已超过新鲜度窗口');
});
