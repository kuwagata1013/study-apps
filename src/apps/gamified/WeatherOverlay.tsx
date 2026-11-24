import React from 'react';
import type { Weather } from './sceneTime';
import './WeatherOverlay.css';

// 雨・雪・霧。ドット絵の粒を1枚のタイルにして、繰り返しの背景を動かす（DOM は増えない）
const TILE = 240;

const tile = (seed: number, count: number, draw: (x: number, y: number, r: number) => string) => {
  let s = seed;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  let body = '';
  for (let i = 0; i < count; i++) {
    // 端で切れないよう、内側に置く
    body += draw(Math.floor(rand() * (TILE - 12)), Math.floor(rand() * (TILE - 24)), rand());
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE}" height="${TILE}" shape-rendering="crispEdges">${body}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
};

const rainDrop = (h: number, opacity: number) => (x: number, y: number) =>
  `<rect x="${x}" y="${y}" width="2" height="${h}" fill="#d6e8f7" opacity="${opacity}"/>`;
const snowFlake = (size: number, opacity: number) => (x: number, y: number, r: number) => {
  const w = r < 0.5 ? size : size + 2;
  return `<rect x="${x}" y="${y}" width="${w}" height="${w}" fill="#ffffff" opacity="${opacity}"/>`;
};

const IMAGES = {
  rain: [tile(11, 26, rainDrop(12, 0.35)), tile(29, 18, rainDrop(20, 0.55))],
  snow: [tile(17, 16, snowFlake(2, 0.5)), tile(41, 9, snowFlake(4, 0.8))]
};

const WeatherOverlay: React.FC<{ weather: Weather }> = ({ weather }) => {
  if (weather === 'rain' || weather === 'snow') {
    return (
      <div className={`weather weather-${weather}`} aria-hidden="true">
        {IMAGES[weather].map((image, i) => (
          <span key={i} style={{ backgroundImage: image }} />
        ))}
      </div>
    );
  }
  if (weather === 'fog') {
    return (
      <div className="weather weather-fog" aria-hidden="true">
        <span />
        <span />
      </div>
    );
  }
  return null;
};

export default WeatherOverlay;
