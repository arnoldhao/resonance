import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chinaDate, priorDate } from './ranking.mjs';
import { historicalKugouPeriods, collectHistorical } from './historical-providers.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({ options: { days: { type: 'string', default: '30' }, end: { type: 'string', default: priorDate(chinaDate(new Date())) } } });
const days = Number(values.days);
if (!Number.isInteger(days) || days < 1) throw new Error('days 必须是正整数');
if (!/^\d{4}-\d{2}-\d{2}$/.test(values.end) || new Date(`${values.end}T00:00:00Z`).toISOString().slice(0, 10) !== values.end || values.end >= chinaDate(new Date())) throw new Error('end 必须是今天之前的有效 YYYY-MM-DD 日期');
const aliases = JSON.parse(await readFile(resolve(root, 'config/aliases.json'), 'utf8'));
const periods = await historicalKugouPeriods();
let date = values.end;
let saved = 0;
let failed = 0;
for (let index = 0; index < days; index++, date = priorDate(date)) {
  const results = await Promise.allSettled(['qq', 'kugou'].map(async id => {
    const chart = await collectHistorical(id, { date, now: new Date(), aliases, kugouPeriod: periods.get(date) });
    const file = resolve(root, 'data/platform-history', id, `${date}.json`);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify(chart, null, 2)}\n`);
    return id;
  }));
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') saved++;
    else { failed++; console.error(`${date} ${['qq', 'kugou'][i]}：${result.reason.message}`); }
  });
  console.log(`${date}：${results.filter(result => result.status === 'fulfilled').length}/2 平台已保存`);
}
console.log(`历史原榜回填完成：${saved} 期成功，${failed} 期失败。未生成综合榜或伪造采集日期。`);
if (failed) process.exitCode = 1;
