# 共振公开 JSON API · v1

网站同域提供只读静态 JSON 接口，无需注册、API Key 或 Cookie。数据与网站使用同一份已发布快照，由 GitHub Actions 采集、计算后随 Cloudflare Pages 一起部署；请求接口不会触发实时采集。

所有下列路径均使用 `GET`。成功响应的 Content-Type 为 `application/json`（本地附带 `charset=utf-8`），跨域头为 `Access-Control-Allow-Origin: *`，缓存使用 `public, max-age=0, must-revalidate`。普通跨域 `fetch` 不要携带凭据，也无需自定义请求头。

## 路由

| 路径 | 内容 |
| --- | --- |
| `/api/v1/index.json` | 接口目录、平台列表、路径模板 |
| `/api/v1/charts/latest.json` | 最新已发布综合榜 |
| `/api/v1/charts/{date}.json` | 指定日期的已发布综合榜 |
| `/api/v1/weekly/latest.json` | 当前北京时间自然周的综合周榜预览 |
| `/api/v1/weekly/index.json` | 已生成的周次目录，按周一日期倒序 |
| `/api/v1/weekly/{weekStart}.json` | 指定周的综合榜，参数为周一日期 |
| `/api/v1/platforms/{id}/latest.json` | 最新已发布快照中的平台原榜 |
| `/api/v1/platforms/{id}/{date}.json` | 指定日期已发布快照中的平台原榜 |
| `/api/v1/dates.json` | 可读取的历史日期，倒序排列 |
| `/api/v1/status.json` | 最近一次采集状态，以及当前发布快照的指针 |
| `/api/v1/methodology.json` | 最新已发布综合榜使用的计算方法 |
| `/api/v1/updates.json` | 最近 30 期日榜与 8 期周榜的内容修订清单 |
| `/feed.xml` | Atom 订阅源，可添加到 RSS 阅读器 |
| `/feed.json` | JSON Feed 1.1 订阅源 |

`{date}` 为北京时间自然日 `YYYY-MM-DD`，必须来自 `dates.json` 的 `dates`。`{id}` 为平台 ID：`qq`、`netease`、`kugou`、`kuwo`、`apple`、`qishui`；以目录的 `platforms` 为准。历史日期只保留当时快照包含的平台。

目录包含 `schemaVersion`、`mode`、`date`、`generatedAt`、`description`、`platforms`、`endpoints`、`subscriptions`。`endpoints` 提供 `latest`、`dates`、`status`、`methodology`、`updates`、`chartByDate`、`platformLatest`、`platformByDate`、`weeklyLatest`、`weeklyIndex`、`weeklyByWeek`；含 `{id}`、`{date}` 或 `{weekStart}` 的值需要先替换参数。`subscriptions` 提供 `atom`、`jsonFeed` 和 `updates` 路径。API 路径为当前站点根路径，不绑定域名；订阅文件中的链接使用部署时配置的 `SITE_URL`。

没有服务端搜索、分页或查询参数过滤。客户端先读取榜单，再按自己的需要筛选歌曲、歌手或排名。未知路径、尚未发布的日期和未知平台返回 HTTP 404。先检查 HTTP 状态，再解析 JSON；Cloudflare Pages 的 404 正文可能是网站的 404 HTML 页。

## 综合榜响应

```js
{
  schemaVersion: 1,
  mode: 'live',
  date: '2026-10-22',
  generatedAt: '2026-10-22T15:59:02.814Z',
  coverage: {
    available: 5, expected: 6, groups: 3, groupTotal: 4,
    status: 'partial', comparisonAvailable: false
  },
  methodology: { /* 公式版本、排名深度、分组权重、最低独立组数 */ },
  comparisonSignature: '…',
  sources: [ /* 平台元数据、采集状态、有效权重；不包含 entries */ ],
  songs: [ /* rank、id、title、artists、score、platforms、history 等 */ ]
}
```

以上是结构示意。`songs` 按综合排名升序，每首歌的 `platforms` 包含原榜名次、计分贡献和平台链接；`id` 是项目的合并曲目身份，不是平台 ID。`score` 是公式计算的相对热度分数，不是播放量。`previousRank` 和 `delta` 为 `null` 时，不应自动标为新歌；可能是首次采集、来源覆盖变化或前一日不可比。判断跨日可比性请结合 `coverage.comparisonAvailable` 和 `comparisonSignature`。

新采集增加 `songs[].combinedMovement`，明确表示**综合榜相对前一个北京时间自然日的变化**：

```json
{
  "direction": "up",
  "delta": 3,
  "previousRank": 17,
  "period": "previous-day",
  "comparisonDate": "2026-10-22"
}
```

这是结构示例，`direction` 为 `up/down/same/new/unknown`。不可比时为 `unknown`，`comparisonDate` 为 `null`；`new` 表示进入本项目综合榜 Top 100，不表示歌曲刚发行。顶层 `previousRank`、`delta` 保留兼容，含义与 `combinedMovement` 相同。此次仅增加元数据，计分公式仍为 1.1，历史文件不会补写未经采集的原榜涨跌或 MV 信息。

从方法 **1.1** 起，各来源统一仅以前 **50** 名参与计分，原榜采集深度单独保留。`songs[].appearances` 是该曲目出现在所保留原榜中的平台数；`songs[].scoringAppearances` 才是进入前 50 名、实际参与计分的平台数。每项 `songs[].platforms[]` 的 `eligible` 表示是否计分；超过第 50 名的原榜记录仍可显示，但其 `eligible` 为 `false`、`score` 和 `contribution` 均为 `0`。只有至少一个来源产生正分的曲目才会进入综合榜候选，最终综合榜最多输出 100 首。

历史响应保留各自的 `methodology.version` 与 `rankDepth`。方法 1.0 的历史数据可能没有 `eligible`、`scoringAppearances` 等新字段；不要用最新 `methodology.json` 的参数重新解释旧日期的分数。

`mode` 为 `live` 表示真实采集或显式导入的数据；为 `demo` 表示设计示例。首次部署没有真实发布快照时，网站与 API 都明确使用 `demo`。用于统计分析的客户端应主动拒绝 `demo`。

`coverage.status` 为 `complete` 表示全部配置平台可用；`partial` 表示部分平台缺失，但仍达到独立来源组门槛；`insufficient` 表示未达到发布门槛，通常只会出现在最近采集状态。`partial` 是覆盖说明，不是 HTTP 请求失败。来源错误、未接入、过期均可造成覆盖不足。不要将成功返回 HTTP 200 等同于所有平台已更新。

## 综合周榜响应

周次按北京时间周一至周日划分，`{weekStart}` 为周一的 `YYYY-MM-DD`，从 `/api/v1/weekly/index.json` 的 `weeks` 选择。目录结构为 `{schemaVersion, mode, latest, weeks:[{weekStart, weekEnd, status, observedDays}]}`，`latest` 指向当前周；即使当前周尚无成功日快照，也会返回明确标记为空的预览。

每个周榜包含 `weekStart`、`weekEnd`、`mode`、`generatedAt`、`asOfDate`、`status`、`methodology`、`comparisonSignature`、`coverage`、`songs`。`asOfDate` 是本次构建的北京时间日期，`generatedAt` 是周榜构建时间，真实日记录截止日期为 `coverage.latestIncludedDate`，三者不能混为一谈。

- `status: provisional`：本周预览，包含周日当天；`complete`：已经结束且有 7 个同口径有效日；`incomplete`：已经结束但不足 7 个有效日。
- `coverage.observedDays / expectedDays`：纳入计算的有效天数 / 7；`includedDates` 是有效日期，`missingDates` 是没有快照的日期（本周可能含未来日期），`excludedDates` 是 `[{date, reason}]`，说明已有记录却未计入的原因。
- `coverage.sourceCoverage` 单独说明所选日榜口径的可用平台／来源组；日期完整不代表所有平台齐全。空周为 `null`。
- `methodology.version` 当前为 `weekly-1.0`，`baseVersion` 为采用的日榜版本。每周以最新日快照的比较口径为准，其他口径的日期被排除。
- `songs` 最多 100 首，含 `id/title/artists/artwork/rank/score/daysOnChart/dailyScores/previousRank/delta/weeklyMovement`。候选从各日完整来源行重建，不限于日榜已发布 Top 100。
- `score` 是有效日平均分；`dailyScores:[{date,score}]` 只列有效日，歌曲该日不在计分窗口时记 0。`daysOnChart` 统计有效日中获得正分的天数，不是进入日榜 Top 100 的天数。
- `weeklyMovement.period` 为 `previous-week`，仅相邻完整周且口径、模式一致才比较；`comparisonDate` 为前周周一。不可比时 direction 为 `unknown`、delta/previousRank/comparisonDate 均为 `null`。它与日榜 `combinedMovement`、平台 `sourceMovement` 完全独立。

周榜不重复嵌入各日的来源涨跌与 MV；按 `dailyScores[].date` 读取对应日榜或平台 API，并通过 `songId` 关联。周榜、日榜和平台原榜都是公开无认证读取。完整公式见 [周榜方法](weekly.md)。

## 平台原榜响应

平台接口为平铺对象，含 `schemaVersion`、`mode`、`date`、`generatedAt` 以及该平台的来源信息：

- `id`、`name`、`chartName`、`group`、`sourceUrl`：平台与实际榜单身份。
- `status`：`ok`、`error` 或 `disabled`；`message` 说明问题，`entries` 不可用时为空。
- `fetchedAt`：本轮采集时间基准；`sourceUpdatedAt`：平台明确给出的绝对更新时间；`sourcePeriod`：平台期次原文。
- `frequency`、`updatePolicy`：已核实的更新规则及证据边界。
- `count`、`scoringCount`、`weight`、`ingestion`：原榜记录数量、落在本版计分深度内的原榜记录数量、该版综合榜有效权重、公开采集或导入方式。
- `collectionDepth`、`maxAgeHours`：来源采集深度与项目的新鲜度窗口。当前汽水为 50 首、216 小时，其余五个平台为 100 首、48 小时；这些是项目配置，不是平台的准点更新承诺。
- `entries`：按平台排名排列的原榜记录；当前汽水保留 50 首，QQ、网易云、酷狗、酷我和 Apple RSS 各保留前 100 首。记录含 `rank`、`sourceId`、`songId`、`title`、`artists`、`album`、`artwork`、`url`。平台缺失的可选元数据可能为 `null`，历史快照也可能没有新增的来源配置字段。

平台原榜保留自己的排名，不按综合榜排名重排。`songId` 可与综合榜曲目的 `id` 关联，但原榜曲目不一定进入综合榜前 100。酷狗接口名称仍是 TOP500，这里保留其前 100 名展示与研究，其中前 50 名参与方法 1.1 计分。汽水来源是官方热歌周榜 Top 50；每天采样不代表每天产生新一期周榜。平台 `latest.json` 与综合榜 `latest.json` 来自同一次已发布快照，不是各平台各自最后一次成功采集的拼接结果。

## 原榜涨跌与 MV

新采集的 `entries[]` 带有 `sourceMovement` 和 `mv`。综合榜 `songs[].platforms[]` 同样保留对应平台的这两个对象；它们不参与综合分数计算，也不会替代 `combinedMovement`。

```json
{
  "sourceMovement": {
    "direction": "up",
    "delta": 3,
    "previousRank": 17,
    "period": "previous-edition",
    "raw": { "cur_count": "14", "old_count": "17" }
  },
  "mv": {
    "status": "linked",
    "items": [{ "id": "平台给出的MV标识", "hash": null, "url": null }]
  }
}
```

- `sourceMovement.direction` 为 `up/down/same/new/unknown`，`delta` 正数为上涨、负数为下跌，不能确定时为 `null`。`previousRank` 是已核实的前期名次。
- `period: previous-edition` 表示平台自己的上期，未必是昨天；汽水是相对上期周榜。`raw` 仅保留相关原始排名字段，便于复核，不包含完整上游响应。
- QQ、酷狗按已确认的当前/前期名次计算；网易按官方模板将从 0 开始的 `lastRank` 转为从 1 开始的前期名次，负数或缺失值保留未知；汽水按明确的方向与幅度解析。酷我方向编码未经充分确认时保留 `raw`，规范化方向为 `unknown`，不猜测。平台明确给出的 `new` 与没有有效前期名次分开处理。
- `mv.status: linked` 表示发现 MV 关联标识，**不保证可播放或免费**；`none` 表示本次响应明确没有关联；`unknown` 表示本次接口不能确认。`items` 保留 MV ID、hash、已确认的官方页面 URL；未知值为 `null`。有 hash 而无 ID 的关联也会保留。
- 汽水的音频 `vid` 不会当成 MV。没有确认的观看地址不拼接，也不会返回音频/视频临时播放地址、签名或令牌。
- 历史快照可能没有这两个字段，此时应显示“未记录”，不能当作持平或“没有 MV”。

订阅地址和 WebSub 推送方式见 [订阅与发布文档](subscriptions.md)。订阅基于发布内容的修订标识，同日重复采集但内容没有变化时不会产生新通知。

## 采集状态与发布快照

`status.json` 返回 `schemaVersion`、`mode`、`date`、`generatedAt`、`published`、`coverage`、`sources`，以及 `publishedSnapshot`。

`published` 表示**最近这次采集是否生成发布榜单**。如果最新采集失败，`status.json` 会报告新失败，而 `charts/latest.json` 继续提供上一份已发布快照。不能把旧快照改标为今天。`publishedSnapshot` 的 `mode`、`date`、`generatedAt`、`coverage`、`url` 明确指出站点目前提供的是哪一版。

首次真实采集不足门槛时，状态可能是 `mode: 'live'`、`published: false`，而 `publishedSnapshot.mode` 仍为 `demo`。程序应读取这两个状态，不把示例当成采集成功的真实数据。

日期接口是 `{ schemaVersion, mode, date, generatedAt, dates }`；方法接口是 `{ schemaVersion, mode, date, generatedAt, methodology }`。同一天多次成功采集会更新当天文件，历史日期代表该日最后一次成功发布的快照，不能当作每次采集的完整运行档案。别名修正后重新计算也可能更新历史分数。

## 请求示例

命令行（将域名替换为自己的 Cloudflare Pages 域名）：

```sh
curl --fail 'https://your-project.pages.dev/api/v1/index.json'
curl --fail 'https://your-project.pages.dev/api/v1/charts/latest.json'
curl --fail 'https://your-project.pages.dev/api/v1/platforms/qq/latest.json'
```

网页跨域读取：

```js
const base = 'https://your-project.pages.dev';
const response = await fetch(`${base}/api/v1/charts/latest.json`, {
  credentials: 'omit',
});
if (!response.ok) throw new Error(`HTTP ${response.status}`);
const chart = await response.json();
if (chart.mode !== 'live') throw new Error('当前是示例数据');
const topTen = chart.songs.filter(song => song.rank <= 10);
console.table(topTen.map(({ rank, title, score }) => ({ rank, title, score })));
```

日期查询应先读取 `dates.json`，选择 `dates` 中的一个日期，再请求对应路径；不要猜测尚未发布的未来日期。

本地执行 `npm run preview` 后可使用相同路径，预览文件位于 `.preview/`，与生产 `dist/` 分开。本地预览对 `/api/*` 的 OPTIONS 请求返回 204 并带跨域头。生产环境由 Cloudflare Pages 原生静态文件服务提供跨域 GET；项目没有 Worker、动态接口、身份会话或写入入口。
