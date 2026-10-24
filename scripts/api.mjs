import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const base = '/api/v1';
const sourceSummary = ({ entries, ...source }) => source;
const edition = snapshot => ({
  schemaVersion: 1,
  mode: snapshot.mode,
  date: snapshot.date,
  generatedAt: snapshot.generatedAt,
});
const chartResponse = snapshot => ({
  ...edition(snapshot),
  coverage: snapshot.coverage,
  methodology: snapshot.methodology,
  comparisonSignature: snapshot.comparisonSignature,
  sources: snapshot.sources.map(sourceSummary),
  songs: snapshot.songs,
});
const platformResponse = (snapshot, source) => ({ ...source, ...edition(snapshot) });

/** Materialize a read-only API from the same published snapshots used by the website. */
export async function buildAPI({ dist, dataDirectory, snapshot, status, days, archives = [], cadence }) {
  const output = async (path, value) => {
    const file = resolve(dist, `.${base}/${path}`);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
  };
  const { dates } = JSON.parse(await readFile(resolve(dataDirectory, 'dates.json'), 'utf8'));
  const endpoints = {
    latest: `${base}/charts/latest.json`,
    dates: `${base}/dates.json`,
    status: `${base}/status.json`,
    methodology: `${base}/methodology.json`,
    updates: `${base}/updates.json`,
    chartByDate: `${base}/charts/{date}.json`,
    platformLatest: `${base}/platforms/{id}/latest.json`,
    platformByDate: `${base}/platforms/{id}/{date}.json`,
    platformIndex: `${base}/platforms/{id}/index.json`,
    weeklyLatest: `${base}/weekly/latest.json`,
    weeklyIndex: `${base}/weekly/index.json`,
    weeklyByWeek: `${base}/weekly/{weekStart}.json`,
    monthlyLatest: `${base}/monthly/latest.json`,
    monthlyIndex: `${base}/monthly/index.json`,
    monthlyByMonth: `${base}/monthly/{month}.json`,
    movementLatest: `${base}/movement/latest.json`,
    movementByDate: `${base}/movement/{date}.json`,
    cadence: `${base}/cadence.json`,
  };
  await Promise.all([
    output('index.json', {
      ...edition(snapshot),
      description: '共振公开数据接口：综合日榜、涨跌榜、周榜、月榜、平台原榜、更新频率观察与采集状态。静态 JSON，无需认证。',
      endpoints,
      subscriptions: { atom: '/feed.xml', jsonFeed: '/feed.json', updates: endpoints.updates },
      platforms: snapshot.sources.map(source => ({
        ...sourceSummary(source),
        latest: endpoints.platformLatest.replace('{id}', source.id),
        byDate: endpoints.platformByDate.replace('{id}', source.id),
        index: endpoints.platformIndex.replace('{id}', source.id),
      })),
    }),
    output('charts/latest.json', chartResponse(snapshot)),
    output('dates.json', { ...edition(snapshot), dates }),
    output('methodology.json', { ...edition(snapshot), methodology: snapshot.methodology }),
    output('status.json', {
      ...status,
      schemaVersion: 1,
      sources: status.sources.map(sourceSummary),
      publishedSnapshot: { ...edition(snapshot), coverage: snapshot.coverage, url: endpoints.latest },
    }),
    ...snapshot.sources.map(source => output(`platforms/${source.id}/latest.json`, platformResponse(snapshot, source))),
  ]);
  if (cadence) await output('cadence.json', cadence);
  const platformEditions = new Map(snapshot.sources.map(source => [source.id, new Map()]));
  for (const archive of archives) {
    await output(`platforms/${archive.id}/${archive.date}.json`, archive);
    platformEditions.get(archive.id).set(archive.date, archive);
  }
  for (const historical of days) {
    const date = historical.date;
    await Promise.all([
      output(`charts/${date}.json`, chartResponse(historical)),
      ...historical.sources.map(source => output(`platforms/${source.id}/${date}.json`, platformResponse(historical, source))),
    ]);
    for (const source of historical.sources) platformEditions.get(source.id).set(date, platformResponse(historical, source));
  }
  for (const source of snapshot.sources) {
    const editions = [...platformEditions.get(source.id).values()].sort((a, b) => b.date.localeCompare(a.date));
    await output(`platforms/${source.id}/index.json`, {
      ...edition(snapshot), providerId: source.id, name: source.name,
      dates: editions.map(item => item.date),
      editions: editions.map(item => ({ date: item.date, mode: item.mode, ingestion: item.ingestion, observationType: item.observationType, provenance: item.provenance, sourcePeriod: item.sourcePeriod, sourceUpdatedAt: item.sourceUpdatedAt, fetchedAt: item.fetchedAt, attemptedAt: item.attemptedAt, collectionError: item.collectionError, cacheOrigin: item.cacheOrigin, status: item.status })),
    });
  }
}
