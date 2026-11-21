import React, { useState, useEffect, useRef } from 'react';
import { 
  Flame, 
  Zap, 
  Clock, 
  CheckSquare, 
  BarChart2, 
  Music, 
  User, 
  Play, 
  Pause, 
  RotateCcw, 
  Plus, 
  Trash2, 
  Volume2, 
  VolumeX, 
  Sparkles,
  Gem,
  RefreshCw,
  Lock
} from 'lucide-react';
import confetti from 'canvas-confetti';
import ForestBackground from './ForestBackground';
import CampScene from './CampScene';
import './GameStage.css';
import GameStats from './GameStats';
import {
  CHEST_CRYSTAL_CHANCE,
  CRYSTAL_STREAK_STEP,
  EXP_PER_MINUTE,
  FOCUS_BONUS_EXP,
  FOCUS_BONUS_SECONDS,
  dayKey,
  missedDays,
  streakBonusRate,
  streakUntilYesterday,
  studyStreak,
  MAX_LEVEL,
  applyExp,
  expToNext,
  levelTitle
} from './gameStatsUtils';
import { trackEvent } from '../../lib/researchEvents';
import { useScreenTracking } from '../../lib/useResearchTracking';
import { useBgm } from '../../lib/useBgm';
import walkSheetUrl from '../../assets/character/walk_sheet.png';
import sitUrl from '../../assets/character/sit.png';
import { BGM_TRACKS, bgmName, type BgmTrack } from './bgmTracks';
import Equalizer from './Equalizer';

// 歩行アニメーション：1枚の画像（src/assets/character/walk_sheet.png、624 × 864 px、4列 × 3段）に
// 並んだ12コマで1周（左右1歩ずつ）。表示するコマの部分だけを映す
const WALK_SHEET = { src: walkSheetUrl, width: 624, height: 864 };
// 1コマを切り出す枠の大きさ（px）。頭の中心と足の裏をそろえて、コマごとの位置のずれをなくしている
const WALK_BOX = { width: 154, height: 283 };
// 各コマの枠の左上の位置（シート上の px）
const WALK_FRAMES: [number, number][] = [
  [2, 3], [157, 3], [312, 2], [467, 2],
  [0, 288], [158, 288], [313, 288], [468, 288],
  [0, 576], [155, 576], [311, 579], [469, 579]
];
const WALK_FRAME_COUNT = WALK_FRAMES.length;
const WALK_FRAME_MS = 140; // 1コマの表示時間（ミリ秒）
import { saveResearchLog } from '../../lib/researchLog';
import { getParticipantId } from '../../lib/participant';

// 以前の版で最初から入っていた見本クエスト（保存データからも取り除く）
const SAMPLE_TASK_IDS = ['daily_login', 'timer_1min'];

interface GamifiedAppProps {
  user?: any;
  onOpenAdmin?: () => void;
  onResetMode?: () => void;
}

interface StudyLog {
  id: string;
  subject: string;
  durationMinutes: number;
  expGained: number;
  createdAt: string;
  memo: string;
}

interface Task {
  id: string;
  title: string;
  completed: boolean;
  isAutomatic?: boolean;
  subject?: string;
  targetMinutes?: number;
}

export const GamifiedApp: React.FC<GamifiedAppProps> = ({
  user,
  onOpenAdmin,
  onResetMode
}) => {
  // 1. タブ管理
  const [activeTab, setActiveTab] = useState<'timer' | 'todo' | 'stats' | 'bgm' | 'profile'>('timer');

  // 2. ゲーミフィケーション・ステート
  const [level, setLevel] = useState(1);
  const [exp, setExp] = useState(0);
  // ライフクリスタル：連続7日ごとに1個。学習しなかった日を1日1個で埋めて連続記録を守る
  const [lifeTokens, setLifeTokens] = useState(1);
  // ライフクリスタルで守った日（'YYYY-MM-DD'）
  const [protectedDays, setProtectedDays] = useState<string[]>([]);
  const [lastStudyTime, setLastStudyTime] = useState<number>(Date.now());
  // 次のレベルに必要な EXP（Lv100 で最大）
  const isMaxLevel = level >= MAX_LEVEL;
  const maxExp = expToNext(level);
  // 最新のレベルと EXP（読み込み直後にも正しく足せるよう state とは別に持つ）
  const progressRef = useRef({ level: 1, exp: 0 });

  // 3. タイマー関連ステート
  const [seconds, setSeconds] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [subject, setSubject] = useState('英語');
  const [memo, setMemo] = useState('');
  // 集中ボーナス用：今回止めずに続けている秒数と、この計測での最長
  const [runSeconds, setRunSeconds] = useState(0);
  const [bestRun, setBestRun] = useState(0);

  // 4. アニメーション用フレームステート（1〜8）
  const [currentFrame, setCurrentFrame] = useState(1);

  // 4. データステート
  const [logs, setLogs] = useState<StudyLog[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  
  // 新規クエスト作成用ステート
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskSubject, setNewTaskSubject] = useState('英語');
  const [newTaskMinutes, setNewTaskMinutes] = useState(1);

  // 5. BGM関連ステート
  const {
    isPlaying: isPlayingBgm,
    track: bgmType,
    toggle: toggleBgm,
    playTrack: playBgmTrack,
    volume: bgmVolume,
    setVolume: setBgmVolume
  } = useBgm<BgmTrack>(
    'cyber',
    { cyber: 'cyber', lofi: 'lofi', rain: 'deep_rain' }
  );

  // 行動データ：表示中のタブと BGM の再生状態
  useScreenTracking(activeTab);

  // 初回マウントの二重実行を防ぐためのRef
  const hasInitializedRef = useRef(false);

  // ローカルストレージからの読み込み ＆ デイリーログイン・タスク初期化
  useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    // 保存済みのレベルと EXP（今のレベル表に合わせて整える）
    const savedLevel = Number(localStorage.getItem('gamified_level')) || 1;
    const savedExp = Number(localStorage.getItem('gamified_exp')) || 0;
    const loaded = applyExp(savedLevel, savedExp, 0);
    progressRef.current = loaded;
    setLevel(loaded.level);
    setExp(loaded.exp);


    const savedTokens = localStorage.getItem('gamified_life_tokens');
    let crystals = savedTokens ? Number(savedTokens) : 1;
    if (!Number.isFinite(crystals) || crystals < 0) crystals = 0;
    setLifeTokens(crystals);

    let loadedProtected: string[] = [];
    try {
      loadedProtected = JSON.parse(localStorage.getItem('gamified_protected_days') || '[]');
    } catch {
      loadedProtected = [];
    }
    setProtectedDays(loadedProtected);

    const savedLastTime = localStorage.getItem('gamified_last_study_time');
    const now = Date.now();
    if (savedLastTime) {
      setLastStudyTime(Number(savedLastTime));
    } else {
      localStorage.setItem('gamified_last_study_time', now.toString());
    }

    const savedLogs = localStorage.getItem('gamified_study_logs');
    let loadedLogs: StudyLog[] = [];
    if (savedLogs) {
      try { 
        loadedLogs = JSON.parse(savedLogs);
        setLogs(loadedLogs); 
      } catch (e) {}
    }

    // --- デイリーログインチェック ---
    const todayStr = new Date().toLocaleDateString('ja-JP');
    const lastLoginDate = localStorage.getItem('gamified_last_login_date');

    // クエストは最初は空。以前の版で最初から入っていた見本クエストは取り除く
    let loadedTasks: Task[] = [];
    const savedTasks = localStorage.getItem('gamified_tasks');
    if (savedTasks) {
      try {
        loadedTasks = (JSON.parse(savedTasks) as Task[]).filter((t) => !SAMPLE_TASK_IDS.includes(t.id));
      } catch {
        loadedTasks = [];
      }
    }

    if (lastLoginDate !== todayStr) {
      localStorage.setItem('gamified_last_login_date', todayStr);
      addExp(50);
      alert(`🌟 デイリーログインボーナス！ 本日最初のログインで +50 EXP を獲得しました！`);
    }

    setTasks(loadedTasks);
    localStorage.setItem('gamified_tasks', JSON.stringify(loadedTasks));

    // --- ライフクリスタルで連続記録を守る（1日1回だけ確認） ---
    const todayKey = dayKey(new Date());
    if (localStorage.getItem('gamified_streak_check_day') !== todayKey) {
      localStorage.setItem('gamified_streak_check_day', todayKey);
      const missed = missedDays(loadedLogs, loadedProtected);
      if (missed.length > 0) {
        if (crystals >= missed.length) {
          crystals -= missed.length;
          const nextProtected = [...loadedProtected, ...missed];
          setLifeTokens(crystals);
          setProtectedDays(nextProtected);
          localStorage.setItem('gamified_life_tokens', String(crystals));
          localStorage.setItem('gamified_protected_days', JSON.stringify(nextProtected));
          trackEvent('crystal_use', { count: missed.length });
          alert(
            `💎 ライフクリスタルを ${missed.length} 個使って、連続記録 ${studyStreak(loadedLogs, nextProtected)} 日を守りました！（残り ${crystals} 個）\n今日も学習して記録をのばしましょう。`
          );
        } else {
          alert(
            `😢 学習しなかった日が ${missed.length} 日あり、ライフクリスタル（${crystals} 個）が足りなかったため連続記録が途切れました。\n今日からまた積み上げましょう！`
          );
        }
      }
    }
  }, []);

  // タイマー作動中（isActive === true）の秒数カウント
  useEffect(() => {
    if (!isActive) return;
    // 実時間との差分で進めるため、タブが裏に回って処理が間引かれても時間がずれない
    let lastTick = Date.now();
    const interval = setInterval(() => {
      const delta = Math.floor((Date.now() - lastTick) / 1000);
      if (delta <= 0) return;
      lastTick += delta * 1000;
      setSeconds((sec) => sec + delta);
      setRunSeconds((sec) => sec + delta);
    }, 250);

    return () => clearInterval(interval);
  }, [isActive]);

  // 計測セッションの開始時刻（最初に開始を押した時刻。保存・リセットで解除）
  const sessionStartRef = useRef<number | null>(null);
  useEffect(() => {
    if (isActive && sessionStartRef.current === null) {
      sessionStartRef.current = Date.now();
    }
  }, [isActive]);

// 歩行アニメーション：新しい8枚の画像を順番に切り替え
  useEffect(() => {
    let animInterval: any = null;

    if (isActive) {
      animInterval = setInterval(() => {
        setCurrentFrame((prev) => (prev % WALK_FRAME_COUNT) + 1);
      }, WALK_FRAME_MS);
    } else {
      setCurrentFrame(1); // 停止時は1番の画像に戻す
    }

    return () => {
      clearInterval(animInterval);
    };
  }, [isActive]);

  // 経験値加算とレベルアップ判定
  const addExp = (gainedExp: number) => {
    const before = progressRef.current;
    const after = applyExp(before.level, before.exp, gainedExp);
    progressRef.current = after;
    setLevel(after.level);
    setExp(after.exp);
    localStorage.setItem('gamified_level', after.level.toString());
    localStorage.setItem('gamified_exp', after.exp.toString());

    if (after.level > before.level) {
      const newTitle = levelTitle(after.level) !== levelTitle(before.level) ? levelTitle(after.level) : null;
      if (after.level >= MAX_LEVEL) {
        // 最大レベル到達は特別な演出
        const fire = (x: number) => confetti({ particleCount: 160, spread: 100, startVelocity: 55, origin: { x, y: 0.7 } });
        fire(0.2);
        fire(0.8);
        setTimeout(() => fire(0.5), 400);
        alert(`👑 Lv.${MAX_LEVEL} 到達！ 称号「${levelTitle(after.level)}」を手に入れました！\nここまで続けたあなたは本物の伝説です。`);
      } else {
        confetti({ particleCount: newTitle ? 200 : 120, spread: newTitle ? 100 : 80, origin: { y: 0.6 } });
        alert(
          `🎉 レベルアップ！ Lv.${after.level} になりました！` + (newTitle ? `\n🏆 新しい称号「${newTitle}」を手に入れました！` : '')
        );
      }
    }
  };
  // クエスト自動達成判定
  const checkAndUpdateAutomaticTasks = (savedSubject: string, targetLogs: StudyLog[]) => {
    const todayStr = new Date().toLocaleDateString('ja-JP');
    let newlyCompletedCount = 0;

    const updated = tasks.map(task => {
      if (task.completed) return task;

      if (task.targetMinutes !== undefined && task.subject && task.subject === savedSubject) {
        const subjectTotalMinutes = targetLogs
          .filter(l => l.createdAt.includes(todayStr.split(' ')[0]) && l.subject === task.subject)
          .reduce((sum, l) => sum + l.durationMinutes, 0);

        if (subjectTotalMinutes >= task.targetMinutes) {
          newlyCompletedCount++;
          trackEvent('quest_complete', { label: task.title, count: task.targetMinutes });
          return { ...task, completed: true };
        }
      }
      return task;
    });

    if (newlyCompletedCount > 0) {
      setTasks(updated);
      localStorage.setItem('gamified_tasks', JSON.stringify(updated));
    }

    return newlyCompletedCount;
  };

  const handleSaveLog = async () => {
    // 1分未満は記録しない（短い記録をくり返して EXP を稼げないように）
    if (seconds < 60) {
      alert('1分以上学習すると記録できます。もう少し続けてみましょう！');
      return;
    }

    const durationMinutes = Math.round(seconds / 60);
    // 学習時間の EXP は秒単位（1分 = 20 EXP）
    const baseTimeExp = Math.floor((seconds * EXP_PER_MINUTE) / 60);
    // 連続ボーナス：昨日までの連続日数に応じて学習時間の EXP を増やす
    const bonusRate = streakBonusRate(streakUntilYesterday(logs, protectedDays));
    const streakExp = Math.round(baseTimeExp * bonusRate);
    // 集中ボーナス：止めずに25分続けたら宝箱
    const focused = Math.max(bestRun, runSeconds) >= FOCUS_BONUS_SECONDS;
    const chestCrystal = focused && Math.random() < CHEST_CRYSTAL_CHANCE;
    const focusExp = focused ? FOCUS_BONUS_EXP : 0;

    const newLog: StudyLog = {
      id: Date.now().toString(),
      subject,
      durationMinutes,
      expGained: baseTimeExp + streakExp + focusExp,
      createdAt: new Date().toLocaleString('ja-JP'),
      memo
    };

    const updatedLogs = [newLog, ...logs];
    setLogs(updatedLogs);
    localStorage.setItem('gamified_study_logs', JSON.stringify(updatedLogs));

    const now = Date.now();
    setLastStudyTime(now);
    localStorage.setItem('gamified_last_study_time', now.toString());

    const newlyCompletedCount = checkAndUpdateAutomaticTasks(subject, updatedLogs);
    const questExp = 50 * newlyCompletedCount;
    const totalExpGained = baseTimeExp + streakExp + focusExp + questExp;

    // ライフクリスタル：宝箱と、連続7日ごとのごほうび
    let crystalsGained = chestCrystal ? 1 : 0;
    const streakNow = studyStreak(updatedLogs, protectedDays);
    const todayKey = dayKey(new Date());
    const streakReward =
      streakNow > 0 &&
      streakNow % CRYSTAL_STREAK_STEP === 0 &&
      localStorage.getItem('gamified_crystal_award_day') !== todayKey;
    if (streakReward) {
      crystalsGained += 1;
      localStorage.setItem('gamified_crystal_award_day', todayKey);
    }
    if (crystalsGained > 0) {
      const next = lifeTokens + crystalsGained;
      setLifeTokens(next);
      localStorage.setItem('gamified_life_tokens', String(next));
      trackEvent('crystal_gain', { label: streakReward ? `streak_${streakNow}` : 'chest', count: crystalsGained });
    }
    if (focused) trackEvent('focus_bonus', { label: subject, seconds: Math.max(bestRun, runSeconds) });

    const lines = [`⏱️ 学習時間 +${baseTimeExp} EXP`];
    if (streakExp > 0) lines.push(`🔥 連続ボーナス（+${Math.round(bonusRate * 100)}%） +${streakExp} EXP`);
    if (focused) {
      lines.push(`🎁 集中ボーナス！ 25分続けたごほうびの宝箱から +${focusExp} EXP${chestCrystal ? ' ＋ 💎 ライフクリスタル' : ''}`);
    }
    if (newlyCompletedCount > 0) lines.push(`🎯 クエスト ${newlyCompletedCount} 件クリア +${questExp} EXP`);
    if (streakReward) lines.push(`💎 連続 ${streakNow} 日達成！ ライフクリスタルを1個獲得`);
    lines.push(`合計 +${totalExpGained} EXP 獲得！`);
    alert(lines.join('\n'));

    const levelAtSave = level;
    addExp(totalExpGained);

    await saveResearchLog({
      mode: 'gamified',
      uid: user?.uid,
      subject,
      durationSeconds: seconds,
      startedAtMs: sessionStartRef.current,
      memo,
      level: levelAtSave,
      expGained: totalExpGained
    });
    sessionStartRef.current = null;
    setBestRun(0);

    setIsActive(false);
    setSeconds(0);
    setRunSeconds(0);
    setMemo('');
  };

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    
    const minutes = Math.max(1, Number(newTaskMinutes) || 1);

    const newTask: Task = {
      id: Date.now().toString(),
      title: newTaskTitle,
      completed: false,
      isAutomatic: true,
      subject: newTaskSubject,
      targetMinutes: minutes
    };

    trackEvent('quest_add', { label: newTask.title, count: minutes });
    const updated = [...tasks, newTask];
    setTasks(updated);
    localStorage.setItem('gamified_tasks', JSON.stringify(updated));
    setNewTaskTitle('');
    setNewTaskMinutes(1);
  };

  const deleteTask = (id: string) => {
    const target = tasks.find((t) => t.id === id);
    if (target) trackEvent('quest_delete', { label: target.title });
    const updated = tasks.filter(t => t.id !== id);
    setTasks(updated);
    localStorage.setItem('gamified_tasks', JSON.stringify(updated));
  };

  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // 状態の見出し（画面上部のタイマーの上に出す）
  const stageStatus = isActive
    ? `冒険中… ${subject}`
    : seconds >= 60
      ? '一時停止中（成果を記録できます）'
      : seconds > 0
        ? '一時停止中（1分から記録できます）'
        : 'キャンプで休憩中… 「学習開始」で冒険に出発！';

  // 今日の連続ボーナスと、集中ボーナスまでの残り
  const streakDays = studyStreak(logs, protectedDays);
  const bonusPercent = Math.round(streakBonusRate(streakUntilYesterday(logs, protectedDays)) * 100);
  const focusAchieved = Math.max(bestRun, runSeconds) >= FOCUS_BONUS_SECONDS;

  return (
    <div className="game-stage relative h-[100dvh] overflow-hidden bg-slate-950 text-slate-100 antialiased selection:bg-purple-600 selection:text-white">

      {/* ===== 画面いっぱいのステージ（ほかのタブを開いている間も後ろで動き続ける） ===== */}
      <div className="fixed inset-0 z-0 overflow-hidden" aria-hidden={activeTab !== 'timer'}>
        <div className="game-world">
          <div className="game-world-inner">
            {/* 動く森の背景（学習中は景色が流れる） */}
            <ForestBackground moving={isActive} />

            {/* アバター描画：歩行の12コマ（walk_sheet.png）。足元を小道に合わせる。
                --s は表示の倍率（スマホ 0.42、PC 0.5） */}
            {isActive && (
              <div className="absolute left-1/2 -translate-x-1/2 bottom-[52px] z-10 [--s:0.42] md:[--s:0.5]">
                <div
                  role="img"
                  aria-label="冒険者アバター歩行中"
                  style={{
                    width: `calc(${WALK_BOX.width}px * var(--s))`,
                    height: `calc(${WALK_BOX.height}px * var(--s))`,
                    backgroundImage: `url(${WALK_SHEET.src})`,
                    backgroundRepeat: 'no-repeat',
                    backgroundSize: `calc(${WALK_SHEET.width}px * var(--s)) calc(${WALK_SHEET.height}px * var(--s))`,
                    backgroundPosition: `calc(${-WALK_FRAMES[(currentFrame - 1) % WALK_FRAME_COUNT][0]}px * var(--s)) calc(${-WALK_FRAMES[(currentFrame - 1) % WALK_FRAME_COUNT][1]}px * var(--s))`
                  }}
                />
              </div>
            )}

            {/* 休憩中はたき火でキャンプ */}
            {!isActive && <CampScene characterSrc={sitUrl} showCaption={false} />}
          </div>
        </div>
        <div className={`game-ground ${isActive ? '' : 'is-resting'}`} />
      </div>

      {/* ===== 上部の HUD（レベル・EXP・ライフ・連続日数） ===== */}
      <header className="fixed top-0 inset-x-0 z-30 px-3 pt-3 pb-6 bg-gradient-to-b from-[#312117]/85 via-[#312117]/40 to-transparent">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          <div className="game-glass rounded-2xl pl-1.5 pr-3 py-1.5 flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 shrink-0 rounded-xl bg-[#fdd69f] flex flex-col items-center justify-center shadow-lg shadow-black/30">
              <span className="text-[7px] font-bold text-[#312117] leading-none">Lv.</span>
              <span className="text-sm font-black text-[#312117] leading-none">{level}</span>
            </div>
            <div className="w-28 md:w-40">
              {/* 称号 */}
              <p className="text-[11px] font-black text-white leading-tight truncate" title={levelTitle(level)}>
                {levelTitle(level)}
              </p>
              <div className="flex justify-between text-[9px] font-bold text-[#fdd69f] mt-0.5">
                <span className="flex items-center gap-0.5"><Zap size={9} className="text-[#fdd69f]" /> EXP</span>
                <span>{isMaxLevel ? "MAX" : `${exp} / ${maxExp}`}</span>
              </div>
              <div className="h-2 mt-0.5 w-full bg-[#312117] rounded-full overflow-hidden border border-[#fdd69f]/30">
                <div
                  className="h-full bg-[#fdd69f] rounded-full transition-all duration-300"
                  style={{ width: isMaxLevel ? "100%" : `${Math.min(100, (exp / maxExp) * 100)}%` }}
                />
              </div>
            </div>
          </div>

          {/* PC用ナビゲーションタブ */}
          <nav className="hidden md:flex game-glass rounded-full p-1 items-center gap-1 text-xs font-bold">
            <button onClick={() => setActiveTab('timer')} className={`px-3 py-1.5 rounded-full transition ${activeTab === 'timer' ? 'bg-[#fdd69f] text-[#312117]' : 'text-[#fdd69f] hover:bg-[#fdd69f]/10'}`}>冒険</button>
            <button onClick={() => setActiveTab('todo')} className={`px-3 py-1.5 rounded-full transition ${activeTab === 'todo' ? 'bg-[#fdd69f] text-[#312117]' : 'text-[#fdd69f] hover:bg-[#fdd69f]/10'}`}>クエスト</button>
            <button onClick={() => setActiveTab('stats')} className={`px-3 py-1.5 rounded-full transition ${activeTab === 'stats' ? 'bg-[#fdd69f] text-[#312117]' : 'text-[#fdd69f] hover:bg-[#fdd69f]/10'}`}>戦績</button>
            <button onClick={() => setActiveTab('bgm')} className={`px-3 py-1.5 rounded-full transition ${activeTab === 'bgm' ? 'bg-[#fdd69f] text-[#312117]' : 'text-[#fdd69f] hover:bg-[#fdd69f]/10'}`}>BGM</button>
            <button onClick={() => setActiveTab('profile')} className={`px-3 py-1.5 rounded-full transition ${activeTab === 'profile' ? 'bg-[#fdd69f] text-[#312117]' : 'text-[#fdd69f] hover:bg-[#fdd69f]/10'}`}>プレイヤー</button>
          </nav>

          <div className="flex items-center gap-1.5 shrink-0">
            <div className="game-glass flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-bold text-[#fdd69f]">
              <Gem size={14} className="text-[#fdd69f]" aria-label="ライフクリスタル" />
              <span>× {lifeTokens}</span>
            </div>
            <div className="game-glass flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-bold text-[#fdd69f]">
              <Flame size={14} className="fill-[#fdd69f] text-[#fdd69f] animate-pulse" />
              <span>{streakDays} 日</span>
            </div>
          </div>
        </div>
      </header>

      {activeTab === 'timer' ? (
        <>
          {/* ===== タイマー（空の部分に重ねる） ===== */}
          <div className="fixed inset-x-0 top-[68px] md:top-[76px] z-20 px-4 flex flex-col items-center gap-2 pointer-events-none">
            <div className="game-glass pointer-events-auto w-full max-w-sm rounded-3xl px-4 py-3 text-center shadow-2xl">
              <p className="text-[10px] font-bold text-white flex items-center justify-center gap-1">
                <Sparkles size={11} className="text-[#fdd69f]" /> {stageStatus}
              </p>
              <p className="game-digits font-mono font-black tracking-tight text-5xl md:text-6xl text-white mt-1">
                {formatTime(seconds)}
              </p>
              {bonusPercent > 0 && (
                <p className="text-[10px] font-bold text-[#fdd69f] mt-1 flex items-center justify-center gap-1">
                  <Flame size={10} className="text-[#fdd69f]" />
                  <span>連続ボーナス +{bonusPercent}%</span>
                </p>
              )}
              {focusAchieved && (
                <p className="text-[10px] font-bold text-[#fdd69f] mt-0.5 flex items-center justify-center gap-1">
                  <Sparkles size={10} className="text-[#fdd69f]" />
                  <span>集中ボーナス達成！ 記録すると宝箱が開きます</span>
                </p>
              )}
              {/* 教科選択 */}
              <div className="flex justify-center flex-wrap gap-1.5 mt-2.5">
                {['国語', '数学', '英語', '理科', '社会', 'その他'].map((sub) => (
                  <button
                    key={sub}
                    onClick={() => setSubject(sub)}
                    className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition ${
                      subject === sub
                        ? 'bg-[#fdd69f] text-[#312117] border border-[#fdd69f]'
                        : 'bg-[#312117]/70 text-white border border-[#fdd69f]/25 hover:bg-[#fdd69f]/10'
                    }`}
                  >
                    {sub}
                  </button>
                ))}
              </div>
            </div>

            {/* 一時停止中は成果メモと記録ボタン */}
            {seconds > 0 && !isActive && (
              <div className="game-glass pointer-events-auto w-full max-w-sm rounded-2xl p-2.5 flex gap-2 shadow-xl">
                <input
                  type="text"
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder="成果メモ（例: 漢字の復習）"
                  className="flex-1 min-w-0 px-3 py-2 bg-[#312117] border border-[#fdd69f]/25 rounded-xl text-xs text-[#fdd69f] placeholder:text-[#fdd69f]/45 focus:outline-none focus:border-[#fdd69f]"
                />
                <button
                  onClick={handleSaveLog}
                  className="shrink-0 px-3 py-2 bg-[#fdd69f] hover:brightness-110 text-[#312117] font-bold rounded-xl text-xs transition shadow-lg shadow-black/30"
                >
                  記録してEXP獲得
                </button>
              </div>
            )}
          </div>

          {/* ===== 下部の操作ボタン（地面の上に乗せる） ===== */}
          <div className="fixed inset-x-0 bottom-[76px] md:bottom-6 z-20 px-4 flex justify-center">
            <div className="w-full max-w-sm flex gap-3">
              <button
                onClick={() => {
                  trackEvent(isActive ? 'timer_pause' : 'timer_start', { label: subject, seconds });
                  if (isActive) {
                    // 止めたら連続の区切り。それまでの最長だけ覚えておく
                    setBestRun(Math.max(bestRun, runSeconds));
                    setRunSeconds(0);
                  }
                  setIsActive(!isActive);
                }}
                className={`flex-1 h-14 rounded-2xl font-black text-base transition flex items-center justify-center gap-2 shadow-xl shadow-black/40 border-2 ${
                  isActive
                    ? 'bg-[#312117] text-[#fdd69f] border-[#fdd69f]/70 hover:bg-[#3f2b1e]'
                    : 'bg-[#fdd69f] text-[#312117] border-[#fdd69f] hover:brightness-110'
                }`}
              >
                {isActive ? <Pause size={20} /> : <Play size={20} />}
                {isActive ? '一時停止' : seconds > 0 ? '冒険を再開' : '学習開始'}
              </button>
              <button
                onClick={toggleBgm}
                className={`w-14 h-14 shrink-0 rounded-2xl transition flex flex-col items-center justify-center gap-1 ${
                  isPlayingBgm ? 'bg-[#fdd69f]/20 border-2 border-[#fdd69f]/70 text-[#fdd69f]' : 'game-glass text-[#fdd69f] hover:bg-[#fdd69f]/10'
                }`}
                title={isPlayingBgm ? `BGMを停止（${bgmName(bgmType)}）` : `BGMを再生（${bgmName(bgmType)}）`}
                aria-label={isPlayingBgm ? 'BGMを停止' : 'BGMを再生'}
                aria-pressed={isPlayingBgm}
              >
                {isPlayingBgm ? <Equalizer playing /> : <Music size={18} />}
                <span className="text-[8px] font-bold leading-none text-white/85">{isPlayingBgm ? bgmName(bgmType) : 'BGM'}</span>
              </button>
              <button
                onClick={() => {
                  if (seconds > 0) trackEvent('timer_reset', { label: subject, seconds });
                  setIsActive(false);
                  setSeconds(0);
                  setRunSeconds(0);
                  setBestRun(0);
                  sessionStartRef.current = null;
                }}
                className="game-glass w-14 h-14 shrink-0 rounded-2xl text-[#fdd69f] hover:bg-[#fdd69f]/10 transition flex items-center justify-center"
                title="リセット"
                aria-label="リセット"
              >
                <RotateCcw size={18} />
              </button>
            </div>
          </div>
        </>
      ) : (
        /* ===== ほかのタブはステージの上に開くメニュー ===== */
        <div className="fixed inset-0 z-20 overflow-y-auto bg-[#312117]/75 backdrop-blur-[3px]">
          <main className="max-w-md md:max-w-4xl mx-auto px-4 pt-20 md:pt-24 pb-28 md:pb-10">
                {/* クエストタブ */}
                {activeTab === 'todo' && (
                  <div className="bg-[#312117]/90 rounded-3xl p-6 shadow-xl border border-[#fdd69f]/20 space-y-4">
                    <div className="flex justify-between items-center">
                      <h2 className="text-base font-bold text-white flex items-center gap-2 whitespace-nowrap shrink-0">
                        <CheckSquare size={18} className="text-[#fdd69f]" /> クエストボード
                      </h2>
                      <span className="text-[10px] text-white bg-[#4a3424]/60 border border-[#fdd69f]/30 px-2.5 py-1 rounded-full">
                        同一教科の目標時間達成で自動クリア (+50 EXP)
                      </span>
                    </div>

                    <form onSubmit={handleAddTask} className="bg-[#1f140d]/80 p-3.5 rounded-2xl border border-[#fdd69f]/15 space-y-3">
                      <p className="text-xs font-bold text-white flex items-center gap-1">
                        <Plus size={14} /> 新しいクエストを作成
                      </p>
                  
                      <input
                        type="text"
                        value={newTaskTitle}
                        onChange={(e) => setNewTaskTitle(e.target.value)}
                        placeholder="クエスト名（例: 数学の基礎固め）"
                        className="w-full px-3.5 py-2.5 bg-[#312117] border border-[#fdd69f]/15 rounded-xl text-xs text-white focus:outline-none focus:border-[#fdd69f]/30"
                      />

                      <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
                        <div className="flex items-center gap-1.5 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
                          <span className="text-[10px] text-white/65 font-bold shrink-0">教科:</span>
                          {['国語', '数学', '英語', '理科', '社会', 'その他'].map((sub) => (
                            <button
                              key={sub}
                              type="button"
                              onClick={() => setNewTaskSubject(sub)}
                              className={`px-2 py-1 rounded-lg text-[10px] font-bold transition shrink-0 ${
                                newTaskSubject === sub 
                                  ? 'bg-[#fdd69f] text-[#312117] border border-[#fdd69f]' 
                                  : 'bg-[#312117] text-white/65 border border-[#fdd69f]/15 hover:bg-[#4a3424]'
                              }`}
                            >
                              {sub}
                            </button>
                          ))}
                        </div>

                        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
                          <span className="text-[10px] text-white/65 font-bold shrink-0">目標時間(分):</span>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={newTaskMinutes}
                            onChange={(e) => setNewTaskMinutes(Number(e.target.value))}
                            className="w-20 px-2.5 py-1.5 bg-[#312117] border border-[#fdd69f]/15 rounded-xl text-xs text-white text-center focus:outline-none focus:border-[#fdd69f]/30"
                          />
                          <button
                            type="submit"
                            className="px-4 py-2 bg-[#fdd69f] text-[#312117] rounded-xl hover:bg-[#ffe3b8] transition shadow-md shadow-black/30 text-xs font-bold shrink-0"
                          >
                            追加
                          </button>
                        </div>
                      </div>
                    </form>

                    <div className="space-y-2 pt-2">
                      {tasks.map((task) => (
                        <div 
                          key={task.id} 
                          className={`flex items-center justify-between p-3.5 rounded-xl border ${
                            task.completed 
                              ? 'bg-emerald-950/20 border-emerald-500/30' 
                              : 'bg-[#4a3424]/20 border-[#fdd69f]/30'
                          }`}
                        >
                          <div className="flex items-center gap-3 text-xs flex-1">
                            <input
                              type="checkbox"
                              checked={task.completed}
                              disabled={true}
                              className="w-4 h-4 rounded text-[#312117] focus:ring-[#fdd69f] bg-[#312117] border-[#fdd69f]/25 opacity-75 cursor-not-allowed"
                            />
                            <div className="flex flex-col gap-0.5">
                              <span className={task.completed ? 'line-through text-white/50' : 'text-white font-semibold'}>
                                {task.title}
                              </span>
                              <div className="flex items-center gap-2 text-[10px]">
                                {task.subject && (
                                  <span className="text-white bg-[#4a3424]/80 px-1.5 py-0.5 rounded border border-[#fdd69f]/30">
                                    教科: {task.subject}
                                  </span>
                                )}
                                {task.targetMinutes !== undefined && (
                                  <span className="text-white/65 bg-[#312117] px-1.5 py-0.5 rounded border border-[#fdd69f]/15">
                                    目標: {task.targetMinutes}分以上
                                  </span>
                                )}
                                <span className="text-white">※自動判定</span>
                              </div>
                            </div>
                          </div>
                      
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-yellow-400 font-bold bg-yellow-400/10 border border-yellow-400/20 px-2 py-0.5 rounded-full">
                              +50 EXP
                            </span>
                            <button
                              onClick={() => deleteTask(task.id)}
                              className="text-white/50 hover:text-red-400 transition"
                              title="削除"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 戦績タブ */}
                {activeTab === 'stats' && (
                  <GameStats level={level} exp={exp} maxExp={maxExp} lifeTokens={lifeTokens} protectedDays={protectedDays} logs={logs} tasks={tasks} />
                )}

                {/* BGMタブ */}
                {activeTab === 'bgm' && (
                  <div className="bg-[#312117]/90 rounded-3xl p-5 md:p-6 shadow-xl border border-[#fdd69f]/20 space-y-4 md:max-w-lg md:mx-auto">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h2 className="text-base font-bold text-white flex items-center gap-2">
                          <Music size={18} className="text-[#fdd69f]" /> ゾーン突入 BGM
                        </h2>
                        <p className="text-xs text-white/65 mt-0.5">曲を押すとすぐ流れます</p>
                      </div>
                      <Equalizer playing={isPlayingBgm} className="scale-125" />
                    </div>

                    {/* 曲の一覧 */}
                    <div className="space-y-2">
                      {BGM_TRACKS.map((t) => {
                        const selected = bgmType === t.id;
                        const playing = selected && isPlayingBgm;
                        return (
                          <button
                            key={t.id}
                            onClick={() => playBgmTrack(t.id)}
                            aria-pressed={playing}
                            className={`w-full flex items-center gap-3 p-3 rounded-2xl border text-left transition ${
                              playing
                                ? 'bg-[#fdd69f] border-[#fdd69f] shadow-lg shadow-black/30'
                                : selected
                                  ? 'bg-[#4a3424] border-[#fdd69f]/50'
                                  : 'bg-[#1f140d] border-[#fdd69f]/15 hover:bg-[#4a3424]'
                            }`}
                          >
                            <span
                              className={`w-11 h-11 shrink-0 rounded-xl flex items-center justify-center ${
                                playing ? 'bg-[#312117] text-[#fdd69f]' : 'bg-[#312117] text-[#fdd69f]/80'
                              }`}
                            >
                              {t.icon}
                            </span>
                            <span className="flex-1 min-w-0">
                              <span className={`block text-sm font-black ${playing ? 'text-[#312117]' : 'text-white'}`}>{t.name}</span>
                              <span className={`block text-[11px] truncate ${playing ? 'text-[#312117]/75' : 'text-white/60'}`}>{t.desc}</span>
                            </span>
                            <span
                              className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center ${
                                playing ? 'bg-[#312117] text-[#fdd69f]' : 'bg-[#fdd69f]/10 text-[#fdd69f]'
                              }`}
                            >
                              {playing ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* 再生・停止と音量 */}
                    <div className="bg-[#1f140d] rounded-2xl border border-[#fdd69f]/15 p-3 space-y-3">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={toggleBgm}
                          className={`w-12 h-12 shrink-0 rounded-full flex items-center justify-center transition shadow-lg ${
                            isPlayingBgm ? 'bg-[#4a3424] text-[#fdd69f] border border-[#fdd69f]/60' : 'bg-[#fdd69f] text-[#312117] hover:bg-[#ffe3b8]'
                          }`}
                          aria-label={isPlayingBgm ? 'BGMを停止' : 'BGMを再生'}
                        >
                          {isPlayingBgm ? <Pause size={20} /> : <Play size={20} className="ml-0.5" />}
                        </button>
                        <div className="min-w-0">
                          <p className="text-[10px] text-white/55">{isPlayingBgm ? '再生中' : '停止中'}</p>
                          <p className="text-sm font-black text-white truncate">{bgmName(bgmType)}</p>
                        </div>
                      </div>
                      <label className="flex items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => setBgmVolume(bgmVolume > 0 ? 0 : 0.6)}
                          className="text-[#fdd69f] shrink-0"
                          aria-label={bgmVolume > 0 ? 'ミュート' : 'ミュート解除'}
                        >
                          {bgmVolume > 0 ? <Volume2 size={18} /> : <VolumeX size={18} />}
                        </button>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={5}
                          value={Math.round(bgmVolume * 100)}
                          onChange={(e) => setBgmVolume(Number(e.target.value) / 100)}
                          className="bgm-volume flex-1"
                          aria-label="音量"
                        />
                        <span className="w-9 text-right text-[11px] font-bold text-white/80">{Math.round(bgmVolume * 100)}%</span>
                      </label>
                    </div>

                    <p className="text-[10px] text-white/45 text-center">
                      冒険画面の下にある <Music size={10} className="inline -mt-0.5 text-[#fdd69f]" /> ボタンでも再生・停止できます
                    </p>
                  </div>
                )}

                {/* プレイヤープロファイルタブ */}
                {activeTab === 'profile' && (
                  <div className="bg-[#312117]/90 rounded-3xl p-6 shadow-xl border border-[#fdd69f]/20 space-y-4">
                    <h2 className="text-base font-bold text-white flex items-center gap-2">
                      <User size={18} className="text-[#fdd69f]" /> 冒険者プロファイル
                    </h2>

                    <div className="p-4 bg-[#1f140d] rounded-2xl border border-[#fdd69f]/15 space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-white/50">プレイヤー名:</span>
                        <span className="font-bold text-white">{user ? user.displayName || 'ログイン中' : 'ゲスト冒険者'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/50">参加者ID:</span>
                        <span className="font-mono font-bold text-white">{getParticipantId() || '未入力'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/50">アカウントID:</span>
                        <span className="font-mono text-white/65">{user ? user.uid : 'anonymous'}</span>
                      </div>
                    </div>

                    <div className="space-y-2 pt-2">
                      <button
                        onClick={() => {
                          if (isActive) {
                            alert('計測中はモードを変更できません。一度一時停止してください。');
                            return;
                          }
                          onResetMode?.();
                        }}
                        className="w-full py-3 bg-[#1f140d] hover:bg-[#4a3424] text-white font-bold rounded-2xl transition text-xs flex items-center justify-center gap-2 border border-[#fdd69f]/15"
                      >
                        <RefreshCw size={16} />
                        モードを再選択する（スタート画面へ）
                      </button>

                      <button
                        onClick={() => onOpenAdmin?.()}
                        className="w-full py-3 bg-[#4a3424]/60 hover:bg-[#4a3424] text-white font-bold rounded-2xl transition text-xs flex items-center justify-center gap-2 border border-[#fdd69f]/50"
                      >
                        <Lock size={16} />
                        管理者用分析ページ（管理者アカウント限定）
                      </button>
                    </div>
                  </div>
                )}

          </main>
        </div>
      )}

      {/* モバイル用ボトムナビゲーション */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#312117]/90 backdrop-blur-md border-t border-[#fdd69f]/20 p-2 flex justify-around items-center z-30">
        <button onClick={() => setActiveTab('timer')} className={`flex flex-col items-center gap-1 p-2 text-[10px] font-bold ${activeTab === 'timer' ? 'text-[#fdd69f]' : 'text-[#fdd69f]/45'}`}>
          <Sparkles size={16} /> <span>冒険</span>
        </button>
        <button onClick={() => setActiveTab('todo')} className={`flex flex-col items-center gap-1 p-2 text-[10px] font-bold ${activeTab === 'todo' ? 'text-[#fdd69f]' : 'text-[#fdd69f]/45'}`}>
          <CheckSquare size={16} /> <span>クエスト</span>
        </button>
        <button onClick={() => setActiveTab('stats')} className={`flex flex-col items-center gap-1 p-2 text-[10px] font-bold ${activeTab === 'stats' ? 'text-[#fdd69f]' : 'text-[#fdd69f]/45'}`}>
          <BarChart2 size={16} /> <span>戦績</span>
        </button>
        <button onClick={() => setActiveTab('bgm')} className={`flex flex-col items-center gap-1 p-2 text-[10px] font-bold ${activeTab === 'bgm' ? 'text-[#fdd69f]' : 'text-[#fdd69f]/45'}`}>
          <Music size={16} /> <span>BGM</span>
        </button>
        <button onClick={() => setActiveTab('profile')} className={`flex flex-col items-center gap-1 p-2 text-[10px] font-bold ${activeTab === 'profile' ? 'text-[#fdd69f]' : 'text-[#fdd69f]/45'}`}>
          <User size={16} /> <span>プレイヤー</span>
        </button>
      </nav>
    </div>
  );
};

export default GamifiedApp;