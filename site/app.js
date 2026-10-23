const $ = (selector) => document.querySelector(selector);
const colors = { qq: '#28885d', netease: '#ca4542', kugou: '#377eb2', kuwo: '#a17b21', apple: '#cf5264', qishui: '#684792' };
const initials = { qq: 'Q', netease: '网', kugou: '狗', kuwo: '我', apple: 'A', qishui: '汽' };
const shortNames = { qq: 'QQ 音乐', netease: '网易云', kugou: '酷狗', kuwo: '酷我', apple: 'Apple Music', qishui: '汽水' };
const state = { snapshot: null, latest: null, status: null, dates: [], mode: 'combined', platform: 'all', search: '', limit: 20, request: 0, apiPlatform: null, weekly: null, weeklyIndex: null, weeklySearch: '', weeklyLimit: 20, weeklyRequest: 0, platformIndexes: {}, platformSnapshot: null };
const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const safeURL = (value) => {
  if (!value) return null;
  const url = new URL(value, window.location.href);
  return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
};
const artistName = (song) => song.artists.join(' / ');
const number = (value, digits = 1) => Number(value).toFixed(digits);
const platformColor = (id) => colors[id];
const dateTime = (value) => value ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)) : '未提供';
const currentSource = (id) => state.snapshot.sources.find((source) => source.id === id);
const chartSource = () => state.platformSnapshot ?? { ...currentSource(state.platform), date: state.snapshot.date, mode: state.snapshot.mode };
const entryKey = entry => entry.sourceId ?? `rank:${entry.rank}`;
const mvBadge = (platforms) => platforms.some(platform => platform.mv?.status === 'linked') ? '<span class="song-mv-badge">MV</span>' : '';

function openSongDialog() {
  $('#song-dialog').showModal();
  $('#song-dialog').scrollTop = 0;
}

function renderDatePicker() {
  const platform = state.mode === 'platform';
  const dates = platform ? state.platformIndexes[state.platform]?.dates ?? [state.snapshot.date] : state.dates;
  const selected = platform ? chartSource().date : state.snapshot.date;
  const editions = platform ? state.platformIndexes[state.platform]?.editions ?? [] : [];
  $('#date-select').innerHTML = dates.map(date => `<option value="${date}" ${date === selected ? 'selected' : ''}>${date}${editions.find(item => item.date === date)?.observationType === 'archived-snapshot' ? ' · 第三方存档' : ''}${date === dates[0] ? ' · 最新' : ''}</option>`).join('');
}

async function loadPlatform(date = state.snapshot.date) {
  const request = ++state.request;
  const id = state.platform;
  $('#chart-rows').innerHTML = '<div class="empty-state">正在读取平台原榜…</div>';
  try {
    const index = state.platformIndexes[id] ?? await readJSON(`./api/v1/platforms/${id}/index.json`);
    const source = await readJSON(`./api/v1/platforms/${id}/${date}.json`);
    const snapshot = !state.dates.includes(date) ? null : date === state.latest.date ? state.latest : date === state.snapshot.date ? state.snapshot : await readJSON(`./data/daily/${date}.json`);
    if (request !== state.request) return;
    if (snapshot) state.snapshot = snapshot;
    state.platformIndexes[id] = index;
    state.platformSnapshot = source;
    state.limit = 20;
    renderAll();
  } catch (error) {
    if (request !== state.request) return;
    console.error('Platform edition could not be loaded.', error);
    renderDatePicker();
    $('#chart-rows').innerHTML = '<div class="empty-state"><b>这一期平台原榜暂时无法读取。</b>请选择其他日期，或稍后刷新。</div>';
  }
}
const sourceLink = (url, text, className = '') => {
  const href = safeURL(url);
  return href ? `<a class="${className}" href="${escapeHTML(href)}" target="_blank" rel="noopener noreferrer">${text}</a>` : `<span>${text.replace(' ↗', '')}</span>`;
};

function historicalContext(source) {
  const archive = source.provenance;
  if (!archive) return `榜期 ${escapeHTML(source.sourcePeriod || '未提供')} · 实际读取 ${dateTime(source.fetchedAt)} CST。${source.ingestion === 'backfill' ? `历史回填，不参与综合榜计分。${source.missingRanks?.length ? `保存 ${source.count} 首；源响应缺少第 ${source.missingRanks.join('、')} 名，保留缺号。` : ''}` : '上期不一定是昨日；未记录与无变化分开标识。'}`;
  const observed = !archive.observedAt ? '未提供精确时刻' : archive.observedTimeZone === null ? `${escapeHTML(archive.observedAt)}（时区未记录）` : `${dateTime(archive.observedAt)} CST`;
  const times = [source.sourceUpdatedAt ? `源 RSS 时间 ${dateTime(source.sourceUpdatedAt)} CST` : '', archive.committedAt ? `存档提交 ${dateTime(archive.committedAt)} CST` : '', `本次读取 ${dateTime(source.fetchedAt)} CST`].filter(Boolean).join(' · ');
  return `第三方历史存档 · ${sourceLink(archive.url, `${escapeHTML(archive.publisher)} ↗`)}${archive.samplingPeriod === 'weekly' ? ' · 每周保存的 RSS 快照，非官方周榜' : ''}<br>${archive.dateBasis === 'rss-updated-at' ? '源 RSS 日期' : '原记录日期'} ${escapeHTML(source.date)} · 原始采集 ${observed}<br>${times}。以上时间不代表平台发榜时间；不参与综合榜计分。`;
}

async function readJSON(path) {
  const response = await fetch(path, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`${path} · HTTP ${response.status}`);
  return response.json();
}

const weekStatusLabels = { provisional: '周预览', complete: '完整周', incomplete: '数据不完整' };

function datesInWeek(weekStart) {
  const monday = new Date(`${weekStart}T00:00:00Z`);
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(monday);
    day.setUTCDate(day.getUTCDate() + index);
    return day.toISOString().slice(0, 10);
  });
}

function weeklyDayInfo(week, date) {
  if (week.coverage.includedDates.includes(date)) return { type: 'included', label: '已纳入', reason: '本日快照有效，计入周均分。' };
  const excluded = week.coverage.excludedDates.find((item) => item.date === date);
  if (excluded) return { type: 'excluded', label: '已排除', reason: excluded.reason };
  if (date > week.asOfDate) return { type: 'future', label: '尚未到来', reason: '本周尚未到来的日期不参与计算。' };
  return { type: 'missing', label: '缺失', reason: '本日未取得可纳入的日快照。' };
}

function weeklyChange(song, compact = true) {
  const movement = song.weeklyMovement;
  if (!state.weekly.coverage.comparisonAvailable) return `<span class="${compact ? 'rank-change' : 'source-movement'} unknown" title="仅相邻两个完整周且计算口径相同时比较">${compact ? '—' : '暂无可比的完整上周'}</span>`;
  const info = sourceMovementInfo(movement);
  return `<span class="${compact ? 'rank-change' : 'source-movement'} ${info.tone}" title="综合周榜较上周：${info.label}">${compact ? info.compact : info.label}</span>`;
}

function weeklyScoreBars(song, week) {
  const scores = new Map(song.dailyScores.map((day) => [day.date, day.score]));
  return `<span class="weekly-score-bars" role="img" aria-label="${escapeHTML(song.dailyScores.map((day) => `${day.date} ${number(day.score, 2)} 分`).join('，'))}">${datesInWeek(week.weekStart).map((date) => {
    const day = weeklyDayInfo(week, date);
    const score = scores.get(date);
    return `<span class="weekly-score-day ${day.type}" title="${date} · ${score === undefined ? day.label : `${number(score, 2)} 分`}">${score === undefined ? '' : `<i style="height:${Math.max(score > 0 ? 4 : 0, Math.min(100, score))}%"></i>`}</span>`;
  }).join('')}</span>`;
}

function renderWeeklyRows() {
  const week = state.weekly;
  const search = state.weeklySearch.trim().toLocaleLowerCase();
  const songs = week.songs.filter((song) => !search || `${song.title} ${artistName(song)}`.toLocaleLowerCase().includes(search));
  const visible = songs.slice(0, state.weeklyLimit);
  $('#weekly-rows').innerHTML = visible.length ? visible.map((song) => `<button class="chart-row weekly-row" data-weekly-song="${escapeHTML(song.id)}" aria-label="周榜第 ${song.rank} 名 ${escapeHTML(song.title)}，周均 ${number(song.score, 2)} 分，查看按日得分"><span class="rank-cell"><span class="rank-number">${String(song.rank).padStart(2, '0')}</span>${weeklyChange(song)}</span><span class="song-cell">${cover(song)}<span class="song-info"><span class="song-title" style="display:block">${escapeHTML(song.title)}${mvBadge(song.platforms)}</span><span class="song-artists" style="display:block">${escapeHTML(artistName(song))}</span><span class="weekly-platforms">${platformBadges(song.platforms)}</span><span class="weekly-mobile-days">${song.daysOnChart} / ${week.coverage.observedDays} 个有效日有得分</span></span></span><span class="weekly-days-cell"><b>${song.daysOnChart}</b><span> / ${week.coverage.observedDays} 个有效日</span></span><span class="weekly-bars-cell">${weeklyScoreBars(song, week)}</span><span class="score-cell"><span class="score-value">${number(song.score, 2)}</span><span class="score-bar"><i style="--score-width:${Math.max(0, Math.min(100, song.score))}%"></i></span></span></button>`).join('') : `<div class="empty-state"><b>${search ? '这一周，还没找到这首歌。' : '这一周还没有可发布的歌曲。'}</b>${search ? '换一个歌名或歌手试试。' : '有效日数据积累后，周榜会逐步形成。'}</div>`;
  $('#weekly-result-count').textContent = `${weekStatusLabels[week.status]} · 显示 ${visible.length} / ${songs.length} 首`;
  $('#weekly-more').hidden = state.weeklyLimit >= songs.length;
  $('#weekly-more').textContent = `再看 ${Math.min(30, songs.length - state.weeklyLimit)} 首 ↓`;
}

function renderWeekly() {
  const week = state.weekly;
  const coverage = week.coverage;
  const missing = coverage.missingDates.filter((date) => date <= week.asOfDate);
  const future = datesInWeek(week.weekStart).filter((date) => date > week.asOfDate);
  const sourceCoverage = coverage.sourceCoverage;
  const weeklyFormulaText = coverage.observedDays ? `周分 = 同口径有效日综合得分之和 ÷ ${coverage.observedDays} 个有效日。` : '尚无有效日，暂不计算周分。';
  const statusExplanation = week.status === 'complete'
    ? '7 个自然日均有同一计算口径的有效快照。'
    : week.status === 'provisional'
      ? `本周尚未结束，目前只使用 ${coverage.observedDays} 个有效日；这是动态预览，不是完整周结果。`
      : `本周已结束，但只取得 ${coverage.observedDays} 个同口径有效日；缺失或被排除的日期没有补值。`;
  $('#weekly-content').innerHTML = `<div class="weekly-summary"><div><span class="weekly-status ${week.status}">${weekStatusLabels[week.status]}</span><h2>${week.weekStart} <span>—</span> ${week.weekEnd}</h2><p>北京时间 · 周一至周日 · 截至 ${week.asOfDate}</p></div><div class="weekly-observed"><b>${coverage.observedDays}<span> / ${coverage.expectedDays}</span></b><p>有效日</p></div></div><div class="weekly-source-coverage"><span>平台来源覆盖 <b>${sourceCoverage ? `${sourceCoverage.available} / ${sourceCoverage.expected}` : '尚无有效日'}</b>${sourceCoverage ? ` · ${sourceCoverage.groups} / ${sourceCoverage.groupTotal} 个独立来源组` : ''}</span><span>最新纳入 ${coverage.latestIncludedDate || '—'}</span></div><div class="weekly-notice ${week.status}" role="status">${week.mode === 'demo' ? '<b>演示数据</b> 本期仅用于展示，不能作为真实榜单。<br>' : ''}${statusExplanation}${sourceCoverage && sourceCoverage.status !== 'complete' ? `<br><strong>平台覆盖仍不完整：</strong>所选口径纳入 ${sourceCoverage.available} / ${sourceCoverage.expected} 个来源；7 天齐全不等于所有平台齐全。` : ''}</div><div class="weekly-coverage"><div class="weekly-coverage-heading"><h3>这一周，记录到了哪些日子</h3><p>${missing.length} 天缺失 · ${coverage.excludedDates.length} 天排除${future.length ? ` · ${future.length} 天尚未来临` : ''}</p></div><div class="weekly-calendar">${datesInWeek(week.weekStart).map((date, index) => { const day = weeklyDayInfo(week, date); return `<div class="weekly-calendar-day ${day.type}" title="${escapeHTML(day.reason)}"><span>周${'一二三四五六日'[index]}</span><b>${date.slice(5).replace('-', '.')}</b><small>${day.label}</small></div>`; }).join('')}</div>${missing.length || coverage.excludedDates.length ? `<details class="weekly-exclusions"><summary>查看缺失与排除原因</summary><ul>${missing.map((date) => `<li><time>${date}</time><span>未取得日快照，不计入平均分。</span></li>`).join('')}${coverage.excludedDates.map((item) => `<li><time>${escapeHTML(item.date)}</time><span>${escapeHTML(item.reason)}</span></li>`).join('')}</ul></details>` : ''}</div><div class="weekly-controls"><label class="weekly-picker">选择周区间<select id="weekly-select" aria-label="选择综合周榜日期">${state.weeklyIndex.weeks.map((item) => `<option value="${item.weekStart}" ${item.weekStart === week.weekStart ? 'selected' : ''}>${item.weekStart} — ${item.weekEnd} · ${weekStatusLabels[item.status]}</option>`).join('')}</select></label><label class="search-box"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5"/><path d="m13 13 4 4"/></svg><input id="weekly-search" type="search" placeholder="搜索本周歌曲 / 歌手" value="${escapeHTML(state.weeklySearch)}" aria-label="搜索周榜歌曲或歌手" autocomplete="off"></label></div><p class="chart-context">${weeklyFormulaText}有效日未出现的歌曲记 0，缺失日不填充。涨跌只比较相邻两个完整周。</p><div class="table-head weekly-table-head" aria-hidden="true"><span>周排名</span><span>歌曲 / 艺人</span><span>有得分的日数</span><span>本周每日分值</span><span>周均指数</span></div><div id="weekly-rows" class="chart-rows" aria-live="polite"></div><div class="chart-bottom"><p id="weekly-result-count"></p><button id="weekly-more" class="outline-button" hidden></button><a class="text-link" href="./data/weekly/${week.weekStart}.json" download>本周 JSON ↗</a></div><div class="weekly-method-note"><h3>一周的分量，从每天算起。</h3><p>每个自然日仅计一次，使用日榜完整候选池的综合分数，不截取每日 Top 100 再平均。计算口径不同的日期单独排除。只有相邻两周都完整、且口径一致，才显示“较上周”；周预览和数据不完整的周不会制造涨跌。</p><p class="weekly-formula">${escapeHTML(week.methodology.formula)}</p><p>周榜方法版本 ${escapeHTML(week.methodology.version)} · 日榜版本 ${escapeHTML(week.methodology.baseVersion || '尚无可选口径')} · 生成于 ${dateTime(week.generatedAt)} CST · <a href="#api">开放周榜 API ↗</a></p></div>`;
  renderWeeklyRows();
}

async function loadWeekly(weekStart) {
  const request = ++state.weeklyRequest;
  const oldWeek = state.weekly;
  $('#weekly-rows').innerHTML = '<div class="empty-state">正在读取这一周的音乐切片…</div>';
  try {
    const week = await readJSON(`./data/weekly/${weekStart}.json`);
    if (request !== state.weeklyRequest) return;
    state.weekly = week;
    state.weeklyLimit = 20;
    renderWeekly();
    if (state.snapshot) renderAPI();
  } catch (error) {
    if (request !== state.weeklyRequest) return;
    console.error('Weekly chart could not be loaded.', error);
    $('#weekly-select').value = oldWeek.weekStart;
    $('#weekly-rows').innerHTML = '<div class="empty-state"><b>这一周暂时无法读取。</b>请选择其他周区间，或稍后刷新。</div>';
  }
}

async function initializeWeekly() {
  try {
    const index = await readJSON('./data/weekly/index.json');
    state.weeklyIndex = index;
    if (index.latest === null) {
      $('#weekly-content').innerHTML = '<div class="empty-state"><b>一周的回响，正在积累。</b>暂时没有可聚合的有效日快照。日榜仍可照常浏览。</div>';
      return;
    }
    state.weekly = await readJSON('./data/weekly/latest.json');
    renderWeekly();
    if (state.snapshot) renderAPI();
  } catch (error) {
    console.error('Weekly data could not be loaded.', error);
    $('#weekly-content').innerHTML = '<div class="error-panel"><h2>周榜数据暂时无法读取。</h2><p>请稍后刷新；日榜与平台原榜仍可单独浏览。</p></div>';
  }
}

function showWeeklySong(id) {
  const week = state.weekly;
  const song = week.songs.find((item) => item.id === id);
  const scores = new Map(song.dailyScores.map((day) => [day.date, day.score]));
  $('#song-detail').innerHTML = `<div class="detail-top"><p class="detail-kicker">RESONANCE / WEEKLY SONG PROFILE${week.mode === 'demo' ? ' · DEMO' : ''}</p><div class="detail-heading">${cover(song)}<div><h2 id="song-dialog-title">${escapeHTML(song.title)}</h2><p>${escapeHTML(artistName(song))}</p></div></div><div class="detail-stats"><div class="detail-stat"><b>#${song.rank}</b><span>本周综合名次</span></div><div class="detail-stat"><b>${number(song.score, 2)}</b><span>有效日平均分</span></div><div class="detail-stat"><b>${song.daysOnChart} / ${week.coverage.observedDays}</b><span>有得分的有效日</span></div></div><p class="detail-combined-movement">综合周榜较上周 ${weeklyChange(song, false)}</p></div><div class="detail-body"><h3>本周的平台信号与 MV</h3><p class="weekly-detail-note">以下为各平台在本周有效日中的最近一次观察，具体日期单独标注；原榜较上期与综合周榜较上周分别展示。</p>${song.platforms.map(platform => `<div class="detail-platform"><span style="--platform-color:${platformColor(platform.id)}"><i class="platform-dot"></i>${escapeHTML(platform.name)}<small>最近观察 ${platform.observedDate}${platform.eligible ? '' : ' · 当日仅原榜展示'}</small></span><strong>#${platform.rank}</strong>${sourceLink(platform.url, '去听这首 ↗')}<div class="detail-source-metadata"><span class="source-movement-label">较原榜上期：${sourceChange(platform.sourceMovement, false)}</span><span class="detail-mv">${mvDetails(platform.mv)}</span></div></div>`).join('')}<h3 class="weekly-scores-heading">${week.weekStart} — ${week.weekEnd} · ${weekStatusLabels[week.status]}</h3><p class="weekly-detail-note">以下为综合日分值，不是原平台名次；缺失或排除日不参与平均。</p><div class="weekly-daily-scores">${datesInWeek(week.weekStart).map((date) => { const day = weeklyDayInfo(week, date); const score = scores.get(date); return `<div class="weekly-daily-score ${day.type}"><time>${date}</time><span class="weekly-daily-track">${score === undefined ? `<span>${day.label}</span>` : `<i style="width:${Math.max(0, Math.min(100, score))}%"></i>`}</span><strong>${score === undefined ? '—' : number(score, 2)}</strong></div>`; }).join('')}</div><p class="detail-explanation">纳入 ${week.coverage.observedDays} 个有效日。有效日未出现该歌曲，记 0 分；缺失与排除日没有补成 0。${week.status === 'complete' ? '本周数据完整。' : '当前并非完整周结果，请结合覆盖情况阅读。'}</p></div>`;
  openSongDialog();
}

function cover(song, extraClass = '') {
  let hash = 0;
  for (const character of song.title) hash = (hash * 31 + character.codePointAt(0)) >>> 0;
  const hue = hash % 360;
  const artwork = safeURL(song.artwork);
  return `<span class="cover ${extraClass}" style="--cover-bg:hsl(${hue} 19% 37%)" aria-hidden="true"><span>${escapeHTML([...song.title][0])}</span>${artwork ? `<img src="${escapeHTML(artwork)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}</span>`;
}

function trend(history, expanded = false) {
  const points = [...history].sort((a, b) => a.date.localeCompare(b.date)).slice(-7);
  if (points.length < 2) return '<span class="history-pending">等待趋势积累</span>';
  const width = expanded ? 500 : 92;
  const height = expanded ? 65 : 27;
  const ranks = points.map((point) => point.rank);
  const minimum = Math.min(...ranks);
  const maximum = Math.max(...ranks);
  const coordinates = points.map((point, index) => {
    const x = 3 + index * (width - 6) / (points.length - 1);
    const y = maximum === minimum ? height / 2 : 4 + (point.rank - minimum) / (maximum - minimum) * (height - 8);
    return [x, y];
  });
  const final = coordinates.at(-1);
  const description = points.map((point) => `${point.date} 第${point.rank}名`).join('，');
  return `<svg class="sparkline" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHTML(description)}"><line class="spark-axis" x1="0" y1="${height - 2}" x2="${width}" y2="${height - 2}"/><polyline points="${coordinates.map((coordinate) => coordinate.join(',')).join(' ')}"/><circle cx="${final[0]}" cy="${final[1]}" r="2"/></svg>`;
}

function change(song) {
  if (!state.snapshot.coverage.comparisonAvailable) return '<span class="rank-change same" title="综合榜暂无可比的昨日数据">—</span>';
  if (song.previousRank === null) return '<span class="rank-change new" title="综合榜较昨日：新上榜">NEW</span>';
  if (song.delta === null) return '<span class="rank-change same" title="综合榜较昨日：未记录">—</span>';
  if (song.delta === 0) return '<span class="rank-change same" title="综合榜较昨日：排名不变">—</span>';
  return `<span class="rank-change ${song.delta > 0 ? 'up' : 'down'}" title="综合榜较昨日${song.delta > 0 ? '上升' : '下降'} ${Math.abs(song.delta)} 名">${song.delta > 0 ? '↑' : '↓'}${Math.abs(song.delta)}</span>`;
}

function sourceMovementInfo(movement) {
  if (!movement) return { label: '未记录', compact: '—', tone: 'unknown' };
  if (movement.direction === 'unknown') return { label: '待确认 / 未提供', compact: '—', tone: 'unknown' };
  if (movement.direction === 'new') return { label: '新上榜', compact: 'NEW', tone: 'new' };
  if (movement.direction === 'same') return { label: '排名不变', compact: '—', tone: 'same' };
  const up = movement.direction === 'up';
  const distance = movement.delta === null ? '' : String(Math.abs(movement.delta));
  return { label: `${up ? '上升' : '下降'}${distance ? ` ${distance} 名` : ''}`, compact: `${up ? '↑' : '↓'}${distance}`, tone: up ? 'up' : 'down' };
}

function sourceChange(movement, compact = true) {
  const info = sourceMovementInfo(movement);
  return `<span class="${compact ? 'rank-change' : 'source-movement'} ${info.tone}" title="较原榜上期：${info.label}">${compact ? info.compact : info.label}</span>`;
}

function mvLabel(mv) {
  if (!mv) return 'MV 未记录';
  if (mv.status === 'linked') return '已关联 MV';
  if (mv.status === 'none') return '未关联 MV';
  return 'MV 未确认';
}

function mvDetails(mv) {
  const links = mv?.status === 'linked' ? mv.items.filter((item) => item.url).map((item, index) => sourceLink(item.url, `观看 MV${mv.items.length > 1 ? ` ${index + 1}` : ''} ↗`, 'mv-watch-link')).join('') : '';
  const identifiers = mv?.status === 'linked' ? mv.items.map((item) => item.id ? `ID ${item.id}` : item.hash ? `Hash ${item.hash}` : '').filter(Boolean) : [];
  return `<span class="mv-status ${mv?.status === 'linked' ? 'linked' : ''}">${mvLabel(mv)}</span>${links}${identifiers.length ? `<span class="mv-identifiers">${escapeHTML(identifiers.join(' · '))}</span>` : ''}`;
}

function platformBadges(platforms) {
  return platforms.slice(0, 6).map((platform) => `<span class="platform-rank" style="--platform-color:${platformColor(platform.id)}" title="${escapeHTML(platform.name)} 第 ${platform.rank} 名"><b>${initials[platform.id]}</b>${platform.rank}</span>`).join('');
}

function isLatest() { return state.snapshot === state.latest; }
function visibleLedger() { return isLatest() && state.status ? state.status.sources : state.snapshot.sources; }

function renderNotice() {
  const snapshot = state.snapshot;
  const notice = $('#data-notice');
  const messages = [];
  if (snapshot.mode === 'demo') messages.push('<b>演示数据</b> 当前歌曲、名次和走势仅用于展示产品与计算方式，不是真实采集榜单。');
  if (isLatest() && state.status && !state.status.published) messages.push(`<b>最近采集未发布</b> ${escapeHTML(state.status.date)} 的有效来源不足，当前保留 ${escapeHTML(snapshot.date)} 的榜单。`);
  else if (snapshot.coverage.status !== 'complete') messages.push(`<b>来源覆盖 ${snapshot.coverage.available} / ${snapshot.coverage.expected}</b> 当前仅纳入有效来源；未接入或失败的平台不参与本期指数。`);
  notice.hidden = messages.length === 0;
  notice.innerHTML = messages.join('<br>') + (messages.length ? '<a href="#sources">查看数据状态 ↗</a>' : '');
}

function renderOverview() {
  const snapshot = state.snapshot;
  $('#issue-label').textContent = `${snapshot.date.replaceAll('-', '.')} / ${snapshot.mode === 'demo' ? 'DEMO EDITION' : 'DAILY EDITION'}`;
  $('#platform-count').textContent = `${snapshot.coverage.available} / ${snapshot.coverage.expected}`;
  $('#song-count').textContent = snapshot.songs.length;
  $('#daily-heading').textContent = isLatest() ? '这一期的共同频率' : `${snapshot.date.slice(5).replace('-', ' / ')} 的共同频率`;
  $('#snapshot-time').textContent = `${snapshot.date} · ${snapshot.mode === 'demo' ? '示例快照' : `${dateTime(snapshot.generatedAt).split(' ').at(-1)} CST 采集`}`;
  renderNotice();
  const songs = snapshot.songs;
  if (!songs.length) {
    $('#feature-strip').innerHTML = '<div class="feature"><div class="feature-copy"><p class="feature-eyebrow">AWAITING SIGNAL</p><p class="feature-title">等待足够的独立来源</p><p class="feature-artist">平台原榜仍可查看</p></div></div>';
    return;
  }
  const leader = songs[0];
  const greatest = snapshot.coverage.comparisonAvailable ? [...songs].filter((song) => song.delta !== null && song.delta > 0).sort((a, b) => b.delta - a.delta)[0] : null;
  const consensus = [...songs].sort((a, b) => b.appearances - a.appearances || a.rank - b.rank)[0];
  const second = greatest || songs.find((song) => song.rank > 1) || leader;
  const secondTitle = greatest ? '上升最快 / BIGGEST CLIMBER' : '共同入耳 / IN THE MIX';
  const secondBadge = greatest ? `↑${greatest.delta}<small>综合榜较昨日</small>` : `${second.appearances}<small>个平台上榜</small>`;
  $('#feature-strip').innerHTML = `<article class="feature"><button class="feature-button" data-song-id="${escapeHTML(leader.id)}">${cover(leader, 'feature-art')}<div class="feature-copy"><p class="feature-eyebrow">本期第一 / NO. 01</p><h3 class="feature-title">${escapeHTML(leader.title)}</h3><p class="feature-artist">${escapeHTML(artistName(leader))}</p></div><span class="feature-arrow" aria-hidden="true">↗</span></button></article><article class="feature"><button class="feature-button" data-song-id="${escapeHTML(second.id)}"><div class="feature-copy"><p class="feature-eyebrow">${secondTitle}</p><h3 class="feature-title">${escapeHTML(second.title)}</h3><p class="feature-artist">${escapeHTML(artistName(second))}</p></div><span class="feature-badge">${secondBadge}</span></button></article><article class="feature"><button class="feature-button" data-song-id="${escapeHTML(consensus.id)}"><div class="feature-copy"><p class="feature-eyebrow">跨平台共识 / CROSSOVER</p><h3 class="feature-title">${escapeHTML(consensus.title)}</h3><p class="feature-artist">${escapeHTML(artistName(consensus))}</p></div><span class="feature-badge">${consensus.appearances}<small>个平台上榜</small></span></button></article>`;
}

function renderFilters() {
  const all = state.mode === 'combined' ? '<button class="platform-filter" data-platform="all">全部平台</button>' : '';
  $('#platform-filters').innerHTML = all + state.snapshot.sources.map((source) => `<button class="platform-filter" data-platform="${source.id}" style="--platform-color:${platformColor(source.id)}"><span class="platform-dot" aria-hidden="true"></span>${escapeHTML(shortNames[source.id])}</button>`).join('');
  for (const button of document.querySelectorAll('.platform-filter')) {
    const active = button.dataset.platform === state.platform;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  }
}

function filteredRows() {
  const search = state.search.trim().toLocaleLowerCase();
  const rows = state.mode === 'combined'
    ? state.snapshot.songs.filter((song) => state.platform === 'all' || song.platforms.some((platform) => platform.id === state.platform))
    : chartSource().entries;
  return rows.filter((song) => !search || `${song.title} ${artistName(song)}`.toLocaleLowerCase().includes(search));
}

function renderChart() {
  const combined = state.mode === 'combined';
  $('#feature-strip').hidden = !combined;
  for (const tab of document.querySelectorAll('.chart-tab')) {
    const active = tab.dataset.mode === state.mode;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
  }
  $('#chart-panel').setAttribute('aria-labelledby', combined ? 'combined-tab' : 'platform-tab');
  const headings = document.querySelectorAll('#chart-panel .table-head>span');
  headings[2].textContent = combined ? '平台名次' : '所属平台';
  headings[3].textContent = combined ? '综合榜近 7 期' : '较原榜上期';
  headings[4].textContent = combined ? '共振指数' : 'MV 关联';
  $('#chart-context').textContent = combined ? '涨跌口径：综合榜较昨日。仅在来源覆盖与算法版本可比时显示。' : '涨跌口径：平台原榜较上期，由源站提供。上期不一定是昨日；未记录与无变化分开标识。';
  const rows = filteredRows();
  const visible = rows.slice(0, state.limit);
  if (visible.length) {
    $('#chart-rows').innerHTML = visible.map((entry) => {
      const song = combined ? entry : state.snapshot.songs.find((item) => item.id === entry.songId);
      const source = combined ? null : chartSource();
      const platforms = combined ? entry.platforms : [{ id: source.id, name: source.name, rank: entry.rank }];
      return `<button class="chart-row" data-song-id="${escapeHTML(combined ? entry.id : entry.songId)}" ${combined ? '' : `data-entry-id="${escapeHTML(entryKey(entry))}"`} aria-label="第 ${entry.rank} 名 ${escapeHTML(entry.title)}，${escapeHTML(artistName(entry))}，查看详情"><span class="rank-cell"><span class="rank-number">${String(entry.rank).padStart(2, '0')}</span>${combined ? change(entry) : sourceChange(entry.sourceMovement)}</span><span class="song-cell">${cover(entry)}<span class="song-info"><span class="song-title" style="display:block">${escapeHTML(entry.title)}${mvBadge(combined ? entry.platforms : [entry])}</span><span class="song-artists" style="display:block">${escapeHTML(artistName(entry))}</span>${combined ? '' : `<span class="original-row-context">较原榜上期 · ${sourceMovementInfo(entry.sourceMovement).label}</span>`}</span></span><span class="platform-ranks">${platformBadges(platforms)}</span><span class="trend-cell">${combined ? trend(song.history) : sourceChange(entry.sourceMovement, false)}</span><span class="score-cell">${combined ? `<span class="score-value">${number(entry.score)}</span><span class="score-bar"><i style="--score-width:${Math.max(0, Math.min(100, entry.score))}%"></i></span>` : `<span class="mv-status ${entry.mv?.status === 'linked' ? 'linked' : ''}">${mvLabel(entry.mv)}</span>`}</span></button>`;
    }).join('');
  } else if (state.search) {
    $('#chart-rows').innerHTML = '<div class="empty-state"><b>这个频率，还没有被捕捉到。</b>换一个歌名或歌手试试。</div>';
  } else if (!combined && chartSource().status !== 'ok') {
    const source = chartSource();
    $('#chart-rows').innerHTML = `<div class="empty-state"><b>${escapeHTML(source.name)} · ${source.status === 'disabled' ? '等待接入' : '本次采集失败'}</b>${escapeHTML(source.message || '当前没有可展示的榜单数据。')}<br>${sourceLink(source.sourceUrl, '到平台查看原榜 ↗')}</div>`;
  } else {
    $('#chart-rows').innerHTML = '<div class="empty-state"><b>尚无满足条件的歌曲。</b>切换平台，或等待下一次数据更新。</div>';
  }
  const filterName = state.platform === 'all' ? '跨平台汇总' : currentSource(state.platform).name;
  $('#result-count').textContent = `${filterName} · 显示 ${visible.length} / ${rows.length} 首${combined && state.platform !== 'all' ? ' · 保留综合排名' : ''}`;
  $('#show-more').hidden = state.limit >= rows.length;
  $('#show-more').innerHTML = `再看 ${Math.min(30, rows.length - state.limit)} 首 <span aria-hidden="true">↓</span>`;
  $('#export-button').disabled = rows.length === 0;
  $('#download-json').href = combined ? (isLatest() ? './data/latest.json' : `./data/daily/${state.snapshot.date}.json`) : `./api/v1/platforms/${state.platform}/${chartSource().date}.json`;
  if (!combined) {
    const source = chartSource();
    $('#daily-heading').textContent = `${source.name} · ${source.date}`;
    $('#snapshot-time').textContent = `${source.date} · ${source.observationType === 'archived-snapshot' ? '第三方历史存档' : source.ingestion === 'backfill' ? '历史榜期' : `${dateTime(source.fetchedAt)} CST 采集`}`;
    $('#chart-context').innerHTML = `涨跌口径：平台原榜较上期。${historicalContext(source)}`;
  } else {
    $('#daily-heading').textContent = isLatest() ? '这一期的共同频率' : `${state.snapshot.date.slice(5).replace('-', ' / ')} 的共同频率`;
    $('#snapshot-time').textContent = `${state.snapshot.date} · ${state.snapshot.mode === 'demo' ? '示例快照' : `${dateTime(state.snapshot.generatedAt)} CST 采集`}`;
  }
}

function renderMethod() {
  const snapshot = state.snapshot;
  const active = snapshot.sources.filter((source) => source.status === 'ok');
  const weights = active.map((source) => `<span class="weight-pill">${escapeHTML(source.name)}<b>${number(source.weight * 100, 1)}%</b></span>`).join('');
  $('#method-content').innerHTML = `<section class="method-section"><div class="method-label">01 / THE INPUT<strong>先把尺子统一</strong></div><div class="method-body"><p>每个参与计算的平台必须取得完整前 ${snapshot.methodology.rankDepth} 名，只使用歌曲名次和元数据。平台公布的播放量、热度值、销量含义不同，不能直接相加。共振指数不代表播放量、市场份额，也不代表音乐质量。</p><p>${snapshot.methodology.rankDepth === 50 ? '原榜保留 QQ 音乐、网易云、酷狗、酷我和 Apple Music 的前 100 首，以及汽水的前 50 首；综合榜统一取各平台前 50 名计分，让不同长度的榜单使用同一把尺。汽水热歌榜按周更新，我们每天记录它当时的快照。' : '本期沿用历史版本的计分深度；后续版本的深度调整不会改写这一期的计算依据。'}各平台可能按日、按周或持续更新。我们保留原榜周期与更新时间，不会把一张周榜称作“当日播放榜”。</p></div></section><section class="method-section"><div class="method-label">02 / THE SIGNAL<strong>名次变成信号</strong></div><div class="method-body"><p>排名越靠前，信号越强。指数衰减让头部名次有区分度，10% 的上榜基础分保留长尾歌曲跨平台出现的价值。</p><div class="formula-block">p(r) = 0.9 × e<sup>−(r − 1) / 25</sup> + 0.1<br><em>S = 100 × Σ w<sub>i</sub> × p(r<sub>i</sub>)</em></div><p class="formula-note">r 为源平台名次，w 为本期有效平台权重。未在某平台前 ${snapshot.methodology.rankDepth} 名出现，该平台贡献记为 0。第 1 名的单平台信号为 1，第 26 名约为 0.431。最终得分范围 0–100。</p></div></section><section class="method-section"><div class="method-label">03 / THE BALANCE<strong>相同集团，有限权重</strong></div><div class="method-body"><p>${snapshot.methodology.platformWeights ? '平台基础权重为 QQ 音乐 25%、酷狗 20%、酷我 5%、网易云音乐 30%、Apple Music 10%、汽水音乐 10%。腾讯音乐组三家合计 50%，组内按平台分配。' : '本期沿用按来源组分配、组内健康平台均分的历史计算规则。'}</p><p>${snapshot.methodology.platformWeights ? '来源失败时，剩余平台按各自基础权重整体重新归一化；酷我不会独自承接 QQ 与酷狗的份额。' : '历史版本按有效来源组归一化，再在组内均分。'}权重是一套公开的编辑选择，并非基于各平台用户量推算。</p><div class="weight-list">${weights || '<span class="formula-note">本期尚无可用权重。</span>'}</div><p class="formula-note">上方是 ${escapeHTML(snapshot.date)} 这一期实际使用的权重。不同来源覆盖下的分数不能直接比较。</p></div></section><section class="method-section"><div class="method-label">04 / THE RECORD<strong>一首歌，一个身份</strong></div><div class="method-body"><p>按规范化歌名与艺人组合匹配跨平台歌曲，并支持显式人工映射。Live、Remix、伴奏等版本保留区分；同名不同歌手不自动合并。原平台歌曲 ID 与链接会随记录保留，便于核对。</p><p>无法确认的版本不会仅凭歌名强行视为同一首歌。错误合并可通过项目的人工映射配置修正，并重新计算历史数据。</p></div></section><section class="method-section"><div class="method-label">05 / THE HONESTY<strong>把未知也展示出来</strong></div><div class="method-body"><p>至少有两个独立来源组有效，才发布综合榜。单个平台失败不伪造排名，也不拿上一天的平台数据填充新一期；若整体覆盖不足，保留上一次成功榜单，并单独公布最近采集状态。</p><p>综合榜只有在前后两天的有效平台集合和计算版本一致时，才展示“较昨日”涨跌。平台原榜的“较上期”来自源站，跟随各自发榜周期，不与综合榜涨跌混用。数据缺失或覆盖变化时显示“—”。趋势记录的是综合榜名次，折线向上表示名次改善；不足两期时等待数据积累。</p><p class="formula-note">当前方法版本：${escapeHTML(snapshot.methodology.version)} · 每源深度：${snapshot.methodology.rankDepth} · 本期可用来源：${snapshot.coverage.available} / ${snapshot.coverage.expected} · 独立组：${snapshot.coverage.groups} / ${snapshot.coverage.groupTotal}</p><p class="method-docs"><a href="./docs/methodology.md" target="_blank" rel="noopener">完整方法文档 ↗</a><a href="./docs/sources.md" target="_blank" rel="noopener">来源与更新依据 ↗</a></p></div></section>`;
}

function renderSources() {
  const snapshot = state.snapshot;
  const latestLedger = visibleLedger();
  const labels = { ok: '已取得快照', error: '采集失败', disabled: '等待接入' };
  $('#source-content').innerHTML = latestLedger.map((source) => {
    const demo = snapshot.mode === 'demo' && source.status === 'ok' && (!isLatest() || !state.status || state.status.published);
    const label = demo ? '示例数据' : labels[source.status];
    const statusClass = demo ? 'demo' : source.status === 'error' ? 'failed' : source.status === 'disabled' ? 'unavailable' : '';
    return `<article class="source-row"><div class="source-title"><span class="source-symbol" style="--platform-color:${platformColor(source.id)}" aria-hidden="true">${initials[source.id]}</span><div class="source-name"><h2>${escapeHTML(source.name)}</h2><p>${escapeHTML(source.chartName)}</p></div></div><div class="source-info"><p><strong>更新周期</strong>　${escapeHTML(source.frequency)}</p><p><strong>更新说明</strong>　${escapeHTML(source.updatePolicy)}</p><p><strong>读取方式</strong>　${escapeHTML(source.access)}</p><p><strong>原榜周期</strong>　${escapeHTML(source.sourcePeriod || '源站未提供明确周期')}</p><p><strong>原始榜单</strong>　${sourceLink(source.sourceUrl, '打开官方来源 ↗')}</p>${source.message ? `<p class="${source.status === 'error' ? 'source-error' : 'source-info'}">${escapeHTML(source.message)}</p>` : ''}</div><div class="source-meta"><span class="source-state ${statusClass}">${label}${source.status === 'ok' ? ` · ${source.count} 首` : ''}</span><p class="source-time">采集 ${dateTime(source.fetchedAt)}<br>源站更新 ${dateTime(source.sourceUpdatedAt)}</p></div></article>`;
  }).join('') + `<div class="source-caveat"><p>时间统一展示为北京时间（UTC+8）。源站没有公开准确更新时间时明确保留未知；采集时间不等于平台发榜时间。具体频率与依据见<a href="./docs/sources.md" target="_blank" rel="noopener">数据来源说明 ↗</a>。</p><p>定时任务是每日观察，不保证每次都会有新榜。数据只含榜单及歌曲元信息，收听请跳转至源平台。</p></div>`;
}

function subscriptionSection() {
  const feeds = [
    { path: '/feed.xml', title: 'Atom 订阅', type: 'ATOM / XML', description: '日榜与周榜共用订阅，复制地址添加到 RSS 阅读器即可。' },
    { path: '/feed.json', title: 'JSON Feed', type: 'JSON FEED', description: '适合支持 JSON Feed 的阅读器和你的应用。' },
    { path: '/api/v1/updates.json', title: '机器变更清单', type: 'API / JSON', description: '供程序追踪已发布快照的变化。' },
  ];
  return `<section id="subscribe" class="api-section subscription-section" aria-labelledby="subscription-heading"><div class="api-section-heading"><span class="method-label">05 / STAY IN THE LOOP</span><h2 id="subscription-heading">让新一期，自己来。</h2><p>无需注册。把订阅地址粘贴到 RSS 阅读器，它会定期检查更新；也可以让你的程序读取变更清单。</p></div><div class="subscription-list">${feeds.map((feed) => { const url = `${location.origin}${feed.path}`; return `<article class="subscription-item"><div><span class="subscription-type">${feed.type}</span><h3>${feed.title}</h3><p>${feed.description}</p></div><div class="subscription-address">${sourceLink(url, escapeHTML(url), 'subscription-url')}<button type="button" data-copy-feed="${feed.path}" class="outline-button">复制链接</button></div></article>`; }).join('')}</div><p id="subscription-feedback" class="subscription-feedback" role="status" aria-live="polite"></p><p class="api-help">订阅公开发布的日榜与周榜更新，仍需留意演示标识、周状态与来源覆盖。阅读器轮询即可使用，不需要 API Key 或 Webhook 配置。</p></section>`;
}

function renderAPI() {
  const snapshot = state.snapshot;
  const platformId = state.apiPlatform || snapshot.sources.find((source) => source.status === 'ok')?.id || snapshot.sources[0].id;
  const platform = snapshot.sources.find((source) => source.id === platformId);
  const endpoint = (path) => `${location.origin}/api/v1/${path}`;
  const date = snapshot.date;
  const latestURL = endpoint('charts/latest.json');
  const platformURL = endpoint(`platforms/${platformId}/latest.json`);
  const endpoints = [
    ['接口目录', 'index.json', 'index.json', '版本信息、端点目录与可用资源的入口。'],
    ['最新综合榜', 'charts/latest.json', 'charts/latest.json', '最近一次成功发布的综合榜，包含歌曲、计算方法、覆盖信息和来源摘要。'],
    ['历史综合榜', 'charts/{date}.json', `charts/${date}.json`, `按日期读取综合榜。下方链接使用本页选中的 ${date}。`],
    ['平台最新榜', 'platforms/{id}/latest.json', `platforms/${platformId}/latest.json`, '读取最近一次已发布综合榜附带的平台快照；先检查来源状态，再使用歌曲列表。'],
    ['平台日期目录', 'platforms/{id}/index.json', `platforms/${platformId}/index.json`, '列出该平台可读取的日期、榜期与采集方式；QQ、酷狗包含历史回填。'],
    ['平台历史榜', 'platforms/{id}/{date}.json', `platforms/${platformId}/${date}.json`, '读取平台原榜；日期从该平台 index.json 选择。回填记录单独标明实际读取时间。'],
    ['可用日期', 'dates.json', 'dates.json', '取得已保存的日期，日期格式为 YYYY-MM-DD。'],
    ['采集状态', 'status.json', 'status.json', '最近一次采集是否发布，以及各个来源的状态。'],
    ['计算方法', 'methodology.json', 'methodology.json', '共振指数的版本、权重与计算规则。'],
    ['最新周榜', 'weekly/latest.json', 'weekly/latest.json', '最新综合周榜；必须检查 status 与 observedDays，周预览不等于完整周。'],
    ['周榜目录', 'weekly/index.json', 'weekly/index.json', '可用周区间、状态与有效日数。周区间为北京时间周一至周日。'],
    ['历史周榜', 'weekly/{weekStart}.json', state.weekly ? `weekly/${state.weekly.weekStart}.json` : 'weekly/index.json', state.weekly ? `读取当前选中周 ${state.weekly.weekStart} 的综合周榜。` : '先打开周榜目录获取 weekStart，再替换路径参数。'],
    ['变更清单', 'updates.json', 'updates.json', '供程序读取的发布变更清单；阅读器订阅请使用下方 Atom 或 JSON Feed。'],
  ];
  const curlExample = `curl --fail --silent --show-error '${latestURL}'`;
  const fetchExample = [
    'const response = await fetch(',
    `  '${latestURL}'`,
    ');',
    "if (!response.ok) throw new Error('HTTP ' + response.status);",
    'const chart = await response.json();',
    '',
    '// 使用前先区分演示数据与真实采集',
    "if (chart.mode === 'demo') {",
    "  console.info('当前返回演示数据');",
    '}',
    'console.log(chart.date, chart.coverage);',
    'console.table(chart.songs.map(({ rank, title, artists, score, combinedMovement }) => ({',
    "  rank, title, artists: artists.join(' / '), score,",
    "  combinedChange: combinedMovement?.delta",
    '})));',
  ].join('\n');
  const excerpt = JSON.stringify({ mode: snapshot.mode, date: snapshot.date, generatedAt: snapshot.generatedAt, coverage: { available: snapshot.coverage.available, expected: snapshot.coverage.expected, status: snapshot.coverage.status }, methodology: { version: snapshot.methodology.version, rankDepth: snapshot.methodology.rankDepth } }, null, 2);
  const notice = snapshot.mode === 'demo'
    ? '<b>当前为演示数据</b> 本页快照与 API 示例中的歌曲、名次可能来自演示集。接入时务必读取 mode，不能将 demo 当作真实音乐榜单。'
    : `<b>本页快照 · ${escapeHTML(date)}</b> 有效来源 ${snapshot.coverage.available} / ${snapshot.coverage.expected}。数据覆盖会变化，比较不同日期前请检查 coverage 和计算版本。`;
  const retained = isLatest() && state.status && !state.status.published
    ? `<p class="api-warning">最近一次采集尚未发布新综合榜。latest 保留上次成功数据；请同时读取 ${sourceLink(endpoint('status.json'), 'status.json ↗')}，不要把它当成当日新榜。</p>`
    : '';
  $('#api-content').innerHTML = `
    <div class="api-contract" aria-label="API 基本约定"><span><i>01</i> 无需认证</span><span><i>02</i> GET 请求</span><span><i>03</i> JSON 响应</span><span><i>04</i> 允许跨域</span></div>
    <div class="data-notice api-notice">${notice}</div>
    ${retained}
    <section class="api-section"><div class="api-section-heading"><span class="method-label">01 / THE FIRST REQUEST</span><h2>从一张榜单开始</h2><p>所有链接均来自当前站点，可直接打开，也可从浏览器或脚本中读取。</p></div><div class="api-request"><span class="api-verb">GET</span>${sourceLink(latestURL, escapeHTML(latestURL), 'api-url')}<span class="api-request-arrow" aria-hidden="true">↗</span></div><p class="api-help">静态快照随采集与站点发布更新。接口不执行实时查歌，也不代理音乐平台请求；高频请求不会产生更新的数据。</p></section>
    <section class="api-section"><div class="api-section-heading"><span class="method-label">02 / THE ENDPOINTS</span><h2>一份清晰的目录</h2><p>路径以 <code>/api/v1/</code> 开头。花括号表示需要替换的参数，实际链接已填入本页日期和所选平台。</p></div><div class="api-platform-picker"><label for="api-platform-select">平台示例</label><select id="api-platform-select">${snapshot.sources.map((source) => `<option value="${escapeHTML(source.id)}" ${source.id === platformId ? 'selected' : ''}>${escapeHTML(source.name)} · ${source.id}</option>`).join('')}</select>${sourceLink(platformURL, '打开平台 JSON ↗', 'api-platform-link')}<span>${escapeHTML(platform.chartName)}</span></div><div class="api-endpoints">${endpoints.map(([title, template, path, description]) => `<article class="api-endpoint"><div><span class="api-verb">GET</span><h3>${title}</h3></div><div><a href="${escapeHTML(endpoint(path))}" target="_blank" rel="noopener" class="api-endpoint-path">/api/v1/${escapeHTML(template)} <span aria-hidden="true">↗</span></a><p>${escapeHTML(description)}</p></div></article>`).join('')}</div><p class="api-help">平台 ID：${snapshot.sources.map((source) => `<code>${source.id}</code> ${escapeHTML(source.name)}`).join(' · ')}。只有已保存的日期有对应快照；请先读取 dates.json。</p></section>
    <section class="api-section"><div class="api-section-heading"><span class="method-label">03 / IN YOUR PROJECT</span><h2>复制，再接着创作</h2><p>示例使用当前站点的完整地址，无需 API Key 或额外请求头。</p></div><div class="api-code-grid"><div class="api-code-card"><div class="api-code-heading"><h3>终端</h3><span>cURL</span></div><pre tabindex="0" aria-label="cURL 请求示例"><code>${escapeHTML(curlExample)}</code></pre></div><div class="api-code-card"><div class="api-code-heading"><h3>浏览器 / Node.js</h3><span>FETCH</span></div><pre tabindex="0" aria-label="JavaScript fetch 请求示例"><code>${escapeHTML(fetchExample)}</code></pre></div></div></section>
    <section class="api-section api-reading"><div><div class="api-section-heading"><span class="method-label">04 / READ THE CONTEXT</span><h2>先看语境，再读数字</h2></div><dl class="api-fields"><div><dt>mode</dt><dd><code>demo</code> 为演示；<code>live</code> 为真实采集。</dd></div><div><dt>date / generatedAt</dt><dd>榜单日期和生成时间。采集时间不等于平台发榜时间。</dd></div><div><dt>coverage</dt><dd>实际覆盖与预期来源数。来源缺失会影响权重与可比性。</dd></div><div><dt>methodology</dt><dd>计算版本及规则。算法改变时不直接比较前后分数。</dd></div><div><dt>songs / sources</dt><dd>综合榜歌曲与来源摘要。原平台的完整条目请读对应平台端点。</dd></div><div><dt>combinedMovement / sourceMovement</dt><dd>songs[].combinedMovement 表示综合榜较昨日变化，period 为 previous-day，comparisonDate 为可比较日期；顶层 delta / previousRank 保留兼容。原榜条目的 sourceMovement 表示源站相对上期变化，也保留在 songs[].platforms[]，period 为 previous-edition，不等同于昨日。direction 为 up、down、same、new 或 unknown；delta 正数为升、负数为降，未知时为 null。raw 保留源站证据，未知原榜变化不自行推断。</dd></div><div><dt>weekly：status / coverage</dt><dd>周榜按周一至周日聚合。provisional 是周预览，complete 是完整周，incomplete 表示周已结束但数据不足。coverage 包含 observedDays、includedDates、missingDates 与带原因的 excludedDates；missingDates 也包含尚未到来的日期，须结合 asOfDate 阅读。sourceCoverage 单独记录平台覆盖，7 天齐全不等于所有平台齐全；空周该字段为 null。缺失日不填充。</dd></div><div><dt>weekly：score / weeklyMovement</dt><dd>score 为有效日综合得分的平均值，使用完整候选池；有效日未出现该歌曲记 0，同一自然日只计一次，不同口径的日期排除。weeklyMovement 独立记录较上周变化，仅相邻两个完整周、口径一致时比较。它不同于日榜的 combinedMovement，也不同于平台原榜 sourceMovement。</dd></div><div><dt>mv</dt><dd>每个平台分别保留 status（linked / none / unknown）及 items 中的 id、hash、url。linked 表示源站有关联记录，不保证能播放；只在 url 非空时提供观看链接。历史快照缺少字段表示未记录。汽水 vid 不作为 MV 证据。</dd></div></dl><p class="api-help">榜单是研究与观察视角，不代表真实全网播放量。音乐请到原平台收听。<a href="#method">阅读计算方法 ↗</a></p></div><div class="api-code-card api-excerpt"><div class="api-code-heading"><h3>本页选中快照</h3><span>字段摘录 · ${escapeHTML(snapshot.mode.toUpperCase())}</span></div><pre tabindex="0" aria-label="本页快照关键字段"><code>${escapeHTML(excerpt)}</code></pre><p>这是当前页面数据的摘录；latest 始终指向最近一次成功发布的综合榜。</p></div></section>${subscriptionSection()}`;
}

function renderAll() {
  renderOverview();
  renderFilters();
  renderDatePicker();
  renderChart();
  renderMethod();
  renderSources();
  renderAPI();
  if (location.hash === '#subscribe') document.getElementById('subscribe').scrollIntoView({ block: 'start' });
}

function findSong(id, entryId) {
  const song = state.snapshot.songs.find((item) => item.id === id);
  if (song) return song;
  const source = currentSource(state.platform);
  const entry = source.entries.find((item) => item.sourceId === entryId);
  const platforms = state.snapshot.sources.filter(item => item.status === 'ok').flatMap(item => {
    const match = item.entries.find(row => row.songId === entry.songId);
    if (!match) return [];
    const eligible = match.rank <= state.snapshot.methodology.rankDepth;
    const score = eligible ? 100 * (0.9 * Math.exp(-(match.rank - 1) / 25) + 0.1) : 0;
    return [{ id: item.id, name: item.name, rank: match.rank, url: match.url, score, eligible, contribution: item.weight * score, sourceMovement: match.sourceMovement, mv: match.mv }];
  });
  return { ...entry, id: entry.songId, rank: null, score: null, appearances: platforms.length, history: [], platforms };
}

function showSong(id, entryId) {
  if (state.mode === 'platform' && chartSource().ingestion === 'backfill') { showHistoricalSong(entryId); return; }
  const song = findSong(id, entryId);
  const history = [...song.history].sort((a, b) => a.date.localeCompare(b.date)).slice(-7);
  $('#song-detail').innerHTML = `<div class="detail-top"><p class="detail-kicker">RESONANCE / SONG PROFILE${state.snapshot.mode === 'demo' ? ' · DEMO' : ''}</p><div class="detail-heading">${cover(song)}<div><h2 id="song-dialog-title">${escapeHTML(song.title)}</h2><p>${escapeHTML(artistName(song))}</p></div></div><div class="detail-stats"><div class="detail-stat"><b>${song.rank === null ? '—' : `#${song.rank}`}</b><span>本期综合名次</span></div><div class="detail-stat"><b>${song.score === null ? '—' : number(song.score)}</b><span>共振指数 / 100</span></div><div class="detail-stat"><b>${song.appearances}</b><span>个平台共同上榜</span></div></div>${song.rank === null ? '' : `<p class="detail-combined-movement">综合榜较昨日 ${change(song)}</p>`}</div><div class="detail-body"><h3>每一份信号，都有来处</h3>${song.platforms.map((platform) => { const source = currentSource(platform.id); const eligible = platform.rank <= state.snapshot.methodology.rankDepth; const contribution = platform.contribution ?? (eligible ? 100 * source.weight * (0.9 * Math.exp(-(platform.rank - 1) / 25) + 0.1) : 0); return `<div class="detail-platform"><span style="--platform-color:${platformColor(platform.id)}"><i class="platform-dot"></i>${escapeHTML(platform.name)}<small>权重 ${number(source.weight * 100, 1)}% · 贡献 ${number(contribution, 2)} 分${eligible ? '' : ' · 仅原榜展示'}</small></span><strong>#${platform.rank}</strong>${sourceLink(platform.url, '去听这首 ↗')}<div class="detail-source-metadata"><span class="source-movement-label">较原榜上期：${sourceChange(platform.sourceMovement, false)}</span><span class="detail-mv">${mvDetails(platform.mv)}</span></div></div>`; }).join('')}<p class="detail-explanation">原榜变化来自平台上期榜单，与综合榜较昨日变化独立。MV 关联不承诺可播放；缺少历史字段时显示未记录。平台单项信号 p(r) = 0.9 × exp(−(r−1)/25) + 0.1。每项信号乘以本期平台权重后求和，再乘 100 得到共振指数。未进入某平台前 ${state.snapshot.methodology.rankDepth} 名的贡献为 0。${song.score === null ? '这首歌未进入本期发布的综合榜，仍保留原平台记录。' : ''}<a href="#method" data-close-dialog> 了解完整方法 ↗</a></p><div class="detail-trend"><h3>最近 ${history.length} 期 · 综合名次</h3>${trend(history, true)}${history.length > 1 ? `<div class="detail-trend-labels"><span>${history[0].date}</span><span>越高，名次越靠前</span><span>${history.at(-1).date}</span></div>` : ''}</div></div>`;
  openSongDialog();
}

function showHistoricalSong(entryId) {
  const source = chartSource();
  const song = source.entries.find(entry => entryKey(entry) === entryId);
  const archived = source.observationType === 'archived-snapshot';
  $('#song-detail').innerHTML = `<div class="detail-top"><p class="detail-kicker">RESONANCE / PLATFORM HISTORY</p><div class="detail-heading">${cover(song)}<div><h2 id="song-dialog-title">${escapeHTML(song.title)}${mvBadge([song])}</h2><p>${escapeHTML(artistName(song))}</p></div></div><div class="detail-stats"><div class="detail-stat"><b>#${song.rank}</b><span>${escapeHTML(source.name)} 原榜名次</span></div><div class="detail-stat"><b>${source.date.slice(5)}</b><span>${archived ? source.provenance.dateBasis === 'rss-updated-at' ? '源 RSS 日期' : '存档记录日期' : '平台榜期'}</span></div><div class="detail-stat"><b>历史</b><span>${archived ? '第三方保存的快照' : '事后回填原榜'}</span></div></div></div><div class="detail-body"><h3>${escapeHTML(source.chartName)} · ${source.date}</h3><p class="weekly-detail-note">${historicalContext(source)}</p><div class="detail-platform"><span>${escapeHTML(source.name)}</span><strong>#${song.rank}</strong>${song.url ? sourceLink(song.url, '到原平台查看 ↗') : sourceLink(song.archiveUrl, '查看存档曲目 ↗')}<div class="detail-source-metadata"><span class="source-movement-label">较原榜上期：${sourceChange(song.sourceMovement, false)}</span><span class="detail-mv">${mvDetails(song.mv)}</span></div></div><p class="detail-explanation">${archived ? '来源链接指向保存这份榜单的存档。日期沿用原记录标签或原始 RSS 时间，原始时间没有时区时保留原文。' : '历史榜期来自平台接口，实际采集时间单独保留。'}${song.sourceId === null ? '此存档未保存平台歌曲 ID 与原平台歌曲链接。' : ''}历史原榜不参与综合榜计分；未知的涨跌与 MV 信息保持未知。</p></div>`;
  openSongDialog();
}

function exportCSV() {
  const combined = state.mode === 'combined';
  const rows = filteredRows();
  const header = combined ? ['排名', '歌曲', '艺人', '共振指数', '上榜平台数', '日期', '数据模式'] : ['平台排名', '歌曲', '艺人', '平台', '原始链接', '日期', '数据模式', '记录类型', '存档来源', '日期口径', '原始采集时间', '原始时区', '源站时间', '存档提交时间', '本次读取时间'];
  const escapeCell = (value) => {
    const text = String(value ?? '');
    const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  const source = combined ? null : chartSource();
  const values = rows.map((song) => combined ? [song.rank, song.title, artistName(song), song.score, song.appearances, state.snapshot.date, state.snapshot.mode] : [song.rank, song.title, artistName(song), source.name, song.url, source.date, source.mode, source.observationType || 'collected-snapshot', source.provenance?.url || '', source.provenance?.dateBasis || 'collection-date', source.provenance ? source.provenance.observedAt || '未记录' : '', source.provenance ? source.provenance.observedTimeZone || '未记录' : '', source.sourceUpdatedAt || '', source.provenance?.committedAt || '', source.fetchedAt]);
  const csv = '\uFEFF' + [header, ...values].map((row) => row.map(escapeCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `resonance-${combined ? state.snapshot.date : chartSource().date}-${combined ? 'combined' : state.platform}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function navigate() {
  const section = location.hash.slice(1);
  const view = section === 'subscribe' ? 'api' : ['weekly', 'method', 'sources', 'api'].includes(section) ? section : 'charts';
  for (const name of ['charts', 'weekly', 'method', 'sources', 'api']) {
    $(`#${name}-view`).hidden = name !== view;
    const link = $(`[data-nav="${name}"]`);
    if (name === view) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  if (section === 'subscribe') document.getElementById('subscribe')?.scrollIntoView({ block: 'start' });
  else window.scrollTo({ top: 0, behavior: 'instant' });
  document.title = `${section === 'subscribe' ? '订阅更新' : view === 'weekly' ? '综合周榜' : view === 'method' ? '计算方法' : view === 'sources' ? '数据源' : view === 'api' ? '开放 API' : '听见流行的交集'} · 共振 RESONANCE`;
}

function setMode(mode) {
  ++state.request;
  state.mode = mode;
  state.platformSnapshot = null;
  if (mode === 'platform' && state.platform === 'all') state.platform = state.snapshot.sources.find((source) => source.status === 'ok')?.id || state.snapshot.sources[0].id;
  state.limit = 20;
  renderFilters();
  renderDatePicker();
  if (mode === 'platform') void loadPlatform();
  else renderChart();
}

window.addEventListener('hashchange', navigate);
$('#weekly-content').addEventListener('change', (event) => {
  if (event.target.id === 'weekly-select') void loadWeekly(event.target.value);
});
$('#weekly-content').addEventListener('input', (event) => {
  if (event.target.id !== 'weekly-search') return;
  state.weeklySearch = event.target.value;
  state.weeklyLimit = 20;
  renderWeeklyRows();
});
$('#weekly-content').addEventListener('click', (event) => {
  if (!event.target.closest('#weekly-more')) return;
  state.weeklyLimit += 30;
  renderWeeklyRows();
});
$('#api-content').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-copy-feed]');
  if (!button) return;
  const address = `${location.origin}${button.dataset.copyFeed}`;
  try {
    await navigator.clipboard.writeText(address);
    $('#subscription-feedback').textContent = '订阅链接已复制，可粘贴到阅读器。';
  } catch {
    $('#subscription-feedback').textContent = '未能访问剪贴板，请选中上方链接后手动复制。';
  }
});
$('#api-content').addEventListener('change', (event) => {
  if (event.target.id !== 'api-platform-select') return;
  state.apiPlatform = event.target.value;
  renderAPI();
  $('#api-platform-select').focus();
});
$('#platform-filters').addEventListener('click', (event) => {
  const button = event.target.closest('[data-platform]');
  if (!button) return;
  state.platform = button.dataset.platform;
  state.platformSnapshot = null;
  state.limit = 20;
  renderFilters();
  if (state.mode === 'platform') { renderDatePicker(); void loadPlatform(); }
  else renderChart();
});
$('.chart-tabs').addEventListener('click', (event) => {
  const button = event.target.closest('[data-mode]');
  if (button && state.snapshot) setMode(button.dataset.mode);
});
$('.chart-tabs').addEventListener('keydown', (event) => {
  if (['ArrowLeft', 'ArrowRight'].includes(event.key) && state.snapshot) {
    event.preventDefault();
    setMode(state.mode === 'combined' ? 'platform' : 'combined');
    $(`[data-mode="${state.mode}"]`).focus();
  }
});
$('#search-input').addEventListener('input', (event) => {
  if (!state.snapshot) return;
  state.search = event.target.value;
  state.limit = 20;
  renderChart();
});
$('#show-more').addEventListener('click', () => { state.limit += 30; renderChart(); });
$('#export-button').addEventListener('click', () => { if (state.snapshot) exportCSV(); });
$('#date-select').addEventListener('change', async (event) => {
  if (state.mode === 'platform') { await loadPlatform(event.target.value); return; }
  const request = ++state.request;
  const date = event.target.value;
  $('#chart-rows').innerHTML = '<div class="empty-state">正在读取这一天的音乐切片…</div>';
  try {
    const snapshot = date === state.latest.date ? state.latest : await readJSON(`./data/daily/${date}.json`);
    if (request !== state.request) return;
    state.snapshot = snapshot;
    state.limit = 20;
    renderAll();
  } catch (error) {
    if (request !== state.request) return;
    $('#date-select').value = state.snapshot.date;
    $('#chart-rows').innerHTML = `<div class="empty-state"><b>这一期没有成功载入。</b>请选择其他日期，或稍后刷新。</div>`;
  }
});
document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-song-id]');
  if (button) showSong(button.dataset.songId, button.dataset.entryId);
  const weeklyButton = event.target.closest('[data-weekly-song]');
  if (weeklyButton) showWeeklySong(weeklyButton.dataset.weeklySong);
  if (event.target.closest('[data-close-dialog]')) $('#song-dialog').close();
});
$('#close-dialog').addEventListener('click', () => $('#song-dialog').close());
$('#song-dialog').addEventListener('click', (event) => {
  if (event.target === $('#song-dialog')) {
    const bounds = $('#song-dialog').getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) $('#song-dialog').close();
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) && !$('#song-dialog').open) {
    event.preventDefault();
    if (location.hash === '#weekly') { $('#weekly-search')?.focus(); }
    else {
      if (location.hash !== '#charts') { location.hash = '#charts'; navigate(); }
      $('#search-input').focus();
    }
  }
});

navigate();
void initializeWeekly();
try {
  const [snapshot, dates, status] = await Promise.all([readJSON('./data/latest.json'), readJSON('./data/dates.json'), readJSON('./data/status.json')]);
  state.latest = snapshot;
  state.snapshot = snapshot;
  state.status = status;
  state.dates = dates.dates;
  renderAll();
} catch (error) {
  console.error("Chart data could not be loaded.", error);
  const message = '<div class="error-panel"><h2>榜单数据暂时无法读取。</h2><p>请稍后刷新，再来听听今天的共同频率。</p></div>';
  $('#chart-rows').innerHTML = message;
  $('#method-content').innerHTML = message;
  $('#source-content').innerHTML = message;
  $('#api-content').innerHTML = message + subscriptionSection();
  if (location.hash === '#subscribe') document.getElementById('subscribe').scrollIntoView({ block: 'start' });
  $('#snapshot-time').textContent = '数据未载入';
  $('#export-button').disabled = true;
}
