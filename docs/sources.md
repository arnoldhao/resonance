# 数据来源

| 平台 | 官方榜单 | 榜单 ID | 采集与计分深度 | 更新周期 |
| --- | --- | --- | ---: | --- |
| QQ 音乐 | [热歌榜](https://y.qq.com/n/ryqq/toplist/26) | `26` | 200 | 每日 |
| 网易云音乐 | [热歌榜](https://music.163.com/discover/toplist?id=3778678) | `3778678` | 200 | 每日，统计窗口为一周 |
| 酷狗音乐 | [TOP500](https://www.kugou.com/yy/rank/home/1-8888.html) | `8888` | 200 | 每日 |
| 酷我音乐 | [热歌榜](https://m.kuwo.cn/newh5app/ranklist) | `16` | 200 | 保存平台返回的日期期次 |
| Apple Music | [中国区 most-played RSS](https://rss.marketingtools.apple.com/api/v2/cn/music/most-played/100/songs.json) | `cn/music/most-played` | 100 | 以 RSS 时间为准 |
| 汽水音乐 | [官方热歌周榜](https://api.qishui.com/luna/pc/charts/7036274230471712007?aid=386088&app_name=luna_pc&region=cn&device_platform=web) | `7036274230471712007` | 50 | 每周 |

北京时间 **09:17、15:17、21:17** 计划采样，GitHub Actions 实际运行可能延迟。采样时间不等于平台发榜时间；没有确认的固定发榜时刻不作推定。Apple RSS 与「Top 100：中国大陆」歌单是不同产品，汽水每天采样仍保持周榜口径。

## 可获取范围与计分窗口

2026-10-24 读取官方公开接口的数量与分页元数据，确认当前可完整返回 QQ **300**、网易云 **200**、酷狗 **500**、酷我 **300** 首；这是对应榜单当前公开范围，不是曲库大小，也不承诺永久上限。Apple 当前已确认可用的营销 RSS 为 **100** 首，汽水官方周榜为 **50** 首；没有据此推定其他榜单或认证接口的上限。

| 平台 | 本轮公开接口证据 | 本项目选择 |
| --- | --- | --- |
| QQ | [官方响应](https://c.y.qq.com/v8/fcg-bin/fcg_v8_toplist_cp.fcg?format=json&topid=26) 的 `total_song_num=300`、实收 `songlist=300` | 保存前 200，计分前 200 |
| 网易云 | [官方响应](https://music.163.com/api/playlist/detail?id=3778678) 的 `trackCount=200`、实收 `tracks=200` | 保存前 200，计分前 200 |
| 酷狗 | [官方单次榜单接口](http://mobilecdn.kugou.com/api/v3/rank/song?version=9108&plat=0&ranktype=0&area_code=1&rankid=8888&page=1&pagesize=500&with_res_tag=0) 的 `total=500`、实收连续 1—500 且榜期一致；[官网末页](https://www.kugou.com/yy/rank/home/23-8888.html)也提供末段名次 | 单次请求前 200，计分前 200 |
| 酷我 | [官方接口](https://kbangserver.kuwo.cn/ksong.s?from=pc&fmt=json&alt=json&show_copyright_off=0&pn=0&rn=500&type=bang&data=content&id=16) 的 `num=300`、实收 300；[官方页面](https://m.kuwo.cn/newh5app/ranklist_detail/16)标明共 300 首 | 请求前 200，计分前 200 |
| Apple | 保持现有中国区 most-played RSS 100 首；扩大至 200 的单次请求返回 HTTP 500，不能据此宣称永久上限 | 保存前 100，计分前 100 |
| 汽水 | 既有官方 Web 模式周榜明确声明并返回完整 50 首 | 保存前 50，计分前 50 |

四家统一前 200 名，减少计分窗口差异；Apple 与汽水继续披露较短范围。页面原榜列表和综合榜最多展示前 100 名，平台 JSON 保留已采集的完整窗口。第 101—200 名可以给同一首跨平台歌曲提供贡献；四家第 201 名起不计分，即使原站公开了更多名次。

`collectionDepth/count` 是本项目实际保存的范围与数量，`declaredCount` 是源站声明的整张榜单数量，两者可以不同。采集必须达到配置的完整窗口且名次连续，不能把少于 200 首的截断响应冒充四家的新版观察。旧归档保留原深度；历史回填仍使用已确认的前 100 名接口契约，不自动扩充或补作新版综合榜。

## 更新频率观察

截至 2026-10-24，现有归档只能确认以下事实，不能据此承诺长期固定发榜时刻：

| 平台 | 已保存的实际证据（展示时间均为北京时间） | 当前结论 |
| --- | --- | --- |
| QQ 音乐 | 10 月 23 日 11:18 仍为 22 日榜期，12:25 变为 23 日；24 日 08:53 仍为 23 日榜期，13:51 变为 24 日 | 当前采集口径为日榜，09:00 前不能保证已取到今日版；不能据两次采样认定一天多次发榜 |
| 网易云音乐 | `updateTime` 为 23 日 08:28:09、24 日 08:34:41；24 日 08:53 与 13:51 排名一致 | 当前说明为每日更新，统计窗口为一周；08:30 左右仅为这两天的观察，固定分钟数未确认 |
| 酷狗音乐 | 返回榜期原文 `2026-10-24 08:30:01`，但24 日 08:53 仍取得前一日榜，13:51 才取得新榜 | 榜期时刻未注明时区，且不等于各接口实际可见时刻；不能承诺 08:30 或 10:00 必定取得新版 |
| 酷我音乐 | 23 日至 24 日接口榜期日期有变化，但保存的前 100 名 ID 和顺序一致 | 未找到固定刷新时刻的一手承诺；日期变化不代表排名变化，排名不变也不能证明没有更新 |
| Apple Music RSS | 24 日 01:52、08:53、13:51 的前 100 名排名各不相同；23 日也有多次变化 | 当前 RSS 确实存在日内多次排名变化，固定间隔仍未确认；`feed.updated` 曾在排名不变时随读取刷新，不能用来计算内容刷新次数 |
| 汽水音乐 | 当前为周榜，保存的 `release_time` 对应 22 日周四 16:00；23、24 日排名一致 | 保留官方周榜口径；一个榜期只能说明本次发布时间，不能承诺每周固定周四 16:00 |

证据来自 `data/runs/2026-10-23/`、`data/runs/2026-10-24/` 中的真实观察。公开页面可交叉核对 [QQ 热歌榜](https://y.qq.com/n/ryqq/toplist/26)、[酷狗 TOP500](https://www.kugou.com/yy/rank/home/1-8888.html) 的当前榜期；页面日期本身不证明精确na刷新时间。

Apple 的[歌单排行榜说明](https://itunespartner.apple.com/music/support/5240-reporting-availability)提到三小时更新，[Apple Music Feed 批量导出](https://developer.apple.com/documentation/applemusicfeed)提到 24 小时刷新；它们均不是本项目使用的营销 RSS，不能把这些间隔套用于当前接口。

构建时从最近 30 个北京时间自然日的真实成功 `data/runs/` 与已发布日快照生成 `/data/cadence.json`、`/api/v1/cadence.json`，不额外访问平台。相同平台和 `fetchedAt` 去重；仅比较按名次排列的 `[rank, sourceId]`，忽略封面、涨跌元数据及时间戳变化。失败、历史沿用、示例与历史回填不构成新观察；榜单名称、入口或实际采集深度不同时跳过跨范围比较，避免把 100 首扩至 200 首当成平台刷新。非 Apple 来源的明确榜期或源更新时间另记为 `editionChanges`，与排名变化分开；Apple RSS 的请求时间不作榜期变化证据。

每次变化只说明内容在上一次观察 `after` 到首次观察到新版 `by` 之间发生变化，不把 `by` 当作发榜时间。`daily[].changes` 只累计两端都在同一自然日的变化区间；`maxDailyChanges >= 2` 表示同日确实观察到多次变化。次数为采样下限，零次或一次不能证明每日只更新一次。数据源页面展示最新观测，与当前选择的历史榜单日期分开。

日榜计算继续采用当日最新有效快照，涨跌始终比较昨日最后一期。周榜、月榜每个自然日只取最后一份有效快照；平台日内刷新不会重复加票，也不因此修改平台权重。

公开采集请求的单次超时为 **60 秒**，各平台并行采集。连接失败、超时或响应体读取中断，以及 HTTP `408/429/500/502/503/504`，最多额外重试 **2 次**，分别等待 **5 秒、10 秒**，每次重新获得 60 秒请求时限。成功的平台保留结果，只重新请求失败的平台；重试和恢复成功会记录在 Actions 日志中。三次尝试均失败后，按下述历史沿用规则处理，采集步骤仍报告失败。

JSON 解析失败、榜单身份或期次不符、条目不足等数据问题，以及其他 HTTP 错误，直接报告失败。采集阶段最坏等待约 3 分 15 秒，各平台的等待时间不串行累加；构建、Git 提交和 WebSub 通知仍按各自步骤执行。

Actions 使用 Node 的 `--network-family-autoselection-attempt-timeout=2000`，给每个候选 IP 的连接尝试留出 2 秒。[Node 22 默认值为 250 毫秒](https://github.com/nodejs/node/blob/v22.x/doc/api/net.md#netgetdefaultautoselectfamilyattempttimeout)，跨境连接可能在单次请求的 60 秒总时限之前因地址尝试超时而失败。这项配置调整连接阶段的等待时间，继续使用现有的 IPv4 / IPv6 地址选择机制。

## 时间与历史

- `fetchedAt`：实际采集时间。
- `sourceUpdatedAt`：平台明确提供的绝对更新时间，未知为 `null`。
- `sourcePeriod`：平台的日期、期次或周期原文。
- `attemptedAt`：本轮尝试时间；它不更新 `fetchedAt`，也不延长历史观察的有效期。

每日快照记录当时可见的榜单。历史回填保存在 `data/platform-history/`，使用 `ingestion: backfill` 标记；官方历史榜期与第三方存档快照分别标识。第三方快照通过 `provenance` 披露固定版本来源、榜单身份依据及原始时间；未注明的时区保留未知。回填只扩充平台原榜，不生成历史综合日榜或周榜。

## 元数据

原榜保留平台曲目 ID、排名、曲名、艺人、封面、来源链接，以及涨跌与 MV 关联。涨跌优先采用平台官方的较上期数据；缺失时按昨日同平台完整快照比较，明确标为共振计算，双方观察日期须有效。无有效昨日记录时保持未知；原始字段留在 `raw`。此变化与综合涨跌分别计算，具体边界见[日榜方法](methodology.md)。MV 只保留关联标识和已确认的页面地址。

## 失败与历史沿用

这些官方域名上的接口不承诺持续开放。网络、解析或完整性检查失败时，从已保存的真实成功观察中寻找该平台最近一份仍在有效窗口内的完整榜单，包括当天较早的 `data/runs/`，以及 `data/daily/`。只使用 `mode: live`、`status: ok`、`ingestion: public/import` 的观察，不使用示例、事后回填、未来记录或另一份缓存来延长有效期。

可沿用时标记 `status: stale`、`ingestion: cache`，保存本次 `collectionError` 和 `cacheOrigin`，原 `fetchedAt/sourceUpdatedAt/sourcePeriod` 不变。成功观察距本次尝试、源榜期距本次尝试都必须在配置窗口内：汽水 216 小时，其他平台 48 小时。没有时区的日期期次按日历日期差判断，不虚构发榜时刻；未知源时间仍明确为未知，至少限制真实观察年龄。超期或从未采集成功时标记 `error`，不伪造空榜投票，也不以另一榜单代替。

沿用数据参与评分，但采集步骤仍返回失败状态；工作流保留诊断和可发布的榜单后报告失败。`coverage.fresh/cached` 区分本次成功与历史沿用。即使全部六源都有可沿用的记录，`fresh: 0` 也必须披露为全部历史沿用，不能声称实时或本次六源采集成功。字段定义见 [API 文档](api.md)。

### 2026-10-23 失败记录

[14:02 的 Actions 运行](https://github.com/arnoldhao/resonance/actions/runs/39909072896)中，酷我记录 `fetch failed`，汽水触发完整 Top 50 检查。原日志未保存网络底层原因或汽水声明/实收数量，无法据此判定平台永久变更。此前 12:25 的同日观察中两平台均完整成功；诊断时同一公开接口再次分别返回 100、50 首。采集器现保留网络原因代码与汽水声明数量、实收数量、源榜期、状态信息，以便下次定位；完整性门槛继续保留。

[15:39 的 Actions 运行](https://github.com/arnoldhao/resonance/actions/runs/39919174890)进一步记录汽水 `declared=30, received=30`。接口在未指定 `device_platform` 的原生客户端模式下，会根据境外访问筛选并重排歌曲。同一榜期在大陆取得 50 首，新加坡出口取得 30 首；两份列表只有 27 首重合，不能将境外列表当作大陆榜的前 30 名。

请求增加 `device_platform=web` 后，同一新加坡出口的响应仍为 `luna-region: SG`，但 `luna-abroad-type` 从 `2` 变为 `0`，声明数量和实际条目均恢复为 50。歌曲 ID、顺序、榜期与大陆响应一致，`check_sum` 均为 `9e6ca8859546fbbd984579bcaaefae35`（`release_time=1792656000`）。取证通过外部读取服务对照网络出口；生产采集直接请求官方接口。

采集器现明确使用 Web 模式，并在来源元数据中记录同一请求地址。GitHub 托管 runner 可继续使用现有工作流；榜单 ID、周榜周期和完整 50 首的检查保持原要求。

[16:31 的 Actions 运行](https://github.com/arnoldhao/resonance/actions/runs/39925215015)中，汽水采集成功，Apple RSS 请求触发原有的 20 秒超时，沿用 15:39 的成功观察。采集步骤耗时约 21 秒，与该超时边界吻合。单次公开请求时限现放宽到 60 秒，为偶发慢响应保留余量；历史沿用、数据完整性和失败判定规则保持原要求。

[16:38 的 Actions 运行](https://github.com/arnoldhao/resonance/actions/runs/39926041873)中，酷我返回两个 IPv4 地址的 `connect ETIMEDOUT`，以及两个 IPv6 地址的 `ENETUNREACH`。整个采集步骤仅耗时约 2 秒，未触及 60 秒请求总时限。这与 Node 默认 250 毫秒的候选地址连接窗口过短、IPv6 无可用路由的情况吻合；据此将 Actions 中的地址连接窗口放宽到 2 秒，效果待后续采集确认。该日志不能单独证明酷我主动限制 GitHub IP。
