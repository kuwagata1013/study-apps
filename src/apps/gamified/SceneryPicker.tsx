import React, { useMemo } from 'react';
import { Lock, Mountain } from 'lucide-react';
import { SCENERIES, TILE, isUnlocked, layersOf, toSvgUrl, type Scenery, type SceneryId } from './scenery';

// 景色の見本（昼・晴れ）。ドット1つを1px で重ねる
const Thumb: React.FC<{ scenery: Scenery; locked: boolean }> = ({ scenery, locked }) => {
  const style = useMemo(() => {
    const { far, mid, near } = layersOf(scenery);
    const layers = [
      { layer: near, bottom: 0 },
      { layer: mid, bottom: 14 },
      { layer: far, bottom: 22 }
    ];
    return {
      backgroundColor: '#bfe4ee',
      backgroundImage: layers.map((l) => toSvgUrl(l.layer)).join(', '),
      backgroundRepeat: 'repeat-x',
      backgroundSize: layers.map((l) => `${TILE}px ${l.layer.height}px`).join(', '),
      backgroundPosition: layers.map((l) => `left bottom ${l.bottom}px`).join(', '),
      imageRendering: 'pixelated'
    } as React.CSSProperties;
  }, [scenery]);
  return <div className={`h-[100px] w-full ${locked ? 'grayscale brightness-50' : ''}`} style={style} />;
};

const SceneryPicker: React.FC<{ level: number; current: SceneryId; onPick: (id: SceneryId) => void }> = ({ level, current, onPick }) => (
  <section className="space-y-2">
    <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
      <Mountain size={14} className="text-[#fdd69f]" /> 冒険の景色
    </h3>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      {SCENERIES.map((s) => {
        const locked = !isUnlocked(s, level);
        const selected = s.id === current;
        return (
          <button
            key={s.id}
            onClick={() => onPick(s.id)}
            disabled={locked}
            aria-pressed={selected}
            className={`relative overflow-hidden rounded-lg border-2 text-left transition ${
              selected ? 'border-[#fdd69f]' : locked ? 'border-white/10' : 'border-[#fdd69f]/20 hover:border-[#fdd69f]/60'
            }`}
          >
            <Thumb scenery={s} locked={locked} />
            {locked && (
              <span className="absolute inset-x-0 top-0 h-[100px] flex flex-col items-center justify-center gap-1 text-white text-[11px] font-black">
                <Lock size={18} /> Lv.{s.level} で開放
              </span>
            )}
            <span
              className={`flex items-center justify-between gap-1 px-2 py-1.5 text-[11px] font-bold ${
                selected ? 'bg-[#fdd69f] text-[#312117]' : locked ? 'bg-[#1f140d] text-white/45' : 'bg-[#1f140d] text-white'
              }`}
            >
              {locked ? '？？？' : s.name}
              {selected && <span className="text-[10px] font-black">表示中</span>}
            </span>
          </button>
        );
      })}
    </div>
  </section>
);

export default SceneryPicker;
