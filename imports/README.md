# 显式导入

用合法取得、可追溯到官方榜单的快照补充汽水或临时不可访问的平台。不要把用户歌单、抖音榜或其他榜单改名后导入。

路径：`imports/YYYY-MM-DD/<providerId>.json`，日期按北京时间。支持 `qq`、`netease`、`kugou`、`kuwo`、`apple`、`qishui`。本日存在导入文件时，明确优先使用它，网站记录 `ingestion: import`。旧日期的文件不会用于今天。

字段见 [适配器契约](../docs/providers.md)。文件需含该平台完整采集窗口的连续名次：汽水 50 首、其他平台 100 首，以及真实曲名/艺人/平台 ID/来源 URL。`providerId` 必须和文件名一致；`fetchedAt` 是真实取得数据的 ISO 时间，必须位于本日；`sourceUpdatedAt` 不知道时用 `null`，`sourcePeriod` 保留官方期次，不得拿导入时间代替。`chartName` 与 `sourceUrl` 记录实际榜单名称和官方入口。汽水现已接通自动采集，导入仍可用于明确的手工快照。

提交文件后在 Actions 手动运行并开启 `collect`，其他来源仍正常采集。同一平台只保留一张榜参与计算。不要提交 Cookie、Access Token、完整浏览器导出或任何凭据。

可按 [API 契约](../docs/api.md)提供每条曲目的 `sourceMovement` 与 `mv`。它们是平台上期涨跌和 MV 关联信息，不能填入综合榜涨跌；只有已核实的方向、前期名次、MV 标识和官方页面链接才规范化，其他相关原字段保存在 `sourceMovement.raw`。不提供这两个对象时显示“未记录”，不推断为持平或没有 MV。
