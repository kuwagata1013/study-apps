// フレンド・グループで使う、勉強時間のランキング（今日／今週の切り替え、1人ずつ開くと今週の日ごとのグラフ）
import React, { useState } from 'react';
import { ChevronDown, Crown, Flame } from 'lucide-react';
import type { PlayerProfile } from '../../lib/players';
import { dayKey, formatMinutes, studyNow, thisWeekDays, WEEK_LABELS } from './gameStatsUtils';

export type Period = 'today' | 'week';
const ZERO_WEEK = [0, 0, 0, 0, 0, 0, 0];

// 今日・今週の勉強時間（相手の記録が今日・今週のものでなければ 0）
export const todayMinutesOf = (p: PlayerProfile) => (p.todayKey === dayKey(studyNow()) ? p.todayMinutes : 0);
export const weekDaysOf = (p: PlayerProfile) => (p.weekKey === thisWeekDays([]).weekKey ? p.weekDays : ZERO_WEEK);
export const weekMinutesOf = (p: PlayerProfile) => weekDaysOf(p).reduce((a, b) => a + b, 0);
export const minutesOf = (p: PlayerProfile, period: Period) => (period === 'today' ? todayMinutesOf(p) : weekMinutesOf(p));

// 長い順（同じなら名前順）
export const sortByMinutes = (list: PlayerProfile[], period: Period) =>
  [...list].sort((a, b) => minutesOf(b, period) - minutesOf(a, period) || a.name.localeCompare(b.name, 'ja'));

// 今日／今週の切り替え
export const PeriodSwitch: React.FC<{ value: Period; onChange: (p: Period) => void }> = ({ value, onChange }) => (
  <div className="shrink-0 flex gap-0.5 p-0.5 rounded-lg bg-[#312117] border border-[#fdd69f]/20" role="group" aria-label="集計する期間">
    {(
      [
        ['today', '今日'],
        ['week', '今週']
      ] as const
    ).map(([id, label]) => (
      <button
        key={id}
        type="button"
        onClick={() => onChange(id)}
        aria-pressed={value === id}
        className={`px-2.5 py-1 rounded-md whitespace-nowrap text-[11px] font-bold transition ${value === id ? 'bg-[#fdd69f] text-[#312117]' : 'text-[#fdd69f]/70 hover:text-[#fdd69f]'}`}
      >
        {label}
      </button>
    ))}
  </div>
);

// 月〜日の棒グラフ（今日の棒を明るくする）
export const WeekBars: React.FC<{ days: number[]; height?: number; showValues?: boolean }> = ({ days, height = 56, showValues }) => {
  const max = Math.max(30, ...days);
  const today = thisWeekDays([]).todayIndex;
  return (
    <div className="grid grid-cols-7 gap-1.5 items-end" style={{ height: height + 30 }}>
      {days.map((m, i) => (
        <div key={i} className="flex flex-col items-center justify-end h-full gap-1 min-w-0">
          {showValues && <span className="text-[9px] text-white/60 leading-none truncate">{m > 0 ? formatMinutes(m) : ''}</span>}
          <div
            className={`w-full max-w-[22px] rounded-t-md ${i === today ? 'bg-[#fdd69f]' : i < today ? 'bg-[#b98a5a]' : 'bg-white/10'}`}
            style={{ height: Math.max(3, Math.round((m / max) * height)) }}
            title={`${WEEK_LABELS[i]} ${formatMinutes(m)}`}
          />
          <span className={`text-[10px] font-bold leading-none ${i === today ? 'text-[#fdd69f]' : 'text-white/50'}`}>{WEEK_LABELS[i]}</span>
        </div>
      ))}
    </div>
  );
};

const RANK_STYLE = ['bg-[#facc15] text-[#312117]', 'bg-[#d9dde3] text-[#312117]', 'bg-[#d08a4e] text-[#312117]'];

// ランキングの一覧。行を押すと、今週のグラフと actions（外す・など）が開く
export const RankingList: React.FC<{
  players: PlayerProfile[];
  period: Period;
  myUid: string;
  ownerUid?: string;
  actions?: (p: PlayerProfile) => React.ReactNode;
}> = ({ players, period, myUid, ownerUid, actions }) => {
  const [openUid, setOpenUid] = useState<string | null>(null);
  const sorted = sortByMinutes(players, period);
  const top = Math.max(1, ...sorted.map((p) => minutesOf(p, period)));
  return (
    <ol className="space-y-1.5">
      {sorted.map((p, i) => {
        const min = minutesOf(p, period);
        const me = p.uid === myUid;
        const open = openUid === p.uid;
        const extra = actions?.(p);
        return (
          <li key={p.uid} className={`rounded-xl border ${me ? 'bg-[#fdd69f]/10 border-[#fdd69f]/50' : 'bg-[#4a3424]/30 border-[#fdd69f]/15'}`}>
            <button
              type="button"
              onClick={() => setOpenUid(open ? null : p.uid)}
              aria-expanded={open}
              className="w-full flex items-center gap-2.5 p-2.5 text-left"
            >
              <span
                className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-[11px] font-black ${
                  min > 0 && i < 3 ? RANK_STYLE[i] : 'text-[#fdd69f]/80'
                }`}
              >
                {i + 1}
              </span>
              <span className="flex-1 min-w-0 space-y-1">
                <span className="flex items-center gap-1 text-xs font-bold text-white">
                  <span className="truncate">{p.name}</span>
                  {p.uid === ownerUid && <Crown size={12} className="shrink-0 text-[#fdd69f]" aria-label="リーダー" />}
                  {me && <span className="shrink-0 px-1.5 rounded bg-[#fdd69f] text-[#312117] text-[9px] leading-4">あなた</span>}
                </span>
                <span className="block h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <span className="block h-full rounded-full bg-gradient-to-r from-[#b98a5a] to-[#fdd69f]" style={{ width: `${(min / top) * 100}%` }} />
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className={`block text-xs font-black tabular-nums ${min > 0 ? 'text-white' : 'text-white/35'}`}>{formatMinutes(min)}</span>
                <span className="flex items-center justify-end gap-0.5 text-[10px] font-bold text-[#fdd69f]/80">
                  <Flame size={10} /> {p.streakDays}日
                </span>
              </span>
              <ChevronDown size={14} className={`shrink-0 text-[#fdd69f]/60 transition ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
              <div className="px-3 pb-3 space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[#fdd69f]/90 font-bold truncate">
                    Lv.{p.level} {p.title}
                  </span>
                  <span className="shrink-0 text-white/60">
                    今日 {formatMinutes(todayMinutesOf(p))}・今週 {formatMinutes(weekMinutesOf(p))}
                  </span>
                </div>
                <WeekBars days={weekDaysOf(p)} height={40} />
                {extra && <div className="flex justify-end gap-2 pt-1">{extra}</div>}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
};
