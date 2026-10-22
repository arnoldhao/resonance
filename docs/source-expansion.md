# music-lib 对照与来源扩充建议

研究日期：2026-10-23。对照用户提供的 [music-lib 固定提交](https://github.com/guohuiyuan/music-lib/tree/6353508e84cd357b5bc3acf32d95a16e01bbe20c)。只阅读代码和公开接口响应，没有运行该库，也没有将其源代码或依赖纳入项目。

## 汽水：现在接入

库内 [soda/toplist.go](https://github.com/guohuiyuan/music-lib/blob/6353508e84cd357b5bc3acf32d95a16e01bbe20c/soda/toplist.go) 暴露了正式 PC 榜单端点与热歌榜 ID。榜单读取是普通 GET，可不带 Cookie，与它的会员音频下载签名器是独立路径。我们一次无凭据官方请求确认完整 50 首与 `period: weekly`，据此写了现有 Node 适配器；详细证据见 [汽水接入记录](qishui-research.md)。

它的排行榜目录同时收录发现页推荐歌单，并有跨接口回退。项目仅取固定官方热歌榜，不将推荐歌单、新歌榜或音乐人专题榜当作额外综合票。汽水加入后原定的六个平台已具备采集路径。

## 咪咕：值得作为下一候选，暂不加入综合权重

库中 [migu/toplist.go](https://github.com/guohuiyuan/music-lib/blob/6353508e84cd357b5bc3acf32d95a16e01bbe20c/migu/toplist.go) 使用官方榜单 `83048887`。本次直接读取 [官方接口](https://app.c.nf.migu.cn/bmw/rank/rank-info/v1.0?rankId=83048887&pageNo=1)，返回：

- 名称「全网热歌榜」，说明为追踪全网热播音乐。
- `totalCount: 50`、实际 50 条、`hasNextPage: false`。
- `updateTime: 2026-10-22`；没有从本次响应确认固定更新时刻。
- 前三为《甲乙丙丁 (你我怎么两清)》《自由的你》《我听见了，你的痛苦成立》。

技术上可接入，但名称和说明体现跨网络热门编排，尚不能确认是否只由咪咕自己的收听行为形成。**建议先作为单独观察榜，再决定是否给独立权重**；不能仅因为多了一个域名就增加一票。当前先把六源的歌曲身份与历史连续性做好，新增咪咕不是公开 API 上线的前提。本轮未增加第七个平台或改变原有四组权重。

## 其他库内平台：暂不扩充

[该库的能力表](https://github.com/guohuiyuan/music-lib/blob/6353508e84cd357b5bc3acf32d95a16e01bbe20c/README.md) 将千千、5sing、Jamendo、JOOX、Bilibili 的排行榜/热门单曲能力列为不支持。支持搜索、解析歌单或下载，并不等于有可比较的中国热歌榜。视频热榜、原创上传榜和海外地区榜也不宜混入当前音乐平台热歌综合榜。

它的 Apple 榜单同样使用 Apple `cn/music/most-played` RSS，与现有来源重复，不新增一次投票。我们继续公开标注 RSS 产品身份，不凭库内名称断言它与另一个 Daily Top 100 歌单在每个时点严格一致。

扩充优先级：**补齐汽水 → 保持六源连续观测与歌曲合并 → 咪咕独立观察评估**。不为了“来源数量”把同集团、同一底层榜单或不可核实的推荐歌单堆进综合分数。
