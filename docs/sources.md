# 数据来源

| 平台 | 官方榜单 | 榜单 ID | 保留深度 | 更新周期 |
| --- | --- | --- | ---: | --- |
| QQ 音乐 | [热歌榜](https://y.qq.com/n/ryqq/toplist/26) | `26` | 100 | 每日 |
| 网易云音乐 | [热歌榜](https://music.163.com/discover/toplist?id=3778678) | `3778678` | 100 | 每日，统计窗口为一周 |
| 酷狗音乐 | [TOP500](https://www.kugou.com/yy/rank/home/1-8888.html) | `8888` | 100 | 每日 |
| 酷我音乐 | [热歌榜](https://m.kuwo.cn/newh5app/ranklist) | `16` | 100 | 保存平台返回的日期期次 |
| Apple Music | [中国区 most-played RSS](https://rss.marketingtools.apple.com/api/v2/cn/music/most-played/100/songs.json) | `cn/music/most-played` | 100 | 以 RSS 时间为准 |
| 汽水音乐 | [官方热歌周榜](https://api.qishui.com/luna/pc/charts/7036274230471712007?aid=386088&app_name=luna_pc&region=cn) | `7036274230471712007` | 50 | 每周 |

北京时间 **09:17、15:17、21:17** 计划采样，GitHub Actions 实际运行可能延迟。采样时间不等于平台发榜时间；没有确认的固定发榜时刻不作推定。Apple RSS 与「Top 100：中国大陆」歌单是不同产品，汽水每天采样仍保持周榜口径。

## 时间与历史

- `fetchedAt`：实际采集时间。
- `sourceUpdatedAt`：平台明确提供的绝对更新时间，未知为 `null`。
- `sourcePeriod`：平台的日期、期次或周期原文。
- `attemptedAt`：本轮尝试时间；它不更新 `fetchedAt`，也不延长历史观察的有效期。

每日快照记录当时可见的榜单。历史回填保存在 `data/platform-history/`，使用 `ingestion: backfill` 标记；官方历史榜期与第三方存档快照分别标识。第三方快照通过 `provenance` 披露固定版本来源、榜单身份依据及原始时间；未注明的时区保留未知。回填只扩充平台原榜，不生成历史综合日榜或周榜。

## 元数据

原榜保留平台曲目 ID、排名、曲名、艺人、封面、来源链接，以及平台提供的涨跌与 MV 关联。原榜涨跌相对平台上期，与综合榜涨跌分别计算；未确认的方向显示未知。MV 只保留关联标识和已确认的页面地址。

## 失败与历史沿用

这些官方域名上的接口不承诺持续开放。网络、解析或完整性检查失败时，从已保存的真实成功观察中寻找该平台最近一份仍在有效窗口内的完整榜单，包括当天较早的 `data/runs/`，以及 `data/daily/`。只使用 `mode: live`、`status: ok`、`ingestion: public/import` 的观察，不使用示例、事后回填、未来记录或另一份缓存来延长有效期。

可沿用时标记 `status: stale`、`ingestion: cache`，保存本次 `collectionError` 和 `cacheOrigin`，原 `fetchedAt/sourceUpdatedAt/sourcePeriod` 不变。成功观察距本次尝试、源榜期距本次尝试都必须在配置窗口内：汽水 216 小时，其他平台 48 小时。没有时区的日期期次按日历日期差判断，不虚构发榜时刻；未知源时间仍明确为未知，至少限制真实观察年龄。超期或从未采集成功时标记 `error`，不伪造空榜投票，也不以另一榜单代替。

沿用数据参与评分，但采集步骤仍返回失败状态；工作流保留诊断和可发布的榜单后报告失败。`coverage.fresh/cached` 区分本次成功与历史沿用。即使全部六源都有可沿用的记录，`fresh: 0` 也必须披露为全部历史沿用，不能声称实时或本次六源采集成功。字段定义见 [API 文档](api.md)。

### 2026-10-23 失败记录

[14:02 的 Actions 运行](https://github.com/arnoldhao/resonance/actions/runs/39909072896)中，酷我记录 `fetch failed`，汽水触发完整 Top 50 检查。原日志未保存网络底层原因或汽水声明/实收数量，无法据此判定平台永久变更。此前 12:25 的同日观察中两平台均完整成功；诊断时同一公开接口再次分别返回 100、50 首。采集器现保留网络原因代码与汽水声明数量、实收数量、源榜期、状态信息，以便下次定位；完整性门槛继续保留。
