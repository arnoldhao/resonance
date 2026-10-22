import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { resolveHubURL, resolveSiteURL } from './feeds.mjs';

const readJSON = async file => JSON.parse(await readFile(file, 'utf8'));

export async function captureRevision({ siteUrl, fetchImpl = fetch, timeoutMs = 20000 }) {
  siteUrl = resolveSiteURL(siteUrl);
  const response = await fetchImpl(`${siteUrl}/api/v1/updates.json`, { headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(timeoutMs) });
  if (response.status === 404) return { siteUrl, revision: null, reason: 'first-publication' };
  if (response.status !== 200) throw new Error(`读取线上订阅版本失败：HTTP ${response.status}`);
  const manifest = await response.json();
  if (manifest.schemaVersion !== 1 || typeof manifest.revision !== 'string' || manifest.siteUrl !== siteUrl) throw new Error('线上 updates.json 不符合订阅清单契约或 SITE_URL 不一致');
  return { siteUrl, revision: manifest.revision, reason: 'existing-publication' };
}

export async function publishUpdate({ previous, manifest, hubUrl, force = false, waitForDeployment = false, fetchImpl = fetch, sleepImpl = sleep, now = Date.now, onWait = () => {} }) {
  hubUrl = resolveHubURL(hubUrl);
  if (!hubUrl) return { status: 'disabled', message: '未配置 WebSub Hub；阅读器仍可轮询 Atom / JSON Feed。' };
  if (manifest.mode !== 'live') return { status: 'demo', message: '当前是设计示例，不向 Hub 发布真实榜单通知。' };
  if (previous.siteUrl !== manifest.siteUrl) throw new Error('部署前后 SITE_URL 不一致，无法比较订阅版本');
  if (!force && previous.revision === manifest.revision) return { status: 'unchanged', message: '订阅内容未改变，不发送 WebSub 通知。' };
  if (manifest.hubUrl !== hubUrl) throw new Error('构建产物的 Hub 与通知目标不一致');
  const deadline = waitForDeployment ? now() + 300000 : null;
  let waitingReported = false;
  while (true) {
    const remaining = waitForDeployment ? deadline - now() : 20000;
    if (remaining <= 0) throw new Error('等待正式站点订阅版本超时（最多 5 分钟），未发送 WebSub 通知');
    const deployed = await captureRevision({ siteUrl: manifest.siteUrl, fetchImpl, timeoutMs: Math.min(20000, remaining) });
    if (waitForDeployment && now() >= deadline) throw new Error('等待正式站点订阅版本超时（最多 5 分钟），未发送 WebSub 通知');
    if (deployed.revision === manifest.revision) break;
    if (!waitForDeployment) throw new Error('正式站点尚未提供本次订阅版本，停止通知；确认 SITE_URL 与部署版本后可人工补发');
    if (!waitingReported) {
      await onWait('等待 Cloudflare 提供本次订阅版本，每 15 秒检查一次，最多等待 5 分钟。');
      waitingReported = true;
    }
    const waitRemaining = deadline - now();
    if (waitRemaining <= 0) throw new Error('等待正式站点订阅版本超时（最多 5 分钟），未发送 WebSub 通知');
    await sleepImpl(Math.min(15000, waitRemaining));
  }
  const response = await fetchImpl(hubUrl, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ 'hub.mode': 'publish', 'hub.url': manifest.feedUrl }),
  });
  if (!response.ok) throw new Error(`WebSub Hub 拒绝发布通知：HTTP ${response.status}`);
  return { status: 'published', manual: force, message: `${force ? '人工补发：' : ''}Hub 已接受更新通知（HTTP ${response.status}）；此结果不代表所有阅读器已收到。`, revision: manifest.revision };
}

async function report(message) {
  console.log(message);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `\n### 订阅更新\n\n${message}\n`);
}

async function main() {
  const [command, previousFile, ...options] = process.argv.slice(2);
  if (!previousFile || !['capture', 'publish'].includes(command) || options.some(option => command !== 'publish' || !['--force', '--wait'].includes(option))) throw new Error('用法：node scripts/notify.mjs capture|publish <部署前版本文件> [--wait 等待部署] [--force 人工补发]');
  if (command === 'capture') {
    const previous = await captureRevision({ siteUrl: process.env.SITE_URL });
    await writeFile(previousFile, `${JSON.stringify(previous)}\n`);
    await report(previous.revision ? `已记录部署前订阅版本 ${previous.revision.slice(0, 12)}。` : '部署前订阅清单返回 404，本次按首次发布处理。');
  } else {
    const result = await publishUpdate({ previous: await readJSON(previousFile), manifest: await readJSON(resolve('dist/api/v1/updates.json')), hubUrl: process.env.WEBSUB_HUB_URL, force: options.includes('--force'), waitForDeployment: options.includes('--wait'), onWait: report });
    await report(result.message);
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { await main(); }
  catch (error) {
    await report(`订阅步骤失败：${error.message}`);
    process.exitCode = 1;
  }
}
