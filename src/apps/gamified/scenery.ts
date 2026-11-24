// ゲーム版の景色（レベルで開放される）。遠景・中景・近景をドット絵で描く
import { mix, type Weather } from './sceneTime';

export const PX = 4; // ドット1つの大きさ（画面上のpx）
export const TILE = 160; // 1枚のタイル幅（ドット数）。左右の端がつながるように描く

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  c: string;
}
export interface Layer {
  rects: Rect[];
  height: number;
}

// 再現性のある疑似乱数（毎回同じ景色になる）
export const createRandom = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

// 左右の端でつながるよう、はみ出した図形はタイルの反対側にも描く
const wrapRects = (rects: Rect[]) =>
  rects.flatMap((r) => {
    const out = [r];
    if (r.x < 0) out.push({ ...r, x: r.x + TILE });
    if (r.x + r.w > TILE) out.push({ ...r, x: r.x - TILE });
    return out;
  });

// ドットで描いた円（木の葉のかたまりなど）
const blob = (cx: number, cy: number, r: number, c: string): Rect[] => {
  const rows: Rect[] = [];
  for (let dy = -r; dy <= r; dy++) {
    const half = Math.floor(Math.sqrt(r * r - dy * dy) + 0.3);
    rows.push({ x: cx - half, y: cy + dy, w: half * 2 + 1, h: 1, c });
  }
  return rows;
};

// 時間帯と天気の色を混ぜて、1枚の画像にする
export const toSvgUrl = ({ height, rects }: Layer, tint?: { color: string; amount: number }) => {
  const tinted = new Map<string, string>();
  const colorOf = (c: string) => {
    if (!tint) return c;
    if (!tinted.has(c)) tinted.set(c, mix(c, tint.color, tint.amount));
    return tinted.get(c);
  };
  const body = wrapRects(rects)
    .map((r) => `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${colorOf(r.c)}"/>`)
    .join('');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${TILE} ${height}" ` +
    `width="${TILE * PX}" height="${height * PX}" shape-rendering="crispEdges">${body}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
};

// タイル幅で周期的になる波（端がつながる）
const wave = (x: number, k: number, phase = 0) => Math.sin(((x / TILE) * k + phase) * Math.PI * 2);

const FAR_H = 64;
const MID_H = 84;
const NEAR_H = 30;
const BASE = 74; // 中景の木の根元

// 波打つ地形（上の端が波になる帯）
const terrain = (height: number, top: (x: number) => number, c: string): Rect[] =>
  Array.from({ length: TILE }, (_, x) => {
    const y = Math.round(top(x));
    return { x, y, w: 1, h: height - y, c };
  });

// 三角の山。cap があれば頂上に雪などの色を付ける
const mountain = (cx: number, top: number, bottom: number, slope: number, light: string, dark: string, cap?: { c: string; rows: number }): Rect[] => {
  const out: Rect[] = [];
  for (let y = top; y < bottom; y++) {
    const half = Math.round((y - top) * slope);
    const capped = cap && y - top < cap.rows + (y % 3);
    out.push({ x: cx - half, y, w: half + 1, h: 1, c: capped ? cap.c : light });
    out.push({ x: cx + 1, y, w: Math.max(1, half), h: 1, c: capped ? mix(cap.c, dark, 0.3) : dark });
  }
  return out;
};

// ===== 木 =====
interface LeafColors {
  dark: string;
  mid: string;
  light: string;
  shine: string;
}
const roundTree = (x: number, s: number, leaf: LeafColors, trunk = ['#6b4a32', '#523624']): Rect[] => {
  const crownY = Math.round(BASE - 40 * s);
  const trunkW = Math.max(2, Math.round(3 * s));
  const r = Math.round(9 * s);
  return [
    { x: x - 1, y: crownY, w: trunkW, h: BASE - crownY, c: trunk[0] },
    { x: x - 1, y: crownY, w: 1, h: BASE - crownY, c: trunk[1] },
    ...blob(x - Math.round(r * 0.6), crownY + 3, r, leaf.dark),
    ...blob(x + Math.round(r * 0.7), crownY + 4, r - 1, leaf.dark),
    ...blob(x, crownY - Math.round(r * 0.5), r, leaf.mid),
    ...blob(x - Math.round(r * 0.3), crownY - Math.round(r * 0.8), Math.round(r * 0.55), leaf.light),
    ...blob(x - Math.round(r * 0.5), crownY - r, Math.max(1, Math.round(r * 0.25)), leaf.shine)
  ];
};
const pineTree = (x: number, s: number, leaf: { dark: string; mid: string; light: string }, snow?: string): Rect[] => {
  const rects: Rect[] = [{ x: x - 1, y: BASE - 8, w: Math.max(2, Math.round(3 * s)), h: 8, c: '#5a3d29' }];
  // 下から4段の三角形を少しずつ重ねて、もみの木の形にする
  const tiers = 4;
  const step = Math.round(Math.round(52 * s) / (tiers + 0.6));
  const tierH = Math.round(step * 1.6);
  for (let k = 0; k < tiers; k++) {
    const bottomY = BASE - 6 - k * step;
    const maxHalf = (11 - k * 2.2) * s;
    for (let j = 0; j < tierH; j++) {
      const half = Math.max(0, Math.round(maxHalf * (1 - j / tierH)));
      const y = bottomY - j;
      rects.push({ x: x - half, y, w: half * 2 + 1, h: 1, c: leaf.mid });
      if (half > 1) rects.push({ x: x - half, y, w: Math.ceil(half * 0.75), h: 1, c: leaf.light });
      if (j === 0 && half > 2) rects.push({ x: x - half, y, w: half * 2 + 1, h: 1, c: leaf.dark });
      // 枝に積もった雪
      if (snow && (j > tierH * 0.45 || (j > 1 && j < 4))) rects.push({ x: x - half, y, w: j > tierH * 0.45 ? half * 2 + 1 : Math.ceil(half * 0.6), h: 1, c: snow });
    }
  }
  return rects;
};
const palmTree = (x: number, s: number): Rect[] => {
  const h = Math.round(40 * s);
  const rects: Rect[] = [];
  let top = { x, y: BASE };
  for (let i = 0; i < h; i++) {
    const px = x + Math.round(Math.pow(i / h, 2) * 8);
    rects.push({ x: px, y: BASE - i, w: 3, h: 1, c: i % 4 === 0 ? '#7a5534' : '#a0764a' });
    top = { x: px + 1, y: BASE - i };
  }
  // 葉：中心から弧を描いて垂れる
  const fronds = [[-13, 5], [-11, -3], [-5, -7], [6, -7], [12, -3], [13, 6]];
  fronds.forEach(([dx, dy], f) => {
    for (let t = 0; t <= 14; t++) {
      const k = t / 14;
      const fx = Math.round(top.x + dx * k * s);
      const fy = Math.round(top.y + (dy * k + (dy < 0 ? 9 : 4) * k * k - 3 * Math.sin(k * Math.PI)) * s);
      rects.push({ x: fx, y: fy, w: 2, h: k > 0.7 ? 2 : 3, c: f % 2 ? '#3f9a55' : '#2c7d48' });
      if (t % 2) rects.push({ x: fx, y: fy, w: 1, h: 1, c: '#79c96b' });
    }
  });
  rects.push(...blob(top.x - 2, top.y + 3, 1, '#6b4427'), ...blob(top.x + 2, top.y + 3, 1, '#7d5231'));
  return rects;
};

// 木などを横に並べる
const spread = (seed: number, start: number, min: number, range: number, draw: (x: number, rand: () => number, i: number) => Rect[]) => {
  const rand = createRandom(seed);
  rand();
  const rects: Rect[] = [];
  let i = 0;
  for (let x = start; x < TILE - 4; x += min + Math.floor(rand() * range)) rects.push(...draw(x, rand, i++));
  return rects;
};

// ===== 近景（小道・縁・飾り） =====
interface NearColors {
  ground: string;
  edge: string; // 草の縁など
  path: string;
  pathEdge: string;
  stone: string;
  bush?: [string, string];
  flowers?: string[];
  stem?: string;
}
const nearLayer = (c: NearColors, extra: Rect[] = []): Layer => {
  const rand = createRandom(99);
  const rects: Rect[] = [
    { x: 0, y: 4, w: TILE, h: NEAR_H - 4, c: c.ground },
    { x: 0, y: 12, w: TILE, h: 10, c: c.path },
    { x: 0, y: 12, w: TILE, h: 1, c: c.pathEdge },
    { x: 0, y: 21, w: TILE, h: 1, c: c.pathEdge }
  ];
  for (let i = 0; i < 18; i++) {
    rects.push({ x: Math.floor(rand() * TILE), y: 14 + Math.floor(rand() * 6), w: 2, h: 1, c: c.stone });
  }
  for (let x = 0; x < TILE; x += 2) {
    const h = 1 + Math.floor(rand() * 3);
    rects.push({ x, y: 4 - h, w: 1, h, c: c.edge });
    if (rand() < 0.4) rects.push({ x: x + 1, y: 11, w: 1, h: 2, c: c.edge });
  }
  for (let i = 0; i < 4; i++) {
    const bx = Math.floor((i / 4) * TILE + rand() * 20);
    if (c.bush) rects.push(...blob(bx, 6, 5, c.bush[0]), ...blob(bx - 2, 4, 3, c.bush[1]));
  }
  for (let i = 0; i < 16; i++) {
    const fx = Math.floor(rand() * TILE);
    const fy = rand() < 0.5 ? 2 + Math.floor(rand() * 4) : 23 + Math.floor(rand() * 5);
    if (!c.flowers) continue;
    if (c.stem) rects.push({ x: fx, y: fy + 1, w: 1, h: 2, c: c.stem });
    rects.push({ x: fx, y: fy, w: 1, h: 1, c: c.flowers[i % c.flowers.length] });
  }
  return { rects: [...rects, ...extra], height: NEAR_H };
};

// 丸い木のシルエットが並ぶ遠景
const woodsFar = (tree: string, hill: string): Layer => {
  const rand = createRandom(7);
  const rects: Rect[] = [];
  for (let i = 0; i < 22; i++) {
    const x = Math.floor((i / 22) * TILE + rand() * 5);
    const r = 4 + Math.floor(rand() * 4);
    const top = 28 + Math.floor(rand() * 8);
    rects.push(...blob(x, top, r, tree), { x: x - r, y: top, w: r * 2 + 1, h: FAR_H - top, c: tree });
  }
  rects.push(...terrain(FAR_H, (x) => 36 + wave(x, 2) * 4 + wave(x, 5, 0.3) * 2, hill));
  return { rects, height: FAR_H };
};
const midGround = (c: string) => terrain(MID_H, (x) => 72 + wave(x, 3) * 1.5, c);

const PINE = { dark: '#225a3c', mid: '#2a6b48', light: '#3b875a' };

// ===== 景色ごとの絵 =====
interface Layers {
  far: Layer;
  mid: Layer;
  near: Layer;
}

const forest = (): Layers => {
  const rand = createRandom(42);
  const mid = midGround('#4e9a52');
  const trees: { x: number; pine: boolean; size: number }[] = [];
  for (let x = 4; x < TILE; x += 15 + Math.floor(rand() * 10)) trees.push({ x, pine: rand() < 0.35, size: 0.8 + rand() * 0.45 });
  const leaf = { dark: '#2e7a46', mid: '#3a9152', light: '#5db36a', shine: '#8fd27f' };
  trees.forEach((t) => mid.push(...(t.pine ? pineTree(t.x, t.size, PINE) : roundTree(t.x, t.size, leaf))));
  return {
    far: woodsFar('#8fc9b0', '#7ab89c'),
    mid: { rects: mid, height: MID_H },
    near: nearLayer({
      ground: '#3f8a3a', edge: '#4f9a3e', path: '#d6b47c', pathEdge: '#b8935d', stone: '#a8875a',
      bush: ['#2f7a3a', '#4fa652'], flowers: ['#f6d55c', '#f28ab2', '#ffffff', '#9fb8ff'], stem: '#2f6e2c'
    })
  };
};

const sakura = (): Layers => {
  const pinks: LeafColors[] = [
    { dark: '#d987a8', mid: '#efaac4', light: '#f9c9da', shine: '#fff0f5' },
    { dark: '#c9749b', mid: '#e695b6', light: '#f4b8ce', shine: '#ffe4ee' }
  ];
  return {
    far: woodsFar('#f0c3d2', '#a9cfa5'),
    mid: {
      rects: [
        ...midGround('#86bd68'),
        ...spread(61, 6, 17, 9, (x, rand, i) => roundTree(x, 0.85 + rand() * 0.4, pinks[i % 2], ['#5c4038', '#452e2a']))
      ],
      height: MID_H
    },
    near: nearLayer({
      ground: '#6aa84f', edge: '#80bd60', path: '#e3cfae', pathEdge: '#c2a983', stone: '#f3b6cb',
      bush: ['#5b9a4b', '#8cc474'], flowers: ['#f7b7cd', '#ffdce8', '#f294b4', '#ffffff']
    })
  };
};

const beach = (): Layers => {
  const rand = createRandom(23);
  rand();
  // 海と、水平線の島
  const far: Rect[] = [
    ...blob(48, 37, 9, '#7fb59a').filter((r) => r.y < 36),
    ...blob(60, 37, 5, '#93c4a6').filter((r) => r.y < 36),
    ...terrain(FAR_H, () => 36, '#4aa3d6'),
    { x: 0, y: 44, w: TILE, h: FAR_H - 44, c: '#3a93cc' },
    { x: 0, y: 36, w: TILE, h: 1, c: '#a8def2' }
  ];
  for (let i = 0; i < 34; i++) {
    const y = 38 + Math.floor(rand() * 24);
    far.push({ x: Math.floor(rand() * TILE), y, w: 3 + Math.floor(rand() * 8), h: 1, c: i % 3 ? '#7fc7ea' : '#c8ecf8' });
  }
  return {
    far: { rects: far, height: FAR_H },
    mid: {
      rects: [
        ...terrain(MID_H, (x) => 68 + wave(x, 2) * 1.5, '#dff5f7'),
        ...terrain(MID_H, (x) => 70 + wave(x, 2, 0.1) * 1.5, '#ecd9a4'),
        ...spread(37, 12, 40, 18, (x, r) => palmTree(x, 0.85 + r() * 0.35))
      ],
      height: MID_H
    },
    near: nearLayer(
      { ground: '#e6d09a', edge: '#d9c087', path: '#f4e6c0', pathEdge: '#cfb57c', stone: '#d8c191', flowers: ['#f6a6a0', '#ffffff', '#f2c879', '#c9a0c9'] },
      [30, 104].flatMap((x) => [
        // ヒトデと貝
        { x, y: 25, w: 3, h: 1, c: '#e8785e' },
        { x: x + 1, y: 24, w: 1, h: 3, c: '#e8785e' },
        { x: x + 22, y: 7, w: 2, h: 2, c: '#fff3e0' }
      ])
    )
  };
};

const autumn = (): Layers => {
  const leaves: LeafColors[] = [
    { dark: '#a33b22', mid: '#c9502b', light: '#e5763a', shine: '#f7a95c' },
    { dark: '#b9701d', mid: '#dc9429', light: '#f1b847', shine: '#ffe083' },
    { dark: '#8c2f2a', mid: '#b23c34', light: '#d35a48', shine: '#ee8a6d' }
  ];
  return {
    far: {
      rects: [
        ...mountain(36, 8, FAR_H, 1.15, '#c79a86', '#b08577'),
        ...mountain(112, 2, FAR_H, 1.05, '#d0a48c', '#b88d7c'),
        ...terrain(FAR_H, (x) => 42 + wave(x, 2) * 4 + wave(x, 7, 0.2) * 1.5, '#cf8e5c')
      ],
      height: FAR_H
    },
    mid: {
      rects: [
        ...midGround('#b58a3c'),
        ...spread(83, 5, 15, 9, (x, r, i) => (r() < 0.18 ? pineTree(x, 0.85 + r() * 0.3, PINE) : roundTree(x, 0.8 + r() * 0.45, leaves[i % 3])))
      ],
      height: MID_H
    },
    near: nearLayer({
      ground: '#9a7a35', edge: '#b59243', path: '#cfa878', pathEdge: '#a67f50', stone: '#c9602f',
      bush: ['#a8482a', '#d9783c'], flowers: ['#e0602f', '#f0b040', '#c03a2c', '#f6d060']
    })
  };
};

const snowfield = (): Layers => ({
  far: {
    rects: [
      ...mountain(30, 4, FAR_H, 0.95, '#b9cde2', '#9ab2cd', { c: '#ffffff', rows: 16 }),
      ...mountain(84, 12, FAR_H, 1.1, '#c3d4e6', '#a5bad2', { c: '#ffffff', rows: 12 }),
      ...mountain(134, 0, FAR_H, 0.9, '#b4c9df', '#95aeca', { c: '#ffffff', rows: 18 }),
      ...terrain(FAR_H, (x) => 46 + wave(x, 2) * 3, '#dbe7f2')
    ],
    height: FAR_H
  },
  mid: {
    rects: [
      ...midGround('#e9f1f8'),
      ...spread(19, 8, 17, 12, (x, r) => pineTree(x, 0.75 + r() * 0.5, { dark: '#2d5566', mid: '#3a6878', light: '#4d8090' }, '#f4f9fd'))
    ],
    height: MID_H
  },
  near: nearLayer({
    ground: '#edf4fa', edge: '#ffffff', path: '#cddcea', pathEdge: '#b0c5d8', stone: '#b9cadb',
    bush: ['#d2e0ec', '#ffffff'], flowers: ['#ffffff', '#cfe4f5']
  })
});

const desert = (): Layers => {
  const pillar = (x: number, h: number, broken: boolean): Rect[] => [
    { x: x - 3, y: BASE - 3, w: 10, h: 3, c: '#b8935f' },
    { x: x - 1, y: BASE - h, w: 6, h: h - 3, c: '#d9b87f' },
    { x: x + 3, y: BASE - h, w: 2, h: h - 3, c: '#b8935f' },
    { x: x, y: BASE - h, w: 1, h: h - 3, c: '#ecd3a0' },
    ...(broken
      ? [{ x: x - 1, y: BASE - h - 2, w: 3, h: 2, c: '#d9b87f' }]
      : [{ x: x - 3, y: BASE - h - 3, w: 10, h: 3, c: '#ecd3a0' }])
  ];
  const cactus = (x: number, s: number): Rect[] => {
    const h = Math.round(24 * s);
    return [
      { x, y: BASE - h, w: 5, h, c: '#4d8a4a' },
      { x: x + 1, y: BASE - h, w: 1, h, c: '#79b368' },
      { x: x - 5, y: BASE - h + 10, w: 5, h: 3, c: '#4d8a4a' },
      { x: x - 5, y: BASE - h + 4, w: 3, h: 7, c: '#4d8a4a' },
      { x: x + 5, y: BASE - h + 13, w: 5, h: 3, c: '#3e733e' },
      { x: x + 7, y: BASE - h + 7, w: 3, h: 7, c: '#3e733e' },
      { x: x + 1, y: BASE - h - 1, w: 3, h: 1, c: '#f28ab2' }
    ];
  };
  return {
    far: {
      rects: [
        ...mountain(40, 14, FAR_H, 1.2, '#e6c38c', '#cda56e'),
        ...mountain(72, 26, FAR_H, 1.2, '#e2bd86', '#c79e68'),
        ...terrain(FAR_H, (x) => 44 + wave(x, 1) * 5 + wave(x, 3, 0.4) * 2, '#edd0a0')
      ],
      height: FAR_H
    },
    mid: {
      rects: [
        ...terrain(MID_H, (x) => 70 + wave(x, 2) * 3, '#e3bd7f'),
        ...cactus(14, 1.1),
        ...pillar(44, 46, false),
        ...pillar(62, 30, true),
        ...cactus(90, 0.85),
        ...pillar(112, 38, true),
        ...pillar(130, 52, false),
        { x: 127, y: BASE - 59, w: 10, h: 4, c: '#d9b87f' },
        ...cactus(150, 0.75)
      ],
      height: MID_H
    },
    near: nearLayer({ ground: '#dcb573', edge: '#e6c588', path: '#efd7a6', pathEdge: '#c79f61', stone: '#bd9760', flowers: ['#b98f58', '#f4e2bb'] })
  };
};

const skyIsland = (): Layers => {
  const island = (cx: number, top: number, half: number): Rect[] => {
    const out: Rect[] = [];
    for (let j = 0; j < half * 1.3; j++) {
      const w = Math.round(half * (1 - Math.pow(j / (half * 1.3), 1.4)));
      out.push({ x: cx - w, y: top + 2 + j, w: w * 2 + 1, h: 1, c: j % 4 === 3 ? '#9c8fc0' : '#b1a4d2' });
    }
    out.push({ x: cx - half, y: top, w: half * 2 + 1, h: 3, c: '#8fd0a8' }, { x: cx - half, y: top, w: half * 2 + 1, h: 1, c: '#c3efc9' });
    return out;
  };
  const crystal = (x: number, h: number): Rect[] => {
    const out: Rect[] = [];
    for (let j = 0; j < h; j++) {
      const half = Math.min(4, Math.round(Math.min(j * 0.7, 4)));
      out.push({ x: x - half, y: BASE - h + j, w: half + 1, h: 1, c: '#b7f0ff' }, { x: x + 1, y: BASE - h + j, w: Math.max(1, half), h: 1, c: '#6fb8e8' });
    }
    out.push({ x: x - 1, y: BASE - h + 4, w: 1, h: Math.round(h * 0.4), c: '#ffffff' });
    return out;
  };
  const column = (x: number, h: number): Rect[] => [
    { x: x - 2, y: BASE - 3, w: 9, h: 3, c: '#d8cfea' },
    { x, y: BASE - h, w: 5, h, c: '#f3eefb' },
    { x: x + 3, y: BASE - h, w: 2, h, c: '#cfc4e4' },
    { x: x - 2, y: BASE - h - 3, w: 9, h: 3, c: '#f6dfa0' },
    { x: x - 2, y: BASE - h - 1, w: 9, h: 1, c: '#d9b765' }
  ];
  const leaf = { dark: '#5f9fc4', mid: '#7fbfdc', light: '#a9dfee', shine: '#e2faff' };
  const rand = createRandom(71);
  rand();
  const far = [...island(34, 12, 15), ...island(88, 22, 9), ...island(128, 6, 12)];
  // 雲海
  for (let i = 0; i < 24; i++) far.push(...blob(Math.floor((i / 24) * TILE), 50 + Math.floor(rand() * 6), 6 + Math.floor(rand() * 4), i % 2 ? '#f6f4ff' : '#e4e2f6'));
  far.push({ x: 0, y: 54, w: TILE, h: 10, c: '#f6f4ff' });
  return {
    far: { rects: far, height: FAR_H },
    mid: {
      rects: [
        ...midGround('#8ccfb2'),
        ...column(10, 48),
        ...roundTree(34, 0.9, leaf, ['#8d7aa8', '#6f5d8c']),
        ...crystal(54, 24),
        ...crystal(61, 15),
        ...column(80, 34),
        ...roundTree(104, 1.1, leaf, ['#8d7aa8', '#6f5d8c']),
        ...column(124, 52),
        ...column(140, 52),
        { x: 121, y: BASE - 60, w: 28, h: 5, c: '#f3eefb' },
        { x: 121, y: BASE - 56, w: 28, h: 1, c: '#d9b765' },
        ...crystal(155, 18)
      ],
      height: MID_H
    },
    near: nearLayer({
      ground: '#6fbf9b', edge: '#97dcb7', path: '#efe9f8', pathEdge: '#d9b765', stone: '#d3c8e6',
      bush: ['#6aa9cc', '#a9dfee'], flowers: ['#ffffff', '#f6dfa0', '#c9b4f2', '#b7f0ff'], stem: '#4c9c7c'
    })
  };
};

// ===== 一覧 =====
export type SceneryId = 'forest' | 'sakura' | 'beach' | 'autumn' | 'snow' | 'desert' | 'sky';
export interface Scenery {
  id: SceneryId;
  name: string;
  level: number; // 開放されるレベル
  build: () => Layers;
  ground: [base: string, light: string, dark: string]; // いちばん下の地面（近景の地面の色と、粒の色）
  leaves: [string, string] | null; // 舞う葉・花びら
  sky?: { color: string; amount: number }; // 空に混ぜる色
  weather?: Partial<Record<Weather, Weather>>; // 似合わない天気の置きかえ
}
export const SCENERIES: Scenery[] = [
  { id: 'forest', name: 'はじまりの森', level: 1, build: forest, ground: ['#3f8a3a', '#4f9a3e', '#2a5e28'], leaves: ['#7cc36a', '#e0b84a'] },
  { id: 'sakura', name: '桜の並木道', level: 5, build: sakura, ground: ['#6aa84f', '#f7b7cd', '#548c3e'], leaves: ['#ffc9dc', '#f7a8c4'], sky: { color: '#fbe3ec', amount: 0.3 } },
  { id: 'beach', name: '潮風の海辺', level: 15, build: beach, ground: ['#e6d09a', '#f4e6c0', '#c9b17a'], leaves: null, sky: { color: '#8fd3f4', amount: 0.3 }, weather: { snow: 'rain' } },
  { id: 'autumn', name: '紅葉の山道', level: 30, build: autumn, ground: ['#9a7a35', '#d9783c', '#7a5d28'], leaves: ['#e0602f', '#f0b040'], sky: { color: '#fde2bd', amount: 0.25 } },
  { id: 'snow', name: '白銀の雪原', level: 45, build: snowfield, ground: ['#edf4fa', '#ffffff', '#c3d4e4'], leaves: null, sky: { color: '#dcebf7', amount: 0.4 }, weather: { rain: 'snow' } },
  { id: 'desert', name: '砂漠の遺跡', level: 60, build: desert, ground: ['#dcb573', '#f0d7a0', '#b98f52'], leaves: null, sky: { color: '#ffe3ae', amount: 0.3 }, weather: { rain: 'cloudy', snow: 'cloudy' } },
  { id: 'sky', name: '天空の島', level: 100, build: skyIsland, ground: ['#6fbf9b', '#b7f0ff', '#4c9c7c'], leaves: ['#ffffff', '#f6dfa0'], sky: { color: '#cfc4f7', amount: 0.35 } }
];

const built = new Map<SceneryId, Layers>();
export const layersOf = (s: Scenery): Layers => {
  const hit = built.get(s.id) ?? s.build();
  built.set(s.id, hit);
  return hit;
};

// 選んだ景色（記録期間の切り替えで、レベルと一緒に初期化・復元される）
const KEY = 'gamified_scenery';
// オフライン版（確認用）だけ、全部の景色を試せるようにできる
const ALL_KEY = 'offline_demo_all_scenery';
export const allSceneryUnlocked = () => import.meta.env.MODE === 'offline' && localStorage.getItem(ALL_KEY) === '1';
export const setAllSceneryUnlocked = (on: boolean) => localStorage.setItem(ALL_KEY, on ? '1' : '0');

export const isUnlocked = (s: Scenery, level: number) => level >= s.level || allSceneryUnlocked();
export const loadSceneryId = () => localStorage.getItem(KEY) ?? 'forest';
export const saveSceneryId = (id: SceneryId) => localStorage.setItem(KEY, id);
// 選んだ景色。まだ開放されていなければ最初の森
export const sceneryFor = (id: string, level: number): Scenery => {
  const s = SCENERIES.find((x) => x.id === id);
  return s && isUnlocked(s, level) ? s : SCENERIES[0];
};
// レベルが上がって新しく開放された景色
export const newlyUnlocked = (before: number, after: number) => SCENERIES.filter((s) => before < s.level && s.level <= after);
