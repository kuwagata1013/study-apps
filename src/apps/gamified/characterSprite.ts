// 冒険者キャラクターのドット絵（56 × 96 ドット、1ドット = 2px で表示）。
// 頭・髪・コート・腕は元のイラストから作ったデータ（characterReference.ts）をそのまま使い、
// 歩くときに大きく動く脚だけを同じ色合いでコードで描いて、12コマの歩行と腰かけ姿勢を作る。

import { REFERENCE_CHARS, REFERENCE_PALETTE, REFERENCE_ROWS } from './characterReference';

export const SPRITE_W = 56;
export const SPRITE_H = 96;
export const SPRITE_PX = 2;

// ===== 色 =====
const OUTLINE = '#191918';
const PANTS = '#3e3a34';
const PANTS_BACK = '#2c2926';
const PANTS_LIGHT = '#57514a';
const BOOT = '#cfcbc4';
const BOOT_MID = '#aeaba4';
const BOOT_DARK = '#86847f';
const SOLE = '#55534f';

// 元データの色を少し鮮やかにする（縮小でくすんだ分を戻す）
const saturate = (hex: string, amount: number) => {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return hex;
  let s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h /= 6;
  s = Math.min(1, s * amount);
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t: number) => {
    t = (t + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return (
    '#' +
    [hue(h + 1 / 3), hue(h), hue(h - 1 / 3)]
      .map((v) => Math.round(v * 255).toString(16).padStart(2, '0'))
      .join('')
  );
};

const PALETTE = REFERENCE_PALETTE.map((c) => saturate(c, 1.45));

// 瞳を元のイラストに近い青に塗り直す（縮小で灰色っぽくなるため）
const EYE_COLORS: Record<string, string> = {
  l: '#3b7fd4', // 瞳
  p: '#6fb0f0', // 瞳の明るい部分
  i: '#24365c', // 瞳の上側
  c: '#2b2433', // まつ毛
  g: '#2b2433',
  d: '#2b2433',
  f: '#4a3a3a'
};
const isEyeArea = (row: number, col: number) => row >= 26 && row <= 33 && col >= 34 && col <= 43;

// ===== 元データを部品に分ける =====
type Part = 'main' | 'tail' | 'none';

const partOf = (row: number, col: number): Part => {
  // 後ろになびくコートの裾（歩くと揺れる）
  if (row >= 62 && (row < 79 ? col <= 20 : col <= 13)) return 'tail';
  // 腰から下は元の脚なので使わず、コードで描き直す
  if (row >= 70) return 'none';
  return 'main';
};

interface Pixel {
  x: number;
  y: number;
  c: string;
}

const buildReference = () => {
  const main: Pixel[] = [];
  const tail: Pixel[] = [];
  REFERENCE_ROWS.forEach((rowText, y) => {
    [...rowText].forEach((ch, x) => {
      if (ch === '.') return;
      // 縮小でできた髪のまわりの白いにじみと、毛先の下の余計な線を消す
      if (y === 45 && x < 12) return;
      if (y <= 12 && x <= 10 && 'ABF'.includes(ch)) return;
      const part = partOf(y, x);
      if (part === 'none') return;
      let c = PALETTE[REFERENCE_CHARS.indexOf(ch)];
      if (isEyeArea(y, x) && EYE_COLORS[ch]) c = EYE_COLORS[ch];
      (part === 'tail' ? tail : main).push({ x, y, c });
    });
  });
  // ほっぺの赤み
  main.push({ x: 38, y: 34, c: '#f0a49a' }, { x: 39, y: 34, c: '#f0a49a' });
  return { main, tail };
};

const REF = buildReference();

// ===== 描画用の格子 =====
class Grid {
  px: (string | null)[] = new Array(SPRITE_W * SPRITE_H).fill(null);

  set(x: number, y: number, c: string) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= SPRITE_W || y >= SPRITE_H) return;
    this.px[y * SPRITE_W + x] = c;
  }

  // 元データの部品を貼る。shiftX(y) で段ごとに横へずらせる
  paste(pixels: Pixel[], dy: number, shiftX: (y: number) => number = () => 0, maxY = SPRITE_H) {
    for (const p of pixels) {
      if (p.y + dy > maxY) continue;
      this.set(p.x + shiftX(p.y), p.y + dy, p.c);
    }
  }

  toDataUrl() {
    let body = '';
    for (let y = 0; y < SPRITE_H; y++) {
      let x = 0;
      while (x < SPRITE_W) {
        const c = this.px[y * SPRITE_W + x];
        if (!c) {
          x++;
          continue;
        }
        let w = 1;
        while (x + w < SPRITE_W && this.px[y * SPRITE_W + x + w] === c) w++;
        body += `<rect x="${x}" y="${y}" width="${w}" height="1" fill="${c}"/>`;
        x += w;
      }
    }
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SPRITE_W} ${SPRITE_H}" ` +
      `width="${SPRITE_W * SPRITE_PX}" height="${SPRITE_H * SPRITE_PX}" shape-rendering="crispEdges">${body}</svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }
}

// ===== 脚 =====
// 脚は「太もも・すね（先に向かって細くなる）」「ひざ」「ブーツの足先」を
// 1本ずつ別の層に描き、外側に輪郭線をつけてから重ねる。
// 足先は角度を持ち、着地ではかかとから、蹴り出しではつま先を支点にかかとが上がる。

type Vec = { x: number; y: number };

// 太もも・すねの2本の骨から、ひざの位置を求める（ひざは前に曲がる）
const THIGH = 10;
const SHIN = 10;
const knee = (hip: Vec, ankle: Vec): Vec => {
  const dx = ankle.x - hip.x;
  const dy = ankle.y - hip.y;
  const dist = Math.min(Math.hypot(dx, dy) || 1, THIGH + SHIN - 0.01);
  // 余弦定理で太ももの角度を求める
  const base = Math.atan2(dy, dx);
  const cosA = (THIGH * THIGH + dist * dist - SHIN * SHIN) / (2 * THIGH * dist);
  const a = Math.acos(Math.max(-1, Math.min(1, cosA)));
  // 右向きのキャラクターなので、ひざが前（+x）に出る向きを選ぶ
  const k1 = { x: hip.x + Math.cos(base - a) * THIGH, y: hip.y + Math.sin(base - a) * THIGH };
  const k2 = { x: hip.x + Math.cos(base + a) * THIGH, y: hip.y + Math.sin(base + a) * THIGH };
  return k1.x > k2.x ? k1 : k2;
};

// 足先（ブーツ）の形。足首を原点にした座標で、+x がつま先、+y が下
const FOOT_SHAPE: [number, number][] = [
  [-2.6, -1],
  [1.6, -1],
  [4.2, 0.6],
  [6.2, 1.4],
  [6.6, 3],
  [-2.6, 3]
];
const FOOT_SOLE = 2.1; // これより下は靴底の色

const rotate = (p: Vec, a: number): Vec => ({
  x: p.x * Math.cos(a) - p.y * Math.sin(a),
  y: p.x * Math.sin(a) + p.y * Math.cos(a)
});

const insidePolygon = (pt: Vec, poly: [number, number][]) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > pt.y !== yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

// 足先を回したとき、地面にいちばん近い点（かかと or つま先）の高さ
const footLowest = (angle: number) =>
  Math.max(...[FOOT_SHAPE[4], FOOT_SHAPE[5]].map(([x, y]) => rotate({ x, y }, angle).y));

interface LegPose {
  hip: Vec;
  ankle: Vec;
  footAngle: number; // 正：つま先が下がる（かかとが上がる）、負：つま先が上がる
}

const drawLeg = (grid: Grid, pose: LegPose, back: boolean) => {
  const layer = new Map<number, string>();
  const put = (x: number, y: number, c: string) => {
    if (x < 0 || y < 0 || x >= SPRITE_W || y >= SPRITE_H) return;
    layer.set(y * SPRITE_W + x, c);
  };
  const { hip, ankle, footAngle } = pose;
  const k = knee(hip, ankle);
  const bootTop = ankle.y - 7;

  const pantsBase = back ? PANTS_BACK : PANTS;
  const pantsLight = back ? PANTS : PANTS_LIGHT;

  // 先に向かって細くなる骨（端は丸い）
  const limb = (a: Vec, b: Vec, ra: number, rb: number) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy || 1;
    const len = Math.sqrt(len2);
    // 骨に垂直で前（+x）を向く方向。明るい側の判定に使う
    let nx = -dy / len;
    let ny = dx / len;
    if (nx < 0) {
      nx = -nx;
      ny = -ny;
    }
    const r = Math.max(ra, rb);
    for (let y = Math.floor(Math.min(a.y, b.y) - r - 1); y <= Math.ceil(Math.max(a.y, b.y) + r + 1); y++) {
      for (let x = Math.floor(Math.min(a.x, b.x) - r - 1); x <= Math.ceil(Math.max(a.x, b.x) + r + 1); x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / len2));
        const cx = a.x + dx * t;
        const cy = a.y + dy * t;
        const rr = ra + (rb - ra) * t;
        const ox = px - cx;
        const oy = py - cy;
        if (ox * ox + oy * oy > rr * rr) continue;
        const side = ox * nx + oy * ny; // 前側ほど大きい
        let c: string;
        if (py >= bootTop) {
          c = side > rr * 0.35 ? (back ? BOOT_MID : BOOT) : side < -rr * 0.35 ? BOOT_DARK : back ? BOOT_DARK : BOOT_MID;
          // ブーツの履き口
          if (py < bootTop + 1.2) c = back ? BOOT_MID : BOOT;
        } else {
          c = side > rr * 0.4 ? pantsLight : pantsBase;
        }
        put(x, y, c);
      }
    }
  };

  limb(hip, k, 3.3, 2.7);
  limb(k, ankle, 2.6, 2.2);

  // 足先：画素の中心を足先の座標に戻して、形の内側かどうかで塗る
  for (let y = Math.floor(ankle.y - 4); y <= Math.ceil(ankle.y + 5); y++) {
    for (let x = Math.floor(ankle.x - 5); x <= Math.ceil(ankle.x + 8); x++) {
      const local = rotate({ x: x + 0.5 - ankle.x, y: y + 0.5 - ankle.y }, -footAngle);
      if (!insidePolygon(local, FOOT_SHAPE)) continue;
      let c = local.x > 1.5 ? (back ? BOOT_MID : BOOT) : back ? BOOT_DARK : BOOT_MID;
      if (local.y > FOOT_SOLE) c = SOLE;
      put(x, y, c);
    }
  }

  // 輪郭線（この脚の外側だけ）
  const outline = new Set<number>();
  layer.forEach((_c, idx) => {
    const x = idx % SPRITE_W;
    const y = Math.floor(idx / SPRITE_W);
    for (const [ox, oy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ]) {
      const nx = x + ox;
      const ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= SPRITE_W || ny >= SPRITE_H) continue;
      const nIdx = ny * SPRITE_W + nx;
      if (!layer.has(nIdx)) outline.add(nIdx);
    }
  });
  outline.forEach((idx) => grid.set(idx % SPRITE_W, Math.floor(idx / SPRITE_W), OUTLINE));
  layer.forEach((c, idx) => grid.set(idx % SPRITE_W, Math.floor(idx / SPRITE_W), c));
};

// 腰まわり（コートの下のズボン）。両脚の付け根をつなぎ、コートの裾の下に隠れる
const drawHips = (grid: Grid, hipY: number) => {
  for (let y = hipY - 6; y <= hipY + 3; y++) {
    for (let x = 23; x <= 41; x++) {
      const dx = (x + 0.5 - 32) / 9;
      const dy = (y + 0.5 - (hipY - 2)) / 5;
      if (dx * dx + dy * dy <= 1) grid.set(x, y, dx > 0.45 ? PANTS_LIGHT : PANTS);
    }
  }
};

// ===== 歩行 =====

export const WALK_FRAMES = 12;
// 片足が前後に動く幅の半分（ドット）。接地中はこの幅の2倍を一定の速さで後ろへ動く
export const STRIDE_HALF = 9;
const LIFT = 6; // 足を前へ戻すときに上げる高さ
const SOLE_Y = 93; // 靴底の一番下の行
const GROUND_ANKLE = SOLE_Y - FOOT_SHAPE[5][1]; // 足先が水平なときの足首の高さ
const HIP_X_BACK = 29;
const HIP_X_FRONT = 34;
const HIP_Y = 71;

const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// 片足の動き。p = 0 で前に着地（かかとから）、p = 0.5 で後ろから蹴り出し、後半は足を上げて前へ戻す
const legAt = (p: number, hipX: number, hipY: number): LegPose => {
  p = ((p % 1) + 1) % 1;
  if (p < 0.5) {
    // 接地中：一定の速さで後ろへ（地面と同じ速さ）
    const x = hipX + STRIDE_HALF - 4 * STRIDE_HALF * p;
    let footAngle = 0;
    if (p < 0.08) footAngle = lerp(-0.35, 0, p / 0.08); // かかとから着地
    else if (p > 0.3) footAngle = lerp(0, 0.6, (p - 0.3) / 0.2); // かかとが上がる
    // かかと or つま先が地面に触れるよう、足首の高さを合わせる
    const ankleY = SOLE_Y - footLowest(footAngle);
    // 支点（蹴り出しはつま先、着地はかかと）が地面と同じ速さで動くよう、足首の横位置を合わせる
    let ankleX = x;
    if (footAngle !== 0) {
      const [px, py] = footAngle > 0 ? FOOT_SHAPE[4] : FOOT_SHAPE[5];
      ankleX = x + px - rotate({ x: px, y: py }, footAngle).x;
    }
    return { hip: { x: hipX, y: hipY }, ankle: { x: ankleX, y: Math.min(GROUND_ANKLE, ankleY) }, footAngle };
  }
  // 足を上げて前へ戻す：ひざを曲げて持ち上げ、着地の前につま先を上げる
  const q = (p - 0.5) / 0.5;
  // 蹴り出し終わりの足首の位置から、着地直前の位置へなめらかにつなぐ
  const endStance = legAt(0.4999, hipX, hipY).ankle.x;
  const startStance = legAt(0, hipX, hipY).ankle.x;
  const x = lerp(endStance, startStance, smooth(q));
  const lift = LIFT * Math.sin(Math.PI * Math.min(1, q * 1.15));
  const startY = SOLE_Y - footLowest(0.6);
  const ankleY = lerp(startY, SOLE_Y - footLowest(-0.35), smooth(q)) - lift;
  const footAngle = lerp(0.6, -0.35, smooth(q));
  return { hip: { x: hipX, y: hipY }, ankle: { x, y: ankleY }, footAngle };
};

const buildWalkFrame = (i: number) => {
  const p = i / WALK_FRAMES;
  const grid = new Grid();
  // 両足が開いて着地した直後に体が沈み、片足立ちで足が交差するときに上がる
  const bob = Math.round((1 + Math.cos(4 * Math.PI * (p - 0.06))) / 2);
  const sway = Math.sin(2 * Math.PI * p * 2);
  const hipY = HIP_Y + bob;

  grid.paste(REF.tail, bob, (y) => Math.round(-sway * 1.5 * Math.max(0, (y - 62) / 22)));
  drawLeg(grid, legAt(p + 0.5, HIP_X_BACK, hipY), true);
  drawLeg(grid, legAt(p, HIP_X_FRONT, hipY), false);
  drawHips(grid, hipY);
  // 背中の髪の毛先も少し揺らす
  grid.paste(REF.main, bob, (y) => (y >= 36 && y <= 46 ? Math.round(sway * 0.8 * ((y - 36) / 10)) : 0));
  return grid.toDataUrl();
};

// ===== 腰かけ（キャンプ） =====

const SIT_DROP = 12;
const buildSitFrame = (breath: number) => {
  const grid = new Grid();
  const dy = SIT_DROP + breath;
  const hipY = HIP_Y + SIT_DROP;
  grid.paste(REF.tail, SIT_DROP, (y) => Math.round(Math.max(0, (y - 62) / 22) * 2), 90);
  // 太ももは前へ、すねは下へ。足先は地面に置く
  drawLeg(grid, { hip: { x: HIP_X_BACK, y: hipY }, ankle: { x: HIP_X_BACK + 11, y: GROUND_ANKLE }, footAngle: 0 }, true);
  drawLeg(grid, { hip: { x: HIP_X_FRONT, y: hipY }, ankle: { x: HIP_X_FRONT + 12, y: GROUND_ANKLE }, footAngle: 0 }, false);
  drawHips(grid, hipY);
  grid.paste(REF.main, dy);
  return grid.toDataUrl();
};

let walkCache: string[] | null = null;
let sitCache: string[] | null = null;

export const getWalkFrames = () => (walkCache ??= Array.from({ length: WALK_FRAMES }, (_, i) => buildWalkFrame(i)));
export const getSitFrames = () => (sitCache ??= [buildSitFrame(0), buildSitFrame(1)]);
