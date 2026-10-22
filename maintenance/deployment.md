# 部署与发布维护

GitHub Actions 负责采集、测试、构建，并将 `data/` 与 `dist/` 提交到生产分支。Cloudflare Pages 通过 Git integration 拉取 `dist/` 发布。网站、JSON API 和订阅 Feed 均为静态产物。

## GitHub Actions 配置

运行环境为 Node.js 22，工作流使用仓库自带的 `GITHUB_TOKEN` 提交文件，权限为 `contents: write`。仓库或组织的 Actions 策略、生产分支规则须允许该归档流程写入。默认生产分支为 `main`。[GitHub Actions 权限说明](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository)

在 **Settings → Secrets and variables → Actions → Variables** 配置 Repository variables：

| 变量 | 要求 |
| --- | --- |
| `SITE_URL` | 必填。实际公开 HTTPS 站点根地址，无子路径、查询参数或凭据，例如 `https://charts.example.com`。 |
| `WEBSUB_HUB_URL` | 可选。支持 `hub.mode=publish` / `hub.url` 的 WebSub Hub 地址；未设置时阅读器仍可轮询 Feed。 |

不需要 Cloudflare API Token、Account ID、项目名变量、个人访问令牌或 Deploy Hook。`SITE_URL` 决定订阅绝对链接与条目 ID，不应使用 localhost 或临时部署预览地址。

**Actions → Collect charts & publish → Run workflow** 提供两个选项：

- `collect=true`：采集新快照；关闭时仅重新构建已有数据。
- `notify_again=true`：人工补发 WebSub，默认关闭，可与 `collect=false` 配合使用。

工作流顺序为验证地址 → 测试 → 采集 → 构建 → 可选读取旧订阅版本 → 提交数据与产物 → 可选等待上线并通知。测试失败停止后续处理；构建失败时仅归档采集数据，不提交失败产物。

## Cloudflare Pages 配置

创建 Git integration 项目，授权 Cloudflare Workers & Pages GitHub App 访问目标仓库，并使用以下设置：[Cloudflare Git integration 指南](https://developers.cloudflare.com/pages/get-started/git-integration/)

| 设置 | 值 |
| --- | --- |
| Production branch | `main` |
| Framework preset | `None` |
| Build command | `true` |
| Build output directory | `dist` |
| Root directory | 留空（仓库根目录） |
| Build watch paths：Include | `dist/*` |
| Build watch paths：Exclude | 留空 |
| 自动生产部署 | 开启 |
| Preview branches | `None`，关闭自动分支预览 |

Cloudflare 直接发布已生成的文件，不再次运行榜单构建。`dist/*` 可以匹配嵌套路径，使源代码提交先由 Actions 生成产物，产物提交再触发发布。[构建监听路径](https://developers.cloudflare.com/pages/configuration/build-watch-paths/)

首次连接前应配置 `SITE_URL` 并完成一次 Actions 构建，使仓库包含 `dist/index.html`、`dist/api/v1/charts/latest.json` 和 `dist/feed.xml`。如果初次连接时产物尚不存在，该次部署可能失败；后续产物提交会重新触发部署。

`GITHUB_TOKEN` 提交不会再次触发同仓库的 `push` Actions；Cloudflare GitHub App 仍通过 Git integration 接收提交。产物提交不能带 `[skip ci]` 等标记，否则 Cloudflare 也会跳过构建。[GitHub token 触发规则](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow#triggering-a-workflow-from-a-workflow)、[Cloudflare 跳过构建规则](https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/#skipping-a-build-via-a-commit-message)

## 生产产物与本地预览

`.gitignore` 保留 `dist/`，避免初次上传混入本地预览产物。Actions 使用 `git add -f dist/` 首次跟踪生产文件，此后继续更新。普通 `npm run build` 输出 `dist/`；生产构建由 Actions 执行。

本地运行 `npm run preview` 会自动构建并服务 `.preview/`，不会覆盖生产 `dist/`。`.preview/` 不进入版本控制。修改代码前应拉取 Actions 已提交的数据与产物，避免推送冲突。

计划采样使用 UTC cron `17 1,7,13 * * *`，对应上海时间每天 **09:17、15:17、21:17**。计划任务只在默认分支执行，可能延迟；公开仓库长期无活动时可能被自动停用。这些时间是采样计划，不是平台发榜承诺。[GitHub schedule 规则](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)

## 发布状态与 WebSub

Cloudflare 部署是异步的。Git 提交成功仅表示产物进入仓库；部署结果见 Pages 的 **Deployments** 或对应提交的 **Cloudflare Pages** 检查。线上 `/api/v1/charts/latest.json` 表示最后有效发布榜单，`/api/v1/status.json` 表示最近采集状态，两者日期可以不同。[Cloudflare GitHub 检查](https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/#check-runs)

未配置 Hub 时，工作流提交产物后结束。配置 Hub 后，内容变化会触发以下过程：

1. 提交前读取线上 `/api/v1/updates.json` 的旧 revision。
2. 提交产物，由 Cloudflare 异步发布。
3. 每 15 秒检查正式域名，最多等待 5 分钟，直到线上 revision 与本次产物一致。
4. 匹配后发送一次 Hub 通知；内容未变时跳过。

旧清单 HTTP 404 可视为首次发布；DNS 错误、其他 HTTP 错误、无效 JSON 或规范地址不一致明确失败。首次启用 Hub 应在正式域名已可访问之后。等待超时或 Hub 失败不会回滚已提交数据或部署；修复后可使用 `collect=false`、`notify_again=true` 人工补发。Hub 的 2xx 仅表示接受请求，不保证订阅者已收到。详见[订阅文档](../docs/subscriptions.md)。

自定义域名须先在 Pages **Custom domains** 中关联，并完成 DNS 与 HTTPS 配置，再更新 `SITE_URL` 并重新构建。域名变化会改变订阅地址与条目 ID，应保留旧地址重定向或提供迁移说明。[Cloudflare 自定义域名配置](https://developers.cloudflare.com/pages/configuration/custom-domains/)

## 失败处理

| 情况 | 检查项 |
| --- | --- |
| 正式地址校验失败 | `SITE_URL` 是否为实际公开 HTTPS 根地址 |
| Git push 被拒绝 | Actions 写权限、生产分支规则、并发提交 |
| 单来源失败 | 采集日志与 `data/status.json`；`partial` 不代表所有来源成功 |
| 构建失败 | 修复构建错误；该次仅归档 `data/`，不发布失败产物 |
| Actions 成功但站点未更新 | Cloudflare 部署、生产分支、`dist` 输出目录、监听路径及 GitHub App 授权 |
| Hub 等待超时 | 正式域名与 Cloudflare 部署是否提供目标 revision；确认上线后人工补发 |

工作流版本依据（2026-10-23）：[checkout 7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1)、[setup-node 7.1.0](https://github.com/actions/setup-node/releases/tag/v7.1.0)、[upload-artifact 7.0.2](https://github.com/actions/upload-artifact/releases/tag/v7.0.2)，分别使用 `@v7` 主版本标签。
