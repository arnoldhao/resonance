import { createHash } from 'node:crypto';

export const methodology = {
  version: '1.4',
  formula: 'S = 100 × Σ wₚ × P(rₚ)；r≤50 时 P(r)=0.9×exp(−(r−1)/25)+0.1，r>50 时 P(r)=P(50)×exp(−(r−50)/50)；QQ/网易云/酷狗/酷我前200、Apple前100、汽水前50计分，仅展示前100名',
  rankDepth: null,
  rankPolicy: 'platform-top-n',
  platformRankDepths: { qq: 200, netease: 200, kugou: 200, kuwo: 200, apple: 100, qishui: 50 },
  displayDepth: 100,
  tail: { startRank: 50, decayScale: 50 },
  groupWeights: { tme: 0.5, netease: 0.3, apple: 0.1, qishui: 0.1 },
  platformWeights: { qq: 0.25, kugou: 0.2, kuwo: 0.05, netease: 0.3, apple: 0.1, qishui: 0.1 },
  minimumGroups: 2,
  sourcePolicy: 'last-success-within-source-window',
};

export function chinaDate(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function priorDate(date) {
  return new Date(Date.parse(`${date}T12:00:00+08:00`) - 86400000).toISOString().slice(0, 10);
}

const normalize = value => value.normalize('NFKC').toLowerCase().replace(/\s+/gu, '').trim();
const round = value => Math.round(value * 10000) / 10000;
export const scoringRank = (rank, rule, providerId) => rank <= (rule.platformRankDepths ? rule.platformRankDepths[providerId] : rule.rankDepth);
const headValue = rank => 0.9 * Math.exp(-(rank - 1) / 25) + 0.1;
export const rankValue = (rank, rule = methodology) => rule.tail && rank > rule.tail.startRank
  ? headValue(rule.tail.startRank) * Math.exp(-(rank - rule.tail.startRank) / rule.tail.decayScale)
  : headValue(rank);
export const usableSource = source => source.status === 'ok' || source.status === 'stale';
const periodDateOf = source => /^(\d{4}-\d{2}-\d{2})(?:$| \d{2}:\d{2}:\d{2}$)/.exec(source.sourcePeriod ?? '')?.[1];

// A failed attempt never renews either the observation's age or the source edition's age.
export function sourceFreshnessIssue(source, provider, asOf) {
  const limit = provider.maxAgeHours * 3_600_000;
  const age = Date.parse(asOf) - Date.parse(source.fetchedAt);
  if (!Number.isFinite(age) || age < 0) return '成功观察时间无效或晚于本次采集';
  if (age > limit) return '上次成功观察已超过新鲜度窗口';
  const periodDate = periodDateOf(source);
  const sourceAge = source.sourceUpdatedAt ? Date.parse(asOf) - Date.parse(source.sourceUpdatedAt) : periodDate ? Date.parse(chinaDate(new Date(asOf))) - Date.parse(periodDate) : null;
  if (sourceAge !== null && sourceAge > limit) return '源榜单已超过新鲜度窗口';
  return null;
}

export function sourceObservation(source, snapshotDate) {
  return {
    status: source.status, ingestion: source.ingestion, fetchedAt: source.fetchedAt,
    observedDate: source.fetchedAt ? chinaDate(new Date(source.fetchedAt)) : source.status === 'ok' ? snapshotDate : null,
    sourceUpdatedAt: source.sourceUpdatedAt, sourcePeriod: source.sourcePeriod,
    attemptedAt: source.attemptedAt ?? null, collectionError: source.collectionError ?? null,
    cacheOrigin: source.cacheOrigin ?? null,
  };
}

// Read each edition's unrounded policy so weekly rebuilding also preserves older methods.
export function effectiveWeights(sources, rule) {
  const available = sources.filter(usableSource);
  if (rule.platformWeights) {
    const total = available.reduce((sum, source) => sum + rule.platformWeights[source.id], 0);
    return Object.fromEntries(available.map(source => [source.id, rule.platformWeights[source.id] / total]));
  }
  const groups = [...new Set(available.map(source => source.group))];
  const total = groups.reduce((sum, group) => sum + rule.groupWeights[group], 0);
  return Object.fromEntries(available.map(source => [source.id, rule.groupWeights[source.group] / total / available.filter(other => other.group === source.group).length]));
}

export function identify(entry, providerId, aliases) {
  const override = aliases.tracks[`${providerId}:${entry.sourceId}`];
  const title = override?.title ?? entry.title;
  const artistAliases = new Map(Object.entries(aliases.artists).map(([key, value]) => [normalize(key), value]));
  const artists = (override?.artists ?? entry.artists).map(artist => artistAliases.get(normalize(artist)) ?? artist);
  const key = `${normalize(title)}|${[...new Set(artists.map(normalize))].sort().join('|')}`;
  return { id: override?.id ?? createHash('sha256').update(key).digest('hex').slice(0, 20), title, artists };
}

// A platform comparison uses platform track IDs, independently of combined-chart coverage and aliases.
export function withPlatformMovements(snapshot, previous) {
  const yesterday = previous?.date === priorDate(snapshot.date) && previous.mode === snapshot.mode ? previous : null;
  const sources = snapshot.sources.map(source => {
    const prior = yesterday?.sources.find(item => item.id === source.id);
    const comparable = usableSource(source) && source.fetchedAt && chinaDate(new Date(source.fetchedAt)) === snapshot.date
      && prior && usableSource(prior) && prior.fetchedAt && chinaDate(new Date(prior.fetchedAt)) === yesterday.date
      && source.chartName === prior.chartName && source.sourceUrl === prior.sourceUrl
      && source.collectionDepth === prior.collectionDepth && prior.entries.length >= source.collectionDepth;
    const previousRanks = new Map((comparable ? prior.entries : []).map(entry => [String(entry.sourceId), entry.rank]));
    const entries = source.entries.map(entry => {
      const movement = entry.sourceMovement;
      // Rebuild our own derived movement when reading an old decorated snapshot or a reused observation.
      const official = movement?.origin === 'snapshot-comparison'
        ? { direction: 'unknown', delta: null, previousRank: null, period: 'previous-edition', raw: movement.raw }
        : movement;
      if (official && official.direction !== 'unknown') return { ...entry, sourceMovement: { ...official, origin: 'official' } };
      if (!comparable) return { ...entry, sourceMovement: official };
      const previousRank = previousRanks.get(String(entry.sourceId)) ?? null;
      const delta = previousRank === null ? null : previousRank - entry.rank;
      return { ...entry, sourceMovement: {
        direction: previousRank === null ? 'new' : delta > 0 ? 'up' : delta < 0 ? 'down' : 'same',
        delta, previousRank, period: 'previous-day', origin: 'snapshot-comparison',
        comparisonDate: yesterday.date, comparisonDepth: source.collectionDepth,
        currentObservedAt: source.fetchedAt, previousObservedAt: prior.fetchedAt,
        comparisonUsesCache: source.status === 'stale' || prior.status === 'stale', raw: official?.raw ?? {},
      } };
    });
    return { ...source, entries };
  });
  const movements = new Map(sources.map(source => [source.id, new Map(source.entries.map(entry => [String(entry.sourceId), entry.sourceMovement]))]));
  const songs = snapshot.songs.map(song => ({ ...song, platforms: song.platforms.map(platform => ({
    ...platform, sourceMovement: movements.get(platform.id).get(String(platform.sourceId)),
  })) }));
  return { ...snapshot, sources, songs };
}

export function buildMovementChart(snapshot) {
  const comparable = snapshot.coverage.comparisonAvailable;
  const select = direction => (comparable ? snapshot.songs.filter(song => song.combinedMovement?.direction === direction) : [])
    .sort((a, b) => Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0) || a.rank - b.rank || a.id.localeCompare(b.id))
    .map((song, index) => ({ ...song, movementRank: index + 1 }));
  return {
    schemaVersion: 1, mode: snapshot.mode, date: snapshot.date, generatedAt: snapshot.generatedAt,
    methodology: { version: 'movement-1.0', basis: 'combined-rank', scope: 'current-top-100', formula: '昨日综合名次 − 今日综合名次；上升、下降分别按变化幅度降序，同幅度按今日综合名次升序；新入榜单列' },
    comparisonDate: comparable ? priorDate(snapshot.date) : null,
    comparisonSignature: snapshot.comparisonSignature, coverage: snapshot.coverage,
    rising: select('up'), falling: select('down'), newEntries: select('new'),
    unchangedCount: comparable ? snapshot.songs.filter(song => song.combinedMovement?.direction === 'same').length : 0,
  };
}

// Historical ranks remain visible across method changes; each point carries its original policy.
export function withSongHistory(snapshot, history) {
  const days = history.filter(day => day.mode === snapshot.mode && day.date < snapshot.date).sort((a, b) => a.date.localeCompare(b.date)).slice(-13);
  return { ...snapshot, songs: snapshot.songs.map(song => {
    const points = days.flatMap(day => {
      const item = day.songs.find(item => item.id === song.id);
      return item ? [{ date: day.date, rank: item.rank, score: item.score, methodologyVersion: day.methodology.version, comparisonSignature: day.comparisonSignature }] : [];
    });
    return { ...song, history: [...points, { date: snapshot.date, rank: song.rank, score: song.score, methodologyVersion: snapshot.methodology.version, comparisonSignature: snapshot.comparisonSignature }] };
  }) };
}

// This is the external input boundary. Reject partial lists instead of treating absent ranks as zero votes.
export function validateChart(chart, provider, date, { editionDate } = {}) {
  if (chart.providerId !== provider.id) throw new Error('providerId 与配置不符');
  if (typeof chart.chartName !== 'string' || !chart.chartName.trim()) throw new Error('chartName 必须记录实际榜单名称');
  const requireURL = value => { if (!['https:', 'http:'].includes(new URL(value).protocol)) throw new Error('来源或封面必须使用 HTTP(S) URL'); };
  requireURL(chart.sourceUrl);
  if (!Array.isArray(chart.entries) || !chart.entries.length || (!editionDate && chart.entries.length < provider.collectionDepth)) throw new Error(`榜单不足 ${provider.collectionDepth} 首，拒绝把截断榜单计入综合榜`);
  if (!editionDate && chart.declaredCount !== undefined && (!Number.isInteger(chart.declaredCount) || chart.declaredCount < provider.collectionDepth)) throw new Error(`源站声明 ${chart.declaredCount} 首，不足所需的前 ${provider.collectionDepth} 名观察范围`);
  if (!chart.fetchedAt || !Number.isFinite(Date.parse(chart.fetchedAt)) || chinaDate(new Date(chart.fetchedAt)) !== date) throw new Error('fetchedAt 必须是本次北京时间日期内的 ISO 时间');
  if (chart.sourceUpdatedAt !== null && !Number.isFinite(Date.parse(chart.sourceUpdatedAt))) throw new Error('sourceUpdatedAt 必须为 ISO 时间或 null');
  if (chart.sourceUpdatedAt && Date.parse(chart.sourceUpdatedAt) > Date.parse(chart.fetchedAt) + 300000) throw new Error('源更新时间晚于采集时间');
  // Freshness follows the source's cadence: daily 48 h, weekly 9 days. Unzoned periods use calendar dates.
  const periodDate = periodDateOf(chart);
  if (editionDate) {
    if (periodDate !== editionDate || editionDate > date) throw new Error('返回榜期与请求的历史日期不符');
  } else {
    const issue = sourceFreshnessIssue(chart, provider, chart.fetchedAt);
    if (issue) throw new Error(`${issue}，暂停计分`);
  }
  if (periodDate && periodDate > date) throw new Error('源榜单期次晚于采集日期');
  const rows = chart.entries.slice(0, provider.collectionDepth);
  const ids = new Set();
  rows.forEach((row, index) => {
    const validRank = editionDate
      ? Number.isInteger(row.rank) && row.rank >= 1 && row.rank <= provider.collectionDepth && (index === 0 || row.rank > rows[index - 1].rank)
      : row.rank === index + 1;
    if (!validRank || !String(row.sourceId ?? '').trim() || !row.title?.trim() || !Array.isArray(row.artists) || !row.artists.length || row.artists.some(a => typeof a !== 'string' || !a.trim())) throw new Error(`第 ${index + 1} 行缺少曲目身份或名次无效`);
    if (ids.has(String(row.sourceId))) throw new Error(`重复 sourceId：${row.sourceId}`);
    ids.add(String(row.sourceId));
    requireURL(row.url);
    if (row.artwork) requireURL(row.artwork);
    if (row.sourceMovement) {
      const movement = row.sourceMovement;
      if (!['up', 'down', 'same', 'new', 'unknown'].includes(movement.direction) || movement.period !== 'previous-edition') throw new Error(`第 ${index + 1} 行原榜涨跌类型无效`);
      if (movement.delta !== null && !Number.isInteger(movement.delta)) throw new Error(`第 ${index + 1} 行原榜涨跌必须为整数或 null`);
      if (movement.previousRank !== null && (!Number.isInteger(movement.previousRank) || movement.previousRank < 1)) throw new Error(`第 ${index + 1} 行前期名次必须为正整数或 null`);
    }
    if (row.mv) {
      if (!['linked', 'none', 'unknown'].includes(row.mv.status) || !Array.isArray(row.mv.items)) throw new Error(`第 ${index + 1} 行 MV 元数据无效`);
      for (const video of row.mv.items) if (video.url) requireURL(video.url);
    }
  });
  return { ...chart, entries: rows.map(row => ({ ...row, sourceId: String(row.sourceId) })) };
}

export function buildSnapshot({ date, generatedAt, sources, aliases, previous, history = [], mode = 'live', rule = methodology }) {
  const available = sources.filter(usableSource);
  const cached = available.filter(source => source.status === 'stale').length;
  const groups = [...new Set(available.map(source => source.group))];
  const weights = effectiveWeights(sources, rule);
  const scope = available.map(source => rule.platformRankDepths ? `${source.id}:${rule.platformRankDepths[source.id]}` : source.id).sort().join(',');
  const signature = `${rule.version}|${createHash('sha256').update(JSON.stringify(aliases)).digest('hex').slice(0, 12)}|${scope}`;
  const comparable = previous?.mode === mode && previous.date === priorDate(date) && previous.comparisonSignature === signature;
  const songs = new Map();
  const decoratedSources = sources.map(source => {
    const weight = weights[source.id] ?? 0;
    const entries = (usableSource(source) ? source.entries : []).map(entry => {
      const identity = identify(entry, source.id, aliases);
      let song = songs.get(identity.id);
      if (!song) {
        song = { ...identity, artwork: entry.artwork ?? null, platforms: [], score: 0 };
        songs.set(identity.id, song);
      }
      // Different editions of the same recording may occupy multiple source ranks. One source casts one vote.
      if (!song.platforms.some(p => p.id === source.id)) {
        const eligible = scoringRank(entry.rank, rule, source.id);
        const value = eligible ? rankValue(entry.rank, rule) : 0;
        song.score += weight * value * 100;
        song.platforms.push({ id: source.id, name: source.name, rank: entry.rank, eligible, score: round(value * 100), contribution: round(weight * value * 100), url: entry.url, sourceId: entry.sourceId, sourceMovement: entry.sourceMovement, mv: entry.mv, ...sourceObservation(source, date) });
        if (!song.artwork && entry.artwork) song.artwork = entry.artwork;
      }
      return { ...entry, songId: identity.id };
    });
    return { ...source, entries, weight: round(weight), count: entries.length, scoringCount: entries.filter(entry => scoringRank(entry.rank, rule, source.id)).length };
  });
  const previousSongs = new Map((comparable ? previous.songs : []).map(song => [song.id, song]));
  const scoringAppearances = song => song.platforms.filter(platform => platform.eligible).length;
  const ranked = groups.length >= rule.minimumGroups ? [...songs.values()].filter(s => s.score > 0).sort((a, b) => b.score - a.score || scoringAppearances(b) - scoringAppearances(a) || a.id.localeCompare(b.id)).map((song, index) => {
    const previousRank = previousSongs.get(song.id)?.rank ?? null;
    const delta = previousRank === null ? null : previousRank - index - 1;
    const combinedMovement = {
      direction: !comparable ? 'unknown' : previousRank === null ? 'new' : delta > 0 ? 'up' : delta < 0 ? 'down' : 'same',
      delta, previousRank, period: 'previous-day', comparisonDate: comparable ? previous.date : null,
    };
    return { ...song, score: round(song.score), rank: index + 1, previousRank, delta, combinedMovement, appearances: song.platforms.length, scoringAppearances: scoringAppearances(song) };
  }).slice(0, rule.displayDepth ?? 100) : [];
  return withSongHistory(withPlatformMovements({
    schemaVersion: 1, mode, date, generatedAt, methodology: rule, comparisonSignature: signature,
    coverage: { available: available.length, fresh: available.length - cached, cached, expected: sources.length, groups: groups.length, groupTotal: Object.keys(rule.groupWeights).length, status: groups.length < rule.minimumGroups ? 'insufficient' : available.length === sources.length ? 'complete' : 'partial', comparisonAvailable: Boolean(comparable), comparisonUsesCache: Boolean(comparable && (cached || previous.sources.some(source => source.status === 'stale'))) },
    sources: decoratedSources, songs: ranked,
  }, previous), history);
}
