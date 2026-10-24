import { createHash } from 'node:crypto';
import { chinaDate } from './ranking.mjs';
import { providers } from './providers.mjs';

// Compare ranks only: RSS timestamps, movement, artwork and other metadata may change independently.
const fingerprint = source => createHash('sha256').update(JSON.stringify(
  source.entries.map(entry => [entry.rank, String(entry.sourceId)]).sort((a, b) => a[0] - b[0]),
)).digest('hex');

export function buildCadenceReport({ snapshots, generatedAt }) {
  const sinceDate = chinaDate(new Date(Date.parse(generatedAt) - 29 * 86_400_000));
  const observations = new Map(providers.map(provider => [provider.id, new Map()]));
  for (const snapshot of snapshots) {
    if (snapshot.mode !== 'live' || snapshot.generatedAt > generatedAt) continue;
    for (const source of snapshot.sources) {
      if (source.status !== 'ok' || !['public', 'import'].includes(source.ingestion) || !source.fetchedAt || chinaDate(new Date(source.fetchedAt)) < sinceDate) continue;
      observations.get(source.id).set(source.fetchedAt, {
        observedAt: source.fetchedAt, date: chinaDate(new Date(source.fetchedAt)),
        fingerprint: fingerprint(source), depth: source.entries.length, sourcePeriod: source.sourcePeriod,
        sourceUpdatedAt: source.sourceUpdatedAt, sourceUrl: source.sourceUrl, chartName: source.chartName,
        edition: source.id === 'apple' ? null : source.sourceUpdatedAt ?? (source.sourcePeriod === 'weekly' ? null : source.sourcePeriod),
      });
    }
  }
  return {
    schemaVersion: 1, generatedAt, sinceDate, timeZone: 'Asia/Shanghai',
    policy: '仅比较真实成功观察中的歌曲 ID 与名次；变化发生于两次观察之间，不将采集时间或 RSS 时间推定为固定发榜时间。',
    sources: providers.map(provider => {
      const rows = [...observations.get(provider.id).values()].sort((a, b) => a.observedAt.localeCompare(b.observedAt));
      const daily = new Map();
      const changes = [];
      const editionChanges = [];
      rows.forEach((row, index) => {
        if (!daily.has(row.date)) daily.set(row.date, { date: row.date, observations: 0, changes: 0, editionChanges: 0 });
        daily.get(row.date).observations++;
        const previous = rows[index - 1];
        if (!previous || previous.sourceUrl !== row.sourceUrl || previous.chartName !== row.chartName || previous.depth !== row.depth) return;
        if (previous.edition && row.edition && previous.edition !== row.edition) {
          if (previous.date === row.date) daily.get(row.date).editionChanges++;
          editionChanges.push({ after: previous.observedAt, by: row.observedAt, previousEdition: previous.edition, edition: row.edition, rankChanged: previous.fingerprint !== row.fingerprint });
        }
        if (previous.fingerprint === row.fingerprint) return;
        if (previous.date === row.date) daily.get(row.date).changes++;
        changes.push({
          after: previous.observedAt, by: row.observedAt,
          previousPeriod: previous.sourcePeriod, sourcePeriod: row.sourcePeriod,
          sourceUpdatedAt: row.sourceUpdatedAt,
        });
      });
      const maxDailyChanges = Math.max(0, ...[...daily.values()].map(day => day.changes));
      return {
        id: provider.id, name: provider.name, frequency: provider.frequency, updatePolicy: provider.updatePolicy,
        observations: rows.length, firstObservedAt: rows[0]?.observedAt ?? null, latestObservedAt: rows.at(-1)?.observedAt ?? null,
        latestContentChange: changes.at(-1) ?? null, changes, editionChanges, daily: [...daily.values()], maxDailyChanges,
        conclusion: !rows.length ? '尚无真实成功观察' : maxDailyChanges >= 2 ? '同一自然日内已观察到多次排名变化，次数为观测下限' : changes.length ? '已观察到排名变化，采样不足以断言每日只更新一次' : '观察期间排名未变，不能据此推定更新频率',
      };
    }),
  };
}
