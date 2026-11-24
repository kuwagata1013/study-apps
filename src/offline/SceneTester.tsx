// オフライン版：ゲーム版の背景（景色・時間帯・天気）を自由に切り替えて確認する
import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Play, Square } from 'lucide-react';
import { getSceneOverride, PHASE_LABEL, setSceneOverride, useSceneOverride, WEATHER_LABEL, type Phase, type SceneOverride, type Weather } from '../apps/gamified/sceneTime';
import { SCENERIES, sceneIn } from '../apps/gamified/scenery';

type Key = 'scenery' | 'phase' | 'weather';
const OPTIONS: Record<Key, { label: string; items: [string, string][] }> = {
  scenery: { label: '景色', items: SCENERIES.map((s) => [s.id, s.name]) },
  phase: { label: '時間帯', items: Object.entries(PHASE_LABEL) },
  weather: { label: '天気', items: Object.entries(WEATHER_LABEL) }
};
const KEYS: Key[] = ['scenery', 'phase', 'weather'];
const TOTAL = KEYS.reduce((n, k) => n * OPTIONS[k].items.length, 1);
const AUTO_MS = 2500; // 順番に見るときの、1つあたりの時間

const indexOf = (key: Key, value?: string) => OPTIONS[key].items.findIndex(([id]) => id === value);

// n 番目の組み合わせ（天気→時間帯→景色の順に変わる）
const combo = (n: number): SceneOverride => {
  const w = OPTIONS.weather.items;
  const p = OPTIONS.phase.items;
  const s = OPTIONS.scenery.items;
  return {
    weather: w[n % w.length][0] as Weather,
    phase: p[Math.floor(n / w.length) % p.length][0] as Phase,
    scenery: s[Math.floor(n / (w.length * p.length)) % s.length][0]
  };
};

export default function SceneTester() {
  const value = useSceneOverride();
  const [auto, setAuto] = useState(false);

  const current =
    Math.max(0, indexOf('scenery', value.scenery)) * OPTIONS.phase.items.length * OPTIONS.weather.items.length +
    Math.max(0, indexOf('phase', value.phase)) * OPTIONS.weather.items.length +
    Math.max(0, indexOf('weather', value.weather));

  useEffect(() => {
    if (!auto) return;
    const timer = setTimeout(() => setSceneOverride({ ...value, ...combo((current + 1) % TOTAL) }), AUTO_MS);
    return () => clearTimeout(timer);
  }, [auto, current, value]);

  const set = (key: Key, v: string) => {
    setAuto(false);
    setSceneOverride({ ...getSceneOverride(), [key]: v || undefined });
  };
  const step = (key: Key, by: number) => {
    const items = OPTIONS[key].items;
    const i = indexOf(key, getSceneOverride()[key]);
    set(key, items[i < 0 ? (by > 0 ? 0 : items.length - 1) : (i + by + items.length) % items.length][0]);
  };

  // その景色では別の天気に置きかわるとき
  const scenery = SCENERIES.find((s) => s.id === value.scenery);
  const shown = scenery && value.weather ? sceneIn(scenery, { phase: value.phase ?? 'day', weather: value.weather }).weather : value.weather;

  return (
    <div className="space-y-1.5 border-t border-gray-200 pt-2">
      <p className="font-bold">ゲーム版の背景</p>
      {KEYS.map((key) => (
        <div key={key} className="flex items-center gap-1">
          <span className="w-10 shrink-0">{OPTIONS[key].label}</span>
          <button onClick={() => step(key, -1)} aria-label={`前の${OPTIONS[key].label}`} className="p-1.5 rounded-md border border-gray-300 hover:bg-gray-100">
            <ChevronLeft size={14} />
          </button>
          <select
            value={value[key] ?? ''}
            onChange={(e) => set(key, e.target.value)}
            aria-label={OPTIONS[key].label}
            className="flex-1 min-w-0 rounded-md border border-gray-300 px-1 py-1.5 text-xs"
          >
            <option value="">{key === 'scenery' ? 'プロフィールの設定' : '自動'}</option>
            {OPTIONS[key].items.map(([id, text]) => (
              <option key={id} value={id}>
                {text}
              </option>
            ))}
          </select>
          <button onClick={() => step(key, 1)} aria-label={`次の${OPTIONS[key].label}`} className="p-1.5 rounded-md border border-gray-300 hover:bg-gray-100">
            <ChevronRight size={14} />
          </button>
        </div>
      ))}
      {value.weather && shown && shown !== value.weather && (
        <p className="text-[11px] text-amber-700">
          「{scenery?.name}」では「{WEATHER_LABEL[value.weather]}」の代わりに「{WEATHER_LABEL[shown]}」になります
        </p>
      )}
      <div className="flex gap-1">
        <button
          onClick={() => {
            if (!auto) setSceneOverride({ ...value, ...combo(current) });
            setAuto(!auto);
          }}
          className="flex-1 rounded-md bg-gray-900 text-white py-1.5 font-bold flex items-center justify-center gap-1 hover:bg-gray-700"
        >
          {auto ? <Square size={12} /> : <Play size={12} />}
          {auto ? `止める（${current + 1} / ${TOTAL}）` : '全部を順に見る'}
        </button>
        <button
          onClick={() => {
            setAuto(false);
            setSceneOverride(value.unlockAll ? { unlockAll: true } : {});
          }}
          className="rounded-md border border-gray-300 px-2 py-1.5 font-bold hover:bg-gray-100"
        >
          元に戻す
        </button>
      </div>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={!!value.unlockAll} onChange={(e) => setSceneOverride({ ...value, unlockAll: e.target.checked || undefined })} />
        プロフィールの景色も全部開放する
      </label>
    </div>
  );
}
