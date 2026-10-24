import { readPublic } from './http.mjs';
import { providers, unknownMovement, movementFromPrevious, mvFromId, kugouEntries, parseKugouResponse } from './providers.mjs';
import { chinaDate, identify, validateChart } from './ranking.mjs';

// This older official endpoint serves public metadata over HTTP; TLS checks remain enabled everywhere.
const kugouBase = 'http://mobilecdn.kugou.com/api/v3/rank/';

export { parseKugouResponse } from './providers.mjs';

export async function historicalKugouPeriods() {
  const data = parseKugouResponse(await readPublic(`${kugouBase}vol?ranktype=2&plat=0&rankid=8888`, { format: 'text' }));
  if (data.status !== 1) throw new Error(`酷狗历史期次接口状态：${data.status}`);
  return new Map(data.data.info.flatMap(year => year.vols).map(vol => [vol.voltime.slice(0, 10), vol]));
}

function qqMovement(row) {
  const raw = { rankType: row.rankType, rankValue: row.rankValue };
  if (row.rankType === 4) return { direction: 'new', delta: null, previousRank: null, period: 'previous-edition', raw };
  if (row.rankType === 3 && Number(row.rankValue) === 0) return movementFromPrevious(row.rank, row.rank, raw);
  const magnitude = Number(row.rankValue);
  if (![1, 2].includes(row.rankType) || !Number.isInteger(magnitude) || magnitude <= 0) return unknownMovement(raw);
  return movementFromPrevious(row.rank, row.rank + (row.rankType === 1 ? magnitude : -magnitude), raw);
}

export function parseHistoricalQQ(data, date) {
  if (data.code !== 0 || data.detail.code !== 0) throw new Error(`QQ 历史榜接口状态：${data.detail?.code ?? data.code}`);
  const detail = data.detail.data;
  if (detail.data.topId !== 26 || detail.data.period !== date) throw new Error(`QQ 返回榜期 ${detail.data.period}，与 ${date} 不符`);
  const tracks = new Map(detail.songInfoList.map(track => [track.id, track]));
  return {
    sourcePeriod: detail.data.period,
    sourceUpdatedAt: null,
    entries: detail.data.song.map(row => {
      const track = tracks.get(row.songId);
      return {
        sourceId: track.mid, rank: row.rank, title: track.name,
        artists: track.singer.map(artist => artist.name), album: track.album.name || null,
        artwork: row.cover || null, url: `https://y.qq.com/n/ryqq/songDetail/${track.mid}`,
        sourceMovement: qqMovement(row), mv: mvFromId(track.mv.vid),
      };
    }),
  };
}

export function parseHistoricalKugou(data, date) {
  if (data.status !== 1) throw new Error(`酷狗历史榜接口状态：${data.status}`);
  if (data.data.info.some(track => track.rank_id_publish_date?.slice(0, 10) !== date)) throw new Error('酷狗返回的曲目榜期与请求日期不符');
  return {
    sourcePeriod: data.data.info[0].rank_id_publish_date,
    sourceUpdatedAt: null,
    entries: kugouEntries(data.data.info),
  };
}

export async function collectHistorical(providerId, { date, now, aliases, kugouPeriod }) {
  // Historical backfills retain their verified Top 100 contract; live chart expansion is independent.
  const provider = { ...providers.find(item => item.id === providerId), collectionDepth: 100 };
  let url;
  let parsed;
  if (providerId === 'qq') {
    const payload = { detail: { module: 'musicToplist.ToplistInfoServer', method: 'GetDetail', param: { topId: 26, period: date, offset: 0, num: 100 } }, comm: { ct: 24, cv: 0 } };
    url = `https://u.y.qq.com/cgi-bin/musicu.fcg?${new URLSearchParams({ format: 'json', data: JSON.stringify(payload) })}`;
    parsed = parseHistoricalQQ(await readPublic(url, { referer: 'https://y.qq.com/' }), date);
  } else if (providerId === 'kugou') {
    if (!kugouPeriod) throw new Error(`酷狗期次目录没有 ${date}`);
    url = `${kugouBase}song?${new URLSearchParams({ version: '9108', ranktype: '2', plat: '0', pagesize: '100', area_code: '1', page: '1', volid: String(kugouPeriod.volid), rankid: '8888' })}`;
    parsed = parseHistoricalKugou(parseKugouResponse(await readPublic(url, { format: 'text', referer: 'https://m.kugou.com/' })), date);
  } else throw new Error(`尚未确认 ${providerId} 的历史榜读取能力`);
  const fetchedAt = now.toISOString();
  // Withdrawn tracks leave gaps in historical source ranks; never renumber their successors.
  const entries = parsed.entries.filter(entry => entry.rank <= provider.collectionDepth);
  const chart = validateChart({ ...parsed, entries, providerId, sourceUrl: url, chartName: provider.chartName, fetchedAt }, provider, chinaDate(now), { editionDate: date });
  const ranks = new Set(chart.entries.map(entry => entry.rank));
  const missingRanks = Array.from({ length: provider.collectionDepth }, (_, index) => index + 1).filter(rank => !ranks.has(rank));
  return {
    ...provider, ...chart, schemaVersion: 1, mode: 'live', date, generatedAt: fetchedAt,
    status: 'ok', ingestion: 'backfill', observationType: 'historical-edition',
    message: '事后读取的平台历史榜期，不代表当日采集快照；不参与综合榜计分。',
    count: chart.entries.length, missingRanks,
    entries: chart.entries.map(entry => ({ ...entry, songId: identify(entry, providerId, aliases).id })),
  };
}
