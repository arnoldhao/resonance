# 采集适配器契约

核实截至北京时间 2026-10-23：当日 00:12 已完成六源同轮本地采集，QQ、网易云、酷狗、酷我、Apple RSS 各 100 首，汽水完整 50 首；4/4 独立来源组有效，方法 1.1 发布综合榜 100 首。GitHub Runner 可达性尚未验证，每轮状态以实际记录为准。

公开 Web 接口不是承诺长期稳定的开发者 API；响应变化会使对应来源明确失败，不使用私有 Cookie、不计算防爬签名，也不切换到不明第三方代理。

## 当前来源

| ID | 实现 | 数据口径 | 当前证据与限制 |
| --- | --- | --- | --- |
| `qq` | 官方 Web JSON，榜单 ID `26` | 热歌榜前 100 | 首次本地采集取得 100 首。官方说明每日更新，固定公布时间未证实。 |
| `netease` | 官方公开歌单 JSON，ID `3778678` | 热歌榜前 100 | 首次本地采集取得 100 首。官方说明为一周热度统计、每日更新，不沿用旧“每周四更新”资料。 |
| `kugou` | 官方移动 JSON，ID `8888`，4 页 | TOP500 的前 100 | 首次本地采集取得 100 首。每页 30 首，跨页期次必须一致；一次响应中的 `10:00:00` 是观测配置。 |
| `kuwo` | 官方榜单 JSON，ID `16` | 酷我热歌榜前 100 | 首次本地采集取得 100 首及榜单日期；固定频率和更新时间尚未确认。 |
| `apple` | 官方 CN `most-played` RSS | 热门歌曲前 100 | 首次本地采集取得 100 首。**不是** `Top 100：中国大陆` 每日歌单，不套用该歌单的日更承诺。 |
| `qishui` | 官方 PC charts JSON，ID `7036274230471712007` | 热歌榜完整前 50，周榜 | 定向无凭据读取确认 50 首、`period=weekly`；本次 `release_time` 为 2026-10-22 北京时间 16:00。 |

`enabled: true` 表示工作流会尝试采集。六个来源当前均启用，GitHub Runner 的可达性仍须由实际工作流确认。

采集与归档保留 QQ、网易云、酷狗、酷我、Apple 各前 100 首，以及汽水完整前 50 首；**方法 1.1 对所有来源统一只使用前 50 名计分**。其余来源的第 51–100 名可在原榜查看，贡献为 0，不能把汽水未公布的第 51–100 名当成已知未上榜。汽水的来源完整性门槛为 50 首、新鲜度窗口为 216 小时（周更加两天宽限）；其余五源为 100 首和 48 小时。

## 官方数据入口

- QQ：[榜单页面](https://y.qq.com/n/ryqq/toplist/26)、[公开 JSON](https://c.y.qq.com/v8/fcg-bin/fcg_v8_toplist_cp.fcg?format=json&topid=26)。顺序取自 `songlist`；本次已核实 `cur_count` 为当前名次、`old_count` 为上期名次。旧版文档中“cur_count 不是排名”的判断已更正。
- 网易云：[榜单页面](https://music.163.com/#/discover/toplist?id=3778678)、[公开 JSON](https://music.163.com/api/playlist/detail?id=3778678)。顺序取自 `result.tracks`，歌曲 `position` 不是榜单排名。
- 酷狗：[榜单页面](https://m.kugou.com/rank/info/?rankid=8888)、[公开 JSON](https://m.kugou.com/rank/info/?rankid=8888&page=1&json=true)。`info.rank_id_publish_date` 用于跨页期次核对。返回时间无时区，原样保存在 `sourcePeriod`。
- 酷我：[榜单页面](https://www.kuwo.cn/rankList)、[公开 JSON](https://kbangserver.kuwo.cn/ksong.s?from=pc&fmt=json&alt=json&show_copyright_off=0&pn=0&rn=100&type=bang&data=content&id=16)。`musiclist` 顺序取排名，`pub` 为来源日期。此端点本次无需 Cookie/CSRF；不会对另一个需要 CSRF 的 H5 接口绕过认证。
- Apple：[官方 RSS Builder](https://rss.marketingtools.apple.com/)、[中国区热门歌曲 RSS](https://rss.marketingtools.apple.com/api/v2/cn/music/most-played/100/songs.json)。RSS 的 `feed.updated` 是 feed 更新时间。另一个产品是 [Top 100：中国大陆](https://music.apple.com/us/playlist/top-100-china/pl.fde851dc95ce4ffbb74028dfd254ced5)，不能把其名称和日更说明挂到 RSS 数据上。
- 汽水：[官方热歌榜 JSON](https://api.qishui.com/luna/pc/charts/7036274230471712007?aid=386088&app_name=luna_pc&region=cn)。普通 GET 无需 Cookie、Authorization、签名或设备 ID；响应 `chart.track_ranks` 顺序对应名次，`chart.release_time` 是 Unix 秒，`chart.period` 为 `weekly`。完整响应为 50 首，不分页伪补 100 首。证据和固定版本参考链接见 [汽水接入记录](qishui-research.md)。

## 返回结构

`scripts/providers.mjs` 导出 `providers` 元数据和 `collectProvider(provider, { now })`。每个采集器返回统一快照：

```json
{
  "providerId": "qq",
  "chartName": "热歌榜",
  "sourceUrl": "https://y.qq.com/n/ryqq/toplist/26",
  "fetchedAt": "2026-10-22T14:17:00.000Z",
  "sourceUpdatedAt": null,
  "sourcePeriod": "2026-10-22",
  "entries": [
    {
      "sourceId": "source-track-id",
      "title": "曲名",
      "artists": ["演唱者"],
      "album": null,
      "artwork": null,
      "url": "https://y.qq.com/n/ryqq/songDetail/source-track-id",
      "rank": 1,
      "sourceMovement": {
        "direction": "same",
        "delta": 0,
        "previousRank": 1,
        "period": "previous-edition",
        "raw": { "cur_count": "1", "old_count": "1" }
      },
      "mv": { "status": "unknown", "items": [] }
    }
  ]
}
```

这段仅是结构示例，不是已采集的真实榜单。

- `fetchedAt`：本次采集的记录时间。
- `sourceUpdatedAt`：只有来源提供完整、可解析的绝对时间时才填写。网易云为来源 `updateTime`；Apple 为 feed 的 `updated`；汽水为 `chart.release_time`（Unix 秒）。
- `sourcePeriod`：来源给出的日期、无时区发布时间或周期原文（汽水为 `weekly`）；不能拿抓取时间补写源更新时间。
- 歌曲 ID 不跨平台互通；跨源合并交给独立的歌曲身份规则。平台没有结构化多艺人字段时，Apple 保留其完整 `artistName`；不按逗号擅自拆分艺人。
- HTTP 请求使用 20 秒超时，不自动重试。HTTP、JSON、接口状态或跨页期次错误均向上抛出，由调度层记录明确失败状态。
- 只读取排行榜元数据与平台提供的封面 URL，不采集音频、歌词或播放令牌。

## 原榜变化与 MV 关联

每条新采集记录保存 `sourceMovement` 与 `mv`。历史记录可能没有这两个字段，缺失代表当时未记录，不能补写成持平或没有 MV。

`sourceMovement` 是**原平台相对上期榜单**的变化，与项目综合榜的跨日 `delta` 分开。`period` 固定为 `previous-edition`；前期不等于昨日，尤其汽水是周榜。

| 字段 | 含义 |
| --- | --- |
| `direction` | `up`、`down`、`same`、`new` 或 `unknown` |
| `delta` | 正数为上升，负数为下降，0 为确认持平；新入榜或无法解释时为 `null` |
| `previousRank` | 可确认或根据明确涨跌推算的上期名次；新入榜或未知为 `null` |
| `raw` | 仅保存与原榜变化相关的白名单标量字段，保留未解码值供后续核对 |

各源当前处理：

| 来源 | 保存字段与解释 |
| --- | --- |
| QQ | `cur_count`、`old_count`。当前与上期均为正整数时计算差值；`old_count=0` 的哨兵含义未确认，保留 `unknown`，不擅自当新入榜。 |
| 网易云 | 官方页面模板以从 0 开始的当前行索引与 `lastRank` 比较，故非负整数转换为 `previousRank = lastRank + 1`。`0` 是上期第一名；负数及缺失值的特殊含义未确认，保留 `unknown`。 |
| 酷狗 | `sort`、`last_sort`。正整数上期名次可计算差值，0、负数或缺失保持 `unknown`。 |
| 酷我 | `rank_change`、`trend`、`isnew`、`highest_rank`。本次 `trend=e0`、`rank_change=0`，未确认方向代码与哨兵规则，保留原值并标为 `unknown`。`highest_rank` 不作为上期排名。 |
| 汽水 | `rank_delta`、`rank_type`、`track_id`。已确认 `up/down/new`；幅度配合方向转换为有符号差值，`new` 不生成虚构上期名次。其他尚未确认的代码保持 `unknown`。 |
| Apple RSS | 未确认源榜变化字段，保存空 `raw` 与 `unknown`。 |

`mv` 的形状为 `{ "status": "linked|none|unknown", "items": [{ "id": "…或null", "hash": "…或null", "url": null }] }`。`linked` 只表示源响应关联了 MV 标识，不承诺可播放、免费或具备下载权限；`none` 仅表示本次响应明确给出空/0 关联；无法确认则 `unknown`。

- QQ 保存 `data.vid`；网易云保存 `mvid`；酷我仅取 `mvpayinfo.vid`，不保存或解释其付费/播放权限对象。
- 酷狗同时检查 `mvdata[].id/hash` 和 `mvhash`，不能因为 `mvhash` 为空就判定没有 MV。不同标识可能指向同一内容或不同编码，不把标识数量宣称为不同 MV 数量。
- 汽水 `vid`、`preview.vid`、`audition_info.vid` 不是已确认的 MV 关联，均不写入 `mv`；Apple RSS 同样保留 `unknown`。
- 当前没有在本轮核实各平台 MV 详情页的 URL 规则，因此 `items[].url` 均为 `null`。不拼接猜测链接，不保存播放地址、播放令牌或原始音频对象。
