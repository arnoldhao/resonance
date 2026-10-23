# 更新订阅

| 地址 | 用途 |
| --- | --- |
| `/feed.xml` | Atom，可添加到 RSS 阅读器 |
| `/feed.json` | JSON Feed 1.1 |
| `/api/v1/updates.json` | 程序读取内容修订清单 |

均为公开读取，无需认证。订阅保留最近 30 期日榜、8 期有有效歌曲的周榜，包含 Top 10、覆盖范围、方法版本及完整榜单链接。

每期使用稳定条目 ID，同期内容变化更新原条目。本周预览随有效日榜补入而修订；空周和未达到发布门槛的采集不生成新条目。平台历史回填不进入订阅。

程序可比较清单及 `entries[].revision`，读取变化条目的 `jsonUrl`；`kind` 区分 `daily` 和 `weekly`。纯采集或构建时间变化不会触发内容修订。阅读器是否提醒同一条目的更新，由阅读器决定。

## WebSub

Atom 提供 `rel="hub"` 时，支持 WebSub 的客户端可以通过 Hub 接收推送，主题为 `rel="self"` 指向的 Feed 地址。本站不收集订阅者地址；未配置 Hub 时仍可轮询。

自建客户端的订阅、回调验证和续租遵循 [W3C WebSub](https://www.w3.org/TR/websub/)。订阅源格式采用 [Atom](https://www.rfc-editor.org/rfc/rfc4287) 与 [JSON Feed 1.1](https://www.jsonfeed.org/version/1.1/)。
