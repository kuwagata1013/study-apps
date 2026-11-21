// クエストボードの下に出すカレンダー（学習した日・クエストをクリアした日・クリスタルで守った日）
import React, { useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Gem } from 'lucide-react';
import { dayKey, formatMinutes, logTime, pad, WEEKDAYS, type StatsLog } from './gameStatsUtils';

export interface CalendarTask {
  id: string;
  title: string;
  completed: boolean;
  completedDateKey?: string;
}

interface Props {
  logs: StatsLog[];
  tasks: CalendarTask[];
  protectedDays: string[];
}

// 学習時間に応じたマスの濃さ
const heatClass = (min: number) =>
  min >= 120 ? 'bg-[#fdd69f]/70' : min >= 60 ? 'bg-[#fdd69f]/45' : min >= 30 ? 'bg-[#fdd69f]/28' : min > 0 ? 'bg-[#fdd69f]/15' : '';

export const QuestCalendar: React.FC<Props> = ({ logs, tasks, protectedDays }) => {
  const today = dayKey(new Date());
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selected, setSelected] = useState(today);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // 日ごとの学習時間（分）と記録
  const byDay = useMemo(() => {
    const map = new Map<string, StatsLog[]>();
    for (const l of logs) {
      const k = dayKey(logTime(l));
      map.set(k, [...(map.get(k) ?? []), l]);
    }
    return map;
  }, [logs]);
  const minutesOn = (k: string) => (byDay.get(k) ?? []).reduce((s, l) => s + l.durationMinutes, 0);
  const clearedOn = (k: string) => tasks.filter((t) => t.completed && t.completedDateKey === k);
  const protectedSet = useMemo(() => new Set(protectedDays), [protectedDays]);

  // 選んだ日の内訳
  const selectedLogs = byDay.get(selected) ?? [];
  const bySubject = new Map<string, number>();
  for (const l of selectedLogs) bySubject.set(l.subject, (bySubject.get(l.subject) ?? 0) + l.durationMinutes);
  const selectedCleared = clearedOn(selected);
  const [, sm, sd] = selected.split('-').map(Number);

  // 今月の合計
  const monthPrefix = `${year}-${pad(month + 1)}-`;
  let monthMinutes = 0;
  let monthDays = 0;
  for (const [k] of byDay) {
    if (!k.startsWith(monthPrefix)) continue;
    const m = minutesOn(k);
    monthMinutes += m;
    if (m > 0) monthDays++;
  }

  return (
    <div className="bg-[#312117]/90 rounded-3xl p-5 md:p-6 shadow-xl border border-[#fdd69f]/20 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-bold text-white flex items-center gap-2 whitespace-nowrap">
          <CalendarDays size={18} className="text-[#fdd69f]" /> 冒険カレンダー
        </h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCursor(new Date(year, month - 1, 1))}
            className="p-1.5 rounded-lg text-[#fdd69f] hover:bg-[#fdd69f]/10"
            aria-label="前の月"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-bold text-white w-24 text-center">
            {year}年{month + 1}月
          </span>
          <button
            onClick={() => setCursor(new Date(year, month + 1, 1))}
            className="p-1.5 rounded-lg text-[#fdd69f] hover:bg-[#fdd69f]/10"
            aria-label="次の月"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <p className="text-[11px] text-white/65">
        この月：{monthDays}日 学習・合計 {formatMinutes(monthMinutes)}
      </p>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px]">
        {WEEKDAYS.map((d, i) => (
          <div key={d} className={`font-bold py-1 ${i === 0 ? 'text-red-300' : i === 6 ? 'text-sky-300' : 'text-white/50'}`}>
            {d}
          </div>
        ))}
        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`e${i}`} />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const k = `${monthPrefix}${pad(i + 1)}`;
          const min = minutesOn(k);
          const cleared = clearedOn(k).length > 0;
          const isProtected = protectedSet.has(k) && min === 0;
          const isSel = k === selected;
          const isToday = k === today;
          return (
            <button
              key={k}
              onClick={() => setSelected(k)}
              className={`h-11 rounded-xl flex flex-col items-center justify-center gap-0.5 transition border ${heatClass(min)} ${
                isSel ? 'border-[#fdd69f] ring-1 ring-[#fdd69f]' : isToday ? 'border-[#fdd69f]/50' : 'border-transparent hover:border-[#fdd69f]/30'
              }`}
            >
              <span className={`font-bold leading-none ${min > 0 ? 'text-white' : 'text-white/55'}`}>{i + 1}</span>
              <span className="flex gap-0.5 h-2.5 items-center">
                {cleared && <CheckCircle2 size={9} className="text-emerald-300" />}
                {isProtected && <Gem size={9} className="text-sky-300" />}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-white/60">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-[#fdd69f]/45" /> 学習した日（濃いほど長い）</span>
        <span className="flex items-center gap-1"><CheckCircle2 size={10} className="text-emerald-300" /> クエストクリア</span>
        <span className="flex items-center gap-1"><Gem size={10} className="text-sky-300" /> クリスタルで守った日</span>
      </div>

      {/* 選んだ日の記録 */}
      <div className="p-4 bg-[#1f140d] rounded-2xl border border-[#fdd69f]/15 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-white">{sm}月{sd}日の記録</span>
          <span className="text-xs font-bold text-[#fdd69f]">{formatMinutes(minutesOn(selected))}</span>
        </div>
        {bySubject.size === 0 && selectedCleared.length === 0 ? (
          <p className="text-xs text-white/45">
            {protectedSet.has(selected) ? 'ライフクリスタルで連続記録を守った日です' : 'この日の冒険の記録はありません'}
          </p>
        ) : (
          <>
            {bySubject.size > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {[...bySubject].map(([sub, m]) => (
                  <span key={sub} className="text-[11px] text-white bg-[#4a3424]/70 border border-[#fdd69f]/25 px-2 py-0.5 rounded-lg">
                    {sub} {formatMinutes(m)}
                  </span>
                ))}
              </div>
            )}
            {selectedCleared.length > 0 && (
              <ul className="space-y-1">
                {selectedCleared.map((t) => (
                  <li key={t.id} className="text-xs text-emerald-200 flex items-center gap-1.5">
                    <CheckCircle2 size={13} className="text-emerald-300 shrink-0" /> {t.title}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default QuestCalendar;
