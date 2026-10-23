import { readPublic } from './http.mjs';

/** Source metadata is published alongside every edition. Times are never guessed. */
export const providers = [
  {
    id: 'qq', name: 'QQ 音乐', chartName: '热歌榜', group: 'tme', enabled: true,
    collectionDepth: 100, maxAgeHours: 48,
    sourceUrl: 'https://y.qq.com/n/ryqq/toplist/26', frequency: '每日更新',
    updatePolicy: '榜单说明为每日更新；未确认固定公布时刻。',
    access: '官方公开 Web 接口',
  },
  {
    id: 'netease', name: '网易云音乐', chartName: '热歌榜', group: 'netease', enabled: true,
    collectionDepth: 100, maxAgeHours: 48,
    sourceUrl: 'https://music.163.com/#/discover/toplist?id=3778678', frequency: '每日更新',
    updatePolicy: '一周内热度统计，当前官方说明为每日更新；未确认固定公布时刻。',
    access: '官方公开歌单接口',
  },
  {
    id: 'kugou', name: '酷狗音乐', chartName: 'TOP500', group: 'tme', enabled: true,
    collectionDepth: 100, maxAgeHours: 48,
    sourceUrl: 'https://m.kugou.com/rank/info/?rankid=8888', frequency: '每日更新',
    updatePolicy: '官方说明为每天更新；一次响应配置出现 10:00，不能视为永久时间承诺。',
    access: '官方榜单 JSON · 单次完整前 100 首',
  },
  {
    id: 'kuwo', name: '酷我音乐', chartName: '酷我热歌榜', group: 'tme', enabled: true,
    collectionDepth: 100, maxAgeHours: 48,
    sourceUrl: 'https://www.kuwo.cn/rankList', frequency: '更新频率待确认',
    updatePolicy: '公开接口提供榜单日期；未找到固定频率与公布时刻的一手承诺。',
    access: '官方公开榜单接口',
  },
  {
    id: 'apple', name: 'Apple Music', chartName: '热门歌曲 · 中国区（RSS）', group: 'apple', enabled: true,
    collectionDepth: 100, maxAgeHours: 48,
    sourceUrl: 'https://rss.marketingtools.apple.com/api/v2/cn/music/most-played/100/songs.json',
    frequency: '未公开固定时点',
    updatePolicy: '官方 CN most-played RSS；与 Top 100：中国大陆日更歌单是不同产品，不套用其日更承诺。',
    access: '官方 RSS · 中国区热门歌曲',
  },
  {
    id: 'qishui', name: '汽水音乐', chartName: '热歌榜 · 周榜 Top 50', group: 'qishui', enabled: true,
    sourceUrl: 'https://api.qishui.com/luna/pc/charts/7036274230471712007?aid=386088&app_name=luna_pc&region=cn',
    collectionDepth: 50, maxAgeHours: 216, period: 'weekly', frequency: '每周更新',
    updatePolicy: '官方响应 period=weekly，共 50 首；本次源发布时间为北京时间周四 16:00，固定时刻尚无长期承诺。每日保存周榜快照。',
    access: '官方 PC 榜单接口 · 无需 Cookie 或签名',
  },
];

export const unknownMovement = raw => ({ direction: 'unknown', delta: null, previousRank: null, period: 'previous-edition', raw });
const unknownMV = () => ({ status: 'unknown', items: [] });
const sourceFields = (source, names) => Object.fromEntries(names.filter(name => {
  const value = source[name];
  return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}).map(name => [name, source[name]]));

export function movementFromPrevious(currentRank, previousValue, raw) {
  const previousRank = Number(previousValue);
  // Zero/negative/missing values have no confirmed previous-rank meaning.
  if (!Number.isInteger(currentRank) || currentRank < 1 || !Number.isInteger(previousRank) || previousRank < 1) return unknownMovement(raw);
  const delta = previousRank - currentRank;
  return { direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'same', delta, previousRank, period: 'previous-edition', raw };
}

// The official ranking template compares its zero-based row index with lastRank.
export function neteaseMovement(currentRank, lastRank) {
  const raw = sourceFields({ lastRank }, ['lastRank']);
  if (!Number.isInteger(lastRank) || lastRank < 0) return unknownMovement(raw);
  return movementFromPrevious(currentRank, lastRank + 1, raw);
}

function qishuiMovement(currentRank, rank) {
  const raw = sourceFields(rank, ['rank_delta', 'rank_type', 'track_id']);
  if (rank.rank_type === 'new') return { direction: 'new', delta: null, previousRank: null, period: 'previous-edition', raw };
  const magnitude = Number(rank.rank_delta);
  if (!['up', 'down'].includes(rank.rank_type) || !Number.isInteger(magnitude) || magnitude <= 0) return unknownMovement(raw);
  const delta = rank.rank_type === 'up' ? magnitude : -magnitude;
  const previousRank = currentRank + delta;
  if (previousRank < 1) return unknownMovement(raw);
  return { direction: rank.rank_type, delta, previousRank, period: 'previous-edition', raw };
}

function mvIdentifier(value) {
  if (!['string', 'number'].includes(typeof value)) return null;
  const id = String(value).trim();
  return id && id !== '0' ? id : null;
}

export function mvFromId(value) {
  const id = mvIdentifier(value);
  if (id) return { status: 'linked', items: [{ id, hash: null, url: null }] };
  return { status: value === '' || value === 0 || value === '0' ? 'none' : 'unknown', items: [] };
}

export function kugouMV(track) {
  const items = (track.mvdata ?? []).map(mv => ({ id: mvIdentifier(mv.id), hash: mvIdentifier(mv.hash), url: null })).filter(mv => mv.id || mv.hash);
  const hash = mvIdentifier(track.mvhash);
  if (hash && !items.some(item => item.hash === hash)) items.push({ id: null, hash, url: null });
  if (items.length) return { status: 'linked', items };
  return { status: track.mvhash === '' && Array.isArray(track.mvdata) && track.mvdata.length === 0 ? 'none' : 'unknown', items: [] };
}

export function parseKugouResponse(text) {
  return JSON.parse(text.replace(/^<!--KG_TAG_RES_START-->/, '').replace(/<!--KG_TAG_RES_END-->$/, ''));
}

export function kugouEntries(tracks) {
  return tracks.map(track => ({
    sourceId: track.hash, rank: Number(track.sort), title: track.songname,
    artists: track.authors.map(artist => artist.author_name), album: null,
    artwork: track.album_sizable_cover ? track.album_sizable_cover.replace('{size}', '400').replace(/^http:/, 'https:') : null,
    url: `https://www.kugou.com/song/#hash=${track.hash}`,
    sourceMovement: movementFromPrevious(Number(track.sort), track.last_sort, sourceFields(track, ['sort', 'last_sort'])),
    mv: kugouMV(track),
  }));
}

async function qq() {
  const data = await readPublic('https://c.y.qq.com/v8/fcg-bin/fcg_v8_toplist_cp.fcg?format=json&topid=26', {
    referer: 'https://y.qq.com/',
  });
  if (data.code !== 0) throw new Error(`QQ Music returned code ${data.code}`);
  return {
    sourceUpdatedAt: null,
    sourcePeriod: data.date,
    entries: data.songlist.slice(0, 100).map(({ data: track, ...row }, index) => ({
      sourceId: String(track.songmid),
      title: track.songname,
      artists: track.singer.map(artist => artist.name),
      album: track.albumname || null,
      artwork: track.albummid ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${track.albummid}.jpg` : null,
      url: `https://y.qq.com/n/ryqq/songDetail/${track.songmid}`,
      rank: index + 1,
      sourceMovement: movementFromPrevious(Number(row.cur_count), row.old_count, sourceFields(row, ['cur_count', 'old_count'])),
      mv: mvFromId(track.vid),
    })),
  };
}

async function netease() {
  const data = await readPublic('https://music.163.com/api/playlist/detail?id=3778678', {
    referer: 'https://music.163.com/',
  });
  if (data.code !== 200) throw new Error(`NetEase returned code ${data.code}`);
  return {
    sourceUpdatedAt: new Date(data.result.updateTime).toISOString(),
    sourcePeriod: null,
    entries: data.result.tracks.slice(0, 100).map((track, index) => ({
      sourceId: String(track.id),
      title: track.name,
      artists: track.artists.map(artist => artist.name),
      album: track.album.name || null,
      artwork: track.album.picUrl || null,
      url: `https://music.163.com/#/song?id=${track.id}`,
      rank: index + 1,
      sourceMovement: neteaseMovement(index + 1, track.lastRank),
      mv: mvFromId(track.mvid),
    })),
  };
}

async function kugou() {
  // Mobile HTML pagination can mix independently cached pages despite identical period labels.
  const data = parseKugouResponse(await readPublic('http://mobilecdn.kugou.com/api/v3/rank/song?version=9108&plat=0&ranktype=0&area_code=1&rankid=8888&page=1&pagesize=100&with_res_tag=0', { format: 'text', referer: 'https://m.kugou.com/' }));
  if (data.status !== 1) throw new Error(`Kugou returned status ${data.status}`);
  const rows = data.data.info;
  const period = rows[0].rank_id_publish_date;
  if (!period || rows.some((track, index) => track.rank_id_publish_date !== period || Number(track.sort) !== index + 1)) throw new Error('酷狗单次响应中的榜期或名次不一致');
  return {
    // The source gives an unzoned timestamp. Preserve it without inventing a UTC offset.
    sourceUpdatedAt: null,
    sourcePeriod: period,
    entries: kugouEntries(rows.slice(0, 100)),
  };
}

async function kuwo() {
  const data = await readPublic('https://kbangserver.kuwo.cn/ksong.s?from=pc&fmt=json&alt=json&show_copyright_off=0&pn=0&rn=100&type=bang&data=content&id=16', {
    referer: 'https://www.kuwo.cn/',
  });
  return {
    sourceUpdatedAt: null,
    sourcePeriod: data.pub,
    entries: data.musiclist.slice(0, 100).map((track, index) => ({
      sourceId: String(track.id),
      title: track.name,
      artists: track.artist.split('&').map(name => name.trim()),
      album: track.album || null,
      artwork: null,
      url: `https://www.kuwo.cn/play_detail/${track.id}`,
      rank: index + 1,
      // The returned trend codes have no confirmed direction mapping yet.
      sourceMovement: unknownMovement(sourceFields(track, ['rank_change', 'trend', 'isnew', 'highest_rank'])),
      mv: mvFromId(track.mvpayinfo?.vid),
    })),
  };
}

async function apple() {
  const data = await readPublic('https://rss.marketingtools.apple.com/api/v2/cn/music/most-played/100/songs.json');
  if (data.feed.country !== 'cn') throw new Error('Apple RSS did not return the China storefront');
  return {
    sourceUpdatedAt: new Date(data.feed.updated).toISOString(),
    sourcePeriod: null,
    entries: data.feed.results.map((track, index) => ({
      sourceId: String(track.id),
      title: track.name,
      artists: [track.artistName],
      album: null,
      artwork: track.artworkUrl100 || null,
      url: track.url,
      rank: index + 1,
      sourceMovement: unknownMovement({}),
      mv: unknownMV(),
    })),
  };
}

async function qishui() {
  const data = await readPublic('https://api.qishui.com/luna/pc/charts/7036274230471712007?aid=386088&app_name=luna_pc&region=cn');
  // Successful chart responses omit status_code; error responses may include it.
  if (data.status_code !== undefined && data.status_code !== 0) throw new Error(`Qishui returned code ${data.status_code}`);
  const chart = data.chart;
  if (chart.id !== '7036274230471712007' || chart.period !== 'weekly') throw new Error('Qishui returned a different chart or period');
  if (chart.count_tracks !== 50 || chart.track_ranks.length !== 50) throw new Error('Qishui weekly chart must contain its complete Top 50');
  return {
    sourceUpdatedAt: new Date(chart.release_time * 1000).toISOString(),
    sourcePeriod: chart.period,
    // The official rank objects contain movement, not an ordinal. Array order is the chart order.
    entries: chart.track_ranks.map(({ track, rank }, index) => {
      const cover = track.album.url_cover;
      return {
        sourceId: track.id,
        title: track.name,
        artists: track.artists.map(artist => artist.name),
        album: track.album.name || null,
        artwork: `${cover.urls[0]}${cover.uri}~${cover.template_prefix}-resize:400:400.png`,
        url: `https://www.qishui.com/track/${track.id}`,
        rank: index + 1,
        sourceMovement: qishuiMovement(index + 1, rank),
        // vid / preview.vid / audition_info.vid identify audio assets, not confirmed MVs.
        mv: unknownMV(),
      };
    }),
  };
}

const collectors = { qq, netease, kugou, kuwo, apple, qishui };

export async function collectProvider(provider, { now = new Date() } = {}) {
  if (!provider.enabled) throw new Error(`${provider.name}: ${provider.disabledReason}`);
  const result = await collectors[provider.id]();
  return {
    providerId: provider.id,
    chartName: provider.chartName,
    sourceUrl: provider.sourceUrl,
    fetchedAt: new Date(now).toISOString(),
    ...result,
  };
}
