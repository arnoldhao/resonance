# 显式导入

将可追溯的官方榜单快照保存为 `imports/YYYY-MM-DD/{providerId}.json`，采集时优先使用当天的导入文件，标记 `ingestion: import`。

必需字段：

| 字段 | 内容 |
| --- | --- |
| `providerId` | `qq/netease/kugou/kuwo/apple/qishui`，与文件名一致 |
| `chartName`、`sourceUrl` | 实际榜单名称、官方入口 |
| `fetchedAt` | 本日实际取得数据的 ISO 时间 |
| `sourceUpdatedAt`、`sourcePeriod` | 平台更新时间、期次；未知为 `null` |
| `entries` | 连续名次；QQ、网易云、酷狗、酷我各至少前 200 首，Apple 前 100，汽水前 50；保留至配置窗口 |
| `declaredCount` | 可选，官方声明的整张榜单数量；可以大于本项目保存的窗口，不得小于所需深度 |

每条歌曲包含 `sourceId/title/artists/rank/url`，可选 `album/artwork/sourceMovement/mv`；`artists` 为数组。涨跌与 MV 字段见 [API 文档](../docs/api.md)。

提交后手动运行 Actions 并启用 `collect`。导入仅保存榜单元数据，不包含凭据或音视频文件。
