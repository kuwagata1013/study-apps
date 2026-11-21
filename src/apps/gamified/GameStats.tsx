// ゲーム版「戦績」タブ：自分の学習データを見やすくまとめる
import React, { useMemo, useState } from 'react';
import { BarChart2, Calendar, Clock, Flame, Heart, ListChecks, Trophy, Zap, BookOpen } from 'lucide-react';
import { WEEKDAYS, dayKey, formatMinutes, levelTitle, logTime, pad, studyStreak, type StatsLog, type StatsTask } from './gameStatsUtils';

interface GameStatsProps {
  level: number;
  exp: number;
  maxExp: number;
  lifeTokens: number;
  logs: StatsLog[];
  tasks: StatsTask[];
}

const SUBJECT_COLORS: Record<string, string> = {
  国語: 'bg-rose-500',
  数学: 'bg-sky-500',
  英語: 'bg-purple-500',
  理科: 'bg-emerald-500',
  社会: 'bg-amber-500'
};
const subjectColor = (s: string) => SUBJECT_COLORS[s] ?? 'bg-slate-400';

const Tile: React.FC<{ icon: React.ReactNode; label: string; value: string; sub?: string; accent: string }> = ({
  icon,
  label,
  value,
  sub,
  accent
}) => (
  <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800">
    <p className="text-[10px] text-slate-400 font-bold flex items-center gap-1.5">
      {icon} {label}
    </p>
    <p className={`text-xl md:text-2xl font-black mt-1 ${accent}`}>{value}</p>
    {sub && <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>}
  </div>
);

const HISTORY_STEP = 7;

export const GameStats: React.FC<GameStatsProps> = ({ level, exp, maxExp, lifeTokens, logs, tasks }) => {
  const [historyDays, setHistoryDays] = useState(HISTORY_STEP);

  const stats = useMemo(() => {
    const now = new Date();
    const today = dayKey(now);
    // 今週 = 直近 7 日（今日を含む）
    const weekStart = new Date(now);
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - 6);

    let todayMin = 0;
    let weekMin = 0;
    let totalMin = 0;
    let totalExp = 0;
    const byDay = new Map<string, StatsLog[]>();
    const bySubject = new Map<string, number>();

    logs.forEach((l) => {
      const t = logTime(l);
      const key = dayKey(t);
      totalMin += l.durationMinutes;
      totalExp += l.expGained;
      if (key === today) todayMin += l.durationMinutes;
      if (t >= weekStart) weekMin += l.durationMinutes;
      byDay.set(key, [...(byDay.get(key) ?? []), l]);
      bySubject.set(l.subject, (bySubject.get(l.subject) ?? 0) + l.durationMinutes);
    });

    const last7 = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() - (6 - i));
      const key = dayKey(d);
      return {
        key,
        label: i === 6 ? '今日' : WEEKDAYS[d.getDay()],
        date: `${d.getMonth() + 1}/${d.getDate()}`,
        minutes: (byDay.get(key) ?? []).reduce((s, l) => s + l.durationMinutes, 0)
      };
    });

    const subjects = [...bySubject.entries()]
      .map(([subject, minutes]) => ({ subject, minutes, ratio: totalMin ? minutes / totalMin : 0 }))
      .sort((a, b) => b.minutes - a.minutes);

    const history = [...byDay.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([key, list]) => {
        const d = logTime(list[0]);
        return {
          key,
          title: key === today ? '今日' : `${d.getMonth() + 1}月${d.getDate()}日（${WEEKDAYS[d.getDay()]}）`,
          minutes: list.reduce((s, l) => s + l.durationMinutes, 0),
          exp: list.reduce((s, l) => s + l.expGained, 0),
          logs: [...list].sort((a, b) => logTime(b).getTime() - logTime(a).getTime())
        };
      });

    return {
      todayMin,
      weekMin,
      totalMin,
      totalExp,
      studyDays: byDay.size,
      last7,
      subjects,
      history,
      streak: studyStreak(logs)
    };
  }, [logs]);

  const completedQuests = tasks.filter((t) => t.completed).length;
  const maxDay = Math.max(30, ...stats.last7.map((d) => d.minutes));
  const expRatio = Math.min(100, (exp / maxExp) * 100);

  return (
    <div className="space-y-4">
      {/* レベルと称号 */}
      <div className="bg-gradient-to-br from-purple-950 via-slate-900 to-slate-950 rounded-3xl p-6 shadow-xl border border-purple-500/30">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 shrink-0 rounded-2xl bg-gradient-to-br from-purple-600 to-pink-600 flex flex-col items-center justify-center shadow-lg shadow-purple-600/40">
            <span className="text-[9px] font-bold text-purple-100 leading-none">Lv.</span>
            <span className="text-2xl font-black text-white leading-none">{level}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-purple-300 font-bold flex items-center gap-1">
              <Trophy size={12} className="text-yellow-300" /> 称号
            </p>
            <p className="text-lg font-black text-white">{levelTitle(level)}</p>
            <div className="mt-2 h-2.5 w-full bg-slate-800 rounded-full overflow-hidden border border-slate-700">
              <div
                className="h-full bg-gradient-to-r from-purple-500 via-pink-500 to-yellow-400 rounded-full"
                style={{ width: `${expRatio}%` }}
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              {exp} / {maxExp} EXP ・ 次のレベルまであと <span className="text-yellow-300 font-bold">{maxExp - exp} EXP</span>
            </p>
          </div>
        </div>
      </div>

      {/* 主な数字 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile icon={<Clock size={12} />} label="今日の学習" value={formatMinutes(stats.todayMin)} accent="text-emerald-400" />
        <Tile icon={<Calendar size={12} />} label="直近7日" value={formatMinutes(stats.weekMin)} accent="text-sky-400" />
        <Tile
          icon={<Flame size={12} />}
          label="連続学習"
          value={`${stats.streak} 日`}
          sub={stats.streak > 0 ? '途切れないように続けよう' : '今日から始めよう'}
          accent="text-orange-400"
        />
        <Tile
          icon={<BarChart2 size={12} />}
          label="累計学習"
          value={formatMinutes(stats.totalMin)}
          sub={`${logs.length} 回・${stats.studyDays} 日`}
          accent="text-purple-300"
        />
        <Tile icon={<Zap size={12} />} label="学習で得たEXP" value={`${stats.totalExp}`} accent="text-yellow-300" />
        <Tile
          icon={<ListChecks size={12} />}
          label="クエスト達成"
          value={`${completedQuests} / ${tasks.length}`}
          accent="text-pink-300"
        />
        <Tile icon={<Heart size={12} />} label="救済アイテム" value={`× ${lifeTokens}`} accent="text-red-400" />
        <Tile
          icon={<BookOpen size={12} />}
          label="1回あたり"
          value={logs.length ? formatMinutes(stats.totalMin / logs.length) : '-'}
          accent="text-slate-200"
        />
      </div>

      {/* 直近7日のグラフ */}
      <div className="bg-slate-900/90 rounded-3xl p-6 shadow-xl border border-purple-500/20 space-y-4">
        <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
          <BarChart2 size={16} className="text-purple-400" /> 直近7日の学習時間
        </h3>
        <div className="grid grid-cols-7 gap-2 items-end h-40">
          {stats.last7.map((d) => {
            const isToday = d.label === '今日';
            const h = d.minutes ? Math.max(6, (d.minutes / maxDay) * 100) : 0;
            return (
              <div key={d.key} className="flex flex-col items-center justify-end h-full gap-1">
                {/* 幅が狭いので「分」だけで表示（例: 80分） */}
                <span className={`text-[10px] font-bold whitespace-nowrap ${d.minutes ? 'text-slate-200' : 'text-slate-600'}`}>
                  {d.minutes ? `${Math.round(d.minutes)}分` : '-'}
                </span>
                <div className="w-full flex-1 flex items-end">
                  <div
                    className={`w-full rounded-t-lg ${
                      isToday ? 'bg-gradient-to-t from-pink-600 to-yellow-400' : 'bg-gradient-to-t from-purple-700 to-purple-400'
                    }`}
                    style={{ height: `${h}%` }}
                  />
                </div>
                <span className={`text-[10px] font-bold ${isToday ? 'text-yellow-300' : 'text-slate-400'}`}>{d.label}</span>
                <span className="text-[9px] text-slate-600">{d.date}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 教科別 */}
      <div className="bg-slate-900/90 rounded-3xl p-6 shadow-xl border border-purple-500/20 space-y-3">
        <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
          <BookOpen size={16} className="text-purple-400" /> 教科別の学習時間
        </h3>
        {stats.subjects.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-4">まだ記録がありません</p>
        ) : (
          <div className="space-y-3">
            {stats.subjects.map((s) => (
              <div key={s.subject} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="font-bold text-slate-200 flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${subjectColor(s.subject)}`} />
                    {s.subject}
                  </span>
                  <span className="text-slate-400">
                    <span className="font-bold text-slate-200">{formatMinutes(s.minutes)}</span>（{Math.round(s.ratio * 100)}%）
                  </span>
                </div>
                <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${subjectColor(s.subject)}`} style={{ width: `${Math.max(2, s.ratio * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 日ごとの履歴 */}
      <div className="bg-slate-900/90 rounded-3xl p-6 shadow-xl border border-purple-500/20 space-y-3">
        <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
          <Calendar size={16} className="text-purple-400" /> 冒険の記録
        </h3>
        {stats.history.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-4">
            まだ記録がありません。「冒険」タブで学習を始めて、成果を記録しよう！
          </p>
        ) : (
          <div className="space-y-4">
            {stats.history.slice(0, historyDays).map((day) => (
              <div key={day.key} className="space-y-2">
                <div className="flex justify-between items-baseline border-b border-slate-800 pb-1">
                  <span className="text-xs font-black text-slate-200">{day.title}</span>
                  <span className="text-[10px] text-slate-400">
                    合計 <span className="font-bold text-emerald-400">{formatMinutes(day.minutes)}</span>
                    <span className="text-yellow-400 font-bold ml-2">+{day.exp} EXP</span>
                  </span>
                </div>
                {day.logs.map((log) => {
                  const t = logTime(log);
                  return (
                    <div key={log.id} className="flex items-center gap-3 p-3 bg-slate-950 rounded-xl border border-slate-800">
                      <span className={`w-1.5 self-stretch rounded-full ${subjectColor(log.subject)}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-bold text-slate-100">{log.subject}</span>
                          <span className="text-[10px] text-slate-500">
                            {pad(t.getHours())}:{pad(t.getMinutes())}
                          </span>
                        </div>
                        {log.memo && <p className="text-[11px] text-slate-400 mt-0.5 truncate">{log.memo}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-black text-slate-100">{formatMinutes(log.durationMinutes)}</p>
                        <p className="text-[10px] text-yellow-400 font-bold">+{log.expGained} EXP</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
            {stats.history.length > historyDays && (
              <button
                onClick={() => setHistoryDays((n) => n + HISTORY_STEP)}
                className="w-full py-2.5 bg-slate-950 hover:bg-slate-800 text-slate-300 rounded-xl text-xs font-bold border border-slate-800 transition"
              >
                もっと見る（残り {stats.history.length - historyDays} 日分）
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default GameStats;
