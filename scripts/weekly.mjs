import { effectiveWeights, rankValue, scoringRank, usableSource, sourceObservation, entryHistoryFor, recordChartEntries } from './ranking.mjs';

const DAY = 86_400_000;
const round = value => Math.round(value * 10_000) / 10_000;
const addDays = (date, count) => new Date(Date.parse(`${date}T00:00:00Z`) + count * DAY).toISOString().slice(0, 10);

// Inputs are already Asia/Shanghai calendar dates. UTC arithmetic avoids host timezone effects.
function monday(date) {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((weekday + 6) % 7));
}

const monthStart = date => `${date.slice(0, 7)}-01`;
function nextMonth(date, offset = 1) {
  const value = new Date(`${monthStart(date)}T00:00:00Z`);
  value.setUTCMonth(value.getUTCMonth() + offset);
  return value.toISOString().slice(0, 10);
}

function rebuildDay(day) {
  // These published versions use this curve; future formula versions need an explicit implementation.
  if (!['1.0', '1.1', '1.2', '1.3', '1.4'].includes(day.methodology.version)) return { reason: `未支持的日榜方法版本：${day.methodology.version}` };
  const sources = day.sources.filter(usableSource);
  const groups = [...new Set(sources.map(source => source.group))];
  if (groups.length < day.methodology.minimumGroups) return { reason: '有效来源组不足，未满足日榜发布门槛' };
  const weights = effectiveWeights(sources, day.methodology);
  const labels = new Map(day.songs.map(song => [song.id, song]));
  const songs = new Map();
  for (const source of sources) {
    const weight = weights[source.id];
    const best = new Map();
    for (const entry of source.entries) {
      if (!entry.songId) throw new Error(`${day.date} ${source.id} ${entry.sourceId} 缺少已保存的 songId，不能重建周期榜`);
      if (!best.has(entry.songId) || entry.rank < best.get(entry.songId).rank) best.set(entry.songId, entry);
    }
    for (const entry of best.values()) {
      let song = songs.get(entry.songId);
      if (!song) {
        // Published daily songs may supply curated labels, but never scores or the candidate set.
        const label = labels.get(entry.songId) ?? entry;
        song = { id: entry.songId, title: label.title, artists: [...label.artists], artwork: label.artwork ?? null, score: 0, platforms: [] };
        songs.set(song.id, song);
      }
      const eligible = scoringRank(entry.rank, day.methodology, source.id);
      const score = eligible ? 100 * rankValue(entry.rank, day.methodology) : 0;
      song.score += weight * score;
      song.platforms.push({
        id: source.id, name: source.name, rank: entry.rank, sourceId: entry.sourceId,
        url: entry.url, eligible, weight, score, contribution: weight * score,
        sourceMovement: entry.sourceMovement, mv: entry.mv, ...sourceObservation(source, day.date), includedDate: day.date,
      });
      if (!song.artwork && entry.artwork) song.artwork = entry.artwork;
    }
  }
  return { songs, usesCache: sources.some(source => source.status === 'stale') };
}

/** Weeks and calendar months use the same daily candidate pool and coverage rules. */
function buildPeriodCharts({ days, asOfDate, entryHistory = { charts: {} } }, monthly) {
  const startOf = monthly ? monthStart : monday;
  const generatedAt = new Date().toISOString();
  const latestByDate = new Map();
  for (const day of days) {
    if (day.date > asOfDate) continue;
    const prior = latestByDate.get(day.date);
    if (!prior || Date.parse(day.generatedAt) >= Date.parse(prior.generatedAt)) latestByDate.set(day.date, day);
  }
  const chronologicalDays = [...latestByDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  const grouped = new Map();
  for (const day of chronologicalDays) {
    const weekStart = startOf(day.date);
    if (!grouped.has(weekStart)) grouped.set(weekStart, []);
    grouped.get(weekStart).push(day);
  }
  const currentWeek = startOf(asOfDate);
  if (!grouped.has(currentWeek)) grouped.set(currentWeek, []);
  const weeks = [];
  for (const weekStart of [...grouped.keys()].sort()) {
    const weekEnd = monthly ? addDays(nextMonth(weekStart), -1) : addDays(weekStart, 6);
    const expectedDays = monthly ? Number(weekEnd.slice(-2)) : 7;
    const observed = grouped.get(weekStart);
    const reference = observed.at(-1);
    const mode = reference?.mode ?? chronologicalDays.at(-1)?.mode ?? 'live';
    const included = [];
    const excludedDates = [];
    for (const day of observed) {
      let reason;
      if (day.mode !== mode) reason = `与本${monthly ? '月' : '周'}最新日榜的数据模式不同`;
      if (reason) {
        excludedDates.push({ date: day.date, reason });
        continue;
      }
      const rebuilt = rebuildDay(day);
      if (rebuilt.reason) excludedDates.push({ date: day.date, reason: rebuilt.reason });
      else included.push({ date: day.date, songs: rebuilt.songs, usesCache: rebuilt.usesCache, methodology: day.methodology, comparisonSignature: day.comparisonSignature });
    }
    const baseVersions = [...new Set(included.map(day => day.methodology.version))];
    const signatures = [...new Set(included.map(day => day.comparisonSignature))];
    const comparisonSignature = signatures.length === 1 ? signatures[0] : null;
    const baseMethodology = baseVersions.length === 1 ? included[0].methodology : null;
    const includedDates = included.map(day => day.date);
    const cachedDates = included.filter(day => day.usesCache).map(day => day.date);
    const observedDates = new Set(observed.map(day => day.date));
    const missingDates = Array.from({ length: expectedDays }, (_, index) => addDays(weekStart, index)).filter(date => !observedDates.has(date));
    const candidates = new Map();
    for (const day of included) {
      for (const song of day.songs.values()) {
        const prior = candidates.get(song.id);
        const platforms = new Map((prior?.platforms ?? []).map(platform => [platform.id, platform]));
        for (const platform of song.platforms) platforms.set(platform.id, platform);
        candidates.set(song.id, { ...song, platforms: [...platforms.values()], total: (prior?.total ?? 0) + song.score, daysOnChart: (prior?.daysOnChart ?? 0) + (song.score > 0 ? 1 : 0) });
      }
    }
    const status = weekEnd >= asOfDate ? 'provisional' : included.length === expectedDays ? 'complete' : 'incomplete';
    const priorWeek = weeks.at(-1);
    const previousStart = monthly ? nextMonth(weekStart, -1) : addDays(weekStart, -7);
    const comparable = status === 'complete' && priorWeek?.status === 'complete' && priorWeek[monthly ? 'monthStart' : 'weekStart'] === previousStart && priorWeek.mode === mode;
    const previousSongs = new Map((comparable ? priorWeek.songs : []).map(song => [song.id, song]));
    const ranked = [...candidates.values()].filter(song => song.total > 0).sort((a, b) => b.total - a.total || b.daysOnChart - a.daysOnChart || a.id.localeCompare(b.id)).slice(0, 100);
    const chartHistory = entryHistoryFor(entryHistory, mode, monthly ? 'monthly' : 'weekly');
    // A preview's transient Top 100 does not count as an entry in a finished period chart.
    if (status !== 'provisional') recordChartEntries(chartHistory, weekStart, ranked);
    const songs = ranked.map((song, index) => {
      const rank = index + 1;
      const previousRank = previousSongs.get(song.id)?.rank ?? null;
      const delta = previousRank === null ? null : previousRank - rank;
      const firstEntryDate = chartHistory.firstSeen[song.id] ?? null;
      return {
        id: song.id, title: song.title, artists: song.artists, artwork: song.artwork,
        rank, score: round(song.total / included.length), daysOnChart: song.daysOnChart,
        platforms: song.platforms,
        dailyScores: included.map(day => ({ date: day.date, score: round(day.songs.get(song.id)?.score ?? 0) })),
        previousRank, delta,
        [monthly ? 'monthlyMovement' : 'weeklyMovement']: {
          direction: !comparable ? 'unknown' : previousRank === null ? (firstEntryDate < weekStart ? 'reentry' : 'new') : delta > 0 ? 'up' : delta < 0 ? 'down' : 'same',
          delta, previousRank, firstEntryDate, period: monthly ? 'previous-month' : 'previous-week', comparisonDate: comparable ? previousStart : null,
        },
      };
    });
    const sourceCoverage = reference ? Object.fromEntries(['available', 'fresh', 'cached', 'expected', 'groups', 'groupTotal', 'status'].map(key => [key, reference.coverage[key]])) : null;
    weeks.push({
      ...(monthly ? { month: weekStart.slice(0, 7), monthStart: weekStart, monthEnd: weekEnd } : { weekStart, weekEnd }),
      mode, generatedAt, asOfDate, status, entryHistoryStart: chartHistory.since,
      methodology: {
        version: monthly ? 'monthly-1.2' : 'weekly-1.3',
        baseVersion: baseVersions.length === 1 ? baseVersions[0] : null, baseVersions,
        aggregationPolicy: 'each-day-original-method',
        dailyMethods: included.map(day => ({ date: day.date, version: day.methodology.version, comparisonSignature: day.comparisonSignature })),
        formula: `${monthly ? '月' : '周'}得分 = 各有效日按当日保存公式计算的得分之和 ÷ 有效天数；公式升级不排除历史日期，缺失日与无效日不进入分母`,
        rankDepth: baseMethodology?.rankDepth ?? null,
        ...(baseMethodology?.rankPolicy ? { rankPolicy: baseMethodology.rankPolicy, platformRankDepths: { ...baseMethodology.platformRankDepths }, tail: { ...baseMethodology.tail }, displayDepth: baseMethodology.displayDepth } : {}),
        groupWeights: baseMethodology ? { ...baseMethodology.groupWeights } : null,
        platformWeights: baseMethodology?.platformWeights ? { ...baseMethodology.platformWeights } : null,
      },
      comparisonSignature,
      coverage: {
        observedDays: included.length, expectedDays, includedDates, cachedDates, missingDates, excludedDates,
        latestIncludedDate: includedDates.at(-1) ?? null,
        mixedMethods: baseVersions.length > 1, mixedSignatures: signatures.length > 1,
        comparisonAvailable: Boolean(comparable), comparisonUsesCache: Boolean(comparable && (cachedDates.length || priorWeek.coverage.cachedDates.length)), sourceCoverage,
      },
      songs,
    });
  }
  return weeks.reverse();
}

export const buildWeeklyCharts = options => buildPeriodCharts(options, false);
export const buildMonthlyCharts = options => buildPeriodCharts(options, true);
