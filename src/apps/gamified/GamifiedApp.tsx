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
  Heart,
  RefreshCw,
  Lock
} from 'lucide-react';
import confetti from 'canvas-confetti';
import ForestBackground from './ForestBackground';
import CampScene from './CampScene';
import './GameStage.css';
import GameStats from './GameStats';
import { studyStreak } from './gameStatsUtils';
import { trackEvent } from '../../lib/researchEvents';
import { useScreenTracking } from '../../lib/useResearchTracking';
import { useBgm } from '../../lib/useBgm';
import walkSheetUrl from '../../assets/character/walk_sheet.png';
import sitUrl from '../../assets/character/sit.png';

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
  const [lifeTokens, setLifeTokens] = useState(1);
  const [lastStudyTime, setLastStudyTime] = useState<number>(Date.now());
  const maxExp = level * 100;

  // 3. タイマー関連ステート
  const [seconds, setSeconds] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [subject, setSubject] = useState('英語');
  const [memo, setMemo] = useState('');

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
  const { isPlaying: isPlayingBgm, track: bgmType, toggle: toggleBgm, select: selectBgm } = useBgm<'cyber' | 'lofi' | 'rain'>(
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

    const savedLevel = localStorage.getItem('gamified_level');
    let currentLevel = 1;
    if (savedLevel) {
      currentLevel = Number(savedLevel);
      setLevel(currentLevel);
    }

    const savedExp = localStorage.getItem('gamified_exp');
    if (savedExp) setExp(Number(savedExp));


    const savedTokens = localStorage.getItem('gamified_life_tokens');
    if (savedTokens) setLifeTokens(Number(savedTokens));

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
    setExp((prevExp) => {
      setLevel((prevLevel) => {
        let currentExp = prevExp + gainedExp;
        let currentLevel = prevLevel;
        let leveledUp = false;

        while (currentExp >= currentLevel * 100) {
          currentExp -= currentLevel * 100;
          currentLevel += 1;
          leveledUp = true;
        }

        localStorage.setItem('gamified_level', currentLevel.toString());
        localStorage.setItem('gamified_exp', currentExp.toString());

        if (leveledUp) {
          confetti({
            particleCount: 120,
            spread: 80,
            origin: { y: 0.6 }
          });
          alert(`🎉 レベルアップ！ Lv.${currentLevel} になりました！`);
        }

        return currentLevel;
      });

      let tempLevel = level;
      let tempExp = prevExp + gainedExp;
      while (tempExp >= tempLevel * 100) {
        tempExp -= tempLevel * 100;
        tempLevel += 1;
      }
      return tempExp;
    });
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
    if (seconds < 3) {
      alert('3秒以上の計測のみ保存されます');
      return;
    }

    const durationMinutes = Math.max(1, Math.round(seconds / 60));
    const timeExp = durationMinutes * 20;

    const newLog: StudyLog = {
      id: Date.now().toString(),
      subject,
      durationMinutes,
      expGained: timeExp,
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
    const totalExpGained = timeExp + questExp;

    if (newlyCompletedCount > 0) {
      alert(`🎯 【自動達成】条件を達成したクエストが ${newlyCompletedCount} 件クリアされました！ (+${questExp} EXP)\n⏱️ 学習時間報酬 (+${timeExp} EXP)\n合計: +${totalExpGained} EXP 獲得！`);
    } else {
      alert(`⏱️ 学習時間報酬として +${timeExp} EXP を獲得しました！`);
    }

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

    setIsActive(false);
    setSeconds(0);
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
    : seconds > 0
      ? '一時停止中（成果を記録できます）'
      : 'キャンプで休憩中… 「学習開始」で冒険に出発！';

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
              <div className="flex justify-between text-[9px] font-bold text-[#fdd69f]">
                <span className="flex items-center gap-0.5"><Zap size={9} className="text-[#fdd69f]" /> EXP</span>
                <span>{exp} / {maxExp}</span>
              </div>
              <div className="h-2 mt-0.5 w-full bg-[#312117] rounded-full overflow-hidden border border-[#fdd69f]/30">
                <div
                  className="h-full bg-[#fdd69f] rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, (exp / maxExp) * 100)}%` }}
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
              <Heart size={14} className="fill-[#fdd69f] text-[#fdd69f]" />
              <span>× {lifeTokens}</span>
            </div>
            <div className="game-glass flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-bold text-[#fdd69f]">
              <Flame size={14} className="fill-[#fdd69f] text-[#fdd69f] animate-pulse" />
              <span>{studyStreak(logs)} 日</span>
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
              <p className="text-[10px] text-white/85 mt-1 flex items-center justify-center gap-1">
                <Zap size={10} className="text-[#fdd69f]" /> 1分 = +20 EXP ＋ クエスト達成で +50 EXP
              </p>
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
                onClick={() => {
                  if (seconds > 0) trackEvent('timer_reset', { label: subject, seconds });
                  setIsActive(false);
                  setSeconds(0);
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
                  <GameStats level={level} exp={exp} maxExp={maxExp} lifeTokens={lifeTokens} logs={logs} tasks={tasks} />
                )}

                {/* BGMタブ */}
                {activeTab === 'bgm' && (
                  <div className="bg-[#312117]/90 rounded-3xl p-6 shadow-xl border border-[#fdd69f]/20 space-y-4 text-center">
                    <h2 className="text-base font-bold text-white flex items-center justify-center gap-2">
                      <Music size={18} className="text-[#fdd69f]" /> ゾーン突入 BGM
                    </h2>
                    <p className="text-xs text-white/65">冒険の没入感を極限まで高めます</p>

                    <div className="grid grid-cols-3 gap-2 pt-2">
                      {[
                        { id: 'cyber', label: 'サイバー ⚡' },
                        { id: 'lofi', label: 'Lo-Fi 🎧' },
                        { id: 'rain', label: 'ディープ雨 🌧️' },
                      ].map((item) => (
                        <button
                          key={item.id}
                          onClick={() => selectBgm(item.id as 'cyber' | 'lofi' | 'rain')}
                          className={`py-3 px-2 rounded-2xl text-xs font-bold transition border ${
                            bgmType === item.id 
                              ? 'bg-[#fdd69f] text-[#312117] border-[#fdd69f] shadow-lg shadow-black/30' 
                              : 'bg-[#1f140d] text-white/65 border-[#fdd69f]/15 hover:bg-[#4a3424]'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>

                    <button
                      onClick={toggleBgm}
                      className={`w-full py-3.5 rounded-2xl font-black transition flex items-center justify-center gap-2 shadow-lg ${
                        isPlayingBgm ? 'bg-[#4a3424] text-white border border-[#fdd69f]/60 hover:bg-[#5a4030]' : 'bg-[#fdd69f] text-[#312117] hover:bg-[#ffe3b8]'
                      }`}
                    >
                      {isPlayingBgm ? <VolumeX size={18} /> : <Volume2 size={18} />}
                      {isPlayingBgm ? 'サウンド停止' : 'ゾーンBGM再生'}
                    </button>
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