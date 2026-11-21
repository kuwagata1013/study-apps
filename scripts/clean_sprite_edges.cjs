// キャラクター画像の縁に残った白っぽいふち（背景を抜いたときの残り）を取り除く
// 使い方: node scripts/clean_sprite_edges.cjs in.png [out.png] [passes]
// 輪郭の外側1列のうち「色味がなく、すぐ内側の色より明るい」画素だけを透明にする。
// 白いコートのように内側も同じ色の部分は残る。
const { readPng, writePng } = require('./png_util.cjs');

const [, , inFile, outFile = inFile, passesArg = '2'] = process.argv;
const img = readPng(inFile);
const { width: W, height: H, data: d } = img;

const alpha = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : d[(y * W + x) * 4 + 3]);
const isEdge = (x, y) =>
  alpha(x, y) > 0 && (!alpha(x - 1, y) || !alpha(x + 1, y) || !alpha(x, y - 1) || !alpha(x, y + 1));
const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

let removedTotal = 0;
for (let pass = 0; pass < Number(passesArg); pass++) {
  const remove = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!isEdge(x, y)) continue;
      const i = (y * W + x) * 4;
      const [r, g, b] = d.subarray(i, i + 3);
      const l0 = lum(r, g, b);
      // 暗い輪郭線の上にぽつんと乗った明るい点：まわりの不透明な画素よりずっと明るければ取り除く
      let m = 0, sum = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if ((!dx && !dy) || !alpha(x + dx, y + dy)) continue;
          const j = ((y + dy) * W + x + dx) * 4;
          sum += lum(d[j], d[j + 1], d[j + 2]);
          m++;
        }
      if (m > 0 && l0 > 120 && l0 - sum / m > 55) {
        remove.push(i);
        continue;
      }
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      if (sat > 40) continue; // 色味のある画素（髪・肌・ネクタイなど）は残す
      // すぐ内側（縁ではない不透明な画素）の平均
      let n = 0, ir = 0, ig = 0, ib = 0;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx, ny = y + dy;
          if ((!dx && !dy) || !alpha(nx, ny) || isEdge(nx, ny)) continue;
          const j = (ny * W + nx) * 4;
          ir += d[j]; ig += d[j + 1]; ib += d[j + 2]; n++;
        }
      const l = lum(r, g, b);
      if (n === 0) {
        // 内側が無い（細い飛び出し）明るい画素は取り除く
        if (l > 150) remove.push(i);
        continue;
      }
      const inner = lum(ir / n, ig / n, ib / n);
      if (l > 110 && l - inner > 30) remove.push(i);
    }
  for (const i of remove) d[i + 3] = 0;
  removedTotal += remove.length;
  if (!remove.length) break;
}

// どこにもつながっていない1画素だけの点も消す
let specks = 0;
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    if (!alpha(x, y)) continue;
    let near = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && alpha(x + dx, y + dy)) near++;
    if (near === 0) {
      d[(y * W + x) * 4 + 3] = 0;
      specks++;
    }
  }

// 透明な画素の色は黒にそろえる（拡大・縮小で縁に白がにじまないように）
for (let i = 0; i < d.length; i += 4) if (!d[i + 3]) d[i] = d[i + 1] = d[i + 2] = 0;

writePng(outFile, img);
console.log(`${inFile}: 縁 ${removedTotal} 画素・点 ${specks} 個を透明に → ${outFile}`);
