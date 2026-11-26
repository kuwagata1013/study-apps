import React, { useState, useEffect, useRef } from 'react';
import { 
  Clock, 
  BarChart2, 
  Play, 
  Pause, 
  RotateCcw, 
  Volume2, 
  VolumeX, 
  Calendar as CalendarIcon,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Timer,
  Settings,
  Music,
  LogOut,
  RefreshCw,
  CloudRain,
  Waves,
  Coffee
} from 'lucide-react';
import { auth } from '../../firebase';
import { saveResearchLog } from '../../lib/researchLog';
import { trackEvent } from '../../lib/researchEvents';
import { useScreenTracking } from '../../lib/useResearchTracking';
import { useBgm } from '../../lib/useBgm';
import Equalizer from '../../components/Equalizer';
import TimerFinishDialog from '../../components/TimerFinishDialog';
import ContactForm from '../../components/ContactForm';
import AlarmSettings from '../../components/AlarmSettings';
import { startTicker } from '../../lib/ticker';
import { studyDayKey, studyNow } from '../../lib/studyDay';
import { fireAlarm, prepareAlarm, useKeepAwake } from '../../lib/timerAlarm';
import { signOut } from 'firebase/auth';
import { showAlert } from '../../lib/dialog';

// 以前の版で最初から入っていた見本タスク（保存データからも取り除く）

interface SimpleAppProps {
  user?: any;
  onSelectMode?: (mode: 'simple' | 'gamified') => void;
  onResetMode?: () => void; // モード切替（スタート画面へ戻る）用コールバック
}

interface StudyLog {
  id: string;
  subject: string;
  durationSeconds: number;
  durationMinutes?: number;
  createdAt: string;
  dateKey: string;
  memo: string;
}


// シンプル版の BGM（研究条件として、この3曲のまま）
type SimpleBgm = 'rain' | 'waves' | 'cafe';
const SIMPLE_BGM: { id: SimpleBgm; name: string; desc: string; icon: React.ReactNode }[] = [
  { id: 'rain', name: '雨の音', desc: 'しとしと降る雨で気持ちを落ち着ける', icon: <CloudRain size={18} /> },
  { id: 'waves', name: '波の音', desc: '寄せては返す波でリラックス', icon: <Waves size={18} /> },
  { id: 'cafe', name: 'カフェ', desc: 'ほどよいざわめきで集中', icon: <Coffee size={18} /> }
];

// 記録が属する学習日（午前4時で日付が変わる）。保存した時刻（ID）から求める。
// 以前の記録の dateKey は世界標準時の日付だったので、時刻がわかるときはそちらを使う
const logDayKey = (l: { id: string; dateKey?: string; createdAt: string }) => {
  const t = Number(l.id);
  if (Number.isFinite(t) && t > 1e12) return studyDayKey(t);
  const parsed = new Date(l.createdAt.replace(/\//g, '-'));
  return Number.isNaN(parsed.getTime()) ? l.dateKey ?? '' : studyDayKey(parsed);
};

export const SimpleApp: React.FC<SimpleAppProps> = ({ 
  user, 
  onResetMode 
}) => {
  // 1. タブ管理 (timer | calendar | stats | bgm | profile)
  const [activeTab, setActiveTab] = useState<'timer' | 'calendar' | 'stats' | 'bgm' | 'profile'>('timer');

  // 2. タイマー関連ステート
  const [timerMode, setTimerMode] = useState<'countup' | 'countdown'>('countup');
  const [targetMinutes, setTargetMinutes] = useState(25);
  const [timerFinished, setTimerFinished] = useState(false); // 減算が終わったときのポップアップ
  const [seconds, setSeconds] = useState(0);
  const [elapsedSecondsCount, setElapsedSecondsCount] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [subject, setSubject] = useState(''); // 教科は毎回自分で選ぶ（選ぶまで開始できない）
  const [memo, setMemo] = useState('');

  // 3. データステート
  const [logs, setLogs] = useState<StudyLog[]>([]);

  // 4. BGM関連ステート
  const {
    isPlaying: isPlayingBgm,
    track: bgmType,
    toggle: toggleBgm,
    playTrack: playBgmTrack,
    volume: bgmVolume,
    setVolume: setBgmVolume
  } = useBgm<SimpleBgm>(
    'rain',
    { rain: 'rain', waves: 'waves', cafe: 'cafe' }
  );

  // 行動データ：表示中のタブと BGM の再生状態
  useScreenTracking(activeTab);

  // 5. カレンダー・統計操作ステート
  const [statsPeriod, setStatsPeriod] = useState<'day' | 'week' | 'month'>('week');
  const [currentCalendarDate, setCurrentCalendarDate] = useState(studyNow);
  const [selectedCalendarDateStr, setSelectedCalendarDateStr] = useState<string>(
    () => studyDayKey()
  );

  // 7. 管理者認証モーダルステート

  // モード切替時（タイマー計測中でない場合のみ初期化）
  const handleSwitchTimerMode = (newMode: 'countup' | 'countdown') => {
    if (isActive) {
      showAlert('計測中はモードを変更できません。一度一時停止してください。');
      return;
    }

    setTimerMode(newMode);

    if (elapsedSecondsCount === 0 && seconds === 0) {
      if (newMode === 'countdown') {
        setSeconds(targetMinutes * 60);
      } else {
        setSeconds(0);
      }
    }
  };

  // 減算モードの目標分数指定
  const handleChangeTargetMinutes = (mins: number) => {
    setTargetMinutes(mins);
    if (!isActive && elapsedSecondsCount === 0) {
      setSeconds(mins * 60);
    }
  };

  // 計測セッションの開始時刻（最初に開始を押した時刻。保存・リセットで解除）
  const sessionStartRef = useRef<number | null>(null);
  useEffect(() => {
    if (isActive && sessionStartRef.current === null) {
      sessionStartRef.current = Date.now();
    }
  }, [isActive]);

  // タイマーカウント処理
  // 実時間との差分で進めるため、タブが裏に回って処理が間引かれても時間がずれない
  const secondsRef = useRef(seconds);
  useEffect(() => {
    secondsRef.current = seconds;
  }, [seconds]);

  useEffect(() => {
    if (!isActive) return;
    let lastTick = Date.now();
    let done = false;
    const stop = startTicker(() => {
      if (done) return;
      const delta = Math.floor((Date.now() - lastTick) / 1000);
      if (delta <= 0) return;
      lastTick += delta * 1000;

      if (timerMode === 'countup') {
        setSeconds((sec) => sec + delta);
        setElapsedSecondsCount((sec) => sec + delta);
      } else {
        const remaining = secondsRef.current;
        const step = Math.min(delta, remaining);
        const next = remaining - step;
        secondsRef.current = next;
        setSeconds(next);
        setElapsedSecondsCount((sec) => sec + step);
        if (next <= 0) {
          done = true;
          stop();
          fireAlarm(subject, targetMinutes);
          trackEvent('timer_finish', { label: subject, count: targetMinutes });
          setIsActive(false);
          setTimerFinished(true);
        }
      }
    });
    return stop;
  }, [isActive, timerMode]);

  useKeepAwake(isActive && timerMode === 'countdown');

  // LocalStorage からデータ読み込み
  useEffect(() => {
    const logKey = 'simple_study_logs';

    const savedLogs = localStorage.getItem(logKey);
    if (savedLogs) {
      try { setLogs(JSON.parse(savedLogs)); } catch (e) {}
    }
  }, []);

  // ログアウト処理
  const handleLogout = async () => {
    try {
      await signOut(auth);
      showAlert('ログアウトしました');
    } catch (error) {
      console.error('ログアウトエラー:', error);
    }
  };

  // スタート画面に戻る（モード再選択）
  const handleResetModeCall = () => {
    if (onResetMode) {
      onResetMode();
    } else {
      localStorage.removeItem('study_app_preferred_mode');
      window.location.reload();
    }
  };

  // ログ保存
  const handleSaveLog = async () => {
    const recordSeconds = elapsedSecondsCount > 0 ? elapsedSecondsCount : (timerMode === 'countup' ? seconds : (targetMinutes * 60 - seconds));
    // 1分未満は記録しない（ゲーム版と同じ条件）
    if (recordSeconds < 60) {
      showAlert('1分以上学習すると記録できます。もう少し続けてみましょう！');
      return;
    }

    // 教科は6つから選ぶだけ（「その他」も入力はしない。ゲーム版と同じ条件）
    const finalSubject = subject;
    const now = new Date();
    const dateKey = studyDayKey(now); // 午前4時で日付が変わる
    
    const newLog: StudyLog = {
      id: Date.now().toString(),
      subject: finalSubject,
      durationSeconds: recordSeconds,
      durationMinutes: Math.round(recordSeconds / 60),
      createdAt: now.toLocaleString('ja-JP'),
      dateKey: dateKey,
      memo
    };

    const logKey = 'simple_study_logs';
    const updatedLogs = [newLog, ...logs];
    setLogs(updatedLogs);
    localStorage.setItem(logKey, JSON.stringify(updatedLogs));

    await saveResearchLog({
      mode: 'simple',
      uid: user?.uid,
      subject: finalSubject,
      durationSeconds: recordSeconds,
      startedAtMs: sessionStartRef.current,
      memo,
      timerType: timerMode
    });
    sessionStartRef.current = null;

    setIsActive(false);
    setSeconds(timerMode === 'countdown' ? targetMinutes * 60 : 0);
    setElapsedSecondsCount(0);
    setMemo('');
    setSubject('');
    showAlert(`学習ログを保存しました（${formatTimeDetail(recordSeconds)}）`);
  };

  // フォーマット関数
  const formatTime = (totalSeconds: number) => {
    const validSecs = isNaN(totalSeconds) || totalSeconds < 0 ? 0 : totalSeconds;
    const mins = Math.floor(validSecs / 60);
    const secs = validSecs % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatTimeDetail = (totalSeconds: number) => {
    const validSeconds = isNaN(totalSeconds) || !totalSeconds ? 0 : totalSeconds;
    const hours = Math.floor(validSeconds / 3600);
    const mins = Math.floor((validSeconds % 3600) / 60);
    const secs = validSeconds % 60;
    
    if (hours > 0) return `${hours}時間${mins}分${secs}秒`;
    return `${mins}分${secs}秒`;
  };

  const totalSecondsAll = logs.reduce((acc, log) => {
    const secs = log.durationSeconds ?? ((log.durationMinutes || 0) * 60);
    return acc + (isNaN(secs) ? 0 : secs);
  }, 0);

  // カレンダー計算
  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const year = currentCalendarDate.getFullYear();
  const month = currentCalendarDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  const prevMonth = () => setCurrentCalendarDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentCalendarDate(new Date(year, month + 1, 1));

  // 選択日のログおよび合計時間計算
  const logsOnSelectedDate = logs.filter(l => logDayKey(l) === selectedCalendarDateStr);
  const totalSecondsOnSelectedDate = logsOnSelectedDate.reduce((acc, log) => {
    const secs = log.durationSeconds ?? ((log.durationMinutes || 0) * 60);
    return acc + (isNaN(secs) ? 0 : secs);
  }, 0);


  return (
    <div className="min-h-screen bg-gray-100 text-gray-800 pb-24 antialiased">
      
      <main className="max-w-md md:max-w-5xl mx-auto p-4 md:px-6 space-y-6 pt-4">

        {/* ===== TAB 1: タイマー ===== */}
        {activeTab === 'timer' && (
          <div className="space-y-6 md:max-w-2xl md:mx-auto">
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 text-center space-y-4">
              
              {/* 加算 vs 減算 切替 */}
              <div className="flex justify-center pt-2">
                <div className="bg-gray-100 p-1 rounded-2xl flex gap-1 border border-gray-200">
                  <button
                    onClick={() => handleSwitchTimerMode('countup')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 ${
                      timerMode === 'countup' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                    }`}
                  >
                    <Clock size={14} /> 加算
                  </button>
                  <button
                    onClick={() => handleSwitchTimerMode('countdown')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 ${
                      timerMode === 'countdown' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                    }`}
                  >
                    <Timer size={14} /> 減算
                  </button>
                </div>
              </div>

              {/* 減算時 目標時間指定 */}
              {timerMode === 'countdown' && !isActive && elapsedSecondsCount === 0 && (
                <div className="flex justify-center gap-1.5 pt-1">
                  {[10, 15, 25, 30, 60].map((mins) => (
                    <button
                      key={mins}
                      onClick={() => handleChangeTargetMinutes(mins)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                        targetMinutes === mins 
                          ? 'bg-blue-50 text-blue-700 border-blue-300 font-bold' 
                          : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      {mins}分
                    </button>
                  ))}
                </div>
              )}

              {timerMode === 'countdown' && <AlarmSettings theme="light" />}

              {/* 科目選択 */}
              <div className="space-y-2 pt-2">
                <div className="flex justify-center flex-wrap gap-1.5">
                  {['国語', '数学', '英語', '理科', '社会', 'その他'].map((sub) => (
                    <button
                      key={sub}
                      onClick={() => setSubject(sub)}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold transition ${
                        subject === sub 
                          ? 'bg-gray-900 text-white shadow-sm' 
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {sub}
                    </button>
                  ))}
                </div>
                {!subject && <p className="text-xs font-bold text-gray-500">教科を選ぶと計測を開始できます</p>}
              </div>

              {/* タイマー表示 */}
              <div className="py-8 md:py-12 bg-gray-50 rounded-2xl border border-gray-100 flex flex-col items-center justify-center">
                <span className="text-6xl md:text-8xl font-extrabold tracking-tight text-gray-900 font-mono">
                  {formatTime(seconds)}
                </span>
                <p className="text-xs text-gray-400 mt-2 font-medium">
                  {elapsedSecondsCount > 0 
                    ? `計測実績: ${formatTimeDetail(elapsedSecondsCount)}` 
                    : (timerMode === 'countup' ? '経過時間を計測中' : `目標: ${targetMinutes}分 カウントダウン`)}
                </p>
              </div>

              {/* 操作ボタン */}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    if (!isActive) prepareAlarm(); // 終わったときに音を出せるようにしておく
                    trackEvent(isActive ? 'timer_pause' : 'timer_start', { label: subject, seconds: elapsedSecondsCount });
                    setIsActive(!isActive);
                  }}
                  disabled={!isActive && !subject}
                  className={`flex-1 py-4 rounded-2xl font-bold text-white transition flex items-center justify-center gap-2 shadow-md disabled:bg-gray-300 disabled:shadow-none disabled:cursor-not-allowed ${
                    isActive ? 'bg-amber-500 hover:bg-amber-600' : 'bg-gray-900 hover:bg-gray-800'
                  }`}
                >
                  {isActive ? <Pause size={20} /> : <Play size={20} />}
                  {isActive ? '一時停止' : !subject ? '教科を選んでください' : '計測開始'}
                </button>
                
                <button
                  onClick={() => {
                    if (elapsedSecondsCount > 0) trackEvent('timer_reset', { label: subject, seconds: elapsedSecondsCount });
                    setIsActive(false);
                    setSeconds(timerMode === 'countdown' ? targetMinutes * 60 : 0);
                    setElapsedSecondsCount(0);
                    setSubject('');
                    sessionStartRef.current = null;
                  }}
                  className="p-4 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-2xl transition"
                  title="リセット"
                >
                  <RotateCcw size={20} />
                </button>
              </div>

              {(elapsedSecondsCount > 0 || seconds > 0) && !isActive && (
                <div className="pt-4 border-t border-gray-100 space-y-3">
                  <input
                    type="text"
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                    placeholder="振り返りメモ（例: 公式の暗記を完了）"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-gray-400"
                  />
                  <button
                    onClick={handleSaveLog}
                    className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl text-xs transition shadow-sm"
                  >
                    学習時間を保存する
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== TAB 3: カレンダー ===== */}
        {activeTab === 'calendar' && (
          <div className="space-y-4 md:space-y-0 md:grid md:grid-cols-2 md:gap-4 md:items-start">
            <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 space-y-3">
              <div className="flex justify-between items-center px-1">
                <h3 className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                  <CalendarIcon size={16} className="text-blue-600" />
                  {year}年 {month + 1}月 学習カレンダー
                </h3>
                <div className="flex items-center gap-1">
                  <button onClick={prevMonth} className="p-1 hover:bg-gray-100 rounded-lg text-gray-600"><ChevronLeft size={16} /></button>
                  <button onClick={nextMonth} className="p-1 hover:bg-gray-100 rounded-lg text-gray-600"><ChevronRight size={16} /></button>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-1 text-center text-[11px]">
                {['日', '月', '火', '水', '木', '金', '土'].map((d, idx) => (
                  <div key={d} className={`font-bold py-1 ${idx === 0 ? 'text-red-500' : idx === 6 ? 'text-blue-500' : 'text-gray-400'}`}>
                    {d}
                  </div>
                ))}

                {Array.from({ length: firstDay }).map((_, i) => (
                  <div key={`empty-${i}`} className="h-9" />
                ))}

                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const dayNum = i + 1;
                  const dateStr = `${year}-${(month + 1).toString().padStart(2, '0')}-${dayNum.toString().padStart(2, '0')}`;
                  const isSelected = dateStr === selectedCalendarDateStr;

                  const hasLog = logs.some(l => logDayKey(l) === dateStr);

                  return (
                    <button
                      key={dayNum}
                      onClick={() => setSelectedCalendarDateStr(dateStr)}
                      className={`h-9 rounded-xl flex flex-col items-center justify-center relative transition ${
                        isSelected 
                          ? 'bg-blue-600 text-white font-bold shadow-sm' 
                          : 'hover:bg-gray-100 text-gray-800'
                      }`}
                    >
                      <span>{dayNum}</span>
                      <div className="flex gap-0.5 mt-0.5">
                        {hasLog && <span className={`w-1 h-1 rounded-full ${isSelected ? 'bg-white' : 'bg-green-500'}`} />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 選択日の詳細 */}
            <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 space-y-3">
              <div className="border-b pb-2 flex justify-between items-center">
                <span className="text-xs font-bold text-gray-900">選択中: {selectedCalendarDateStr} の記録</span>
                <span className="text-xs font-extrabold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-100">
                  合計: {formatTimeDetail(totalSecondsOnSelectedDate)}
                </span>
              </div>

              <div className="space-y-2">
                <p className="text-[10px] font-bold text-gray-400 uppercase">学習時間ログ</p>
                {logsOnSelectedDate.length === 0 ? (
                  <p className="text-xs text-gray-400 italic py-1">この日の勉強記録はありません</p>
                ) : (
                  logsOnSelectedDate.map(log => {
                    const secs = log.durationSeconds ?? ((log.durationMinutes || 0) * 60);
                    return (
                      <div key={log.id} className="p-2.5 bg-gray-50 rounded-xl border border-gray-100 flex justify-between items-center text-xs">
                        <span className="font-bold text-gray-900 bg-white px-2 py-0.5 rounded border border-gray-200">{log.subject}</span>
                        <span className="font-mono font-bold text-gray-800">{formatTimeDetail(secs)}</span>
                      </div>
                    );
                  })
                )}
              </div>

            </div>
          </div>
        )}

        {/* ===== TAB 4: 詳細統計 ===== */}
        {activeTab === 'stats' && (
          <div className="space-y-4 md:space-y-0 md:grid md:grid-cols-2 md:gap-4 md:items-start">
            <div className="bg-white rounded-3xl p-4 shadow-sm border border-gray-100 flex justify-between items-center md:col-span-2">
              <span className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
                <BarChart2 size={16} /> 集計期間
              </span>
              <div className="flex bg-gray-100 p-1 rounded-xl gap-1">
                {(['day', 'week', 'month'] as const).map((period) => (
                  <button
                    key={period}
                    onClick={() => setStatsPeriod(period)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                      statsPeriod === period ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    {period === 'day' ? '日' : period === 'week' ? '週' : '月'}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 space-y-3">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                通算統計サマリー (秒単位)
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 text-center">
                  <p className="text-[10px] text-gray-400 font-bold uppercase">累計勉強時間</p>
                  <p className="text-base font-extrabold text-gray-900 mt-1">{formatTimeDetail(totalSecondsAll)}</p>
                  <p className="text-[9px] text-gray-400">({totalSecondsAll} 秒)</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 text-center">
                  <p className="text-[10px] text-gray-400 font-bold uppercase">総セッション数</p>
                  <p className="text-2xl font-extrabold text-gray-900 mt-1">{logs.length} <span className="text-xs font-normal">回</span></p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 space-y-3">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                全学習ログ履歴
              </h3>
              <div className="space-y-2 max-h-60 md:max-h-[32rem] overflow-y-auto">
                {logs.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-4">履歴データがありません</p>
                ) : (
                  logs.map((log) => {
                    const secs = log.durationSeconds ?? ((log.durationMinutes || 0) * 60);
                    return (
                      <div key={log.id} className="p-3 bg-gray-50 rounded-xl border border-gray-100 space-y-1">
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-bold text-gray-900 bg-white px-2 py-0.5 rounded-md border border-gray-200">
                            {log.subject}
                          </span>
                          <span className="font-mono font-bold text-gray-800">{formatTimeDetail(secs)}</span>
                        </div>
                        <div className="flex justify-between items-center text-[10px] text-gray-400 pt-0.5">
                          <span>{log.createdAt}</span>
                          {log.memo && <span className="italic text-gray-600">"{log.memo}"</span>}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {/* ===== TAB 4.5: BGM ===== */}
        {activeTab === 'bgm' && (
          <div className="md:max-w-2xl md:mx-auto">
            {/* BGM環境音設定 */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-4" style={{ ['--eq-color' as string]: '#111827' }}>
              <div className="flex items-center justify-between gap-2 border-b pb-3">
                <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <Music size={18} /> 集中BGM
                </h2>
                <span
                  className={`flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full ${
                    isPlayingBgm ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'
                  }`}
                  style={isPlayingBgm ? ({ ['--eq-color' as string]: '#ffffff' } as React.CSSProperties) : undefined}
                >
                  {isPlayingBgm && <Equalizer playing className="scale-75" />}
                  {isPlayingBgm ? `再生中：${SIMPLE_BGM.find((t) => t.id === bgmType)?.name ?? ''}` : '停止中'}
                </span>
              </div>

              {/* 曲を押すと再生。再生中の曲をもう一度押すと停止 */}
              <div className="space-y-2">
                {SIMPLE_BGM.map((t) => {
                  const selected = bgmType === t.id;
                  const playing = selected && isPlayingBgm;
                  return (
                    <button
                      key={t.id}
                      onClick={() => playBgmTrack(t.id)}
                      aria-pressed={playing}
                      className={`w-full flex items-center gap-3 p-3 rounded-2xl border text-left transition ${
                        playing
                          ? 'bg-gray-900 border-gray-900 text-white shadow-sm'
                          : selected
                          ? 'bg-gray-50 border-gray-400 text-gray-900'
                          : 'bg-gray-50 border-gray-200 text-gray-800 hover:bg-gray-100'
                      }`}
                    >
                      <span
                        className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center ${
                          playing ? 'bg-white/15 text-white' : 'bg-white text-gray-700 border border-gray-200'
                        }`}
                      >
                        {t.icon}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-bold">{t.name}</span>
                        <span className={`block text-[11px] truncate ${playing ? 'text-white/70' : 'text-gray-500'}`}>{t.desc}</span>
                      </span>
                      <span
                        className={`shrink-0 flex items-center gap-2 ${playing ? 'text-white' : 'text-gray-500'}`}
                        style={playing ? ({ ['--eq-color' as string]: '#ffffff' } as React.CSSProperties) : undefined}
                      >
                        {playing && <Equalizer playing />}
                        {playing ? <Pause size={18} /> : <Play size={18} />}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* 音量 */}
              <label className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-2xl px-3 py-2.5">
                {bgmVolume === 0 ? <VolumeX size={18} className="text-gray-500 shrink-0" /> : <Volume2 size={18} className="text-gray-500 shrink-0" />}
                <span className="text-xs font-bold text-gray-700 shrink-0">音量</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={bgmVolume}
                  onChange={(e) => setBgmVolume(Number(e.target.value))}
                  className="flex-1 accent-gray-900 cursor-pointer"
                  aria-label="BGMの音量"
                />
                <span className="w-9 text-right text-[11px] font-bold text-gray-600">{Math.round(bgmVolume * 100)}%</span>
              </label>

              <button
                onClick={toggleBgm}
                className={`w-full py-3 rounded-2xl font-bold text-sm transition flex items-center justify-center gap-2 ${
                  isPlayingBgm ? 'bg-gray-100 hover:bg-gray-200 text-gray-800 border border-gray-200' : 'bg-gray-900 hover:bg-gray-800 text-white shadow-sm'
                }`}
              >
                {isPlayingBgm ? <Pause size={16} /> : <Play size={16} />}
                {isPlayingBgm ? 'BGMを停止' : `${SIMPLE_BGM.find((t) => t.id === bgmType)?.name ?? ''}を再生`}
              </button>
            </div>
          </div>
        )}

        {/* ===== TAB 5: マイページ ===== */}
        {activeTab === 'profile' && (
          <div className="space-y-4 md:max-w-2xl md:mx-auto">
            {/* システム連携・モード切替・管理者認証ボタン */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-3">
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2 border-b pb-3">
                <Settings size={18} /> アプリ設定・検証
              </h2>

              {/* モード切替（スタート画面へ戻る）ボタン */}
              <button
                onClick={handleResetModeCall}
                className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold rounded-2xl transition text-xs flex items-center justify-center gap-2 border border-gray-200"
              >
                <RefreshCw size={16} />
                モードを再選択する（スタート画面へ）
              </button>

              <ContactForm
                theme="light"
                uid={user?.uid ?? null}
                buttonClassName="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold rounded-2xl transition text-xs flex items-center justify-center gap-2 border border-gray-200"
              />

              {user && (
                <button
                  onClick={handleLogout}
                  className="w-full py-3 bg-red-50 hover:bg-red-100 text-red-600 font-bold rounded-2xl transition text-xs flex items-center justify-center gap-2 border border-red-100"
                >
                  <LogOut size={16} />
                  ログアウト
                </button>
              )}
            </div>

          </div>
        )}

      </main>

      {/* 下部5タブバー */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md border-t border-gray-200 py-2 px-4 z-30">
        <div className="max-w-md md:max-w-2xl mx-auto flex items-stretch [&>button+button]:border-l [&>button+button]:border-gray-200">
          <button
            onClick={() => setActiveTab('timer')}
            className={`flex-1 min-w-0 flex flex-col items-center gap-1 transition whitespace-nowrap ${activeTab === 'timer' ? 'text-gray-900 font-bold' : 'text-gray-400'}`}
          >
            <Clock size={20} />
            <span className="text-[10px]">タイマー</span>
          </button>

          <button
            onClick={() => setActiveTab('calendar')}
            className={`flex-1 min-w-0 flex flex-col items-center gap-1 transition whitespace-nowrap ${activeTab === 'calendar' ? 'text-gray-900 font-bold' : 'text-gray-400'}`}
          >
            <CalendarIcon size={20} />
            <span className="text-[10px]">カレンダー</span>
          </button>

          <button
            onClick={() => setActiveTab('stats')}
            className={`flex-1 min-w-0 flex flex-col items-center gap-1 transition whitespace-nowrap ${activeTab === 'stats' ? 'text-gray-900 font-bold' : 'text-gray-400'}`}
          >
            <BarChart2 size={20} />
            <span className="text-[10px]">詳細統計</span>
          </button>

          <button
            onClick={() => setActiveTab('bgm')}
            className={`flex-1 min-w-0 flex flex-col items-center gap-1 transition whitespace-nowrap ${activeTab === 'bgm' ? 'text-gray-900 font-bold' : 'text-gray-400'}`}
          >
            <Music size={20} />
            <span className="text-[10px]">BGM</span>
          </button>

          <button
            onClick={() => setActiveTab('profile')}
            className={`flex-1 min-w-0 flex flex-col items-center gap-1 transition whitespace-nowrap ${activeTab === 'profile' ? 'text-gray-900 font-bold' : 'text-gray-400'}`}
          >
            <Settings size={20} />
            <span className="text-[10px]">設定</span>
          </button>
        </div>
      </nav>

      {timerFinished && (
        <TimerFinishDialog theme="light" subject={subject} minutes={targetMinutes} onClose={() => setTimerFinished(false)} />
      )}

    </div>
  );
};

export default SimpleApp; 