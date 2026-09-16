import React, { useState, useEffect } from 'react';
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
  Sparkles 
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
}

export const GamifiedApp: React.FC<GamifiedAppProps> = ({ user }) => {
  // 1. タブ管理 (timer | todo | stats | bgm | profile)
  const [activeTab, setActiveTab] = useState<'timer' | 'todo' | 'stats' | 'bgm' | 'profile'>('timer');

  // 2. ゲーミフィケーション・ステート
  const [level, setLevel] = useState(1);
  const [exp, setExp] = useState(0);
  const [streak, setStreak] = useState(1);
  const maxExp = level * 100;

  // 3. タイマー関連ステート
  const [seconds, setSeconds] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [subject, setSubject] = useState('プログラミング');
  const [memo, setMemo] = useState('');

  // 4. データステート
  const [logs, setLogs] = useState<StudyLog[]>([]);
  const [tasks, setTasks] = useState<Task[]>([
    { id: '1', title: 'Vue / React の比較調査', completed: true },
    { id: '2', title: 'Firebase Auth の設定', completed: false },
  ]);
  const [newTaskTitle, setNewTaskTitle] = useState('');

  // 5. BGM関連ステート
  const [isPlayingBgm, setIsPlayingBgm] = useState(false);
  const [bgmType, setBgmType] = useState<'cyber' | 'lofi' | 'rain'>('cyber');

  // ローカルストレージからの読み込み
  useEffect(() => {
    const savedLevel = localStorage.getItem('gamified_level');
    if (savedLevel) setLevel(Number(savedLevel));

    const savedExp = localStorage.getItem('gamified_exp');
    if (savedExp) setExp(Number(savedExp));

    const savedStreak = localStorage.getItem('gamified_streak');
    if (savedStreak) setStreak(Number(savedStreak));

    const savedLogs = localStorage.getItem('gamified_study_logs');
    if (savedLogs) {
      try { setLogs(JSON.parse(savedLogs)); } catch (e) {}
    }

    const savedTasks = localStorage.getItem('gamified_tasks');
    if (savedTasks) {
      try { setTasks(JSON.parse(savedTasks)); } catch (e) {}
    }
  }, []);

  // タイマーのカウント処理
  useEffect(() => {
    let interval: any = null;
    if (isActive) {
      interval = setInterval(() => {
        setSeconds((sec) => sec + 1);
      }, 1000);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [isActive]);

  // EXP・レベルアップ計算処理
  const addExp = (gainedExp: number) => {
    let newExp = exp + gainedExp;
    let newLevel = level;
    let currentMaxExp = newLevel * 100;
    let leveledUp = false;

    while (newExp >= currentMaxExp) {
      newExp -= currentMaxExp;
      newLevel += 1;
      currentMaxExp = newLevel * 100;
      leveledUp = true;
    }

    setLevel(newLevel);
    setExp(newExp);
    localStorage.setItem('gamified_level', newLevel.toString());
    localStorage.setItem('gamified_exp', newExp.toString());

    if (leveledUp) {
      // ド派手な紙吹雪演出
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 }
      });
      alert(`🎉 レベルアップ！ Lv.${newLevel} になりました！`);
    }
  };

  // タイマー停止＆ログ保存
  const handleSaveLog = async () => {
    if (seconds < 5) {
      alert('5秒以上の計測のみ保存されます');
      return;
    }

    const durationMinutes = Math.max(1, Math.round(seconds / 60));
    const gainedExp = durationMinutes * 10; // 1分 = 10 EXP

    const newLog: StudyLog = {
      id: Date.now().toString(),
      subject,
      durationMinutes,
      expGained: gainedExp,
      createdAt: new Date().toLocaleString('ja-JP'),
      memo
    };

    const updatedLogs = [newLog, ...logs];
    setLogs(updatedLogs);
    localStorage.setItem('gamified_study_logs', JSON.stringify(updatedLogs));

    // EXP加算
    addExp(gainedExp);

    // Firestore への探究データ送信 (researchLogs)
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

    // リセット
    setIsActive(false);
    setSeconds(0);
    setMemo('');
  };

  // タスク追加
  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    const updated = [...tasks, { id: Date.now().toString(), title: newTaskTitle, completed: false }];
    setTasks(updated);
    localStorage.setItem('gamified_tasks', JSON.stringify(updated));
    setNewTaskTitle('');
  };

  // タスク完了切り替え（完了時にEXPボーナス）
  const toggleTask = (id: string) => {
    const updated = tasks.map(t => {
      if (t.id === id) {
        const nextState = !t.completed;
        if (nextState) {
          addExp(20); // タスク完了で 20 EXP 獲得
        }
        return { ...t, completed: nextState };
      }
      return t;
    });
    setTasks(updated);
    localStorage.setItem('gamified_tasks', JSON.stringify(updated));
  };

  // タスク削除
  const deleteTask = (id: string) => {
    const updated = tasks.filter(t => t.id !== id);
    setTasks(updated);
    localStorage.setItem('gamified_tasks', JSON.stringify(updated));
  };

  // 秒数のフォーマット
  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-24 antialiased selection:bg-purple-600 selection:text-white">
      
      {/* ===== ゲーミフィケーション・常時表示ステータスヘッダー ===== */}
      <header className="sticky top-0 z-20 bg-slate-900/80 backdrop-blur-md border-b border-purple-900/40 p-4">
        <div className="max-w-md mx-auto space-y-2">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-xl shadow-lg shadow-purple-500/30">
                <Trophy size={18} className="text-yellow-300" />
              </div>
              <span className="text-sm font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">
                LV.{level}
              </span>
            </div>

            <div className="flex items-center gap-1.5 bg-orange-950/50 border border-orange-500/30 px-3 py-1 rounded-full text-xs font-bold text-orange-400">
              <Flame size={14} className="fill-orange-500 text-orange-500 animate-pulse" />
              <span>{streak} 日ストリーク</span>
            </div>
          </div>

          {/* EXP プログレスバー */}
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

      {/* メインコンテンツエリア */}
      <main className="max-w-md mx-auto p-4 space-y-6 pt-4">

        {/* ===== TAB 1: ゲーミングタイマー ===== */}
        {activeTab === 'timer' && (
          <div className="space-y-6">
            <div className="bg-slate-900/90 rounded-3xl p-6 shadow-xl border border-purple-500/20 text-center space-y-4">
              <span className="text-[10px] font-black text-purple-400 uppercase tracking-widest flex items-center justify-center gap-1">
                <Sparkles size={12} /> Gamified Focus Mode
              </span>

              {/* 科目選択 */}
              <div className="flex justify-center flex-wrap gap-2">
                {['プログラミング', '英語', '数学', '理科', 'クエスト'].map((sub) => (
                  <button
                    key={sub}
                    onClick={() => setSubject(sub)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                      subject === sub 
                        ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/40 border border-purple-400' 
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                    }`}
                  >
                    {sub}
                  </button>
                ))}
              </div>

              {/* ネオンタイマー表示 */}
              <div className="py-10 bg-slate-950/80 rounded-2xl border border-purple-500/30 flex flex-col items-center justify-center shadow-inner relative overflow-hidden">
                <div className="absolute inset-0 bg-purple-600/5 blur-3xl rounded-full" />
                <span className="text-6xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white to-slate-300 font-mono z-10">
                  {formatTime(seconds)}
                </span>
                <p className="text-xs text-purple-400/80 mt-2 font-medium z-10 flex items-center gap-1">
                  <Zap size={12} className="text-yellow-400" /> 1分ごとに +10 EXP 獲得！
                </p>
              </div>

              {/* 操作ボタン */}
              <div className="flex gap-3">
                <button
                  onClick={() => setIsActive(!isActive)}
                  className={`flex-1 py-4 rounded-2xl font-black text-white transition flex items-center justify-center gap-2 shadow-lg ${
                    isActive 
                      ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/30' 
                      : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 shadow-purple-600/40'
                  }`}
                >
                  {isActive ? <Pause size={20} /> : <Play size={20} />}
                  {isActive ? '一時停止' : 'ミッション開始'}
                </button>
                
                <button
                  onClick={() => { setIsActive(false); setSeconds(0); }}
                  className="p-4 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-2xl transition border border-slate-700"
                  title="リセット"
                >
                  <RotateCcw size={20} />
                </button>
              </div>

              {/* メモ＆保存 */}
              {seconds > 0 && !isActive && (
                <div className="pt-4 border-t border-slate-800 space-y-3">
                  <input
                    type="text"
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                    placeholder="クエストの成果を入力（例: 章をクリアした！）"
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-purple-500"
                  />
                  <button
                    onClick={handleSaveLog}
                    className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-emerald-600/30"
                  >
                    EXPを獲得してログを送信
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== TAB 2: クエスト (ToDo) ===== */}
        {activeTab === 'todo' && (
          <div className="bg-slate-900/90 rounded-3xl p-6 shadow-xl border border-purple-500/20 space-y-4">
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <CheckSquare size={18} className="text-purple-400" /> デイリークエスト (ToDo)
            </h2>

            <form onSubmit={handleAddTask} className="flex gap-2">
              <input
                type="text"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="新しいクエスト..."
                className="flex-1 px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-purple-500"
              />
              <button
                type="submit"
                className="p-2.5 bg-purple-600 text-white rounded-xl hover:bg-purple-500 transition shadow-md shadow-purple-600/30"
              >
                <Plus size={18} />
              </button>
            </form>

            <div className="space-y-2 pt-2">
              {tasks.map((task) => (
                <div 
                  key={task.id} 
                  className="flex items-center justify-between p-3 bg-slate-950/60 rounded-xl border border-slate-800"
                >
                  <label className="flex items-center gap-3 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      checked={task.completed}
                      onChange={() => toggleTask(task.id)}
                      className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 bg-slate-900 border-slate-700"
                    />
                    <span className={task.completed ? 'line-through text-slate-500' : 'text-slate-200 font-semibold'}>
                      {task.title}
                    </span>
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-yellow-400 font-bold bg-yellow-400/10 border border-yellow-400/20 px-2 py-0.5 rounded-full">
                      +20 EXP
                    </span>
                    <button
                      onClick={() => deleteTask(task.id)}
                      className="text-slate-500 hover:text-red-400 transition"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===== TAB 3: 戦績・統計 ===== */}
        {activeTab === 'stats' && (
          <div className="space-y-4">
            <div className="bg-slate-900/90 rounded-3xl p-6 shadow-xl border border-purple-500/20 space-y-3">
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <BarChart2 size={18} className="text-purple-400" /> 学習戦績サマリー
              </h2>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 text-center">
                  <p className="text-[10px] text-slate-400 font-bold uppercase">現在レベル</p>
                  <p className="text-2xl font-black text-purple-400 mt-1">Lv.{level}</p>
                </div>
                <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 text-center">
                  <p className="text-[10px] text-slate-400 font-bold uppercase">獲得可能EXP</p>
                  <p className="text-2xl font-black text-yellow-400 mt-1">{exp} EXP</p>
                </div>
              </div>
            </div>

            <div className="bg-slate-900/90 rounded-3xl p-6 shadow-xl border border-purple-500/20 space-y-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                クエストログ履歴
              </h3>
              <div className="space-y-2">
                {logs.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-4">まだバトルログがありません</p>
                ) : (
                  logs.map((log) => (
                    <div key={log.id} className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex justify-between items-center text-xs">
                      <div>
                        <span className="font-bold text-purple-300">{log.subject}</span>
                        <p className="text-[10px] text-slate-500">{log.createdAt}</p>
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

        {/* ===== TAB 4: BGMサウンド ===== */}
        {activeTab === 'bgm' && (
          <div className="bg-slate-900/90 rounded-3xl p-6 shadow-xl border border-purple-500/20 space-y-4 text-center">
            <h2 className="text-base font-bold text-slate-100 flex items-center justify-center gap-2">
              <Music size={18} className="text-purple-400" /> ゾーン突入 BGM
            </h2>
            <p className="text-xs text-slate-400">脳波を調整し、没入感を極限まで高めます</p>

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

        {/* ===== TAB 5: プレイヤー情報 ===== */}
        {activeTab === 'profile' && (
          <div className="bg-slate-900/90 rounded-3xl p-6 shadow-xl border border-purple-500/20 space-y-4">
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <User size={18} className="text-purple-400" /> プレイヤープロファイル
            </h2>

            <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">プレイヤー名:</span>
                <span className="font-bold text-slate-200">{user ? user.displayName || 'ログイン中' : 'ゲストプレイヤー'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">アカウント:</span>
                <span className="font-mono text-slate-400">{user ? user.email : '未連携'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">探究端末ID:</span>
                <span className="font-mono text-slate-400">{localStorage.getItem('device_id') || '未発行'}</span>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* ===== iPhone風 下部5タブナビゲーション（ネオン・ゲーミング仕様） ===== */}
      <nav className="fixed bottom-0 left-0 right-0 bg-slate-900/90 backdrop-blur-md border-t border-purple-900/40 py-2 px-4 z-30">
        <div className="max-w-md mx-auto flex justify-around items-center">
          <button
            onClick={() => setActiveTab('timer')}
            className={`flex flex-col items-center gap-1 transition ${activeTab === 'timer' ? 'text-purple-400 font-bold' : 'text-slate-500'}`}
          >
            <Clock size={20} />
            <span className="text-[10px]">バトル</span>
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