import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity, Database, Download, Flag, ListChecks, MousePointerClick, Music, Power, RefreshCw, Timer, Users, Clock, X
} from 'lucide-react';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '../../firebase';

// ===== 型と変換 =====

type ModeFilter = 'all' | 'simple' | 'gamified';

interface LogRecord {
  id: string;
  participantKey: string;
  participantLabel: string;
  hasParticipantId: boolean;
  participantId: string;
  uid: string;
  deviceId: string;
  mode: string;
  subject: string;
  durationSeconds: number;
  startedAt: Date | null;
  endedAt: Date | null;
  memo: string;
  timerType: string;
  level: number | null;
  expGained: number | null;
  userAgent: string;
}

interface Stats {
  participants: number;
  count: number;
  totalSeconds: number;
}

interface ParticipantRow extends Stats {
  key: string;
  label: string;
  hasParticipantId: boolean;
  modes: string[];
  studyDays: number;
  first: Date | null;
  last: Date | null;
}

const TABLE_LIMIT = 200;

const toDate = (v: any): Date | null => (v?.toDate ? v.toDate() : null);

const pad = (n: number) => String(n).padStart(2, '0');
const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dateTimeText = (d: Date | null) =>
  d ? `${dateKey(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` : '';

const durationText = (sec: number) => {
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}時間${m}分`;
  if (m > 0) return `${m}分${s % 60}秒`;
  return `${s}秒`;
};

const modeLabel = (mode: string) =>
  mode === 'simple' ? 'シンプル' : mode === 'gamified' ? 'ゲーム' : mode || '-';

// 参加者IDがない記録は、ログインUIDか端末IDで仮にまとめる
const participantOf = (d: any) => {
  const participantId = typeof d.participantId === 'string' ? d.participantId : '';
  const uid = d.uid || 'anonymous';
  const deviceId = d.deviceId || '';
  const fallbackKey = uid !== 'anonymous' ? `uid:${uid}` : `device:${deviceId}`;
  const fallbackLabel = uid !== 'anonymous' ? `ID未入力（UID ${uid.slice(0, 6)}…）` : `ID未入力（端末 ${deviceId}）`;
  return {
    participantKey: participantId ? `pid:${participantId}` : fallbackKey,
    participantLabel: participantId || fallbackLabel,
    hasParticipantId: !!participantId,
    participantId,
    uid,
    deviceId
  };
};

const toRecord = (id: string, d: any): LogRecord => {
  const durationSeconds =
    typeof d.durationSeconds === 'number' ? d.durationSeconds : (d.durationMinutes ?? 0) * 60;
  return {
    id,
    ...participantOf(d),
    mode: d.mode || '',
    subject: d.subject || '',
    durationSeconds,
    startedAt: toDate(d.startedAt),
    endedAt: toDate(d.createdAt),
    memo: d.memo || '',
    timerType: d.timerType || '',
    level: typeof d.level === 'number' ? d.level : null,
    expGained: typeof d.expGained === 'number' ? d.expGained : null,
    userAgent: d.userAgent || ''
  };
};

// ===== 行動データ（researchEvents） =====

interface EventRecord {
  id: string;
  participantKey: string;
  participantLabel: string;
  hasParticipantId: boolean;
  participantId: string;
  uid: string;
  deviceId: string;
  sessionId: string;
  mode: string;
  screen: string;
  type: string;
  label: string;
  seconds: number | null;
  count: number | null;
  at: Date | null;
}

const EVENT_LABELS: Record<string, string> = {
  app_launch: '起動',
  app_resume: '再開（5分以上離れた後）',
  bgm_select: 'BGM選択',
  bgm_play: 'BGM再生',
  bgm_stop: 'BGM停止',
  tap_summary: 'タップ集計',
  quest_add: 'クエスト追加',
  quest_complete: 'クエスト達成',
  quest_uncomplete: 'クエスト達成取消',
  quest_delete: 'クエスト削除',
  timer_start: 'タイマー開始',
  timer_pause: 'タイマー一時停止',
  timer_reset: 'タイマーリセット',
  timer_finish: 'カウントダウン終了'
};
const eventLabel = (type: string) => EVENT_LABELS[type] ?? type;

const toEventRecord = (id: string, d: any): EventRecord => ({
  id,
  ...participantOf(d),
  sessionId: d.sessionId || '',
  mode: d.mode || '',
  screen: d.screen || '',
  type: d.type || '',
  label: d.label || '',
  seconds: typeof d.seconds === 'number' ? d.seconds : null,
  count: typeof d.count === 'number' ? d.count : null,
  at: toDate(d.clientAt) ?? toDate(d.createdAt)
});

interface BehaviorRow {
  key: string;
  label: string;
  hasParticipantId: boolean;
  launches: number;
  resumes: number;
  bgmPlays: number;
  bgmSeconds: number;
  taps: number;
  tapSeconds: number;
  questAdds: number;
  questCompletes: number;
  questDeletes: number;
  timerStarts: number;
  timerPauses: number;
  timerResets: number;
  studySeconds: number;
  studyCount: number;
}

const tapsPerMinute = (taps: number, seconds: number) => (seconds > 0 ? (taps / seconds) * 60 : 0);
const round1 = (v: number) => Math.round(v * 10) / 10;

const statsOf = (logs: LogRecord[]): Stats => ({
  participants: new Set(logs.map((l) => l.participantKey)).size,
  count: logs.length,
  totalSeconds: logs.reduce((sum, l) => sum + l.durationSeconds, 0)
});

const downloadCsv = (filename: string, headers: string[], rows: unknown[][]) => {
  const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const body = [headers, ...rows].map((r) => r.map(escape).join(',')).join('\r\n');
  const blob = new Blob(['\uFEFF' + body], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

// ===== 表示部品 =====

const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: string; sub?: string }> = ({
  icon,
  label,
  value,
  sub
}) => (
  <div className="bg-slate-900 rounded-2xl p-4 border border-slate-800">
    <p className="text-[10px] text-slate-400 font-bold flex items-center gap-1.5">
      {icon} {label}
    </p>
    <p className="text-xl font-black text-white mt-1">{value}</p>
    {sub && <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>}
  </div>
);

const th = 'p-3 whitespace-nowrap';
const td = 'p-3 whitespace-nowrap';

// ===== 本体 =====

export const ResearchDataPanel: React.FC = () => {
  const [logs, setLogs] = useState<LogRecord[]>([]);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [eventError, setEventError] = useState('');
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);

  const [modeFilter, setModeFilter] = useState<ModeFilter>('all');
  const [participantFilter, setParticipantFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const fetchLogs = async () => {
    setIsLoading(true);
    setError('');
    setEventError('');
    const [logResult, eventResult] = await Promise.allSettled([
      getDocs(query(collection(db, 'researchLogs'), orderBy('createdAt', 'desc'))),
      getDocs(query(collection(db, 'researchEvents'), orderBy('createdAt', 'desc')))
    ]);
    if (logResult.status === 'fulfilled') {
      setLogs(logResult.value.docs.map((doc) => toRecord(doc.id, doc.data())));
    } else {
      console.error('DB読み込みエラー:', logResult.reason);
      setError('ログを読み込めませんでした。管理者として登録されたアカウントでログインしているか確認してください。');
    }
    if (eventResult.status === 'fulfilled') {
      setEvents(eventResult.value.docs.map((doc) => toEventRecord(doc.id, doc.data())));
    } else {
      console.error('行動データ読み込みエラー:', eventResult.reason);
      setEventError('行動データ（researchEvents）を読み込めませんでした。');
    }
    setLoadedAt(new Date());
    setIsLoading(false);
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  // 参加者の選択肢（全期間・全モード）
  const participantOptions = useMemo(() => {
    const map = new Map<string, string>();
    logs.forEach((l) => map.set(l.participantKey, l.participantLabel));
    events.forEach((e) => map.set(e.participantKey, e.participantLabel));
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], 'ja'));
  }, [logs, events]);

  // 絞り込み条件（記録・行動データ共通）
  const matches = useMemo(
    () => (r: { mode: string; participantKey: string }, at: Date | null) => {
      if (modeFilter !== 'all' && r.mode !== modeFilter) return false;
      if (participantFilter !== 'all' && r.participantKey !== participantFilter) return false;
      const day = at ? dateKey(at) : '';
      if (dateFrom && (!day || day < dateFrom)) return false;
      if (dateTo && (!day || day > dateTo)) return false;
      return true;
    },
    [modeFilter, participantFilter, dateFrom, dateTo]
  );

  const filtered = useMemo(() => logs.filter((l) => matches(l, l.endedAt)), [logs, matches]);
  const filteredEvents = useMemo(() => events.filter((e) => matches(e, e.at)), [events, matches]);

  // 参加者ごとの行動データ（学習時間は researchLogs から）
  const behaviorRows = useMemo<BehaviorRow[]>(() => {
    const rows = new Map<string, BehaviorRow>();
    const rowOf = (r: { participantKey: string; participantLabel: string; hasParticipantId: boolean }) => {
      let row = rows.get(r.participantKey);
      if (!row) {
        row = {
          key: r.participantKey, label: r.participantLabel, hasParticipantId: r.hasParticipantId,
          launches: 0, resumes: 0, bgmPlays: 0, bgmSeconds: 0, taps: 0, tapSeconds: 0,
          questAdds: 0, questCompletes: 0, questDeletes: 0,
          timerStarts: 0, timerPauses: 0, timerResets: 0, studySeconds: 0, studyCount: 0
        };
        rows.set(r.participantKey, row);
      }
      return row;
    };
    filteredEvents.forEach((e) => {
      const row = rowOf(e);
      switch (e.type) {
        case 'app_launch': row.launches++; break;
        case 'app_resume': row.resumes++; break;
        case 'bgm_play': row.bgmPlays++; break;
        case 'bgm_stop': row.bgmSeconds += e.seconds ?? 0; break;
        case 'tap_summary': row.taps += e.count ?? 0; row.tapSeconds += e.seconds ?? 0; break;
        case 'quest_add': row.questAdds++; break;
        case 'quest_complete': row.questCompletes++; break;
        case 'quest_uncomplete': row.questCompletes--; break;
        case 'quest_delete': row.questDeletes++; break;
        case 'timer_start': row.timerStarts++; break;
        case 'timer_pause': row.timerPauses++; break;
        case 'timer_reset': row.timerResets++; break;
      }
    });
    filtered.forEach((l) => {
      const row = rowOf(l);
      row.studySeconds += l.durationSeconds;
      row.studyCount++;
    });
    return [...rows.values()].sort((a, b) => a.label.localeCompare(b.label, 'ja'));
  }, [filteredEvents, filtered]);

  const behaviorTotal = useMemo(
    () =>
      behaviorRows.reduce(
        (t, r) => ({
          launches: t.launches + r.launches,
          bgmPlays: t.bgmPlays + r.bgmPlays,
          bgmSeconds: t.bgmSeconds + r.bgmSeconds,
          taps: t.taps + r.taps,
          tapSeconds: t.tapSeconds + r.tapSeconds,
          questCompletes: t.questCompletes + r.questCompletes,
          questAdds: t.questAdds + r.questAdds
        }),
        { launches: 0, bgmPlays: 0, bgmSeconds: 0, taps: 0, tapSeconds: 0, questCompletes: 0, questAdds: 0 }
      ),
    [behaviorRows]
  );

  const total = useMemo(() => statsOf(filtered), [filtered]);

  const modeRows = useMemo(
    () =>
      (['simple', 'gamified'] as const).map((mode) => ({
        mode,
        ...statsOf(filtered.filter((l) => l.mode === mode))
      })),
    [filtered]
  );

  const participantRows = useMemo<ParticipantRow[]>(() => {
    const groups = new Map<string, LogRecord[]>();
    filtered.forEach((l) => {
      const list = groups.get(l.participantKey) ?? [];
      list.push(l);
      groups.set(l.participantKey, list);
    });
    return [...groups.entries()]
      .map(([key, list]) => {
        const times = list.map((l) => l.endedAt).filter((d): d is Date => !!d).map((d) => d.getTime());
        return {
          key,
          label: list[0].participantLabel,
          hasParticipantId: list[0].hasParticipantId,
          modes: [...new Set(list.map((l) => l.mode))],
          studyDays: new Set(list.map((l) => (l.endedAt ? dateKey(l.endedAt) : ''))).size,
          first: times.length ? new Date(Math.min(...times)) : null,
          last: times.length ? new Date(Math.max(...times)) : null,
          ...statsOf(list)
        };
      })
      .sort((a, b) => b.totalSeconds - a.totalSeconds);
  }, [filtered]);

  const isFiltered = modeFilter !== 'all' || participantFilter !== 'all' || !!dateFrom || !!dateTo;
  const clearFilters = () => {
    setModeFilter('all');
    setParticipantFilter('all');
    setDateFrom('');
    setDateTo('');
  };

  const today = dateKey(new Date());

  const exportLogsCsv = () => {
    if (filtered.length === 0) {
      alert('出力できるデータがありません');
      return;
    }
    downloadCsv(
      `research_logs_${today}.csv`,
      [
        'ログID', '参加者ID', 'UID', '端末ID', 'モード', '教科', '学習時間(秒)', '学習時間(分)',
        '開始日時', '終了日時', 'タイマー種別', 'レベル', '獲得EXP', 'メモ', 'ユーザーエージェント'
      ],
      filtered.map((l) => [
        l.id, l.participantId, l.uid, l.deviceId, l.mode, l.subject, l.durationSeconds,
        Math.round((l.durationSeconds / 60) * 10) / 10, dateTimeText(l.startedAt), dateTimeText(l.endedAt),
        l.timerType, l.level ?? '', l.expGained ?? '', l.memo, l.userAgent
      ])
    );
  };

  const exportParticipantsCsv = () => {
    if (participantRows.length === 0) {
      alert('出力できるデータがありません');
      return;
    }
    downloadCsv(
      `participant_summary_${today}.csv`,
      ['参加者', '参加者ID入力', 'モード', '記録数', '学習日数', '合計学習時間(分)', '1回平均(分)', '最初の記録', '最後の記録'],
      participantRows.map((r) => [
        r.label,
        r.hasParticipantId ? 'あり' : 'なし',
        r.modes.map(modeLabel).join('/'),
        r.count,
        r.studyDays,
        Math.round((r.totalSeconds / 60) * 10) / 10,
        Math.round((r.totalSeconds / 60 / r.count) * 10) / 10,
        dateTimeText(r.first),
        dateTimeText(r.last)
      ])
    );
  };

  const exportBehaviorCsv = () => {
    if (behaviorRows.length === 0) {
      alert('出力できるデータがありません');
      return;
    }
    downloadCsv(
      `behavior_summary_${today}.csv`,
      [
        '参加者', '参加者ID入力', '起動回数', '再開回数', 'BGM再生回数', 'BGM再生時間(分)',
        'タップ数', '表示時間(分)', 'タップ/分', 'クエスト追加', 'クエスト達成', 'クエスト削除',
        'タイマー開始', 'タイマー一時停止', 'タイマーリセット', '学習記録数', '合計学習時間(分)'
      ],
      behaviorRows.map((r) => [
        r.label, r.hasParticipantId ? 'あり' : 'なし', r.launches, r.resumes, r.bgmPlays,
        round1(r.bgmSeconds / 60), r.taps, round1(r.tapSeconds / 60), round1(tapsPerMinute(r.taps, r.tapSeconds)),
        r.questAdds, r.questCompletes, r.questDeletes, r.timerStarts, r.timerPauses, r.timerResets,
        r.studyCount, round1(r.studySeconds / 60)
      ])
    );
  };

  const exportEventsCsv = () => {
    if (filteredEvents.length === 0) {
      alert('出力できるデータがありません');
      return;
    }
    downloadCsv(
      `research_events_${today}.csv`,
      [
        'イベントID', '日時', '参加者ID', 'UID', '端末ID', '起動ID', 'モード', '画面',
        '種類', '種類（日本語）', '内容', '秒数', '回数'
      ],
      filteredEvents.map((e) => [
        e.id, dateTimeText(e.at), e.participantId, e.uid, e.deviceId, e.sessionId, e.mode, e.screen,
        e.type, eventLabel(e.type), e.label, e.seconds ?? '', e.count ?? ''
      ])
    );
  };

  const eventDetail = (e: EventRecord) => {
    if (e.type === 'tap_summary') {
      return `${e.count ?? 0} 回 / ${durationText(e.seconds ?? 0)}（${round1(tapsPerMinute(e.count ?? 0, e.seconds ?? 0))} 回/分）`;
    }
    if (e.type === 'app_launch') return `この端末で通算 ${e.count ?? '-'} 回目`;
    const parts = [e.label];
    if (e.seconds !== null && e.type !== 'timer_start') parts.push(durationText(e.seconds));
    if (e.count !== null && e.type.startsWith('quest')) parts.push(`目標 ${e.count} 分`);
    return parts.filter(Boolean).join(' / ') || '-';
  };

  const inputCls =
    'w-full px-3 py-2 text-xs border border-slate-700 rounded-xl bg-slate-950 text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500';

  return (
    <div className="space-y-4">
      {/* ヘッダー */}
      <div className="bg-slate-950 rounded-3xl p-5 border border-slate-800 flex flex-wrap gap-3 justify-between items-center">
        <div>
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Database size={18} className="text-purple-400" /> 研究データ（researchLogs）
          </h2>
          <p className="text-[10px] text-slate-400">
            全 {logs.length} 件を読み込み済み{loadedAt && `（${dateTimeText(loadedAt)} 時点）`}
          </p>
        </div>
        <button
          onClick={fetchLogs}
          disabled={isLoading}
          className="px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-60 text-slate-200 rounded-xl transition border border-slate-700 text-xs font-bold flex items-center gap-1.5"
        >
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          {isLoading ? '読み込み中...' : '最新の状態に更新'}
        </button>
      </div>

      {error && <p className="text-xs text-red-400 font-bold">{error}</p>}

      {/* 絞り込み */}
      <div className="bg-slate-950 rounded-3xl p-5 border border-slate-800 space-y-3">
        <div className="flex justify-between items-center">
          <h3 className="text-xs font-bold text-white">絞り込み</h3>
          {isFiltered && (
            <button onClick={clearFilters} className="text-[11px] text-purple-300 hover:text-purple-200 flex items-center gap-1">
              <X size={12} /> 条件をクリア
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <label className="space-y-1">
            <span className="text-[10px] text-slate-400 font-bold">モード</span>
            <select value={modeFilter} onChange={(e) => setModeFilter(e.target.value as ModeFilter)} className={inputCls}>
              <option value="all">すべて</option>
              <option value="simple">シンプル</option>
              <option value="gamified">ゲーム</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[10px] text-slate-400 font-bold">参加者</span>
            <select value={participantFilter} onChange={(e) => setParticipantFilter(e.target.value)} className={inputCls}>
              <option value="all">全員</option>
              {participantOptions.map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[10px] text-slate-400 font-bold">開始日</span>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={inputCls} />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] text-slate-400 font-bold">終了日</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={inputCls} />
          </label>
        </div>
      </div>

      {/* 概要 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={<Users size={12} />} label="参加者数" value={`${total.participants} 人`} />
        <StatCard icon={<ListChecks size={12} />} label="記録数" value={`${total.count} 件`} />
        <StatCard icon={<Clock size={12} />} label="合計学習時間" value={durationText(total.totalSeconds)} />
        <StatCard
          icon={<Timer size={12} />}
          label="1回あたり平均"
          value={total.count ? durationText(total.totalSeconds / total.count) : '-'}
          sub={total.participants ? `1人あたり合計 ${durationText(total.totalSeconds / total.participants)}` : undefined}
        />
      </div>

      {/* モード別比較 */}
      <div className="bg-slate-950 rounded-3xl p-5 border border-slate-800 space-y-3">
        <h3 className="text-xs font-bold text-white">モード別の比較</h3>
        <div className="overflow-x-auto border border-slate-800 rounded-2xl">
          <table className="w-full text-left text-[11px] text-slate-300">
            <thead className="bg-slate-900 text-slate-400 text-[10px] font-bold border-b border-slate-800">
              <tr>
                <th className={th}>モード</th>
                <th className={th}>参加者数</th>
                <th className={th}>記録数</th>
                <th className={th}>合計学習時間</th>
                <th className={th}>1回あたり平均</th>
                <th className={th}>1人あたり合計</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {modeRows.map((r) => (
                <tr key={r.mode}>
                  <td className={`${td} font-bold text-white`}>{modeLabel(r.mode)}</td>
                  <td className={td}>{r.participants} 人</td>
                  <td className={td}>{r.count} 件</td>
                  <td className={`${td} font-mono text-green-400`}>{durationText(r.totalSeconds)}</td>
                  <td className={`${td} font-mono`}>{r.count ? durationText(r.totalSeconds / r.count) : '-'}</td>
                  <td className={`${td} font-mono`}>{r.participants ? durationText(r.totalSeconds / r.participants) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 参加者別 */}
      <div className="bg-slate-950 rounded-3xl p-5 border border-slate-800 space-y-3">
        <div className="flex flex-wrap gap-2 justify-between items-center">
          <div>
            <h3 className="text-xs font-bold text-white">参加者別の集計</h3>
            <p className="text-[10px] text-slate-500">行を押すと、その参加者だけに絞り込みます</p>
          </div>
          <button
            onClick={exportParticipantsCsv}
            className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl text-xs transition flex items-center gap-1.5"
          >
            <Download size={14} /> 参加者別CSV
          </button>
        </div>
        <div className="overflow-x-auto border border-slate-800 rounded-2xl">
          <table className="w-full text-left text-[11px] text-slate-300">
            <thead className="bg-slate-900 text-slate-400 text-[10px] font-bold border-b border-slate-800">
              <tr>
                <th className={th}>参加者</th>
                <th className={th}>モード</th>
                <th className={th}>記録数</th>
                <th className={th}>学習日数</th>
                <th className={th}>合計学習時間</th>
                <th className={th}>1回平均</th>
                <th className={th}>最後の記録</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {participantRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-slate-500">
                    {isLoading ? '読み込み中...' : '該当するデータがありません'}
                  </td>
                </tr>
              ) : (
                participantRows.map((r) => (
                  <tr
                    key={r.key}
                    onClick={() => setParticipantFilter(r.key)}
                    className="hover:bg-slate-900/60 cursor-pointer transition"
                  >
                    <td className={`${td} font-mono font-bold ${r.hasParticipantId ? 'text-white' : 'text-amber-300'}`}>{r.label}</td>
                    <td className={td}>{r.modes.map(modeLabel).join(' / ')}</td>
                    <td className={td}>{r.count} 件</td>
                    <td className={td}>{r.studyDays} 日</td>
                    <td className={`${td} font-mono text-green-400`}>{durationText(r.totalSeconds)}</td>
                    <td className={`${td} font-mono`}>{durationText(r.totalSeconds / r.count)}</td>
                    <td className={`${td} font-mono text-slate-400`}>{dateTimeText(r.last)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 記録一覧 */}
      <div className="bg-slate-950 rounded-3xl p-5 border border-slate-800 space-y-3">
        <div className="flex flex-wrap gap-2 justify-between items-center">
          <div>
            <h3 className="text-xs font-bold text-white">記録一覧</h3>
            <p className="text-[10px] text-slate-500">
              {filtered.length > TABLE_LIMIT
                ? `新しい順に ${TABLE_LIMIT} 件を表示（CSVには絞り込み結果の全 ${filtered.length} 件が入ります）`
                : `${filtered.length} 件`}
            </p>
          </div>
          <button
            onClick={exportLogsCsv}
            className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl text-xs transition flex items-center gap-1.5"
          >
            <Download size={14} /> 記録CSV
          </button>
        </div>
        <div className="overflow-x-auto border border-slate-800 rounded-2xl">
          <table className="w-full text-left text-[11px] text-slate-300">
            <thead className="bg-slate-900 text-slate-400 text-[10px] font-bold border-b border-slate-800">
              <tr>
                <th className={th}>終了日時</th>
                <th className={th}>参加者</th>
                <th className={th}>モード</th>
                <th className={th}>教科</th>
                <th className={th}>学習時間</th>
                <th className={th}>Lv / EXP</th>
                <th className="p-3">メモ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-slate-500">
                    {isLoading ? '読み込み中...' : '該当するデータがありません'}
                  </td>
                </tr>
              ) : (
                filtered.slice(0, TABLE_LIMIT).map((l) => (
                  <tr key={l.id} className="hover:bg-slate-900/50 transition">
                    <td className={`${td} font-mono text-slate-400`}>{dateTimeText(l.endedAt) || '直近'}</td>
                    <td className={`${td} font-mono font-bold ${l.hasParticipantId ? 'text-white' : 'text-amber-300'}`}>{l.participantLabel}</td>
                    <td className={td}>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                          l.mode === 'simple' ? 'bg-blue-900/50 text-blue-300' : 'bg-purple-900/50 text-purple-300'
                        }`}
                      >
                        {modeLabel(l.mode)}
                      </span>
                    </td>
                    <td className={`${td} font-bold text-white`}>{l.subject}</td>
                    <td className={`${td} font-mono text-green-400`}>{durationText(l.durationSeconds)}</td>
                    <td className={`${td} font-mono text-slate-400`}>
                      {l.level !== null ? `Lv.${l.level} / +${l.expGained ?? 0}` : '-'}
                    </td>
                    <td className="p-3 text-slate-400 max-w-xs truncate">{l.memo || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===== 行動データ ===== */}
      <div className="bg-slate-950 rounded-3xl p-5 border border-slate-800">
        <h2 className="text-sm font-bold text-white flex items-center gap-2">
          <Activity size={18} className="text-purple-400" /> 行動データ（researchEvents）
        </h2>
        <p className="text-[10px] text-slate-400">
          全 {events.length} 件を読み込み済み。起動・BGM・画面タップ・クエスト・タイマー操作の記録です（上の絞り込みが反映されます）
        </p>
        {eventError && <p className="text-xs text-red-400 font-bold mt-2">{eventError}</p>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={<Power size={12} />} label="起動回数" value={`${behaviorTotal.launches} 回`} />
        <StatCard
          icon={<Music size={12} />}
          label="BGM再生"
          value={`${behaviorTotal.bgmPlays} 回`}
          sub={`合計 ${durationText(behaviorTotal.bgmSeconds)}`}
        />
        <StatCard
          icon={<MousePointerClick size={12} />}
          label="画面タップ"
          value={`${behaviorTotal.taps} 回`}
          sub={`平均 ${round1(tapsPerMinute(behaviorTotal.taps, behaviorTotal.tapSeconds))} 回/分`}
        />
        <StatCard
          icon={<Flag size={12} />}
          label="クエスト達成"
          value={`${behaviorTotal.questCompletes} 件`}
          sub={`追加 ${behaviorTotal.questAdds} 件`}
        />
      </div>

      {/* 参加者別の行動 */}
      <div className="bg-slate-950 rounded-3xl p-5 border border-slate-800 space-y-3">
        <div className="flex flex-wrap gap-2 justify-between items-center">
          <div>
            <h3 className="text-xs font-bold text-white">参加者別の行動</h3>
            <p className="text-[10px] text-slate-500">タップ/分 = タップ数 ÷ アプリを表示していた時間。行を押すとその参加者に絞り込みます</p>
          </div>
          <button
            onClick={exportBehaviorCsv}
            className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl text-xs transition flex items-center gap-1.5"
          >
            <Download size={14} /> 行動集計CSV
          </button>
        </div>
        <div className="overflow-x-auto border border-slate-800 rounded-2xl">
          <table className="w-full text-left text-[11px] text-slate-300">
            <thead className="bg-slate-900 text-slate-400 text-[10px] font-bold border-b border-slate-800">
              <tr>
                <th className={th}>参加者</th>
                <th className={th}>起動</th>
                <th className={th}>BGM再生</th>
                <th className={th}>タップ</th>
                <th className={th}>タップ/分</th>
                <th className={th}>クエスト 追加/達成/削除</th>
                <th className={th}>タイマー 開始/停止/リセット</th>
                <th className={th}>学習時間</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {behaviorRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-slate-500">
                    {isLoading ? '読み込み中...' : '該当するデータがありません'}
                  </td>
                </tr>
              ) : (
                behaviorRows.map((r) => (
                  <tr
                    key={r.key}
                    onClick={() => setParticipantFilter(r.key)}
                    className="hover:bg-slate-900/60 cursor-pointer transition"
                  >
                    <td className={`${td} font-mono font-bold ${r.hasParticipantId ? 'text-white' : 'text-amber-300'}`}>{r.label}</td>
                    <td className={td}>{r.launches} 回{r.resumes > 0 && <span className="text-slate-500">（再開 {r.resumes}）</span>}</td>
                    <td className={td}>{r.bgmPlays} 回 / {durationText(r.bgmSeconds)}</td>
                    <td className={td}>{r.taps} 回</td>
                    <td className={`${td} font-mono`}>{round1(tapsPerMinute(r.taps, r.tapSeconds))}</td>
                    <td className={td}>{r.questAdds} / {r.questCompletes} / {r.questDeletes}</td>
                    <td className={td}>{r.timerStarts} / {r.timerPauses} / {r.timerResets}</td>
                    <td className={`${td} font-mono text-green-400`}>{durationText(r.studySeconds)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 行動の記録一覧 */}
      <div className="bg-slate-950 rounded-3xl p-5 border border-slate-800 space-y-3">
        <div className="flex flex-wrap gap-2 justify-between items-center">
          <div>
            <h3 className="text-xs font-bold text-white">行動の記録一覧</h3>
            <p className="text-[10px] text-slate-500">
              {filteredEvents.length > TABLE_LIMIT
                ? `新しい順に ${TABLE_LIMIT} 件を表示（CSVには絞り込み結果の全 ${filteredEvents.length} 件が入ります）`
                : `${filteredEvents.length} 件`}
            </p>
          </div>
          <button
            onClick={exportEventsCsv}
            className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl text-xs transition flex items-center gap-1.5"
          >
            <Download size={14} /> 行動記録CSV
          </button>
        </div>
        <div className="overflow-x-auto border border-slate-800 rounded-2xl">
          <table className="w-full text-left text-[11px] text-slate-300">
            <thead className="bg-slate-900 text-slate-400 text-[10px] font-bold border-b border-slate-800">
              <tr>
                <th className={th}>日時</th>
                <th className={th}>参加者</th>
                <th className={th}>モード / 画面</th>
                <th className={th}>種類</th>
                <th className="p-3">内容</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredEvents.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-slate-500">
                    {isLoading ? '読み込み中...' : '該当するデータがありません'}
                  </td>
                </tr>
              ) : (
                filteredEvents.slice(0, TABLE_LIMIT).map((e) => (
                  <tr key={e.id} className="hover:bg-slate-900/50 transition">
                    <td className={`${td} font-mono text-slate-400`}>{dateTimeText(e.at) || '直近'}</td>
                    <td className={`${td} font-mono font-bold ${e.hasParticipantId ? 'text-white' : 'text-amber-300'}`}>{e.participantLabel}</td>
                    <td className={`${td} text-slate-400`}>
                      {e.mode === 'start' ? 'スタート' : modeLabel(e.mode)}
                      {e.screen && ` / ${e.screen}`}
                    </td>
                    <td className={`${td} font-bold text-white`}>{eventLabel(e.type)}</td>
                    <td className="p-3 text-slate-400 max-w-xs truncate">{eventDetail(e)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ResearchDataPanel;
