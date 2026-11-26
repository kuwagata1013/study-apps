import React, { useMemo } from 'react';
import { mix, sceneColors, type Scene } from './sceneTime';
import { PX, TILE, createRandom, layersOf, toPngUrl, type Scenery } from './scenery';
import './ForestBackground.css';

// キャラクター（ドット絵）に合わせた、ドット絵風の動く背景（景色の絵は scenery.ts）。
// 遠景・中景・近景を別々の速さで横に流して奥行きを出す（パララックス）。
// 各レイヤーは SVG を一度だけ文字列化して CSS 背景として横に繰り返すため、DOM は増えない。

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
    duration: `${(8 + rand() * 6).toFixed(2)}s`
  };
});

interface ForestBackgroundProps {
  // true のときキャラクターが歩いている扱いで景色が流れる
  moving: boolean;
  scene: Scene; // 時間帯と天気
  scenery: Scenery; // レベルで開放される景色
}

export const ForestBackground: React.FC<ForestBackgroundProps> = ({ moving, scene, scenery }) => {
  const { phase, weather } = scene;
  const colors = useMemo(() => sceneColors({ phase, weather }, scenery.sky), [phase, weather, scenery]);
  const art = layersOf(scenery);
  const layers = useMemo(
    () => [
      { key: 'far', height: art.far.height, url: toPngUrl(art.far, colors.far), speed: 8, bottom: 22 },
      { key: 'mid', height: art.mid.height, url: toPngUrl(art.mid, colors.mid), speed: 22, bottom: 14 },
      { key: 'near', height: art.near.height, url: toPngUrl(art.near, colors.near), speed: 60, bottom: 0 }
    ],
    [colors, art]
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
        {dry && phase !== 'night' && scenery.leaves && LEAVES.map((l, i) => (
          <span
            key={`leaf-${i}`}
            className="forest-leaf"
            style={{
              left: l.left,
              animationDelay: l.delay,
              animationDuration: l.duration,
              background: scenery.leaves?.[i % 2]
            }}
          />
        ))}
      </div>
    </div>
  );
};

export default ForestBackground;
