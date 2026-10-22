import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { buildFeed, entryID, escapeXML, revisionOf } from '../scripts/feeds.mjs';
import { captureRevision, publishUpdate } from '../scripts/notify.mjs';

const snapshot = () => ({
  schemaVersion: 1, mode: 'live', date: '2026-10-23', generatedAt: '2026-10-23T01:17:00.000Z',
  coverage: { available: 2, expected: 2, groups: 2, groupTotal: 2, status: 'complete' },
  methodology: { version: '1.1', rankDepth: 50 },
  sources: [
    { id: 'apple', status: 'ok', fetchedAt: '2026-10-23T01:17:00.000Z', sourceUpdatedAt: '2026-10-23T01:17:00.000Z' },
    { id: 'qishui', status: 'ok', fetchedAt: '2026-10-23T01:17:00.000Z', sourceUpdatedAt: '2026-10-22T08:00:00.000Z', sourcePeriod: 'weekly' },
  ],
  songs: [{ rank: 1, id: 'song-a', title: 'A&B <Live>', artists: ['歌手 "甲"'], score: 83.5 }],
});

test('content revisions ignore observation time, but retain Qishui publication time', () => {
  const first = snapshot();
  const repeated = structuredClone(first);
  repeated.generatedAt = '2026-10-23T07:17:00.000Z';
  repeated.recomputedAt = '2026-10-23T07:18:00.000Z';
  repeated.sources.forEach(source => { source.fetchedAt = repeated.generatedAt; });
  repeated.sources[0].sourceUpdatedAt = repeated.generatedAt;
  assert.equal(revisionOf(first), revisionOf(repeated));
  repeated.sources[1].sourceUpdatedAt = '2026-10-29T08:00:00.000Z';
  assert.notEqual(revisionOf(first), revisionOf(repeated));
});

test('date entry IDs survive same-day edits, and XML text is escaped', () => {
  const first = snapshot();
  const changed = structuredClone(first);
  changed.songs[0].title = '新曲名';
  assert.equal(entryID('https://charts.example', first), entryID('https://charts.example', changed));
  assert.notEqual(revisionOf(first), revisionOf(changed));
  assert.equal(escapeXML('A&B <"甲\'>'), 'A&amp;B &lt;&quot;甲&apos;&gt;');
});

test('repeated observations produce identical feeds and preserve meaningful updated time', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'resonance-feed-test-'));
  try {
    const dataDirectory = resolve(directory, 'data');
    const dist = resolve(directory, 'dist');
    const runDirectory = resolve(dataDirectory, 'runs', '2026-10-23');
    await mkdir(runDirectory, { recursive: true });
    const first = snapshot();
    const repeated = structuredClone(first);
    repeated.generatedAt = '2026-10-23T07:17:00.000Z';
    repeated.sources.forEach(source => { source.fetchedAt = repeated.generatedAt; });
    repeated.sources[0].sourceUpdatedAt = repeated.generatedAt;
    await writeFile(resolve(dataDirectory, 'dates.json'), JSON.stringify({ dates: [first.date] }));
    await writeFile(resolve(runDirectory, '01.json'), JSON.stringify(first));
    await writeFile(resolve(runDirectory, '02.json'), JSON.stringify(repeated));
    const firstManifest = await buildFeed({ dist, dataDirectory, snapshot: first, siteUrl: 'https://charts.example', hubUrl: 'https://hub.example/' });
    const atom = await readFile(resolve(dist, 'feed.xml'), 'utf8');
    const secondManifest = await buildFeed({ dist, dataDirectory, snapshot: repeated, siteUrl: 'https://charts.example', hubUrl: 'https://hub.example/' });
    assert.equal(firstManifest.revision, secondManifest.revision);
    assert.equal(secondManifest.entries[0].updatedAt, first.generatedAt);
    assert.equal(atom, await readFile(resolve(dist, 'feed.xml'), 'utf8'));
    assert.match(atom, /A&amp;B &lt;Live&gt;/);
    assert.match(atom, /rel="hub" href="https:\/\/hub\.example\/"/);
    const json = JSON.parse(await readFile(resolve(dist, 'feed.json'), 'utf8'));
    assert.equal(json.items[0].id, secondManifest.entries[0].id);
    assert.equal(json.items[0].content_text.includes('A&B <Live>'), true);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('mock hub is called only when a live deployed revision changes', async () => {
  let calls = 0;
  const manifest = { schemaVersion: 1, mode: 'live', revision: 'new', siteUrl: 'https://charts.example', feedUrl: 'https://charts.example/feed.xml', hubUrl: 'https://hub.example/' };
  const fetchImpl = async (url, options) => {
    if (url === `${manifest.siteUrl}/api/v1/updates.json`) return Response.json(manifest);
    calls++;
    assert.equal(url, manifest.hubUrl);
    assert.equal(options.method, 'POST');
    assert.equal(options.body.get('hub.mode'), 'publish');
    assert.equal(options.body.get('hub.url'), manifest.feedUrl);
    return new Response(null, { status: 202 });
  };
  const unchanged = await publishUpdate({ previous: { siteUrl: manifest.siteUrl, revision: 'new' }, manifest, hubUrl: manifest.hubUrl, fetchImpl });
  assert.equal(unchanged.status, 'unchanged');
  assert.equal(calls, 0);
  const changed = await publishUpdate({ previous: { siteUrl: manifest.siteUrl, revision: 'old' }, manifest, hubUrl: manifest.hubUrl, fetchImpl });
  assert.equal(changed.status, 'published');
  assert.equal(calls, 1);
  const manual = await publishUpdate({ previous: { siteUrl: manifest.siteUrl, revision: 'new' }, manifest, hubUrl: manifest.hubUrl, force: true, fetchImpl });
  assert.equal(manual.status, 'published');
  assert.equal(manual.manual, true);
  assert.equal(calls, 2);
});

test('first publication accepts 404; previous-manifest and hub errors remain failures', async () => {
  const first = await captureRevision({ siteUrl: 'https://charts.example', fetchImpl: async () => new Response(null, { status: 404 }) });
  assert.equal(first.revision, null);
  await assert.rejects(captureRevision({ siteUrl: 'https://charts.example', fetchImpl: async () => new Response(null, { status: 500 }) }), /HTTP 500/);
  await assert.rejects(publishUpdate({
    previous: first,
    manifest: { schemaVersion: 1, mode: 'live', revision: 'new', siteUrl: first.siteUrl, feedUrl: `${first.siteUrl}/feed.xml`, hubUrl: 'https://hub.example/' },
    hubUrl: 'https://hub.example/', fetchImpl: async url => url === 'https://hub.example/' ? new Response(null, { status: 503 }) : Response.json({ schemaVersion: 1, revision: 'new', siteUrl: first.siteUrl }),
  }), /HTTP 503/);
});

test('deployment must be visible at the canonical domain before notifying the hub', async () => {
  const manifest = { schemaVersion: 1, mode: 'live', revision: 'new', siteUrl: 'https://charts.example', feedUrl: 'https://charts.example/feed.xml', hubUrl: 'https://hub.example/' };
  let posts = 0;
  await assert.rejects(publishUpdate({
    previous: { siteUrl: manifest.siteUrl, revision: 'old' }, manifest, hubUrl: manifest.hubUrl,
    fetchImpl: async (url, options) => {
      if (options.method === 'POST') posts++;
      return Response.json({ ...manifest, revision: 'old' });
    },
  }), /正式站点尚未提供本次订阅版本/);
  assert.equal(posts, 0);
  await assert.rejects(captureRevision({ siteUrl: manifest.siteUrl, fetchImpl: async () => Response.json({ ...manifest, siteUrl: 'https://other.example' }) }), /SITE_URL 不一致/);
});

const deploymentManifest = () => ({ schemaVersion: 1, mode: 'live', revision: 'new', siteUrl: 'https://charts.example', feedUrl: 'https://charts.example/feed.xml', hubUrl: 'https://hub.example/' });

test('deployment wait accepts old revisions and 404 before publishing once', async () => {
  const manifest = deploymentManifest();
  const responses = [Response.json({ ...manifest, revision: 'old' }), new Response(null, { status: 404 }), Response.json(manifest)];
  let clock = 0;
  let posts = 0;
  const sleeps = [];
  const messages = [];
  const result = await publishUpdate({
    previous: { siteUrl: manifest.siteUrl, revision: 'new' }, manifest, hubUrl: manifest.hubUrl,
    force: true, waitForDeployment: true, now: () => clock,
    sleepImpl: async ms => { sleeps.push(ms); clock += ms; }, onWait: message => messages.push(message),
    fetchImpl: async (url, options) => {
      if (options.method !== 'POST') return responses.shift();
      posts++;
      assert.equal(responses.length, 0);
      assert.equal(url, manifest.hubUrl);
      return new Response(null, { status: 202 });
    },
  });
  assert.equal(result.status, 'published');
  assert.equal(result.manual, true);
  assert.deepEqual(sleeps, [15000, 15000]);
  assert.equal(messages.length, 1);
  assert.equal(posts, 1);
});

test('deployment wait stops after five minutes without notifying', async () => {
  const manifest = deploymentManifest();
  let clock = 0;
  let reads = 0;
  let posts = 0;
  await assert.rejects(publishUpdate({
    previous: { siteUrl: manifest.siteUrl, revision: 'old' }, manifest, hubUrl: manifest.hubUrl,
    waitForDeployment: true, now: () => clock, sleepImpl: async ms => { clock += ms; },
    fetchImpl: async (url, options) => {
      if (options.method === 'POST') posts++;
      else reads++;
      return Response.json({ ...manifest, revision: 'old' });
    },
  }), /等待.*超时/);
  assert.equal(clock, 300000);
  assert.equal(reads, 20);
  assert.equal(posts, 0);
});

test('deployment wait immediately fails on HTTP, network, and manifest errors', async () => {
  const manifest = deploymentManifest();
  for (const [response, error] of [
    [() => new Response(null, { status: 500 }), /HTTP 500/],
    [() => Response.json(manifest, { status: 201 }), /HTTP 201/],
    [() => { throw new Error('network unavailable'); }, /network unavailable/],
    [() => Response.json({ ...manifest, revision: 123 }), /清单契约/],
  ]) {
    let calls = 0;
    let sleeps = 0;
    await assert.rejects(publishUpdate({
      previous: { siteUrl: manifest.siteUrl, revision: 'old' }, manifest, hubUrl: manifest.hubUrl,
      waitForDeployment: true, now: () => 0, sleepImpl: async () => { sleeps++; },
      fetchImpl: async (url, options) => {
        calls++;
        assert.notEqual(options.method, 'POST');
        return response();
      },
    }), error);
    assert.equal(calls, 1);
    assert.equal(sleeps, 0);
  }
});

test('deployment wait is skipped when no notification is needed, and hub POST never retries', async () => {
  const manifest = deploymentManifest();
  const unused = async () => { assert.fail('No network request or sleep expected'); };
  const args = { previous: { siteUrl: manifest.siteUrl, revision: 'new' }, manifest, hubUrl: manifest.hubUrl, waitForDeployment: true, fetchImpl: unused, sleepImpl: unused };
  assert.equal((await publishUpdate(args)).status, 'unchanged');
  assert.equal((await publishUpdate({ ...args, manifest: { ...manifest, mode: 'demo' } })).status, 'demo');
  assert.equal((await publishUpdate({ ...args, hubUrl: '' })).status, 'disabled');
  let posts = 0;
  await assert.rejects(publishUpdate({
    ...args, force: true,
    fetchImpl: async (url, options) => {
      if (options.method !== 'POST') return Response.json(manifest);
      posts++;
      return new Response(null, { status: 503 });
    },
  }), /HTTP 503/);
  assert.equal(posts, 1);
});

test('meaningful recomputation keeps its correction time even when restoring an older revision', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'resonance-recompute-feed-test-'));
  try {
    const dataDirectory = resolve(directory, 'data');
    const runDirectory = resolve(dataDirectory, 'runs', '2026-10-23');
    await mkdir(runDirectory, { recursive: true });
    const original = snapshot();
    await writeFile(resolve(dataDirectory, 'dates.json'), JSON.stringify({ dates: [original.date] }));
    await writeFile(resolve(runDirectory, '01.json'), JSON.stringify(original));
    const restored = { ...original, recomputedAt: '2026-10-24T00:00:00.000Z' };
    const feed = await buildFeed({ dist: resolve(directory, 'dist'), dataDirectory, snapshot: restored, siteUrl: 'https://charts.example' });
    assert.equal(feed.entries[0].publishedAt, original.generatedAt);
    assert.equal(feed.entries[0].updatedAt, restored.recomputedAt);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('weekly subscriptions have stable IDs, ignore observation dates, and finalize at the week boundary', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'resonance-weekly-feed-test-'));
  try {
    const dataDirectory = resolve(directory, 'data');
    await mkdir(dataDirectory);
    const day = snapshot();
    await writeFile(resolve(dataDirectory, 'dates.json'), JSON.stringify({ dates: [day.date] }));
    const week = {
      mode: 'live', weekStart: '2026-10-19', weekEnd: '2026-10-25', status: 'provisional',
      generatedAt: day.generatedAt, asOfDate: day.date,
      methodology: { version: 'weekly-1.0', baseVersion: '1.1' },
      coverage: { observedDays: 1, expectedDays: 7, includedDates: [day.date], missingDates: ['2026-10-19'], excludedDates: [], sourceCoverage: day.coverage },
      songs: day.songs,
    };
    const args = { dist: resolve(directory, 'dist'), dataDirectory, snapshot: day, siteUrl: 'https://charts.example' };
    const first = await buildFeed({ ...args, weeks: [week, { ...week, weekStart: '2026-10-26', coverage: { ...week.coverage, observedDays: 0, includedDates: [] }, songs: [] }] });
    const weekly = first.entries.find(entry => entry.kind === 'weekly');
    assert.equal(first.entries.length, 2);
    assert.equal(weekly.id, 'https://charts.example/api/v1/weekly/2026-10-19.json#live');
    assert.match(weekly.title, /本周预览/);
    const repeated = { ...week, generatedAt: '2026-10-24T00:00:00.000Z', asOfDate: '2026-10-24' };
    assert.equal(revisionOf(week), revisionOf(repeated));
    const second = await buildFeed({ ...args, weeks: [repeated] });
    assert.equal(first.revision, second.revision);
    const closed = await buildFeed({ ...args, weeks: [{ ...repeated, asOfDate: '2026-10-26', status: 'incomplete' }] });
    const finalWeek = closed.entries.find(entry => entry.kind === 'weekly');
    assert.equal(finalWeek.id, weekly.id);
    assert.notEqual(finalWeek.revision, weekly.revision);
    assert.equal(finalWeek.updatedAt, '2026-10-25T16:00:00.000Z');
    assert.match(finalWeek.title, /缺日周榜/);
    const priorDay = { ...day, date: '2026-10-16', generatedAt: '2026-10-16T01:17:00.000Z', recomputedAt: '2026-10-27T02:00:00.000Z' };
    await mkdir(resolve(dataDirectory, 'daily'));
    await writeFile(resolve(dataDirectory, 'daily', `${priorDay.date}.json`), JSON.stringify(priorDay));
    const priorWeek = { ...week, weekStart: '2026-10-12', weekEnd: '2026-10-18', status: 'incomplete', coverage: { ...week.coverage, includedDates: [priorDay.date] } };
    const corrected = await buildFeed({ ...args, weeks: [{ ...week, status: 'incomplete' }, priorWeek] });
    assert.equal(corrected.entries.find(entry => entry.weekStart === week.weekStart).updatedAt, priorDay.recomputedAt);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
