# 部署

GitHub Actions 采集并构建，将 `data/`、`dist/` 提交到生产分支；Cloudflare Pages 通过 Git 集成发布 `dist/`。

## GitHub

启用 Actions，允许工作流写入仓库内容。默认分支为 `main`，需允许归档提交。

Repository variables：

| 变量 | 用途 |
| --- | --- |
| `SITE_URL` | 必填，正式 HTTPS 站点根地址 |
| `WEBSUB_HUB_URL` | 可选，WebSub Hub 地址 |

计划采集为北京时间 **09:17、15:17、21:17**，仅在默认分支执行，实际触发可能延迟。手动补采使用 **Actions → Collect charts & publish → Run workflow → collect=true**。代码推送仅构建已有数据。

## Cloudflare Pages

连接同一 GitHub 仓库，开启自动生产部署：

| 设置 | 值 |
| --- | --- |
| Production branch | `main` |
| Framework preset | `None` |
| Build command | `true` |
| Build output directory | `dist` |
| Root directory | 留空 |
| Build watch paths / Include | `dist/*` |
| Preview branches | `None` |

配置 `SITE_URL` 后运行一次 Actions，生成生产产物。自定义域名在 Pages 中关联后，将其设为 `SITE_URL`。配置 Hub 时，Actions 等待正式站点更新后通知；补发可用 `collect=false`、`notify_again=true`。

## 本地维护

需要 Node.js 22 或以上。`npm run collect` 采集，`npm run preview` 本地预览，`npm run build` 构建生产文件。预览使用 `.preview/`，生产使用 `dist/`。

`npm run backfill -- --days 30` 回填今天之前 30 天的 QQ、酷狗原榜；可用 `--end YYYY-MM-DD` 指定截止日。数据保存在 `data/platform-history/`，提交后由 Actions 构建平台历史 API。
