# 共振 · RESONANCE

**每天，听见中国的共同频率。**

收集中国音乐平台的热歌榜，留下可追溯的每日快照，计算自己的跨平台综合榜，再用一张轻盈的静态音乐报纸呈现。GitHub Actions 负责采集与归档，Cloudflare Pages 负责展示；没有数据库、服务端或运行时付费 API 依赖。

> 当前页面使用真实采集数据。仓库另带明确标记的设计示例（36 首、7 天），仅在没有真实快照时使用，不会混入真实历史。GitHub Runner 与 Cloudflare 部署尚未验证。

最近本地采集：**2026-10-23 00:32 北京时间，6/6 平台、4/4 来源组成功**，550 条原榜记录，综合榜 100 首，方法版本 1.1。新快照已保存原榜涨跌字段与 MV 关联信息，其中 300 条平台记录带有 MV 标识。

## 已经做好什么

- 综合日榜、综合周榜、独立平台榜、日期／周次回看、搜索和名次变化。
- 歌曲详情：各平台位置、原榜涨跌、MV 关联标识、得分贡献、历史趋势。平台上期变化与综合榜较昨日变化分开展示。
- 公开方法论、来源更新时间、最近采集状态、覆盖缺口。
- JSON/CSV 下载、无需认证且支持跨域的公开 JSON API，保留每轮规范化来源记录以便重新计算。
- 一套工作流完成采集、构建和归档提交，Cloudflare Pages 自动拉取生产产物发布。
- Atom / JSON Feed 公开订阅日榜与周榜；配置 WebSub Hub 后，在确认 Cloudflare 已上线本次内容且榜单内容变化时通知订阅方。
- 六个平台自动采集，汽水使用官方完整 Top 50 周榜；跨平台歌曲合并可通过配置纠正。

## 本地打开

需要 Node.js 22 或以上。核心采集、计算、构建和页面均零第三方依赖，不需要 `npm install`。

```sh
cd /Users/arnold/Projects/resonance
npm run preview
```

访问 `http://127.0.0.1:4173`。预览命令自动构建到 `.preview/`，不覆盖由 Actions 提交的生产 `dist/`。页面通过 HTTP 读取 JSON，不直接用 `file://` 打开。若预览服务已经运行，使用 `node scripts/build.mjs --preview` 更新预览文件即可。

采集真实数据：

```sh
npm run collect
npm run preview
```

其中一个来源失败时，采集命令退出非零并写出诊断。只要有至少 **2 个独立来源组**，仍生成明确标记部分覆盖的综合榜；不足则保留上一期，页面展示本次失败状态。不要因为退出非零就删掉已归档记录。

## 部署到 GitHub Actions + Cloudflare Pages

本项目采用与 [dreamapp-updates](https://github.com/arnoldhao/dreamapp-updates) 相同的 **GitHub Actions 生成并提交 `dist/` → Cloudflare Pages Git integration 自动拉取发布**。完整步骤见 [部署指南](docs/deployment.md)。

1. 把本项目提交到自己的 GitHub 仓库，默认分支使用 `main`。
2. 仓库 **Settings → Secrets and variables → Actions → Variables** 设置 `SITE_URL` 为实际正式 HTTPS 根地址。`WEBSUB_HUB_URL` 可选，首次上线先留空。
3. 允许工作流使用 `contents: write` 向默认分支提交。手动运行 **Actions → Collect charts & publish**，勾选 `collect`，关闭 `notify_again`，生成首次生产 `dist/`。
4. 在已授权 GitHub 的 Cloudflare Pages 中选择此仓库，按下表配置。已有连接直接调整设置即可。

| Cloudflare Pages 设置 | 值 |
| --- | --- |
| Production branch | `main` |
| Framework preset | `None` |
| Build command | `true` |
| Build output directory | `dist` |
| Root directory | 留空 |
| Build watch paths · Include | `dist/*`，替换默认的 `*` |
| Preview branch deployments | 关闭，当前产物使用正式域名 |

不需要在 GitHub 配置 Cloudflare API Token、Account ID、项目名、PAT 或 Deploy Hook。`SITE_URL` 是构建 Feed 绝对链接所需的公开地址；它不是认证信息。这里已有的 `.gitignore` 会忽略尚未跟踪的本地 `dist/`，Action 用 `git add -f dist/` 首次纳入生产产物；之后由 Action 更新。首次连接时若 `dist/` 尚未生成，等待 Action 的产物提交后再看部署结果。

发布顺序为：**测试 → 采集 → 构建网站/API/订阅源 → 提交 `data/` 与 `dist/` → Cloudflare 自动拉取发布 → 可选 WebSub 通知**。代码 push 触发重新构建；定时或手动勾选 `collect` 才访问音乐源站。机器人使用 `GITHUB_TOKEN` 提交不会递归触发另一轮 Actions，但 Cloudflare Git integration 会处理该提交。CF 根据新提交触发，并不是等待整个 Action 结束才开始。

启用 Hub 后，在 push 前记录线上订阅版本；push 后仅在需要通知时等待正式网站出现目标 revision，最多 5 分钟、每 15 秒检查一次。确认新版可读才通知 Hub；超时或真实请求错误会明确失败，不发送未上线内容。未配置 Hub 时，Action 提交完成即可结束，最终部署状态在 Cloudflare 查看。Atom 和 JSON Feed 的阅读器轮询订阅始终可用。详情见 [订阅文档](docs/subscriptions.md)。

计划时间为北京时间 **09:17、15:17、21:17**，对应 UTC `01:17、07:17、13:17`。这是采样计划，GitHub 实际执行可能延迟；每日文件保留当天最后一次满足发布门槛的快照，每轮记录另存。[GitHub 调度说明](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule) · [Cloudflare Git integration](https://developers.cloudflare.com/pages/configuration/git-integration/)

## 榜单与时间

核实日期：**2026-10-22—23**。证据与响应字段见 [sources.md](docs/sources.md)，适配器约定见 [providers.md](docs/providers.md)。

| 平台 | 选用榜单 | 更新情况 | 接入情况 |
| --- | --- | --- | --- |
| QQ 音乐 | 热歌榜 `26` | 官方说明每日更新；时刻未披露 | 已实现公开 JSON 适配器 |
| 网易云音乐 | 热歌榜 `3778678` | 近一周统计、每日更新；时刻未披露 | 已实现公开 JSON 适配器 |
| 酷狗音乐 | TOP500 `8888` 的前 100 | 每日更新；本次配置显示 10:00，时区及长期承诺未确认 | 已实现公开 JSON 分页适配器 |
| 酷我音乐 | 热歌榜 `16` | 可读榜期日期，固定频率和时刻未确认 | 已实现公开 JSON 适配器 |
| Apple Music | 中国区 `most-played` RSS | 固定时刻未披露；不同于每日 Top 100 歌单 | 已成功采集前 100 首 |
| 汽水音乐 | 官方热歌榜 `7036274230471712007` | 周榜；本期发布于 2026-10-22 北京时间 16:00，固定时刻未确认 | 无认证公开接口，完整 50 首 |

QQ、网易云、酷狗、酷我与 Apple RSS 已在本机取得各前 100 首。汽水依据用户提供的 music-lib 线索确认官方 PC 榜单接口，详细见 [汽水研究](docs/qishui-research.md)；[来源扩充评估](docs/source-expansion.md)建议咪咕先作为观察候选。公开 Web 端点不是稳定性承诺，覆盖情况以每次采集状态为准。Apple 的 Daily Top 100 中国大陆歌单确实标注日更，本项目不将该声明套到 RSS 上。

## 综合榜怎么计算

完整推导、权重、身份规则见 [methodology.md](docs/methodology.md)。默认权重是产品设计选择，不是市场份额估计：

| 来源组 | 原始权重 | 组内规则 |
| --- | ---: | --- |
| 腾讯音乐：QQ / 酷狗 / 酷我 | 40% | 健康平台均分组内权重 |
| 网易云音乐 | 30% | 独立来源组 |
| Apple Music 中国区 | 20% | 独立来源组 |
| 汽水音乐 | 10% | 独立来源组，官方周榜每日采样 |

方法 **1.1** 统一各平台前 **50** 名计分，综合榜发布前 **100**。原榜仍保留其他五个平台各 100 首、汽水完整 50 首。名次 `r ≤ 50` 的基础分为 `0.9 × exp(−(r−1)/25) + 0.1`，其余为 0；最终得分为各平台基础分乘有效权重再乘 100。指数部分重视头部，10% 的入榜底分奖励跨平台共识。独立来源组不足两个时不发综合榜；任何缺源都显示部分覆盖。历史方法 1.0 保留原口径，不跨版本生成昨日涨跌。

该分数不是播放量，也不是全中国听众的代表性抽样。来源集合、公式或歌曲映射变化时，不生成可疑的较昨日涨跌。

## 综合周榜

按北京时间**周一至周日**汇总各日最后一份有效快照，周分数为同口径有效日得分的平均值。每个有效日都从完整来源记录重建全部计分候选，再计算周 Top 100；不会把未进入日榜 Top 100 的曲目提前丢掉。歌曲在一个有效日未进入任何平台计分窗口时，该日计 0 分；缺失日和口径变化而排除的日期不进入分母。

本周始终标为「本周预览」，到下周构建时，7 天齐全才标为「完整周榜」，否则标为「缺日周榜」。完整周指日期齐全，平台覆盖另行显示。只有相邻两周都完整、来源／方法／歌曲身份口径相同，才展示「较上周」涨跌；原榜涨跌、综合日榜涨跌和综合周榜涨跌各自保留。

当前只有 10 月 22、23 日两份真实日榜，且 22 日仍是方法 1.0，不能混入最新 1.1 的周计算。因此当前周是 **1/7 个有效日的预览**。周榜由每日归档在构建时自动生成，不需要额外定时任务；公式、覆盖字段与关闭周的规则见 [周榜文档](docs/weekly.md)。

## 数据与再计算

```text
scripts/providers.mjs     平台读取适配器和元数据
scripts/ranking.mjs       身份归一、权重、计分、可比性规则
scripts/weekly.mjs        从完整日记录重建候选、汇总综合周榜
scripts/collect.mjs       每轮采集、状态记录、每日归档
scripts/recompute.mjs     不联网，重算已发布日榜
scripts/api.mjs           从发布快照生成公开静态 JSON API
scripts/feeds.mjs         生成 Atom、JSON Feed 与内容修订清单
scripts/notify.mjs        push 前记录版本、等待线上新版后通知 WebSub
config/aliases.json      歌手别名和明确的歌曲合并/拆分
data/runs/日期/时刻.json   每轮规范化来源行 + 当次计算，保留不修改
data/daily/日期.json       当天最后一次有效快照（衍生榜，可重算）
data/latest.json          最近一期有效榜
data/status.json          最近一轮采集状态，即使失败也更新
data/dates.json           真实日榜日期索引
imports/日期/平台.json    显式导入的榜单快照
demo/                    与真实档案隔离的设计示例
site/                    无框架静态页面
dist/                    Actions 生成并提交，Cloudflare Pages 直接发布
.preview/                本地预览生成目录，不提交
```

修改 `scripts/ranking.mjs` 的算法时同步提升 `methodology.version`；修改歌曲映射后执行：

```sh
npm run recompute
npm run preview
```

重算只更改已发布的衍生日榜，不重新抓取、不改变 `data/runs/` 的原始观察。新旧映射签名不同，自动避免直接比较不同口径。重算后的数据需提交才能进入部署。

每个日榜 JSON 含规范化来源原榜（100/50 首）、源链接/期次/采集时间、得分贡献和排名；可用于后续分析。站点发布 `data/latest.json`、`data/latest.csv` 和 `data/daily/YYYY-MM-DD.json`，不将全部运行档案打包到站点。不抓取音频和歌词。

## 公开 API

网站的「开放 API」页面提供同域地址和可直接复制的调用示例。所有接口为静态 JSON，无需注册或认证，允许跨域 GET：

- `/api/v1/index.json`：接口目录与平台列表。
- `/api/v1/charts/latest.json`：最新综合榜。
- `/api/v1/charts/YYYY-MM-DD.json`：指定日期综合榜。
- `/api/v1/weekly/latest.json`：本周综合榜预览。
- `/api/v1/weekly/index.json`、`/api/v1/weekly/YYYY-MM-DD.json`：周次目录与指定周榜，日期为周一。
- `/api/v1/platforms/qishui/latest.json`：汽水原榜；平台 ID 可替换为 `qq`、`netease`、`kugou`、`kuwo`、`apple`。
- `/api/v1/platforms/qishui/YYYY-MM-DD.json`：指定日期的平台原榜。
- `/api/v1/dates.json`、`/api/v1/status.json`、`/api/v1/methodology.json`：日期、采集状态与计算方法。

完整字段与错误语义见 [API 文档](docs/api.md)。接口读取不会触发采集，数据随 GitHub Actions 构建一起更新。

新记录的 `sourceMovement` 保存平台原榜相对上期的变化与原字段，`mv` 保存 MV 关联标识，`combinedMovement` 保存综合日榜相对昨日的变化，周榜 `weeklyMovement` 保存综合周榜相对上周的变化。历史缺失字段不补造。MV ID 只代表关联，未知官方链接保留为空，不采集媒体文件或临时播放凭据。

## 订阅更新

将 `https://你的域名/feed.xml` 加入支持 Atom 的 RSS 阅读器即可订阅；也提供 `feed.json`（JSON Feed 1.1）与 `/api/v1/updates.json`（机器读取的修订清单）。日榜、周榜均使用稳定的条目 ID，同期修订更新原条目，单纯采集时间变化不触发新内容通知。周预览会随有效日记录修订，周结束后状态会更新。

需要主动推送的外部服务可通过已配置的 WebSub Hub 订阅 Atom 地址，Hub 负责订阅验证与投递；项目仍是静态站点，不存订阅者名单。它不是浏览器系统通知或邮件订阅服务。没有 Hub 时，阅读器定期拉取即可。

## 交付边界

这个目录是完整的本地项目与部署配置，已在本机采集、构建并查看真实数据，尚未为这个项目创建远程仓库或验证其 Cloudflare 发布。远程工作流的可达性和部署结果需在配置账户后确认；真实覆盖情况直接显示在页面、公开 API 和 Actions Summary。
