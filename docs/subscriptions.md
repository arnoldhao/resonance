# 订阅榜单更新

把站点的 `/feed.xml` 添加到支持 RSS / Atom 的阅读器，就能接收每日综合榜和每周汇总。支持 JSON Feed 的应用可订阅 `/feed.json`。两个地址都公开读取，不需要账户、API Key 或 Cookie。

订阅保留最近 30 个已发布日期和最近 8 个有有效歌曲的周榜。每期包含 Top 10、覆盖范围、方法版本，以及完整榜单 JSON 链接。日榜显示覆盖平台与来源组数量；周榜显示日期范围、有效天数、无快照日期、排除日期和来源覆盖。没有达到发布门槛的采集不会变成一条虚假的新日榜；失败详情仍在 `/api/v1/status.json`。

## 条目与更新规则

一天只有一个稳定条目 ID，组成是站点地址、榜单日期与 `live` / `demo` 模式。同一天的修订更新原条目，不额外生成一条“新一期”；次日发布产生新的日期条目。示例明确标为 `demo`，不会发送 WebSub 真实榜单通知。

周条目的 `kind` 为 `weekly`，稳定 ID 使用 `/api/v1/weekly/{weekStart}.json#live`，日条目的 `kind` 为 `daily`。本周每次补入有效日榜都会修订同一个周条目。标题按 `status` 标为“本周预览（provisional）”“完整周榜（complete）”或“缺日周榜（incomplete）”。完全没有有效日榜的空周仍可通过 API 查看状态，但不进入订阅。周榜是本站按有效日榜计算的汇总，不代表各音乐平台都发布了同周期的周榜。

每个日期的 `revision` 是内容摘要。综合排名、曲目身份、分数、来源名次、来源状态、覆盖范围、方法版本和平台期次等内容改变，都会改变摘要。以下纯观察时间不参与摘要：

- 所有 `fetchedAt`、`generatedAt`、`recomputedAt`，以及周榜的观察日期 `asOfDate`。
- 仅 Apple 来源的 `sourceUpdatedAt`：RSS feed 更新时间可能随读取刷新，排名未变时不因此发通知。

其他来源的 `sourceUpdatedAt` 保留在摘要里，尤其汽水的 `release_time` 转换值用于区别周榜期次，不能与纯采集时间一起忽略。比较覆盖的是完整发布快照，不限于订阅正文展示的 Top 10；例如第 30 名发生变化也会更新 revision。

日条目中，Atom 的 `updated` 和 JSON Feed 的 `date_modified` 使用当前内容连续出现的首次观察时间；内容未变的重复采样不会推动这两个时间。历史重算有新内容时使用记录的 `recomputedAt`，无变化的重算保留原修订时间。周条目使用参与计算和排除的日记录修订时间，也考虑相邻前周对周涨跌比较的影响；周结束后由预览变为完整或缺日时，修订时间至少为下一周一北京时间 00:00。状态、覆盖与实际榜单变化都参与摘要，纯构建时间和 `asOfDate` 不会触发通知。

这是榜单内容订阅，不是实时播放数据。最终是否把同一条目的修订提醒给用户，由阅读器决定；普通阅读器也可能按自己的频率轮询。

## 机器更新清单

`GET /api/v1/updates.json` 提供：

```js
{
  schemaVersion: 1,
  mode: 'live',
  date: '2026-10-23',
  revision: '整个订阅内容的 SHA-256',
  updatedAt: '最后一个有内容修订的时间',
  siteUrl: 'https://your-project.pages.dev',
  feedUrl: 'https://your-project.pages.dev/feed.xml',
  jsonFeedUrl: 'https://your-project.pages.dev/feed.json',
  hubUrl: null,
  entries: [{
    id: 'https://your-project.pages.dev/api/v1/charts/2026-10-23.json#live',
    kind: 'daily', date: '2026-10-23', mode: 'live', revision: '本期内容 SHA-256',
    publishedAt: '本期首次有效观察时间',
    updatedAt: '当前修订首次观察时间',
    title: '共振 · 2026-10-23 综合热歌榜',
    jsonUrl: 'https://your-project.pages.dev/api/v1/charts/2026-10-23.json',
    coverage: { /* 可用平台、来源组与覆盖状态 */ },
    methodologyVersion: '1.1',
    topTen: [ /* rank、id、title、artists、score */ ],
    summary: '阅读器使用的纯文本摘要'
  }]
}
```

客户端先比较清单 `revision`，有变化再按 `entries[].revision` 找到受影响日期，读取对应 `jsonUrl`。同一日期的 JSON 文件是可修订快照，不能假设永不变化。清单与订阅只反映本站已经公开发布的内容。

周条目用 `weekStart`、`weekEnd`、`status` 代替 `date`，并提供 `methodologyVersion: 'weekly-1.0'`、`baseMethodologyVersion`、周 `coverage` 与 `topTen`。同一个 Feed 混合日、周条目，按修订时间倒序排列；程序可按 `kind` 本地筛选。

## 可选 WebSub 推送

支持 WebSub 的阅读器可通过 Hub 接收更新。阅读器负责订阅、回调验证及续租，Hub 负责分发；本站不收集订阅者地址。[W3C WebSub](https://www.w3.org/TR/websub/)

当 Atom 中提供 `rel="hub"` 时，可使用该 Hub，并以 `rel="self"` 指向的规范地址作为订阅主题。当前推送主题仅为 `/feed.xml`；JSON Feed 使用普通轮询。未提供 Hub 或 Hub 暂时不可用时，仍可定期读取 Feed。

WebSub 通知对应已经公开发布的内容更新；内容没有变化时不通知。推送不保证阅读器立即提醒，客户端仍应使用条目 ID 与 `revision` 去重，并可通过轮询获取最新内容。

### 外部程序订阅 Hub

普通阅读器只需填写 `/feed.xml`，不需要配置下面的回调。自行开发订阅程序时，先从 Atom 的 `rel="hub"` 和 `rel="self"` 取得实际 Hub 与主题地址，再提供一个可从公网访问的回调端点。以下仅是占位示例，不会由本站自动执行：

```sh
curl --fail --request POST 'https://YOUR-HUB.example/' \
  --data-urlencode 'hub.mode=subscribe' \
  --data-urlencode 'hub.topic=https://YOUR-SITE.example/feed.xml' \
  --data-urlencode 'hub.callback=https://YOUR-APP.example/websub/callback' \
  --data-urlencode 'hub.lease_seconds=86400' \
  --data-urlencode 'hub.secret=REPLACE_WITH_PRIVATE_RANDOM_SECRET'
```

Hub 的 202 响应只表示请求进入处理。订阅程序还需要：

- 接收 Hub 发往回调的验证 GET，检查 `hub.mode` 和 `hub.topic` 对应自己发起的待确认订阅，再以 2xx、`text/plain` 原样返回 `hub.challenge`。
- 保存 Hub 确认的 `hub.lease_seconds`，在租约到期前重新提交订阅；Hub 可以调整请求中的租期。
- 接收交付 POST。配置了 `hub.secret` 时，按 `X-Hub-Signature` 声明的算法和共享 secret 对**原始请求正文**做 HMAC 核验，不对解析后重新序列化的 XML 计算；收到交付后及时返回 2xx。

`hub.secret` 由订阅程序生成并私下保存，不写入公开 Feed、公开代码仓库或浏览器页面。取消订阅使用同一主题和回调提交 `hub.mode=unsubscribe`，同样完成意图验证。回调与续租属于外部订阅程序的职责。[WebSub 订阅与验证规则](https://www.w3.org/TR/websub/#subscribing-and-unsubscribing)

## 格式依据

Feed 使用 [Atom RFC 4287](https://www.rfc-editor.org/rfc/rfc4287) 的稳定 ID、发布时间与修订时间，并对文本做 XML 转义；另提供 [JSON Feed 1.1](https://www.jsonfeed.org/version/1.1/) 的纯文本条目，第三方程序无需解析 HTML。
