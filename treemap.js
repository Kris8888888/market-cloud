// 大盘云图 · 布局引擎（浏览器与 node 共用，无依赖）
// squarify：把 items（含 v 权重）铺进 x,y,w,h，返回 [{x,y,w,h,item}]
(function (root) {
  'use strict';

  function worst(row, side, sum) {
    let mx = 0, mn = Infinity;
    for (const r of row) { if (r > mx) mx = r; if (r < mn) mn = r; }
    const s2 = sum * sum, side2 = side * side;
    return Math.max(side2 * mx / s2, s2 / (side2 * mn));
  }

  function squarify(items, x, y, w, h) {
    const out = [];
    const total = items.reduce((a, b) => a + b.v, 0);
    if (!(total > 0) || w <= 0 || h <= 0) return out;
    const scale = (w * h) / total;
    let list = items.filter(it => it.v > 0).map(it => ({ it, a: it.v * scale })).sort((p, q) => q.a - p.a);
    let cx = x, cy = y, cw = w, ch = h;
    let i = 0;
    while (i < list.length) {
      const side = Math.min(cw, ch);
      let row = [], sum = 0, ratio = Infinity;
      while (i < list.length) {
        const a = list[i].a;
        const nr = worst(row.map(r => r.a).concat(a), side, sum + a);
        if (row.length && nr > ratio) break;
        row.push(list[i]); sum += a; ratio = nr; i++;
      }
      const horizontal = cw >= ch;               // 沿短边铺一行
      const thick = side > 0 ? sum / side : 0;   // 行厚度
      let off = 0;
      for (const r of row) {
        const len = thick > 0 ? r.a / thick : 0;
        if (horizontal) out.push({ x: cx, y: cy + off, w: thick, h: len, item: r.it });
        else out.push({ x: cx + off, y: cy, w: len, h: thick, item: r.it });
        off += len;
      }
      if (horizontal) { cx += thick; cw -= thick; } else { cy += thick; ch -= thick; }
    }
    return out;
  }

  root.Treemap = { squarify };
})(typeof globalThis !== 'undefined' ? globalThis : this);
