# 榜单来源与更新时间核实

核实日期：2026-10-22 至 2026-10-23。下文区分平台公开说明、请求观察与项目采样规则。响应样例用于说明字段含义，不代表平台未来的可用性或固定发榜承诺；最新覆盖以采集状态为准。

## 采样频率与榜单统计周期

每天保存一次快照，不代表平台只统计过去 24 小时。网易云热歌榜目前说明使用一周收听窗口、每日更新；旧资料中的「每周四更新」已不符合本次官方接口返回。QQ、酷狗的热歌榜也不应被解释成只统计当日播放量。汽水官方响应则明确为周榜，每日记录的是当时可见的同一期或新一期周榜。综合榜汇总的是可见排名，不能宣称全网播放量或市场份额。

| 平台 | 项目选用榜单 / ID | 更新频率证据 | 精确发布时间 | 本次公开读取情况 |
| --- | --- | --- | --- | --- |
| QQ 音乐 | 巅峰榜·热歌 / `26` | 官方接口 `topinfo.info` 写明每日更新 | 未公开核实 | 核验取得 100 首；来源日期 `2026-10-22`、总数 300 |
| 网易云音乐 | 热歌榜 / `3778678` | 官方接口 `result.description` 写明一周统计窗口、每日更新 | 未公开核实固定时刻 | 核验取得 100 首；来源总数 200、毫秒时间戳 |
| 酷狗音乐 | TOP500 / `8888` | 官方接口 `info.update_frequency` 为每天 | 当前响应的发布配置是 `10:00:00`；不作为永久承诺 | 分页核验取得 100 首；每页 30 首、总数 500 |
| 酷我音乐 | 酷我热歌榜 / `16` | 本次有日期 `2026-10-22`；尚未找到明确的更新周期说明 | 未公开核实 | 核验取得 100 首；来源总数 300 |
| Apple Music | 热门歌曲 · 中国区（RSS） | RSS 本身未核实固定频率；不能套用 Top 100 歌单的日更说明 | 未公开核实 | 核验取得 100 首，保留 feed 更新时间 |
| 汽水音乐 | 热歌榜 / `7036274230471712007` | 官方响应 `period=weekly`，完整 50 首 | 本次 `release_time` 为 2026-10-22 北京时间 16:00；不是固定时刻承诺 | 普通无认证 GET 定向读取成功 50 首，自动适配已启用 |

酷狗本次公开响应暴露了发布时间配置；汽水提供了该期绝对发布时间，但两者都不足以证明未来固定发榜时刻。项目采用北京时间 **09:17、15:17、21:17** 三次采样，对应 UTC **01:17、07:17、13:17**。09:17 可能早于酷狗本次观察到的 10:00 发布配置，晨间保存上一期是正常现象；下午、晚间继续追踪更新；汽水本次周四 16:00 的新一期可由晚间采样观察。快照只表示那个时刻看到的榜单，不表示平台刚刚发布了新一期。实际运行记录用于继续观察，不把采集时间冒充平台更新时间。GitHub Actions 的 cron 是计划触发时间，可能延迟，不能当作精确时钟。

## QQ 音乐

- [官方热歌榜](https://y.qq.com/n/ryqq/toplist/26)
- [本次读取的官方 JSON](https://c.y.qq.com/v8/fcg-bin/fcg_v8_toplist_cp.fcg?format=json&topid=26)
- 读取方式：HTTPS GET，普通浏览器 User-Agent，`Referer: https://y.qq.com/`；本次没有 Cookie、签名或访问令牌。
- 榜单：`topinfo.topID = "26"`、`topinfo.ListName = "巅峰榜·热歌"`。
- 更新依据：`topinfo.info` 说明每日更新，以移动端登录用户产生的完整播放、下载、收藏综合排序。`date` 与 `update_time` 本次均为 `2026-10-22`，只有日期，没有准确时分秒。
- 歌曲：`songlist[].data` 包含 `songmid`、`songname`、`singer[].name`、`albummid`、`albumname`、`interval`（秒）。使用数组顺序确定当前榜位。行级 `cur_count` 是当前名次、`old_count` 是上期名次；不把其他未核实字段直接当榜位。
- 原榜变化：例如《特别的人》`cur_count=14/old_count=17` 为上升 3 位，《甲乙丙丁》`5/4` 为下降 1 位。`old_count=0` 不作为普通上期名次计算，也不在缺少哨兵依据时强行认定新入榜。原值与解算结果分别保存在 `sourceMovement.raw` 和标准化字段。
- MV 关联：`data.vid`，如《NEON》的 `001sCmnF1aB3z1`。保留标识；空字符串表示该次响应没有关联。仅关联不代表可播放，当前未核实详情页 URL 规则，链接留空。
- 封面可通过专辑 MID 形成 QQ 官方图片地址；歌曲来源链接使用 `https://y.qq.com/n/ryqq/songDetail/{songmid}`。

## 网易云音乐

- [官方热歌榜](https://music.163.com/discover/toplist?id=3778678)
- [本次读取的官方 JSON](https://music.163.com/api/playlist/detail?id=3778678)
- 读取方式：HTTPS GET，普通浏览器 User-Agent，`Referer: https://music.163.com/`；本次无 Cookie 或签名。
- 榜单内容在 `result`。本次 `name = "热歌榜"`、`trackCount = 200`，`description` 说明一周窗口、每日更新。
- 使用 `result.updateTime` 保存平台更新时间；这是带 epoch 语义的毫秒时间戳，可转成 ISO 时间。`trackUpdateTime` 与 `trackNumberUpdateTime` 语义不同，不应混用成榜单发行时间。
- 歌曲：`tracks[]` 包含 `id`、`name`、`artists[].name`、`album.name`、`album.picUrl`、`duration`（毫秒）。使用数组顺序确定榜位。**`tracks[].position` 是曲目位置字段，不是本榜排名。**
- 歌曲来源链接使用 `https://music.163.com/song?id={id}`。公开页面和 API 的可见曲数可能受服务端策略变化影响，运行时必须记录实际条数。
- 原榜变化：原始 `tracks[].lastRank` 从 0 开始编号。2026-10-23 读取[官方榜单页面](https://music.163.com/discover/toplist?id=3778678)的 `m-wgt-song-list` 模板，当前名次显示 `y+1`，涨跌比较 `y-x.lastRank`，据此将非负整数转换为 `previousRank = lastRank + 1`，涨跌为该值减当前名次。`0` 表示上期第一名。负数与缺失值走特殊图标分支，具体语义尚未核实，仍显示未知；原始值一并保留。
- MV 关联：`mvid` 已确认，例如《我不难过》为 `5293234`、《天龙八部之宿敌》为 `5361181`，无关联样例为 `0`。保存 MV ID，不保存原始音频字段；实际可播状态及 MV 页面 URL 未核实。

## 酷狗音乐

- [官方 TOP500 页面](https://www.kugou.com/yy/rank/home/1-8888.html)
- [本次读取的官方移动端 JSON](https://m.kugou.com/rank/info/?rankid=8888&page=1&json=true)
- 读取方式：HTTPS GET，普通浏览器 User-Agent；本次无 Cookie 或签名。
- `info.rankname = "TOP500"`、`info.rankid = 8888`。`info.intro` 说明基于全曲库的完整播放、收藏与分享；`info.update_frequency = "每天"`。
- 当前响应 `info.rank_id_publish_date = "2026-10-22 08:30:01"`；`info.extra.resp.scheduled_release_conf.scheduled_release_time = "10:00:00"`。两者不同，前者是期次数据时间，后者是定时发布配置，不能据此声称榜单每天 08:30 对外更新。响应没有显式注明时区，因此原样保存期次文本，不凭空补成带时区的时间戳。单次观察到的配置也不构成长期 SLA。
- 本次 `songs.total = 500`、`songs.pagesize = 30`。页码从 1 开始；取得前 100 首需要 4 页。分页必须来自同一期次，否则该轮失败，不能拼接两个日期的榜单。
- 歌曲：`songs.list[]` 的 `songname`、`authors[].author_name`、`hash`、`album_audio_id`、`duration`（秒）、`album_sizable_cover`、`sort`、`song_url`。封面 URL 的 `{size}` 是图片尺寸占位符。优先使用原始 `song_url`。
- 旧资料中的 `mobilecdnbj.kugou.com` 在本次 HTTPS 请求中证书主机名不匹配；项目不关闭 TLS 校验，也不使用该入口。
- 原榜变化：保存 `sort` 和 `last_sort`。本次《无奈的思绪》为 `1/2`，即上升 1 位；《天龙八部之宿敌》为 `2/1`，即下降 1 位。只有正整数上期名次才计算差值，0 或未确认哨兵保留未知。
- MV 关联：同时保存 `mvdata[].id/hash` 和 `mvhash` 中的关联标识。本次《我听见了，你的痛苦成立》`mvhash` 为空但 `mvdata` 包含 MV ID `17547531`，所以不能只检查 `mvhash`。仅保留 ID/hash，详情页 URL 规则未确认时留空。

## 酷我音乐

- [官方榜单首页](https://m.kuwo.cn/newh5app/ranklist)
- [另一官方榜单首页](https://m.kuwo.cn/newh5/bang/index)
- [本次读取的官方 JSON（前三首）](https://kbangserver.kuwo.cn/ksong.s?from=pc&fmt=json&alt=json&show_copyright_off=0&pn=0&rn=3&type=bang&data=content&id=16)
- 读取方式：HTTPS GET，普通浏览器 User-Agent；本次无 Cookie、CSRF 或签名。第一页 `pn=0`，`rn` 控制数量；项目请求前 100 首。
- 本次 `name = "酷我热歌榜"`、`pub = "2026-10-22"`、`num = "300"`。前三名与官方移动榜单页相符。返回 `info` 是榜单简介，没有明确承诺更新周期，因此只报告本次日期，不编造每日固定时点。
- 歌曲：`musiclist[]` 的 `id`、`name`、`artist`、`album`、`song_duration`。按数组顺序取排名。**`duration` 与 `song_duration` 本次不同，前者可能是可试听片段长度，曲长使用 `song_duration`。**
- `artist` 是组合文本，合作歌手通常以 `&` 分隔；保留原文并谨慎做身份归一。歌曲来源链接使用 `https://www.kuwo.cn/play_detail/{id}`。
- 新的 `m.kuwo.cn/newh5app/api/mobile/v1/music/rank/16` 路径返回 CSRF Token 错误；项目不用这个入口，也不模拟或规避 CSRF。
- 原榜变化：保存 `rank_change`、`trend`、`isnew`、`highest_rank`。当前定向响应的前 100 首都是 `rank_change="0"/trend="e0"`，不足以核实升降方向与哨兵规则；标准化结果保持 `unknown`，不会把历史最高排名 `highest_rank` 当成上期排名。
- MV 关联：保存 `mvpayinfo.vid`。例如《甲乙丙丁》为 `18227462`；《黄昏》即使 `play/download` 都为 0 仍有 `vid=278866`，所以存在 MV 关联不等于可播放或可下载。本项目不保存权限对象，也不据其猜测访问能力。

## Apple Music 中国区

- [官方 Top 100：中国大陆歌单](https://music.apple.com/us/playlist/top-100-china/pl.fde851dc95ce4ffbb74028dfd254ced5)，歌单 ID：`pl.fde851dc95ce4ffbb74028dfd254ced5`。
- 这张官方歌单的公开说明明确每日更新，没有公布具体时刻。**Top 100 歌单与 RSS 热门歌曲是两个产品，不能当成同一份榜单。** 核验时读取歌单页面被重定向至中国区 `/new` 页面，没有取得歌单曲目；项目未接入这张歌单。
- 实现的来源名称按 `scripts/providers.mjs` 为 **「热门歌曲 · 中国区（RSS）」**：[官方 CN most-played RSS 地址](https://rss.marketingtools.apple.com/api/v2/cn/music/most-played/100/songs.json)。2026-10-22 的核验响应包含中国区完整 100 首，保留 feed 更新时间。
- 适配器读取 `feed.country`、`feed.updated`、`feed.results[]`，使用 `id`、`name`、`artistName`、`artworkUrl100`、`url` 和数组顺序。仅接受 `country = "cn"`，避免拿其他地区的榜替代中国区榜。
- 即使 Top 100 歌单已经确认日更，也不能据此推导 RSS 的频率、排名一致性或固定发布时间。RSS 自己的时间戳和每次实际获取结果单独记录；不可用时显示来源失败并调整有效覆盖，不能换成 iTunes 下载榜继续冒充 Apple Music 播放榜。
- 本次 RSS 契约没有已确认的原榜涨跌或 MV 关联字段，新记录分别保存 `sourceMovement.direction="unknown"` 和 `mv.status="unknown"`，不拿歌曲 URL 当 MV 链接。

## 汽水音乐

- [官方热歌榜 JSON](https://api.qishui.com/luna/pc/charts/7036274230471712007?aid=386088&app_name=luna_pc&region=cn)，榜单 ID `7036274230471712007`。线索与固定版本参考见 [汽水接入记录](qishui-research.md)。
- 北京时间 2026-10-23 00:04 的一次定向请求成功：普通 HTTPS GET，仅普通 User-Agent 与 Accept，没有 Cookie、Authorization、签名、设备 ID 或登录态。
- 官方响应 `chart.title = "热歌榜"`、`count_tracks = 50`、`period = "weekly"`；实际收到 50 首、50 个不同曲目 ID。这是完整 Top 50 周榜，不是截断的 Top 100，不以用户歌单、推荐流或抖音榜补齐。
- `chart.release_time = 1792656000`，对应 **2026-10-22 16:00:00 北京时间（周四）**。官方响应证实周周期；参考库内置说明为每周四更新，本次观测与之相符，但固定周四或固定 16:00 都没有在本次响应中形成长期承诺。每天保存快照可能连续数日记录同一期周榜。
- `release_time` 是 Unix 秒，转换为 `sourceUpdatedAt`；`sourcePeriod` 保存 `weekly`。`status_info.now` 是响应时间，不能作为发榜时间。
- 成功响应没有 `status_code` 字段，仅有 `status_info` 与 `chart`。`track_ranks[].rank` 在本次响应里只有涨跌字段，名次按数组顺序确定。曲目读取 `track.id`、`name`、`artists[].name`、`album.name` 与 `album.url_cover`，不处理下载或会员音频。
- 适配器要求正式榜单 ID、周周期及完整 50 首；遇到错误明确失败，不切换歌单接口。
- 原榜变化：保存 `rank_delta`、`rank_type`、`track_id`。本次第 1 名为 `"1"/"up"`，《茶汤》第 3 名为 `"2"/"down"`，第 5 名为 `"0"/"new"`。`rank_delta` 是幅度，升降由 `rank_type` 确定；按周榜相对前期展示，不能标为“较昨日”。
- 未发现明确的 MV 关联字段。`track.vid`、`preview.vid`、`audition_info.vid` 属于歌曲音频链路，不能据字段名认定有 MV，也不存入 MV 元数据。

## 数据合同与证据边界

这些接口位于平台官方域名，但并非面向第三方承诺稳定性的开放 API。当前可公开读取不代表未来持续可用。错误应显式显示为来源失败或不可用，不伪造歌曲，不用上一次成功数据冒充今天的新榜。

分别保存以下含义：

- `fetchedAt`：本轮采集的时间基准；各来源使用同一轮的时间，独立于平台更新时间。
- `sourceUpdatedAt`：平台明确提供、且能解释的更新时间；没有就留空。
- `sourcePeriod`：平台日期、期次或周期原文；汽水为 `weekly`。
- `sourceUrl`：能追溯到平台榜单的链接。
- 来源数量、实际返回条数、是否满足计算门槛。
- `sourceMovement`：原平台相对前期的涨跌及白名单原始标量，独立于综合榜跨日变化；前期不等于昨日。
- `mv`：源响应中的 MV 关联标识及确认过的页面链接。当前链接均未核实，保存 `null`；`linked` 不代表可播放。

采集档案保留 QQ、网易云、酷狗、酷我、Apple 各前 100 首，以及汽水完整前 50 首。**方法 1.1 对全部来源统一使用前 50 名计分**；其他平台第 51–100 名保留在原榜中、贡献为 0，避免把汽水未公布的名次当成已知未上榜。汽水新鲜度窗口为 216 小时（周更加两天宽限），其他五源为 48 小时。原始快照保留平台排名、名称与来源链接，便于后续独立计算。任何需要身份认证、付费授权或签名的来源，必须通过有授权的接入方式补充，不能用其他平台榜单代替。
