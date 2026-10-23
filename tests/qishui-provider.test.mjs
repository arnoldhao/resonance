import test from 'node:test';
import assert from 'node:assert/strict';
import { providers, collectProvider } from '../scripts/providers.mjs';

const provider = providers.find(source => source.id === 'qishui');
const now = new Date('2026-10-23T08:00:00.000Z');
const responseFor = count => ({
  chart: {
    id: '7036274230471712007', period: 'weekly', count_tracks: count, release_time: 1792656000,
    track_ranks: Array.from({ length: count }, (_, index) => ({
      track: {
        id: `track-${index + 1}`, name: `Song ${index + 1}`, artists: [{ name: 'Artist' }],
        album: { name: 'Album', url_cover: { urls: ['https://example.com/'], uri: 'cover', template_prefix: 'image' } },
      },
      rank: {},
    })),
  },
});

test('Qishui explicitly requests Web mode and records that URL as its source', async t => {
  t.mock.method(globalThis, 'fetch', async url => {
    const request = new URL(url);
    assert.equal(request.href, provider.sourceUrl);
    assert.equal(request.hostname, 'api.qishui.com');
    assert.equal(request.pathname, '/luna/pc/charts/7036274230471712007');
    assert.equal(request.searchParams.get('device_platform'), 'web');
    assert.equal(request.searchParams.get('region'), 'cn');
    return Response.json(responseFor(50));
  });
  const chart = await collectProvider(provider, { now });
  assert.equal(chart.sourcePeriod, 'weekly');
  assert.equal(chart.entries.length, 50);
  assert.deepEqual(chart.entries.map(entry => entry.sourceId), Array.from({ length: 50 }, (_, index) => `track-${index + 1}`));
});

test('Qishui still rejects a region-filtered 30-track response', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json(responseFor(30)));
  await assert.rejects(collectProvider(provider, { now }), /complete Top 50 \(declared=30, received=30,/);
});
