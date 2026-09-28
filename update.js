// 大盘云图 · 数据抓取脚本（node ≥ 18）
// 数据源：腾讯财经 申万一级/二级行业板块 + 板块成分股 + 指数行情
// 用法：node update.js        → 重写 data.js
//      node update.js --check → 只抓不写，打印统计
'use strict';
const fs = require('fs');
const path = require('path');

const TX = 'https://proxy.finance.qq.com/cgi/cgi-bin/rank';
const APP = '_appver=11.14.0';
const GAP_MS = 120;          // 请求间隔
const RETRY = 4;
const INDEXES = ['sh000001','sz399001','sz399006','sh000300','sh000688','sh000016','sh000905','sh000852','sh000012'];
const INDEX_NAMES = { sh000001:'上证指数', sz399001:'深证成指', sz399006:'创业板指', sh000300:'沪深300', sh000688:'科创50', sh000016:'上证50', sh000905:'中证500', sh000852:'中证1000' };

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getJSON(url) {
  let err;
  for (let i = 0; i < RETRY; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://gu.qq.com/' } });
      if (!r.ok) throw new Error('http ' + r.status);
      const j = await r.json();
      if (j.code !== 0) throw new Error('api ' + j.code + ' ' + j.msg);
      return j.data;
    } catch (e) { err = e; await sleep(800 * (i + 1)); }
  }
  throw err;
}

// 拉某个板块（或 aStock）的全部成分，分页 200
async function boardStocks(code) {
  const out = [];
  let offset = 0, total = Infinity;
  while (offset < total) {
    const d = await getJSON(`${TX}/hs/getBoardRankList?${APP}&board_code=${code}&sort_type=price&direct=down&offset=${offset}&count=200`);
    total = d.total;
    for (const x of d.rank_list) out.push(x);
    offset += 200;
    await sleep(GAP_MS);
  }
  return out;
}

async function boards(type) {
  const d = await getJSON(`${TX}/pt/getRank?board_type=${type}&sort_type=priceRatio&direct=down&offset=0&count=200`);
  return d.rank_list.map(x => ({ code: x.code, name: x.name, pct: +x.zdf, mcap: +x.zsz }));
}

async function indexQuotes() {
  const r = await fetch('https://qt.gtimg.cn/q=' + INDEXES.map(c => 's_' + c).join(','));
  const buf = Buffer.from(await r.arrayBuffer());
  const txt = new TextDecoder('gbk').decode(buf);
  const out = [];
  for (const m of txt.matchAll(/v_s_(\w+)="([^"]*)"/g)) {
    const f = m[2].split('~');
    if (f.length < 6) continue;
    out.push({ c: m[1], n: INDEX_NAMES[m[1]] || f[1], p: +f[3], z: +f[5] });
  }
  return out;
}

function num(v) { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; }

async function main() {
  const check = process.argv.includes('--check');
  const t0 = Date.now();
  const hy1 = await boards('hy');
  await sleep(GAP_MS);
  const hy2 = await boards('hy2');
  console.log(`申万一级 ${hy1.length} 个，二级 ${hy2.length} 个`);

  // 一级成分 → 建 股票→一级 映射
  const stockSector = new Map();
  for (const b of hy1) {
    const list = await boardStocks(b.code);
    for (const s of list) stockSector.set(s.code, b.name);
    process.stdout.write(`\r一级 ${b.name} ${list.length} 只      `);
  }
  console.log();

  // 二级成分（股票明细以这里为准）
  const seen = new Set();
  const sectors = new Map(hy1.map(b => [b.name, { n: b.name, z: b.pct, subs: [] }]));
  let nStocks = 0;
  for (const b of hy2) {
    const list = await boardStocks(b.code);
    process.stdout.write(`\r二级 ${b.name} ${list.length} 只      `);
    const vote = new Map();
    const stocks = [];
    for (const s of list) {
      if (!/^(sh|sz|bj)\d{6}$/.test(s.code) || seen.has(s.code)) continue;
      const p = stockSector.get(s.code);
      if (p) vote.set(p, (vote.get(p) || 0) + 1);
      const mcap = num(s.zsz);
      if (mcap <= 0) continue;
      seen.add(s.code);
      // [代码, 名称, 总市值(亿), 涨跌幅%, 现价]
      stocks.push([s.code, s.name, +mcap.toFixed(2), s.zdf === '' ? null : num(s.zdf), num(s.zxj)]);
    }
    if (!stocks.length) continue;
    let parent = null, best = -1;
    for (const [k, v] of vote) if (v > best) { best = v; parent = k; }
    if (!parent) { console.warn('\n二级板块找不到一级归属：', b.name); continue; }
    sectors.get(parent).subs.push({ n: b.name, z: b.pct, s: stocks });
    nStocks += stocks.length;
  }
  console.log();
  await sleep(GAP_MS);
  const idx = await indexQuotes();

  const out = {
    ts: new Date(Date.now() + 8 * 3600e3).toISOString().replace('T', ' ').slice(0, 16) + ' (北京时间)',
    idx,
    sectors: [...sectors.values()].filter(s => s.subs.length),
  };
  const empty = hy1.filter(b => !sectors.get(b.name).subs.length).map(b => b.name);
  console.log(`股票 ${nStocks} 只，一级 ${out.sectors.length} 个，指数 ${idx.length} 个，耗时 ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  if (empty.length) console.warn('无成分的一级：', empty.join(' '));
  if (nStocks < 4000 || out.sectors.length < 25 || idx.length < 5) throw new Error('数据量异常，拒绝写入');
  if (check) return;
  const file = path.join(__dirname, 'data.js');
  fs.writeFileSync(file, '// 由 update.js 自动生成，请勿手改\nglobalThis.CLOUD_DATA = ' + JSON.stringify(out) + ';\n');
  console.log('已写入', file, (fs.statSync(file).size / 1024).toFixed(0) + 'KB');
}

main().catch(e => { console.error('\n失败：', e.message); process.exit(1); });
