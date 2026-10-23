import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { buildSnapshot } from '../scripts/ranking.mjs';

test('a collected platform date opens song details from that same daily snapshot', async () => {
  const snapshot = (date, titles) => buildSnapshot({
    date, generatedAt: `${date}T03:00:00Z`, aliases: { artists: {}, tracks: {} },
    sources: ['qq', 'netease'].map(id => ({
      id, name: id, group: id === 'qq' ? 'tme' : id, status: 'ok',
      fetchedAt: `${date}T03:00:00Z`,
      entries: titles.map((title, index) => ({ sourceId: title, title, artists: ['Artist'], rank: index + 1, url: `https://example.com/${title}` })),
    })),
  });
  const latest = snapshot('2026-10-23', ['A', 'B']);
  const previous = snapshot('2026-10-22', ['B', 'A']);
  const responses = new Map([
    ['./api/v1/platforms/qq/index.json', { dates: [latest.date, previous.date] }],
    [`./api/v1/platforms/qq/${previous.date}.json`, { ...previous.sources[0], date: previous.date, mode: previous.mode }],
    [`./data/daily/${previous.date}.json`, previous],
  ]);
  const nodes = new Map();
  const context = vm.createContext({
    URL, Intl, console,
    window: { location: { href: 'https://example.com/' } },
    document: { querySelector: selector => {
      if (!nodes.has(selector)) nodes.set(selector, { innerHTML: '', showModal() {} });
      return nodes.get(selector);
    } },
    fetch: async path => ({ ok: responses.has(path), json: async () => responses.get(path) }),
  });
  const app = await readFile(new URL('../site/app.js', import.meta.url), 'utf8');
  vm.runInContext(app.slice(0, app.indexOf("window.addEventListener('hashchange'")) + '\nrenderAll = () => {}; globalThis.ui = { state, loadPlatform, showSong };', context);
  Object.assign(context.ui.state, { latest, snapshot: latest, dates: [latest.date, previous.date], platform: 'qq', mode: 'platform' });
  await context.ui.loadPlatform(previous.date);
  assert.equal(context.ui.state.snapshot.date, previous.date);
  const song = previous.songs.find(song => song.title === 'A');
  context.ui.showSong(song.id, 'A');
  assert.match(nodes.get('#song-detail').innerHTML, /<b>#2<\/b><span>本期综合名次/);
  assert.match(nodes.get('#song-detail').innerHTML, /<strong>#2<\/strong>/);
});
