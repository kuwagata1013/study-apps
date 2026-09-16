import React, { useState, useEffect } from 'react';
import { 
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
  Calendar,
  Sparkles
} from 'lucide-react';
import { db } from '../../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

interface SimpleAppProps {
  user?: any;
}

interface StudyLog {
  id: string;
  subject: string;
  durationMinutes: number;
  createdAt: string;
  memo: string;
}

interface Task {
  id: string;
  title: string;
  completed: boolean;
}

export const SimpleApp: React.FC<SimpleAppProps> = ({ user }) => {
  // 1. タブ管理 (timer | todo | stats | bgm | profile)
  const [activeTab, setActiveTab] = useState<'timer' | 'todo' | 'stats' | 'bgm' | 'profile'>('timer');

  // 2. タイマー関連ステート
  const [seconds, setSeconds] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [subject, setSubject] = useState('数学');
  const [memo, setMemo] = useState('');

  // 3. データステート
  const [logs, setLogs] = useState<StudyLog[]>([]);
  const [tasks, setTasks] = useState<Task[]>([
    { id: '1', title: '単語帳 p.20-40', completed: false },
    { id: '2', title: '数学 ワーク2ページ', completed: true },
  ]);
  const [newTaskTitle, setNewTaskTitle] = useState('');

  // 4. BGM関連ステート
  const [isPlayingBgm, setIsPlayingBgm] = useState(false);
  const [bgmType, setBgmType] = useState<'rain' | 'waves' | 'cafe'>('rain');

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

  // ローカルストレージからの履歴読み込み
  useEffect(() => {
    const savedLogs = localStorage.getItem('simple_study_logs');
    if (savedLogs) {
      try { setLogs(JSON.parse(savedLogs)); } catch (e) {}
    }
    const savedTasks = localStorage.getItem('simple_tasks');
    if (savedTasks) {
      try { setTasks(JSON.parse(savedTasks)); } catch (e) {}
    }
  }, []);

  // タイマー停止＆ログ保存
  const handleSaveLog = async () => {
    if (seconds < 5) {
      alert('5秒以上の計測のみ保存されます');
      return;
    }
    const durationMinutes = Math.max(1, Math.round(seconds / 60));
    const newLog: StudyLog = {
      id: Date.now().toString(),
      subject,
      durationMinutes,
      createdAt: new Date().toLocaleString('ja-JP'),
      memo
    };

    const updatedLogs = [newLog, ...logs];
    setLogs(updatedLogs);
    localStorage.setItem('simple_study_logs', JSON.stringify(updatedLogs));

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
        mode: 'simple',
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
    alert('学習記録を保存しました！');
  };

  // タスク追加
  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    const updated = [...tasks, { id: Date.now().toString(), title: newTaskTitle, completed: false }];
    setTasks(updated);
    localStorage.setItem('simple_tasks', JSON.stringify(updated));
    setNewTaskTitle('');
  };

  // タスク完了切り替え
  const toggleTask = (id: string) => {
    const updated = tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t);
    setTasks(updated);
    localStorage.setItem('simple_tasks', JSON.stringify(updated));
  };

  // タスク削除
  const deleteTask = (id: string) => {
    const updated = tasks.filter(t => t.id !== id);
    setTasks(updated);
    localStorage.setItem('simple_tasks', JSON.stringify(updated));
  };

  // 秒数のフォーマット
  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // 合計時間の計算
  const totalMinutes = logs.reduce((acc, log) => acc + log.durationMinutes, 0);

  return (
    <div className="min-h-screen bg-gray-100 text-gray-800 pb-24 antialiased selection:bg-gray-200">
      
      {/* メインコンテンツエリア */}
      <main className="max-w-md mx-auto p-4 space-y-6 pt-6">
        
        {/* ===== TAB 1: タイマー ===== */}
        {activeTab === 'timer' && (
          <div className="space-y-6">
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 text-center space-y-4">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                Simple Focus Timer
              </span>

              {/* 科目選択 */}
              <div className="flex justify-center gap-2">
                {['英語', '数学', '国語', '理科', '社会', 'その他'].map((sub) => (
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

              {/* タイマー表示 */}
              <div className="py-10 bg-gray-50 rounded-2xl border border-gray-100 flex flex-col items-center justify-center">
                <span className="text-6xl font-extrabold tracking-tight text-gray-900 font-mono">
                  {formatTime(seconds)}
                </span>
                <p className="text-xs text-gray-400 mt-2">選択中の科目: {subject}</p>
              </div>

              {/* タイマー操作ボタン */}
              <div className="flex gap-3">
                <button
                  onClick={() => setIsActive(!isActive)}
                  className={`flex-1 py-4 rounded-2xl font-bold text-white transition flex items-center justify-center gap-2 shadow-md ${
                    isActive ? 'bg-amber-500 hover:bg-amber-600' : 'bg-gray-900 hover:bg-gray-800'
                  }`}
                >
                  {isActive ? <Pause size={20} /> : <Play size={20} />}
                  {isActive ? '一時停止' : '計測開始'}
                </button>
                
                <button
                  onClick={() => { setIsActive(false); setSeconds(0); }}
                  className="p-4 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-2xl transition"
                  title="リセット"
                >
                  <RotateCcw size={20} />
                </button>
              </div>

              {/* 振り返りメモ ＆ 記録保存 */}
              {seconds > 0 && !isActive && (
                <div className="pt-4 border-t border-gray-100 space-y-3">
                  <input
                    type="text"
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                    placeholder="一言メモ（例: 集中できた、公式を暗記した）"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-gray-400"
                  />
                  <button
                    onClick={handleSaveLog}
                    className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl text-xs transition shadow-sm"
                  >
                    学習ログをFirestoreへ保存する
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== TAB 2: ToDoリスト ===== */}
        {activeTab === 'todo' && (
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-4">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <CheckSquare size={18} /> 学習タスク
            </h2>

            <form onSubmit={handleAddTask} className="flex gap-2">
              <input
                type="text"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="新しいタスクを入力..."
                className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-gray-400"
              />
              <button
                type="submit"
                className="p-2.5 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition"
              >
                <Plus size={18} />
              </button>
            </form>

            <div className="space-y-2 pt-2">
              {tasks.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">タスクはありません</p>
              ) : (
                tasks.map((task) => (
                  <div 
                    key={task.id} 
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100"
                  >
                    <label className="flex items-center gap-3 cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={task.completed}
                        onChange={() => toggleTask(task.id)}
                        className="w-4 h-4 rounded text-gray-900 focus:ring-gray-400"
                      />
                      <span className={task.completed ? 'line-through text-gray-400' : 'text-gray-800 font-medium'}>
                        {task.title}
                      </span>
                    </label>
                    <button
                      onClick={() => deleteTask(task.id)}
                      className="text-gray-400 hover:text-red-500 transition"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ===== TAB 3: 振り返り・統計 ===== */}
        {activeTab === 'stats' && (
          <div className="space-y-4">
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-3">
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <BarChart2 size={18} /> 学習統計サマリー
              </h2>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 text-center">
                  <p className="text-[10px] text-gray-400 font-bold uppercase">総学習時間</p>
                  <p className="text-2xl font-extrabold text-gray-900 mt-1">{totalMinutes} <span className="text-xs font-normal">分</span></p>
                </div>
                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 text-center">
                  <p className="text-[10px] text-gray-400 font-bold uppercase">セッション数</p>
                  <p className="text-2xl font-extrabold text-gray-900 mt-1">{logs.length} <span className="text-xs font-normal">回</span></p>
                </div>
              </div>
            </div>

            {/* 履歴リスト */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-4">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                学習ログ履歴
              </h3>
              <div className="space-y-3">
                {logs.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-4">まだ履歴がありません</p>
                ) : (
                  logs.map((log) => (
                    <div key={log.id} className="p-3.5 bg-gray-50 rounded-2xl border border-gray-100 space-y-1">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-gray-900 bg-white px-2.5 py-0.5 rounded-full border border-gray-200">
                          {log.subject}
                        </span>
                        <span className="font-extrabold text-gray-800">{log.durationMinutes} 分</span>
                      </div>
                      <div className="flex justify-between items-center text-[10px] text-gray-400 pt-1">
                        <span>{log.createdAt}</span>
                        {log.memo && <span className="italic text-gray-600">"{log.memo}"</span>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* ===== TAB 4: BGM環境音 ===== */}
        {activeTab === 'bgm' && (
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-4 text-center">
            <h2 className="text-base font-bold text-gray-900 flex items-center justify-center gap-2">
              <Music size={18} /> 集中BGM
            </h2>
            <p className="text-xs text-gray-400">背景ノイズで深い集中状態をサポートします</p>

            <div className="grid grid-cols-3 gap-2 pt-2">
              {[
                { id: 'rain', label: '雨の音 🌧️' },
                { id: 'waves', label: '波の音 🌊' },
                { id: 'cafe', label: 'カフェ ☕' },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setBgmType(item.id as any)}
                  className={`py-3 px-2 rounded-2xl text-xs font-bold transition border ${
                    bgmType === item.id 
                      ? 'bg-gray-900 text-white border-gray-900' 
                      : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <button
              onClick={() => setIsPlayingBgm(!isPlayingBgm)}
              className={`w-full py-3.5 rounded-2xl font-bold text-white transition flex items-center justify-center gap-2 shadow-sm ${
                isPlayingBgm ? 'bg-amber-500 hover:bg-amber-600' : 'bg-gray-900 hover:bg-gray-800'
              }`}
            >
              {isPlayingBgm ? <VolumeX size={18} /> : <Volume2 size={18} />}
              {isPlayingBgm ? 'BGMを停止' : 'BGMを再生'}
            </button>
          </div>
        )}

        {/* ===== TAB 5: マイページ ===== */}
        {activeTab === 'profile' && (
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-4">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <User size={18} /> アカウント＆端末情報
            </h2>

            <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-400">ログイン状態:</span>
                <span className="font-bold text-gray-800">{user ? user.displayName || 'ログイン中' : 'ゲスト（未ログイン）'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">メールアドレス:</span>
                <span className="font-mono text-gray-600">{user ? user.email : 'なし'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">探究用端末ID:</span>
                <span className="font-mono text-gray-600">{localStorage.getItem('device_id') || '未発行'}</span>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* ===== iPhone風 下部5タブナビゲーション ===== */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md border-t border-gray-200 py-2 px-4 z-30">
        <div className="max-w-md mx-auto flex justify-around items-center">
          <button
            onClick={() => setActiveTab('timer')}
            className={`flex flex-col items-center gap-1 transition ${activeTab === 'timer' ? 'text-gray-900 font-bold' : 'text-gray-400'}`}
          >
            <Clock size={20} />
            <span className="text-[10px]">タイマー</span>
          </button>

          <button
            onClick={() => setActiveTab('todo')}
            className={`flex flex-col items-center gap-1 transition ${activeTab === 'todo' ? 'text-gray-900 font-bold' : 'text-gray-400'}`}
          >
            <CheckSquare size={20} />
            <span className="text-[10px]">ToDo</span>
          </button>

          <button
            onClick={() => setActiveTab('stats')}
            className={`flex flex-col items-center gap-1 transition ${activeTab === 'stats' ? 'text-gray-900 font-bold' : 'text-gray-400'}`}
          >
            <BarChart2 size={20} />
            <span className="text-[10px]">振り返り</span>
          </button>

          <button
            onClick={() => setActiveTab('bgm')}
            className={`flex flex-col items-center gap-1 transition ${activeTab === 'bgm' ? 'text-gray-900 font-bold' : 'text-gray-400'}`}
          >
            <Music size={20} />
            <span className="text-[10px]">BGM</span>
          </button>

          <button
            onClick={() => setActiveTab('profile')}
            className={`flex flex-col items-center gap-1 transition ${activeTab === 'profile' ? 'text-gray-900 font-bold' : 'text-gray-400'}`}
          >
            <User size={20} />
            <span className="text-[10px]">マイページ</span>
          </button>
        </div>
      </nav>

    </div>
  );
};

export default SimpleApp;