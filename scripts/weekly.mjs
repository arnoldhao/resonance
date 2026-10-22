const DAY = 86_400_000;
const round = value => Math.round(value * 10_000) / 10_000;
const addDays = (date, count) => new Date(Date.parse(`${date}T00:00:00Z`) + count * DAY).toISOString().slice(0, 10);

// Inputs are already Asia/Shanghai calendar dates. UTC arithmetic avoids host timezone effects.
function monday(date) {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((weekday + 6) % 7));
}

function rebuildDay(day) {
  // Both published versions use this curve; future formula versions need an explicit implementation.
  if (!['1.0', '1.1'].includes(day.methodology.version)) return { reason: `未支持的日榜方法版本：${day.methodology.version}` };
  const sources = day.sources.filter(source => source.status === 'ok');
  const groups = [...new Set(sources.map(source => source.group))];
  if (groups.length < day.methodology.minimumGroups) return { reason: '有效来源组不足，未满足日榜发布门槛' };
  const groupWeightTotal = groups.reduce((sum, group) => sum + day.methodology.groupWeights[group], 0);
  const labels = new Map(day.songs.map(song => [song.id, song]));
  const songs = new Map();
  for (const source of sources) {
    const weight = day.methodology.groupWeights[source.group] / groupWeightTotal / sources.filter(other => other.group === source.group).length;
    const best = new Map();
    for (const entry of source.entries) {
      if (!entry.songId) throw new Error(`${day.date} ${source.id} ${entry.sourceId} 缺少已保存的 songId，不能重建周榜`);
      if (entry.rank > day.methodology.rankDepth) continue;
      if (!best.has(entry.songId) || entry.rank < best.get(entry.songId).rank) best.set(entry.songId, entry);
    }
    for (const entry of best.values()) {
      let song = songs.get(entry.songId);
      if (!song) {
        // Published daily songs may supply curated labels, but never scores or the candidate set.
        const label = labels.get(entry.songId) ?? entry;
        song = { id: entry.songId, title: label.title, artists: [...label.artists], artwork: label.artwork ?? null, score: 0 };
        songs.set(song.id, song);
      }
      song.score += 100 * weight * (0.9 * Math.exp(-(entry.rank - 1) / 25) + 0.1);
      if (!song.artwork && entry.artwork) song.artwork = entry.artwork;
    }
  }
  return { songs };
}

/** Derive weekly charts from published daily snapshots. No I/O and no modification of input days. */
export function buildWeeklyCharts({ days, asOfDate }) {
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
    const weekStart = monday(day.date);
    if (!grouped.has(weekStart)) grouped.set(weekStart, []);
    grouped.get(weekStart).push(day);
  }
  const currentWeek = monday(asOfDate);
  if (!grouped.has(currentWeek)) grouped.set(currentWeek, []);
  const weeks = [];
  for (const weekStart of [...grouped.keys()].sort()) {
    const weekEnd = addDays(weekStart, 6);
    const observed = grouped.get(weekStart);
    const reference = observed.at(-1);
    const mode = reference?.mode ?? chronologicalDays.at(-1)?.mode ?? 'live';
    const comparisonSignature = reference?.comparisonSignature ?? null;
    const included = [];
    const excludedDates = [];
    for (const day of observed) {
      let reason;
      if (day.comparisonSignature !== comparisonSignature) reason = '与本周最新日榜的比较口径不同';
      else if (day.mode !== mode) reason = '与本周最新日榜的数据模式不同';
      if (reason) {
        excludedDates.push({ date: day.date, reason });
        continue;
      }
      const rebuilt = rebuildDay(day);
      if (rebuilt.reason) excludedDates.push({ date: day.date, reason: rebuilt.reason });
      else included.push({ date: day.date, songs: rebuilt.songs });
    }
    const includedDates = included.map(day => day.date);
    const observedDates = new Set(observed.map(day => day.date));
    const missingDates = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)).filter(date => !observedDates.has(date));
    const candidates = new Map();
    for (const day of included) {
      for (const song of day.songs.values()) {
        const prior = candidates.get(song.id);
        candidates.set(song.id, { ...song, total: (prior?.total ?? 0) + song.score, daysOnChart: (prior?.daysOnChart ?? 0) + 1 });
      }
    }
    const status = weekEnd >= asOfDate ? 'provisional' : included.length === 7 ? 'complete' : 'incomplete';
    const priorWeek = weeks.at(-1);
    const comparable = status === 'complete' && priorWeek?.status === 'complete' && priorWeek.weekStart === addDays(weekStart, -7) && priorWeek.mode === mode && priorWeek.comparisonSignature === comparisonSignature;
    const previousSongs = new Map((comparable ? priorWeek.songs : []).map(song => [song.id, song]));
    const songs = [...candidates.values()].sort((a, b) => b.total - a.total || b.daysOnChart - a.daysOnChart || a.id.localeCompare(b.id)).slice(0, 100).map((song, index) => {
      const rank = index + 1;
      const previousRank = previousSongs.get(song.id)?.rank ?? null;
      const delta = previousRank === null ? null : previousRank - rank;
      return {
        id: song.id, title: song.title, artists: song.artists, artwork: song.artwork,
        rank, score: round(song.total / included.length), daysOnChart: song.daysOnChart,
        dailyScores: included.map(day => ({ date: day.date, score: round(day.songs.get(song.id)?.score ?? 0) })),
        previousRank, delta,
        weeklyMovement: {
          direction: !comparable ? 'unknown' : previousRank === null ? 'new' : delta > 0 ? 'up' : delta < 0 ? 'down' : 'same',
          delta, previousRank, period: 'previous-week', comparisonDate: comparable ? priorWeek.weekStart : null,
        },
      };
    });
    const sourceCoverage = reference ? Object.fromEntries(['available', 'expected', 'groups', 'groupTotal', 'status'].map(key => [key, reference.coverage[key]])) : null;
    weeks.push({
      weekStart, weekEnd, mode, generatedAt, asOfDate, status,
      methodology: {
        version: 'weekly-1.0', baseVersion: reference?.methodology.version ?? null,
        formula: '周得分 = 同口径有效日得分之和 ÷ 有效天数；有效日未进入计分窗口记 0，缺失日与排除日不进入分母',
        rankDepth: reference?.methodology.rankDepth ?? null,
        groupWeights: reference ? { ...reference.methodology.groupWeights } : null,
      },
      comparisonSignature,
      coverage: {
        observedDays: included.length, expectedDays: 7, includedDates, missingDates, excludedDates,
        latestIncludedDate: includedDates.at(-1) ?? null, comparisonAvailable: Boolean(comparable), sourceCoverage,
      },
      songs,
    });
  }
  return weeks.reverse();
}
