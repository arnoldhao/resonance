# 自己部署到 GitHub Actions 与 Cloudflare Pages

代码在 `/Users/arnold/Projects/resonance`。发布方式与 [dreamapp-updates](https://github.com/arnoldhao/dreamapp-updates) 一致：**GitHub Actions 采集、构建并提交 `data/` 和 `dist/`，Cloudflare Pages 通过 Git integration 自动拉取 `dist/` 发布**。Cloudflare 的构建命令为 `true`，不重复生成榜单。网站、JSON API、Atom 和 JSON Feed 都是静态文件。

GitHub 只需一个必填仓库变量 `SITE_URL`。不需要 Cloudflare API Token、Account ID、项目名变量、PAT 或 Deploy Hook；GitHub 自带的 `GITHUB_TOKEN` 负责提交，Cloudflare GitHub App 负责接收提交并部署。

**如果你已把仓库连接到 Cloudflare，直接核对第 3 节：生产分支 `main`、构建命令 `true`、输出目录 `dist`、根目录留空、监听路径 `dist/*`。** 然后在 GitHub 填好 `SITE_URL`，手动运行一次 `collect=true`，等机器人产物提交自动部署即可。

## 1. 建立 GitHub 空仓库和正式地址变量

先准备 Git、Node.js 22 或以上版本，并完成本机 GitHub 登录。可使用已配置的 SSH，或用 `gh auth login` 配置 HTTPS 登录。

在 GitHub 选择 **New repository**，仓库名可用 `resonance`，公开或私有均可。不要自动添加 README、`.gitignore` 或 License。复制 **Quick setup** 给出的完整 HTTPS 或 SSH 仓库 URL。[GitHub 官方导入步骤](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github)

先为 Cloudflare Pages 想好一个尽量唯一的项目名。在仓库 **Settings → Secrets and variables → Actions → Variables** 新建 Repository variable：

| Variable | 设置 |
| --- | --- |
| `SITE_URL` | 必填，计划使用的正式根地址，例如 `https://你准备创建的唯一项目名.pages.dev`，将示例替换为实际值；必须是公开 HTTPS 地址，无子路径。 |
| `WEBSUB_HUB_URL` | 可选。首次部署留空，普通阅读器轮询不需要它。 |

稍后 Cloudflare 分配的实际域名如果不同，要更新 `SITE_URL` 并重新运行 Actions。它决定 Feed 的绝对链接和稳定条目 ID，不能填 localhost 或某次部署的临时预览地址。

打开 **Settings → Actions → General**，允许 GitHub 官方 Actions。在 **Workflow permissions** 选择 **Read and write permissions** 并保存。工作流需要将归档与产物提交到 `main`，不需要创建或批准 Pull Request 的权限。如果组织规则或分支保护禁止机器人写入 `main`，需为这个流程配置相应允许规则。[GitHub Actions 权限设置](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository)

## 2. 上传代码，生成第一份生产产物

当前目录尚未初始化 Git，在终端执行：

```sh
cd /Users/arnold/Projects/resonance
git init -b main
git add . ':!dist'
git status --short
git commit -m "feat: publish Resonance music charts"
```

首次提交排除本地 `dist/`，交给配置好正式地址的 Actions 生成它，避免把本地预览链接上传为生产 Feed。`.gitignore` 仍保留 `dist/`；Actions 会用 `git add -f dist/` 首次跟踪生产产物。之后机器人继续更新已跟踪的文件，本地不要手动强制加入预览产物。

本地 `npm run preview` 会构建并服务 `.preview/`，不会覆盖生产 `dist/`。`.preview/`、`.env`、`node_modules/` 等本地文件已忽略。普通 `npm run build` 仍输出 `dist/`，生产构建由 Actions 执行。

如果 Git 要求填写提交身份，配置你自己的 `user.name` 和 `user.email` 后重试。下面命令会等待你粘贴真实仓库 URL：

```sh
printf '粘贴 GitHub 仓库完整 URL，然后回车：'
read -r resonance_remote
git remote add origin "$resonance_remote"
git remote -v
git push -u origin main
```

默认分支保持 `main`。首次 push 会触发构建已有数据；需要立即采集本期数据时，打开 **Actions → Collect charts & publish → Run workflow**，选择 `main`，勾选 `collect`，保持 `notify_again` 关闭。

工作流依次验证正式地址、运行测试、采集、构建，然后将 `data/` 和 `dist/` 一次提交回仓库。等它完成，在 GitHub 上确认出现 `dist/index.html`、`dist/api/v1/charts/latest.json`、`dist/feed.xml`。这时可以连接 Cloudflare。若提前连接而初次部署因为没有 `dist/` 失败，等机器人提交产物后，以后续部署结果为准。

## 3. Cloudflare Pages 连接这个 GitHub 仓库

在 Cloudflare 控制台进入 **Workers & Pages → Create application → Pages → Connect to Git**，选择 GitHub，授权 Cloudflare Workers & Pages GitHub App 访问刚创建的仓库。只需授权目标仓库即可。[Cloudflare Git integration 指南](https://developers.cloudflare.com/pages/get-started/git-integration/)

选择仓库后填写：

| 设置 | 值 |
| --- | --- |
| Project name | 第 1 步计划的项目名 |
| Production branch | `main` |
| Framework preset | `None` |
| Build command | `true` |
| Build output directory | `dist` |
| Root directory | 留空（仓库根目录） |

点击 **Save and Deploy**。这套配置直接发布仓库中生成好的静态文件，与参考仓库的 [部署配置](https://github.com/arnoldhao/dreamapp-updates/blob/main/README.md#cloudflare-pages-配置) 相同。不要选择 Direct Upload，也不需要运行 Wrangler 上传。

部署后在项目设置中再完成：

- **Settings → Build → Build watch paths**：Include paths 只填写 `dist/*`，Exclude paths 留空。这样普通源代码提交先由 Actions 构建，等新 `dist/` 提交后才发布，避免重复发布旧产物。Cloudflare 的 `*` 能匹配嵌套路径。[Build watch paths 文档](https://developers.cloudflare.com/pages/configuration/build-watch-paths/)
- **Branch control**：保持自动生产部署开启；Preview branches 选择 **None / Disable automatic branch deployments**。本站产物包含统一的正式 Feed URL，当前不为分支预览生成另一套订阅地址。[Cloudflare 分支控制](https://developers.cloudflare.com/pages/configuration/git-integration/#disable-automatic-deployments)

记下 Cloudflare 实际分配的生产 `*.pages.dev` 地址。如果它与 `SITE_URL` 不同，在 GitHub 更新变量，然后关闭 `collect` 手动运行一次工作流。等这次机器人提交被 Cloudflare 部署后再分享订阅地址。

如果以前已经建了 Direct Upload 项目，按本节另建一个 Git integration 项目；本指南不依赖旧的上传凭据。迁移自定义域名时在 Cloudflare 控制台重新关联实际使用的项目。

## 4. 核对首次上线结果

Cloudflare 部署是异步的。Actions 提交成功表示生产文件已经进入 Git；在 Cloudflare 项目的 **Deployments** 中查看对应机器人提交是否成功，或点击 GitHub 提交旁的 **Cloudflare Pages** 检查。只有网站可见的新版本才算上线。[Cloudflare GitHub 检查说明](https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/#check-runs)

在正式 `SITE_URL` 下查看：

| 路径 | 应核对的内容 |
| --- | --- |
| `/` | 日榜和周榜切换正常，榜单日期和来源覆盖符合本次发布 |
| `/api/v1/charts/latest.json` | `mode` 为 `live`；`date` 是本次有效发布日；`coverage` 为实际情况 |
| `/api/v1/status.json` | 最近采集的 `date`、`published`、来源状态与错误；失败采集日期可以晚于已发布榜单 |
| `/api/v1/weekly/latest.json` | 本周日期、`provisional` 状态、有效天数；中途开始采集会形成缺日周 |
| `/api/v1/updates.json` | `siteUrl`、Feed 链接都指向正式域名；日周条目按 `kind` 区分 |
| `/feed.xml`、`/feed.json` | 正式绝对链接、日榜与非空周榜摘要，可直接添加到阅读器 |

`partial` 是满足发布门槛但部分来源不可用；没有达到门槛时保留最后一期有效榜单。页面能打开不代表六个平台都采集成功，应结合 `status.json` 判断。第一次建立历史时，部分综合涨跌显示不可比较，积累可比较的历史后才出现相应变化。

API 接入见 [API 文档](api.md)，日榜与周榜订阅规则见 [订阅文档](subscriptions.md)。

## 5. 日常调度与修改代码

工作流的 `17 1,7,13 * * *` 使用 UTC，对应上海时间每天 **09:17、15:17、21:17**。这是本站采样时间，不是平台发布承诺；汽水等周榜来源也保存每日观察。GitHub 计划任务可能延迟，只在默认分支运行；公开仓库长期 60 天无活动时可能自动停用计划任务，届时在 Actions 重新启用。[GitHub schedule 规则](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)

修改代码前先 `git pull --ff-only`，让 Actions 新提交的数据和 `dist/` 进入本机。正常 push 到 `main` 会重新测试、构建并提交产物；Cloudflare 再发布这个产物提交。需要新采样时手动勾选 `collect`；只想更新网站或配置时关闭它。

`GITHUB_TOKEN` 的提交不会再次触发同仓库的 `push` Actions，所以不会无限循环；Cloudflare GitHub App 仍能收到提交。参考仓库的 [机器人提交](https://github.com/arnoldhao/dreamapp-updates/commit/8067791a758387c79162e6580b78fd7bc62e0574) 有对应 [Cloudflare 成功检查](https://github.com/arnoldhao/dreamapp-updates/runs/119803337686)。GitHub 官方限制针对再次触发 Actions。[GitHub token 触发规则](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow#triggering-a-workflow-from-a-workflow)

不要给产物提交加 `[skip ci]` 等跳过标记，因为 Cloudflare 也会跳过这类提交。[Cloudflare 跳过构建规则](https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/#skipping-a-build-via-a-commit-message)

## 6. 可选：WebSub 上线后推送

普通阅读器只需订阅 `/feed.xml` 或 `/feed.json`，无需 Hub。希望支持主动推送时，先确认正式域名已经上线，再配置 GitHub 仓库变量 `WEBSUB_HUB_URL`，选择支持 `hub.mode=publish` / `hub.url` 的 Hub。

关闭 `collect` 手动运行一次工作流即可发布 Hub 链接。此后有订阅内容变化时：

1. 提交产物前读取线上旧 revision。
2. 提交 `data/` 和 `dist/`，由 Cloudflare 异步部署。
3. 每 15 秒读取正式域名的 `/api/v1/updates.json`，最多等待 5 分钟，直到线上 revision 与本次产物一致。
4. 匹配后才向 Hub 发送通知；内容无变化则跳过。

首次旧清单返回 HTTP 404 可以按首次发布处理；DNS 错误、500、无效 JSON 或地址不一致会明确失败，不能视为“尚未发布”。初次启用 Hub 应安排在网站上线之后。

等待超时或通知失败不丢弃已提交的数据，也不回滚 Cloudflare 部署。修复 Hub、地址或部署问题后，可关闭 `collect`、勾选 `notify_again` 人工补发一次。默认不自动重复发送；Hub 接受请求不代表订阅者都已收到。外部程序订阅、回调验证与续租示例见 [WebSub 文档](subscriptions.md#可选-websub-推送)。

## 7. 可选：自定义域名

先在 **Workers & Pages → 项目 → Custom domains → Set up a domain** 添加。根域名需要位于同一 Cloudflare 账户的 Zone，并将 nameserver 指向 Cloudflare；子域名可用外部 DNS，按界面提示设置指向实际 Pages 域名的 CNAME。先在 Pages 关联域名，不能只添加 CNAME。[Cloudflare 自定义域名步骤](https://developers.cloudflare.com/pages/configuration/custom-domains/)

待 HTTPS 正常后，将 GitHub `SITE_URL` 改为新域名，关闭 `collect` 手动运行一次，等待新产物上线。域名参与 Feed 条目 ID，更换正式地址后应给已有订阅者提供旧地址重定向或迁移说明。若同时启用了 Hub，域名切换的首次旧清单可能因规范地址不一致而停止通知；新版上线后可人工补发。

## 常见失败位置

| 情况 | 处理 |
| --- | --- |
| Actions 说 `SITE_URL` 未配置或不是公开 HTTPS | 在仓库 Variables 中填写正式根地址，重新运行 |
| Git push 被拒绝 | 检查 Actions 写权限、分支规则，或是否有人同时推送新提交 |
| 单来源请求失败 | 看采集日志和 `data/status.json`，不要将旧一期误认为本期成功 |
| 测试失败 | 修复后 push；不会继续采集、构建或提交产物 |
| 构建失败 | 本轮采集的 `data/` 仍会单独归档；不提交失败的 `dist/`，Cloudflare 的 `dist/*` 监听不会发布失败产物 |
| Actions 成功但网站仍旧 | 查看 Cloudflare 对产物提交的部署，核对生产分支、`dist` 目录、watch paths 和 GitHub App 仓库授权 |
| Cloudflare 首次找不到 `dist` | 先配置 `SITE_URL` 并完成一次 Actions 构建，等待后续机器人提交触发部署 |
| Hub 等待超时 | 先核对正式域名和 Cloudflare 部署，确认 revision 上线后人工补发 |

2026-10-23 核对官方版本后，工作流使用 `actions/checkout@v7`、`actions/setup-node@v7`、`actions/upload-artifact@v7`。核对时最新发布分别为 [7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1)、[7.1.0](https://github.com/actions/setup-node/releases/tag/v7.1.0)、[7.0.2](https://github.com/actions/upload-artifact/releases/tag/v7.0.2)。项目运行时使用 Node.js 22，不再使用 Wrangler 上传 Action。
