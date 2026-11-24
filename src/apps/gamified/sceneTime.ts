// ゲーム版の背景：時間帯（端末の時計）と天気（日付と時刻から決める。全員同じ）
import { useEffect, useState, useSyncExternalStore } from 'react';

export type Phase = 'morning' | 'day' | 'evening' | 'night';
export type Weather = 'sunny' | 'cloudy' | 'rain' | 'snow' | 'fog';
export interface Scene {
  phase: Phase;
  weather: Weather;
}

export const PHASE_LABEL: Record<Phase, string> = { morning: '朝', day: '昼', evening: '夕方', night: '夜' };
export const WEATHER_LABEL: Record<Weather, string> = { sunny: '晴れ', cloudy: 'くもり', rain: '雨', snow: '雪', fog: '霧' };

// 朝 5〜8時台、昼 9〜15時台、夕方 16〜18時台、夜 19〜4時台
export const phaseAt = (date: Date): Phase => {
  const h = date.getHours();
  if (h >= 5 && h < 9) return 'morning';
  if (h >= 9 && h < 16) return 'day';
  if (h >= 16 && h < 19) return 'evening';
  return 'night';
};

const WEATHER_HOURS = 3; // 天気が変わる間隔（時間）

// 0〜1 の数。日付と時刻から決めるので、全員同じ天気になる
const roll = (text: string) => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// 晴れ 45%・くもり 25%・雨 20%・霧 10%。12〜2月は雨の代わりに雪が降ることがある
export const weatherAt = (date: Date): Weather => {
  const key = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}:${Math.floor(date.getHours() / WEATHER_HOURS)}`;
  const r = roll(`weather:${key}`);
  if (r < 0.45) return 'sunny';
  if (r < 0.7) return 'cloudy';
  if (r < 0.9) {
    const winter = [11, 0, 1].includes(date.getMonth());
    return winter && roll(`snow:${key}`) < 0.6 ? 'snow' : 'rain';
  }
  return 'fog';
};

export const sceneAt = (date: Date): Scene => ({ phase: phaseAt(date), weather: weatherAt(date) });

// オフライン版（確認用）だけ、時間帯・天気・景色を選んで試せる
export interface SceneOverride extends Partial<Scene> {
  scenery?: string;
  unlockAll?: boolean; // 景色をすべて開放する
}
const OVERRIDE_KEY = 'offline_demo_scene';
const CHANGED = 'scene-override';
const readOverride = (): SceneOverride => {
  if (import.meta.env.MODE !== 'offline') return {};
  try {
    const v = JSON.parse(localStorage.getItem(OVERRIDE_KEY) || '{}') as SceneOverride;
    return {
      ...(v.phase && v.phase in PHASE_LABEL ? { phase: v.phase } : {}),
      ...(v.weather && v.weather in WEATHER_LABEL ? { weather: v.weather } : {}),
      ...(typeof v.scenery === 'string' ? { scenery: v.scenery } : {}),
      ...(v.unlockAll ? { unlockAll: true } : {})
    };
  } catch {
    return {};
  }
};
let override = readOverride();
export const getSceneOverride = () => override;
export const setSceneOverride = (v: SceneOverride) => {
  if (import.meta.env.MODE !== 'offline') return;
  localStorage.setItem(OVERRIDE_KEY, JSON.stringify(v));
  override = readOverride();
  window.dispatchEvent(new Event(CHANGED));
};
const subscribeOverride = (listener: () => void) => {
  window.addEventListener(CHANGED, listener);
  return () => window.removeEventListener(CHANGED, listener);
};
export const useSceneOverride = () => useSyncExternalStore(subscribeOverride, getSceneOverride);

const currentScene = (): Scene => {
  const now = sceneAt(new Date());
  return { phase: override.phase ?? now.phase, weather: override.weather ?? now.weather };
};

// 今の時間帯と天気（開いたままでも切り替わる）
export const useScene = (): Scene => {
  const [scene, setScene] = useState(currentScene);
  useEffect(() => {
    const update = () =>
      setScene((prev) => {
        const next = currentScene();
        return prev.phase === next.phase && prev.weather === next.weather ? prev : next;
      });
    const timer = setInterval(update, 20000);
    document.addEventListener('visibilitychange', update);
    window.addEventListener(CHANGED, update);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener(CHANGED, update);
    };
  }, []);
  return scene;
};

// ===== 色 =====
type Rgb = [number, number, number];
const toRgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
const toHex = (c: number[]) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
export const mix = (from: string, to: string, amount: number) => {
  const a = toRgb(from);
  const b = toRgb(to);
  return toHex(a.map((v, i) => v + (b[i] - v) * amount));
};

interface Tint {
  color: string;
  amount: number;
}
// 先に a、次に b を重ねた結果と同じになる1枚の色
const combine = (a: Tint, b: Tint): Tint => {
  const amount = 1 - (1 - a.amount) * (1 - b.amount);
  return amount === 0 ? a : { amount, color: mix(a.color, b.color, b.amount / amount) };
};

const PHASE_TINT: Record<Phase, Tint> = {
  morning: { color: '#ffd9b8', amount: 0.14 },
  day: { color: '#ffffff', amount: 0 },
  evening: { color: '#8a3f4a', amount: 0.34 },
  night: { color: '#0b1538', amount: 0.64 }
};
const SKY: Record<Phase, string[]> = {
  morning: ['#8ebfe6', '#f6d3cf', '#fde6bd', '#f7efc6'],
  day: ['#a9dcef', '#c9ecd9', '#e4f3c8', '#cfe8a8'],
  evening: ['#5d5a9c', '#c4698c', '#f59a6a', '#ffcf7f'],
  night: ['#070d26', '#10204a', '#1f3566', '#31497a']
};
// 雲・雨・霧のときに混ざる色
const HAZE: Record<Phase, string> = { morning: '#b9bfca', day: '#b4c0ca', evening: '#80707f', night: '#1b2338' };
const WEATHER_SKY: Record<Weather, number> = { sunny: 0, cloudy: 0.55, rain: 0.8, snow: 0.7, fog: 0.75 };
const WEATHER_GROUND: Record<Weather, number> = { sunny: 0, cloudy: 0.1, rain: 0.24, snow: 0.3, fog: 0.2 };
// 遠くの景色ほど霞む（遠景・中景に足す分）
const WEATHER_FAR: Record<Weather, number> = { sunny: 0, cloudy: 0.12, rain: 0.35, snow: 0.35, fog: 0.75 };

export const sceneColors = ({ phase, weather }: Scene, skyTint?: Tint) => {
  const haze = HAZE[phase];
  const groundHaze = weather === 'snow' ? mix(haze, '#ffffff', phase === 'night' ? 0.2 : 0.6) : mix(haze, '#000000', weather === 'rain' ? 0.3 : 0);
  const base = combine(PHASE_TINT[phase], { color: groundHaze, amount: WEATHER_GROUND[weather] });
  const far = WEATHER_FAR[weather];
  const [r, g, b] = toRgb(base.color);
  return {
    // 景色ごとの空の色は、夜は控えめに混ぜる
    sky: SKY[phase].map((c) =>
      mix(skyTint ? mix(c, skyTint.color, skyTint.amount * (phase === 'night' ? 0.15 : phase === 'evening' ? 0.4 : 1)) : c, haze, WEATHER_SKY[weather])
    ),
    far: combine(base, { color: haze, amount: far }),
    mid: combine(base, { color: haze, amount: far * 0.5 }),
    near: base,
    ground: `rgba(${r}, ${g}, ${b}, ${base.amount.toFixed(3)})`,
    cloud: mix(mix('#ffffff', phase === 'evening' ? '#ffb9a0' : haze, phase === 'day' ? 0 : phase === 'night' ? 0.75 : 0.35), haze, weather === 'sunny' ? 0 : weather === 'rain' ? 0.6 : 0.4)
  };
};
