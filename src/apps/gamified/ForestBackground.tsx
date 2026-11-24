import React, { useMemo } from 'react';
import { mix, sceneColors, type Scene } from './sceneTime';
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

interface Layer {
  rects: Rect[];
  height: number;
}
// 時間帯と天気の色を混ぜて、1枚の画像にする
const toSvgUrl = ({ height, rects }: Layer, tint: { color: string; amount: number }) => {
  const tinted = new Map<string, string>();
  const colorOf = (c: string) => {
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
  return { rects, height: FAR_H };
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
  return { rects, height: MID_H };
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
  return { rects, height: NEAR_H };
};

const FAR = buildFar();
const MID = buildMid();
const NEAR = buildNear();

// ===== 雲（晴れの日は少し、くもりの日は多く出す） =====
const CLOUDS = Array.from({ length: 9 }, (_, i) => {
  const rand = createRandom(800 + i * 47);
  rand();
  return {
    top: `${Math.round(4 + rand() * 34)}%`,
    scale: 0.7 + rand() * 0.8,
    duration: 90 + rand() * 80,
    offset: (i / 9 + rand() * 0.08) % 1
  };
});
const Cloud: React.FC<{ color: string; shade: string }> = ({ color, shade }) => (
  <svg viewBox="0 0 32 11" width={128} height={44} shapeRendering="crispEdges">
    <path fill={color} d="M10 0h8v1h2v1h2v1h4v1h3v1h2v2h1v3H0V7h1V5h3V4h2V2h2V1h2z" />
    <path fill={shade} d="M0 8h32v2h-2v1H2v-1H0z" />
  </svg>
);

// ===== 夜の星 =====
const STARS = Array.from({ length: 46 }, (_, i) => {
  const rand = createRandom(1200 + i * 59);
  rand();
  return { left: `${(rand() * 100).toFixed(1)}%`, top: `${(rand() * 58).toFixed(1)}%`, size: rand() < 0.2 ? 4 : 2, delay: `${(-rand() * 5).toFixed(2)}s` };
});

// 浮遊する光の粒（ホタル・花粉）と舞う葉っぱ
const PARTICLES = Array.from({ length: 14 }, (_, i) => {
  const rand = createRandom(200 + i * 13);
  rand(); // 1つ目は偏るので捨てる
  return {
    left: `${Math.round(rand() * 100)}%`,
    top: `${Math.round(20 + rand() * 60)}%`,
    delay: `${(rand() * 8).toFixed(2)}s`,
    duration: `${(6 + rand() * 6).toFixed(2)}s`
  };
});

const LEAVES = Array.from({ length: 5 }, (_, i) => {
  const rand = createRandom(500 + i * 31);
  rand(); // 1つ目は偏るので捨てる
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
  scene: Scene; // 時間帯と天気
}

export const ForestBackground: React.FC<ForestBackgroundProps> = ({ moving, scene }) => {
  const { phase, weather } = scene;
  const colors = useMemo(() => sceneColors({ phase, weather }), [phase, weather]);
  const layers = useMemo(
    () => [
      { key: 'far', height: FAR.height, url: toSvgUrl(FAR, colors.far), speed: 8, bottom: 22 },
      { key: 'mid', height: MID.height, url: toSvgUrl(MID, colors.mid), speed: 22, bottom: 14 },
      { key: 'near', height: NEAR.height, url: toSvgUrl(NEAR, colors.near), speed: 60, bottom: 0 }
    ],
    [colors]
  );
  const [s0, s1, s2, s3] = colors.sky;
  const clear = weather === 'sunny';
  const dry = weather !== 'rain' && weather !== 'snow';
  const clouds = clear ? CLOUDS.slice(0, 3) : weather === 'fog' ? [] : CLOUDS;

  return (
    <div className={`forest-bg ${moving ? 'is-moving' : ''}`} aria-hidden="true">
      <div className="forest-sky" style={{ background: `linear-gradient(180deg, ${s0} 0%, ${s1} 45%, ${s2} 75%, ${s3} 100%)` }} />
      {phase === 'night' && (clear || weather === 'cloudy') && (
        <div className={`forest-stars ${clear ? '' : 'is-faint'}`}>
          {STARS.map((s, i) => (
            <span key={i} style={{ left: s.left, top: s.top, width: s.size, height: s.size, animationDelay: s.delay }} />
          ))}
        </div>
      )}
      {(clear || weather === 'cloudy') && (
        <div className={`forest-sun is-${phase} ${clear ? '' : 'is-faint'}`}>
          {phase === 'night' && (
            <svg viewBox="0 0 12 12" width={48} height={48} shapeRendering="crispEdges">
              <path fill="#fdf3c4" d="M4 0h4v1h2v1h1v2h1v4h-1v2h-1v1H8v1H4v-1H2v-1H1V8H0V4h1V2h1V1h2z" />
              <path fill="#e2d39a" d="M3 3h2v2H3zM7 6h3v2H7zM4 8h2v1H4z" />
            </svg>
          )}
        </div>
      )}
      {clear && phase !== 'night' && (
        <div className={`forest-rays is-${phase}`}>
          <span />
          <span />
          <span />
        </div>
      )}
      <div className="forest-clouds">
        {clouds.map((c, i) => (
          <span
            key={i}
            style={{ top: c.top, scale: String(c.scale), animationDuration: `${c.duration}s`, animationDelay: `${-c.duration * c.offset}s` }}
          >
            <Cloud color={colors.cloud} shade={mix(colors.cloud, s1, 0.35)} />
          </span>
        ))}
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

      <div className={`forest-particles is-${phase}`}>
        {dry && PARTICLES.map((p, i) => (
          <span
            key={i}
            className="forest-particle"
            style={{ left: p.left, top: p.top, animationDelay: p.delay, animationDuration: p.duration }}
          />
        ))}
        {dry && phase !== 'night' && LEAVES.map((l, i) => (
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
