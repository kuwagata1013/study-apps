import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity, Check, Database, Download, FileSpreadsheet, Flag, FolderPlus, ListChecks, MousePointerClick, Music, Pencil, Power,
  RefreshCw, RotateCcw, Timer, Users, Clock, X
} from 'lucide-react';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { fetchAdminUids } from '../../lib/admins';
import { db } from '../../firebase';
import { DATASET_NAME_MAX, datasetLabel, fetchDatasetInfo, renameDataset, setRecordingDataset } from '../../lib/dataset';
import { downloadXlsx, type Sheet } from '../../lib/xlsx';

// ===== 型と変換 =====

type ModeFilter = 'all' | 'simple' | 'gamified';

interface LogRecord {
  id: string;
  dataset: number;
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

// データ番号のない記録（この機能より前のもの）はデータ1として扱う
const datasetOf = (d: any) => (Number.isInteger(d.dataset) && d.dataset >= 1 ? d.dataset : 1);

const toRecord = (id: string, d: any): LogRecord => {
  const durationSeconds =
    typeof d.durationSeconds === 'number' ? d.durationSeconds : (d.durationMinutes ?? 0) * 60;
  return {
    id,
    dataset: datasetOf(d),
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
  dataset: number;
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
  quest_claim: 'クエスト報酬の受け取り',
  quest_uncomplete: 'クエスト達成取消',
  quest_delete: 'クエスト削除',
  timer_start: 'タイマー開始',
  timer_pause: 'タイマー一時停止',
  timer_reset: 'タイマーリセット',
  timer_finish: 'カウントダウン終了',
  crystal_gain: 'ライフクリスタル獲得',
  crystal_use: 'ライフクリスタル使用',
  focus_bonus: '集中ボーナス'
};
const eventLabel = (type: string) => EVENT_LABELS[type] ?? type;

const toEventRecord = (id: string, d: any): EventRecord => ({
  id,
  dataset: datasetOf(d),
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
  launchDays: number; // 起動した日数
  spanDays: number; // 最初の起動日〜最後の起動日（両端を含む日数）
  launchesPerDay: number;
  topBgm: string; // いちばん長く再生したBGM
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

// BGM の名前（モードごとに曲が違う。'rain' は両方にあるので、モードと組みで見分ける）
const BGM_NAMES: Record<string, Record<string, string>> = {
  gamified: { cyber: 'サイバー', lofi: 'Lo-Fi', rain: 'ディープ雨' },
  simple: { rain: '雨の音', waves: '波の音', cafe: 'カフェ' }
};
const bgmLabel = (mode: string, id: string) => BGM_NAMES[mode]?.[id] ?? (id || '(不明)');

interface BgmRow {
  key: string;
  mode: string;
  track: string;
  name: string;
  selects: number;
  plays: number;
  seconds: number;
  participants: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
// 2つの日付のあいだの日数（両端を含む。時刻は無視）
const daysBetween = (a: Date, b: Date) =>
  Math.round(
    (new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime() -
      new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime()) /
      DAY_MS
  ) + 1;

const tapsPerMinute = (taps: number, seconds: number) => (seconds > 0 ? (taps / seconds) * 60 : 0);
const round1 = (v: number) => Math.round(v * 10) / 10;
const round2 = (v: number) => Math.round(v * 100) / 100;

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
  <div className="bg-neutral-900 rounded-2xl p-4 border border-neutral-800">
    <p className="text-[10px] text-neutral-400 font-bold flex items-center gap-1.5">
      {icon} {label}
    </p>
    <p className="text-xl font-black text-white mt-1">{value}</p>
    {sub && <p className="text-[10px] text-neutral-500 mt-0.5">{sub}</p>}
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
  // 記録期間：現在のデータ番号と、表示するデータ（'all' または番号）
  const [currentDataset, setCurrentDataset] = useState<number | null>(null);
  const [datasetFilter, setDatasetFilter] = useState<string>('');
  const [isStartingNext, setIsStartingNext] = useState(false);
  // データの名前（{ '1': '予備実験', ... }）と、名前の編集
  const [datasetNames, setDatasetNames] = useState<Record<string, string>>({});
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [isSavingName, setIsSavingName] = useState(false);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);

  const [modeFilter, setModeFilter] = useState<ModeFilter>('all');
  const [participantFilter, setParticipantFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  // 管理者（Google でログインした研究者）の記録を集計から除く（最初は除く）
  const [adminUids, setAdminUids] = useState<Set<string>>(new Set());
  const [excludeAdmins, setExcludeAdmins] = useState(true);

  const fetchLogs = async () => {
    setIsLoading(true);
    setError('');
    setEventError('');
    const [logResult, eventResult, datasetResult, adminResult] = await Promise.allSettled([
      getDocs(query(collection(db, 'researchLogs'), orderBy('createdAt', 'desc'))),
      getDocs(query(collection(db, 'researchEvents'), orderBy('createdAt', 'desc'))),
      fetchDatasetInfo(),
      fetchAdminUids()
    ]);
    if (adminResult.status === 'fulfilled') setAdminUids(new Set(adminResult.value));
    else console.error('管理者一覧の読み込みエラー:', adminResult.reason);
    if (datasetResult.status === 'fulfilled') {
      const { current, names } = datasetResult.value;
      setCurrentDataset(current);
      setDatasetNames(names);
      // 最初は現在のデータを表示する
      setDatasetFilter((prev) => prev || String(current));
    }
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
  const isAdminRecord = useMemo(() => (r: { uid: string }) => excludeAdmins && adminUids.has(r.uid), [excludeAdmins, adminUids]);
  const participantOptions = useMemo(() => {
    const map = new Map<string, string>();
    logs.forEach((l) => !isAdminRecord(l) && map.set(l.participantKey, l.participantLabel));
    events.forEach((e) => !isAdminRecord(e) && map.set(e.participantKey, e.participantLabel));
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], 'ja'));
  }, [logs, events, isAdminRecord]);

  // 管理者の記録の件数（除いた件数として表示する）
  const adminCounts = useMemo(
    () => ({ logs: logs.filter((l) => adminUids.has(l.uid)).length, events: events.filter((e) => adminUids.has(e.uid)).length }),
    [logs, events, adminUids]
  );

  // 絞り込み条件（記録・行動データ共通）
  const matches = useMemo(
    () => (r: { uid: string; mode: string; participantKey: string; dataset: number }, at: Date | null) => {
      if (isAdminRecord(r)) return false;
      if (datasetFilter && datasetFilter !== 'all' && String(r.dataset) !== datasetFilter) return false;
      if (modeFilter !== 'all' && r.mode !== modeFilter) return false;
      if (participantFilter !== 'all' && r.participantKey !== participantFilter) return false;
      const day = at ? dateKey(at) : '';
      if (dateFrom && (!day || day < dateFrom)) return false;
      if (dateTo && (!day || day > dateTo)) return false;
      return true;
    },
    [datasetFilter, modeFilter, participantFilter, dateFrom, dateTo, isAdminRecord]
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
          launches: 0, launchDays: 0, spanDays: 0, launchesPerDay: 0, topBgm: '', resumes: 0, bgmPlays: 0, bgmSeconds: 0, taps: 0, tapSeconds: 0,
          questAdds: 0, questCompletes: 0, questDeletes: 0,
          timerStarts: 0, timerPauses: 0, timerResets: 0, studySeconds: 0, studyCount: 0
        };
        rows.set(r.participantKey, row);
      }
      return row;
    };
    // 起動した日・最初と最後の起動・BGMごとの再生時間（参加者ごと）
    const launchDays = new Map<string, Set<string>>();
    const launchRange = new Map<string, { first: Date; last: Date }>();
    const bgmSeconds = new Map<string, Map<string, number>>();
    filteredEvents.forEach((e) => {
      const row = rowOf(e);
      if (e.type === 'app_launch' && e.at) {
        if (!launchDays.has(e.participantKey)) launchDays.set(e.participantKey, new Set());
        launchDays.get(e.participantKey)!.add(dateKey(e.at));
        const r = launchRange.get(e.participantKey);
        if (!r) launchRange.set(e.participantKey, { first: e.at, last: e.at });
        else {
          if (e.at < r.first) r.first = e.at;
          if (e.at > r.last) r.last = e.at;
        }
      }
      if (e.type === 'bgm_stop' && e.label) {
        if (!bgmSeconds.has(e.participantKey)) bgmSeconds.set(e.participantKey, new Map());
        const m = bgmSeconds.get(e.participantKey)!;
        const name = bgmLabel(e.mode, e.label);
        m.set(name, (m.get(name) ?? 0) + (e.seconds ?? 0));
      }
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
    rows.forEach((row) => {
      row.launchDays = launchDays.get(row.key)?.size ?? 0;
      const r = launchRange.get(row.key);
      row.spanDays = r ? daysBetween(r.first, r.last) : 0;
      row.launchesPerDay = row.spanDays > 0 ? row.launches / row.spanDays : 0;
      const top = [...(bgmSeconds.get(row.key) ?? new Map<string, number>())].sort((a, b) => b[1] - a[1])[0];
      row.topBgm = top && top[1] > 0 ? top[0] : '';
    });
    return [...rows.values()].sort((a, b) => a.label.localeCompare(b.label, 'ja'));
  }, [filteredEvents, filtered]);

  // 参加者の平均（起動/日）。起動の記録がある参加者だけで平均する
  const avgLaunchesPerDay = useMemo(() => {
    const list = behaviorRows.filter((r) => r.spanDays > 0);
    return list.length ? list.reduce((t, r) => t + r.launchesPerDay, 0) / list.length : 0;
  }, [behaviorRows]);

  // BGM ごとの利用状況
  const bgmRows = useMemo<BgmRow[]>(() => {
    const rows = new Map<string, BgmRow & { people: Set<string> }>();
    filteredEvents.forEach((e) => {
      if (!['bgm_select', 'bgm_play', 'bgm_stop'].includes(e.type) || !e.label) return;
      const key = `${e.mode}:${e.label}`;
      let row = rows.get(key);
      if (!row) {
        row = { key, mode: e.mode, track: e.label, name: bgmLabel(e.mode, e.label), selects: 0, plays: 0, seconds: 0, participants: 0, people: new Set() };
        rows.set(key, row);
      }
      if (e.type === 'bgm_select') row.selects++;
      if (e.type === 'bgm_play') {
        row.plays++;
        row.people.add(e.participantKey);
      }
      if (e.type === 'bgm_stop') row.seconds += e.seconds ?? 0;
    });
    return [...rows.values()]
      .map(({ people, ...r }) => ({ ...r, participants: people.size }))
      .sort((a, b) => b.seconds - a.seconds || b.plays - a.plays);
  }, [filteredEvents]);
  const bgmTotalSeconds = bgmRows.reduce((t, r) => t + r.seconds, 0);

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

  // 選べるデータ番号（1 〜 現在の番号、記録にある最大の番号）
  const datasetOptions = useMemo(() => {
    const max = Math.max(currentDataset ?? 1, ...logs.map((l) => l.dataset), ...events.map((e) => e.dataset));
    return Array.from({ length: max }, (_, i) => i + 1);
  }, [currentDataset, logs, events]);

  const labelOf = (n: number) => datasetLabel(n, datasetNames);
  const datasetText = datasetFilter === 'all' || !datasetFilter ? '全データ' : labelOf(Number(datasetFilter));
  const filePrefix = datasetFilter === 'all' || !datasetFilter ? 'all' : `data${datasetFilter}`;

  const handleStartNext = async () => {
    if (currentDataset === null) {
      alert('現在のデータ番号を読み込めていません。「最新の状態に更新」を押してからもう一度お試しください。');
      return;
    }
    // 前のデータに戻しているときも、次は今までで一番大きい番号の次から
    const next = (datasetOptions[datasetOptions.length - 1] ?? currentDataset) + 1;
    const ok = confirm(
      `${labelOf(next)} の記録を開始しますか？

` +
        `・これ以降の学習ログと行動データは「${labelOf(next)}」として保存されます
` +
        `・${labelOf(currentDataset)} までの記録は消えず、この画面で切り替えて見られます
` +
        `・参加者が次にアプリを開くと、端末のレベル・EXP・クエスト・学習履歴が初期化されます（参加者IDは残ります。今の進み具合は端末にしまわれ、あとで「このデータの記録に戻す」と戻ります）`
    );
    if (!ok) return;
    setIsStartingNext(true);
    try {
      await setRecordingDataset(next);
      setCurrentDataset(next);
      setDatasetFilter(String(next));
      alert(`${labelOf(next)} を開始しました。名前は「名前を変更」から付けられます。`);
    } catch (e) {
      console.error('データ切り替えエラー:', e);
      alert('切り替えに失敗しました。管理者アカウントでログインしているか確認してください。');
    } finally {
      setIsStartingNext(false);
    }
  };

  // 表示中のデータの名前を変える
  const selectedDataset = datasetFilter && datasetFilter !== 'all' ? Number(datasetFilter) : null;

  // 前のデータ（または後のデータ）の記録に戻す
  const [isSwitching, setIsSwitching] = useState(false);
  const handleSwitchTo = async (n: number) => {
    if (currentDataset === null || n === currentDataset) return;
    const ok = confirm(
      `記録するデータを「${labelOf(currentDataset)}」から「${labelOf(n)}」に切り替えますか？

` +
        `・これ以降の学習ログと行動データは「${labelOf(n)}」として保存されます（${labelOf(currentDataset)} の記録は消えません）
` +
        `・参加者が次にアプリを開くと、端末の進み具合が ${labelOf(n)} のときのものに戻ります
` +
        `  （${labelOf(currentDataset)} の進み具合は端末にしまわれます。${labelOf(n)} の進み具合が残っていない端末は最初からになります）
` +
        `・あとでまた「${labelOf(currentDataset)}」に戻すこともできます`
    );
    if (!ok) return;
    setIsSwitching(true);
    try {
      await setRecordingDataset(n);
      setCurrentDataset(n);
      alert(`記録するデータを「${labelOf(n)}」に切り替えました。`);
    } catch (e) {
      console.error('データ切り替えエラー:', e);
      alert('切り替えに失敗しました。管理者アカウントでログインしているか確認してください。');
    } finally {
      setIsSwitching(false);
    }
  };
  const handleSaveName = async () => {
    if (selectedDataset === null || nameDraft === null || currentDataset === null) return;
    const clean = nameDraft.trim().slice(0, DATASET_NAME_MAX);
    setIsSavingName(true);
    try {
      await renameDataset(selectedDataset, clean, currentDataset);
      setDatasetNames((prev) => {
        const next = { ...prev };
        if (clean) next[String(selectedDataset)] = clean;
        else delete next[String(selectedDataset)];
        return next;
      });
      setNameDraft(null);
    } catch (e) {
      console.error('名前の変更エラー:', e);
      alert('名前を変更できませんでした。管理者アカウントでログインしているか確認してください。');
    } finally {
      setIsSavingName(false);
    }
  };

  const isFiltered = modeFilter !== 'all' || participantFilter !== 'all' || !!dateFrom || !!dateTo;
  const clearFilters = () => {
    setModeFilter('all');
    setParticipantFilter('all');
    setDateFrom('');
    setDateTo('');
  };

  const today = dateKey(new Date());

  // 出力する表（CSV と Excel で共通）
  const logsTable = (): Sheet => ({
    name: '学習記録',
    headers: [
      'データ', 'データ名', 'ログID', '参加者ID', 'UID', '端末ID', 'モード', '教科', '学習時間(秒)', '学習時間(分)',
      '開始日時', '終了日時', 'タイマー種別', 'レベル', '獲得EXP', 'メモ', 'ユーザーエージェント'
    ],
    rows: filtered.map((l) => [
      l.dataset, labelOf(l.dataset), l.id, l.participantId, l.uid, l.deviceId, l.mode, l.subject, l.durationSeconds,
      Math.round((l.durationSeconds / 60) * 10) / 10, dateTimeText(l.startedAt), dateTimeText(l.endedAt),
      l.timerType, l.level ?? '', l.expGained ?? '', l.memo, l.userAgent
    ])
  });

  const participantsTable = (): Sheet => ({
    name: '参加者別',
    headers: ['参加者', '参加者ID入力', 'モード', '記録数', '学習日数', '合計学習時間(分)', '1回平均(分)', '最初の記録', '最後の記録'],
    rows: participantRows.map((r) => [
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
  });

  const behaviorTable = (): Sheet => ({
    name: '行動集計',
    headers: [
      '参加者', '参加者ID入力', '起動回数', '起動した日数', '期間(日)', '起動/日', '再開回数', 'BGM再生回数', 'BGM再生時間(分)', 'よく使ったBGM',
      'タップ数', '表示時間(分)', 'タップ/分', 'クエスト追加', 'クエスト達成', 'クエスト削除',
      'タイマー開始', 'タイマー一時停止', 'タイマーリセット', '学習記録数', '合計学習時間(分)'
    ],
    rows: behaviorRows.map((r) => [
      r.label, r.hasParticipantId ? 'あり' : 'なし', r.launches, r.launchDays, r.spanDays, round2(r.launchesPerDay), r.resumes, r.bgmPlays,
      round1(r.bgmSeconds / 60), r.topBgm, r.taps, round1(r.tapSeconds / 60), round1(tapsPerMinute(r.taps, r.tapSeconds)),
      r.questAdds, r.questCompletes, r.questDeletes, r.timerStarts, r.timerPauses, r.timerResets,
      r.studyCount, round1(r.studySeconds / 60)
    ])
  });

  const bgmTable = (): Sheet => ({
    name: 'BGM別',
    headers: ['モード', '曲ID', '曲名', '選択回数', '再生回数', '再生時間(分)', '再生時間の割合(%)', '再生した人数'],
    rows: bgmRows.map((r) => [
      modeLabel(r.mode), r.track, r.name, r.selects, r.plays, round1(r.seconds / 60),
      bgmTotalSeconds > 0 ? round1((r.seconds / bgmTotalSeconds) * 100) : 0, r.participants
    ])
  });

  const eventsTable = (): Sheet => ({
    name: '行動記録',
    headers: [
      'データ', 'データ名', 'イベントID', '日時', '参加者ID', 'UID', '端末ID', '起動ID', 'モード', '画面',
      '種類', '種類（日本語）', '内容', '秒数', '回数'
    ],
    rows: filteredEvents.map((e) => [
      e.dataset, labelOf(e.dataset), e.id, dateTimeText(e.at), e.participantId, e.uid, e.deviceId, e.sessionId, e.mode, e.screen,
      e.type, eventLabel(e.type), e.label, e.seconds ?? '', e.count ?? ''
    ])
  });

  const exportCsv = (file: string, table: Sheet) => {
    if (table.rows.length === 0) {
      alert('出力できるデータがありません');
      return;
    }
    downloadCsv(file, table.headers, table.rows);
  };
  const exportLogsCsv = () => exportCsv(`research_logs_${filePrefix}_${today}.csv`, logsTable());
  const exportParticipantsCsv = () => exportCsv(`participant_summary_${filePrefix}_${today}.csv`, participantsTable());
  const exportBehaviorCsv = () => exportCsv(`behavior_summary_${filePrefix}_${today}.csv`, behaviorTable());
  const exportBgmCsv = () => exportCsv(`bgm_summary_${filePrefix}_${today}.csv`, bgmTable());
  const exportEventsCsv = () => exportCsv(`research_events_${filePrefix}_${today}.csv`, eventsTable());

  // 4つの表をシートに分けて、1つの Excel ファイルにまとめる
  const exportXlsx = () => {
    if (filtered.length === 0 && filteredEvents.length === 0) {
      alert('出力できるデータがありません');
      return;
    }
    const about: Sheet = {
      name: '説明',
      headers: ['項目', '内容'],
      rows: [
        ['対象データ', datasetText],
        ['モード', modeFilter === 'all' ? 'すべて' : modeLabel(modeFilter)],
        ['参加者', participantFilter === 'all' ? '全員' : participantFilter],
        ['期間', dateFrom || dateTo ? `${dateFrom || '最初'} 〜 ${dateTo || '最後'}` : 'すべて'],
        ['管理者アカウントの記録', excludeAdmins ? `除いた（管理者 ${adminUids.size} 人）` : '含む'],
        ['出力日時', dateTimeText(new Date())],
        ['学習記録', `${filtered.length} 件`],
        ['行動記録', `${filteredEvents.length} 件`]
      ]
    };
    downloadXlsx(`research_${filePrefix}_${today}.xlsx`, [about, participantsTable(), behaviorTable(), bgmTable(), logsTable(), eventsTable()]);
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
    'w-full px-3 py-2 text-xs border border-neutral-700 rounded-xl bg-black text-neutral-100 focus:outline-none focus:ring-2 focus:ring-sky-500';

  return (
    <div className="space-y-4">
      {/* ヘッダー */}
      <div className="bg-black rounded-3xl p-5 border border-neutral-800 flex flex-wrap gap-3 justify-between items-center">
        <div>
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Database size={18} className="text-sky-400" /> 研究データ（researchLogs）
          </h2>
          <p className="text-[10px] text-neutral-400">
            全 {logs.length} 件を読み込み済み{loadedAt && `（${dateTimeText(loadedAt)} 時点）`}
          </p>
        </div>
        <button
          onClick={fetchLogs}
          disabled={isLoading}
          className="px-3 py-2 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-60 text-neutral-200 rounded-xl transition border border-neutral-700 text-xs font-bold flex items-center gap-1.5"
        >
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          {isLoading ? '読み込み中...' : '最新の状態に更新'}
        </button>
      </div>

      {error && <p className="text-xs text-red-400 font-bold">{error}</p>}

      {/* 記録期間（データ1・データ2 …） */}
      <div className="bg-black rounded-3xl p-5 border border-sky-900/60 space-y-3">
        <div className="flex flex-wrap gap-3 justify-between items-start">
          <div>
            <h3 className="text-xs font-bold text-white flex items-center gap-2">
              <FolderPlus size={16} className="text-sky-400" /> 記録期間
            </h3>
            <p className="text-[11px] text-neutral-300 mt-1">
              いま記録中：
              <span className="font-black text-sky-300 text-sm ml-1">
                {currentDataset === null ? '確認中…' : labelOf(currentDataset)}
              </span>
            </p>
            <p className="text-[10px] text-neutral-500 mt-1 leading-relaxed">
              次のデータを開始すると、以降の記録は新しい番号で保存され、参加者の端末の進み具合（レベル・EXP・クエスト・学習履歴）は次に開いたときに初期化されます。前のデータは消えません。下でデータを選ぶと、そのデータの記録に戻すこともできます。
            </p>
          </div>
          <button
            onClick={handleStartNext}
            disabled={isStartingNext || currentDataset === null}
            className="px-3 py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white rounded-xl transition text-xs font-bold flex items-center gap-1.5 whitespace-nowrap"
          >
            <FolderPlus size={14} />
            {isStartingNext
              ? '切り替え中...'
              : currentDataset === null
                ? '次のデータを開始'
                : `データ${(datasetOptions[datasetOptions.length - 1] ?? currentDataset) + 1} を開始`}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {datasetOptions.map((n) => (
            <button
              key={n}
              onClick={() => setDatasetFilter(String(n))}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                datasetFilter === String(n)
                  ? 'bg-sky-600 text-white border-sky-400'
                  : 'bg-neutral-900 text-neutral-300 border-neutral-700 hover:bg-neutral-800'
              }`}
            >
              {labelOf(n)}
              {n === currentDataset && <span className="ml-1 text-[9px] opacity-80">記録中</span>}
            </button>
          ))}
          <button
            onClick={() => setDatasetFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
              datasetFilter === 'all'
                ? 'bg-sky-600 text-white border-sky-400'
                : 'bg-neutral-900 text-neutral-300 border-neutral-700 hover:bg-neutral-800'
            }`}
          >
            すべて
          </button>
        </div>
        {/* 記録中でないデータを選んでいるときは、そのデータの記録に戻せる */}
        {selectedDataset !== null && currentDataset !== null && selectedDataset !== currentDataset && (
          <button
            onClick={() => void handleSwitchTo(selectedDataset)}
            disabled={isSwitching}
            className="w-full sm:w-auto px-3 py-2 rounded-xl border border-amber-500/60 bg-amber-500/10 hover:bg-amber-500/20 text-amber-200 text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <RotateCcw size={14} />
            {isSwitching ? '切り替え中...' : `「${labelOf(selectedDataset)}」の記録に戻す（いま記録中：${labelOf(currentDataset)}）`}
          </button>
        )}
        {/* 名前の変更（データを1つ選んでいるとき） */}
        {selectedDataset !== null && (
          nameDraft === null ? (
            <button
              onClick={() => setNameDraft(datasetNames[String(selectedDataset)] ?? '')}
              className="text-[11px] text-sky-300 hover:text-sky-200 flex items-center gap-1"
            >
              <Pencil size={12} /> 「{labelOf(selectedDataset)}」の名前を変更
            </button>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSaveName();
              }}
              className="flex flex-wrap items-center gap-2"
            >
              <span className="text-[11px] text-neutral-400">データ{selectedDataset} の名前</span>
              <input
                autoFocus
                value={nameDraft}
                maxLength={DATASET_NAME_MAX}
                onChange={(e) => setNameDraft(e.target.value)}
                placeholder={`例: 予備実験、本実験1週目（空にすると「データ${selectedDataset}」）`}
                className="flex-1 min-w-[12rem] px-3 py-1.5 bg-neutral-900 border border-neutral-700 rounded-xl text-xs text-white focus:outline-none focus:border-sky-500"
              />
              <button
                type="submit"
                disabled={isSavingName}
                className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1"
              >
                <Check size={12} /> {isSavingName ? '保存中...' : '保存'}
              </button>
              <button
                type="button"
                onClick={() => setNameDraft(null)}
                className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-xl text-xs font-bold"
              >
                やめる
              </button>
            </form>
          )
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[10px] text-neutral-500">下の集計・一覧・CSV・Excel はすべて「{datasetText}」の内容です</p>
          <button
            onClick={exportXlsx}
            className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition text-xs font-bold flex items-center gap-1.5"
          >
            <FileSpreadsheet size={14} /> まとめてExcel（全シート）
          </button>
        </div>
      </div>

      {/* 絞り込み */}
      <div className="bg-black rounded-3xl p-5 border border-neutral-800 space-y-3">
        <div className="flex justify-between items-center">
          <h3 className="text-xs font-bold text-white">絞り込み</h3>
          {isFiltered && (
            <button onClick={clearFilters} className="text-[11px] text-sky-300 hover:text-sky-200 flex items-center gap-1">
              <X size={12} /> 条件をクリア
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <label className="space-y-1">
            <span className="text-[10px] text-neutral-400 font-bold">モード</span>
            <select value={modeFilter} onChange={(e) => setModeFilter(e.target.value as ModeFilter)} className={inputCls}>
              <option value="all">すべて</option>
              <option value="simple">シンプル</option>
              <option value="gamified">ゲーム</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[10px] text-neutral-400 font-bold">参加者</span>
            <select value={participantFilter} onChange={(e) => setParticipantFilter(e.target.value)} className={inputCls}>
              <option value="all">全員</option>
              {participantOptions.map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[10px] text-neutral-400 font-bold">開始日</span>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={inputCls} />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] text-neutral-400 font-bold">終了日</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={inputCls} />
          </label>
        </div>
        <label className="flex items-start gap-2 p-3 rounded-2xl bg-purple-950/40 border border-purple-900/60 cursor-pointer">
          <input
            type="checkbox"
            checked={excludeAdmins}
            onChange={(e) => setExcludeAdmins(e.target.checked)}
            className="mt-0.5 accent-purple-500"
          />
          <span className="text-[11px] text-neutral-200 leading-relaxed">
            <span className="font-bold">管理者アカウントの記録を除く</span>
            <span className="block text-neutral-400">
              管理者 {adminUids.size} 人・学習記録 {adminCounts.logs} 件・行動データ {adminCounts.events} 件
              {excludeAdmins ? 'を集計と CSV から除いています' : 'も含めて集計しています'}
              （ログインせずに試した記録は、管理者のものか区別できないので除けません）
            </span>
          </span>
        </label>
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
      <div className="bg-black rounded-3xl p-5 border border-neutral-800 space-y-3">
        <h3 className="text-xs font-bold text-white">モード別の比較</h3>
        <div className="overflow-x-auto border border-neutral-800 rounded-2xl">
          <table className="w-full text-left text-[11px] text-neutral-300">
            <thead className="bg-neutral-900 text-neutral-400 text-[10px] font-bold border-b border-neutral-800">
              <tr>
                <th className={th}>モード</th>
                <th className={th}>参加者数</th>
                <th className={th}>記録数</th>
                <th className={th}>合計学習時間</th>
                <th className={th}>1回あたり平均</th>
                <th className={th}>1人あたり合計</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
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
      <div className="bg-black rounded-3xl p-5 border border-neutral-800 space-y-3">
        <div className="flex flex-wrap gap-2 justify-between items-center">
          <div>
            <h3 className="text-xs font-bold text-white">参加者別の集計</h3>
            <p className="text-[10px] text-neutral-500">行を押すと、その参加者だけに絞り込みます</p>
          </div>
          <button
            onClick={exportParticipantsCsv}
            className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl text-xs transition flex items-center gap-1.5"
          >
            <Download size={14} /> 参加者別CSV
          </button>
        </div>
        <div className="overflow-x-auto border border-neutral-800 rounded-2xl">
          <table className="w-full text-left text-[11px] text-neutral-300">
            <thead className="bg-neutral-900 text-neutral-400 text-[10px] font-bold border-b border-neutral-800">
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
            <tbody className="divide-y divide-neutral-800">
              {participantRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-neutral-500">
                    {isLoading ? '読み込み中...' : '該当するデータがありません'}
                  </td>
                </tr>
              ) : (
                participantRows.map((r) => (
                  <tr
                    key={r.key}
                    onClick={() => setParticipantFilter(r.key)}
                    className="hover:bg-neutral-900/60 cursor-pointer transition"
                  >
                    <td className={`${td} font-mono font-bold ${r.hasParticipantId ? 'text-white' : 'text-amber-300'}`}>{r.label}</td>
                    <td className={td}>{r.modes.map(modeLabel).join(' / ')}</td>
                    <td className={td}>{r.count} 件</td>
                    <td className={td}>{r.studyDays} 日</td>
                    <td className={`${td} font-mono text-green-400`}>{durationText(r.totalSeconds)}</td>
                    <td className={`${td} font-mono`}>{durationText(r.totalSeconds / r.count)}</td>
                    <td className={`${td} font-mono text-neutral-400`}>{dateTimeText(r.last)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 記録一覧 */}
      <div className="bg-black rounded-3xl p-5 border border-neutral-800 space-y-3">
        <div className="flex flex-wrap gap-2 justify-between items-center">
          <div>
            <h3 className="text-xs font-bold text-white">記録一覧</h3>
            <p className="text-[10px] text-neutral-500">
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
        <div className="overflow-x-auto border border-neutral-800 rounded-2xl">
          <table className="w-full text-left text-[11px] text-neutral-300">
            <thead className="bg-neutral-900 text-neutral-400 text-[10px] font-bold border-b border-neutral-800">
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
            <tbody className="divide-y divide-neutral-800">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-neutral-500">
                    {isLoading ? '読み込み中...' : '該当するデータがありません'}
                  </td>
                </tr>
              ) : (
                filtered.slice(0, TABLE_LIMIT).map((l) => (
                  <tr key={l.id} className="hover:bg-neutral-900/50 transition">
                    <td className={`${td} font-mono text-neutral-400`}>{dateTimeText(l.endedAt) || '直近'}</td>
                    <td className={`${td} font-mono font-bold ${l.hasParticipantId ? 'text-white' : 'text-amber-300'}`}>{l.participantLabel}</td>
                    <td className={td}>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                          l.mode === 'simple' ? 'bg-blue-900/50 text-blue-300' : 'bg-sky-900/50 text-sky-300'
                        }`}
                      >
                        {modeLabel(l.mode)}
                      </span>
                    </td>
                    <td className={`${td} font-bold text-white`}>{l.subject}</td>
                    <td className={`${td} font-mono text-green-400`}>{durationText(l.durationSeconds)}</td>
                    <td className={`${td} font-mono text-neutral-400`}>
                      {l.level !== null ? `Lv.${l.level} / +${l.expGained ?? 0}` : '-'}
                    </td>
                    <td className="p-3 text-neutral-400 max-w-xs truncate">{l.memo || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===== 行動データ ===== */}
      <div className="bg-black rounded-3xl p-5 border border-neutral-800">
        <h2 className="text-sm font-bold text-white flex items-center gap-2">
          <Activity size={18} className="text-sky-400" /> 行動データ（researchEvents）
        </h2>
        <p className="text-[10px] text-neutral-400">
          全 {events.length} 件を読み込み済み。起動・BGM・画面タップ・クエスト・タイマー操作の記録です（上の絞り込みが反映されます）
        </p>
        {eventError && <p className="text-xs text-red-400 font-bold mt-2">{eventError}</p>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={<Power size={12} />}
          label="起動頻度"
          value={`${round1(avgLaunchesPerDay)} 回/日`}
          sub={`参加者平均・起動 合計 ${behaviorTotal.launches} 回`}
        />
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

      {/* BGM の利用状況 */}
      <div className="bg-black rounded-3xl p-5 border border-neutral-800 space-y-3">
        <div className="flex flex-wrap gap-2 justify-between items-center">
          <div>
            <h3 className="text-xs font-bold text-white">BGMの利用状況</h3>
            <p className="text-[10px] text-neutral-500">再生時間の長い順。割合 = その曲の再生時間 ÷ すべての曲の再生時間</p>
          </div>
          <button
            onClick={exportBgmCsv}
            className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl text-xs transition flex items-center gap-1.5"
          >
            <Download size={14} /> BGM集計CSV
          </button>
        </div>
        <div className="overflow-x-auto border border-neutral-800 rounded-2xl">
          <table className="w-full text-left text-[11px] text-neutral-300">
            <thead className="bg-neutral-900 text-neutral-400 text-[10px] font-bold border-b border-neutral-800">
              <tr>
                <th className={th}>モード</th>
                <th className={th}>曲</th>
                <th className={th}>選択</th>
                <th className={th}>再生</th>
                <th className={th}>再生時間</th>
                <th className={`${th} w-1/3`}>割合</th>
                <th className={th}>再生した人数</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {bgmRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-neutral-500">
                    {isLoading ? '読み込み中...' : 'BGMの記録がありません'}
                  </td>
                </tr>
              ) : (
                bgmRows.map((r) => {
                  const pct = bgmTotalSeconds > 0 ? (r.seconds / bgmTotalSeconds) * 100 : 0;
                  return (
                    <tr key={r.key}>
                      <td className={td}>{modeLabel(r.mode)}</td>
                      <td className={`${td} font-bold text-white`}>{r.name}</td>
                      <td className={td}>{r.selects} 回</td>
                      <td className={td}>{r.plays} 回</td>
                      <td className={`${td} font-mono`}>{durationText(r.seconds)}</td>
                      <td className={td}>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-neutral-800 rounded-full overflow-hidden min-w-16">
                            <div className="h-full bg-sky-500 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="font-mono w-12 text-right">{round1(pct)}%</span>
                        </div>
                      </td>
                      <td className={td}>{r.participants} 人</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 参加者別の行動 */}
      <div className="bg-black rounded-3xl p-5 border border-neutral-800 space-y-3">
        <div className="flex flex-wrap gap-2 justify-between items-center">
          <div>
            <h3 className="text-xs font-bold text-white">参加者別の行動</h3>
            <p className="text-[10px] text-neutral-500">起動/日 = 起動回数 ÷ 最初に起動した日から最後に起動した日までの日数。タップ/分 = タップ数 ÷ アプリを表示していた時間。行を押すとその参加者に絞り込みます</p>
          </div>
          <button
            onClick={exportBehaviorCsv}
            className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl text-xs transition flex items-center gap-1.5"
          >
            <Download size={14} /> 行動集計CSV
          </button>
        </div>
        <div className="overflow-x-auto border border-neutral-800 rounded-2xl">
          <table className="w-full text-left text-[11px] text-neutral-300">
            <thead className="bg-neutral-900 text-neutral-400 text-[10px] font-bold border-b border-neutral-800">
              <tr>
                <th className={th}>参加者</th>
                <th className={th}>起動</th>
                <th className={th}>起動/日</th>
                <th className={th}>BGM再生</th>
                <th className={th}>よく使ったBGM</th>
                <th className={th}>タップ</th>
                <th className={th}>タップ/分</th>
                <th className={th}>クエスト 追加/達成/削除</th>
                <th className={th}>タイマー 開始/停止/リセット</th>
                <th className={th}>学習時間</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {behaviorRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-6 text-center text-neutral-500">
                    {isLoading ? '読み込み中...' : '該当するデータがありません'}
                  </td>
                </tr>
              ) : (
                behaviorRows.map((r) => (
                  <tr
                    key={r.key}
                    onClick={() => setParticipantFilter(r.key)}
                    className="hover:bg-neutral-900/60 cursor-pointer transition"
                  >
                    <td className={`${td} font-mono font-bold ${r.hasParticipantId ? 'text-white' : 'text-amber-300'}`}>{r.label}</td>
                    <td className={td}>{r.launches} 回{r.resumes > 0 && <span className="text-neutral-500">（再開 {r.resumes}）</span>}</td>
                    <td className={td}>
                      <span className="font-mono font-bold text-white">{round2(r.launchesPerDay)}</span>
                      {r.spanDays > 0 && <span className="text-neutral-500">（{r.launchDays}日起動 / {r.spanDays}日間）</span>}
                    </td>
                    <td className={td}>{r.bgmPlays} 回 / {durationText(r.bgmSeconds)}</td>
                    <td className={td}>{r.topBgm || <span className="text-neutral-600">-</span>}</td>
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
      <div className="bg-black rounded-3xl p-5 border border-neutral-800 space-y-3">
        <div className="flex flex-wrap gap-2 justify-between items-center">
          <div>
            <h3 className="text-xs font-bold text-white">行動の記録一覧</h3>
            <p className="text-[10px] text-neutral-500">
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
        <div className="overflow-x-auto border border-neutral-800 rounded-2xl">
          <table className="w-full text-left text-[11px] text-neutral-300">
            <thead className="bg-neutral-900 text-neutral-400 text-[10px] font-bold border-b border-neutral-800">
              <tr>
                <th className={th}>日時</th>
                <th className={th}>参加者</th>
                <th className={th}>モード / 画面</th>
                <th className={th}>種類</th>
                <th className="p-3">内容</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {filteredEvents.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-neutral-500">
                    {isLoading ? '読み込み中...' : '該当するデータがありません'}
                  </td>
                </tr>
              ) : (
                filteredEvents.slice(0, TABLE_LIMIT).map((e) => (
                  <tr key={e.id} className="hover:bg-neutral-900/50 transition">
                    <td className={`${td} font-mono text-neutral-400`}>{dateTimeText(e.at) || '直近'}</td>
                    <td className={`${td} font-mono font-bold ${e.hasParticipantId ? 'text-white' : 'text-amber-300'}`}>{e.participantLabel}</td>
                    <td className={`${td} text-neutral-400`}>
                      {e.mode === 'start' ? 'スタート' : modeLabel(e.mode)}
                      {e.screen && ` / ${e.screen}`}
                    </td>
                    <td className={`${td} font-bold text-white`}>{eventLabel(e.type)}</td>
                    <td className="p-3 text-neutral-400 max-w-xs truncate">{eventDetail(e)}</td>
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
