require('./treemap.js');
const { squarify } = globalThis.Treemap;
let fail = 0;
function check(name, ok, info) { console.log((ok ? 'PASS ' : 'FAIL ') + name, info || ''); if (!ok) fail++; }
const items = [6, 6, 4, 3, 2, 2, 1].map((v, i) => ({ v, id: i }));
const r = squarify(items, 0, 0, 600, 400);
check('count', r.length === items.length);
const area = r.reduce((a, b) => a + b.w * b.h, 0);
check('area sums to box', Math.abs(area - 240000) < 1e-6, area);
let overlap = false;
for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) {
  const a = r[i], b = r[j];
  if (a.x < b.x + b.w - 1e-9 && b.x < a.x + a.w - 1e-9 && a.y < b.y + b.h - 1e-9 && b.y < a.y + a.h - 1e-9) overlap = true;
}
check('no overlap', !overlap);
check('inside box', r.every(q => q.x >= -1e-9 && q.y >= -1e-9 && q.x + q.w <= 600 + 1e-6 && q.y + q.h <= 400 + 1e-6));
check('area proportional', r.every(q => Math.abs(q.w * q.h - q.item.v * 10000) < 1e-6));
const worstRatio = Math.max(...r.map(q => Math.max(q.w / q.h, q.h / q.w)));
check('aspect ratio sane (<3)', worstRatio < 3, worstRatio.toFixed(2));
check('zero weights skipped', squarify([{ v: 0 }, { v: 5 }], 0, 0, 10, 10).length === 1);
check('empty input', squarify([], 0, 0, 10, 10).length === 0);
// 真实数据规模
require('./data.js');
const D = globalThis.CLOUD_DATA;
const all = D.sectors.flatMap(s => s.subs.flatMap(u => u.s.map(x => ({ v: x[2] }))));
const t0 = Date.now(); const rr = squarify(all, 0, 0, 1400, 900); const dt = Date.now() - t0;
check('5k stocks layout fast', rr.length === all.length && dt < 200, `${rr.length} rects ${dt}ms`);
process.exit(fail ? 1 : 0);
