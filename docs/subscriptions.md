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

日条目中，Atom 的 `updated` 和 JSON Feed 的 `date_modified` 使用当前内容连续出现的首次观察时间，从已有 `data/runs/` 记录中取得；内容未变的重复采样不会推动这两个时间。历史重算有新内容时使用记录的 `recomputedAt`，无变化的重算保留原修订时间。周条目使用参与计算和排除的日记录修订时间，也考虑相邻前周对周涨跌比较的影响；周结束后由预览变为完整或缺日时，修订时间至少为下一周一北京时间 00:00。状态、覆盖与实际榜单变化都参与摘要，纯构建时间和 `asOfDate` 不会触发通知。构建只读取源数据，不写额外订阅数据库。

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

客户端先比较清单 `revision`，有变化再按 `entries[].revision` 找到受影响日期，读取对应 `jsonUrl`。同一日期的 JSON 文件是可修订快照，不能假设永不变化。清单与订阅只反映已经部署的版本，不反映 GitHub 尚未部署的工作区。

周条目用 `weekStart`、`weekEnd`、`status` 代替 `date`，并提供 `methodologyVersion: 'weekly-1.0'`、`baseMethodologyVersion`、周 `coverage` 与 `topTen`。同一个 Feed 混合日、周条目，按修订时间倒序排列；程序可按 `kind` 本地筛选。

## 生产地址配置

GitHub Actions 仓库变量：

| 变量 | 设置 |
| --- | --- |
| `SITE_URL` | 生产必填，正式站点根地址，例如实际的 `https://你的项目.pages.dev` 或 `https://charts.example.com`，不带子路径或查询参数。 |
| `WEBSUB_HUB_URL` | 可选，支持下述发布通知方式的 WebSub Hub 地址；不设置也能正常订阅与轮询。 |

本地 `npm run preview` 使用 `http://127.0.0.1:4173` 并构建到 `.preview/`，不会覆盖生产 `dist/`。Actions 始终验证公开 HTTPS `SITE_URL`，拒绝将 localhost 地址发布到生产。`dist/` 初次被 `.gitignore` 排除，由 Actions 用 `git add -f dist/` 首次跟踪，避免手动初次上传混入旧预览产物。更换正式域名也会改变订阅地址与条目 ID；应向已有订阅者提供旧地址重定向，不能仅改变量后假设旧阅读器已迁移。

工作流将数据与构建好的 `dist/` 提交回 GitHub，Cloudflare Pages 通过 Git integration 拉取发布；Cloudflare 构建命令为 `true`，输出目录为 `dist`，监听路径为 `dist/*`。不需要 Cloudflare Token、Account ID、项目名变量或 Deploy Hook。[Cloudflare GitHub integration](https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/)

首次部署先不配置 Hub，等正式域名可访问后再启用，完整步骤见 [部署指南](deployment.md)。不存在域名的 DNS 错误不会被当成 HTTP 404。

## 可选 WebSub 推送

WebSub 由发布者、Hub、订阅者组成。本站只负责发布 Feed、公开 Hub 地址和通知 Hub；阅读器负责订阅、回调验证及续租，Hub 负责分发。本站不存订阅者地址，也不建立订阅数据库。[W3C WebSub](https://www.w3.org/TR/websub/)

配置 `WEBSUB_HUB_URL` 后，Atom 中包含 `rel="hub"` 与规范地址 `rel="self"`。当前只把 `/feed.xml` 作为推送主题；JSON Feed 仍支持普通轮询，没有冒称自己也接入了 Hub。

工作流按以下顺序处理：

1. 验证正式地址、运行测试、采集并构建 Feed。
2. 提交产物前读取线上 `/api/v1/updates.json` 的 revision；404 表示首次发布，其他 HTTP 错误、无效 JSON 和网络错误明确失败。
3. 一次提交 `data/` 和 `dist/`，Cloudflare 异步拉取并部署。
4. 内容 revision 改变时，每 15 秒从正式 `SITE_URL` 读取清单，最多等 5 分钟，直到线上 revision 与本次产物一致。旧版本或 404 可以继续等待；网络错误、其他 HTTP 错误、无效 JSON 或规范地址不一致仍明确失败。无变化时跳过等待与通知。
5. 仅在线上版本核对成功时，向 Hub 发送一次 URL 编码的 POST：`hub.mode=publish`、`hub.url=https://正式站点/feed.xml`。

W3C 将发布者通知 Hub 的具体方式留给双方约定；本实现采用其文档列出的常见 `hub.mode` / `hub.url` 方式，因此应选择支持该方式的 Hub。通知获得 2xx 只表示 Hub 接受请求，不保证全部订阅者已送达。[WebSub Publishing](https://www.w3.org/TR/websub/#publishing)

旧版本读取失败使用 `continue-on-error`，不会阻止数据和产物提交，也不会阻止 Cloudflare 自动部署，但本轮不会猜测旧版本并发送通知。等待超时或 Hub 通知失败也不回滚已完成的采集、提交或部署；工作流最后明确报红，并在 Actions Summary 分别列出采集、构建、Git 提交、旧版本读取和线上核对/通知状态。有限轮询用于等待异步部署完成，Hub POST 本身不自动重试。Hub 不可用时，阅读器可以继续轮询 Feed。

没有配置 Hub 时，工作流提交产物后结束，不等待 Cloudflare；最终部署状态到 Cloudflare Pages 或对应 GitHub 提交的 Cloudflare 检查中查看。构建失败时只提交本轮 `data/` 诊断，不提交失败产物；`dist/*` 监听不会发布这种诊断提交。

通知失败后，新版清单可能已经部署，下一轮默认仍按内容去重，不会自动补发。修复 Hub 或确认正式域名已经显示新版后，可在 **Run workflow** 关闭 `collect`、勾选 `notify_again`，重新构建已有数据并人工补发一次。`notify_again` 默认关闭，仅在手动触发、产物提交步骤成功、读取旧清单成功、正式域名版本核对成功且 Feed 为 `live` 时生效；命令行为 `node scripts/notify.mjs publish <发布前版本文件> --wait --force`。Summary 会标明人工补发。它不要求重新采集，也不代表 Hub 已保证最终送达。

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

`hub.secret` 由订阅程序生成并私下保存，不写入公开 Feed、GitHub 仓库或浏览器页面。取消订阅使用同一主题和回调提交 `hub.mode=unsubscribe`，同样完成意图验证。回调与续租属于外部订阅程序的职责，本站保持纯静态。[WebSub 订阅与验证规则](https://www.w3.org/TR/websub/#subscribing-and-unsubscribing)

## 本地验证与格式依据

`node --test tests/subscriptions.test.mjs` 仅使用临时数据与 mock fetch，检查内容摘要、稳定日/周条目 ID、周状态时间、XML 转义、无变化不通知、正式域名版本核对、人工补发、首次 404、HTTP 错误明确失败；不会访问或通知真实 Hub。

Feed 使用 [Atom RFC 4287](https://www.rfc-editor.org/rfc/rfc4287) 的稳定 ID、发布时间与修订时间，并对文本做 XML 转义；另提供 [JSON Feed 1.1](https://www.jsonfeed.org/version/1.1/) 的纯文本条目，第三方程序无需解析 HTML。核心实现使用 Node.js 内置模块，无额外依赖。
