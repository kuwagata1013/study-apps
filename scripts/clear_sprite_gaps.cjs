// 歩行画像（walk_sheet.png）の足のあいだに残った白い部分（背景の抜き残し）を透明にする
// 使い方: node scripts/clear_sprite_gaps.cjs [in.png] [out.png]
// 指定したコマの範囲で、白に近い画素のかたまりと、そのふちの明るい灰色を取り除く
const { readPng, writePng } = require('./png_util.cjs');

const [, , inFile = 'src/assets/character/walk_sheet.png', outFile = inFile] = process.argv;
const img = readPng(inFile);
const { width: W, height: H, data: d } = img;

// 各コマの枠の左上（GamifiedApp.tsx の WALK_FRAMES と同じ）
const FRAMES = [
  [2, 3], [157, 3], [312, 2], [467, 2],
  [0, 288], [158, 288], [313, 288], [468, 288],
  [0, 576], [155, 576], [311, 579], [469, 579]
];
// 抜き残しがある場所（コマ番号は 1 から、座標はコマの左上からの位置）
const GAPS = [
  { frame: 3, x0: 70, x1: 92, y0: 228, y1: 270 },
  { frame: 3, x0: 86, x1: 93, y0: 214, y1: 227 },
  { frame: 3, x0: 47, x1: 54, y0: 228, y1: 235 },
  { frame: 7, x0: 74, x1: 84, y0: 248, y1: 275 },
  { frame: 9, x0: 78, x1: 92, y0: 262, y1: 274 }
];

const lum = (i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
const sat = (i) => Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]);
const isWhite = (i) => d[i + 3] && Math.min(d[i], d[i + 1], d[i + 2]) > 205 && sat(i) < 30;

let total = 0;
for (const g of GAPS) {
  const [fx, fy] = FRAMES[g.frame - 1];
  const inBox = (x, y) => x >= fx + g.x0 && x <= fx + g.x1 && y >= fy + g.y0 && y <= fy + g.y1;
  // 1) 白い画素
  const cleared = new Set();
  for (let y = fy + g.y0; y <= fy + g.y1; y++)
    for (let x = fx + g.x0; x <= fx + g.x1; x++) {
      const i = (y * W + x) * 4;
      if (isWhite(i)) cleared.add(y * W + x);
    }
  // 2) それにくっついた明るい灰色（ふちのにじみ）を2周ぶん
  for (let pass = 0; pass < 2; pass++) {
    const add = [];
    for (const p of cleared) {
      const px = p % W, py = (p - px) / W;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = px + dx, ny = py + dy;
        if (!inBox(nx, ny)) continue;
        const q = ny * W + nx;
        const j = q * 4;
        if (!cleared.has(q) && d[j + 3] && lum(j) > 165 && sat(j) < 35) add.push(q);
      }
    }
    add.forEach((q) => cleared.add(q));
    if (!add.length) break;
  }
  for (const p of cleared) {
    const i = p * 4;
    d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 0;
  }
  console.log(`コマ${g.frame}: ${cleared.size} 画素を透明に`);
  total += cleared.size;
}

writePng(outFile, img);
console.log(`合計 ${total} 画素 → ${outFile}`);
