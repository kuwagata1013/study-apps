import React from 'react';
import './CampScene.css';
import { getSitFrames } from './characterSprite';

const SIT_FRAMES = getSitFrames();

// タイマー停止中に表示する「森でキャンプして休憩中」の絵。
// テント・たき火はドット絵の SVG、炎は2コマを切り替えてゆらめかせる。

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  c: string;
}

const PixelArt: React.FC<{ w: number; h: number; rects: Rect[]; className?: string }> = ({
  w,
  h,
  rects,
  className
}) => (
  <svg
    viewBox={`0 0 ${w} ${h}`}
    width={w * 4}
    height={h * 4}
    shapeRendering="crispEdges"
    className={className}
    aria-hidden="true"
  >
    {rects.map((r, i) => (
      <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={r.c} />
    ))}
  </svg>
);

// ===== テント（30 × 24 ドット） =====
const TENT: Rect[] = (() => {
  const rects: Rect[] = [];
  const W = 30;
  const H = 24;
  const apex = 15;
  for (let y = 2; y < H - 1; y++) {
    const half = Math.round(((y - 2) / (H - 3)) * 14) + 1;
    // 右側は日の当たる明るい布、左側は影
    rects.push({ x: apex - half, y, w: half, h: 1, c: '#c99a52' });
    rects.push({ x: apex, y, w: half, h: 1, c: '#e8c27a' });
    // 入り口（下半分の三角の暗がり）
    if (y >= 10) {
      const door = Math.round(((y - 10) / (H - 11)) * 5);
      rects.push({ x: apex - door, y, w: door * 2 + 1, h: 1, c: '#4a3122' });
    }
  }
  // 入り口のめくれた布
  for (let y = 10; y < H - 1; y++) {
    const door = Math.round(((y - 10) / (H - 11)) * 5);
    rects.push({ x: apex + door + 1, y, w: 2, h: 1, c: '#f4d99b' });
  }
  // 縫い目と骨組み
  rects.push({ x: apex, y: 1, w: 1, h: 9, c: '#8a5e2c' });
  rects.push({ x: apex - 1, y: 0, w: 3, h: 2, c: '#8a5e2c' });
  // 地面の影
  rects.push({ x: 0, y: H - 1, w: W, h: 1, c: 'rgba(40,60,30,0.35)' });
  // ペグとロープ
  rects.push({ x: 0, y: H - 2, w: 1, h: 2, c: '#6b4a32' });
  rects.push({ x: W - 1, y: H - 2, w: 1, h: 2, c: '#6b4a32' });
  return rects;
})();

// ===== たき火の土台（石と薪、16 × 8 ドット） =====
const FIRE_BASE: Rect[] = [
  // 薪（交差）
  { x: 2, y: 4, w: 12, h: 2, c: '#6b4a32' },
  { x: 3, y: 3, w: 4, h: 1, c: '#8a6142' },
  { x: 9, y: 3, w: 4, h: 1, c: '#8a6142' },
  { x: 5, y: 5, w: 6, h: 1, c: '#4f3423' },
  // 燃えさし
  { x: 6, y: 3, w: 4, h: 1, c: '#ff8a3d' },
  // 石
  { x: 0, y: 5, w: 3, h: 3, c: '#8d939c' },
  { x: 3, y: 6, w: 3, h: 2, c: '#a3a9b1' },
  { x: 6, y: 6, w: 4, h: 2, c: '#8d939c' },
  { x: 10, y: 6, w: 3, h: 2, c: '#a3a9b1' },
  { x: 13, y: 5, w: 3, h: 3, c: '#8d939c' },
  { x: 0, y: 5, w: 1, h: 1, c: '#c2c7cd' },
  { x: 13, y: 5, w: 1, h: 1, c: '#c2c7cd' }
];

// ===== 炎（2コマ、12 × 12 ドット） =====
const flame = (shape: number[][]): Rect[] => {
  const colors = ['', '#d9381e', '#ff7a1a', '#ffd23f', '#fff4b0'];
  const rects: Rect[] = [];
  shape.forEach((row, y) =>
    row.forEach((v, x) => {
      if (v) rects.push({ x, y, w: 1, h: 1, c: colors[v] });
    })
  );
  return rects;
};

const FLAME_A = flame([
  [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 1, 2, 1, 0, 0, 1, 0, 0],
  [0, 0, 1, 0, 1, 2, 1, 0, 1, 1, 0, 0],
  [0, 0, 1, 1, 2, 2, 2, 1, 1, 2, 1, 0],
  [0, 1, 2, 1, 2, 3, 2, 1, 2, 2, 1, 0],
  [0, 1, 2, 2, 3, 3, 3, 2, 2, 3, 1, 0],
  [1, 2, 2, 3, 3, 4, 3, 3, 2, 3, 2, 1],
  [1, 2, 3, 3, 4, 4, 4, 3, 3, 3, 2, 1],
  [1, 2, 3, 4, 4, 4, 4, 4, 3, 3, 2, 1],
  [0, 1, 2, 3, 4, 4, 4, 3, 3, 2, 1, 0],
  [0, 0, 1, 2, 3, 3, 3, 3, 2, 1, 0, 0]
]);

const FLAME_B = flame([
  [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0],
  [0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0],
  [0, 0, 1, 0, 0, 1, 2, 1, 0, 0, 0, 0],
  [0, 1, 1, 0, 1, 2, 2, 1, 0, 0, 1, 0],
  [0, 1, 2, 1, 1, 2, 2, 1, 0, 1, 1, 0],
  [0, 1, 2, 1, 2, 3, 2, 2, 1, 1, 2, 1],
  [1, 2, 2, 2, 3, 3, 3, 2, 1, 2, 2, 1],
  [1, 2, 3, 3, 3, 4, 3, 3, 2, 2, 2, 1],
  [1, 2, 3, 4, 4, 4, 4, 3, 3, 3, 2, 1],
  [1, 2, 3, 4, 4, 4, 4, 4, 4, 3, 2, 1],
  [0, 1, 2, 3, 4, 4, 4, 4, 3, 2, 1, 0],
  [0, 0, 1, 2, 3, 3, 3, 3, 2, 1, 0, 0]
]);

// ===== 腰かけ用の丸太（26 × 8 ドット）。キャラクターの足元を隠して座っているように見せる =====
const LOG_SEAT: Rect[] = [
  { x: 2, y: 0, w: 22, h: 7, c: '#7a5236' },
  { x: 2, y: 0, w: 22, h: 2, c: '#946645' },
  { x: 2, y: 5, w: 22, h: 2, c: '#5c3d27' },
  { x: 6, y: 3, w: 5, h: 1, c: '#5c3d27' },
  { x: 15, y: 2, w: 6, h: 1, c: '#5c3d27' },
  // 切り口（年輪）
  { x: 0, y: 1, w: 3, h: 5, c: '#c9a46b' },
  { x: 1, y: 0, w: 2, h: 7, c: '#c9a46b' },
  { x: 1, y: 2, w: 1, h: 3, c: '#a8875a' },
  { x: 23, y: 1, w: 3, h: 5, c: '#a8875a' },
  // 小さな葉っぱ
  { x: 12, y: -0, w: 2, h: 1, c: '#5db36a' },
  { x: 0, y: 7, w: 26, h: 1, c: 'rgba(40,60,30,0.35)' }
];

const SPARKS = [0, 1, 2, 3, 4];

export const CampScene: React.FC = () => (
  <div className="camp-scene" aria-label="キャンプで休憩中">
    <div className="camp-glow" />

    <div className="camp-tent">
      <PixelArt w={30} h={24} rects={TENT} />
    </div>

    <div className="camp-fire">
      <div className="camp-flame">
        <PixelArt w={12} h={12} rects={FLAME_A} className="camp-flame-a" />
        <PixelArt w={12} h={12} rects={FLAME_B} className="camp-flame-b" />
      </div>
      <PixelArt w={16} h={8} rects={FIRE_BASE} />
      {SPARKS.map((i) => (
        <span key={i} className="camp-spark" style={{ animationDelay: `${i * 0.55}s`, left: `${30 + (i % 3) * 14}%` }} />
      ))}
      <span className="camp-smoke" />
      <span className="camp-smoke camp-smoke-2" />
    </div>

    <div className="camp-seat">
      <PixelArt w={26} h={8} rects={LOG_SEAT} />
    </div>

    {/* 丸太に腰かけ、たき火に手をかざして休むキャラクター（2コマで呼吸） */}
    <div className="camp-character" role="img" aria-label="たき火で休憩する冒険者">
      <img src={SIT_FRAMES[0]} alt="" className="camp-sit-a" />
      <img src={SIT_FRAMES[1]} alt="" className="camp-sit-b" />
    </div>

    <p className="camp-caption">キャンプで休憩中… 「学習開始」で冒険に出発！</p>
  </div>
);

export default CampScene;
