<div align="center">
  <img src="./site/favicon.svg" width="80" alt="共振图标" />
  <h1>共振 / RESONANCE</h1>
  <p><strong>听见流行的交集。</strong></p>
  <p>中国音乐平台的综合日榜与周榜</p>
  <p>
    <a href="https://resonance.dreamapp.cc/">在线榜单</a> ·
    <a href="https://resonance.dreamapp.cc/#method">计算方法</a> ·
    <a href="https://resonance.dreamapp.cc/#api">开放 API</a> ·
    <a href="https://resonance.dreamapp.cc/#subscribe">订阅更新</a> ·
    <a href="https://github.com/arnoldhao/resonance/issues">反馈问题</a>
  </p>
</div>

## 项目简介

共振汇集 QQ 音乐、网易云音乐、酷狗、酷我、Apple Music 与汽水音乐的公开榜单，从不同平台的流行中寻找共同回响。每日保存快照，提供可追溯的综合日榜、周榜与平台原榜。

## 核心能力

- **日榜与周榜**：查看综合排名、共振值及涨跌，发现跨平台热门歌曲。
- **歌曲与原榜**：浏览封面、艺人和 MV 关联，回到原平台收听。
- **历史查询**：按日期、平台和关键词查找，下载 JSON 或 CSV。
- **API 与订阅**：公开读取榜单，通过 Atom / JSON Feed 跟进更新。

共振值是根据公开排名计算的热度指数。平台覆盖、历史沿用和不可比较的涨跌会明确标注；音乐请到原平台收听。

## 数据与方法

[数据来源](docs/sources.md) · [日榜方法](docs/methodology.md) · [周榜方法](docs/weekly.md) · [API 文档](docs/api.md) · [订阅说明](docs/subscriptions.md)

## 本地运行

需要 Node.js 22 或更高版本，无需安装依赖：

```sh
git clone https://github.com/arnoldhao/resonance.git
cd resonance
npm run preview
```

打开 <http://127.0.0.1:4173>。采集与部署见[维护说明](maintenance/deployment.md)。
