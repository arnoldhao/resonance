# 公开 API · v1

网站同域提供只读静态 JSON，无需认证，支持 `Access-Control-Allow-Origin: *`。请求接口不会触发采集。

## 路由

所有接口使用 `GET`，日期格式为 `YYYY-MM-DD`。

| 路径 | 内容 |
| --- | --- |
| `/api/v1/index.json` | 接口目录、平台列表、路径模板 |
| `/api/v1/charts/latest.json` | 最新综合日榜 |
| `/api/v1/charts/{date}.json` | 指定日期的综合日榜 |
| `/api/v1/dates.json` | 综合日榜可查日期 |
| `/api/v1/weekly/latest.json` | 本周综合榜预览 |
| `/api/v1/weekly/index.json` | 可查周次 |
| `/api/v1/weekly/{weekStart}.json` | 指定周榜，以周一日期标识 |
| `/api/v1/platforms/{id}/latest.json` | 最新发布快照中的平台原榜 |
| `/api/v1/platforms/{id}/index.json` | 平台可查日期及采集方式 |
| `/api/v1/platforms/{id}/{date}.json` | 指定日期的平台原榜 |
| `/api/v1/status.json` | 最近采集状态和发布指针 |
| `/api/v1/methodology.json` | 最新日榜的计算方法 |
| `/api/v1/updates.json` | 日榜、周榜修订清单 |

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
- `coverage`：可用平台、独立来源组及覆盖状态；`complete` 为全部来源可用，`partial` 为部分覆盖。
- `sources`：平台元数据、状态和有效权重，不含完整原榜条目。
- `songs`：按综合排名排序，包含 `id/title/artists/artwork/rank/score/platforms/history/combinedMovement`。
- `platforms`：对应原榜的 `sourceId/rank/url/eligible/score/contribution/sourceMovement/mv`。
- `appearances` / `scoringAppearances`：原榜出现平台数 / 计分平台数。

`score` 为综合指数，`contribution` 为平台加权贡献。公式和比较条件见[日榜方法](methodology.md)；历史数据按自己的 `methodology` 解释。

## 综合周榜

周次目录的 `weeks` 包含 `weekStart/weekEnd/status/observedDays`。周榜包含 `coverage`、`songs`、`methodology`，以及：

- `status`：`provisional` 周预览、`complete` 完整周、`incomplete` 缺日周。
- `coverage.includedDates/missingDates/excludedDates`：有效、缺失和排除日期；`sourceCoverage` 披露来源覆盖。
- `songs[].dailyScores/daysOnChart`：有效日分数和获得正分的天数。
- `songs[].weeklyMovement`：综合周榜相对上周的变化。
- `songs[].platforms[].observedDate`：该平台元数据最近一次观察日期。

周榜平台名次是该观察日的名次，周得分是有效日平均分。完整规则见[周榜方法](weekly.md)。

## 平台原榜与历史

平台响应包含 `id/name/chartName/sourceUrl/status/count/ingestion/entries`。`fetchedAt` 是实际采集时间，`sourceUpdatedAt` 是平台明确给出的更新时间，`sourcePeriod` 是榜期原文。

`entries` 按原榜名次排列，包含 `rank/sourceId/songId/title/artists/album/artwork/url/sourceMovement/mv`。`songId` 对应综合榜的 `id`；原榜歌曲不一定进入综合 Top 100。

官方历史响应存在缺号时保留原名次，`missingRanks` 列出前 100 名中的缺失位置，`count` 为实际保存数；不重排或补写歌曲。

第三方存档未保存平台曲目 ID 或原链接时，`sourceId`、`url` 为 `null`，存档曲目链接另存为 `archiveUrl`。未知元数据不会用当前歌曲信息补写。

平台目录的 `dates` 按日期倒序，`editions` 提供各期摘要。历史回填标记 `ingestion: backfill`；`historical-edition` 表示官方接口返回的历史榜期，`archived-snapshot` 表示第三方保存的榜单快照。后者的 `date` 沿用原记录日期，不代表平台发榜日期。`fetchedAt` 始终为本次实际读取时间。

第三方快照的 `provenance` 保留存档发布者、版本链接、内容摘要、榜单 ID 和身份核对依据。`observedAt` 为原始采集时间，未知为 `null`；`observedTimeZone: null` 表示时区未注明。`committedAt` 为 Git 存档的提交时间。`dateBasis` 区分原记录日期与原始 RSS 更新时间；`samplingPeriod: weekly` 表示每周保存一次快照，不是官方周榜。以上均不等于平台发榜时间，目录摘要同样保留这些信息。

回填不生成综合榜；同日有实际采集快照时优先使用实际快照。平台 `latest.json` 始终来自最新发布的综合榜快照。

## 涨跌与 MV

`combinedMovement`、`weeklyMovement`、`sourceMovement` 分别表示综合日榜、综合周榜和原平台涨跌，三者独立。变化对象使用 `direction: up/down/same/new/unknown`，`delta` 正数上升、负数下降，未知或新入榜时为 `null`。`previousRank` 为可确认的前期名次。平台变化的 `period: previous-edition` 指平台上期，未必是昨日；相关原值保存在 `raw`。

`mv` 格式为 `{status, items: [{id, hash, url}]}`。`status` 为 `linked`（有关联）、`none`（源响应明确无关联）或 `unknown`。未提供的标识和地址为 `null`，关联不保证可播放。

订阅使用 `/feed.xml` 或 `/feed.json`，详见[订阅说明](subscriptions.md)。
