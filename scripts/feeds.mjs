import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const readJSON = async file => JSON.parse(await readFile(file, 'utf8'));
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const observationFields = new Set(['generatedAt', 'fetchedAt', 'attemptedAt', 'recomputedAt', 'asOfDate', 'currentObservedAt', 'previousObservedAt']);

function meaningful(value) {
  if (Array.isArray(value)) return value.map(meaningful);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().filter(key =>
      !observationFields.has(key) && !(key === 'sourceUpdatedAt' && (value.id === 'apple' || value.providerId === 'apple')),
    ).map(key => [key, meaningful(value[key])]));
  }
  return value;
}

export const revisionOf = snapshot => digest(meaningful(snapshot));
export const escapeXML = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);

export function resolveSiteURL(value = process.env.SITE_URL) {
  const url = new URL(value || 'http://127.0.0.1:4173');
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('SITE_URL 必须是无凭据、路径、查询参数的 HTTP(S) 站点根地址');
  }
  if (process.env.FEED_PRODUCTION === 'true' && (url.protocol !== 'https:' || /^(localhost|.*\.localhost|127\..*|0\.0\.0\.0|\[::1\])$/.test(url.hostname))) {
    throw new Error('生产订阅必须使用公开 HTTPS SITE_URL，不能发布 localhost 地址');
  }
  return url.origin;
}

export function resolveHubURL(value = process.env.WEBSUB_HUB_URL) {
  if (!value) return null;
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) throw new Error('WEBSUB_HUB_URL 必须是无凭据的 HTTP(S) hub 地址');
  return url.href;
}

export const entryID = (siteUrl, snapshot) => `${siteUrl}/api/v1/${snapshot.month ? `monthly/${snapshot.month}` : snapshot.weekStart ? `weekly/${snapshot.weekStart}` : `charts/${snapshot.date}`}.json#${snapshot.mode}`;

async function revisionTimes(snapshot, revision, dataDirectory) {
  let publishedAt = snapshot.generatedAt;
  let updatedAt = snapshot.recomputedAt ?? snapshot.generatedAt;
  const directory = resolve(dataDirectory, 'runs', snapshot.date);
  if (!existsSync(directory)) return { publishedAt, updatedAt };
  const files = (await readdir(directory)).filter(name => name.endsWith('.json')).sort();
  const runs = (await Promise.all(files.map(file => readJSON(resolve(directory, file)))))
    .filter(run => run.mode === snapshot.mode && run.coverage.status !== 'insufficient' && run.generatedAt <= snapshot.generatedAt);
  if (runs.length) publishedAt = runs[0].generatedAt;
  // A meaningful historical correction has its own timestamp, even if it restores an older revision.
  if (snapshot.recomputedAt) return { publishedAt, updatedAt };
  // Keep the timestamp of the first observation in the current unchanged run of revisions.
  for (const run of runs.reverse()) {
    if (revisionOf(run) !== revision) break;
    updatedAt = run.generatedAt;
  }
  return { publishedAt, updatedAt };
}

function summaryOf(snapshot, jsonUrl) {
  const { coverage, methodology } = snapshot;
  return [
    snapshot.mode === 'demo' ? '设计示例，非真实榜单。' : '已发布的每日综合热歌榜快照。',
    `覆盖 ${coverage.available}/${coverage.expected} 平台、${coverage.groups}/${coverage.groupTotal} 来源组（${coverage.status}）；方法 ${methodology.version}。`,
    ...(coverage.cached ? [`其中 ${coverage.cached} 个平台沿用有效窗口内的历史观察；来源时间和失败原因保存在 JSON。`] : []),
    ...snapshot.songs.slice(0, 10).map(song => `${song.rank}. ${song.title} — ${song.artists.join(' / ')} · ${song.score.toFixed(2)} 分`),
    `完整 JSON：${jsonUrl}`,
  ].join('\n');
}

const weeklyLabels = { provisional: '本周预览', complete: '完整周榜', incomplete: '缺日周榜' };
const monthlyLabels = { provisional: '本月预览', complete: '完整月榜', incomplete: '缺日月榜' };
const topTen = snapshot => snapshot.songs.slice(0, 10).map(({ rank, id, title, artists, score }) => ({ rank, id, title, artists, score }));

export async function buildFeed({ dist, dataDirectory, snapshot, weeks = [], months = [], days: publishedDays = [], siteUrl, hubUrl }) {
  siteUrl = resolveSiteURL(siteUrl);
  hubUrl = resolveHubURL(hubUrl);
  const feedUrl = `${siteUrl}/feed.xml`;
  const jsonFeedUrl = `${siteUrl}/feed.json`;
  const { dates } = await readJSON(resolve(dataDirectory, 'dates.json'));
  const days = new Map();
  async function dayWithTimes(date) {
    if (!days.has(date)) {
      const day = publishedDays.find(day => day.date === date) ?? (date === snapshot.date ? snapshot : await readJSON(resolve(dataDirectory, 'daily', `${date}.json`)));
      const revision = revisionOf(day);
      days.set(date, { day, revision, ...await revisionTimes(day, revision, dataDirectory) });
    }
    return days.get(date);
  }
  const entries = [];
  for (const date of dates.slice(0, 30)) {
    const { day, revision, publishedAt, updatedAt } = await dayWithTimes(date);
    const jsonUrl = `${siteUrl}/api/v1/charts/${date}.json`;
    entries.push({
      id: entryID(siteUrl, day), kind: 'daily', date, mode: day.mode, revision, publishedAt, updatedAt,
      title: `${day.mode === 'demo' ? '【示例】' : ''}共振 · ${date} 综合热歌榜`,
      jsonUrl, coverage: day.coverage, methodologyVersion: day.methodology.version,
      topTen: topTen(day),
      summary: summaryOf(day, jsonUrl),
    });
  }
  const publishable = charts => charts.filter(chart => chart.coverage.observedDays > 0 && chart.songs.length);
  for (const week of [...publishable(weeks).slice(0, 8), ...publishable(months).slice(0, 6)]) {
    const monthly = Boolean(week.month);
    const start = monthly ? week.monthStart : week.weekStart;
    const end = monthly ? week.monthEnd : week.weekEnd;
    const kind = monthly ? 'monthly' : 'weekly';
    const label = (monthly ? monthlyLabels : weeklyLabels)[week.status];
    const cachedDates = week.coverage.cachedDates ?? [];
    const included = await Promise.all(week.coverage.includedDates.map(dayWithTimes));
    const publishedAt = included.map(day => day.publishedAt).sort()[0];
    const times = included.map(day => day.updatedAt);
    const previousDate = new Date(`${start}T00:00:00Z`);
    if (monthly) previousDate.setUTCMonth(previousDate.getUTCMonth() - 1);
    else previousDate.setUTCDate(previousDate.getUTCDate() - 7);
    const previousStart = previousDate.toISOString().slice(0, 10);
    const previousWeek = (monthly ? months : weeks).find(candidate => (monthly ? candidate.monthStart : candidate.weekStart) === previousStart);
    // Period movement also depends on the adjacent previous period's comparability.
    const dependencyDates = new Set([
      ...week.coverage.excludedDates.map(item => item.date),
      ...(previousWeek?.coverage.includedDates ?? []),
      ...(previousWeek?.coverage.excludedDates ?? []).map(item => item.date),
    ]);
    const dependencies = await Promise.all([...dependencyDates].map(dayWithTimes));
    times.push(...dependencies.map(day => day.updatedAt));
    // Finalization is the next period's 00:00 Asia/Shanghai, not build time.
    if (week.status !== 'provisional') times.push(new Date(Date.parse(`${end}T00:00:00+08:00`) + 86_400_000).toISOString());
    const updatedAt = times.sort().at(-1);
    const jsonUrl = `${siteUrl}/api/v1/${kind}/${monthly ? week.month : start}.json`;
    const songs = topTen(week);
    const baseVersions = week.methodology.baseVersions ?? [week.methodology.baseVersion];
    entries.push({
      id: entryID(siteUrl, week), kind,
      ...(monthly ? { month: week.month, monthStart: start, monthEnd: end } : { weekStart: start, weekEnd: end }),
      mode: week.mode, status: week.status, revision: revisionOf(week), publishedAt, updatedAt,
      title: `${week.mode === 'demo' ? '【示例】' : ''}共振 · ${start}—${end} ${label}`,
      jsonUrl, coverage: week.coverage, methodologyVersion: week.methodology.version,
      baseMethodologyVersion: week.methodology.baseVersion, baseMethodologyVersions: baseVersions, topTen: songs,
      summary: [
        `${week.mode === 'demo' ? '设计示例，非真实榜单。' : ''}${label}：${start}—${end}。`,
        `有效 ${week.coverage.observedDays}/${week.coverage.expectedDays} 天；${week.coverage.missingDates.length} 天无日快照（含尚未来到的日期），排除 ${week.coverage.excludedDates.length} 天；方法 ${week.methodology.version}（日榜 ${baseVersions.join('、')}）。`,
        ...(week.methodology.aggregationPolicy === 'each-day-original-method' ? ['各有效日按当时保存的公式计分，公式升级前的历史日期继续参与汇总。'] : []),
        ...(cachedDates.length ? [`其中 ${cachedDates.length} 个有效日使用了平台历史观察：${cachedDates.join('、')}。`] : []),
        ...songs.map(song => `${song.rank}. ${song.title} — ${song.artists.join(' / ')} · ${song.score.toFixed(2)} 分`),
        `完整 JSON：${jsonUrl}`,
      ].join('\n'),
    });
  }
  entries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
  const updatedAt = entries.map(entry => entry.updatedAt).sort().at(-1) ?? snapshot.generatedAt;
  const revision = digest({ siteUrl, hubUrl, entries: entries.map(entry => ({ id: entry.id, revision: entry.revision })) });
  const manifest = { schemaVersion: 1, mode: snapshot.mode, date: snapshot.date, revision, updatedAt, siteUrl, feedUrl, jsonFeedUrl, hubUrl, entries };
  const atom = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="zh-CN">
  <id>${escapeXML(feedUrl)}</id>
  <title>共振 · 中国音乐综合热歌榜${snapshot.mode === 'demo' ? '（设计示例）' : ''}</title>
  <subtitle>每日综合榜、每周与每月汇总、Top 10 摘要、覆盖范围与公开计算方法。</subtitle>
  <updated>${escapeXML(updatedAt)}</updated>
  <author><name>共振 RESONANCE</name><uri>${escapeXML(siteUrl)}</uri></author>
  <link rel="self" type="application/atom+xml" href="${escapeXML(feedUrl)}"/>
  <link rel="alternate" type="text/html" href="${escapeXML(siteUrl)}/"/>
  ${hubUrl ? `<link rel="hub" href="${escapeXML(hubUrl)}"/>` : ''}
${entries.map(entry => `  <entry>
    <id>${escapeXML(entry.id)}</id>
    <title>${escapeXML(entry.title)}</title>
    <published>${escapeXML(entry.publishedAt)}</published>
    <updated>${escapeXML(entry.updatedAt)}</updated>
    <link rel="alternate" type="application/json" href="${escapeXML(entry.jsonUrl)}"/>
    <category term="${escapeXML(entry.mode)}"/>
    <category term="${entry.kind}"/>
    <summary type="text">${escapeXML(entry.summary)}</summary>
    <content type="text">${escapeXML(entry.summary)}</content>
  </entry>`).join('\n')}
</feed>
`;
  const jsonFeed = {
    version: 'https://jsonfeed.org/version/1.1',
    title: `共振 · 中国音乐综合热歌榜${snapshot.mode === 'demo' ? '（设计示例）' : ''}`,
    home_page_url: `${siteUrl}/`, feed_url: jsonFeedUrl,
    description: '最近 30 个已发布日期、8 周与 6 个月汇总；同一期修订保持相同条目 ID，只有内容变化才更新。',
    language: 'zh-CN', authors: [{ name: '共振 RESONANCE', url: siteUrl }],
    items: entries.map(entry => ({
      id: entry.id, url: entry.jsonUrl, title: entry.title,
      content_text: entry.summary, date_published: entry.publishedAt, date_modified: entry.updatedAt,
      tags: [entry.mode, entry.kind, entry.status ?? entry.coverage.status],
      _resonance: { kind: entry.kind, date: entry.date, weekStart: entry.weekStart, weekEnd: entry.weekEnd, month: entry.month, monthStart: entry.monthStart, monthEnd: entry.monthEnd, status: entry.status, revision: entry.revision, methodologyVersion: entry.methodologyVersion, baseMethodologyVersion: entry.baseMethodologyVersion, baseMethodologyVersions: entry.baseMethodologyVersions, coverage: entry.coverage, jsonUrl: entry.jsonUrl },
    })),
  };
  await mkdir(resolve(dist, 'api/v1'), { recursive: true });
  await Promise.all([
    writeFile(resolve(dist, 'feed.xml'), atom),
    writeFile(resolve(dist, 'feed.json'), `${JSON.stringify(jsonFeed, null, 2)}\n`),
    writeFile(resolve(dist, 'api/v1/updates.json'), `${JSON.stringify(manifest, null, 2)}\n`),
  ]);
  return manifest;
}
