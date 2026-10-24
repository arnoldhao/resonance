# 公开 API · v1

网站同域提供只读静态 JSON，无需认证，支持 `Access-Control-Allow-Origin: *`。请求接口不会触发采集。

## 路由

所有接口使用 `GET`，日期格式为 `YYYY-MM-DD`。

| 路径 | 内容 |
| --- | --- |
| `/api/v1/index.json` | 接口目录、平台列表、路径模板 |
| `/api/v1/charts/latest.json` | 最新综合日榜 |
| `/api/v1/charts/{date}.json` | 指定日期的综合日榜 |
| `/api/v1/movement/latest.json` | 最新共振涨跌榜 |
| `/api/v1/movement/{date}.json` | 指定日期的综合名次涨跌排行 |
| `/api/v1/dates.json` | 综合日榜可查日期 |
| `/api/v1/weekly/latest.json` | 本周综合榜预览 |
| `/api/v1/weekly/index.json` | 可查周次 |
| `/api/v1/weekly/{weekStart}.json` | 指定周榜，以周一日期标识 |
| `/api/v1/monthly/latest.json` | 本月综合榜预览 |
| `/api/v1/monthly/index.json` | 可查月份 |
| `/api/v1/monthly/{month}.json` | 指定自然月榜，月份格式 `YYYY-MM` |
| `/api/v1/cadence.json` | 最近 30 日的平台排名变化观察 |
| `/api/v1/platforms/{id}/latest.json` | 最新发布快照中的平台原榜 |
| `/api/v1/platforms/{id}/index.json` | 平台可查日期及采集方式 |
| `/api/v1/platforms/{id}/{date}.json` | 指定日期的平台原榜 |
| `/api/v1/status.json` | 最近采集状态和发布指针 |
| `/api/v1/methodology.json` | 最新日榜的计算方法 |
| `/api/v1/updates.json` | 日榜、周榜、月榜修订清单 |

平台 ID：`qq`、`netease`、`kugou`、`kuwo`、`apple`、`qishui`。综合榜日期与平台原榜日期分别从对应目录读取；未知日期或路径返回 404。

```js
const response = await fetch('/api/v1/charts/latest.json');
if (!response.ok) throw new Error(`HTTP ${response.status}`);
const chart = await response.json();
console.table(chart.songs.map(({ rank, title, score }) => ({ rank, title, score })));
```

外部应用将示例路径换为站点的完整 HTTPS 地址即可。

## 综合日榜

顶层字段包括 `schemaVersion`、`mode`、`date`、`generatedAt`、`methodology`、`comparisonSignature`、`coverage`、`sources`、`songs`。

- `mode`：`live` 为实际采集或显式导入，`demo` 为示例。
- `coverage`：可用平台、独立来源组及覆盖状态；`available = fresh + cached`，`fresh/cached` 是本次成功/历史沿用的平台数量。`complete` 为全部来源可计分（可能包含沿用），`partial` 为部分覆盖；`comparisonUsesCache` 标记日榜比较涉及沿用。
- `sources`：平台元数据、状态和有效权重，不含完整原榜条目。
- `songs`：按综合排名排序，包含 `id/title/artists/artwork/rank/score/platforms/history/combinedMovement`。
- `platforms`：对应原榜的 `sourceId/rank/url/eligible/score/contribution/sourceMovement/mv`，以及 `status/ingestion/fetchedAt/observedDate/sourceUpdatedAt/sourcePeriod/attemptedAt/collectionError/cacheOrigin`；观察来源信息随歌曲保留。
- `appearances` / `scoringAppearances`：原榜出现平台数 / 计分平台数。
- `history[]`：保留同一数据模式下的历史名次和得分；`methodologyVersion/comparisonSignature` 标注各点原口径，包含公式升级前日期。采集范围扩大后仍连续展示历史趋势。

`score` 为综合指数，`contribution` 为平台加权贡献。公式和比较条件见[日榜方法](methodology.md)；历史数据按自己的 `methodology` 解释。

自 v1.4 起，`methodology.rankPolicy: platform-top-n`、`rankDepth: null`，具体计分深度以 `platformRankDepths` 为准：`qq/netease/kugou/kuwo` 各 200、`apple` 100、`qishui` 50。`displayDepth: 100` 只限制综合榜输出；平台前 101—200 名仍可给综合歌曲贡献分数。`tail: {startRank: 50, decayScale: 50}` 表示第 51 名起从第 50 名分值继续衰减，取消长尾固定 10% 保底。

v1.3 及以前仍按各自保存的数字 `rankDepth` 和原公式解释。比较签名保留分平台计分窗口记录；涨跌直接比较同一数据模式下相邻两天的已发布名次，不因扩采而重置。历史重算保留该期原方法，不将旧 Top 100 观察补作新版 Top 200。

## 共振涨跌榜

`date/generatedAt/mode/comparisonSignature/coverage` 对应同日综合榜，`comparisonDate` 是可比较的昨日日期，不可比较时为 `null`。

- `rising/falling`：今日综合 Top 100 中上升、下降的歌曲，按 `abs(delta)` 降序，同幅度按今日综合名次升序。
- `newEntries`：今日 Top 100 新入榜，按今日综合名次排列，`delta/previousRank` 为 `null`。
- `unchangedCount`：持平歌曲数。
- 每首歌保留综合榜的 `rank/score/combinedMovement`，`movementRank` 单独表示所属分类的排序位置。

不可比较时列表为空；不把跌出 Top 100 的歌曲假定为第 101 名。平台筛选、关键词搜索与 CSV 导出是页面能力；静态接口返回完整分类。日期取自 `/dates.json`，完整规则见[涨跌榜方法](movement.md)。

## 综合周榜

周次目录的 `weeks` 包含 `weekStart/weekEnd/status/observedDays`。周榜包含 `coverage`、`songs`、`methodology`，以及：

- `status`：`provisional` 周预览、`complete` 完整周、`incomplete` 缺日周。
- `coverage.includedDates/cachedDates/missingDates/excludedDates`：有效、使用历史沿用、缺失和排除日期；`sourceCoverage` 披露最新日榜来源覆盖，含 `fresh/cached` 数量；`comparisonUsesCache` 标记周榜比较涉及沿用。
- `methodology.aggregationPolicy: each-day-original-method`：各有效日保留原公式日分，升级前日期继续参与汇总。`baseVersions` 列出日榜版本，`dailyMethods[]` 披露各日期的 `date/version/comparisonSignature`；混合版本时 `baseVersion` 为 `null`。`coverage.mixedMethods/mixedSignatures` 标记混合版本／签名；各日签名不统一时顶层 `comparisonSignature` 为 `null`。
- `songs[].dailyScores/daysOnChart`：有效日分数和获得正分的天数。
- `songs[].weeklyMovement`：综合周榜相对上周的变化。
- 周涨跌页面按 `weeklyMovement.direction` 分上升、下降、新入榜，再按变化幅度排序；页面的 `movementRank` 为分类排名，`rank` 始终为本周综合名次。下载仍使用当期周榜 JSON，包含全部歌曲及涨跌字段。
- `songs[].platforms[].observedDate`：该平台元数据真实观察日期，沿用不刷新；`includedDate` 是最近采用这份观察计算日分的日期。

周榜平台名次是该观察日的名次，周得分是各有效日按原公式计算后的平均分。日期完整可包含公式切换；相邻两周均完整且数据模式相同时，即比较已发布名次，不因采集范围变化而停止比较。完整规则见[周榜方法](weekly.md)。

## 综合月榜

月份目录的 `months` 包含 `month/monthStart/monthEnd/status/observedDays`，`latest` 为当前自然月 `YYYY-MM`。月榜直接从日榜完整来源重建，保留与周榜相同的 `coverage`、`dailyScores/daysOnChart`、平台观察与覆盖信息。

- `monthStart/monthEnd`：北京时间自然月首末日；`coverage.expectedDays` 按月份实际天数计算。
- `status`：`provisional` 本月预览、`complete` 完整月、`incomplete` 已结束但存在缺失或排除日。
- `score`：各有效日按当时保存公式计算的分数平均值，公式升级前日期继续纳入；有效日未出现歌曲记 0，缺失或排除日不计分母。同一自然日只取最后一期，不平均周榜。`baseVersions/dailyMethods/mixedMethods/mixedSignatures` 的含义与周榜相同。
- `monthlyMovement`：相邻两个完整自然月且数据模式相同时比较，`period: previous-month`，`comparisonDate` 为上月 1 日。
- 月涨跌页面按 `monthlyMovement.direction` 分类、按变化幅度排序，保留本月与上月综合名次；下载当月 JSON 即可读取完整涨跌字段。周／月页面在 `coverage.comparisonAvailable` 为 `false` 时显示原因，后续为 `true` 时自动展示。

完整规则见[月榜方法](monthly.md)。

## 更新频率观察

`/cadence.json` 包含 `generatedAt/sinceDate/timeZone/policy/sources`，从近 30 个北京时间自然日的真实成功观察计算，不包含缓存、示例或历史回填。

`sources[]` 提供 `id/name/frequency/updatePolicy/observations/firstObservedAt/latestObservedAt`、`daily`、`changes/editionChanges`、`latestContentChange/maxDailyChanges/conclusion`。`daily[]` 是 `{date, observations, changes, editionChanges}`；`changes[]` 是 `{after, by, previousPeriod, sourcePeriod, sourceUpdatedAt}`。

内容比较只使用歌曲 ID 与名次；`after/by` 为排名变化发生区间的两端观察时间，不是确定的发榜时间。`daily[].changes` 只统计区间两端同日的变化，次数为下限；时间戳或榜期改变但排名不变时不增加次数。`editionChanges[]` 单独记录非 Apple 来源的榜期或明确源更新时间变化，包含 `after/by/previousEdition/edition/rankChanged`，排名不变也可记录新榜期；Apple RSS 时间不参与此计数。`frequency/updatePolicy` 保留当前来源说明，不以短期观测推定固定时刻。依据见[数据来源](sources.md#更新频率观察)。

## 平台原榜与历史

平台响应包含 `id/name/chartName/sourceUrl/status/count/ingestion/entries`。`collectionDepth/count` 为实际保存的窗口深度与条目数，`declaredCount` 为官方声明的整张榜单数量；例如酷狗可以是 `count: 200, declaredCount: 500`。未知的旧记录可能没有 `declaredCount`。`fetchedAt` 是实际采集时间，`sourceUpdatedAt` 是平台返回的更新时间（Apple RSS 响应时间不等于排名刷新时间），`sourcePeriod` 是榜期原文。

| 来源状态 | 是否参与已发布日分 | 含义 |
| --- | --- | --- |
| `ok` | 是 | 本次成功采集或显式导入完整榜单 |
| `stale` | 是 | 本次失败，沿用仍在有效窗口内的最近真实成功观察 |
| `error` | 否 | 本次失败且没有可沿用的完整观察 |
| `disabled` | 否 | 配置中未启用且没有显式导入 |

`stale` 使用 `ingestion: cache`；`attemptedAt` 是失败尝试时间，`collectionError` 保留失败原因。`cacheOrigin` 为 `{date, generatedAt, path, ingestion}`，指向原始成功观察的日榜或 run，`ingestion` 保留原 `public/import`。原 `fetchedAt/sourceUpdatedAt/sourcePeriod` 不变，不能用 `attemptedAt` 或发布日延长有效期。没有成功观察的 `error` 来源 `fetchedAt` 为 `null`。发布快照中的日期是采用该观察的日榜日期，不一定等于来源观察日期。来源目录摘要同样保留时间、状态和缓存溯源字段；API 不将 `stale` 裁成空榜。

这些字段自日榜方法 v1.3、周榜方法 weekly-1.1 开始提供；旧归档没有 `fresh/cached/cacheOrigin` 时按其原方法解释，不反推当时不存在的沿用状态。

`entries` 按原榜名次排列，包含 `rank/sourceId/songId/title/artists/album/artwork/url/sourceMovement/mv`。`songId` 对应综合榜的 `id`；原榜歌曲不一定进入综合 Top 100。

平台页面最多列出前 100 名，当前平台 JSON 保存完整指定窗口：四家 200、Apple 100、汽水 50。页面 CSV 导出当前展示范围；平台 JSON 可用于读取第 101—200 名。指定窗口必须完整取得，不以缺失名次代替零票。

官方历史响应存在缺号时保留原名次，`missingRanks` 列出前 100 名中的缺失位置，`count` 为实际保存数；不重排或补写歌曲。

第三方存档未保存平台曲目 ID 或原链接时，`sourceId`、`url` 为 `null`，存档曲目链接另存为 `archiveUrl`。未知元数据不会用当前歌曲信息补写。

平台目录的 `dates` 按日期倒序，`editions` 提供各期摘要。历史回填标记 `ingestion: backfill`；`historical-edition` 表示官方接口返回的历史榜期，`archived-snapshot` 表示第三方保存的榜单快照。后者的 `date` 沿用原记录日期，不代表平台发榜日期。`fetchedAt` 始终为本次实际读取时间。

第三方快照的 `provenance` 保留存档发布者、版本链接、内容摘要、榜单 ID 和身份核对依据。`observedAt` 为原始采集时间，未知为 `null`；`observedTimeZone: null` 表示时区未注明。`committedAt` 为 Git 存档的提交时间。`dateBasis` 区分原记录日期与原始 RSS 更新时间；`samplingPeriod: weekly` 表示每周保存一次快照，不是官方周榜。以上均不等于平台发榜时间，目录摘要同样保留这些信息。

回填不生成综合榜；同日有实际采集快照时优先使用实际快照。平台 `latest.json` 始终来自最新发布的综合榜快照。

## 涨跌与 MV

`combinedMovement`、`weeklyMovement`、`monthlyMovement` 分别表示综合日榜、周榜、月榜涨跌；平台变化使用 `sourceMovement`。变化对象使用 `direction: up/down/same/new/unknown`，`delta` 正数上升、负数下降，未知或新入榜时为 `null`。`previousRank` 为可确认的前期名次。

平台官方提供的已确认涨跌优先使用，标为 `origin: official`、`period: previous-edition`，其中持平的 `delta: 0` 也属于有效官方数据。平台上期未必是昨日。

官方变化缺失或为 `unknown` 时，可用昨日最后一期的同平台完整快照计算：`origin: snapshot-comparison`、`period: previous-day`，并保存 `comparisonDate/comparisonDepth/currentObservedAt/previousObservedAt/comparisonUsesCache`。平台榜单名称、入口须相同，双方真实观察日须分别为本日、昨日；扩采后昨日已记录的曲目仍能比较，`comparisonDepth` 为两天共有的采集深度；前日缓存不作昨日新观察。仅按平台 `sourceId` 匹配，独立于综合榜覆盖与歌曲映射。昨日采集范围无此曲、且今日进入两天共有的采集范围时为 `new`，只表示新入采集范围；仅出现在新增尾部且昨日名次未知时为 `unknown`，不估计昨日名次。没有有效昨日观察时保持未知。`raw` 始终保留平台原字段；历史回填不参与此比较。

构建站点时从保存的相邻日快照补充综合和平台涨跌，不重算综合名次、分数或改写原始归档。旧归档中的官方变化可能没有 `origin`，按其原保存内容解释。

`mv` 格式为 `{status, items: [{id, hash, url}]}`。`status` 为 `linked`（有关联）、`none`（源响应明确无关联）或 `unknown`。未提供的标识和地址为 `null`，关联不保证可播放。

订阅使用 `/feed.xml` 或 `/feed.json`，详见[订阅说明](subscriptions.md)。
