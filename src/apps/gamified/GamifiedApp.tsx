import React, { useState, useEffect, useRef } from 'react';
import { 
  Flame, 
  Trophy, 
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
  Heart
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { db } from '../../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

interface GamifiedAppProps {
  user?: any;
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

export const GamifiedApp: React.FC<GamifiedAppProps> = ({ user }) => {
  // 1. タブ管理
  const [activeTab, setActiveTab] = useState<'timer' | 'todo' | 'stats' | 'bgm' | 'profile'>('timer');

  // 2. ゲーミフィケーション・ステート
  const [level, setLevel] = useState(1);
  const [exp, setExp] = useState(0);
  const [streak, setStreak] = useState(1);
  const [lifeTokens, setLifeTokens] = useState(1);
  const [lastStudyTime, setLastStudyTime] = useState<number>(Date.now());
  const maxExp = level * 100;

  // 3. タイマー関連ステート
  const [seconds, setSeconds] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [subject, setSubject] = useState('英語');
  const [memo, setMemo] = useState('');

  // 4. データステート
  const [logs, setLogs] = useState<StudyLog[]>([]);
  const [tasks, setTasks] = useState<Task[]>([
    { id: 'daily_login', title: 'デイリーログインを完了する（自動）', completed: false, isAutomatic: true },
    { id: 'timer_1min', title: '英語の学習を1分以上行う（確認用）', completed: false, isAutomatic: true, subject: '英語', targetMinutes: 1 },
  ]);
  
  // 新規クエスト作成用ステート
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskSubject, setNewTaskSubject] = useState('英語');
  const [newTaskMinutes, setNewTaskMinutes] = useState(1);

  // 5. BGM関連ステート
  const [isPlayingBgm, setIsPlayingBgm] = useState(false);
  const [bgmType, setBgmType] = useState<'cyber' | 'lofi' | 'rain'>('cyber');

  // 6. アバター歩行アニメーション用フレーム管理
  const [walkFrame, setWalkFrame] = useState(1);

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

    const savedStreak = localStorage.getItem('gamified_streak');
    if (savedStreak) setStreak(Number(savedStreak));

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

    const initialTasks: Task[] = [
      { id: 'daily_login', title: 'デイリーログインを完了する（自動）', completed: false, isAutomatic: true },
      { id: 'timer_1min', title: '英語の学習を1分以上行う（確認用）', completed: false, isAutomatic: true, subject: '英語', targetMinutes: 1 },
    ];
    
    let loadedTasks = initialTasks;
    const savedTasks = localStorage.getItem('gamified_tasks');
    if (savedTasks) {
      try { 
        loadedTasks = JSON.parse(savedTasks);
      } catch (e) {
        loadedTasks = initialTasks;
      }
    }

    if (lastLoginDate !== todayStr) {
      localStorage.setItem('gamified_last_login_date', todayStr);

      loadedTasks = loadedTasks.map(t => {
        if (t.id === 'daily_login') {
          return { ...t, completed: true };
        }
        return t;
      });

      addExp(50);
      alert(`🌟 デイリーログインボーナス！ 本日最初のログインで +50 EXP を獲得しました！`);
    }

    setTasks(loadedTasks);
    localStorage.setItem('gamified_tasks', JSON.stringify(loadedTasks));
  }, []);

  // タイマー＆歩行アニメーションのループ処理
  useEffect(() => {
    let interval: any = null;
    let walkInterval: any = null;

    if (isActive) {
      interval = setInterval(() => {
        setSeconds((sec) => sec + 1);
      }, 1000);

      walkInterval = setInterval(() => {
        setWalkFrame((prev) => (prev % 5) + 1);
      }, 150);
    } else {
      walkInterval = setInterval(() => {
        setWalkFrame((prev) => (prev % 5) + 1);
      }, 300);
    }

    return () => {
      clearInterval(interval);
      clearInterval(walkInterval);
    };
  }, [isActive]);

  // 経験値加算とレベルアップ判定（完全に二重加算を防ぐ単一ループ処理）
  const addExp = (gainedExp: number) => {
    setExp((prevExp) => {
      setLevel((prevLevel) => {
        let currentExp = prevExp + gainedExp;
        let currentLevel = prevLevel;
        let leveledUp = false;

        // レベルアップ判定（複数レベルアップにも対応しつつ確実に1回だけ通知）
        while (currentExp >= currentLevel * 100) {
          currentExp -= currentLevel * 100;
          currentLevel += 1;
          leveledUp = true;
        }

        // ステート更新後にローカルストレージへ保存
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

      // exp自身の新しい値を返す
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
    
    // 1. 時間経過によるEXP（1分あたり20 EXP）
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

    // 2. クエスト自動達成判定
    const newlyCompletedCount = checkAndUpdateAutomaticTasks(subject, updatedLogs);
    const questExp = 50 * newlyCompletedCount;

    // 合計獲得EXP（時間経過EXP ＋ クエスト達成EXP）
    const totalExpGained = timeExp + questExp;

    if (newlyCompletedCount > 0) {
      alert(`🎯 【自動達成】条件を達成したクエストが ${newlyCompletedCount} 件クリアされました！ (+${questExp} EXP)\n⏱️ 学習時間報酬 (+${timeExp} EXP)\n合計: +${totalExpGained} EXP 獲得！`);
    } else {
      alert(`⏱️ 学習時間報酬として +${timeExp} EXP を獲得しました！`);
    }

    // 正確に合計値だけを1回加算する
    addExp(totalExpGained);

    try {
      let deviceId = localStorage.getItem('device_id');
      if (!deviceId) {
        deviceId = 'dev_' + Math.random().toString(36).substring(2, 10);
        localStorage.setItem('device_id', deviceId);
      }

      await addDoc(collection(db, 'researchLogs'), {
        uid: user ? user.uid : 'anonymous',
        deviceId: deviceId,
        mode: 'gamified',
        subject: subject,
        durationMinutes: durationMinutes,
        memo: memo,
        createdAt: serverTimestamp(),
        userAgent: navigator.userAgent
      });
    } catch (e) {
      console.error('Firestore保存エラー:', e);
    }

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

    const updated = [...tasks, newTask];
    setTasks(updated);
    localStorage.setItem('gamified_tasks', JSON.stringify(updated));
    setNewTaskTitle('');
    setNewTaskMinutes(1);
  };

  const deleteTask = (id: string) => {
    const updated = tasks.filter(t => t.id !== id);
    setTasks(updated);
    localStorage.setItem('gamified_tasks', JSON.stringify(updated));
  };

  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getStageBackground = () => {
    if (level < 3) return 'from-emerald-950 via-slate-900 to-slate-950 border-emerald-500/30';
    if (level < 6) return 'from-amber-950 via-slate-900 to-slate-950 border-amber-500/30';
    if (level < 10) return 'from-indigo-950 via-slate-900 to-slate-950 border-indigo-500/30';
    return 'from-purple-950 via-fuchsia-950 to-slate-950 border-purple-500/30';
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-28 md:pb-12 antialiased selection:bg-purple-600 selection:text-white">
      
      <header className="sticky top-0 z-20 bg-slate-900/85 backdrop-blur-md border-b border-purple-900/40 p-4">
        <div className="max-w-md md:max-w-6xl mx-auto space-y-2">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-xl shadow-lg shadow-purple-500/30">
                <Trophy size={18} className="text-yellow-300" />
              </div>
              <span className="text-sm font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">
                LV.{level}
              </span>
            </div>

            <nav className="hidden md:flex items-center gap-6 text-xs font-bold text-slate-400">
              <button onClick={() => setActiveTab('timer')} className={`hover:text-purple-400 transition ${activeTab === 'timer' ? 'text-purple-400 border-b-2 border-purple-400 pb-1' : ''}`}>冒険</button>
              <button onClick={() => setActiveTab('todo')} className={`hover:text-purple-400 transition ${activeTab === 'todo' ? 'text-purple-400 border-b-2 border-purple-400 pb-1' : ''}`}>クエスト</button>
              <button onClick={() => setActiveTab('stats')} className={`hover:text-purple-400 transition ${activeTab === 'stats' ? 'text-purple-400 border-b-2 border-purple-400 pb-1' : ''}`}>戦績</button>
              <button onClick={() => setActiveTab('bgm')} className={`hover:text-purple-400 transition ${activeTab === 'bgm' ? 'text-purple-400 border-b-2 border-purple-400 pb-1' : ''}`}>BGM</button>
              <button onClick={() => setActiveTab('profile')} className={`hover:text-purple-400 transition ${activeTab === 'profile' ? 'text-purple-400 border-b-2 border-purple-400 pb-1' : ''}`}>プレイヤー</button>
            </nav>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-red-950/50 border border-red-500/30 px-2.5 py-1 rounded-full text-xs font-bold text-red-400">
                <Heart size={14} className="fill-red-500 text-red-500" />
                <span>× {lifeTokens}</span>
              </div>

              <div className="flex items-center gap-1.5 bg-orange-950/50 border border-orange-500/30 px-3 py-1 rounded-full text-xs font-bold text-orange-400">
                <Flame size={14} className="fill-orange-500 text-orange-500 animate-pulse" />
                <span>{streak} 日</span>
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-[10px] font-semibold text-slate-400">
              <span className="flex items-center gap-1"><Zap size={10} className="text-yellow-400" /> EXP</span>
              <span>{exp} / {maxExp}</span>
            </div>
            <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden p-0.5 border border-slate-700">
              <div 
                className="h-full bg-gradient-to-r from-purple-500 via-pink-500 to-yellow-400 rounded-full transition-all duration-300 shadow-sm"
                style={{ width: `${Math.min(100, (exp / maxExp) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-md md:max-w-6xl mx-auto p-4 space-y-6 pt-4">

        {activeTab === 'timer' ? (
          <div className="flex flex-col md:flex-row gap-6 items-stretch">
            
            <div className="w-full md:w-3/4 flex flex-col">
              <div className={`flex-1 bg-gradient-to-b ${getStageBackground()} rounded-3xl p-5 shadow-xl border relative overflow-hidden flex flex-col items-center justify-center space-y-3`}>
                
                <div className="w-full flex-1 min-h-[320px] md:min-h-[420px] bg-slate-950/80 rounded-2xl border border-slate-800 relative overflow-hidden flex items-center justify-center shadow-inner">
                  
                  {!isActive ? (
                    <img 
                      src="/home_bg.jpg" 
                      alt="ステージ背景" 
                      className="absolute inset-0 w-full h-full object-cover filter brightness-90"
                    />
                  ) : (
                    <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#a855f7_1px,transparent_1px)] [background-size:16px_16px] animate-pulse" />
                  )}

                  {isActive && (
                    <div className="z-10 flex flex-col items-center">
                      <img 
                        src={
                          walkFrame === 1 ? '/tankyu_1.png' :
                          walkFrame === 2 ? '/tankyu_2.png' :
                          walkFrame === 3 ? '/tankyu_3.png' :
                          walkFrame === 4 ? '/tankyu_4.png' : '/tankyu_5.png'
                        } 
                        alt="冒険者アバター" 
                        className="w-48 h-48 md:w-64 md:h-64 object-contain filter drop-shadow-[0_0_15px_rgba(168,85,247,0.5)]"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="w-full md:w-1/4 flex flex-col">
              <div className="bg-slate-900/90 rounded-3xl p-6 shadow-xl border border-purple-500/20 text-center space-y-4 flex-1 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-black text-purple-400 uppercase tracking-widest flex items-center justify-center gap-1">
                    <Sparkles size={12} /> 学習クエストタイマー
                  </span>

                  <div className="flex justify-center flex-wrap gap-1.5 mt-3">
                    {['国語', '数学', '英語', '理科', '社会', 'その他'].map((sub) => (
                      <button
                        key={sub}
                        onClick={() => setSubject(sub)}
                        className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition ${
                          subject === sub 
                            ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/40 border border-purple-400' 
                            : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                        }`}
                      >
                        {sub}
                      </button>
                    ))}
                  </div>

                  <div className="py-6 bg-slate-950/80 rounded-2xl border border-purple-500/30 flex flex-col items-center justify-center shadow-inner relative overflow-hidden mt-4">
                    <div className="absolute inset-0 bg-purple-600/5 blur-3xl rounded-full" />
                    <span className="text-4xl md:text-5xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white to-slate-300 font-mono z-10">
                      {formatTime(seconds)}
                    </span>
                    <p className="text-[10px] text-purple-400/80 mt-2 font-medium z-10 flex items-center gap-1">
                      <Zap size={10} className="text-yellow-400" /> 1分 = +20 EXP ＋ クエスト達成で +50 EXP
                    </p>
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <div className="flex gap-2">
                    <button
                      onClick={() => setIsActive(!isActive)}
                      className={`flex-1 py-3.5 rounded-2xl font-black text-white transition flex items-center justify-center gap-2 shadow-lg text-xs ${
                        isActive 
                          ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/30' 
                          : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 shadow-purple-600/40'
                      }`}
                    >
                      {isActive ? <Pause size={16} /> : <Play size={16} />}
                      {isActive ? '一時停止' : '学習開始'}
                    </button>
                    
                    <button
                      onClick={() => { setIsActive(false); setSeconds(0); }}
                      className="p-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-2xl transition border border-slate-700"
                      title="リセット"
                    >
                      <RotateCcw size={16} />
                    </button>
                  </div>

                  {seconds > 0 && !isActive && (
                    <div className="space-y-2 pt-2 border-t border-slate-800">
                      <input
                        type="text"
                        value={memo}
                        onChange={(e) => setMemo(e.target.value)}
                        placeholder="成果メモ（例: 漢字の復習）"
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-purple-500"
                      />
                      <button
                        onClick={handleSaveLog}
                        className="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-emerald-600/30"
                      >
                        成果を記録してEXP獲得
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

          </div>
        ) : (
          <div className="w-full">
            {activeTab === 'todo' && (
              <div className="bg-slate-900/90 rounded-3xl p-6 shadow-xl border border-purple-500/20 space-y-4">
                <div className="flex justify-between items-center">
                  <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                    <CheckSquare size={18} className="text-purple-400" /> クエストボード
                  </h2>
                  <span className="text-[10px] text-purple-400 bg-purple-950/60 border border-purple-500/30 px-2.5 py-1 rounded-full">
                    同一教科の目標時間達成で自動クリア (+50 EXP)
                  </span>
                </div>

                <form onSubmit={handleAddTask} className="bg-slate-950/80 p-3.5 rounded-2xl border border-slate-800 space-y-3">
                  <p className="text-xs font-bold text-purple-300 flex items-center gap-1">
                    <Plus size={14} /> 新しいクエストを作成
                  </p>
                  
                  <input
                    type="text"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    placeholder="クエスト名（例: 数学の基礎固め）"
                    className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-purple-500"
                  />

                  <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
                    <div className="flex items-center gap-1.5 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
                      <span className="text-[10px] text-slate-400 font-bold shrink-0">教科:</span>
                      {['国語', '数学', '英語', '理科', '社会', 'その他'].map((sub) => (
                        <button
                          key={sub}
                          type="button"
                          onClick={() => setNewTaskSubject(sub)}
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold transition shrink-0 ${
                            newTaskSubject === sub 
                              ? 'bg-purple-600 text-white border border-purple-400' 
                              : 'bg-slate-900 text-slate-400 border border-slate-800 hover:bg-slate-800'
                          }`}
                        >
                          {sub}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-2 w-full md:w-auto justify-end">
                      <span className="text-[10px] text-slate-400 font-bold shrink-0">目標時間(分):</span>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={newTaskMinutes}
                        onChange={(e) => setNewTaskMinutes(Number(e.target.value))}
                        className="w-20 px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 text-center focus:outline-none focus:border-purple-500"
                      />
                      <button
                        type="submit"
                        className="px-4 py-2 bg-purple-600 text-white rounded-xl hover:bg-purple-500 transition shadow-md shadow-purple-600/30 text-xs font-bold shrink-0"
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
                          : 'bg-purple-950/20 border-purple-500/30'
                      }`}
                    >
                      <div className="flex items-center gap-3 text-xs flex-1">
                        <input
                          type="checkbox"
                          checked={task.completed}
                          disabled={true}
                          className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 bg-slate-900 border-slate-700 opacity-75 cursor-not-allowed"
                        />
                        <div className="flex flex-col gap-0.5">
                          <span className={task.completed ? 'line-through text-slate-500' : 'text-slate-200 font-semibold'}>
                            {task.title}
                          </span>
                          <div className="flex items-center gap-2 text-[10px]">
                            {task.subject && (
                              <span className="text-purple-300 bg-purple-950/80 px-1.5 py-0.5 rounded border border-purple-500/30">
                                教科: {task.subject}
                              </span>
                            )}
                            {task.targetMinutes !== undefined && (
                              <span className="text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                                目標: {task.targetMinutes}分以上
                              </span>
                            )}
                            <span className="text-purple-400">※自動判定</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-yellow-400 font-bold bg-yellow-400/10 border border-yellow-400/20 px-2 py-0.5 rounded-full">
                          +50 EXP
                        </span>
                        <button
                          onClick={() => deleteTask(task.id)}
                          className="text-slate-500 hover:text-red-400 transition"
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

            {activeTab === 'stats' && (
              <div className="space-y-4">
                <div className="bg-slate-900/90 rounded-3xl p-6 shadow-xl border border-purple-500/20 space-y-3">
                  <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                    <BarChart2 size={18} className="text-purple-400" /> 冒険戦績サマリー
                  </h2>
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 text-center">
                      <p className="text-[10px] text-slate-400 font-bold uppercase">現在レベル</p>
                      <p className="text-2xl font-black text-purple-400 mt-1">Lv.{level}</p>
                    </div>
                    <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 text-center">
                      <p className="text-[10px] text-slate-400 font-bold uppercase">救済アイテム</p>
                      <p className="text-2xl font-black text-red-400 mt-1">× {lifeTokens}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-900/90 rounded-3xl p-6 shadow-xl border border-purple-500/20 space-y-3">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                    冒険・学習ログ履歴
                  </h3>
                  <div className="space-y-2">
                    {logs.length === 0 ? (
                      <p className="text-xs text-slate-500 text-center py-4">まだログがありません</p>
                    ) : (
                      logs.map((log) => (
                        <div key={log.id} className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex justify-between items-center text-xs">
                          <div>
                            <span className="font-bold text-purple-300">{log.subject}</span>
                            <p className="text-[10px] text-slate-500">{log.createdAt}</p>
                            {log.memo && <p className="text-[10px] text-slate-400 mt-1">memo: {log.memo}</p>}
                          </div>
                          <div className="text-right">
                            <span className="font-black text-slate-200">{log.durationMinutes} 分</span>
                            <p className="text-[10px] text-yellow-400 font-bold">+{log.expGained} EXP</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'bgm' && (
              <div className="bg-slate-900/90 rounded-3xl p-6 shadow-xl border border-purple-500/20 space-y-4 text-center">
                <h2 className="text-base font-bold text-slate-100 flex items-center justify-center gap-2">
                  <Music size={18} className="text-purple-400" /> ゾーン突入 BGM
                </h2>
                <p className="text-xs text-slate-400">冒険の没入感を極限まで高めます</p>

                <div className="grid grid-cols-3 gap-2 pt-2">
                  {[
                    { id: 'cyber', label: 'サイバー ⚡' },
                    { id: 'lofi', label: 'Lo-Fi 🎧' },
                    { id: 'rain', label: 'ディープ雨 🌧️' },
                  ].map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setBgmType(item.id as any)}
                      className={`py-3 px-2 rounded-2xl text-xs font-bold transition border ${
                        bgmType === item.id 
                          ? 'bg-purple-600 text-white border-purple-400 shadow-lg shadow-purple-600/30' 
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setIsPlayingBgm(!isPlayingBgm)}
                  className={`w-full py-3.5 rounded-2xl font-black text-white transition flex items-center justify-center gap-2 shadow-lg ${
                    isPlayingBgm ? 'bg-amber-600 hover:bg-amber-500' : 'bg-purple-600 hover:bg-purple-500'
                  }`}
                >
                  {isPlayingBgm ? <VolumeX size={18} /> : <Volume2 size={18} />}
                  {isPlayingBgm ? 'サウンド停止' : 'ゾーンBGM再生'}
                </button>
              </div>
            )}

            {activeTab === 'profile' && (
              <div className="bg-slate-900/90 rounded-3xl p-6 shadow-xl border border-purple-500/20 space-y-4">
                <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <User size={18} className="text-purple-400" /> 冒険者プロファイル
                </h2>

                <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">プレイヤー名:</span>
                    <span className="font-bold text-slate-200">{user ? user.displayName || 'ログイン中' : 'ゲスト冒険者'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">アカウント:</span>
                    <span className="font-mono text-slate-400">{user ? user.email : '未連携'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">デスセーブ状態:</span>
                    <span className="font-bold text-emerald-400">生存中 (保護アイテム {lifeTokens}個)</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

      </main>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-900/90 backdrop-blur-md border-t border-purple-900/40 py-2 px-4 z-30">
        <div className="max-w-md mx-auto flex justify-around items-center">
          <button
            onClick={() => setActiveTab('timer')}
            className={`flex flex-col items-center gap-1 transition ${activeTab === 'timer' ? 'text-purple-400 font-bold' : 'text-slate-500'}`}
          >
            <Clock size={20} />
            <span className="text-[10px]">冒険</span>
          </button>

          <button
            onClick={() => setActiveTab('todo')}
            className={`flex flex-col items-center gap-1 transition ${activeTab === 'todo' ? 'text-purple-400 font-bold' : 'text-slate-500'}`}
          >
            <CheckSquare size={20} />
            <span className="text-[10px]">クエスト</span>
          </button>

          <button
            onClick={() => setActiveTab('stats')}
            className={`flex flex-col items-center gap-1 transition ${activeTab === 'stats' ? 'text-purple-400 font-bold' : 'text-slate-500'}`}
          >
            <BarChart2 size={20} />
            <span className="text-[10px]">戦績</span>
          </button>

          <button
            onClick={() => setActiveTab('bgm')}
            className={`flex flex-col items-center gap-1 transition ${activeTab === 'bgm' ? 'text-purple-400 font-bold' : 'text-slate-500'}`}
          >
            <Music size={20} />
            <span className="text-[10px]">BGM</span>
          </button>

          <button
            onClick={() => setActiveTab('profile')}
            className={`flex flex-col items-center gap-1 transition ${activeTab === 'profile' ? 'text-purple-400 font-bold' : 'text-slate-500'}`}
          >
            <User size={20} />
            <span className="text-[10px]">プレイヤー</span>
          </button>
        </div>
      </nav>

    </div>
  );
};

export default GamifiedApp;