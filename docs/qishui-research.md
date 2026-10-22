# 汽水热歌榜接入记录

研究与定向读取日期：2026-10-23（北京时间）。参考 [guohuiyuan/music-lib](https://github.com/guohuiyuan/music-lib/tree/6353508e84cd357b5bc3acf32d95a16e01bbe20c)，固定提交为 `6353508e84cd357b5bc3acf32d95a16e01bbe20c`。

## 已确认的官方数据

一次无凭据 GET 成功取得 [官方热歌榜 JSON](https://api.qishui.com/luna/pc/charts/7036274230471712007?aid=386088&app_name=luna_pc&region=cn)。只传普通 User-Agent 与 Accept；没有 Cookie、Authorization、签名、设备 ID 或登录态。

| 字段 | 本次响应 |
| --- | --- |
| 读取时间 | 2026-10-23 00:04:13 北京时间 |
| `chart.id` | `7036274230471712007` |
| `chart.title` | 热歌榜 |
| `chart.period` | `weekly` |
| `chart.count_tracks` | 50 |
| 实际曲目 / 不同曲目 ID | 50 / 50 |
| `chart.release_time` | `1792656000`，即 2026-10-22 16:00:00 北京时间 |
| 前三首 | 分手已经. . . - Inst.（복이）、甲乙丙丁（你我怎么两清）（李佳薇）、茶汤（郁可唯） |

这是完整的 **Top 50 周榜**，没有获取到 Top 100，不应伪补后 50 名。官方响应证实周周期；参考库内置说明是每周四更新，本次发布确实是周四 16:00，但单次观测不是未来每周固定时刻的保证。项目每日采集的是当时公开的周榜快照。

`release_time` 是榜单发布时间（Unix 秒），写入 `sourceUpdatedAt`；`sourcePeriod` 保留 `weekly`。`status_info.now` 是响应时间，不能冒充发榜时间。成功响应没有 `status_code` 字段，仅有 `status_info` 与 `chart`。本次每条 `rank` 对象只有涨跌信息，没有绝对名次，按 `track_ranks` 数组顺序取第 1–50 名。

## 参考实现与边界

- [正式 charts 端点、热歌榜 ID 与内置榜单说明](https://github.com/guohuiyuan/music-lib/blob/6353508e84cd357b5bc3acf32d95a16e01bbe20c/soda/toplist.go#L17-L59)。
- [PC 榜单请求](https://github.com/guohuiyuan/music-lib/blob/6353508e84cd357b5bc3acf32d95a16e01bbe20c/soda/toplist.go#L231-L242)：普通 GET，与会员音频签名请求不同。
- [请求头构造](https://github.com/guohuiyuan/music-lib/blob/6353508e84cd357b5bc3acf32d95a16e01bbe20c/soda/soda.go#L1572-L1583)：Cookie 为可选。本项目的定向请求进一步确认不需要这些应用专用请求头。
- [响应字段定义](https://github.com/guohuiyuan/music-lib/blob/6353508e84cd357b5bc3acf32d95a16e01bbe20c/soda/toplist.go#L431-L455)与 [README 的完整 50 首示例](https://github.com/guohuiyuan/music-lib/blob/6353508e84cd357b5bc3acf32d95a16e01bbe20c/README.md#L378-L385)。

参考库同时包含推荐歌单聚合、跨接口 fallback、音频下载、解密与会员能力；这些没有进入本项目。这里只依据官方公开响应独立编写已有 Node.js 适配器，未运行该仓库代码、未引入 Go 或 music-lib 依赖、未复制其 AGPL 源码。只读取排名及歌曲元数据，不保存播放地址、音频或鉴权材料。

适配器按本次确证的正式榜单 ID 读取，要求 `weekly` 与完整 50 首；失败明确上报，不切换推荐歌单、用户歌单或第三方服务。采集层保留其他平台前 100 首与汽水完整前 50 首；方法 1.1 使用所有平台共同的前 50 名计分窗口，其他平台第 51–100 名仍可查看但不参与综合计分。汽水配置 `collectionDepth: 50`、`maxAgeHours: 216`（周更加两天宽限）；其他来源保留 48 小时新鲜度门槛。

上述核验记录用于说明榜单身份、响应结构和统计周期。接口的持续可用性以每次采集结果为准。
