import React, { useMemo } from 'react';
import './ForestBackground.css';

// キャラクター（ドット絵）に合わせた、ドット絵風の動く森の背景。
// 遠景・中景・近景を別々の速さで横に流して奥行きを出す（パララックス）。
// 各レイヤーは SVG を一度だけ文字列化して CSS 背景として横に繰り返すため、DOM は増えない。

const PX = 4; // ドット1つの大きさ（画面上のpx）
const TILE = 160; // 1枚のタイル幅（ドット数）。左右の端がつながるように描く

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  c: string;
}

// 再現性のある疑似乱数（毎回同じ森になる）
const createRandom = (seed: number) => () => {
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

const toSvgUrl = (height: number, rects: Rect[]) => {
  const body = wrapRects(rects)
    .map((r) => `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${r.c}"/>`)
    .join('');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${TILE} ${height}" ` +
    `width="${TILE * PX}" height="${height * PX}" shape-rendering="crispEdges">${body}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
};

// タイル幅で周期的になる波（端がつながる）
const wave = (x: number, k: number, phase = 0) => Math.sin(((x / TILE) * k + phase) * Math.PI * 2);

// ===== 遠景：霞んだ丘と遠くの木々 =====
const FAR_H = 64;
const buildFar = () => {
  const rand = createRandom(7);
  const rects: Rect[] = [];
  // 遠くの木々のシルエット
  for (let i = 0; i < 22; i++) {
    const x = Math.floor((i / 22) * TILE + rand() * 5);
    const r = 4 + Math.floor(rand() * 4);
    const top = 28 + Math.floor(rand() * 8);
    rects.push(...blob(x, top, r, '#8fc9b0'));
    rects.push({ x: x - r, y: top, w: r * 2 + 1, h: FAR_H - top, c: '#8fc9b0' });
  }
  // 丘
  for (let x = 0; x < TILE; x++) {
    const h = Math.round(36 + wave(x, 2) * 4 + wave(x, 5, 0.3) * 2);
    rects.push({ x, y: h, w: 1, h: FAR_H - h, c: '#7ab89c' });
  }
  return { url: toSvgUrl(FAR_H, rects), height: FAR_H };
};

// ===== 中景：広葉樹と針葉樹の森 =====
const MID_H = 84;
const buildMid = () => {
  const rand = createRandom(42);
  const rects: Rect[] = [];
  const trees: { x: number; kind: 'round' | 'pine'; size: number }[] = [];
  let x = 4;
  while (x < TILE) {
    trees.push({ x, kind: rand() < 0.35 ? 'pine' : 'round', size: 0.8 + rand() * 0.45 });
    x += 15 + Math.floor(rand() * 10);
  }

  // 地面（奥の草地）
  for (let gx = 0; gx < TILE; gx++) {
    const top = Math.round(72 + wave(gx, 3) * 1.5);
    rects.push({ x: gx, y: top, w: 1, h: MID_H - top, c: '#4e9a52' });
  }

  for (const t of trees) {
    const s = t.size;
    const trunkW = Math.max(2, Math.round(3 * s));
    if (t.kind === 'round') {
      const crownY = Math.round(74 - 40 * s);
      rects.push({ x: t.x - 1, y: crownY, w: trunkW, h: 74 - crownY, c: '#6b4a32' });
      rects.push({ x: t.x - 1, y: crownY, w: 1, h: 74 - crownY, c: '#523624' });
      const r = Math.round(9 * s);
      rects.push(...blob(t.x - Math.round(r * 0.6), crownY + 3, r, '#2e7a46'));
      rects.push(...blob(t.x + Math.round(r * 0.7), crownY + 4, r - 1, '#2e7a46'));
      rects.push(...blob(t.x, crownY - Math.round(r * 0.5), r, '#3a9152'));
      rects.push(...blob(t.x - Math.round(r * 0.3), crownY - Math.round(r * 0.8), Math.round(r * 0.55), '#5db36a'));
      rects.push(...blob(t.x - Math.round(r * 0.5), crownY - r, Math.max(1, Math.round(r * 0.25)), '#8fd27f'));
    } else {
      const height = Math.round(52 * s);
      const base = 74;
      rects.push({ x: t.x - 1, y: base - 8, w: trunkW, h: 8, c: '#5a3d29' });
      // 下から4段の三角形を少しずつ重ねて、もみの木の形にする
      const tiers = 4;
      const step = Math.round(height / (tiers + 0.6));
      const tierH = Math.round(step * 1.6);
      for (let k = 0; k < tiers; k++) {
        const bottomY = base - 6 - k * step;
        const maxHalf = (11 - k * 2.2) * s;
        for (let j = 0; j < tierH; j++) {
          const half = Math.max(0, Math.round(maxHalf * (1 - j / tierH)));
          const y = bottomY - j;
          rects.push({ x: t.x - half, y, w: half * 2 + 1, h: 1, c: '#2a6b48' });
          if (half > 1) rects.push({ x: t.x - half, y, w: Math.ceil(half * 0.75), h: 1, c: '#3b875a' });
          if (j === 0 && half > 2) rects.push({ x: t.x - half, y, w: half * 2 + 1, h: 1, c: '#225a3c' });
        }
      }
    }
  }
  return { url: toSvgUrl(MID_H, rects), height: MID_H };
};

// ===== 近景：小道・草・花・茂み =====
const NEAR_H = 30;
const buildNear = () => {
  const rand = createRandom(99);
  const rects: Rect[] = [];
  // 草地
  rects.push({ x: 0, y: 4, w: TILE, h: NEAR_H - 4, c: '#3f8a3a' });
  // 小道
  rects.push({ x: 0, y: 12, w: TILE, h: 10, c: '#d6b47c' });
  rects.push({ x: 0, y: 12, w: TILE, h: 1, c: '#b8935d' });
  rects.push({ x: 0, y: 21, w: TILE, h: 1, c: '#b8935d' });
  // 小石
  for (let i = 0; i < 18; i++) {
    rects.push({ x: Math.floor(rand() * TILE), y: 14 + Math.floor(rand() * 6), w: 2, h: 1, c: '#a8875a' });
  }
  // 草の縁のギザギザ
  for (let x = 0; x < TILE; x += 2) {
    const h = 1 + Math.floor(rand() * 3);
    rects.push({ x, y: 4 - h, w: 1, h, c: '#4f9a3e' });
    if (rand() < 0.4) rects.push({ x: x + 1, y: 11, w: 1, h: 2, c: '#4f9a3e' });
  }
  // 茂み
  for (let i = 0; i < 4; i++) {
    const bx = Math.floor((i / 4) * TILE + rand() * 20);
    rects.push(...blob(bx, 6, 5, '#2f7a3a'));
    rects.push(...blob(bx - 2, 4, 3, '#4fa652'));
  }
  // 花
  const flowers = ['#f6d55c', '#f28ab2', '#ffffff', '#9fb8ff'];
  for (let i = 0; i < 16; i++) {
    const fx = Math.floor(rand() * TILE);
    const fy = rand() < 0.5 ? 2 + Math.floor(rand() * 4) : 23 + Math.floor(rand() * 5);
    rects.push({ x: fx, y: fy + 1, w: 1, h: 2, c: '#2f6e2c' });
    rects.push({ x: fx, y: fy, w: 1, h: 1, c: flowers[i % flowers.length] });
  }
  return { url: toSvgUrl(NEAR_H, rects), height: NEAR_H };
};

// 浮遊する光の粒（ホタル・花粉）と舞う葉っぱ
const PARTICLES = Array.from({ length: 14 }, (_, i) => {
  const rand = createRandom(200 + i * 13);
  return {
    left: `${Math.round(rand() * 100)}%`,
    top: `${Math.round(20 + rand() * 60)}%`,
    delay: `${(rand() * 8).toFixed(2)}s`,
    duration: `${(6 + rand() * 6).toFixed(2)}s`
  };
});

const LEAVES = Array.from({ length: 5 }, (_, i) => {
  const rand = createRandom(500 + i * 31);
  return {
    left: `${Math.round(10 + rand() * 90)}%`,
    delay: `${(rand() * 10).toFixed(2)}s`,
    duration: `${(8 + rand() * 6).toFixed(2)}s`,
    color: i % 2 ? '#7cc36a' : '#e0b84a'
  };
});

interface ForestBackgroundProps {
  // true のときキャラクターが歩いている扱いで景色が流れる
  moving: boolean;
}

export const ForestBackground: React.FC<ForestBackgroundProps> = ({ moving }) => {
  const layers = useMemo(
    () => [
      { key: 'far', ...buildFar(), speed: 8, bottom: 22 },
      { key: 'mid', ...buildMid(), speed: 22, bottom: 14 },
      { key: 'near', ...buildNear(), speed: 60, bottom: 0 }
    ],
    []
  );

  return (
    <div className={`forest-bg ${moving ? 'is-moving' : ''}`} aria-hidden="true">
      <div className="forest-sky" />
      <div className="forest-sun" />
      <div className="forest-rays">
        <span />
        <span />
        <span />
      </div>

      {layers.map((layer) => {
        const tileWidth = TILE * PX;
        return (
          <div
            key={layer.key}
            className="forest-layer"
            style={
              {
                bottom: layer.bottom * PX,
                height: layer.height * PX,
                width: `calc(100% + ${tileWidth}px)`,
                backgroundImage: layer.url,
                backgroundSize: `${tileWidth}px ${layer.height * PX}px`,
                '--tile': `${tileWidth}px`,
                animationDuration: `${tileWidth / layer.speed}s`
              } as React.CSSProperties
            }
          />
        );
      })}

      <div className="forest-particles">
        {PARTICLES.map((p, i) => (
          <span
            key={i}
            className="forest-particle"
            style={{ left: p.left, top: p.top, animationDelay: p.delay, animationDuration: p.duration }}
          />
        ))}
        {LEAVES.map((l, i) => (
          <span
            key={`leaf-${i}`}
            className="forest-leaf"
            style={{
              left: l.left,
              animationDelay: l.delay,
              animationDuration: l.duration,
              background: l.color
            }}
          />
        ))}
      </div>
    </div>
  );
};

export default ForestBackground;
